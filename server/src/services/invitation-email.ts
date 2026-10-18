import { readFile } from "node:fs/promises";
import nodemailer from "nodemailer";
import { z } from "zod";

export type InvitationEmail = {
  to: string;
  companyName: string;
  inviteUrl: string;
  role: string;
  expiresAt: Date;
};

export async function invitationEmailTransport() {
  const host = process.env.WHOXOS_SMTP_HOST;
  const user = process.env.WHOXOS_SMTP_USER;
  const from = process.env.WHOXOS_SMTP_FROM;
  const port = Number(process.env.WHOXOS_SMTP_PORT ?? 465);
  const passwordFile = process.env.WHOXOS_SMTP_PASSWORD_FILE;
  if (!host || !user || !from || !passwordFile || ![465, 587, 2525].includes(port)) {
    throw new Error("Invitation email is not configured");
  }
  z.email().parse(from);
  const pass = (await readFile(passwordFile, "utf8")).trimEnd();
  if (!pass) throw new Error("Invitation email password is missing");
  return {
    from,
    transport: nodemailer.createTransport({
      host, port, secure: port === 465, requireTLS: port !== 465,
      auth: { user, pass },
      tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
      logger: false, debug: false,
      disableFileAccess: true, disableUrlAccess: true,
    }),
  };
}

// Attach the existing product mark as an inline image so mail clients do not
// need to fetch a remote logo. Both packaged-server and source-tree layouts
// use the same approved brand asset.
async function invitationLogo() {
  try {
    return await readFile(new URL("../../../ui/public/apple-touch-icon.png", import.meta.url));
  } catch {
    return readFile(new URL("../../ui-dist/apple-touch-icon.png", import.meta.url));
  }
}

export function invitationEmailContent(input: InvitationEmail) {
  z.email().parse(input.to);
  const url = new URL(input.inviteUrl);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Invitations require a public HTTPS URL");
  const company = input.companyName.replace(/[\r\n]/g, " ");
  const expiry = input.expiresAt.toLocaleString("en-US", { timeZone: "UTC", dateStyle: "long", timeStyle: "short" }) + " UTC";
  return {
    to: input.to,
    subject: `You're invited to join ${company} on WHOXOS`,
    text: `You've been invited to join ${company} on WHOXOS.\n\nYour role: ${input.role}\n\nAccept your invitation:\n${url.href}\n\nThis invitation is single-use and expires ${expiry}. Sign in or create an account using ${input.to} to join. This invitation is reserved for that email address.\n\nIf you weren't expecting this invitation, you can ignore this email.`,
    html: `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>Invitation to ${escapeHtml(company)}</title>
<style>@media only screen and (max-width: 620px) { .email-shell { padding: 20px 12px !important; } .email-content { padding: 28px 24px !important; } .email-title { font-size: 28px !important; line-height: 36px !important; } }</style></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;color:#171717;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;color:#f5f5f5;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">You're invited to join ${escapeHtml(company)} on WHOXOS. Accept your invitation to get started.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f5f5f5"><tr><td class="email-shell" align="center" style="padding:48px 16px;">
<!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;border:1px solid #e5e5e5;border-radius:16px;background-color:#ffffff;" bgcolor="#ffffff">
<tr><td style="padding:24px 32px;border-bottom:1px solid #ededed;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td width="42" style="vertical-align:middle;"><img src="cid:overview-labs-logo" width="36" height="36" alt="WHOXOS logo" style="display:block;border:0;width:36px;height:36px;background-color:#ffffff;"></td><td style="padding-left:8px;font-family:Arial,Helvetica,sans-serif;font-size:19px;line-height:26px;font-weight:700;letter-spacing:-0.4px;color:#171717;">WHOXOS</td></tr></table>
</td></tr>
<tr><td class="email-content" style="padding:36px 40px 40px;">
<p style="margin:0 0 14px;font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.5px;color:#737373;">ORGANIZATION INVITATION</p>
<h1 class="email-title" style="margin:0 0 18px;font-size:32px;line-height:40px;font-weight:700;letter-spacing:-0.8px;color:#171717;overflow-wrap:anywhere;">You're invited to join<br>${escapeHtml(company)}</h1>
<p style="margin:0 0 28px;font-size:15px;line-height:25px;color:#525252;">You've been invited to join <strong style="color:#171717;">${escapeHtml(company)}</strong>, an organization on WHOXOS.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f8f8f8" style="border:1px solid #ededed;border-radius:10px;background-color:#f8f8f8;">
<tr><td style="padding:18px 20px 8px;font-size:12px;line-height:20px;color:#737373;">Organization</td><td align="right" style="padding:18px 20px 8px;font-size:14px;line-height:20px;font-weight:700;color:#171717;overflow-wrap:anywhere;">${escapeHtml(company)}</td></tr>
<tr><td style="padding:0 20px 18px;font-size:12px;line-height:20px;color:#737373;">Your role</td><td align="right" style="padding:0 20px 18px;font-size:14px;line-height:20px;color:#171717;">${escapeHtml(input.role.charAt(0).toUpperCase() + input.role.slice(1))}</td></tr>
</table>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:28px;"><tr><td align="center" bgcolor="#171717" style="border-radius:8px;background-color:#171717;mso-padding-alt:16px 24px;"><a href="${escapeHtml(url.href)}" style="display:block;padding:16px 24px;border:1px solid #171717;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;font-weight:700;text-align:center;text-decoration:none;color:#ffffff;">Accept invitation</a></td></tr></table>
<p style="margin:16px 0 28px;font-size:13px;line-height:21px;text-align:center;color:#737373;">Sign in or create an WHOXOS account using <strong>${escapeHtml(input.to)}</strong>. This invitation is reserved for that email address.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding-top:24px;border-top:1px solid #ededed;">
<p style="margin:0 0 12px;font-size:12px;line-height:20px;color:#737373;">This invitation is single-use and expires<br><strong style="font-weight:400;color:#525252;">${escapeHtml(expiry)}</strong>.</p>
<p style="margin:0 0 6px;font-size:12px;line-height:20px;color:#737373;">If the button doesn't work, copy this link into your browser:</p>
<p style="margin:0;font-size:12px;line-height:19px;word-break:break-all;overflow-wrap:anywhere;"><a href="${escapeHtml(url.href)}" style="color:#525252;text-decoration:underline;word-break:break-all;">${escapeHtml(url.href)}</a></p>
</td></tr></table>
</td></tr></table>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;"><tr><td align="center" style="padding:24px 24px 0;"><p style="margin:0;font-size:12px;line-height:20px;color:#737373;">Sent by WHOXOS on behalf of ${escapeHtml(company)}.<br>If you weren't expecting this invitation, you can ignore this email.</p></td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`,
  };
}

export async function sendInvitationEmail(input: InvitationEmail): Promise<void> {
  const message = invitationEmailContent(input);
  const logo = await invitationLogo();
  const { from, transport } = await invitationEmailTransport();
  try {
    const result = await transport.sendMail({ from: { name: "WHOXOS", address: from }, ...message,
      attachments: [{ filename: "overview-labs.png", content: logo, contentType: "image/png", contentDisposition: "inline", cid: "overview-labs-logo" }],
    });
    if (!result.accepted.some((address) => String(address).toLowerCase() === input.to.toLowerCase())) {
      throw new Error("SMTP did not accept the invitation recipient");
    }
  } finally {
    transport.close();
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
