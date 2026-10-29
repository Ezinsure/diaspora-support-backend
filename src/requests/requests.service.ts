import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import { ServiceRequest } from "./request.entity.js";
import { Service } from "../services/service.entity.js";
import { Customer } from "../customers/customers.entity.js";
import { CustomersService } from "../customers/customers.service.js";
import { ActivityLogsService } from "../activityLogs/activty.service.js";
import { LogAction, LogEntity } from "../activityLogs/activity.type.js";
import { RequestNotificationsService } from "./request-notifi.service.js";
import type { AuditContext } from "../common/audit-context.js";
import { withPeople } from "../common/audited.entity.js";
import { nextReference } from "../common/counter.entity.js";
import { applyDateRange, likeTerm, paginated, TZ } from "../common/query.js";
import {
  isClosed,
  money,
  paymentState,
  type Proforma,
  RequestSource,
  RequestStatus,
  round2,
  STATUS_FLOW,
  STATUS_LABEL,
} from "./request.types.js";
import {
  CreateRequestDto,
  ListRequestsQueryDto,
  RequestStatsQueryDto,
  SaveProformaDto,
  SubmitRequestDto,
  UpdateRequestDto,
} from "./request.dto.js";

// Same customer + same service + still pending within this time = probably a double submit
const DUPLICATE_WINDOW_MINUTES = 30;

@Injectable()
export class RequestsService {
  constructor(
    @InjectRepository(ServiceRequest) private readonly repo: Repository<ServiceRequest>,
    private readonly dataSource: DataSource,
    private readonly customers: CustomersService,
    private readonly logs: ActivityLogsService,
    private readonly notify: RequestNotificationsService,
  ) {}

  // ================= Create =================

  // Public form (source website) and admin form (source admin) both end here
  async create(dto: SubmitRequestDto | CreateRequestDto, ctx: AuditContext, source: RequestSource) {
    const id = await this.dataSource.transaction(async (em) => {
      const service = await em.findOne(Service, { where: { id: dto.serviceId } });
      if (!service) throw new NotFoundException("Service not found");
      if (!service.isActive && source === RequestSource.WEBSITE) throw new BadRequestException("This service is not available right now");

      const customer = await this.customers.findOrCreate(
        em,
        {
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          phone: dto.phone,
          country: dto.country ?? null,
          timezone: dto.timezone ?? null,
        },
        ctx,
      );

      await this.assertNotDuplicate(em, customer.id, service.id);

      const request = em.create(ServiceRequest, {
        reference: await nextReference(em, "REQ"),
        customerId: customer.id,
        serviceId: service.id,
        serviceName: service.name,
        description: dto.description,
        status: RequestStatus.PENDING,
        statusChangedAt: new Date(),
        source,
        requiredDocuments: [],
        amountDue: null,
        amountPaid: 0,
        currency: "RWF",
        proforma: null,
        createdById: ctx.actorId,
        updatedById: ctx.actorId,
      });
      await em.save(request);

      await this.logs.log(
        ctx,
        {
          action: LogAction.CREATE,
          entity: LogEntity.REQUEST,
          entityId: request.id,
          summary: `${source === RequestSource.WEBSITE ? "New website request" : "Created request"} ${request.reference} — ${service.name} for ${customer.firstName} ${customer.lastName}`,
        },
        em,
      );
      return request.id;
    });

    // Emails after the request is safely saved
    const notifyCustomer = "notifyCustomer" in dto ? dto.notifyCustomer !== false : true;
    await this.notify.requestCreated(id, notifyCustomer);

    return this.findOne(id);
  }

  // ================= Read (admin) =================

  private listQuery() {
    return withPeople(this.repo.createQueryBuilder("request"), "request")
      .innerJoin("request.customer", "customer")
      .addSelect(["customer.id", "customer.firstName", "customer.lastName", "customer.email", "customer.phone", "customer.country", "customer.timezone"]);
  }

