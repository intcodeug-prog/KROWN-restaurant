import { NextRequest, NextResponse } from 'next/server';
import * as printerService from '@/lib/services/printer-configuration.service';
import { extractVerifiedTenantContext } from '@/lib/tenant';
import { hasPermission } from '@/lib/rbac';

export async function GET(request: NextRequest) {
  const ctx = await extractVerifiedTenantContext(request);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(ctx.role, 'print_jobs:create') && !hasPermission(ctx.role, 'print_jobs:update')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }
  const branchId = request.nextUrl.searchParams.get('branchId') || ctx.branchId;
  if (!branchId) return NextResponse.json({ error: 'Branch is required' }, { status: 400 });
  try { return NextResponse.json({ data: await printerService.listPrinters(ctx, branchId) }); }
  catch (e: any) { return NextResponse.json({ error: e.message || 'Failed to load printers' }, { status: e.message?.startsWith('Forbidden') ? 403 : 500 }); }
}

export async function POST(request: NextRequest) {
  const ctx = await extractVerifiedTenantContext(request);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(ctx.role, 'print_jobs:create')) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const branchId = body.branchId || ctx.branchId;
  if (!branchId) return NextResponse.json({ error: 'Branch is required' }, { status: 400 });
  try {
    const data = await printerService.createPrinter(ctx, branchId, body);
    return NextResponse.json({ data }, { status: 201 });
  } catch (e: any) {
    const status = e.message?.startsWith('Forbidden') ? 403 : e.message?.includes('required') || e.message?.startsWith('Invalid') ? 400 : 500;
    return NextResponse.json({ error: e.message || 'Failed to create printer' }, { status });
  }
}
