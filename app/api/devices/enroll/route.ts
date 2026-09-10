import { createHash, createPublicKey } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSql } from '@/lib/neon-server';
import { generateId } from '@/lib/id';

function clean(value: unknown, max: number) { return String(value || '').trim().slice(0, max); }
function requestIp(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for');
  return (forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '').slice(0, 120) || null;
}
function validP256Jwk(value: string) {
  try {
    const key = JSON.parse(value) as any;
    if (!key || key.kty !== 'EC' || key.crv !== 'P-256' || typeof key.x !== 'string' || typeof key.y !== 'string' || 'd' in key) return false;
    createPublicKey({ key, format: 'jwk' });
    return true;
  } catch { return false; }
}

export async function POST(request: NextRequest) {
  const sql = getSql();
  try {
    const body = await request.json();
    const token = clean(body.token, 512);
    const credentialId = clean(body.credentialId, 128);
    const credentialPublicKeyRaw = typeof body.credentialPublicKey === 'object' ? JSON.stringify(body.credentialPublicKey) : String(body.credentialPublicKey || '');
    const credentialPublicKey = clean(credentialPublicKeyRaw, 8192);
    const browser = clean(body.browser, 120) || null;
    const operatingSystem = clean(body.operatingSystem, 120) || null;
    const userAgent = request.headers.get('user-agent')?.slice(0, 1000) || null;
    const ipAddress = requestIp(request);

    if (!token || !credentialId || !credentialPublicKey) return NextResponse.json({ data: null, error: 'Invalid activation code or device credentials' }, { status: 400 });
    if (!validP256Jwk(credentialPublicKey)) return NextResponse.json({ data: null, error: 'Invalid device credentials' }, { status: 400 });

    const suppliedFingerprint = clean(body.deviceFingerprint, 512);
    const deviceFingerprint = suppliedFingerprint || createHash('sha256').update(`krown-device:${credentialId}`).digest('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');

    // Read the token without consuming it. This lets us reject a cross-tenant
    // device before burning a valid activation code.
    const tokenRows = await sql`SELECT organization_id, branch_id, device_type, device_name, allowed_roles, created_by
      FROM device_enrollment_tokens
      WHERE token_hash=${tokenHash} AND used=false AND expires_at>NOW()
      LIMIT 1`;
    if (!tokenRows.length) return NextResponse.json({ data: null, error: 'Invalid, expired, or already-used activation code' }, { status: 409 });

    const enrollment = tokenRows[0] as any;
    const orgId = enrollment.organization_id;
    const branchId = enrollment.branch_id;
    const allowedRolesJson = JSON.stringify(enrollment.allowed_roles || []);

    const identityRows = await sql`SELECT id, organization_id, branch_id, status, credential_id
      FROM devices
      WHERE credential_id = ${credentialId} OR device_fingerprint = ${deviceFingerprint}
      ORDER BY created_at ASC
      LIMIT 2`;

    const foreignBinding = identityRows.find((row: any) => String(row.organization_id) !== String(orgId));
    if (foreignBinding) {
      return NextResponse.json({ data: null, error: 'This computer is already activated for another restaurant. Decommission the existing device before assigning it elsewhere.' }, { status: 409 });
    }

    const existing = identityRows.find((row: any) => String(row.organization_id) === String(orgId));

    // Consume only this exact token after the binding checks pass. If another
    // request won the race, no device is created/updated.
    const claimed = await sql`UPDATE device_enrollment_tokens
      SET used=true, used_at=NOW()
      WHERE token_hash=${tokenHash} AND used=false AND expires_at>NOW()
      RETURNING organization_id, branch_id, device_type, device_name, allowed_roles, created_by`;
    if (!claimed.length) return NextResponse.json({ data: null, error: 'Invalid, expired, or already-used activation code' }, { status: 409 });

    let device: any;
    if (existing) {
      const updated = await sql`
        UPDATE devices SET
          branch_id=${branchId}, device_name=${enrollment.device_name}, device_type=${enrollment.device_type},
          status='active', trust_status='trusted', credential_id=${credentialId}, credential_public_key=${credentialPublicKey},
          credential_version=1, enrolled_at=NOW(), enrolled_by=${enrollment.created_by}, browser=${browser},
          operating_system=${operatingSystem}, ip_address=${ipAddress}, user_agent=${userAgent},
          allowed_roles=${allowedRolesJson}::jsonb, enrollment_token_hash=NULL,
          decommissioned_at=NULL, decommissioned_by=NULL, decommissioned_reason=NULL, updated_at=NOW()
        WHERE id=${existing.id}
        RETURNING id, organization_id, branch_id, public_reference, device_name, device_type, status, trust_status, credential_id, credential_version, enrolled_at, created_at`;
      device = updated[0];
    } else {
      const deviceId = generateId();
      const publicReference = `DEV-${deviceId.replace(/-/g, '').slice(0, 10).toUpperCase()}`;
      const inserted = await sql`
        INSERT INTO devices
          (id, organization_id, branch_id, public_reference, device_fingerprint, device_name, device_type, status, trust_status,
           credential_id, credential_public_key, credential_version, enrolled_at, enrolled_by, browser, operating_system,
           ip_address, user_agent, allowed_roles, created_at, updated_at)
        VALUES
          (${deviceId}, ${orgId}, ${branchId}, ${publicReference}, ${deviceFingerprint}, ${enrollment.device_name}, ${enrollment.device_type},
           'active', 'trusted', ${credentialId}, ${credentialPublicKey}, 1, NOW(), ${enrollment.created_by}, ${browser},
           ${operatingSystem}, ${ipAddress}, ${userAgent}, ${allowedRolesJson}::jsonb, NOW(), NOW())
        RETURNING id, organization_id, branch_id, public_reference, device_name, device_type, status, trust_status, credential_id, credential_version, enrolled_at, created_at`;
      device = inserted[0];
    }

    if (!device) return NextResponse.json({ data: null, error: 'Device activation failed' }, { status: 500 });
    return NextResponse.json({ data: device }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ data: null, error: e?.message || 'Device activation failed' }, { status: 400 });
  }
}
