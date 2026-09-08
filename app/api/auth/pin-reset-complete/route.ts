import { NextRequest, NextResponse } from 'next/server';
import { getSql } from '@/lib/neon-server';
import { hashPassword } from '@/lib/auth';
import { verifyOtp } from '@/lib/services/otp.service';
import { logAuditEvent } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    const { staffId, code, newPin } = await request.json();

    if (!staffId || !code || !newPin) {
      return NextResponse.json({ error: 'Staff ID, verification code, and new PIN are required' }, { status: 400 });
    }

    const cleanPin = String(newPin).trim();
    if (!/^\d{4,8}$/.test(cleanPin)) {
      return NextResponse.json({ error: 'PIN must be 4-8 digits' }, { status: 400 });
    }

    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Verification code must be 6 digits' }, { status: 400 });
    }

    const result = await verifyOtp({ staffId, code, purpose: 'pin_reset' });
    if (!result.valid) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    const sql = getSql();
    const staffRows = await sql`SELECT id, email, organization_id FROM staff WHERE id = ${staffId} AND status = 'active' LIMIT 1`;
    if (!staffRows.length) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
    }
    const staff = staffRows[0] as any;

    const hashedPin = await hashPassword(cleanPin);
    await sql`UPDATE staff SET pin_argon2 = ${hashedPin}, pin_code = NULL, updated_at = NOW() WHERE id = ${staffId}`;

    await logAuditEvent({
      organizationId: staff.organization_id,
      userId: staffId,
      userEmail: staff.email,
      actorRole: 'staff',
      action: 'PIN_RESET_COMPLETED',
      targetType: 'staff',
      targetId: staffId,
      details: { method: 'email_otp' },
    }).catch(() => {});

    return NextResponse.json({ success: true, message: 'PIN has been reset successfully. You can now log in with your new PIN.' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to reset PIN' }, { status: 500 });
  }
}
