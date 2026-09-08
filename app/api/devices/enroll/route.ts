import { createHash, createPublicKey } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSql } from '@/lib/neon-server';
import { generateId } from '@/lib/id';

function clean(value: unknown, max: number) { return String(value || '').trim().slice(0, max); }
function requestIp(request: NextRequest) { const forwarded = request.headers.get('x-forwarded-for'); return (forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '').slice(0, 120) || null; }
function validP256Jwk(value: string) {
  try {
    const key = JSON.parse(value) as any;
    if (!key || key.kty !== 'EC' || key.crv !== 'P-256' || typeof key.x !== 'string' || typeof key.y !== 'string' || 'd' in key) return false;
    createPublicKey({ key, format: 'jwk' });
    return true;
  } catch { return false; }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = clean(body.token, 512);
    const credentialId = clean(body.credentialId, 128);
    const credentialPublicKeyRaw = typeof body.credentialPublicKey === 'object'
      ? JSON.stringify(body.credentialPublicKey)
      : String(body.credentialPublicKey || '');
    const credentialPublicKey = clean(credentialPublicKeyRaw, 8192);
    const browser = clean(body.browser, 120) || null;
    const operatingSystem = clean(body.operatingSystem, 120) || null;
    const userAgent = request.headers.get('user-agent')?.slice(0, 1000) || null;
    const ipAddress = requestIp(request);

    if (!token || !credentialId || !credentialPublicKey) {
      return NextResponse.json({ data: null, error: 'token, credentialId and credentialPublicKey are required' }, { status: 400 });
    }
    if (!validP256Jwk(credentialPublicKey)) {
      return NextResponse.json({ data: null, error: 'credentialPublicKey must be a valid P-256 public JWK' }, { status: 400 });
    }

    const suppliedFingerprint = clean(body.deviceFingerprint, 512);
    const deviceFingerprint = suppliedFingerprint || createHash('sha256').update(`krown-device:${credentialId}`).digest('hex');

    const sql = getSql();
    const tokenHash = createHash('sha256').update(token).digest('hex');

    // Step 1: Claim the enrollment token
    const claimed = await sql`UPDATE device_enrollment_tokens
      SET used=true, used_at=NOW()
      WHERE token_hash=${tokenHash} AND used=false AND expires_at>NOW()
      RETURNING organization_id, branch_id, device_type, device_name, allowed_roles, created_by`;
    if (!claimed.length) {
      return NextResponse.json({ data: null, error: 'Invalid, expired, or already-used enrollment token' }, { status: 409 });
    }
    const enrollment = claimed[0] as any;
    const orgId = enrollment.organization_id;
    const branchId = enrollment.branch_id;
    const allowedRolesJson = JSON.stringify(enrollment.allowed_roles || []);

    // Step 2: Check if a device with this fingerprint already exists in this org
    const existing = await sql`SELECT id FROM devices
      WHERE organization_id = ${orgId} AND device_fingerprint = ${deviceFingerprint}
      LIMIT 1`;

    let device: any;
    if (existing.length) {
      // Step 3a: Re-enroll — update the existing device with new credentials
      const updated = await sql`
        UPDATE devices SET
          branch_id = ${branchId},
          device_name = ${enrollment.device_name},
          device_type = ${enrollment.device_type},
          status = 'active',
          trust_status = 'trusted',
          credential_id = ${credentialId},
          credential_public_key = ${credentialPublicKey},
          credential_version = 1,
          enrolled_at = NOW(),
          enrolled_by = ${enrollment.created_by},
          browser = ${browser},
          operating_system = ${operatingSystem},
          ip_address = ${ipAddress},
          user_agent = ${userAgent},
          allowed_roles = ${allowedRolesJson}::jsonb,
          enrollment_token_hash = NULL,
          decommissioned_at = NULL,
          decommissioned_by = NULL,
          decommissioned_reason = NULL,
          updated_at = NOW()
        WHERE id = ${existing[0].id}
        RETURNING id, organization_id, branch_id, public_reference, device_name, device_type, status, trust_status, credential_id, credential_version, enrolled_at, created_at`;
      device = updated[0];
    } else {
      // Step 3b: First enrollment — insert a new device
      const deviceId = generateId();
      const publicReference = `DEV-${deviceId.replace(/-/g, '').slice(0, 10).toUpperCase()}`;
      const inserted = await sql`
        INSERT INTO devices
          (id, organization_id, branch_id, public_reference, device_fingerprint, device_name, device_type, status, trust_status, credential_id, credential_public_key, credential_version, enrolled_at, enrolled_by, browser, operating_system, ip_address, user_agent, allowed_roles, created_at, updated_at)
        VALUES
          (${deviceId}, ${orgId}, ${branchId}, ${publicReference}, ${deviceFingerprint}, ${enrollment.device_name}, ${enrollment.device_type}, 'active', 'trusted', ${credentialId}, ${credentialPublicKey}, 1, NOW(), ${enrollment.created_by}, ${browser}, ${operatingSystem}, ${ipAddress}, ${userAgent}, ${allowedRolesJson}::jsonb, NOW(), NOW())
        RETURNING id, organization_id, branch_id, public_reference, device_name, device_type, status, trust_status, credential_id, credential_version, enrolled_at, created_at`;
      device = inserted[0];
    }

    if (!device) {
      return NextResponse.json({ data: null, error: 'Device enrollment failed' }, { status: 500 });
    }

    return NextResponse.json({ data: device }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ data: null, error: e?.message || 'Device enrollment failed' }, { status: 400 });
  }
}
