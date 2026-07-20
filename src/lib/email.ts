/**
 * Resend transactional email.
 * Fail soft when RESEND_API_KEY missing (local/dev) — callers get { sent: false }.
 */

import { Resend } from 'resend';
import { appUrl } from './config';

export type SendEmailResult =
  | { sent: true; id: string }
  | { sent: false; reason: 'not_configured' | 'no_recipient' | 'error'; message?: string };

function fromAddress(): string {
  return (
    process.env.RESEND_FROM_EMAIL?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    'Ledgerly <onboarding@resend.dev>'
  );
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}): Promise<SendEmailResult> {
  const to = (Array.isArray(opts.to) ? opts.to : [opts.to])
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!to.length) return { sent: false, reason: 'no_recipient' };

  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    if (process.env.NODE_ENV !== 'production') {
      console.info('[email] RESEND_API_KEY unset — skip send:', opts.subject, '→', to.join(','));
    }
    return { sent: false, reason: 'not_configured' };
  }

  try {
    const resend = new Resend(key);
    const { data, error } = await resend.emails.send({
      from: fromAddress(),
      to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      replyTo: opts.replyTo,
    });
    if (error) {
      console.error('[email] Resend error:', error.message);
      return { sent: false, reason: 'error', message: error.message };
    }
    return { sent: true, id: data?.id || 'ok' };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'send failed';
    console.error('[email] exception:', message);
    return { sent: false, reason: 'error', message };
  }
}

function layout(opts: { title: string; bodyHtml: string; footerNote?: string }) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#e8edf2;font-family:IBM Plex Sans,system-ui,sans-serif;color:#0c1222;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#e8edf2;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:10px;border:1px solid #d0d7e2;overflow:hidden;">
        <tr><td style="background:#0f172a;padding:16px 20px;">
          <span style="color:#fff;font-weight:700;font-size:16px;letter-spacing:-0.02em;">Ledgerly</span>
        </td></tr>
        <tr><td style="padding:24px 20px;">
          <h1 style="margin:0 0 12px;font-size:18px;font-weight:600;">${opts.title}</h1>
          ${opts.bodyHtml}
        </td></tr>
        <tr><td style="padding:0 20px 20px;font-size:12px;color:#64748b;">
          ${opts.footerNote || 'Sent via Ledgerly'}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export async function sendEstimateEmail(opts: {
  to: string;
  customerName?: string | null;
  businessName: string;
  estimateTitle: string;
  shareUrl: string;
  totalLabel?: string;
  replyTo?: string | null;
}): Promise<SendEmailResult> {
  const greeting = opts.customerName ? `Hi ${escapeHtml(opts.customerName)},` : 'Hello,';
  const html = layout({
    title: `Estimate from ${escapeHtml(opts.businessName)}`,
    bodyHtml: `
      <p style="margin:0 0 12px;line-height:1.5;color:#1e293b;">${greeting}</p>
      <p style="margin:0 0 12px;line-height:1.5;color:#1e293b;">
        <strong>${escapeHtml(opts.businessName)}</strong> sent you an estimate:
        <strong>${escapeHtml(opts.estimateTitle)}</strong>${
          opts.totalLabel ? ` (${escapeHtml(opts.totalLabel)})` : ''
        }.
      </p>
      <p style="margin:0 0 20px;">
        <a href="${escapeAttr(opts.shareUrl)}"
           style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">
          Review &amp; sign
        </a>
      </p>
      <p style="margin:0;font-size:13px;color:#64748b;word-break:break-all;">
        Or open: ${escapeHtml(opts.shareUrl)}
      </p>`,
  });
  return sendEmail({
    to: opts.to,
    subject: `Estimate: ${opts.estimateTitle} — ${opts.businessName}`,
    html,
    text: `${opts.businessName} sent you an estimate (${opts.estimateTitle}). Review and sign: ${opts.shareUrl}`,
    replyTo: opts.replyTo || undefined,
  });
}

