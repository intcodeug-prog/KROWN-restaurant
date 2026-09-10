import { NextRequest, NextResponse } from 'next/server';
import { extractTenantContext } from '@/lib/tenant';
import { getSql } from '@/lib/neon-server';
import { logAuditEvent } from '@/lib/audit';

const ALLOWED_STATUSES = new Set(['active', 'suspended', 'inactive', 'on_leave', 'banned']);

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const ctx = extractTenantContext(request);
  if (!ctx || ctx.role !== 'super_admin') {
    return NextResponse.json({ error: 'Super Admin access required' }, { status: 403 });
  }

  const userId = String(params.id || '').trim();
  if (!userId || userId.length > 128) return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });

  try {
    const body = await request.json();
    const status = String(body.status || '').trim().toLowerCase();
    if (!ALLOWED_STATUSES.has(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });

    const sql = getSql();
    const staffRows = await sql`
      SELECT id, name, email, organization_id, status
      FROM staff
      WHERE id = ${userId}
      LIMIT 1
    `;
    if (staffRows.length === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const staff = staffRows[0] as any;

    if (staff.role === 'super_admin' && status !== 'active') {
      return NextResponse.json({ error: 'Platform Super Admin accounts cannot be disabled here' }, { status: 400 });
    }

    const updated = await sql`
      UPDATE staff
      SET status = ${status}, updated_at = NOW()
      WHERE id = ${userId}
      RETURNING id, name, email, role, status, organization_id, assigned_branch_id
    `;

    if (status !== 'active') {
      await sql`
        UPDATE staff_sessions
        SET status='revoked', revoked_at=NOW(), revoked_reason=${status}, last_active_at=NOW()
        WHERE staff_id=${userId} AND status='active'
      `;
    } else {
      // A restored account starts with no stale PIN lockout or session state.
      await sql`DELETE FROM staff_pin_lockouts WHERE staff_id=${userId}`;
    }

    await logAuditEvent({
      organizationId: staff.organization_id,
      userId: ctx.userId,
      userEmail: 'super_admin',
      actorRole: 'super_admin',
      action: `SUPER_ADMIN_USER_STATUS_${status.toUpperCase()}`,
      targetType: 'staff',
      targetId: userId,
      details: { previousStatus: staff.status, newStatus: status, userEmail: staff.email },
    });

    return NextResponse.json({ success: true, status, data: updated[0] });
  } catch (error: unknown) {
    console.error('[SuperAdminUserStatus] Unexpected server error:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Failed to update user status' }, { status: 500 });
  }
}
