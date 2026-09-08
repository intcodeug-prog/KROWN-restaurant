import { randomInt, createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { extractVerifiedTenantContext } from '@/lib/tenant';
import { getSql } from '@/lib/neon-server';
import { assertBranchAccess } from '@/lib/access-control';
import { hasPermission } from '@/lib/rbac';

const ALLOWED_DEVICE_TYPES = new Set(['pos', 'kitchen', 'waiter_tablet', 'manager_desk', 'admin_desk', 'general']);
function normalizeDeviceType(value: string): string {
  const aliases: Record<string, string> = { pos_terminal: 'pos', kitchen_display: 'kitchen', tablet: 'waiter_tablet', mobile: 'general', desktop: 'manager_desk' };
  return aliases[value] || value;
}
const ALLOWED_ROLES = new Set(['cashier', 'waiter', 'senior_waiter', 'head_chef', 'chef', 'kitchen_staff', 'branch_manager', 'manager', 'restaurant_admin', 'admin', 'super_admin']);
function activationPin() { return String(randomInt(10_000_000, 100_000_000)); }

export async function POST(request: NextRequest) {
  try {
    const ctx = await extractVerifiedTenantContext(request);
    if (!ctx) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(ctx.role, 'devices:create')) return NextResponse.json({ data: null, error: 'Insufficient permissions' }, { status: 403 });

    const body = await request.json();
    const requestedOrganizationId = String(body.organizationId || '').trim();
    let branchId = String(body.branchId || ctx.branchId || '').trim();
    const deviceType = normalizeDeviceType(String(body.deviceType || '').trim().toLowerCase());
    const deviceName = String(body.deviceName || '').trim();
    const allowedRoles = Array.isArray(body.allowedRoles)
      ? body.allowedRoles.map((r: unknown) => String(r).trim().toLowerCase().replace(/\s+/g, '_')).filter((r: string) => ALLOWED_ROLES.has(r)).slice(0, 20)
      : [];

    const sql = getSql();
    if (!branchId && ctx.isSuperAdmin && requestedOrganizationId) {
      const firstBranch = await sql`SELECT id FROM branches WHERE organization_id=${requestedOrganizationId} AND (status IS NULL OR status NOT IN ('deleted')) ORDER BY created_at ASC LIMIT 1`;
      branchId = String(firstBranch[0]?.id || '');
    }
    if (!branchId || !deviceType || !deviceName) return NextResponse.json({ data: null, error: 'Restaurant branch, device type and device name are required' }, { status: 400 });
    if (!ALLOWED_DEVICE_TYPES.has(deviceType)) return NextResponse.json({ data: null, error: 'Unsupported device type' }, { status: 400 });
    if (deviceName.length > 120) return NextResponse.json({ data: null, error: 'Device name is too long' }, { status: 400 });
    if (allowedRoles.length === 0) return NextResponse.json({ data: null, error: 'Select at least one staff role for this device' }, { status: 400 });

    await assertBranchAccess(ctx, branchId);
    const branch = await sql`SELECT id,organization_id,name FROM branches WHERE id=${branchId} LIMIT 1`;
    if (!branch.length || (!ctx.isSuperAdmin && (branch[0] as any).organization_id !== ctx.organizationId)) return NextResponse.json({ data: null, error: 'Branch not found' }, { status: 404 });

    const organizationId = (branch[0] as any).organization_id;
    // device_enrollment_tokens.created_by references staff.id. A platform super-admin
    // is stored in super_admins, so their platform UUID cannot be inserted directly.
    // Attribute the token to the restaurant's active admin/manager, which also keeps
    // the existing FK and audit model intact. Restaurant admins use their own staff id.
    let createdBy = ctx.userId;
    const creator = await sql`SELECT id FROM staff WHERE id=${ctx.userId} AND organization_id=${organizationId} AND status='active' LIMIT 1`;
    if (!creator.length && ctx.isSuperAdmin) {
      const restaurantCreator = await sql`
        SELECT id FROM staff
        WHERE organization_id=${organizationId} AND status='active'
          AND replace(lower(role), ' ', '_') IN ('restaurant_admin','admin','branch_manager','manager')
        ORDER BY CASE WHEN replace(lower(role), ' ', '_') IN ('restaurant_admin','admin') THEN 0 ELSE 1 END, created_at ASC
        LIMIT 1
      `;
      if (!restaurantCreator.length) {
        return NextResponse.json({ data: null, error: 'This restaurant has no active admin or manager account. Add a Restaurant Admin or Manager first, then register the device.' }, { status: 409 });
      }
      createdBy = String((restaurantCreator[0] as any).id);
    }

    const token = activationPin();
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await sql`
      INSERT INTO device_enrollment_tokens
        (organization_id, branch_id, token_hash, device_type, device_name, allowed_roles, used, expires_at, created_by, created_at)
      VALUES
        (${organizationId}, ${branchId}, ${tokenHash}, ${deviceType}, ${deviceName}, ${JSON.stringify(allowedRoles)}::jsonb, false, ${expiresAt}, ${createdBy}, NOW())
    `;

    return NextResponse.json({ data: { activationPin: token, token, branchId, organizationId, branchName: (branch[0] as any).name, deviceType, deviceName, allowedRoles, expiresAt, expiresInSeconds: 600, qrPayload: `KROWN-ACTIVATE:${token}` } }, { status: 201 });
  } catch (e: any) {
    const message = e?.message || 'Unable to create device activation';
    const status = /Forbidden|insufficient/i.test(message) ? 403 : 400;
    return NextResponse.json({ data: null, error: message }, { status });
  }
}
