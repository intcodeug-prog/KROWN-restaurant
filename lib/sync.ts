/**
 * KROWN POS — Offline-first synchronization engine.
 *
 * Business writes are persisted locally with tenant + branch + device context and
 * replayed automatically after reconnect. Reads use a tenant/device-scoped cache.
 * Authentication and device enrollment are never fabricated or queued offline.
 */
import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'KrownPOS_OfflineDB';
const DB_VERSION = 5;
const QUEUE_STORE = 'op_queue';
const RESPONSE_STORE = 'response_cache';
const MAX_RETRIES = 24;
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export interface OfflineOp {
  id?: number;
  endpoint: string;
  method: string;
  body: any;
  timestamp: number;
  retries: number;
  organizationId: string;
  branchId: string;
  deviceId: string;
  staffId: string;
  clientOpId: string;
}
interface CachedResponse { key: string; status: number; headers: Record<string, string>; body: string; cachedAt: number; }

type SyncListener = (pendingCount: number) => void;
let _db: IDBPDatabase | null = null;
let autoSyncInitialized = false;
let fetchInterceptorInstalled = false;
let nativeFetch: typeof window.fetch | null = null;
let syncInFlight: Promise<{ synced: number; failed: number }> | null = null;
const syncListeners = new Set<SyncListener>();

export async function getDB(): Promise<IDBPDatabase> {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
      if (!db.objectStoreNames.contains(RESPONSE_STORE)) db.createObjectStore(RESPONSE_STORE, { keyPath: 'key' });
    },
  });
  return _db;
}

function currentContext() {
  if (typeof window === 'undefined') return { organizationId: '', branchId: '', deviceId: '', staffId: '' };
  let staff: any = null;
  try { staff = JSON.parse(localStorage.getItem('krown_staff_profile') || localStorage.getItem('krown_staff') || 'null'); } catch {}
  return {
    organizationId: String(staff?.organizationId || staff?.organization_id || localStorage.getItem('krown_organization_id') || ''),
    branchId: String(staff?.assignedBranchId || staff?.assigned_branch_id || localStorage.getItem('krown_branch_id') || ''),
    deviceId: String(localStorage.getItem('krown_device_id') || ''),
    staffId: String(staff?.id || ''),
  };
}

function isAuthEndpoint(path: string) { return path.startsWith('/api/auth/') || path.startsWith('/api/devices/'); }
function isReadRequest(method: string) { return ['GET', 'HEAD'].includes(method.toUpperCase()); }
function isTransientHttpStatus(status: number) { return status === 408 || status === 425 || status === 429 || status >= 500; }
function isQueueableWrite(method: string, path: string) { return !isReadRequest(method) && !isAuthEndpoint(path); }
function cacheKey(url: string) { const c = currentContext(); return `${c.organizationId}:${c.branchId}:${c.deviceId}:${url}`; }

async function cacheResponse(url: string, response: Response) {
  if (!response.ok || isAuthEndpoint(new URL(url, window.location.origin).pathname)) return;
  try {
    const clone = response.clone();
    const body = await clone.text();
    const headers: Record<string, string> = {};
    clone.headers.forEach((v, k) => { headers[k] = v; });
    await (await getDB()).put(RESPONSE_STORE, { key: cacheKey(url), status: clone.status, headers, body, cachedAt: Date.now() } satisfies CachedResponse);
  } catch {}
}

async function cachedResponse(url: string): Promise<Response | null> {
  try {
    const cached = await (await getDB()).get(RESPONSE_STORE, cacheKey(url)) as CachedResponse | undefined;
    if (!cached || Date.now() - cached.cachedAt > MAX_AGE_MS) return null;
    return new Response(cached.body, { status: cached.status, headers: cached.headers });
  } catch { return null; }
}

function pathAndQuery(url: string) { const u = new URL(url, window.location.origin); return `${u.pathname}${u.search}`; }

async function extractBody(input: RequestInfo | URL, init?: RequestInit): Promise<any> {
  if (init?.body !== undefined) {
    if (typeof init.body === 'string') { try { return JSON.parse(init.body); } catch { return init.body; } }
    return init.body;
  }
  if (input instanceof Request) {
    try { const text = await input.clone().text(); if (!text) return undefined; try { return JSON.parse(text); } catch { return text; } } catch { return undefined; }
  }
  return undefined;
}

function queuedResponse() {
  return new Response(JSON.stringify({ queued: true, offline: true }), {
    status: 202,
    headers: { 'Content-Type': 'application/json', 'X-Krown-Queued': 'true' },
  });
}

function installFetchInterceptor() {
  if (fetchInterceptorInstalled || typeof window === 'undefined') return;
  fetchInterceptorInstalled = true;
  nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : null;
    const method = (init?.method || request?.method || 'GET').toUpperCase();
    const absoluteUrl = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : request?.url || String(input), window.location.origin).toString();
    const path = new URL(absoluteUrl).pathname;
    if (isAuthEndpoint(path)) return nativeFetch!(input, init);

    if (isReadRequest(method) && !navigator.onLine) {
      const cached = await cachedResponse(absoluteUrl);
      return cached || new Response(JSON.stringify({ data: [], offline: true }), { status: 200, headers: { 'Content-Type': 'application/json', 'X-Krown-Offline': 'true' } });
    }

    try {
      const response = await nativeFetch!(input, init);
      if (isReadRequest(method)) {
        if (response.ok) await cacheResponse(absoluteUrl, response);
        return response;
      }
      if (response.ok || !isQueueableWrite(method, path) || !isTransientHttpStatus(response.status)) return response;
      await queueOfflineOp({ endpoint: pathAndQuery(absoluteUrl), method, body: await extractBody(input, init) });
      return queuedResponse();
    } catch (error) {
      if (!isQueueableWrite(method, path)) throw error;
      await queueOfflineOp({ endpoint: pathAndQuery(absoluteUrl), method, body: await extractBody(input, init) });
      return queuedResponse();
    }
  };
}

