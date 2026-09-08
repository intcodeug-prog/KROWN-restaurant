import { NextRequest, NextResponse } from 'next/server';
import { getOrder } from '@/lib/services/order.service';
import { extractTenantContext } from '@/lib/tenant';
import { hasPermission } from '@/lib/rbac';

function normalizePaymentState(order: any) {
  if (order?.payment_status === 'paid' && Number(order?.paid_amount || 0) <= 0) {
    return { ...order, payment_status: 'unpaid', status: order.status === 'completed' ? 'pending' : order.status };
  }
  return order;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = extractTenantContext(request);
  if (!ctx) return NextResponse.json({ error: 'Missing tenant context' }, { status: 401 });
  if (!hasPermission(ctx.role, 'orders:view')) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  try {
    const { id } = await params;
    const order = await getOrder(ctx, id);
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    return NextResponse.json({ data: normalizePaymentState(order) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to get order' }, { status: 500 });
  }
}
