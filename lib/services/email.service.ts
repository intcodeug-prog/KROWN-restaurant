import nodemailer, { type Transporter } from 'nodemailer';

let transporter: Transporter | null = null;

function getEnv(key: string, fallback: string = ''): string {
  return process.env[key] || fallback;
}

function getTransporter(): Transporter {
  const user = getEnv('SMTP_USER');
  const password = getEnv('SMTP_PASSWORD');
  if (!user || !password) {
    throw new Error('[Email] SMTP not configured — set SMTP_USER and SMTP_PASSWORD');
  }
  if (transporter) {
    const opts = (transporter.options as any)?.auth;
    if (opts && (opts.user !== user || opts.pass !== password)) {
      transporter = null;
    }
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: getEnv('SMTP_HOST', 'smtp.gmail.com'),
      port: parseInt(getEnv('SMTP_PORT', '587'), 10),
      secure: getEnv('SMTP_SECURE') === 'true',
      auth: { user, pass: password },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
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
    const from = getEnv('SMTP_FROM', `KROWN POS <${getEnv('SMTP_USER')}>`);
    const appUrl = getEnv('APP_URL', getEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:5454'));
    const result = await transport.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo || getEnv('SMTP_USER'),
      headers: {
        'X-Mailer': 'KROWN-POS/1.0',
        'X-Priority': '3',
        'Precedence': 'bulk',
        'List-Unsubscribe': `<${appUrl}/unsubscribe>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'Feedback-ID': `krown-${Date.now()}`,
        'X-CMAI-Category': 'transactional',
      },
    });
    return { success: true, messageId: result.messageId };
  } catch (e: any) {
    const msg = e?.message || String(e);
    console.error('[Email] Send failed:', msg);
    return { success: false, error: msg };
  }
}

export async function verifySmtpConfig(): Promise<{ ok: boolean; error?: string }> {
  if (!getEnv('SMTP_USER') || !getEnv('SMTP_PASSWORD')) {
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

export function getSmtpFrom(): string {
  return getEnv('SMTP_FROM', `KROWN POS <${getEnv('SMTP_USER')}>`);
}

export function getAppUrl(): string {
  return getEnv('APP_URL', getEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:5454'));
}
