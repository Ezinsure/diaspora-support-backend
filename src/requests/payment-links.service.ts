 
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { PaymentChannel, PaymentLink, PaymentLinkStatus } from "./payment-link.entity.js";
import { Payment } from "./payment.entity.js";
import { ServiceRequest } from "./request.entity.js";
import { RequestsService } from "./requests.service.js";
import { PaymentsService } from "./payment.service.js";
import { IremboPayClient, type IremboInvoice } from "../irembopay/iremboPay-client.js";
import { ActivityLogsService } from "../activityLogs/activty.service.js";
import { LogAction, LogEntity } from "../activityLogs/activity.type.js";
import type { AuditContext } from "../common/audit-context.js";
import { nextReference } from "../common/counter.entity.js";
import { isClosed, money, PaymentMethod, round2, STATUS_LABEL } from "./request.types.js";
 
// How long a link stays valid (days), from .env
const linkDays = () => Math.min(Math.max(Number(process.env.IREMBOPAY_LINK_DAYS ?? 7) || 7, 1), 30);
 
const METHOD_NAME: Record<string, string> = {
  MTN_MOMO: "MTN MoMo",
  AIRTEL_MONEY: "Airtel Money",
  ONLINE_CARD: "card",
  BK: "Bank of Kigali",
  EQUITY: "Equity Bank",
};
 
// Who did it when IremboPay or a customer acts (no signed-in user)
const GATEWAY: AuditContext = { actorId: null, actorName: "IremboPay", actorRole: null, ip: null, userAgent: "IremboPay" };
const customerCtx = (ip: string | null): AuditContext => ({ actorId: null, actorName: "Customer (website)", actorRole: null, ip, userAgent: null });
 
const isExpired = (l: PaymentLink) => l.status === PaymentLinkStatus.OPEN && !!l.expiresAt && l.expiresAt.getTime() < Date.now();
 
// +250 788 123 456 / 250788123456 / 0788123456 -> 0788123456 + MTN / AIRTEL
export const momoNumber = (raw: string) => {
  const digits = String(raw ?? "").replace(/\D/g, "");
  const local = digits.startsWith("250") ? `0${digits.slice(3)}` : digits;
  if (!/^07\d{8}$/.test(local)) throw new BadRequestException("Enter a Rwandan MoMo number, e.g. 0788 123 456");
  const prefix = local.slice(0, 3);
  if (prefix === "078" || prefix === "079") return { phone: local, provider: "MTN" as const };
  if (prefix === "072" || prefix === "073") return { phone: local, provider: "AIRTEL" as const };
  throw new BadRequestException("Use an MTN (078 / 079) or Airtel (072 / 073) number");
};
 
// Simple limit for the public lookup (per IP): stops guessing references
const hits = new Map<string, { n: number; until: number }>();
const limit = (key: string, max = 20, windowMin = 10) => {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.until < now) return void hits.set(key, { n: 1, until: now + windowMin * 60_000 });
  if (++h.n > max) throw new HttpException("Too many tries. Wait a few minutes and try again.", HttpStatus.TOO_MANY_REQUESTS);
};
 
@Injectable()
export class PaymentLinksService {
  private readonly logger = new Logger(PaymentLinksService.name);
 
  constructor(
    @InjectRepository(PaymentLink) private readonly repo: Repository<PaymentLink>,
    @InjectRepository(ServiceRequest) private readonly requestsRepo: Repository<ServiceRequest>,
    private readonly dataSource: DataSource,
    private readonly requests: RequestsService,
    private readonly payments: PaymentsService,
    private readonly irembo: IremboPayClient,
    private readonly logs: ActivityLogsService,
  ) {}
 
  // What the customer can use, for a request in this currency
  options(currency: string) {
    const rate = this.irembo.rwfRate(currency);
    return {
      configured: this.irembo.configured, // card / bank link
      momo: this.irembo.momoReady(currency), // MoMo in RWF
      rwfRate: rate,
    };
  }
 
