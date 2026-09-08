import { NextRequest, NextResponse } from 'next/server';
import { getSql } from '@/lib/neon-server';
import { extractTenantContext, setTenantContext } from '@/lib/tenant';
import { verifyPassword } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';

export async function POST(request: NextRequest) {
  const ctx = extractTenantContext(request);
  if (!ctx) {
    return NextResponse.json({ data: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!hasPermission(ctx.role, 'staff:view') && !hasPermission(ctx.role, 'orders:create')) {
    return NextResponse.json({ data: false, error: 'Insufficient permissions' }, { status: 403 });
  }

  try {
    const { staff_id, pin_attempt } = await request.json();
    const sql = getSql();
    await setTenantContext(sql, ctx.organizationId);

    if (!staff_id || !pin_attempt) {
      return NextResponse.json({ data: false, error: 'staff_id and pin_attempt are required' }, { status: 400 });
    }

    const v_now = Date.now();

    // Check lockout status (tenant-scoped)
    const lockoutRows = await sql(
      'SELECT failed_attempts, locked_until FROM staff_pin_lockouts WHERE staff_id = $1 AND organization_id = $2',
      [staff_id, ctx.organizationId]
    );

    if (lockoutRows.length > 0) {
      const lockout = lockoutRows[0];
      if (lockout.locked_until > v_now) {
        return NextResponse.json({ data: false });
      }
    }

    // Get stored PIN — tenant-scoped
    const staffRows = await sql(
      'SELECT pin_argon2, pin_code FROM staff WHERE id = $1 AND organization_id = $2',
      [staff_id, ctx.organizationId]
    );

    if (staffRows.length === 0) {
      return NextResponse.json({ data: false });
    }

    const staff = staffRows[0];
    let pinValid = false;

    // Prefer Argon2id hash if available
    if (staff.pin_argon2) {
      pinValid = await verifyPassword(staff.pin_argon2, pin_attempt);
    } else if (staff.pin_code) {
      // Legacy plaintext comparison (fallback)
      pinValid = staff.pin_code === pin_attempt;
    }

    if (!pinValid) {
      // Increment failed attempts
      let v_attempts = 1;
      let v_locked_until = 0;

      if (lockoutRows.length > 0) {
        v_attempts = (lockoutRows[0].failed_attempts || 0) + 1;
      }

      if (v_attempts >= 5) {
        v_locked_until = v_now + 60000; // 1 minute lockout
      }

      await sql(
        `INSERT INTO staff_pin_lockouts (staff_id, failed_attempts, locked_until, organization_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (staff_id) DO UPDATE SET failed_attempts = $2, locked_until = $3`,
        [staff_id, v_attempts, v_locked_until, ctx.organizationId]
      );

      return NextResponse.json({ data: false });
    }

    // PIN is correct — clear lockout
    await sql('DELETE FROM staff_pin_lockouts WHERE staff_id = $1 AND organization_id = $2', [staff_id, ctx.organizationId]);
    return NextResponse.json({ data: true });
  } catch (e: any) {
    return NextResponse.json({ data: false, error: e.message }, { status: 500 });
  }
}
