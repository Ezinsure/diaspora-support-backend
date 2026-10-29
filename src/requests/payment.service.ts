import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import { Payment } from "./payment.entity.js";
import { RequestsService } from "./requests.service.js";
import { RequestNotificationsService } from "./request-notifi.service.js";
import { ActivityLogsService } from "../activityLogs/activty.service.js";
import { LogAction, LogEntity } from "../activityLogs/activity.type.js";
import type { AuditContext } from "../common/audit-context.js";
import { nextReference } from "../common/counter.entity.js";
import { isUniqueViolation } from "../common/query.js";
import { METHOD_LABEL, money, RequestStatus, round2 } from "./request.types.js";
import { RecordPaymentDto } from "./request.dto.js";

// Staff record payments (MoMo, bank, cash, card).
// An online gateway (MoMo API, Flutterwave...) can later call record() from its webhook.
@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment) private readonly repo: Repository<Payment>,
    private readonly dataSource: DataSource,
    private readonly requests: RequestsService,
    private readonly notify: RequestNotificationsService,
    private readonly logs: ActivityLogsService,
  ) {}

  async list(requestId: string) {
    return this.repo
      .createQueryBuilder("payment")
      .leftJoin("payment.createdBy", "createdBy")
      .addSelect(["createdBy.id", "createdBy.names"])
      .where("payment.requestId = :requestId", { requestId })
      .orderBy("payment.paidAt", "DESC")
      .getMany();
  }

  async record(requestId: string, dto: RecordPaymentDto, ctx: AuditContext) {
    let paymentId = "";
    let startedWork = false;

    try {
      await this.dataSource.transaction(async (em) => {
        const request = await this.requests.findEntity(em, requestId); // row is locked until commit
        if (request.status === RequestStatus.CANCELLED) throw new BadRequestException("This request is cancelled");

        const amount = round2(dto.amount);
        const paidSoFar = round2(request.amountPaid);

        // Can't pay more than what is due (when an amount or proforma is set)
        if (request.amountDue !== null && round2(paidSoFar + amount) > request.amountDue) {
          const left = round2(request.amountDue - paidSoFar);
          throw new BadRequestException(
            left > 0 ? `Only ${money(left, request.currency)} is left to pay` : "This request is already fully paid",
          );
        }

        const payment = em.create(Payment, {
          requestId: request.id,
          receiptNumber: await nextReference(em, "RCT"),
          amount,
          currency: request.currency,
          method: dto.method,
          transactionRef: dto.transactionRef ?? null,
          payerPhone: dto.payerPhone || null,
          paidAt: dto.paidAt ?? new Date(),
          note: dto.note ?? null,
          voidReason: null,
          createdById: ctx.actorId,
          updatedById: ctx.actorId,
        });
        await em.save(payment);
        paymentId = payment.id;

        request.amountPaid = round2(paidSoFar + amount);
        request.updatedById = ctx.actorId;
        await em.save(request);

        await this.logs.log(
          ctx,
          {
            action: LogAction.PAYMENT,
            entity: LogEntity.PAYMENT,
            entityId: payment.id,
            summary: `Recorded ${money(amount, payment.currency)} (${METHOD_LABEL[payment.method]}) for ${request.reference} — receipt ${payment.receiptNumber}`,
          },
          em,
        );

        // First payment on a pending request -> we start working
        if (request.status === RequestStatus.PENDING) {
          await this.requests.applyStatus(em, request, RequestStatus.IN_PROGRESS, "Payment received", ctx);
          startedWork = true;
        }
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException("This transaction reference was already recorded");
      throw err;
    }

    if (dto.sendReceipt !== false) await this.notify.receipt(paymentId);
    if (startedWork) await this.notify.statusChanged(requestId);

    return this.requests.findOne(requestId);
  }

  // Re-send the receipt when the customer asks for it
  async sendReceipt(requestId: string, paymentId: string, ctx: AuditContext) {
    const payment = await this.repo.findOne({ where: { id: paymentId, requestId } });
    if (!payment) throw new NotFoundException("Payment not found");
    const sent = await this.notify.receipt(payment.id);
    if (!sent) throw new BadRequestException("The email could not be sent. Check the mail settings and try again.");
    await this.logs.log(ctx, { action: LogAction.EMAIL, entity: LogEntity.PAYMENT, entityId: payment.id, summary: `Sent receipt ${payment.receiptNumber} to the customer` });
    return { sent: true };
  }

  // A wrong payment is voided (kept in the database with the reason), never edited
  async void(requestId: string, paymentId: string, reason: string, ctx: AuditContext) {
    await this.dataSource.transaction(async (em) => {
      const request = await this.requests.findEntity(em, requestId);
      const payment = await em.findOne(Payment, { where: { id: paymentId, requestId } });
      if (!payment) throw new NotFoundException("Payment not found");

      await em.update(Payment, payment.id, { voidReason: reason, deletedById: ctx.actorId });
      await em.softDelete(Payment, payment.id);

      request.amountPaid = await this.sumPaid(em, request.id);
      request.updatedById = ctx.actorId;
      await em.save(request);

      await this.logs.log(
        ctx,
        {
          action: LogAction.DELETE,
          entity: LogEntity.PAYMENT,
          entityId: payment.id,
          summary: `Voided payment ${payment.receiptNumber} (${money(payment.amount, payment.currency)}) on ${request.reference}: ${reason}`,
        },
        em,
      );
    });
    return this.requests.findOne(requestId);
  }

  private async sumPaid(em: EntityManager, requestId: string) {
    const { total } = await em
      .createQueryBuilder(Payment, "payment")
      .select("COALESCE(SUM(payment.amount), 0)", "total")
      .where("payment.requestId = :requestId", { requestId })
      .getRawOne();
    return round2(Number(total));
  }
}