  async findAll(q: ListRequestsQueryDto) {
    const qb = this.listQuery();

    if (q.search?.trim()) {
      qb.andWhere(
        `(request.reference ILIKE :s OR request.serviceName ILIKE :s OR request.description ILIKE :s
          OR customer.firstName ILIKE :s OR customer.lastName ILIKE :s OR (customer.firstName || ' ' || customer.lastName) ILIKE :s
          OR customer.email ILIKE :s OR customer.phone ILIKE :s)`,
        { s: likeTerm(q.search) },
      );
    }
    if (q.status) qb.andWhere("request.status = :status", { status: q.status });
    if (q.serviceId) qb.andWhere("request.serviceId = :serviceId", { serviceId: q.serviceId });
    if (q.customerId) qb.andWhere("request.customerId = :customerId", { customerId: q.customerId });
    if (q.payment === "unpaid") qb.andWhere("request.amountPaid = 0");
    if (q.payment === "partial") qb.andWhere("request.amountPaid > 0 AND request.amountDue IS NOT NULL AND request.amountPaid < request.amountDue");
    if (q.payment === "paid") qb.andWhere("request.amountPaid > 0 AND (request.amountDue IS NULL OR request.amountPaid >= request.amountDue)");
    applyDateRange(qb, "request.createdAt", q.from, q.to);

    const order = q.order?.toUpperCase() === "ASC" ? "ASC" : "DESC";
    const [rows, total] = await qb
      .orderBy(`request.${q.sortBy}`, order, "NULLS LAST")
      .addOrderBy("request.id", "DESC")
      .skip((q.page - 1) * q.limit)
      .take(q.limit)
      .getManyAndCount();

    return paginated(rows.map(this.decorate), total, q.page, q.limit);
  }

  // GET /requests/stats -> header cards (same date filter as the list)
  async stats(q: RequestStatsQueryDto) {
    const qb = this.repo
      .createQueryBuilder("request")
      .select("request.status", "status")
      .addSelect("COUNT(*)::int", "count")
      .addSelect(`COALESCE(SUM(request."amountPaid"), 0)::float`, "paid")
      .groupBy("request.status");
    applyDateRange(qb, "request.createdAt", q.from, q.to);
    const rows = await qb.getRawMany();

    const status: Record<string, number> = Object.fromEntries(Object.values(RequestStatus).map((s) => [s, 0]));
    let paid = 0;
    for (const r of rows) {
      status[r.status] = r.count;
      paid += Number(r.paid);
    }
    return { total: Object.values(status).reduce((a, b) => a + b, 0), status, amountPaid: round2(paid), timezone: TZ };
  }

  // Full details: customer, service, documents, payments, proforma
  async findOne(id: string) {
    const request = await this.listQuery()
      .leftJoin("request.service", "service")
      .addSelect(["service.id", "service.name", "service.isActive"])
      .leftJoinAndSelect("request.documents", "document")
      .leftJoin("document.createdBy", "documentBy")
      .addSelect(["documentBy.id", "documentBy.names"])
      .leftJoinAndSelect("request.payments", "payment")
      .leftJoin("payment.createdBy", "paymentBy")
      .addSelect(["paymentBy.id", "paymentBy.names"])
      .where("request.id = :id", { id })
      .orderBy("document.createdAt", "DESC")
      .addOrderBy("payment.paidAt", "DESC")
      .getOne();
    if (!request) throw new NotFoundException("Request not found");
    return this.decorate(request);
  }

  // Adds paymentStatus + balance to what the API returns
  private decorate = (r: ServiceRequest) => ({
    ...r,
    paymentStatus: paymentState(r.amountDue, r.amountPaid),
    balance: r.amountDue === null ? null : Math.max(round2(r.amountDue - r.amountPaid), 0),
  });

  // ================= Update (admin) =================

