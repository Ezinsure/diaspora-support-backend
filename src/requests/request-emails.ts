import {
  METHOD_LABEL,
  money,
  STATUS_LABEL,
  type Proforma,
  RequestStatus,
} from './request.types.js';

// Simple, inline-styled emails (work in Gmail, Outlook, phones).
// Everything typed by customers goes through esc() so it can't inject HTML.

export interface Brand {
  name: string;
  logoUrl?: string | null;
  email?: string | null;
  phone?: string | null;
  websiteUrl?: string | null;
}

export const esc = (s: any) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const PRIMARY = '#0f4c81';

const layout = (brand: Brand, title: string, body: string) => `<!doctype html>
<html><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
        <tr><td style="background:${PRIMARY};padding:20px 24px;color:#ffffff">
          ${brand.logoUrl ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.name)}" height="32" style="display:block;margin-bottom:8px">` : ''}
          <div style="font-size:18px;font-weight:bold">${esc(title)}</div>
        </td></tr>
        <tr><td style="padding:24px;font-size:15px;line-height:1.6">${body}</td></tr>
        <tr><td style="padding:16px 24px;background:#f9fafb;font-size:12px;color:#6b7280">
          ${esc(brand.name)}${brand.phone ? ` · ${esc(brand.phone)}` : ''}${brand.email ? ` · ${esc(brand.email)}` : ''}
          ${brand.websiteUrl ? `<br><a href="${esc(brand.websiteUrl)}" style="color:${PRIMARY}">${esc(brand.websiteUrl)}</a>` : ''}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

const refBox = (reference: string, status = 'Received') =>
  `<div style="margin:16px 0;padding:12px 16px;background:#eef4fb;border-radius:8px;font-size:14px">
     Your request number: <strong style="font-size:16px;letter-spacing:0.5px">${esc(reference)}</strong><br/>
     Status: <strong>${esc(status)}</strong>
   </div>`;

const button = (href: string, label: string) =>
  `<p style="margin:20px 0"><a href="${esc(href)}" style="display:inline-block;background:${PRIMARY};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold">${esc(label)}</a></p>`;

