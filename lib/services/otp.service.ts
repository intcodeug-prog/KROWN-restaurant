import crypto from 'crypto';
import { getSql } from '@/lib/neon-server';
import { sendEmail } from './email.service';
import { otpEmail } from './email-templates';
import { logEmail } from './email-log.service';
import { logAuditEvent } from '@/lib/audit';

const OTP_EXPIRY_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function generateOtp(): string {
  const bytes = crypto.randomBytes(4);
  const num = bytes.readUInt32BE(0);
  return String(num % 1000000).padStart(6, '0');
}

export async function generateAndSendOtp(opts: {
  staffId: string;
  purpose: string;
  organizationId?: string;
  ip?: string;
}): Promise<{ success: boolean; error?: string; cooldownSeconds?: number }> {
  const sql = getSql();
  const { staffId, purpose, organizationId, ip } = opts;

  const staffRows = await sql`SELECT id, name, email, organization_id FROM staff WHERE id = ${staffId} AND status = 'active' LIMIT 1`;
  if (!staffRows.length) return { success: false, error: 'Staff member not found' };
  const staff = staffRows[0] as any;
  const orgId = staff.organization_id;

  const recentRows = await sql`
    SELECT created_at FROM verification_codes
    WHERE staff_id = ${staffId} AND purpose = ${purpose}
    ORDER BY created_at DESC LIMIT 1
  `;
  if (recentRows.length) {
    const lastCreated = new Date((recentRows[0] as any).created_at).getTime();
    const elapsed = Math.floor((Date.now() - lastCreated) / 1000);
    if (elapsed < OTP_RESEND_COOLDOWN_SECONDS) {
      return { success: false, error: `Please wait ${OTP_RESEND_COOLDOWN_SECONDS - elapsed} seconds before requesting a new code`, cooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS - elapsed };
    }
  }

  await sql`DELETE FROM verification_codes WHERE staff_id = ${staffId} AND purpose = ${purpose} AND used = FALSE`;

  const otp = generateOtp();
  const codeHash = sha256(otp);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  const expiresISO = expiresAt.toISOString();

  await sql`
    INSERT INTO verification_codes (staff_id, organization_id, code_hash, purpose, expires_at, max_attempts, ip_address)
    VALUES (${staffId}, ${orgId}, ${codeHash}, ${purpose}, ${expiresISO}, ${OTP_MAX_ATTEMPTS}, ${ip ?? null})
  `;

  const emailContent = otpEmail({
    staffName: staff.name,
    code: otp,
    purpose,
    expiresInMinutes: OTP_EXPIRY_MINUTES,
  });

  const result = await sendEmail({ to: staff.email, ...emailContent });

  await logEmail({
    organizationId: orgId, staffId, emailType: `otp_${purpose}`,
    recipientEmail: staff.email, subject: emailContent.subject,
    status: result.success ? 'sent' : 'failed', messageId: result.messageId,
    errorMessage: result.error,
  }).catch(() => {});

  if (!result.success) return { success: false, error: 'Failed to send verification email' };

  await logAuditEvent({
    organizationId: orgId, userId: staffId, userEmail: staff.email,
    actorRole: 'staff', action: `OTP_${purpose.toUpperCase()}_SENT`,
    targetType: 'staff', targetId: staffId, details: { purpose },
  }).catch(() => {});

  return { success: true };
}

export async function verifyOtp(opts: {
  staffId: string;
  code: string;
  purpose: string;
}): Promise<{ valid: boolean; error?: string }> {
  const sql = getSql();
  const { staffId, code, purpose } = opts;

  if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
    return { valid: false, error: 'Invalid verification code format' };
  }

  const codeHash = sha256(code);

  const rows = await sql`
    SELECT id, code_hash, used, used_at, expires_at, attempts, max_attempts
    FROM verification_codes
    WHERE staff_id = ${staffId} AND purpose = ${purpose}
    ORDER BY created_at DESC LIMIT 1
  `;

  if (!rows.length) return { valid: false, error: 'No verification code found. Please request a new one.' };
  const row = rows[0] as any;

  if (row.used) return { valid: false, error: 'This code has already been used' };
  if (new Date(row.expires_at).getTime() < Date.now()) return { valid: false, error: 'This code has expired' };
  if (row.attempts >= row.max_attempts) return { valid: false, error: 'Too many failed attempts. Please request a new code.' };

  if (row.code_hash !== codeHash) {
    await sql`UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ${row.id}`;
    const remaining = row.max_attempts - row.attempts - 1;
    return { valid: false, error: remaining > 0 ? `Invalid code. ${remaining} attempts remaining.` : 'Too many failed attempts. Please request a new code.' };
  }

  await sql`UPDATE verification_codes SET used = TRUE, used_at = NOW() WHERE id = ${row.id}`;
  return { valid: true };
}

export async function cleanupExpiredOtps(): Promise<number> {
  const sql = getSql();
  const result = await sql`DELETE FROM verification_codes WHERE expires_at < NOW() AND used = FALSE`;
  return (result as any).rowCount ?? 0;
}