  // ================= Staff =================
 
  // Newest first. Open links past their date are marked expired.
  async list(requestId: string) {
    const request = await this.requestsRepo.findOne({ where: { id: requestId }, select: { id: true, currency: true } });
    if (!request) throw new NotFoundException("Request not found");
 
    const links = await this.repo
      .createQueryBuilder("link")
      .leftJoin("link.createdBy", "createdBy")
      .addSelect(["createdBy.id", "createdBy.names"])
      .where("link.requestId = :requestId", { requestId })
      .orderBy("link.createdAt", "DESC")
      .getMany();
 
    const old = links.filter(isExpired);
    if (old.length) {
      await this.repo.update(old.map((l) => l.id), { status: PaymentLinkStatus.EXPIRED });
      old.forEach((l) => (l.status = PaymentLinkStatus.EXPIRED));
    }
    return { ...this.options(request.currency), links };
  }
 
  /**
   * A link for what is left to pay.
   * - An open link on the same channel is reused (clicking twice is safe).
   * - An open link on the other channel is cancelled first (never two to pay at once).
   */
  async open(requestId: string, channel: PaymentChannel, ctx: AuditContext) {
    this.irembo.assertConfigured();
    const full = await this.requests.findOne(requestId); // customer name + email
 
    const prepared = await this.dataSource.transaction(async (em) => {
      const request = await this.requests.findEntity(em, requestId);
      if (isClosed(request.status)) throw new BadRequestException("This request is closed");
      if (!request.proforma || request.amountDue === null) throw new BadRequestException("The quotation is not ready yet");
 
      const balance = round2(request.amountDue - request.amountPaid);
      if (balance <= 0) throw new BadRequestException("This request is already fully paid");
 
      const open = await em.findOne(PaymentLink, { where: { requestId, status: PaymentLinkStatus.OPEN } });
      if (open && !isExpired(open) && open.channel === channel && round2(open.amount) === balance) return { reuse: open };
      return { reuse: null, previous: open, balance, currency: request.currency, reference: await nextReference(em, "PL") };
    });
    if (prepared.reuse) return prepared.reuse;
 
    // Close the previous open link (other channel, other amount, or expired)
    if (prepared.previous) await this.close(prepared.previous, PaymentLinkStatus.CANCELLED, ctx);
 
    const { balance, currency, reference } = prepared as { balance: number; currency: string; reference: string };
 
    // MoMo = RWF invoice on the RWF account, converted at the rate in .env
    let charge = { amount: balance, currency, rate: null as number | null, account: this.irembo.paymentAccount };
    if (channel === PaymentChannel.MOMO) {
      const rate = this.irembo.rwfRate(currency);
      if (!this.irembo.rwfAccount || rate === null) {
        throw new BadRequestException(`MoMo is not set up yet: add IREMBOPAY_PAYMENT_ACCOUNT_RWF and IREMBOPAY_RWF_PER_${currency} to the API .env`);
      }
      charge = { amount: Math.ceil(balance * rate), currency: "RWF", rate: currency === "RWF" ? null : rate, account: this.irembo.rwfAccount };
    }
 
    const expiresAt = new Date(Date.now() + linkDays() * 24 * 60 * 60_000);
    const invoice = await this.irembo.createInvoice({
      account: charge.account,
      transactionId: reference,
      amount: charge.amount,
      description: `${full.reference} · ${full.serviceName}`,
      expiryAt: expiresAt,
      customer: { name: `${full.customer.firstName} ${full.customer.lastName}`, email: full.customer.email },
    });
 
    // The IremboPay account decides the currency: it must be the one we expect
    if (invoice.currency !== charge.currency) {
      await this.irembo.expireInvoice(invoice.invoiceNumber).catch(() => undefined);
      const env = channel === PaymentChannel.MOMO ? "IREMBOPAY_PAYMENT_ACCOUNT_RWF" : "IREMBOPAY_PAYMENT_ACCOUNT";
      throw new BadRequestException(`The IremboPay account in ${env} is in ${invoice.currency}, it must be in ${charge.currency}`);
    }
 
    try {
      return await this.dataSource.transaction(async (em) => {
        const saved = await em.save(
          em.create(PaymentLink, {
            requestId,
            provider: "irembopay",
            channel,
            reference,
            invoiceNumber: invoice.invoiceNumber,
            amount: balance,
            currency,
            chargeAmount: round2(invoice.amount),
            chargeCurrency: invoice.currency,
            rate: charge.rate,
            payerPhone: null,
            url: invoice.paymentLinkUrl ?? "",
            status: PaymentLinkStatus.OPEN,
            expiresAt: invoice.expiryAt ? new Date(invoice.expiryAt) : expiresAt,
            paidAt: null,
            paymentId: null,
            paymentMethod: null,
            providerRef: null,
            createdById: ctx.actorId,
            updatedById: ctx.actorId,
          }),
        );
        await this.logs.log(
          ctx,
          {
            action: LogAction.CREATE,
            entity: LogEntity.PAYMENT,
            entityId: saved.id,
            summary:
              `${channel === PaymentChannel.MOMO ? "MoMo" : "Card / bank"} payment link ${reference} for ${full.reference}: ${money(balance, currency)}` +
              (charge.currency !== currency ? ` (charged ${money(saved.chargeAmount, charge.currency)})` : ""),
          },
          em,
        );
        return saved;
      });
    } catch (err: any) {
      // Two clicks at the same moment: keep the first link
      await this.irembo.expireInvoice(invoice.invoiceNumber).catch(() => undefined);
      if (err?.code === "23505" || err?.driverError?.code === "23505") throw new ConflictException("A payment link was just made for this request. Refresh and try again.");
      throw err;
    }
  }
 
