import { timingSafeEqual } from 'node:crypto';
import { getSql } from '@/lib/neon-server';
import { createToken, hashPassword, verifyPassword, type AuthResult } from '@/lib/auth';

const ADMIN_ROLES = new Set(['super_admin']);

export interface PinDeviceContext {
  deviceId: string;
  organizationId: string;
  branchId: string;
}

function staffPayload(staff: any) {
  return {
    id: staff.id,
    name: staff.name,
    email: staff.email,
    role: staff.role,
    branch: staff.branch || '',
    assignedBranchId: staff.assigned_branch_id || null,
    assigned_branch_id: staff.assigned_branch_id || null,
    organizationId: staff.organization_id,
    organization_id: staff.organization_id,
    status: staff.status || 'active',
  };
}

async function createSession(staff: any, deviceId: string | null) {
  const sql = getSql();
  const token = await createToken({
    sub: staff.id,
    org: staff.organization_id,
    role: staff.role,
    branch: staff.assigned_branch_id || null,
    email: staff.email,
  });

  await sql`
    INSERT INTO staff_sessions
      (organization_id,staff_id,device_id,token_hash,role,permissions,status,expires_at,last_active_at)
    VALUES
      (${staff.organization_id},${staff.id},${deviceId},
       encode(sha256(convert_to(${token}, 'UTF8')),'hex'),
       ${staff.role},'[]'::jsonb,'active',
       ${new Date(Date.now() + 24 * 60 * 60 * 1000)},NOW())
  `;

  return { token, staff: staffPayload(staff) };
}

function safeLegacyPinMatch(stored: unknown, supplied: string): boolean {
  if (typeof stored !== 'string' || !/^\d{4,6}$/.test(stored)) return false;
  const a = Buffer.from(stored, 'utf8');
  const b = Buffer.from(supplied, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * PIN-first authentication. No username/email is required at the POS.
 * Device-bound staff are narrowed to the enrolled device's restaurant/branch.
 * Admin roles are deliberately device-independent.
 *
 * Existing installations may still have a legacy numeric pin_code. A
 * successful legacy PIN login is immediately upgraded to Argon2id so the
 * plaintext value is no longer needed for subsequent logins.
 */
export async function authenticateByPinOnly(
  pin: string,
  deviceContext?: PinDeviceContext
): Promise<AuthResult> {
  const cleanPin = String(pin || '').trim();
  if (!/^\d{4,6}$/.test(cleanPin)) return { success: false, error: 'Enter your 4–6 digit PIN' };

  const sql = getSql();
  let candidates: any[];

  if (deviceContext) {
    const devices = await sql`
      SELECT id,organization_id,branch_id,status,allowed_roles
      FROM devices
      WHERE id=${deviceContext.deviceId}
        AND organization_id=${deviceContext.organizationId}
        AND branch_id=${deviceContext.branchId}
      LIMIT 1
    `;
    if (!devices.length || String((devices[0] as any).status) !== 'active') {
      return { success: false, error: 'This device is not active. Activate it before signing in.' };
    }

    const allowedRoles = Array.isArray((devices[0] as any).allowed_roles)
      ? (devices[0] as any).allowed_roles.map((r: unknown) => String(r).trim().toLowerCase())
      : [];

    candidates = await sql`
      SELECT id,name,email,role,branch,assigned_branch_id,organization_id,pin_argon2,pin_code,status
      FROM staff
      WHERE organization_id=${deviceContext.organizationId}
        AND assigned_branch_id=${deviceContext.branchId}
        AND status='active'
      ORDER BY id
    `;

    candidates = candidates.filter((staff: any) => {
      const role = String(staff.role || '').trim().toLowerCase();
      if (ADMIN_ROLES.has(role)) return false;
      return !allowedRoles.length || allowedRoles.includes(role);
    });
  } else {
    candidates = await sql`
      SELECT id,name,email,role,branch,assigned_branch_id,organization_id,pin_argon2,pin_code,status
      FROM staff
      WHERE status='active'
      ORDER BY id
    `;
    candidates = candidates.filter((staff: any) => ADMIN_ROLES.has(String(staff.role || '').trim().toLowerCase()));
  }

  const matches: any[] = [];
  for (const staff of candidates as any[]) {
    let valid = false;
    if (typeof staff.pin_argon2 === 'string' && staff.pin_argon2) {
      valid = await verifyPassword(staff.pin_argon2, cleanPin);
    }
    if (!valid && safeLegacyPinMatch(staff.pin_code, cleanPin)) {
      valid = true;
      // Upgrade the legacy numeric PIN to a strong Argon2id hash immediately.
      const upgradedHash = await hashPassword(cleanPin);
      await sql`UPDATE staff SET pin_argon2=${upgradedHash} WHERE id=${staff.id} AND pin_argon2 IS NULL`;
    }
    if (valid) matches.push(staff);
    if (matches.length > 1) break;
  }

  if (matches.length === 0) return { success: false, error: 'Invalid PIN' };
  if (matches.length > 1) {
    return {
      success: false,
      error: 'This PIN is assigned to more than one account. Ask the KROWN team to resolve it.',
    };
  }

  const staff = matches[0];
  const result = await createSession(staff, deviceContext?.deviceId || null);
  return { success: true, ...result };
}
