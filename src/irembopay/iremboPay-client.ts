
import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
 
export interface IremboInvoice {
  invoiceNumber: string;
  transactionId: string; // our reference (PL-2026-0001)
  paymentStatus: "NEW" | "PAID";
  amount: number;
  currency: string;
  paymentLinkUrl?: string;
  expiryAt?: string;
  paidAt?: string;
  paymentMethod?: string; 
  paymentReference?: string;
}
 
const SANDBOX = "https://api.sandbox.irembopay.com";
 
@Injectable()
export class IremboPayClient {
  private readonly logger = new Logger("IremboPay");
 
  private get base() {
    return (process.env.IREMBOPAY_BASE_URL?.trim() || SANDBOX).replace(/\/+$/, "");
  }
  private get secret() {
    return process.env.IREMBOPAY_SECRET_KEY?.trim() ?? "";
  }
  // USD account: checkout page (card / bank)
  get paymentAccount() {
    return process.env.IREMBOPAY_PAYMENT_ACCOUNT?.trim() ?? "";
  }
  // RWF account: MoMo (IremboPay pushes MoMo only for RWF invoices)
  get rwfAccount() {
    return process.env.IREMBOPAY_PAYMENT_ACCOUNT_RWF?.trim() ?? "";
  }
  // RWF for 1 unit of a currency: IREMBOPAY_RWF_PER_USD=1450
  rwfRate(currency: string) {
    if (currency === "RWF") return 1;
    const rate = Number(process.env[`IREMBOPAY_RWF_PER_${currency}`]);
    return Number.isFinite(rate) && rate > 0 ? rate : null;
  }
  momoReady(currency: string) {
    return this.configured && !!this.rwfAccount && this.rwfRate(currency) !== null;
  }
  get productCode() {
    return process.env.IREMBOPAY_PRODUCT_CODE?.trim() ?? "";
  }
 
  get configured() {
    return !!(this.secret && this.paymentAccount && this.productCode);
  }
 
  assertConfigured() {
    if (!this.configured) {
      throw new ServiceUnavailableException(
        "Online payment is not set up yet: add IREMBOPAY_SECRET_KEY, IREMBOPAY_PAYMENT_ACCOUNT and IREMBOPAY_PRODUCT_CODE to the API .env",
      );
    }
  }
 
  private async call<T>(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<T> {
    this.assertConfigured();
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        method,
        headers: { "Content-Type": "application/json", "irembopay-secretKey": this.secret, "X-API-Version": "2" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e: any) {
      this.logger.error(`${method} ${path}: ${e.message}`);
      throw new BadGatewayException("IremboPay can't be reached right now. Try again in a moment.");
    }
 
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json?.success === false) {
      const first = Array.isArray(json?.errors) ? json.errors[0] : null;
      const code = first?.code ?? json?.code ?? res.status;
      const detail = first?.detail ?? first?.message ?? json?.message ?? "";
      this.logger.warn(`${method} ${path} -> ${res.status} ${code} ${detail}`);
      throw new BadGatewayException(`IremboPay refused the request (${code})${detail ? `: ${detail}` : ""}`);
    }
    return json.data as T;
  }
 
  // One line for the whole amount, on the product created in the IremboPay portal
  createInvoice(input: {
    account?: string; // default: the USD account
    transactionId: string;
    amount: number;
    description: string;
    expiryAt: Date;
    customer: { name: string; email: string };
  }) {
    return this.call<IremboInvoice>("POST", "/payments/invoices", {
      transactionId: input.transactionId,
      paymentAccountIdentifier: input.account ?? this.paymentAccount,
      paymentItems: [{ code: this.productCode, quantity: 1, unitAmount: input.amount }],
      description: input.description.slice(0, 200),
      expiryAt: input.expiryAt.toISOString(),
      customer: { name: input.customer.name, email: input.customer.email },
      language: "EN",
    });
  }
 
  getInvoice(invoiceNumber: string) {
    return this.call<IremboInvoice>("GET", `/payments/invoices/${encodeURIComponent(invoiceNumber)}`);
  }
 
  // There is no "cancel": we make the invoice expire in 2 minutes (a date in the past is refused)
  expireInvoice(invoiceNumber: string) {
    return this.call<IremboInvoice>("PUT", `/payments/invoices/${encodeURIComponent(invoiceNumber)}`, {
      expiryAt: new Date(Date.now() + 2 * 60_000).toISOString(),
    });
  }
 
  // MoMo prompt on the customer's phone (RWF invoices only). phone: 07XXXXXXXX
  pushMomo(invoiceNumber: string, phone: string, provider: "MTN" | "AIRTEL") {
    return this.call<{ referenceId: string }>("POST", "/payments/transactions/initiate", {
      accountIdentifier: phone,
      paymentProvider: provider,
      invoiceNumber,
    });
  }
 
  // Header "irembopay-signature: t=<timestamp>,s=<signature>"
  // signature = HMAC_SHA256(secret, `${t}#${raw body}`) in hex. Older than 5 minutes = refused (replay).
  verifySignature(rawBody: Buffer | string | undefined, header: string | undefined) {
    if (!rawBody || !header || !this.secret) return false;
 
    const parts: Record<string, string> = {};
    for (const piece of header.split(",")) {
      const [k, ...v] = piece.trim().split("=");
      if (k && v.length) parts[k.trim()] = v.join("=").trim();
    }
    const { t, s } = parts;
    if (!t || !s) return false;
 
    let ts = Number(t);
    if (!Number.isFinite(ts)) return false;
    if (ts < 1e12) ts *= 1000; // seconds -> milliseconds
    if (Math.abs(Date.now() - ts) > 5 * 60_000) return false;
 
    const expected = createHmac("sha256", this.secret).update(`${t}#${rawBody.toString()}`).digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(s.toLowerCase());
    return a.length === b.length && timingSafeEqual(a, b);
  }
}