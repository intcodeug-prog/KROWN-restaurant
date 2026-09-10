import { NextRequest, NextResponse } from 'next/server';
import * as companyService from '@/lib/services/company.service';
import { extractVerifiedTenantContext } from '@/lib/tenant';
import { hasPermission } from '@/lib/rbac';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await extractVerifiedTenantContext(request);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(ctx.role, 'companies:read_staff')) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  try {
    const { id } = await params;
    return NextResponse.json({ data: await companyService.listCompanyStaff(ctx, id) });
  } catch (error: any) {
    const message = error?.message || 'Failed to list company staff';
    return NextResponse.json({ error: message }, { status: /not found/i.test(message) ? 404 : 400 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await extractVerifiedTenantContext(request);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(ctx.role, 'companies:manage_staff')) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  try {
    const { id } = await params;
    const body = await request.json();
    const name = String(body?.name || '').trim();
    if (!name) return NextResponse.json({ error: 'Staff name is required' }, { status: 400 });
    const staff = await companyService.addCompanyStaff(ctx, id, {
      name,
      workId: body?.workId,
      email: body?.email,
      department: body?.department,
      creditLimitUGX: body?.creditLimitUGX,
    });
    return NextResponse.json({ data: staff }, { status: 201 });
  } catch (error: any) {
    const message = error?.message || 'Failed to add company staff';
    return NextResponse.json({ error: message }, { status: /not found/i.test(message) ? 404 : 400 });
  }
}
