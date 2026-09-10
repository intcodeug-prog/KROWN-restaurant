import { createHash, createPublicKey, randomBytes, verify as verifySignature } from 'node:crypto';
import { getSql } from '@/lib/neon-server';
import { TenantContext, setTenantContext } from '@/lib/tenant';
import { assertBranchAccess } from '@/lib/access-control';

function hashToken(value: string) { return createHash('sha256').update(value).digest('hex'); }

async function writeDeviceChallenge(deviceId: string, organizationId?: string) {
  const sql = getSql();
  const rows = organizationId
    ? await sql`SELECT id, organization_id, branch_id, status, trust_status, credential_id FROM devices WHERE id=${deviceId} AND organization_id=${organizationId} LIMIT 1`
    : await sql`SELECT id, organization_id, branch_id, status, trust_status, credential_id FROM devices WHERE id=${deviceId} LIMIT 1`;
  if (!rows.length) throw new Error('Device not found');
  const device = rows[0] as any;
  if (device.status !== 'active' || device.trust_status === 'revoked') throw new Error('Device is not active');
  if (!device.credential_id) throw new Error('Device has no cryptographic credential');
  const challenge = randomBytes(32).toString('base64url');
  if (organizationId) {
    await sql`UPDATE devices SET auth_challenge=${challenge}, auth_challenge_expires_at=NOW()+INTERVAL '2 minutes', updated_at=NOW() WHERE id=${deviceId} AND organization_id=${organizationId}`;
  } else {
    await sql`UPDATE devices SET auth_challenge=${challenge}, auth_challenge_expires_at=NOW()+INTERVAL '2 minutes', updated_at=NOW() WHERE id=${deviceId}`;
  }
  return { challenge, expiresInSeconds: 120, deviceId: device.id, organizationId: device.organization_id, branchId: device.branch_id };
}

export async function issueDeviceChallenge(ctx: TenantContext, deviceId: string) {
  const sql = getSql();
  await setTenantContext(sql, ctx.organizationId);
  const data = await writeDeviceChallenge(deviceId, ctx.organizationId);
  if (data.branchId) await assertBranchAccess(ctx, data.branchId);
  return { challenge: data.challenge, expiresInSeconds: data.expiresInSeconds, deviceId: data.deviceId, branchId: data.branchId };
}

export async function issuePublicDeviceChallenge(deviceId: string) {
  const data = await writeDeviceChallenge(deviceId);
  return { challenge: data.challenge, expiresInSeconds: data.expiresInSeconds, deviceId: data.deviceId, organizationId: data.organizationId, branchId: data.branchId };
}

export async function verifyDeviceChallenge(deviceId: string, signatureBase64Url: string, challenge: string) {
  const sql = getSql();
  const rows = await sql`SELECT id, organization_id, branch_id, status, trust_status, credential_id, credential_public_key, auth_challenge, auth_challenge_expires_at FROM devices WHERE id=${deviceId} LIMIT 1`;
  if (!rows.length) throw new Error('Device not found');
  const device = rows[0] as any;
  if (device.status !== 'active' || device.trust_status === 'revoked') throw new Error('Device is not active');
  if (!device.credential_id || !device.credential_public_key) throw new Error('Device credential is not configured');
  if (device.auth_challenge !== challenge) throw new Error('Invalid device challenge');
  if (!device.auth_challenge_expires_at || new Date(device.auth_challenge_expires_at).getTime() <= Date.now()) throw new Error('Device challenge expired');
  let publicKey;
  try { publicKey = createPublicKey({ key: JSON.parse(device.credential_public_key), format: 'jwk' }); } catch { throw new Error('Device credential is invalid'); }
  let signature: Buffer;
  try { signature = Buffer.from(signatureBase64Url, 'base64url'); } catch { throw new Error('Invalid device signature'); }
  const valid = verifySignature('sha256', Buffer.from(challenge), { key: publicKey, dsaEncoding: 'ieee-p1363' }, signature);
  if (!valid) throw new Error('Invalid device signature');

  // Consume the challenge atomically. A concurrent/replayed request can no longer authenticate.
  const consumed = await sql`
    UPDATE devices
    SET auth_challenge=NULL, auth_challenge_expires_at=NULL,
        last_authenticated_at=NOW(), last_seen_at=NOW(), updated_at=NOW()
    WHERE id=${deviceId}
      AND status='active'
      AND trust_status <> 'revoked'
      AND auth_challenge=${challenge}
      AND auth_challenge_expires_at > NOW()
    RETURNING id
  `;
  if (!consumed.length) throw new Error('Device challenge already used or expired');

  return { deviceId: device.id, organizationId: device.organization_id, branchId: device.branch_id, credentialId: device.credential_id };
}

export function deviceAssertionDigest(challenge: string) { return hashToken(challenge); }
