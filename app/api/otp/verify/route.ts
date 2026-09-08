import { NextRequest, NextResponse } from 'next/server';
import { extractTenantContext } from '@/lib/tenant';
import { verifyOtp } from '@/lib/services/otp.service';

export async function POST(request: NextRequest) {
  const ctx = extractTenantContext(request);
  if (!ctx) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  try {
    const { staffId, code, purpose } = await request.json();
    if (!staffId || !code || !purpose) return NextResponse.json({ error: 'Staff ID, code, and purpose are required' }, { status: 400 });

    const result = await verifyOtp({ staffId, code, purpose });
    if (!result.valid) return NextResponse.json({ success: false, error: result.error }, { status: 400 });

    return NextResponse.json({ success: true, message: 'Verification successful' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to verify code' }, { status: 500 });
  }
}
