/**
 * KROWN POS — Offline-first synchronization engine.
 *
 * Goals:
 * - Keep the last known tenant data available when the internet disappears.
 * - Persist every safe business write locally before it can be lost.
 * - Replay writes automatically when connectivity returns.
 * - Never replay an operation under a different tenant/device/session.
 * - Never retry authentication, authorization, validation or conflict failures.
 * - Make retries idempotency-friendly by preserving the original request body.
 *
 * Important: browser offline mode is not a replacement for server authorization.
 * The server remains the source of truth whenever reachable.
 */

import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'KrownPOS_OfflineDB';
const DB_VERSION = 4;
const QUEUE_STORE = 'op_queue';
const RESPONSE_STORE = 'response_cache';
const MAX_RETRIES = 12;
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
}

interface CachedResponse {
  key: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  cachedAt: number;
}

let _db: IDBPDatabase | null = null;
let autoSyncInitialized = false;
let fetchInterceptorInstalled = false;
let syncInFlight: Promise<{ synced: number; failed: number }> | null = null;

type SyncListener = (pendingCount: number) => void;
const syncListeners = new Set<SyncListener>();

export async function getDB(): Promise<IDBPDatabase> {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(RESPONSE_STORE)) {
        db.createObjectStore(RESPONSE_STORE, { keyPath: 'key' });
      }
    },
  });
  return _db;
}

function currentContext() {
  if (typeof window === 'undefined') {
    return { organizationId: '', branchId: '', deviceId: '', staffId: '' };
  }

  let staff: any = null;
  try { staff = JSON.parse(localStorage.getItem('krown_staff_profile') || localStorage.getItem('krown_staff') || 'null'); } catch {}

  return {
    organizationId: String(staff?.organizationId || staff?.organization_id || localStorage.getItem('krown_organization_id') || ''),
    branchId: String(staff?.assignedBranchId || staff?.assigned_branch_id || localStorage.getItem('krown_branch_id') || ''),
    deviceId: String(localStorage.getItem('krown_device_id') || ''),
    staffId: String(staff?.id || ''),
  };
}

function isAuthEndpoint(endpoint: string): boolean {
  return endpoint.startsWith('/api/auth/') || endpoint.startsWith('/api/devices/');
}

function isReadRequest(method: string): boolean {
  return method.toUpperCase() === 'GET' || method.toUpperCase() === 'HEAD';
}

function isTransientHttpStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function isQueueableWrite(method: string, endpoint: string): boolean {
  return !isReadRequest(method) && !isAuthEndpoint(endpoint);
}

function cacheKey(url: string): string {
  const ctx = currentContext();
  return `${ctx.organizationId}:${ctx.branchId}:${ctx.deviceId}:${url}`;
}

async function cacheResponse(url: string, response: Response) {
  if (!response.ok || !isReadRequest('GET') || isAuthEndpoint(new URL(url, window.location.origin).pathname)) return;
  try {
    const clone = response.clone();
    const body = await clone.text();
    const headers: Record<string, string> = {};
    clone.headers.forEach((value, key) => { headers[key] = value; });
    const db = await getDB();
    await db.put(RESPONSE_STORE, {
      key: cacheKey(url),
      status: clone.status,
      headers,
      body,
      cachedAt: Date.now(),
    } satisfies CachedResponse);
  } catch {}
}

async function cachedResponse(url: string): Promise<Response | null> {
  try {
    const db = await getDB();
    const cached = await db.get(RESPONSE_STORE, cacheKey(url)) as CachedResponse | undefined;
    if (!cached || Date.now() - cached.cachedAt > MAX_AGE_MS) return null;
    return new Response(cached.body, {
      status: cached.status,
      headers: cached.headers,
    });
  } catch {
    return null;
  }
}

/**
 * Install a transparent fetch layer. Existing application code can continue to
 * call fetch()/api.* normally; the layer makes GETs cache-first when offline
 * and queues safe writes when there is no network or a transient server outage.
 */
function installFetchInterceptor() {
  if (fetchInterceptorInstalled || typeof window === 'undefined') return;
  fetchInterceptorInstalled = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : null;
    const method = (init?.method || request?.method || 'GET').toUpperCase();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : request?.url || String(input);
    const absoluteUrl = new URL(url, window.location.origin).toString();
    const path = new URL(absoluteUrl).pathname;

    // Authentication must remain online. Never manufacture an offline auth response.
    if (isAuthEndpoint(path)) return nativeFetch(input, init);

    if (isReadRequest(method) && !navigator.onLine) {
      const cached = await cachedResponse(absoluteUrl);
      if (cached) return cached;
      return new Response(JSON.stringify({ data: [], offline: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'X-Krown-Offline': 'true' },
      });
    }

    try {
      const response = await nativeFetch(input, init);
      if (isReadRequest(method)) {
        if (response.ok) await cacheResponse(absoluteUrl, response);
        return response;
      }

      if (response.ok) return response;
      if (!isQueueableWrite(method, path) || !isTransientHttpStatus(response.status)) return response;

      // A 5xx/timeout/429 is a transient outage, so preserve the user's write.
      const body = await extractBody(input, init);
      await queueOfflineOp({ endpoint: pathAndQuery(absoluteUrl), method, body });
      return queuedResponse();
    } catch (error) {
      if (!isQueueableWrite(method, path)) throw error;
      const body = await extractBody(input, init);
      await queueOfflineOp({ endpoint: pathAndQuery(absoluteUrl), method, body });
      return queuedResponse();
    }
  };
}

function pathAndQuery(url: string): string {
  const parsed = new URL(url, window.location.origin);
  return `${parsed.pathname}${parsed.search}`;
}

