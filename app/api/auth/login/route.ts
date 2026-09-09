import { NextRequest, NextResponse } from 'next/server';
import { authenticateStaff, authenticateSuperAdmin } from '@/lib/auth';
import { verifyDeviceChallenge } from '@/lib/services/device-auth.service';

function requestIp(request: NextRequest) { return (request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '').slice(0, 120) || null; }

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;
    if (!email || !password) return NextResponse.json({ data: null, error: 'Email and password are required' }, { status: 400 });
    const normalizedEmail = String(email).trim().toLowerCase();

    const superAdminResult = await authenticateSuperAdmin(normalizedEmail, String(password));
    if (superAdminResult.success && superAdminResult.token && superAdminResult.staff) {
      const response = NextResponse.json({ data: { token: superAdminResult.token, staff: superAdminResult.staff } });
      response.cookies.set('krown_session', superAdminResult.token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 24, path: '/' });
      return response;
    }

    // Restaurant Admin is intentionally device-independent: authenticate directly first.
    // Other staff roles fall through to the registered-device challenge.
    const directStaffResult = await authenticateStaff(normalizedEmail, String(password));
    if (directStaffResult.success && directStaffResult.token && directStaffResult.staff) {
      const response = NextResponse.json({ data: { token: directStaffResult.token, staff: directStaffResult.staff } });
      response.cookies.set('krown_session', directStaffResult.token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 24, path: '/' });
      return response;
    }
    if (directStaffResult.error !== 'This computer is not activated. Activate this device before signing in.') {
      return NextResponse.json({ data: null, error: directStaffResult.error || 'Invalid email or password' }, { status: 401 });
    }

    const deviceId = String(body.deviceId || '').trim();
    const deviceProof = body.deviceProof && typeof body.deviceProof === 'object' ? body.deviceProof : null;
    if (!deviceId || !deviceProof?.challenge || !deviceProof?.signature) return NextResponse.json({ data: null, error: 'This computer is not activated. Activate this device before signing in.' }, { status: 403 });

    const verifiedDevice = await verifyDeviceChallenge(deviceId, String(deviceProof.signature), String(deviceProof.challenge));
    const result = await authenticateStaff(normalizedEmail, String(password), {
      deviceId: verifiedDevice.deviceId,
      organizationId: verifiedDevice.organizationId,
      branchId: verifiedDevice.branchId,
      ip: requestIp(request),
      userAgent: request.headers.get('user-agent')?.slice(0, 1000) || null,
    });
    if (!result.success || !result.token || !result.staff) return NextResponse.json({ data: null, error: result.error || 'Invalid email or password' }, { status: 401 });

    const response = NextResponse.json({ data: { token: result.token, staff: result.staff, deviceId: verifiedDevice.deviceId, organizationId: verifiedDevice.organizationId, branchId: verifiedDevice.branchId } });
    response.cookies.set('krown_session', result.token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 24, path: '/' });
    return response;
  } catch (e: any) {
    const message = e?.message || 'Internal server error';
    return NextResponse.json({ data: null, error: message }, { status: /device|challenge|signature|credential/i.test(message) ? 403 : 500 });
  }
}
