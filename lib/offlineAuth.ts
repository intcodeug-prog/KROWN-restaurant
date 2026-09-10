// KROWN offline authentication cache.
// Offline access is deliberately scoped to the activated device + exact tenant + branch.
// Password/PIN verifiers are PBKDF2 hashes; raw credentials are never stored.
// The server remains authoritative whenever connectivity is available.

export interface OfflineAuthEntry {
  email: string;
  passwordHash?: string;
  pinHash?: string;
  salt: string;
  staff: any;
  organizationId: string;
  branchId: string;
  deviceId: string;
  cachedAt: number;
}

const OFFLINE_AUTH_KEY = 'krown_offline_auth_cache_v2';
const PBKDF2_ITERATIONS = 180000;

function context() {
  if (typeof window === 'undefined') return { organizationId: '', branchId: '', deviceId: '' };
  let staff: any = null;
  try { staff = JSON.parse(localStorage.getItem('krown_staff_profile') || localStorage.getItem('krown_staff') || 'null'); } catch {}
  return {
    organizationId: String(staff?.organizationId || staff?.organization_id || localStorage.getItem('krown_organization_id') || ''),
    branchId: String(staff?.assignedBranchId || staff?.assigned_branch_id || localStorage.getItem('krown_branch_id') || ''),
    deviceId: String(localStorage.getItem('krown_device_id') || ''),
  };
}

function readCache(): Record<string, OfflineAuthEntry> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(OFFLINE_AUTH_KEY) || '{}'); } catch { return {}; }
}

function writeCache(cache: Record<string, OfflineAuthEntry>) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(OFFLINE_AUTH_KEY, JSON.stringify(cache)); } catch {}
}

function keyOf(email: string, organizationId: string, branchId: string, deviceId: string) {
  return `${organizationId}:${branchId}:${deviceId}:${email.toLowerCase()}`;
}

function randomHex(bytes = 16) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function derive(value: string, salt: string): Promise<string> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(value), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: PBKDF2_ITERATIONS }, material, 256);
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function safeStaffProfile(staff: any) {
  return {
    id: staff?.id,
    name: staff?.name || 'Staff',
    email: staff?.email || '',
    role: staff?.role,
    branch: staff?.branch,
    assignedBranchId: staff?.assigned_branch_id || staff?.assignedBranchId || null,
    organizationId: staff?.organization_id || staff?.organizationId || null,
    status: staff?.status || 'active',
    avatar: staff?.avatar,
  };
}

async function upsertEntry(staff: any, secret: { password?: string; pin?: string }) {
  if (typeof window === 'undefined') return;
  const email = String(staff?.email || '').trim().toLowerCase();
  const ctx = context();
  const organizationId = String(staff?.organization_id || staff?.organizationId || ctx.organizationId || '');
  const branchId = String(staff?.assigned_branch_id || staff?.assignedBranchId || ctx.branchId || '');
  const deviceId = ctx.deviceId;
  if (!email || !organizationId || !branchId || !deviceId) return;

  const cache = readCache();
  const key = keyOf(email, organizationId, branchId, deviceId);
  const existing = cache[key];
  const salt = existing?.salt || randomHex();
  const entry: OfflineAuthEntry = {
    email,
    passwordHash: existing?.passwordHash,
    pinHash: existing?.pinHash,
    salt,
    staff: safeStaffProfile(staff),
    organizationId,
    branchId,
    deviceId,
    cachedAt: Date.now(),
  };
  if (secret.password) entry.passwordHash = await derive(secret.password, `${salt}:password`);
  if (secret.pin) entry.pinHash = await derive(secret.pin, `${salt}:pin`);
  cache[key] = entry;
  writeCache(cache);
}

export async function cacheOfflineAuth(staff: any) {
  await upsertEntry(staff, {});
}

export async function storeOfflinePasswordHash(email: string, password: string) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) return;
  const cache = readCache();
  const ctx = context();
  const matching = Object.values(cache).find(e => e.email === cleanEmail && e.organizationId === ctx.organizationId && e.branchId === ctx.branchId && e.deviceId === ctx.deviceId);
  if (matching) {
    matching.passwordHash = await derive(password, `${matching.salt}:password`);
    matching.cachedAt = Date.now();
    writeCache(cache);
  }
}

export async function storeOfflinePin(staff: any, pin: string) {
  if (!/^\d{4,6}$/.test(pin)) return;
  await upsertEntry(staff, { pin });
}

export async function verifyOfflineCredentials(email: string, password: string): Promise<OfflineAuthEntry | null> {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const ctx = context();
  const entry = Object.values(readCache()).find(e => e.email === cleanEmail && e.organizationId === ctx.organizationId && e.branchId === ctx.branchId && e.deviceId === ctx.deviceId);
  if (!entry?.passwordHash) return null;
  const hash = await derive(password, `${entry.salt}:password`);
  return hash === entry.passwordHash ? entry : null;
}

export async function verifyOfflinePin(pin: string): Promise<OfflineAuthEntry | null> {
  if (!/^\d{4,6}$/.test(pin)) return null;
  const ctx = context();
  if (!ctx.deviceId || !ctx.organizationId || !ctx.branchId) return null;
  const candidates = Object.values(readCache()).filter(e => e.pinHash && e.organizationId === ctx.organizationId && e.branchId === ctx.branchId && e.deviceId === ctx.deviceId && e.staff?.status === 'active');
  for (const entry of candidates) {
    const hash = await derive(pin, `${entry.salt}:pin`);
    if (hash === entry.pinHash) return entry;
  }
  return null;
}

export function getCachedOfflineProfile(email: string): any | null {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const ctx = context();
  return Object.values(readCache()).find(e => e.email === cleanEmail && e.organizationId === ctx.organizationId && e.branchId === ctx.branchId && e.deviceId === ctx.deviceId)?.staff || null;
}

export function getCachedOfflineOrganizationId(email: string): string | null {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const ctx = context();
  return Object.values(readCache()).find(e => e.email === cleanEmail && e.organizationId === ctx.organizationId && e.branchId === ctx.branchId && e.deviceId === ctx.deviceId)?.organizationId || null;
}

export function isOffline(): boolean {
  return typeof navigator !== 'undefined' ? !navigator.onLine : false;
}
