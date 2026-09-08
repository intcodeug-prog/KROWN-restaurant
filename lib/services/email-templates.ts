import { escapeHtml } from './email.service';

const BRAND_NAME = 'KROWN POS';
const BRAND_COLOR = '#f97316';
const BRAND_COLOR_DARK = '#ea580c';

function wrap(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#1a1a1e;border-radius:24px;padding:40px;border:1px solid rgba(255,255,255,0.08);">
  <div style="text-align:center;margin-bottom:32px;">
    <div style="width:56px;height:56px;background:linear-gradient(135deg,${BRAND_COLOR},${BRAND_COLOR_DARK});border-radius:16px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;">
      <span style="font-size:24px;font-weight:900;color:#fff;">K</span>
    </div>
    <h1 style="color:#f4f4f6;font-size:22px;font-weight:700;margin:0;">${title}</h1>
  </div>
  ${bodyHtml}
</div>
</body></html>`;
}

function footer(): string {
  return `<div style="border-top:1px solid rgba(255,255,255,0.06);margin:24px 0;padding-top:20px;">
    <p style="color:#52525b;font-size:12px;line-height:1.5;margin:0;text-align:center;">
      This is a transactional email from ${BRAND_NAME}.<br>
      Do not share this email with anyone.
    </p>
  </div>`;
}

export function passwordResetEmail(opts: {
  staffName: string;
  resetUrl: string;
  expiresInHours: number;
  senderName: string;
}): { subject: string; html: string; text: string } {
  const { staffName, resetUrl, expiresInHours, senderName } = opts;
  return {
    subject: `Reset Your ${BRAND_NAME} Password`,
    html: wrap('Password Reset Request', `
      <p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 20px;">
        Hi <strong style="color:#f4f4f6;">${escapeHtml(staffName)}</strong>,
      </p>
      <p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 24px;">
        <strong style="color:#f4f4f6;">${escapeHtml(senderName)}</strong> has requested a password reset for your ${BRAND_NAME} account.
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:linear-gradient(135deg,${BRAND_COLOR},${BRAND_COLOR_DARK});color:#000;font-size:16px;font-weight:700;padding:14px 36px;border-radius:14px;text-decoration:none;">
          Reset My Password
        </a>
      </div>
      <p style="color:#71717a;font-size:13px;line-height:1.6;margin:0 0 8px;text-align:center;">
        This link expires in <strong style="color:#a1a1aa;">${expiresInHours} hour${expiresInHours > 1 ? 's' : ''}</strong> and can only be used once.
      </p>
      ${footer()}
    `),
    text: `Password Reset Request\n\nHi ${staffName},\n\n${senderName} has requested a password reset for your ${BRAND_NAME} account.\n\nReset your password: ${resetUrl}\n\nThis link expires in ${expiresInHours} hour(s) and can only be used once.\n\nIf you didn't request this, ignore this email.`,
  };
}

export function otpEmail(opts: {
  staffName: string;
  code: string;
  purpose: string;
  expiresInMinutes: number;
}): { subject: string; html: string; text: string } {
  const { staffName, code, purpose, expiresInMinutes } = opts;
  const purposeLabel = purpose === 'email_verify' ? 'Email Verification' : purpose === 'password_reset' ? 'Password Reset' : 'Verification';
  return {
    subject: `Your ${BRAND_NAME} Verification Code`,
    html: wrap(`${purposeLabel} Code`, `
      <p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 20px;">
        Hi <strong style="color:#f4f4f6;">${escapeHtml(staffName)}</strong>,
      </p>
      <p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 28px;">
        Your verification code is:
      </p>
      <div style="text-align:center;margin:28px 0;">
        <div style="display:inline-block;background:#121214;border:2px solid ${BRAND_COLOR};border-radius:16px;padding:18px 40px;">
          <span style="color:#f4f4f6;font-size:32px;font-weight:900;letter-spacing:8px;font-family:monospace;">${code}</span>
        </div>
      </div>
      <p style="color:#71717a;font-size:13px;line-height:1.6;margin:0 0 8px;text-align:center;">
        This code expires in <strong style="color:#a1a1aa;">${expiresInMinutes} minute${expiresInMinutes > 1 ? 's' : ''}</strong>.
      </p>
      <p style="color:#71717a;font-size:13px;line-height:1.6;margin:0;text-align:center;">
        If you did not request this code, you can safely ignore this email.
      </p>
      ${footer()}
    `),
    text: `${purposeLabel} Code\n\nHi ${staffName},\n\nYour verification code is: ${code}\n\nThis code expires in ${expiresInMinutes} minute(s).\n\nIf you did not request this code, you can safely ignore this email.`,
  };
}