  async update(id: string, dto: UpdateRequestDto, ctx: AuditContext) {
    await this.dataSource.transaction(async (em) => {
      const request = await this.findEntity(em, id);
      if (isClosed(request.status)) throw new BadRequestException(`This request is ${STATUS_LABEL[request.status].toLowerCase()} and can't be changed`);

      const patch: any = {};

      if (dto.serviceId && dto.serviceId !== request.serviceId) {
        const service = await em.findOne(Service, { where: { id: dto.serviceId } });
        if (!service) throw new NotFoundException("Service not found");
        patch.serviceId = service.id;
        patch.serviceName = service.name;
      }
      if (dto.description !== undefined) patch.description = dto.description;
      if (dto.requiredDocuments !== undefined) patch.requiredDocuments = this.cleanList(dto.requiredDocuments);

      // Money: only before any payment, and only when there is no proforma (edit the proforma instead)
      if (dto.amountDue !== undefined || dto.currency !== undefined) {
        if (request.amountPaid > 0) throw new BadRequestException("A payment was already recorded: the amount can't change");
        if (request.proforma) throw new BadRequestException("This request has a proforma: change the amount in the proforma");
        if (dto.amountDue !== undefined) patch.amountDue = dto.amountDue === null ? null : round2(dto.amountDue);
        if (dto.currency !== undefined) patch.currency = dto.currency;
      }

      const changes = this.logs.diff(request, patch, ["serviceName", "description", "requiredDocuments", "amountDue", "currency"]);
      if (changes.length) {
        Object.assign(request, patch, { updatedById: ctx.actorId });
        await em.save(request);
        await this.logs.log(ctx, { action: LogAction.UPDATE, entity: LogEntity.REQUEST, entityId: request.id, summary: `Updated request ${request.reference}`, changes }, em);
      }

      // Contact details live on the customer
      const contact: any = {};
      if (dto.phone !== undefined) contact.phone = dto.phone;
      if (dto.country !== undefined) contact.country = dto.country;
      if (dto.timezone !== undefined) contact.timezone = dto.timezone;
      if (Object.keys(contact).length) {
        const customer = await em.findOne(Customer, { where: { id: request.customerId } });
        if (customer) {
          const contactChanges = this.logs.diff(customer, contact, ["phone", "country", "timezone"]);
          if (contactChanges.length) {
            Object.assign(customer, contact, { updatedById: ctx.actorId });
            await em.save(customer);
            await this.logs.log(
              ctx,
              { action: LogAction.UPDATE, entity: LogEntity.CUSTOMER, entityId: customer.id, summary: `Updated contact of ${customer.firstName} ${customer.lastName} (from ${request.reference})`, changes: contactChanges },
              em,
            );
          }
        }
      }
    });

    return this.findOne(id);
  }

  // ================= Status =================

  async setStatus(id: string, status: RequestStatus, note: string | null | undefined, ctx: AuditContext, notifyCustomer = true) {
    const changed = await this.dataSource.transaction(async (em) => {
      const request = await this.findEntity(em, id);
      if (request.status === status) return false;

      if (!STATUS_FLOW[request.status].includes(status)) {
        throw new BadRequestException(`A request can't go from "${STATUS_LABEL[request.status]}" to "${STATUS_LABEL[status]}"`);
      }
      if (status === RequestStatus.CANCELLED && !note?.trim()) throw new BadRequestException("Give a reason for cancelling");

      const from = request.status;
      await this.applyStatus(em, request, status, note ?? null, ctx, from);
      return true;
    });

    if (changed && notifyCustomer) await this.notify.statusChanged(id);
    return this.findOne(id);
  }

  // Shared with payments (first payment -> in progress)
  async applyStatus(em: EntityManager, request: ServiceRequest, status: RequestStatus, note: string | null, ctx: AuditContext, from = request.status) {
    request.status = status;
    request.statusNote = note?.trim() || null;
    request.statusChangedAt = new Date();
    request.updatedById = ctx.actorId;
    await em.save(request);

    await this.logs.log(
      ctx,
      {
        action: LogAction.STATUS,
        entity: LogEntity.REQUEST,
        entityId: request.id,
        summary: `${request.reference}: ${STATUS_LABEL[from]} → ${STATUS_LABEL[status]}`,
        changes: [
          { field: "status", from, to: status },
          ...(request.statusNote ? [{ field: "statusNote", from: null, to: request.statusNote }] : []),
        ],
      },
      em,
    );
  }

  // ================= Proforma =================

  async saveProforma(id: string, dto: SaveProformaDto, ctx: AuditContext) {
    await this.dataSource.transaction(async (em) => {
      const request = await this.findEntity(em, id);
      if (isClosed(request.status)) throw new BadRequestException("This request is closed");
      if (request.amountPaid > 0) throw new BadRequestException("A payment was already recorded: the proforma can't change");

      const items = dto.items.map((i) => ({ description: i.description, quantity: round2(i.quantity), unitPrice: round2(i.unitPrice) }));
      const total = round2(items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0));
      if (total <= 0) throw new BadRequestException("The proforma total must be more than 0");

      const now = new Date().toISOString();
      const before = request.proforma;
      const proforma: Proforma = {
        number: before?.number ?? (await nextReference(em, "PF")),
        currency: dto.currency ?? before?.currency ?? request.currency,
        items,
        total,
        validUntil: dto.validUntil ?? null,
        note: dto.note ?? null,
        createdAt: before?.createdAt ?? now,
        updatedAt: now,
        sentAt: before?.sentAt ?? null,
      };

      request.proforma = proforma;
      request.amountDue = total;
      request.currency = proforma.currency;
      request.updatedById = ctx.actorId;
      await em.save(request);

      await this.logs.log(
        ctx,
        {
          action: before ? LogAction.UPDATE : LogAction.CREATE,
          entity: LogEntity.PROFORMA,
          entityId: request.id,
          summary: `${before ? "Updated" : "Created"} proforma ${proforma.number} for ${request.reference}: ${money(total, proforma.currency)}`,
          changes: before ? [{ field: "total", from: before.total, to: total }] : undefined,
        },
        em,
      );
    });

