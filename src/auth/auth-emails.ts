export interface Brand {
  name: string;
  logoUrl?: string | null;
  email?: string | null;
  phone?: string | null;
}

const esc = (s: any) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const PRIMARY = "#0f4c81";

const layout = (brand: Brand, title: string, body: string) => `<!doctype html>
<html><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden">
        <tr><td style="background:${PRIMARY};padding:20px 24px;color:#ffffff">
          ${brand.logoUrl ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.name)}" height="32" style="display:block;margin-bottom:8px">` : ""}
          <div style="font-size:18px;font-weight:bold">${esc(title)}</div>
        </td></tr>
        <tr><td style="padding:24px;font-size:15px;line-height:1.6">${body}</td></tr>
        <tr><td style="padding:16px 24px;background:#f9fafb;font-size:12px;color:#6b7280">
          ${esc(brand.name)}${brand.email ? ` · ${esc(brand.email)}` : ""}${brand.phone ? ` · ${esc(brand.phone)}` : ""}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${esc(href)}" style="display:inline-block;background:${PRIMARY};color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">${esc(label)}</a></p>`;

const linkFallback = (href: string) =>
  `<p style="font-size:12px;color:#6b7280">If the button doesn't work, copy this link into your browser:<br><span style="word-break:break-all">${esc(href)}</span></p>`;

export const inviteEmail = (brand: Brand, user: { names: string; email: string }, link: string, hours: number) => ({
  subject: `Your ${brand.name} account is ready`,
  html: layout(
    brand,
    "Welcome to the team",
    `<p>Hello ${esc(user.names.split(" ")[0])},</p>
     <p>An account was created for you on the ${esc(brand.name)} dashboard with the email <strong>${esc(user.email)}</strong>.</p>
     <p>Choose your password to sign in:</p>
     ${button(link, "Set my password")}
     <p style="font-size:13px;color:#6b7280">This link works once and expires in ${hours} hours. If it expires, use “Forgot password” on the sign-in page.</p>
     ${linkFallback(link)}`,
  ),
  text: `Hello ${user.names.split(" ")[0]},\n\nAn account was created for you on the ${brand.name} dashboard (${user.email}).\nSet your password here (valid ${hours} hours): ${link}\n`,
});

export const resetEmail = (brand: Brand, user: { names: string }, link: string, minutes: number) => ({
  subject: `Reset your ${brand.name} password`,
  html: layout(
    brand,
    "Reset your password",
    `<p>Hello ${esc(user.names.split(" ")[0])},</p>
     <p>We received a request to reset your password.</p>
     ${button(link, "Choose a new password")}
     <p style="font-size:13px;color:#6b7280">This link works once and expires in ${minutes} minutes. If you didn't ask for this, ignore this email: your password stays the same.</p>
     ${linkFallback(link)}`,
  ),
  text: `Reset your password (valid ${minutes} minutes): ${link}\nIf you didn't ask for this, ignore this email.`,
});

export const passwordChangedEmail = (brand: Brand, user: { names: string }, byAdmin: string | null) => ({
  subject: `Your ${brand.name} password was changed`,
  html: layout(
    brand,
    "Password changed",
    `<p>Hello ${esc(user.names.split(" ")[0])},</p>
     <p>Your password was changed${byAdmin ? ` by <strong>${esc(byAdmin)}</strong>` : ""} on ${esc(
       new Date().toLocaleString("en-GB", { timeZone: "Africa/Kigali" }),
     )} (Kigali time).</p>
     <p>If this wasn't you or you didn't expect it, contact your administrator right away.</p>`,
  ),
  text: `Your password was changed${byAdmin ? ` by ${byAdmin}` : ""}. If this wasn't you, contact your administrator.`,
});