async function extractBody(input: RequestInfo | URL, init?: RequestInit): Promise<any> {
  if (init?.body !== undefined) {
    if (typeof init.body === 'string') {
      try { return JSON.parse(init.body); } catch { return init.body; }
    }
    return init.body;
  }
  if (input instanceof Request) {
    try {
      const text = await input.clone().text();
      if (!text) return undefined;
      try { return JSON.parse(text); } catch { return text; }
    } catch { return undefined; }
  }
  return undefined;
}

function queuedResponse(): Response {
  return new Response(JSON.stringify({ queued: true, offline: true }), {
    status: 202,
    headers: { 'Content-Type': 'application/json', 'X-Krown-Queued': 'true' },
  });
}

/** Queue a business operation with its exact tenant/device context. */
export async function queueOfflineOp(op: { endpoint: string; method: string; body: any }) {
  try {
    const db = await getDB();
    const context = currentContext();
    await db.add(QUEUE_STORE, {
      ...op,
      timestamp: Date.now(),
      retries: 0,
      ...context,
    } satisfies OfflineOp);
    await notifySyncListeners();

    if (typeof navigator !== 'undefined' && navigator.onLine) {
      setTimeout(() => { syncOfflineQueue().catch(() => undefined); }, 100);
    }
  } catch (error) {
    // Do not crash the POS because browser storage is unavailable.
    console.warn('[KROWN Offline] Unable to persist operation locally:', error);
  }
}

export async function getPendingOpCount(): Promise<number> {
  try {
    const db = await getDB();
    return await db.count(QUEUE_STORE);
  } catch { return 0; }
}

async function canReplay(op: OfflineOp): Promise<boolean> {
  const ctx = currentContext();
  // Empty legacy context is accepted only for operations created before this
  // hardening. New operations always carry all context fields.
  if (!op.organizationId && !op.deviceId) return true;
  return !!ctx.organizationId && !!ctx.deviceId &&
    op.organizationId === ctx.organizationId &&
    op.deviceId === ctx.deviceId &&
    (!op.branchId || op.branchId === ctx.branchId);
}

/** Replay queued operations automatically. */
export async function syncOfflineQueue(): Promise<{ synced: number; failed: number }> {
  if (syncInFlight) return syncInFlight;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { synced: 0, failed: 0 };

  syncInFlight = (async () => {
    const db = await getDB();
    const ops = await db.getAll(QUEUE_STORE) as OfflineOp[];
    if (ops.length === 0) return { synced: 0, failed: 0 };

    let synced = 0;
    let failed = 0;

    for (const op of ops) {
      if (!await canReplay(op)) {
        // Do not ever send another tenant's queued data using the current session.
        failed++;
        continue;
      }

      if (Date.now() - op.timestamp > MAX_AGE_MS) {
        await db.delete(QUEUE_STORE, op.id!);
        failed++;
        continue;
      }

      try {
        const token = localStorage.getItem('krown_session_token') || '';
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;

        const response = await window.fetch(op.endpoint, {
          method: op.method,
          headers,
          credentials: 'include',
          ...(op.body !== undefined ? { body: JSON.stringify(op.body) } : {}),
        });

        if (response.ok) {
          await db.delete(QUEUE_STORE, op.id!);
          synced++;
          continue;
        }

        if (!isTransientHttpStatus(response.status)) {
          // 400/401/403/404/409/etc. are business/security decisions. Do not
          // blindly retry them forever. Keep the local record only when it can
          // be safely surfaced by a future recovery screen.
          await db.delete(QUEUE_STORE, op.id!);
          failed++;
          continue;
        }

        const retries = (op.retries || 0) + 1;
        if (retries >= MAX_RETRIES) await db.delete(QUEUE_STORE, op.id!);
        else await db.put(QUEUE_STORE, { ...op, retries });
        failed++;
      } catch {
        failed++;
        // Transport failure remains queued without consuming a retry.
      }
    }

    await notifySyncListeners();
    return { synced, failed };
  })();

  try { return await syncInFlight; } finally { syncInFlight = null; }
}

export async function clearAllPendingOps(): Promise<void> {
  // Deliberately retained for maintenance tooling only. Normal UI must not
  // expose a destructive "clear" action because pending business data matters.
  try {
    const db = await getDB();
    await db.clear(QUEUE_STORE);
    await notifySyncListeners();
  } catch {}
}

export const forceSyncNow = syncOfflineQueue;

export function onSyncStatusChange(fn: SyncListener) {
  syncListeners.add(fn);
  return () => syncListeners.delete(fn);
}

async function notifySyncListeners() {
  const count = await getPendingOpCount();
  syncListeners.forEach(fn => {
    try { fn(count); } catch {}
  });
}

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

  const handleOnline = () => { syncOfflineQueue().catch(() => undefined); };
  window.addEventListener('online', handleOnline);

  // Fast reconciliation after reconnect and while the connection is healthy.
  const interval = window.setInterval(() => {
    if (navigator.onLine) syncOfflineQueue().catch(() => undefined);
  }, 5000);

  // Background sync is best-effort where the browser exposes it.
  try {
    const registration = navigator.serviceWorker?.ready;
    registration?.then((reg: any) => {
      if ('sync' in reg) reg.sync.register('krown-offline-sync').catch(() => undefined);
    }).catch(() => undefined);
  } catch {}

  window.addEventListener('beforeunload', () => { syncOfflineQueue().catch(() => undefined); });
  (window as any).__krownOfflineCleanup = () => {
    window.removeEventListener('online', handleOnline);
    window.clearInterval(interval);
  };
}
