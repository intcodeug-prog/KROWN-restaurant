import { timingSafeEqual } from 'node:crypto';
import { getSql } from '@/lib/neon-server';
import { createToken, hashPassword, verifyPassword, type AuthResult } from '@/lib/auth';

export interface PinDeviceContext {
  deviceId: string;
  organizationId: string;
  branchId: string;
}

function staffPayload(staff: any) {
  return {
    id: staff.id, name: staff.name, email: staff.email, role: staff.role,
    branch: staff.branch || '', assignedBranchId: staff.assigned_branch_id || null,
    assigned_branch_id: staff.assigned_branch_id || null,
    organizationId: staff.organization_id, organization_id: staff.organization_id,
    status: staff.status || 'active',
  };
}

async function createSession(staff: any, deviceId: string) {
  const sql = getSql();
  const token = await createToken({ sub: staff.id, org: staff.organization_id, role: staff.role, branch: staff.assigned_branch_id || null, device: deviceId, email: staff.email });
  await sql`
    INSERT INTO staff_sessions
      (organization_id,staff_id,device_id,token_hash,role,permissions,status,expires_at,last_active_at)
    VALUES
      (${staff.organization_id},${staff.id},${deviceId},encode(sha256(convert_to(${token}, 'UTF8')),'hex'),${staff.role},'[]'::jsonb,'active',${new Date(Date.now() + 24 * 60 * 60 * 1000)},NOW())
  `;
  return { token, staff: staffPayload(staff) };
}

function safeLegacyPinMatch(stored: unknown, supplied: string): boolean {
  if (typeof stored !== 'string' || !/^\d{4,6}$/.test(stored)) return false;
  const a = Buffer.from(stored, 'utf8'); const b = Buffer.from(supplied, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** PIN authentication is always scoped to the cryptographically verified device's exact tenant and branch. */
export async function authenticateByPinOnly(pin: string, deviceContext?: PinDeviceContext): Promise<AuthResult> {
  const cleanPin = String(pin || '').trim();
  if (!/^\d{4,6}$/.test(cleanPin)) return { success: false, error: 'Enter your 4–6 digit PIN' };
  if (!deviceContext?.deviceId || !deviceContext.organizationId || !deviceContext.branchId) {
    return { success: false, error: 'This computer is not activated. Activate this device before signing in.' };
  }

  const sql = getSql();
  const devices = await sql`
    SELECT id,organization_id,branch_id,status,trust_status,allowed_roles
    FROM devices
    WHERE id=${deviceContext.deviceId}
      AND organization_id=${deviceContext.organizationId}
      AND branch_id=${deviceContext.branchId}
    LIMIT 1
  `;
  if (!devices.length) return { success: false, error: 'This device is not registered to this restaurant branch.' };
  const device = devices[0] as any;
  if (String(device.status) !== 'active' || String(device.trust_status) === 'revoked') {
    return { success: false, error: 'This device is not active. Activate it before signing in.' };
  }

  const allowedRoles = Array.isArray(device.allowed_roles)
    ? device.allowed_roles.map((r: unknown) => String(r).trim().toLowerCase().replace(/\s+/g, '_')).filter(Boolean)
    : [];

  const candidates = await sql`
    SELECT id,name,email,role,branch,assigned_branch_id,organization_id,pin_argon2,pin_code,status
    FROM staff
    WHERE organization_id=${device.organization_id}
      AND assigned_branch_id=${device.branch_id}
      AND status='active'
    ORDER BY id
  `;

  const matches: any[] = [];
  for (const staff of candidates as any[]) {
    const role = String(staff.role || '').trim().toLowerCase().replace(/\s+/g, '_');
    if (allowedRoles.length && !allowedRoles.includes(role)) continue;

    let valid = false;
    if (typeof staff.pin_argon2 === 'string' && staff.pin_argon2) valid = await verifyPassword(staff.pin_argon2, cleanPin);
    if (!valid && safeLegacyPinMatch(staff.pin_code, cleanPin)) {
      valid = true;
      const upgradedHash = await hashPassword(cleanPin);
      await sql`UPDATE staff SET pin_argon2=${upgradedHash}, pin_code=NULL WHERE id=${staff.id} AND pin_argon2 IS NULL`;
    }
    if (valid) matches.push(staff);
    if (matches.length > 1) break;
  }

  if (matches.length === 0) return { success: false, error: 'Invalid PIN for this activated restaurant device.' };
  if (matches.length > 1) return { success: false, error: 'This PIN is assigned to more than one permitted account. Ask the KROWN team to resolve it.' };

  const staff = matches[0];
  return { success: true, ...(await createSession(staff, device.id)) };
}
