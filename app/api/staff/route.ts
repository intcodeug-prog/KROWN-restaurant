import { NextRequest, NextResponse } from 'next/server';
import { extractTenantContext } from '@/lib/tenant';
import { listStaff, createStaff } from '@/lib/services/staff.service';
import { hasPermission, isPlatformRole, normalizeRole } from '@/lib/rbac';
import { assertBranchAccess } from '@/lib/access-control';

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const status = message.startsWith('Forbidden') ? 403 : message === 'Staff not found' ? 404 : 500;
  return NextResponse.json({ data: null, error: message }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const ctx = extractTenantContext(request);
    if (!ctx) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(ctx.role, 'staff:view')) return NextResponse.json({ data: null, error: 'Insufficient permissions' }, { status: 403 });

    const branchId = request.nextUrl.searchParams.get('branchId') || ctx.branchId || undefined;
    if (branchId) await assertBranchAccess(ctx, branchId);
    const staff = await listStaff(ctx, branchId);
    return NextResponse.json({ data: staff });
  } catch (e) {
    return errorResponse(e, 'Failed to list staff');
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = extractTenantContext(request);
    if (!ctx) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(ctx.role, 'staff:create')) return NextResponse.json({ data: null, error: 'Insufficient permissions' }, { status: 403 });

    const body = await request.json();
    const { name, email, phone, pin, password, idType, idNumber, role, branchId: rawBranchId, avatar } = body;
    const branchId = rawBranchId && rawBranchId !== 'all' ? rawBranchId : ctx.branchId || undefined;
    if (!name?.trim() || !email?.trim() || !role) return NextResponse.json({ data: null, error: 'Name, email, and role are required' }, { status: 400 });
    if (!password && !pin) return NextResponse.json({ data: null, error: 'A password or PIN is required' }, { status: 400 });
    if (!branchId && !isPlatformRole(ctx.role)) return NextResponse.json({ data: null, error: 'Branch assignment is required' }, { status: 400 });
    if (branchId) await assertBranchAccess(ctx, branchId);

    const normalizedRole = normalizeRole(role);
    if (normalizedRole === 'super_admin') return NextResponse.json({ data: null, error: 'Cannot create super_admin via staff API' }, { status: 403 });
    const allowed = isPlatformRole(ctx.role) || normalizedRole === 'cashier' || normalizedRole === 'waiter' || normalizedRole === 'kitchen_staff' || (normalizeRole(ctx.role) === 'restaurant_admin' && ['manager', 'cashier', 'waiter', 'kitchen_staff'].includes(normalizedRole));
    if (!allowed) return NextResponse.json({ data: null, error: 'You cannot assign this role' }, { status: 403 });

    const staff = await createStaff(ctx, { name, email, phone, pin, password, idType, idNumber, role: normalizedRole, branchId, avatar });
    return NextResponse.json({ data: staff }, { status: 201 });
  } catch (e) {
    return errorResponse(e, 'Failed to create staff');
  }
}
