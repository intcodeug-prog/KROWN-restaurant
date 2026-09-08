import { NextRequest, NextResponse } from 'next/server';
import { issuePublicDeviceChallenge } from '@/lib/services/device-auth.service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const deviceId = String(body.deviceId || '').trim();
    if (!deviceId) return NextResponse.json({ data:null, error:'deviceId is required' }, { status:400 });

    // Always use the public (unscoped) path.  The challenge is a
    // pre-authentication step — the device proves possession of its
    // private key.  Using the caller's session org here breaks when the
    // session cookie belongs to a *different* organisation than the
    // device, producing spurious "Device not found" errors.
    const data = await issuePublicDeviceChallenge(deviceId);
    return NextResponse.json({ data: { challenge: data.challenge, expiresInSeconds: data.expiresInSeconds, deviceId: data.deviceId } });
  } catch (e:any) {
    const message=e?.message||'Unable to issue device challenge';
    return NextResponse.json({ data:null, error:message }, { status:/Forbidden|not active|not found/i.test(message)?403:400 });
  }
}
