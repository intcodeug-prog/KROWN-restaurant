// KROWN POS — Next.js API Middleware
// Cryptographic JWT gate + coarse rate limiting. Route handlers remain the
// authoritative source for database-backed session, tenant and RBAC checks.

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const configuredSecret = process.env.JWT_SECRET;
if (!configuredSecret || configuredSecret.length < 32) {
  throw new Error('JWT_SECRET must be configured and at least 32 characters long.');
}
const JWT_SECRET = new TextEncoder().encode(configuredSecret);

const PUBLIC_ROUTES = [
  '/api/auth/login',
  '/api/auth/pin-login',
  '/api/super-admin/login',
  '/api/auth/refresh',
  '/api/health',
  '/api/reset-password',
  '/_next',
  '/favicon.ico',
  '/manifest.json',
  '/icon.svg',
  '/sw.js',
];

// This is intentionally a best-effort per-process limiter. It protects a
// single runtime instance; distributed deployments should additionally use a
// shared limiter at the edge/API gateway.
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count += 1;
  return true;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';

  if (!checkRateLimit(`api:${ip}`, 100, 60_000)) {
    return NextResponse.json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } }, { status: 429 });
  }

  if (pathname.startsWith('/api/auth/')) {
    if (!checkRateLimit(`auth:${ip}`, 5, 60_000)) {
      return NextResponse.json({ success: false, error: { code: 'AUTH_RATE_LIMITED', message: 'Too many authentication attempts' } }, { status: 429 });
    }
  }

  const authHeader = request.headers.get('authorization');
  const bearer = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  const token = bearer || request.cookies.get('krown_session')?.value;

  if (!token) {
    return NextResponse.json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } }, { status: 401 });
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: 'krown-pos',
      algorithms: ['HS256'],
    });

    if (typeof payload.sub !== 'string' || typeof payload.org !== 'string' || typeof payload.role !== 'string') {
      return NextResponse.json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid authentication token' } }, { status: 401 });
    }

    if (pathname.startsWith('/api/super-admin/') && payload.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Super Admin access required' } }, { status: 403 });
    }

    // These headers are derived from the verified token and are informational
    // context only. Application routes must never trust client-supplied values;
    // critical handlers call extractVerifiedTenantContext/getSession directly.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-krown-authenticated', 'true');
    requestHeaders.set('x-org-id', payload.org);
    requestHeaders.set('x-user-id', payload.sub);
    requestHeaders.set('x-user-role', payload.role);
    if (typeof payload.branch === 'string') requestHeaders.set('x-branch-id', payload.branch);

    return NextResponse.next({ request: { headers: requestHeaders } });
  } catch (error: unknown) {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';
    const expired = code === 'ERR_JWT_EXPIRED';
    return NextResponse.json({
      success: false,
      error: { code: expired ? 'SESSION_EXPIRED' : 'INVALID_TOKEN', message: expired ? 'Session expired' : 'Invalid authentication token' },
    }, { status: 401 });
  }
}

export const config = { matcher: ['/api/:path*'] };