export async function sendInvoiceReminderEmail(opts: {
  to: string;
  customerName?: string | null;
  businessName: string;
  invoiceNumber: string;
  amountDueLabel: string;
  shareUrl: string;
  replyTo?: string | null;
}): Promise<SendEmailResult> {
  const greeting = opts.customerName ? `Hi ${escapeHtml(opts.customerName)},` : 'Hello,';
  const html = layout({
    title: `Payment reminder from ${escapeHtml(opts.businessName)}`,
    bodyHtml: `
      <p style="margin:0 0 12px;line-height:1.5;color:#1e293b;">${greeting}</p>
      <p style="margin:0 0 12px;line-height:1.5;color:#1e293b;">
        This is a friendly reminder that invoice <strong>${escapeHtml(opts.invoiceNumber)}</strong>
        has a balance of <strong>${escapeHtml(opts.amountDueLabel)}</strong> due.
      </p>
      <p style="margin:0 0 20px;">
        <a href="${escapeAttr(opts.shareUrl)}"
           style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">
          View &amp; pay
        </a>
      </p>
      <p style="margin:0;font-size:13px;color:#64748b;word-break:break-all;">Or open: ${escapeHtml(opts.shareUrl)}</p>`,
    footerNote: opts.businessName,
  });
  return sendEmail({
    to: opts.to,
    subject: `Reminder: invoice ${opts.invoiceNumber} — ${opts.amountDueLabel} due`,
    html,
    text: `Reminder: invoice ${opts.invoiceNumber} has ${opts.amountDueLabel} due. Pay: ${opts.shareUrl}`,
    replyTo: opts.replyTo || undefined,
  });
}

export async function sendStaffInviteEmail(opts: {
  to: string;
  name: string;
  businessName: string;
  tempPassword: string;
}): Promise<SendEmailResult> {
  const loginUrl = `${appUrl()}/login`;
  const html = layout({
    title: `You're on the ${escapeHtml(opts.businessName)} team`,
    bodyHtml: `
      <p style="margin:0 0 12px;line-height:1.5;">Hi ${escapeHtml(opts.name)},</p>
      <p style="margin:0 0 12px;line-height:1.5;">
        You've been invited to <strong>${escapeHtml(opts.businessName)}</strong> on Ledgerly.
      </p>
      <p style="margin:0 0 8px;line-height:1.5;">
        <strong>Email:</strong> ${escapeHtml(opts.to)}<br/>
        <strong>Temporary password:</strong> ${escapeHtml(opts.tempPassword)}
      </p>
      <p style="margin:16px 0 0;">
        <a href="${escapeAttr(loginUrl)}"
           style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">
          Sign in
        </a>
      </p>
      <p style="margin:16px 0 0;font-size:13px;color:#64748b;">Change your password after first login when that option is available, or ask your owner to reset it.</p>`,
  });
  return sendEmail({
    to: opts.to,
    subject: `Invite: ${opts.businessName} on Ledgerly`,
    html,
    text: `You've been invited to ${opts.businessName}. Login: ${loginUrl} Email: ${opts.to} Password: ${opts.tempPassword}`,
  });
}

export async function sendPasswordResetEmail(opts: {
  to: string;
  name?: string;
  resetUrl: string;
}): Promise<SendEmailResult> {
  const html = layout({
    title: 'Reset your password',
    bodyHtml: `
      <p style="margin:0 0 12px;line-height:1.5;">${
        opts.name ? `Hi ${escapeHtml(opts.name)},` : 'Hello,'
      }</p>
      <p style="margin:0 0 16px;line-height:1.5;">
        We received a request to reset your Ledgerly password. This link expires in 1 hour.
      </p>
      <p style="margin:0 0 16px;">
        <a href="${escapeAttr(opts.resetUrl)}"
           style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">
          Choose a new password
        </a>
      </p>
      <p style="margin:0;font-size:13px;color:#64748b;">If you didn't request this, you can ignore this email.</p>`,
  });
  return sendEmail({
    to: opts.to,
    subject: 'Reset your Ledgerly password',
    html,
    text: `Reset your password (expires in 1 hour): ${opts.resetUrl}`,
  });
}

export async function sendAcceptedNotifyEmail(opts: {
  to: string;
  businessName: string;
  estimateTitle: string;
  customerName: string;
  quoteUrl: string;
}): Promise<SendEmailResult> {
  const html = layout({
    title: 'Estimate accepted',
    bodyHtml: `
      <p style="margin:0 0 12px;line-height:1.5;">
        <strong>${escapeHtml(opts.customerName)}</strong> signed
        <strong>${escapeHtml(opts.estimateTitle)}</strong>.
      </p>
      <p style="margin:0;">
        <a href="${escapeAttr(opts.quoteUrl)}"
           style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">
          Open in Ledgerly
        </a>
      </p>`,
    footerNote: opts.businessName,
  });
  return sendEmail({
    to: opts.to,
    subject: `Signed: ${opts.estimateTitle}`,
    html,
    text: `${opts.customerName} signed ${opts.estimateTitle}. ${opts.quoteUrl}`,
  });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}
