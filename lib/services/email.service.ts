import nodemailer, { type Transporter } from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASSWORD = process.env.SMTP_PASSWORD || '';
const SMTP_FROM = process.env.SMTP_FROM || `KROWN POS <${SMTP_USER}>`;
const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5454';

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    if (!SMTP_USER || !SMTP_PASSWORD) {
      throw new Error('[Email] SMTP not configured — set SMTP_USER and SMTP_PASSWORD');
    }
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      pool: true,
      maxConnections: 3,
      maxMessages: 10,
    });
  }
  return transporter;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const transport = getTransporter();
    const result = await transport.sendMail({
      from: SMTP_FROM,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
    });
    return { success: true, messageId: result.messageId };
  } catch (e: any) {
    const msg = e?.message || String(e);
    console.error('[Email] Send failed:', msg);
    return { success: false, error: msg };
  }
}

export async function verifySmtpConfig(): Promise<{ ok: boolean; error?: string }> {
  if (!SMTP_USER || !SMTP_PASSWORD) {
    return { ok: false, error: 'SMTP_USER and SMTP_PASSWORD must be set' };
  }
  try {
    const transport = getTransporter();
    await transport.verify();
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'SMTP verification failed' };
  }
}

export function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export { SMTP_FROM, APP_URL };
