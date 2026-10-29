import { Injectable, Logger } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";

export interface MailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

// Sends email through SMTP (Gmail, Zoho, your domain mailbox...).
// No MAIL_HOST in .env -> emails are printed in the console instead (handy while developing).
// Never throws: a failed email must not break saving a request.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor() {
    const host = process.env.MAIL_HOST;
    this.from = process.env.MAIL_FROM ?? "Diaspora Services <no-reply@localhost>";

    this.transporter = host
      ? nodemailer.createTransport({
          host,
          port: Number(process.env.MAIL_PORT ?? 587),
          secure: process.env.MAIL_SECURE === "true", // true for port 465
          auth: process.env.MAIL_USER ? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASSWORD } : undefined,
        })
      : null;

    if (!this.transporter) this.logger.warn("MAIL_HOST not set: emails will be printed in the console, not sent.");
  }

  async send(message: MailMessage): Promise<boolean> {
    const to = Array.isArray(message.to) ? message.to.filter(Boolean) : [message.to].filter(Boolean);
    if (!to.length) return false;

    if (!this.transporter) {
      this.logger.log(`[DEV EMAIL] to=${to.join(", ")} subject="${message.subject}"\n${message.text ?? ""}`);
      return true;
    }

    try {
      await this.transporter.sendMail({ from: this.from, to, subject: message.subject, html: message.html, text: message.text, replyTo: message.replyTo });
      return true;
    } catch (err: any) {
      this.logger.error(`Email to ${to.join(", ")} failed: ${err?.message ?? err}`);
      return false;
    }
  }

  // Comma-separated ADMIN_NOTIFY_EMAILS in .env
  adminEmails(): string[] {
    return (process.env.ADMIN_NOTIFY_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
  }
}