export function welcomeEmail(opts: {
  staffName: string;
  email: string;
  restaurantName: string;
  role: string;
  tempPassword?: string;
}): { subject: string; html: string; text: string } {
  const { staffName, email, restaurantName, role, tempPassword } = opts;
  return {
    subject: `Welcome to ${BRAND_NAME}`,
    html: wrap('Welcome to ' + BRAND_NAME, `
      <p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 20px;">
        Hi <strong style="color:#f4f4f6;">${escapeHtml(staffName)}</strong>,
      </p>
      <p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 24px;">
        Your account has been successfully created.
      </p>
      <div style="background:#121214;border-radius:14px;padding:20px;margin:0 0 24px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="color:#71717a;font-size:13px;padding:6px 0;">Restaurant</td><td style="color:#f4f4f6;font-size:14px;font-weight:600;padding:6px 0;text-align:right;">${escapeHtml(restaurantName)}</td></tr>
          <tr><td style="color:#71717a;font-size:13px;padding:6px 0;">Role</td><td style="color:#f4f4f6;font-size:14px;font-weight:600;padding:6px 0;text-align:right;">${escapeHtml(role)}</td></tr>
          <tr><td style="color:#71717a;font-size:13px;padding:6px 0;">Email</td><td style="color:#f4f4f6;font-size:14px;font-weight:600;padding:6px 0;text-align:right;">${escapeHtml(email)}</td></tr>
        </table>
      </div>
      ${tempPassword ? `<div style="background:rgba(249,115,22,0.1);border:1px solid rgba(249,115,22,0.2);border-radius:14px;padding:16px;margin:0 0 24px;">
        <p style="color:#a1a1aa;font-size:13px;margin:0 0 8px;">Your temporary password:</p>
        <p style="color:#f4f4f6;font-size:18px;font-weight:700;margin:0;font-family:monospace;letter-spacing:1px;">${escapeHtml(tempPassword)}</p>
        <p style="color:#71717a;font-size:12px;margin:8px 0 0;">Please change this after your first login.</p>
      </div>` : ''}
      ${footer()}
    `),
    text: `Welcome to ${BRAND_NAME}\n\nHi ${staffName},\n\nYour account has been successfully created.\n\nRestaurant: ${restaurantName}\nRole: ${role}\nEmail: ${email}\n${tempPassword ? `\nYour temporary password: ${tempPassword}\nPlease change this after your first login.\n` : ''}`,
  };
}

export function securityNotificationEmail(opts: {
  staffName: string;
  action: string;
  details: string;
}): { subject: string; html: string; text: string } {
  const { staffName, action, details } = opts;
  return {
    subject: `${BRAND_NAME} Security Notification`,
    html: wrap('Security Notification', `
      <p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 20px;">
        Hi <strong style="color:#f4f4f6;">${escapeHtml(staffName)}</strong>,
      </p>
      <p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 24px;">
        A security-related action was performed on your account:
      </p>
      <div style="background:#121214;border-radius:14px;padding:16px;margin:0 0 24px;">
        <p style="color:#71717a;font-size:13px;margin:0 0 4px;">Action</p>
        <p style="color:#f4f4f6;font-size:14px;font-weight:600;margin:0;">${escapeHtml(action)}</p>
        <p style="color:#71717a;font-size:13px;margin:12px 0 4px;">Details</p>
        <p style="color:#f4f4f6;font-size:14px;margin:0;">${escapeHtml(details)}</p>
      </div>
      <p style="color:#71717a;font-size:13px;line-height:1.6;margin:0;text-align:center;">
        If you did not perform this action, please contact your administrator immediately.
      </p>
      ${footer()}
    `),
    text: `Security Notification\n\nHi ${staffName},\n\nA security-related action was performed on your account:\n\nAction: ${action}\nDetails: ${details}\n\nIf you did not perform this action, please contact your administrator immediately.`,
  };
}
