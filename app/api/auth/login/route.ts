import { NextRequest, NextResponse } from 'next/server';
import { authenticateStaff, authenticateSuperAdmin } from '@/lib/auth';
import { verifyDeviceChallenge } from '@/lib/services/device-auth.service';

function requestIp(request: NextRequest) {
  return (request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '').slice(0, 120) || null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');
    if (!email || !password) return NextResponse.json({ data: null, error: 'Email and password are required' }, { status: 400 });

    // Platform Super Admin remains a platform-level credential. Restaurant staff
    // credentials are always bound to an activated device below.
    const superAdminResult = await authenticateSuperAdmin(email, password);
    if (superAdminResult.success && superAdminResult.token && superAdminResult.staff) {
      const response = NextResponse.json({ data: { token: superAdminResult.token, staff: superAdminResult.staff } });
      response.cookies.set('krown_session', superAdminResult.token, {
        httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
        maxAge: 60 * 60 * 24, path: '/',
      });
      return response;
    }

    const deviceId = String(body.deviceId || '').trim();
    const deviceProof = body.deviceProof && typeof body.deviceProof === 'object' ? body.deviceProof : null;
    if (!deviceId || !deviceProof?.challenge || !deviceProof?.signature) {
      return NextResponse.json({ data: null, error: 'This computer is not activated for a restaurant account.' }, { status: 403 });
    }

    const verifiedDevice = await verifyDeviceChallenge(
      deviceId,
      String(deviceProof.signature),
      String(deviceProof.challenge),
    );

    const result = await authenticateStaff(email, password, {
      deviceId: verifiedDevice.deviceId,
      organizationId: verifiedDevice.organizationId,
      branchId: verifiedDevice.branchId,
      ip: requestIp(request),
      userAgent: request.headers.get('user-agent')?.slice(0, 1000) || null,
    });

    if (!result.success || !result.token || !result.staff) {
      return NextResponse.json({ data: null, error: result.error || 'Wrong email or password for this restaurant or branch' }, { status: 401 });
    }

    const response = NextResponse.json({
      data: {
        token: result.token,
        staff: result.staff,
        deviceId: verifiedDevice.deviceId,
        organizationId: verifiedDevice.organizationId,
        branchId: verifiedDevice.branchId,
      },
    });
    response.cookies.set('krown_session', result.token, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
      maxAge: 60 * 60 * 24, path: '/',
    });
    return response;
  } catch (e: any) {
    const message = e?.message || 'Internal server error';
    return NextResponse.json({
      data: null,
      error: /device|challenge|signature|credential|activated/i.test(message)
        ? 'This computer is not activated for this restaurant or branch.'
        : message,
    }, { status: /device|challenge|signature|credential|activated/i.test(message) ? 403 : 500 });
  }
}