  // MoMo prompt on the customer's phone
  async pushMomo(requestId: string, phoneRaw: string, ctx: AuditContext) {
    const { phone, provider } = momoNumber(phoneRaw);
    const link = await this.open(requestId, PaymentChannel.MOMO, ctx);
    await this.irembo.pushMomo(link.invoiceNumber, phone, provider);
    await this.repo.update(link.id, { payerPhone: phone });
    await this.logs.log(ctx, {
      action: LogAction.PAYMENT,
      entity: LogEntity.PAYMENT,
      entityId: link.id,
      summary: `Sent a ${provider === "MTN" ? "MTN MoMo" : "Airtel Money"} prompt of ${money(link.chargeAmount, link.chargeCurrency)} to ${phone} (${link.reference})`,
    });
    return { ...link, payerPhone: phone, provider };
  }
 
  // Staff stop a link (wrong amount, quotation must change...)
  async cancel(requestId: string, linkId: string, ctx: AuditContext) {
    const link = await this.findLink(requestId, linkId);
    if (link.status !== PaymentLinkStatus.OPEN) throw new BadRequestException(`This link is already ${link.status}`);
    const paid = await this.close(link, PaymentLinkStatus.CANCELLED, ctx);
    if (paid) throw new ConflictException("The customer already paid this link. The payment has been recorded.");
    return this.findLink(requestId, linkId);
  }
 
  // "Check payment": ask IremboPay now (when the webhook is late or can't reach us)
  async check(requestId: string, linkId: string) {
    const link = await this.findLink(requestId, linkId);
    if (link.status === PaymentLinkStatus.PAID) return link;
 
    const invoice = await this.irembo.getInvoice(link.invoiceNumber);
    if (invoice.paymentStatus === "PAID") await this.settle(link, invoice);
    else if (isExpired(link)) await this.repo.update(link.id, { status: PaymentLinkStatus.EXPIRED });
    return this.findLink(requestId, linkId);
  }
 
