import crypto from 'crypto';
import { getSql } from '@/lib/neon-server';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { sendEmail, buildPasswordResetEmail, APP_URL } from './email.service';
import { logAuditEvent } from '@/lib/audit';

const TOKEN_EXPIRY_HOURS = 24;

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export async function createPasswordResetToken(staffId: string): Promise<{ token: string; expiresAt: Date }> {
  const sql = getSql();
  const rawToken = generateToken();
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  const staffRows = await sql`SELECT organization_id FROM staff WHERE id = ${staffId} LIMIT 1`;
  if (!staffRows.length) throw new Error('Staff member not found');
  const orgId = (staffRows[0] as any).organization_id;

  await sql`DELETE FROM password_resets WHERE staff_id = ${staffId} AND used_at IS NULL`;

  const expiresISO = expiresAt.toISOString();
  await sql`INSERT INTO password_resets (staff_id, organization_id, token_hash, expires_at) VALUES (${staffId}, ${orgId}, ${tokenHash}, ${expiresISO})`;

  return { token: rawToken, expiresAt };
}

export async function verifyPasswordResetToken(rawToken: string): Promise<{ valid: boolean; staffId?: string; orgId?: string; error?: string }> {
  const sql = getSql();
  const tokenHash = sha256(rawToken);

  const rows = await sql`
    SELECT id, staff_id, organization_id, expires_at, used_at
    FROM password_resets
    WHERE token_hash = ${tokenHash}
    LIMIT 1
  `;

  if (!rows.length) return { valid: false, error: 'Invalid or expired reset link' };

  const row = rows[0] as any;

  if (row.used_at) return { valid: false, error: 'This reset link has already been used' };

  if (new Date(row.expires_at).getTime() < Date.now()) return { valid: false, error: 'This reset link has expired' };

  return { valid: true, staffId: row.staff_id, orgId: row.organization_id };
}

export async function completePasswordReset(rawToken: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  const sql = getSql();

  if (!newPassword || newPassword.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters' };
  }

  const verification = await verifyPasswordResetToken(rawToken);
  if (!verification.valid) return { success: false, error: verification.error };

  const { staffId, orgId } = verification;
  const tokenHash = sha256(rawToken);
  const hashedPassword = await hashPassword(newPassword);

  await sql`UPDATE staff SET password_argon2 = ${hashedPassword}, password_hash = NULL, updated_at = NOW() WHERE id = ${staffId}`;
  await sql`UPDATE password_resets SET used_at = NOW() WHERE token_hash = ${tokenHash}`;
  await sql`DELETE FROM staff_sessions WHERE staff_id = ${staffId} AND status = 'active'`;

  await logAuditEvent({
    organizationId: orgId!,
    userId: staffId!,
    userEmail: 'self-reset',
    actorRole: 'staff',
    action: 'PASSWORD_RESET_COMPLETED',
    targetType: 'staff',
    targetId: staffId!,
    details: { method: 'email_link' },
  }).catch(() => {});

  return { success: true };
}

export async function sendPasswordResetEmail(staffId: string, senderName: string): Promise<{ success: boolean; error?: string }> {
  const sql = getSql();

  const rows = await sql`SELECT id, name, email, organization_id FROM staff WHERE id = ${staffId} AND status = 'active' LIMIT 1`;
  if (!rows.length) return { success: false, error: 'Staff member not found or inactive' };

  const staff = rows[0] as any;
  const { token, expiresAt } = await createPasswordResetToken(staffId);

  const resetUrl = `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const emailContent = buildPasswordResetEmail({
    staffName: staff.name,
    resetUrl,
    expiresInHours: TOKEN_EXPIRY_HOURS,
    senderName,
  });

  const result = await sendEmail({
    to: staff.email,
    ...emailContent,
  });

  if (!result.success) return { success: false, error: result.error || 'Failed to send email' };

  await logAuditEvent({
    organizationId: staff.organization_id,
    userId: staffId,
    userEmail: staff.email,
    actorRole: 'staff',
    action: 'PASSWORD_RESET_EMAIL_SENT',
    targetType: 'staff',
    targetId: staffId,
    details: { senderName, expiresAt: expiresAt.toISOString() },
  }).catch(() => {});

  return { success: true };
}
