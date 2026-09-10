import { NextRequest, NextResponse } from 'next/server';
import { authenticateByPinOnly } from '@/lib/services/pin-auth.service';
import { verifyDeviceChallenge } from '@/lib/services/device-auth.service';

function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set('krown_session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 24, path: '/' });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const pin = String(body.pin || '').trim();
    const deviceId = String(body.deviceId || '').trim();
    const challenge = String(body.challenge || '').trim();
    const signature = String(body.signature || '').trim();

    if (!/^\d{4,6}$/.test(pin)) return NextResponse.json({ data: null, error: 'Enter your 4–6 digit PIN' }, { status: 400 });
    if (!deviceId || !challenge || !signature) {
      return NextResponse.json({ data: null, error: 'This computer is not activated. Activate this device before signing in.' }, { status: 403 });
    }

    const device = await verifyDeviceChallenge(deviceId, signature, challenge);
    const result = await authenticateByPinOnly(pin, {
      deviceId: device.deviceId,
      organizationId: device.organizationId,
      branchId: device.branchId,
    });

    if (!result.success || !result.token || !result.staff) {
      return NextResponse.json({ data: null, error: result.error || 'Authentication failed' }, { status: 401 });
    }

    const response = NextResponse.json({ data: {
      token: result.token,
      staff: result.staff,
      deviceId: device.deviceId,
      organizationId: device.organizationId,
      branchId: device.branchId,
    }});
    setSessionCookie(response, result.token);
    return response;
  } catch (e: any) {
    return NextResponse.json({ data: null, error: e?.message || 'Authentication failed' }, { status: 401 });
  }
}
