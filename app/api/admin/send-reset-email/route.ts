import { NextRequest, NextResponse } from 'next/server';
import { extractTenantContext } from '@/lib/tenant';
import { getSql } from '@/lib/neon-server';
import { hasPermission, isPlatformRole } from '@/lib/rbac';
import { sendPasswordResetEmail } from '@/lib/services/password-reset.service';
import { logAuditEvent } from '@/lib/audit';

export async function POST(request: NextRequest) {
  const ctx = extractTenantContext(request);
  if (!ctx) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const isSuperAdmin = ctx.role === 'super_admin' || ctx.isSuperAdmin;
  if (!isSuperAdmin && !hasPermission(ctx.role, 'staff:reset_password')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  try {
    const { staffId } = await request.json();
    if (!staffId) return NextResponse.json({ error: 'Staff ID is required' }, { status: 400 });

    const sql = getSql();
    let staffRows: any[];
    if (isSuperAdmin) {
      staffRows = await sql`SELECT id, name, email, organization_id FROM staff WHERE id = ${staffId} AND status = 'active' LIMIT 1`;
    } else {
      staffRows = await sql`SELECT id, name, email, organization_id FROM staff WHERE id = ${staffId} AND status = 'active' AND organization_id = ${ctx.organizationId} LIMIT 1`;
    }
    if (!staffRows.length) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });

    const staff = staffRows[0] as any;

    // Resolve sender name from super_admins or staff table
    let senderName = 'Administrator';
    if (isSuperAdmin) {
      const adminRows = await sql`SELECT name FROM super_admins WHERE id = ${ctx.userId} LIMIT 1`;
      if (adminRows.length) senderName = (adminRows[0] as any).name;
    } else {
      const senderRows = await sql`SELECT name FROM staff WHERE id = ${ctx.userId} LIMIT 1`;
      if (senderRows.length) senderName = (senderRows[0] as any).name;
    }

    const result = await sendPasswordResetEmail(staffId, senderName);

    if (!result.success) return NextResponse.json({ error: result.error || 'Failed to send reset email' }, { status: 500 });

    await logAuditEvent({
      organizationId: staff.organization_id,
      userId: ctx.userId,
      userEmail: staff.email,
      actorRole: ctx.role,
      action: 'PASSWORD_RESET_EMAIL_SENT',
      targetType: 'staff',
      targetId: staffId,
      details: { senderName, targetEmail: staff.email },
    }).catch(() => {});

    return NextResponse.json({ success: true, message: `Reset email sent to ${staff.email}` });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to send reset email' }, { status: 500 });
  }
}
