import { NextRequest, NextResponse } from 'next/server';
import { getSql } from '@/lib/neon-server';
import { extractVerifiedTenantContext } from '@/lib/tenant';
import { hasPermission } from '@/lib/rbac';
import { assertBranchAccess } from '@/lib/access-control';

export async function GET(request: NextRequest) {
  const ctx = await extractVerifiedTenantContext(request);
  if (!ctx) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!hasPermission(ctx.role, 'orders:view')) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });

  const branchId = request.nextUrl.searchParams.get('branchId') || ctx.branchId;
  if (!branchId) return NextResponse.json({ error: 'Branch is required' }, { status: 400 });

  try {
    await assertBranchAccess(ctx, branchId);
    const sql = getSql();
    const rows = await sql`
      SELECT
        COUNT(*) FILTER (WHERE status <> 'cancelled' AND payment_status IN ('paid','partial','partially_paid'))::int AS settled_orders,
        COUNT(*) FILTER (WHERE status <> 'cancelled' AND payment_status NOT IN ('paid','partial','partially_paid') AND status <> 'completed')::int AS open_orders,
        COALESCE(SUM(CASE WHEN status <> 'cancelled' AND payment_status IN ('paid','partial','partially_paid') THEN COALESCE(paid_amount, 0) ELSE 0 END), 0) AS collected,
        COALESCE(SUM(CASE WHEN status <> 'cancelled' AND (payment_status IN ('paid','partial','partially_paid') OR status = 'completed') THEN total ELSE 0 END), 0) AS sales,
        COALESCE(SUM(CASE WHEN status <> 'cancelled' AND payment_status IN ('paid','partial','partially_paid') THEN (
          SELECT COALESCE(SUM(COALESCE((item->>'quantity')::numeric, 0)), 0)
          FROM jsonb_array_elements(COALESCE(items::jsonb, '[]'::jsonb)) item
        ) ELSE 0 END), 0) AS plates
      FROM orders
      WHERE organization_id = ${ctx.organizationId}
        AND restaurant_id = ${branchId}
        AND created_at >= date_trunc('day', NOW())
        AND created_at < date_trunc('day', NOW()) + INTERVAL '1 day'
    `;

    const row: any = rows[0] || {};
    return NextResponse.json({
      data: {
        collected: Number(row.collected || 0),
        sales: Number(row.sales || 0),
        settledOrders: Number(row.settled_orders || 0),
        openOrders: Number(row.open_orders || 0),
        plates: Number(row.plates || 0),
        asOf: new Date().toISOString(),
      },
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error: any) {
    const message = error?.message || 'Unable to load today\'s collection summary';
    return NextResponse.json({ error: message }, { status: /Forbidden/i.test(message) ? 403 : 500 });
  }
}
