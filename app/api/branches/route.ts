import { NextRequest, NextResponse } from 'next/server';
import * as branchService from '@/lib/services/branch.service';
import { extractTenantContext } from '@/lib/tenant';
import { hasPermission } from '@/lib/rbac';

export async function GET(request: NextRequest) {
  const ctx = await extractTenantContext(request);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(ctx.role, 'branches:read')) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  try {
    return NextResponse.json({ data: await branchService.listBranches(ctx) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to list branches' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const ctx = await extractTenantContext(request);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(ctx.role, 'branches:create')) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  if (!ctx.isSuperAdmin && !['restaurant_admin', 'Restaurant Admin'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Only restaurant administrators can create branches' }, { status: 403 });
  }
  try {
    const body = await request.json();
    const { name, location, city, manager, phone, email, taxId, address, receiptHeaderNote, receiptFooterNote, tablesCount } = body;
    if (!name?.trim()) return NextResponse.json({ error: 'Branch name is required' }, { status: 400 });
    if (!location?.trim()) return NextResponse.json({ error: 'Branch location is required' }, { status: 400 });

    const branch = await branchService.createBranch(ctx, {
      name: name.trim(),
      location: location.trim(),
      city,
      manager: manager || '',
      phone: phone || '',
      email,
      taxId,
      address,
      receiptHeaderNote,
      receiptFooterNote,
      tablesCount,
    });

    return NextResponse.json({ data: branch }, { status: 201 });
  } catch (error: any) {
    const message = error?.message || 'Failed to create branch';
    const status = /subscription limit reached/i.test(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
