import { NextRequest, NextResponse } from 'next/server';
import { extractVerifiedTenantContext } from '@/lib/tenant';
import { getSql } from '@/lib/neon-server';
import { getDevice, updateDevice, revokeDevice } from '@/lib/services/device.service';
import { hasPermission } from '@/lib/rbac';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await extractVerifiedTenantContext(request);
    if (!ctx) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(ctx.role, 'devices:read')) return NextResponse.json({ data: null, error: 'Insufficient permissions' }, { status: 403 });
    const { id } = await params;
    const sql = getSql();
    const device = ctx.isSuperAdmin
      ? (await sql`SELECT * FROM devices WHERE id=${id} LIMIT 1`)[0]
      : await getDevice(ctx, id);
    if (!device) return NextResponse.json({ data: null, error: 'Device not found' }, { status: 404 });
    return NextResponse.json({ data: device });
  } catch (e:any) { return NextResponse.json({ data:null, error:e?.message||'Internal server error' }, { status:500 }); }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await extractVerifiedTenantContext(request);
    if (!ctx) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(ctx.role, 'devices:update')) return NextResponse.json({ data: null, error: 'Insufficient permissions' }, { status: 403 });
    const { id } = await params;
    const body = await request.json();
    if (ctx.isSuperAdmin) {
      const sql = getSql();
      const name = body.deviceName === undefined ? null : String(body.deviceName).trim().slice(0, 120);
      const type = body.deviceType === undefined ? null : String(body.deviceType).trim();
      const roles = body.allowedRoles === undefined ? null : Array.isArray(body.allowedRoles) ? body.allowedRoles.map((r: unknown) => String(r).trim().toLowerCase().replace(/\s+/g, '_')).slice(0, 20) : null;
      const updated = await sql`
        UPDATE devices
        SET device_name=COALESCE(${name},device_name), device_type=COALESCE(${type},device_type),
            allowed_roles=COALESCE(${roles ? JSON.stringify(roles) : null}::jsonb,allowed_roles), updated_at=NOW()
        WHERE id=${id}
        RETURNING *
      `;
      if (!updated.length) return NextResponse.json({ data:null, error:'Device not found' }, { status:404 });
      return NextResponse.json({ data:updated[0] });
    }
    const device = await updateDevice(ctx, id, { device_name: body.deviceName, device_type: body.deviceType, allowed_roles: body.allowedRoles });
    return NextResponse.json({ data: device });
  } catch (e:any) { return NextResponse.json({ data:null, error:e?.message||'Internal server error' }, { status:500 }); }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await extractVerifiedTenantContext(request);
    if (!ctx) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(ctx.role, 'devices:delete')) return NextResponse.json({ data: null, error: 'Insufficient permissions' }, { status: 403 });
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const reason = String(body.reason || 'device_deleted').slice(0, 240);
    const sql = getSql();

    if (ctx.isSuperAdmin) {
      const existing = await sql`SELECT id,organization_id,status FROM devices WHERE id=${id} LIMIT 1`;
      if (!existing.length) return NextResponse.json({ data:null, error:'Device not found' }, { status:404 });
      // Soft-delete/revoke rather than physically removing the security record.
      // This preserves the audit trail and guarantees the old credential cannot authenticate.
      const updated = await sql`
        UPDATE devices SET status='revoked', trust_status='revoked', revoked_at=NOW(), revoked_by=${ctx.userId},
          decommissioned_at=NOW(), decommissioned_by=${ctx.userId}, decommissioned_reason=${reason}, updated_at=NOW()
        WHERE id=${id}
        RETURNING *
      `;
      await sql`UPDATE staff_sessions SET status='revoked', revoked_at=NOW(), revoked_reason=${reason} WHERE device_id=${id} AND status='active'`;
      return NextResponse.json({ data: updated[0], deleted: true });
    }

    const device = await revokeDevice(ctx, id, reason);
    await sql`UPDATE staff_sessions SET status='revoked', revoked_at=NOW(), revoked_reason=${reason}, last_active_at=NOW() WHERE device_id=${id} AND organization_id=${ctx.organizationId} AND status='active'`;
    return NextResponse.json({ data: device, deleted: true });
  } catch (e:any) { return NextResponse.json({ data:null, error:e?.message||'Internal server error' }, { status:500 }); }
}
