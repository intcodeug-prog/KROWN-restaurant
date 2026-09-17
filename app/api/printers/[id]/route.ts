import { NextRequest, NextResponse } from 'next/server';
import * as printerService from '@/lib/services/printer-configuration.service';
import { extractVerifiedTenantContext } from '@/lib/tenant';
import { hasPermission } from '@/lib/rbac';

async function context(request: NextRequest) {
  const ctx = await extractVerifiedTenantContext(request);
  if (!ctx) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!hasPermission(ctx.role, 'print_jobs:update')) return { error: NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 }) };
  return { ctx };
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await context(request); if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({}));
  const branchId = body.branchId || auth.ctx.branchId;
  if (!branchId) return NextResponse.json({ error: 'Branch is required' }, { status: 400 });
  try { return NextResponse.json({ data: await printerService.updatePrinter(auth.ctx, branchId, (await params).id, body) }); }
  catch (e: any) { return NextResponse.json({ error: e.message || 'Failed to update printer' }, { status: e.message === 'Printer not found' ? 404 : e.message?.startsWith('Forbidden') ? 403 : 400 }); }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await context(request); if (auth.error) return auth.error;
  const branchId = request.nextUrl.searchParams.get('branchId') || auth.ctx.branchId;
  if (!branchId) return NextResponse.json({ error: 'Branch is required' }, { status: 400 });
  try { return NextResponse.json({ data: await printerService.deletePrinter(auth.ctx, branchId, (await params).id) }); }
  catch (e: any) { return NextResponse.json({ error: e.message || 'Failed to delete printer' }, { status: e.message === 'Printer not found' ? 404 : 403 }); }
}