const siteUrl = () => (process.env.PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

// The customer's own request: /track?ref=REQ-2026-0001 (they only type their email)
const trackUrl = (reference?: string) =>
  `${siteUrl()}/track${reference ? `?ref=${encodeURIComponent(reference)}` : ''}`;

// The request in the dashboard
const adminUrl = (reference: string) =>
  `${(process.env.ADMIN_SITE_URL ?? process.env.PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')}/admin/requests?search=${encodeURIComponent(reference)}`;

const row = (label: string, value: string) =>
  `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;white-space:nowrap">${esc(label)}</td><td style="padding:4px 0">${value}</td></tr>`;

const fileSize = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

// ---------- To the customer ----------

export const requestReceivedEmail = (brand: Brand, r: any) => ({
  subject: `We received your request ${r.reference}`,
  html: layout(
    brand,
    'Request received',
    `<p>Hello ${esc(r.customer.firstName)},</p>
     <p>Thank you for contacting ${esc(brand.name)}. We received your request for <strong>${esc(r.serviceName)}</strong>.</p>
     ${refBox(r.reference)}
     <p>Our team will review it and contact you soon by phone or WhatsApp to explain the documents needed and the cost.</p>
     <p>On your request page you can follow it, send us your documents and pay online when the quotation is ready. Keep your request number: with your email, it opens your page at any time.</p>
     ${button(trackUrl(r.reference), 'Open my request')}`,
  ),
  text:
    `Hello ${r.customer.firstName},\n\n` +
    `We received your request for ${r.serviceName}.\n` +
    `Your request number: ${r.reference}\n\n` +
    `We will contact you soon by phone or WhatsApp.\n` +
    `Follow it, send documents and pay here: ${trackUrl(r.reference)}\n\n` +
    `${brand.name}`,
});

const STATUS_MESSAGE: Partial<Record<RequestStatus, string>> = {
  [RequestStatus.IN_PROGRESS]: 'Good news: we have started working on your request.',
  [RequestStatus.COMPLETED]: 'Your request is completed. Thank you for trusting us.',
  [RequestStatus.CANCELLED]: 'Your request has been cancelled.',
};

export const statusChangedEmail = (brand: Brand, r: any) => {
  const label = STATUS_LABEL[r.status as RequestStatus];
  const message = STATUS_MESSAGE[r.status as RequestStatus] ?? `The status of your request is now ${label}.`;
  return {
    subject: `Request ${r.reference}: ${label}`,
    html: layout(
      brand,
      `Request ${label.toLowerCase()}`,
      `<p>Hello ${esc(r.customer.firstName)},</p>
       <p>${esc(message)}</p>
       ${refBox(r.reference, label)}
       ${r.statusNote ? `<p style="padding:12px 16px;background:#f9fafb;border-radius:8px"><strong>Note:</strong> ${esc(r.statusNote)}</p>` : ''}
       ${button(trackUrl(r.reference), 'See my request')}`,
    ),
    text:
      `Hello ${r.customer.firstName},\n\n${message}\n` +
      `Request: ${r.reference}\n` +
      `${r.statusNote ? `Note: ${r.statusNote}\n` : ''}` +
      `See it here: ${trackUrl(r.reference)}\n\n${brand.name}`,
  };
};

export const proformaEmail = (brand: Brand, r: any, p: Proforma) => {
  const lines = p.items
    .map(
      (i) =>
        `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${esc(i.description)}</td>
             <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right">${i.quantity}</td>
             <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right">${esc(money(i.quantity * i.unitPrice, p.currency))}</td></tr>`,
    )
    .join('');
  return {
    subject: `Quotation ${p.number} for request ${r.reference}`,
    html: layout(
      brand,
      `Quotation ${p.number}`,
      `<p>Hello ${esc(r.customer.firstName)},</p>
       <p>Here is the quotation for your request <strong>${esc(r.reference)}</strong> (${esc(r.serviceName)}).</p>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:12px 0">
         <tr style="color:#6b7280"><td>Description</td><td style="text-align:right">Qty</td><td style="text-align:right">Amount</td></tr>
         ${lines}
         <tr><td colspan="2" style="padding:10px 0;text-align:right;font-weight:bold">Total</td>
             <td style="padding:10px 0;text-align:right;font-weight:bold;font-size:16px">${esc(money(p.total, p.currency))}</td></tr>
       </table>
       ${p.validUntil ? `<p style="font-size:13px;color:#6b7280">Valid until ${esc(p.validUntil)}</p>` : ''}
       ${p.note ? `<p>${esc(p.note)}</p>` : ''}
       <p>You can pay online by card, bank or MoMo (MTN / Airtel) on your request page. Payments are secured by IremboPay.</p>
       ${button(trackUrl(r.reference), `Pay ${money(p.total, p.currency)} online`)}
       <p style="font-size:13px;color:#6b7280">Questions? Reply to this email or contact us on WhatsApp.</p>`,
    ),
    text:
      `Quotation ${p.number} for ${r.reference}\n` +
      `${p.items.map((i) => `- ${i.description} x${i.quantity}: ${money(i.quantity * i.unitPrice, p.currency)}`).join('\n')}\n` +
      `Total: ${money(p.total, p.currency)}\n` +
      `${p.validUntil ? `Valid until ${p.validUntil}\n` : ''}` +
      `\nPay online (card, bank or MoMo): ${trackUrl(r.reference)}\n\n${brand.name}`,
  };
};

export const receiptEmail = (brand: Brand, r: any, pay: any) => {
  const remaining = r.amountDue !== null && r.amountPaid < r.amountDue ? r.amountDue - r.amountPaid : 0;
  return {
    subject: `Payment receipt ${pay.receiptNumber} — ${r.reference}`,
    html: layout(
      brand,
      'Payment received',
      `<p>Hello ${esc(r.customer.firstName)},</p>
       <p>We received your payment. Thank you!</p>
       <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;margin:12px 0">
         ${row('Receipt', `<strong>${esc(pay.receiptNumber)}</strong>`)}
         ${row('Request', esc(r.reference))}
         ${row('Service', esc(r.serviceName))}
         ${row('Amount', `<strong>${esc(money(pay.amount, pay.currency))}</strong>`)}
         ${row('Method', esc(METHOD_LABEL[pay.method as keyof typeof METHOD_LABEL] ?? pay.method))}
         ${pay.transactionRef ? row('Transaction', esc(pay.transactionRef)) : ''}
         ${row('Date', esc(new Date(pay.paidAt).toLocaleString('en-GB', { timeZone: 'Africa/Kigali' })))}
         ${remaining > 0 ? row('Remaining', `<strong>${esc(money(remaining, r.currency))}</strong>`) : ''}
       </table>
       <p>Keep this email as proof of payment.</p>
       ${remaining > 0 ? button(trackUrl(r.reference), `Pay the remaining ${money(remaining, r.currency)}`) : button(trackUrl(r.reference), 'See my request')}`,
    ),
    text:
      `Payment received\nReceipt: ${pay.receiptNumber}\nRequest: ${r.reference}\nAmount: ${money(pay.amount, pay.currency)}\n` +
      `${remaining > 0 ? `Remaining: ${money(remaining, r.currency)}\nPay here: ${trackUrl(r.reference)}\n` : `See your request: ${trackUrl(r.reference)}\n`}` +
      `\n${brand.name}`,
  };
};

export const accessCodeEmail = (brand: Brand, code: string) => ({
  subject: `Your code: ${code}`,
  html: layout(
    brand,
    'Your access code',
    `<p>Use this code to see your requests:</p>
     <p style="font-size:30px;font-weight:bold;letter-spacing:8px;margin:16px 0">${esc(code)}</p>
     <p style="color:#6b7280;font-size:13px">It expires in 10 minutes. If you didn't ask for it, you can ignore this email.</p>`,
  ),
  text: `Your access code: ${code}\nIt expires in 10 minutes.`,
});

// ---------- To the team ----------

export const newRequestAdminEmail = (brand: Brand, r: any) => {
  const c = r.customer;
  return {
    subject: `New request ${r.reference} — ${r.serviceName}`,
    html: layout(
      brand,
      'New request',
      `<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px">
         ${row('Reference', `<strong>${esc(r.reference)}</strong>`)}
         ${row('Service', esc(r.serviceName))}
         ${row('Name', esc(`${c.firstName} ${c.lastName}`))}
         ${row('Email', `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`)}
         ${row('Phone', `<a href="https://wa.me/${esc(String(c.phone).replace(/\D/g, ''))}">${esc(c.phone)}</a> (WhatsApp)`)}
         ${c.country ? row('Country', esc(c.country)) : ''}
         ${c.timezone ? row('Time zone', esc(c.timezone)) : ''}
       </table>
       <p style="margin-top:16px;padding:12px 16px;background:#f9fafb;border-radius:8px;white-space:pre-line">${esc(r.description)}</p>
       ${button(adminUrl(r.reference), 'Open in admin')}`,
    ),
    text: `New request ${r.reference}\n${r.serviceName}\n${c.firstName} ${c.lastName} — ${c.email} — ${c.phone}\n\n${r.description}\n\n${adminUrl(r.reference)}`,
    replyTo: c.email,
  };
};

// The customer uploaded documents on /track. Files are never attached: they stay on our server.
export const customerDocumentsAdminEmail = (
  brand: Brand,
  r: any,
  files: { name: string; size: number }[],
  label?: string | null,
) => {
  const c = r.customer;
  const customer = `${c.firstName} ${c.lastName}`;
  const what = label ? `"${label}"` : files.length === 1 ? 'a document' : `${files.length} documents`;
  return {
    subject: `${r.reference}: ${customer} uploaded ${what}`,
    html: layout(
      brand,
      'New documents from a customer',
      `<p><strong>${esc(customer)}</strong> uploaded ${esc(what)} for <strong>${esc(r.reference)}</strong> (${esc(r.serviceName)}) from the website.</p>
       <ul style="margin:12px 0;padding-left:18px;font-size:14px">
         ${files.map((f) => `<li>${esc(f.name)} <span style="color:#6b7280">(${fileSize(f.size)})</span></li>`).join('')}
       </ul>
       ${button(adminUrl(r.reference), 'Open in admin')}
       <p style="font-size:12px;color:#6b7280">The files are private: open them from the dashboard.</p>`,
    ),
    text:
      `${customer} uploaded ${what} for ${r.reference} (${r.serviceName}) from the website.\n\n` +
      `${files.map((f) => `- ${f.name} (${fileSize(f.size)})`).join('\n')}\n\n` +
      `Open it: ${adminUrl(r.reference)}`,
    replyTo: c.email,
  };
};