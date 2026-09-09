import { NextRequest, NextResponse } from 'next/server';
import { extractTenantContext } from '@/lib/tenant';
import { getSql } from '@/lib/neon-server';
import { hashPassword } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';

const MIN_PASSWORD_LENGTH = 5;

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const ctx = extractTenantContext(request);
  if (!ctx || ctx.role !== 'super_admin') {
    return NextResponse.json({ error: 'Super Admin access required' }, { status: 403 });
  }

  const sql = getSql();
  const userId = params.id;

  try {
    const { password } = await request.json();
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json({ error: 'Password must be at least 5 characters long' }, { status: 400 });
    }

    const staffRows = await sql`SELECT id, name, email, organization_id FROM staff WHERE id = ${userId} LIMIT 1`;
    if (staffRows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const staff = staffRows[0];

    const argon2Hash = await hashPassword(password);

    await sql`
      UPDATE staff
      SET
        password_hash = ${argon2Hash},
        password_argon2 = ${argon2Hash},
        updated_at = NOW()
      WHERE id = ${userId}
    `;

    await sql`DELETE FROM staff_sessions WHERE staff_id = ${userId}`;

    await logAuditEvent({
      organizationId: staff.organization_id,
      userId: ctx.userId,
      userEmail: ctx.userId,
      actorRole: 'super_admin',
      action: 'SUPER_ADMIN_PASSWORD_RESET',
      targetType: 'staff',
      targetId: userId,
      details: { targetEmail: staff.email },
    });

    return NextResponse.json({ success: true, message: 'Password reset successfully' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to reset password' }, { status: 500 });
  }
}
