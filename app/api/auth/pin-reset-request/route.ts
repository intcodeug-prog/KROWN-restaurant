import { NextRequest, NextResponse } from 'next/server';
import { getSql } from '@/lib/neon-server';
import { generateAndSendOtp } from '@/lib/services/otp.service';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email address is required' }, { status: 400 });
    }

    const sql = getSql();
    const cleanEmail = email.trim().toLowerCase();

    const staffRows = await sql`SELECT id, name, email, organization_id, status
      FROM staff WHERE lower(email) = ${cleanEmail} AND status = 'active' LIMIT 1`;
    if (!staffRows.length) {
      return NextResponse.json({ success: true, message: 'If an account exists, a reset code has been sent.' });
    }
    const staff = staffRows[0] as any;

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

    const result = await generateAndSendOtp({
      staffId: staff.id,
      purpose: 'pin_reset',
      organizationId: staff.organization_id,
      ip,
    });

    if (!result.success) {
      return NextResponse.json({ success: true, message: 'If an account exists, a reset code has been sent.' });
    }

    return NextResponse.json({ success: true, message: 'Verification code sent to your email.', staffId: staff.id });
  } catch (e: any) {
    return NextResponse.json({ success: true, message: 'If an account exists, a reset code has been sent.' });
  }
}
