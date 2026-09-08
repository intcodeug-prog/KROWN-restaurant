import { NextRequest, NextResponse } from 'next/server';
import { extractTenantContext } from '@/lib/tenant';
import { hasPermission } from '@/lib/rbac';
import { generateAndSendOtp } from '@/lib/services/otp.service';

export async function POST(request: NextRequest) {
  const ctx = extractTenantContext(request);
  if (!ctx) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  try {
    const { staffId, purpose } = await request.json();
    if (!staffId || !purpose) return NextResponse.json({ error: 'Staff ID and purpose are required' }, { status: 400 });

    const validPurposes = ['email_verify', 'password_reset', 'pin_reset', 'new_device', 'mfa_setup'];
    if (!validPurposes.includes(purpose)) return NextResponse.json({ error: 'Invalid purpose' }, { status: 400 });

    const isSelf = ctx.userId === staffId;
    const isSuperAdmin = ctx.role === 'super_admin' || ctx.isSuperAdmin;
    if (!isSelf && !isSuperAdmin && !hasPermission(ctx.role, 'staff:reset_password')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

    const result = await generateAndSendOtp({
      staffId, purpose,
      organizationId: ctx.organizationId,
      ip,
    });

    if (!result.success) return NextResponse.json({ error: result.error }, { status: 429 });

    return NextResponse.json({ success: true, message: 'Verification code sent' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to send verification code' }, { status: 500 });
  }
}
