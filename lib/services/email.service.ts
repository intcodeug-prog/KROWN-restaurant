import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM = process.env.RESEND_FROM_EMAIL || 'KROWN POS <noreply@krownpos.com>';
const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

let resendClient: Resend | null = null;

function getClient(): Resend {
  if (!resendClient && RESEND_API_KEY) {
    resendClient = new Resend(RESEND_API_KEY);
  }
  return resendClient!;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<{ success: boolean; error?: string }> {
  const client = getClient();
  if (!client) {
    console.warn('[Email] Resend not configured — skipping email send');
    return { success: false, error: 'Email service not configured' };
  }
  try {
    await client.emails.send({
      from: RESEND_FROM,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
    return { success: true };
  } catch (e: any) {
    console.error('[Email] Send failed:', e?.message);
    return { success: false, error: e?.message || 'Failed to send email' };
  }
}

export function buildPasswordResetEmail(opts: {
  staffName: string;
  resetUrl: string;
  expiresInHours: number;
  senderName: string;
}): { subject: string; html: string; text: string } {
  const { staffName, resetUrl, expiresInHours, senderName } = opts;
  return {
    subject: 'Reset Your KROWN POS Password',
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#1a1a1e;border-radius:24px;padding:40px;border:1px solid rgba(255,255,255,0.08);">
  <div style="text-align:center;margin-bottom:32px;">
    <div style="width:56px;height:56px;background:linear-gradient(135deg,#f97316,#f59e0b);border-radius:16px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;">
      <span style="font-size:28px;">🔐</span>
    </div>
    <h1 style="color:#f4f4f6;font-size:22px;font-weight:700;margin:0;">Password Reset Request</h1>
  </div>
  <p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 20px;">
    Hi <strong style="color:#f4f4f6;">${staffName}</strong>,
  </p>
  <p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 24px;">
    <strong style="color:#f4f4f6;">${senderName}</strong> has requested a password reset for your KROWN POS account.
  </p>
  <div style="text-align:center;margin:32px 0;">
    <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#f97316,#f59e0b);color:#000;font-size:16px;font-weight:700;padding:14px 36px;border-radius:14px;text-decoration:none;letter-spacing:0.3px;">
      Reset My Password
    </a>
  </div>
  <p style="color:#71717a;font-size:13px;line-height:1.6;margin:0 0 8px;text-align:center;">
    This link expires in <strong style="color:#a1a1aa;">${expiresInHours} hour${expiresInHours > 1 ? 's' : ''}</strong> and can only be used once.
  </p>
  <div style="border-top:1px solid rgba(255,255,255,0.06);margin:24px 0;padding-top:20px;">
    <p style="color:#52525b;font-size:12px;line-height:1.5;margin:0;text-align:center;">
      If you didn't request this, ignore this email. Your password will remain unchanged.<br>
      Do not share this link with anyone.
    </p>
  </div>
</div>
</body>
</html>`,
    text: `Password Reset Request\n\nHi ${staffName},\n\n${senderName} has requested a password reset for your KROWN POS account.\n\nReset your password: ${resetUrl}\n\nThis link expires in ${expiresInHours} hour(s) and can only be used once.\n\nIf you didn't request this, ignore this email. Your password will remain unchanged.`,
  };
}

export { APP_URL };
