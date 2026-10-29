import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { MailService } from "../mail/mail.service.js";
import { CompanyService } from "../company/company.service.js";
import { ServiceRequest } from "./request.entity.js";
import { Payment } from "./payment.entity.js";
import {
  accessCodeEmail,
  type Brand,
  newRequestAdminEmail,
  proformaEmail,
  receiptEmail,
  requestReceivedEmail,
  statusChangedEmail,
} from "./request-emails.js";

// All request emails in one place. Called AFTER the database work is saved,
// and never throws: an email problem must not undo a request or a payment.
@Injectable()
export class RequestNotificationsService {
  private readonly logger = new Logger(RequestNotificationsService.name);

  constructor(
    private readonly mail: MailService,
    private readonly company: CompanyService,
    @InjectRepository(ServiceRequest) private readonly requests: Repository<ServiceRequest>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
  ) {}

  // Company name / logo / contacts for the email header & footer
  private async brand(): Promise<Brand> {
    try {
      const c = await this.company.get();
      if (c) return { name: c.name, logoUrl: c.logoUrl, email: c.email, phone: c.phone, websiteUrl: c.websiteUrl };
    } catch {}
    return { name: process.env.COMPANY_NAME ?? "Diaspora Services" };
  }

  private loadRequest(id: string) {
    return this.requests.findOne({ where: { id }, relations: { customer: true } });
  }

  private async safely(label: string, work: () => Promise<boolean>) {
    try {
      return await work();
    } catch (err: any) {
      this.logger.error(`${label} email failed: ${err?.message ?? err}`);
      return false;
    }
  }

  // New request -> customer ("we received it") + team ("new request")
  async requestCreated(requestId: string, notifyCustomer = true) {
    return this.safely("request created", async () => {
      const r = await this.loadRequest(requestId);
      if (!r) return false;
      const brand = await this.brand();

      const jobs: Promise<boolean>[] = [];
      if (notifyCustomer) jobs.push(this.mail.send({ to: r.customer.email, ...requestReceivedEmail(brand, r) }));

      const admins = this.mail.adminEmails();
      if (admins.length) jobs.push(this.mail.send({ to: admins, ...newRequestAdminEmail(brand, r) }));

      const results = await Promise.all(jobs);
      return results.every(Boolean);
    });
  }

  async statusChanged(requestId: string) {
    return this.safely("status changed", async () => {
      const r = await this.loadRequest(requestId);
      if (!r) return false;
      return this.mail.send({ to: r.customer.email, ...statusChangedEmail(await this.brand(), r) });
    });
  }

  async proforma(requestId: string) {
    return this.safely("proforma", async () => {
      const r = await this.loadRequest(requestId);
      if (!r?.proforma) return false;
      return this.mail.send({ to: r.customer.email, ...proformaEmail(await this.brand(), r, r.proforma) });
    });
  }

  async receipt(paymentId: string) {
    return this.safely("receipt", async () => {
      const pay = await this.payments.findOne({ where: { id: paymentId } });
      if (!pay) return false;
      const r = await this.loadRequest(pay.requestId);
      if (!r) return false;
      return this.mail.send({ to: r.customer.email, ...receiptEmail(await this.brand(), r, pay) });
    });
  }

  async accessCode(email: string, code: string) {
    return this.safely("access code", async () => this.mail.send({ to: email, ...accessCodeEmail(await this.brand(), code) }));
  }
}