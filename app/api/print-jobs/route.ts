import { NextRequest, NextResponse } from 'next/server';
import * as printService from '@/lib/services/print.service';
import { extractTenantContext } from '@/lib/tenant';
import { hasPermission } from '@/lib/rbac';

export async function GET(request: NextRequest) {
  const ctx = extractTenantContext(request);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(ctx.role, 'print_jobs:create') && !hasPermission(ctx.role, 'print_jobs:update')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }
  try {
    const orderId = request.nextUrl.searchParams.get('orderId') || undefined;
    const printJobs = await printService.listPrintJobs(ctx, orderId);
    return NextResponse.json({ data: printJobs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to list print jobs' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const ctx = extractTenantContext(request);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(ctx.role, 'print_jobs:create')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }
  try {
    const body = await request.json();
    const { id, orderId, type, destination, printerId, payload } = body;
    if (!type?.trim()) return NextResponse.json({ error: 'Print job type is required' }, { status: 400 });
    if (!destination?.trim()) return NextResponse.json({ error: 'Print destination is required' }, { status: 400 });

    const printJob = await printService.createPrintJob(ctx, {
      id: typeof id === 'string' && id.trim() ? id.trim() : undefined,
      orderId,
      type: type.trim(),
      destination: destination.trim(),
      printerId,
      payload: payload || {},
    });
    return NextResponse.json({ data: printJob }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to create print job' }, { status: 500 });
  }
}