    if (dto.send) return this.sendProforma(id, ctx);
    return this.findOne(id);
  }

  async sendProforma(id: string, ctx: AuditContext) {
    const request = await this.repo.findOne({ where: { id } });
    if (!request) throw new NotFoundException("Request not found");
    if (!request.proforma) throw new BadRequestException("This request has no proforma yet");

    const sent = await this.notify.proforma(id);
    if (!sent) throw new BadRequestException("The email could not be sent. Check the mail settings and try again.");

    await this.repo.update(id, { proforma: { ...request.proforma, sentAt: new Date().toISOString() }, updatedById: ctx.actorId });
    await this.logs.log(ctx, { action: LogAction.EMAIL, entity: LogEntity.PROFORMA, entityId: id, summary: `Sent proforma ${request.proforma.number} to the customer (${request.reference})` });
    return this.findOne(id);
  }

  async removeProforma(id: string, ctx: AuditContext) {
    await this.dataSource.transaction(async (em) => {
      const request = await this.findEntity(em, id);
      if (!request.proforma) return;
      if (request.amountPaid > 0) throw new BadRequestException("A payment was already recorded: the proforma can't be removed");

      const number = request.proforma.number;
      request.proforma = null;
      request.amountDue = null;
      request.updatedById = ctx.actorId;
      await em.save(request);
      await this.logs.log(ctx, { action: LogAction.DELETE, entity: LogEntity.PROFORMA, entityId: request.id, summary: `Removed proforma ${number} from ${request.reference}` }, em);
    });
    return this.findOne(id);
  }

  // ================= Delete =================

  // Soft delete, only when nothing was paid (paid requests are cancelled instead)
  async remove(id: string, ctx: AuditContext) {
    await this.dataSource.transaction(async (em) => {
      const request = await this.findEntity(em, id);
      if (request.amountPaid > 0) throw new BadRequestException("This request has payments: cancel it instead of deleting it");
      await em.update(ServiceRequest, request.id, { deletedById: ctx.actorId });
      await em.softDelete(ServiceRequest, request.id);
      await this.logs.log(ctx, { action: LogAction.DELETE, entity: LogEntity.REQUEST, entityId: request.id, summary: `Deleted request ${request.reference}` }, em);
    });
    return { id, deleted: true };
  }

  // ================= Helpers =================

  // Locks the row so two staff can't change the same request at the same moment
  async findEntity(em: EntityManager, id: string) {
    const request = await em.findOne(ServiceRequest, { where: { id }, lock: { mode: "pessimistic_write" } });
    if (!request) throw new NotFoundException("Request not found");
    return request;
  }

  private async assertNotDuplicate(em: EntityManager, customerId: string, serviceId: string) {
    const existing = await em
      .createQueryBuilder(ServiceRequest, "request")
      .where("request.customerId = :customerId AND request.serviceId = :serviceId AND request.status = :pending", {
        customerId,
        serviceId,
        pending: RequestStatus.PENDING,
      })
      .andWhere(`request.createdAt > NOW() - INTERVAL '${DUPLICATE_WINDOW_MINUTES} minutes'`)
      .getOne();
    if (existing) {
      throw new ConflictException({
        message: `You already sent this request a few minutes ago. Your request number is ${existing.reference}.`,
        reference: existing.reference,
      });
    }
  }

  // Trim, drop empty, no duplicates (ignoring case)
  private cleanList(list: string[]) {
    const seen = new Set<string>();
    return list
      .map((s) => s.trim().replace(/\s+/g, " "))
      .filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
  }
}