export async function queueOfflineOp(op: { endpoint: string; method: string; body: any }) {
  try {
    const context = currentContext();
    if (!context.organizationId || !context.deviceId) throw new Error('No activated tenant/device context');
    const clientOpId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await (await getDB()).add(QUEUE_STORE, {
      ...op,
      timestamp: Date.now(),
      retries: 0,
      clientOpId,
      ...context,
    } satisfies OfflineOp);
    await notifySyncListeners();
    if (navigator.onLine) setTimeout(() => syncOfflineQueue().catch(() => undefined), 100);
  } catch (e) { console.warn('[KROWN Offline] local persistence unavailable:', e); }
}

export async function getPendingOpCount() { try { return await (await getDB()).count(QUEUE_STORE); } catch { return 0; } }

async function canReplay(op: OfflineOp) {
  const c = currentContext();
  return !!c.organizationId && !!c.deviceId && op.organizationId === c.organizationId && op.deviceId === c.deviceId && (!op.branchId || op.branchId === c.branchId);
}

export async function syncOfflineQueue(): Promise<{ synced: number; failed: number }> {
  if (syncInFlight) return syncInFlight;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { synced: 0, failed: 0 };
  syncInFlight = (async () => {
    const db = await getDB();
    const ops = await db.getAll(QUEUE_STORE) as OfflineOp[];
    let synced = 0, failed = 0;
    for (const op of ops) {
      if (!await canReplay(op)) { failed++; continue; }
      if (Date.now() - op.timestamp > MAX_AGE_MS) { await db.delete(QUEUE_STORE, op.id!); failed++; continue; }
      try {
        const token = localStorage.getItem('krown_session_token') || '';
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Krown-Offline-Op-Id': op.clientOpId,
        };
        if (token && !token.startsWith('offline:')) headers.Authorization = `Bearer ${token}`;

        // Always bypass the interceptor while replaying, otherwise a transient
        // 5xx would enqueue the same operation a second time.
        const response = await (nativeFetch || window.fetch)(op.endpoint, {
          method: op.method,
          headers,
          credentials: 'include',
          ...(op.body !== undefined ? { body: JSON.stringify(op.body) } : {}),
        });

        if (response.ok) { await db.delete(QUEUE_STORE, op.id!); synced++; continue; }

        // A queued change must survive an expired/offline session. Do not drop
        // it on auth failure; once the staff member signs in again, the queue
        // can be replayed under the newly issued server session.
        if (response.status === 401 || response.status === 403) {
          failed++;
          continue;
        }

        if (!isTransientHttpStatus(response.status)) { await db.delete(QUEUE_STORE, op.id!); failed++; continue; }
        const retries = (op.retries || 0) + 1;
        if (retries >= MAX_RETRIES) await db.delete(QUEUE_STORE, op.id!); else await db.put(QUEUE_STORE, { ...op, retries });
        failed++;
      } catch { failed++; }
    }
    await notifySyncListeners();
    return { synced, failed };
  })();
  try { return await syncInFlight; } finally { syncInFlight = null; }
}

export async function clearAllPendingOps() { try { await (await getDB()).clear(QUEUE_STORE); await notifySyncListeners(); } catch {} }
export const forceSyncNow = syncOfflineQueue;
export function onSyncStatusChange(fn: SyncListener) { syncListeners.add(fn); return () => syncListeners.delete(fn); }
async function notifySyncListeners() { const count = await getPendingOpCount(); syncListeners.forEach(fn => { try { fn(count); } catch {} }); }

export function initAutoSync() {
  if (autoSyncInitialized || typeof window === 'undefined') return;
  autoSyncInitialized = true;
  installFetchInterceptor();
  (async () => {
    try {
      const db = await getDB();
      const ops = await db.getAll(QUEUE_STORE) as OfflineOp[];
      const cutoff = Date.now() - MAX_AGE_MS;
      for (const op of ops) if (op.timestamp < cutoff) await db.delete(QUEUE_STORE, op.id!);
    } catch {}
  })();
  const handleOnline = () => syncOfflineQueue().catch(() => undefined);
  window.addEventListener('online', handleOnline);
  const interval = window.setInterval(() => { if (navigator.onLine) syncOfflineQueue().catch(() => undefined); }, 5000);
  try { navigator.serviceWorker?.ready.then((reg: any) => { if ('sync' in reg) reg.sync.register('krown-offline-sync').catch(() => undefined); }).catch(() => undefined); } catch {}
  (window as any).__krownOfflineCleanup = () => { window.removeEventListener('online', handleOnline); window.clearInterval(interval); };
}
