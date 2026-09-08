import { NextRequest, NextResponse } from 'next/server';
import { authenticateByPinOnly } from '@/lib/services/pin-auth.service';
import { verifyDeviceChallenge } from '@/lib/services/device-auth.service';

function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set('krown_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24,
    path: '/',
  });
}

export async function POST(request: NextRequest) {
  try {
    const { pin, deviceId, challenge, signature } = await request.json();

    if (!pin) {
      return NextResponse.json({ data: null, error: 'PIN is required' }, { status: 400 });
    }

    // Device-bound staff must prove possession of the enrolled terminal.
    // Only super admins can use PIN on any device (no device context needed).
    // All other staff (including restaurant_admin) require a registered device.
    if (!deviceId && !challenge && !signature) {
      return NextResponse.json({ data: null, error: 'A registered device is required for PIN login. Please activate a device first.' }, { status: 403 });
    }

    if (!deviceId || !challenge || !signature) {
      return NextResponse.json({ data: null, error: 'Complete registered-device proof is required' }, { status: 400 });
    }

    const device = await verifyDeviceChallenge(String(deviceId), String(signature), String(challenge));
    const result = await authenticateByPinOnly(String(pin), {
      deviceId: device.deviceId,
      organizationId: device.organizationId,
      branchId: device.branchId,
    });

    if (!result.success || !result.token || !result.staff) {
      return NextResponse.json({ data: null, error: result.error || 'Authentication failed' }, { status: 401 });
    }

    const response = NextResponse.json({
      data: { token: result.token, staff: result.staff, deviceId: device.deviceId, branchId: device.branchId },
    });
    setSessionCookie(response, result.token);
    return response;
  } catch (e: any) {
    return NextResponse.json({ data: null, error: e.message || 'Authentication failed' }, { status: 401 });
  }
}
