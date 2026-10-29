import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { IsNull, MoreThan, Repository } from "typeorm";
import { AccessCode } from "./access-code.entity.js";
import { ServiceRequest } from "./request.entity.js";
import { Service } from "../services/service.entity.js";
import { RequestNotificationsService } from "./request-notifi.service.js";
import { paymentState, round2, STATUS_LABEL } from "./request.types.js";

const CODE_TTL_MIN = 10;
const CODE_COOLDOWN_SEC = 60; // one new code per email per minute
const MAX_ATTEMPTS = 5;
const TOKEN_TTL_MIN = 30;

// Customers have no account. They can:
//  1. see ONE request with reference + email
//  2. get a code by email -> see ALL their requests for 30 minutes
// Answers never reveal whether an email exists in our system.
@Injectable()
export class PublicAccessService {
  private readonly logger = new Logger(PublicAccessService.name);
  private readonly secret: string;

  constructor(
    @InjectRepository(AccessCode) private readonly codes: Repository<AccessCode>,
    @InjectRepository(ServiceRequest) private readonly requests: Repository<ServiceRequest>,
    @InjectRepository(Service) private readonly services: Repository<Service>,
    private readonly notify: RequestNotificationsService,
  ) {
    const secret = process.env.PUBLIC_ACCESS_SECRET;
    if (!secret || secret.length < 32) {
      this.logger.warn("PUBLIC_ACCESS_SECRET missing or shorter than 32 characters: using a temporary one (tokens break on restart).");
    }
    this.secret = secret && secret.length >= 32 ? secret : `${Date.now()}-${Math.random()}-temporary-secret-change-me`;
  }

  // ---------- Form data ----------

  // Active services for the public form's dropdown
  async formServices() {
    return this.services.find({
      where: { isActive: true },
      select: { id: true, name: true, description: true, subDescription: true, tags: true },
      order: { name: "ASC" },
    });
  }

  // ---------- 1. Reference + email ----------

  async track(reference: string, email: string) {
    const request = await this.publicQuery()
      .where("request.reference = :reference", { reference })
      .andWhere("LOWER(customer.email) = LOWER(:email)", { email })
      .getOne();
    // Same answer whether the reference or the email is wrong
    if (!request) throw new NotFoundException("We couldn't find a request with this number and email");
    return this.toPublic(request);
  }

  // ---------- 2. Code by email ----------

  async sendCode(email: string) {
    const generic = { message: "If we have requests for this email, we sent you a 6-digit code. It expires in 10 minutes." };

    const hasRequests = await this.publicQuery().where("LOWER(customer.email) = LOWER(:email)", { email }).getExists();
    if (!hasRequests) return generic;

    // Too soon since the last code: say the same thing, send nothing
    const recent = await this.codes.findOne({
      where: { email, createdAt: MoreThan(new Date(Date.now() - CODE_COOLDOWN_SEC * 1000)) },
    });
    if (recent) return generic;

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await this.codes.save(
      this.codes.create({
        email,
        codeHash: this.hash(`${email}:${code}`),
        expiresAt: new Date(Date.now() + CODE_TTL_MIN * 60 * 1000),
        attempts: 0,
        usedAt: null,
      }),
    );
    await this.notify.accessCode(email, code);
    return generic;
  }

  async verifyCode(email: string, code: string) {
    const invalid = new BadRequestException("This code is wrong or has expired. Ask for a new one.");

    const entry = await this.codes.findOne({
      where: { email, usedAt: IsNull(), expiresAt: MoreThan(new Date()) },
      order: { createdAt: "DESC" },
    });
    if (!entry || entry.attempts >= MAX_ATTEMPTS) throw invalid;

    const ok = this.safeEqual(entry.codeHash, this.hash(`${email}:${code}`));
    if (!ok) {
      await this.codes.increment({ id: entry.id }, "attempts", 1);
      throw invalid;
    }

    await this.codes.update(entry.id, { usedAt: new Date() });
    const token = this.issueToken(email);
    return { ...token, requests: await this.listFor(email) };
  }

  // GET /public/requests/mine (Bearer token)
  async listFor(email: string) {
    const rows = await this.publicQuery().where("LOWER(customer.email) = LOWER(:email)", { email }).orderBy("request.createdAt", "DESC").getMany();
    return rows.map((r) => this.toPublic(r));
  }

  async oneFor(email: string, reference: string) {
    const request = await this.publicQuery()
      .where("request.reference = :reference", { reference })
      .andWhere("LOWER(customer.email) = LOWER(:email)", { email })
      .getOne();
    if (!request) throw new NotFoundException("Request not found");
    return this.toPublic(request);
  }

  // ---------- Token (signed, no database) ----------

  // base64url(payload).signature  — payload = { email, exp }
  issueToken(email: string) {
    const exp = Date.now() + TOKEN_TTL_MIN * 60 * 1000;
    const payload = Buffer.from(JSON.stringify({ email, exp })).toString("base64url");
    return { token: `${payload}.${this.hash(payload)}`, expiresAt: new Date(exp).toISOString() };
  }

  emailFromToken(authorization?: string) {
    const token = authorization?.replace(/^Bearer\s+/i, "").trim();
    const fail = new UnauthorizedException("Your access has expired. Ask for a new code.");
    if (!token || !token.includes(".")) throw fail;

    const [payload, signature] = token.split(".");
    if (!this.safeEqual(signature, this.hash(payload))) throw fail;

    try {
      const { email, exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      if (typeof email !== "string" || typeof exp !== "number" || exp < Date.now()) throw fail;
      return email;
    } catch {
      throw fail;
    }
  }

  // ---------- Helpers ----------

  private publicQuery() {
    return this.requests.createQueryBuilder("request").innerJoinAndSelect("request.customer", "customer");
  }

  // What a customer may see (no internal ids of staff, no storage paths)
  private toPublic(r: ServiceRequest) {
    return {
      reference: r.reference,
      service: r.serviceName,
      description: r.description,
      status: r.status,
      statusLabel: STATUS_LABEL[r.status],
      statusNote: r.statusNote,
      requiredDocuments: r.requiredDocuments,
      currency: r.currency,
      amountDue: r.amountDue,
      amountPaid: r.amountPaid,
      balance: r.amountDue === null ? null : Math.max(round2(r.amountDue - r.amountPaid), 0),
      paymentStatus: paymentState(r.amountDue, r.amountPaid),
      proforma: r.proforma
        ? { number: r.proforma.number, items: r.proforma.items, total: r.proforma.total, currency: r.proforma.currency, validUntil: r.proforma.validUntil, note: r.proforma.note }
        : null,
      customer: { firstName: r.customer.firstName, lastName: r.customer.lastName },
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  private hash(value: string) {
    return createHmac("sha256", this.secret).update(value).digest("hex");
  }

  private safeEqual(a: string, b: string) {
    const x = Buffer.from(a ?? "");
    const y = Buffer.from(b ?? "");
    return x.length === y.length && timingSafeEqual(x, y);
  }
}