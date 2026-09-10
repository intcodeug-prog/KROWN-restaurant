import { NextRequest, NextResponse } from 'next/server';
import { authenticateByPinOnly } from '@/lib/services/pin-auth.service';
import { verifyDeviceChallenge } from '@/lib/services/device-auth.service';

function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set('krown_session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 24, path: '/' });
}

export async function POST(request: NextRequest) {
  try {
    const { pin, deviceId, challenge, signature } = await request.json();
    if (!pin) return NextResponse.json({ data: null, error: 'PIN is required' }, { status: 400 });

    let context: { deviceId: string; organizationId: string; branchId: string } | undefined;
    if (deviceId || challenge || signature) {
      if (!deviceId || !challenge || !signature) return NextResponse.json({ data: null, error: 'Complete registered-device proof is required' }, { status: 400 });
      const device = await verifyDeviceChallenge(String(deviceId), String(signature), String(challenge));
      context = { deviceId: device.deviceId, organizationId: device.organizationId, branchId: device.branchId };
    }

    const result = await authenticateByPinOnly(String(pin), context);
    if (!result.success || !result.token || !result.staff) return NextResponse.json({ data: null, error: result.error || 'Authentication failed' }, { status: 401 });

    const response = NextResponse.json({ data: { token: result.token, staff: result.staff, deviceId: context?.deviceId || null, branchId: context?.branchId || result.staff.assignedBranchId || null } });
    setSessionCookie(response, result.token);
    return response;
  } catch (e: any) {
    return NextResponse.json({ data: null, error: e?.message || 'Authentication failed' }, { status: 401 });
  }
}