  //  Customer (website) 
  private async findForCustomer(reference: string, email: string, ip: string | null) {
    limit(`ip:${ip ?? "?"}`);
    const request = await this.requestsRepo
      .createQueryBuilder("request")
      .innerJoinAndSelect("request.customer", "customer")
      .where("UPPER(request.reference) = UPPER(:reference)", { reference: reference.trim() })
      .andWhere("LOWER(customer.email) = LOWER(:email)", { email: email.trim() })
      .getOne();
    if (!request) throw new NotFoundException("We couldn't find a request with this number and email");
    return request;
  }
 
  // What the customer sees: no staff notes, no documents
  async lookup(reference: string, email: string, ip: string | null) {
    let r = await this.findForCustomer(reference, email, ip);
 
    let open = await this.repo.findOne({ where: { requestId: r.id, status: PaymentLinkStatus.OPEN } });
    if (open && isExpired(open)) {
      await this.repo.update(open.id, { status: PaymentLinkStatus.EXPIRED });
      open = null;
    }
    // Paid on IremboPay but the webhook didn't reach us yet: check now
    if (open) {
      const invoice = await this.irembo.getInvoice(open.invoiceNumber).catch(() => null);
      if (invoice?.paymentStatus === "PAID") {
        await this.settle(open, invoice);
        open = null;
        r = (await this.requestsRepo.findOne({ where: { id: r.id }, relations: { customer: true } }))!;
      }
    }
 
    const balance = r.amountDue === null ? null : Math.max(round2(r.amountDue - r.amountPaid), 0);
    const opts = this.options(r.currency);
    return {
      reference: r.reference,
      firstName: r.customer.firstName,
      service: r.serviceName,
      status: r.status,
      statusLabel: STATUS_LABEL[r.status],
      quotation: r.proforma
        ? {
            number: r.proforma.number,
            currency: r.proforma.currency,
            items: r.proforma.items.map((i) => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice })),
            total: r.proforma.total,
            validUntil: r.proforma.validUntil,
            note: r.proforma.note,
          }
        : null,
      currency: r.currency,
      amountPaid: r.amountPaid,
      balance,
      canPay: !!r.proforma && !isClosed(r.status) && (balance ?? 0) > 0 && opts.configured,
      payment: {
        card: opts.configured,
        momo: opts.momo,
        momoAmount: opts.momo && balance ? Math.ceil(balance * (opts.rwfRate ?? 1)) : null,
        rwfRate: r.currency === "RWF" ? null : opts.rwfRate,
      },
      openLink: open
        ? { channel: open.channel, url: open.url, chargeAmount: open.chargeAmount, chargeCurrency: open.chargeCurrency, expiresAt: open.expiresAt }
        : null,
    };
  }
 
  // Card / bank -> { url } ; MoMo -> prompt on the phone
  async pay(reference: string, email: string, channel: PaymentChannel, phone: string | undefined, ip: string | null) {
    const r = await this.findForCustomer(reference, email, ip);
    const ctx = customerCtx(ip);
    if (channel === PaymentChannel.MOMO) {
      if (!phone) throw new BadRequestException("Enter your MoMo number");
      const link = await this.pushMomo(r.id, phone, ctx);
      return { channel, chargeAmount: link.chargeAmount, chargeCurrency: link.chargeCurrency, phone: link.payerPhone, provider: link.provider };
    }
    const link = await this.open(r.id, PaymentChannel.CARD, ctx);
    return { channel, url: link.url, chargeAmount: link.chargeAmount, chargeCurrency: link.chargeCurrency };
  }
 
  // ================= IremboPay webhook =================
 
  async webhook(rawBody: Buffer | undefined, signature: string | undefined) {
    if (!this.irembo.verifySignature(rawBody, signature)) {
      this.logger.warn("Webhook refused: bad or old signature");
      throw new UnauthorizedException("Bad signature");
    }
 
    let body: any;
    try {
      body = JSON.parse(rawBody!.toString());
    } catch {
      throw new BadRequestException("Bad JSON");
    }
    const invoice: IremboInvoice | undefined = body?.data;
    if (!invoice?.invoiceNumber) return { received: true };
 
    const link = await this.repo.findOne({ where: [{ invoiceNumber: invoice.invoiceNumber }, { reference: invoice.transactionId ?? "" }] });
    if (!link) {
      this.logger.warn(`Webhook for unknown invoice ${invoice.invoiceNumber}`);
      return { received: true }; // not ours: don't make IremboPay retry
    }
    if (invoice.paymentStatus === "PAID") await this.settle(link, invoice);
    return { received: true };
  }
 
  // ================= Helpers =================
 
  // Stop a link on IremboPay. Returns true if it turned out to be paid (then it is recorded).
  private async close(link: PaymentLink, status: PaymentLinkStatus, ctx: AuditContext) {
    const invoice = await this.irembo.getInvoice(link.invoiceNumber);
    if (invoice.paymentStatus === "PAID") {
      await this.settle(link, invoice);
      return true;
    }
    await this.irembo.expireInvoice(link.invoiceNumber);
    await this.repo.update(link.id, { status, updatedById: ctx.actorId });
    await this.logs.log(ctx, {
      action: LogAction.DELETE,
      entity: LogEntity.PAYMENT,
      entityId: link.id,
      summary: `Cancelled payment link ${link.reference} (${money(link.chargeAmount, link.chargeCurrency)})`,
    });
    return false;
  }
 
  // Paid on IremboPay -> record the payment once (safe to call many times)
  private async settle(link: PaymentLink, invoice: IremboInvoice) {
    if (link.status === PaymentLinkStatus.PAID) return;
 
    if (invoice.currency !== link.chargeCurrency) {
      this.logger.error(`Invoice ${invoice.invoiceNumber} paid in ${invoice.currency}, link is in ${link.chargeCurrency}: not recorded, check by hand`);
      return;
    }
 
    // Recorded in the quotation currency. MoMo: the USD amount of the link, RWF paid goes in the note.
    const converted = link.chargeCurrency !== link.currency;
    const amount = converted ? link.amount : round2(invoice.amount);
    const transactionRef = `IREMBOPAY-${invoice.invoiceNumber}`; // unique: the same invoice is never recorded twice
    const method = invoice.paymentMethod ? METHOD_NAME[invoice.paymentMethod] ?? invoice.paymentMethod : "online";
    const note =
      `Paid with IremboPay (${method})` +
      (converted ? ` · ${money(invoice.amount, invoice.currency)} at 1 ${link.currency} = ${link.rate} RWF` : "") +
      (invoice.paymentReference ? ` · ref ${invoice.paymentReference}` : "") +
      ` · link ${link.reference}`;
 
    try {
      await this.payments.record(
        link.requestId,
        {
          amount,
          method: PaymentMethod.IREMBOPAY,
          transactionRef,
          payerPhone: link.payerPhone ? `+250${link.payerPhone.slice(1)}` : null,
          paidAt: invoice.paidAt ? new Date(invoice.paidAt) : new Date(),
          note,
          sendReceipt: true, // if email is down, the payment is still recorded
        } as any,
        GATEWAY,
        { fromGateway: true },
      );
    } catch (err) {
      if (!(err instanceof ConflictException)) throw err; 
    }
 
    const payment = await this.dataSource.getRepository(Payment).findOne({ where: { transactionRef } });
    await this.repo.update(link.id, {
      status: PaymentLinkStatus.PAID,
      paidAt: invoice.paidAt ? new Date(invoice.paidAt) : new Date(),
      paymentId: payment?.id ?? null,
      paymentMethod: invoice.paymentMethod ?? null,
      providerRef: invoice.paymentReference ?? null,
    });
  }
 
  private async findLink(requestId: string, linkId: string) {
    const link = await this.repo.findOne({ where: { id: linkId, requestId } });
    if (!link) throw new NotFoundException("Payment link not found");
    return link;
  }
}
