import { NextRequest, NextResponse } from 'next/server';
import { getSql } from '@/lib/neon-server';
import { extractVerifiedTenantContext } from '@/lib/tenant';

function parseDate(value: string | null, fallback: Date) {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

export async function GET(request: NextRequest) {
  const ctx = await extractVerifiedTenantContext(request);
  if (!ctx || ctx.role !== 'super_admin') {
    return NextResponse.json({ error: 'Super Admin access required' }, { status: 403 });
  }

  const organizationId = request.nextUrl.searchParams.get('organizationId');
  if (!organizationId || !/^[0-9a-fA-F-]{36}$/.test(organizationId)) {
    return NextResponse.json({ error: 'A valid restaurant is required' }, { status: 400 });
  }

  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const defaultTo = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const from = parseDate(request.nextUrl.searchParams.get('from'), defaultFrom);
  const to = parseDate(request.nextUrl.searchParams.get('to'), defaultTo);
  if (to <= from) return NextResponse.json({ error: 'The To date must be after the From date' }, { status: 400 });

  try {
    const sql = getSql();

    // Verify the target tenant exists before returning any tenant-level figures.
    const orgRows = await sql`SELECT id, name FROM organizations WHERE id=${organizationId} LIMIT 1`;
    if (!orgRows.length) return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });

    const [summaryRows, timelineRows, branchesRows] = await Promise.all([
      sql`
        SELECT
          COUNT(*) FILTER (WHERE status <> 'cancelled' AND (payment_status IN ('paid','partial','partially_paid') OR status='completed'))::int AS orders,
          COUNT(*) FILTER (WHERE status <> 'cancelled' AND payment_status IN ('paid','partial','partially_paid'))::int AS paid_orders,
          COUNT(*) FILTER (WHERE status <> 'cancelled' AND payment_status NOT IN ('paid','partial','partially_paid') AND status <> 'completed')::int AS unpaid_orders,
          COALESCE(SUM(CASE WHEN status <> 'cancelled' AND payment_status IN ('paid','partial','partially_paid') THEN COALESCE(paid_amount,0) ELSE 0 END),0) AS collected,
          COALESCE(SUM(CASE WHEN status <> 'cancelled' AND (payment_status IN ('paid','partial','partially_paid') OR status='completed') THEN total ELSE 0 END),0) AS sales,
          COALESCE(SUM(CASE WHEN status <> 'cancelled' AND (payment_status IN ('paid','partial','partially_paid') OR status='completed') THEN (
            SELECT COALESCE(SUM((item->>'quantity')::numeric),0)
            FROM jsonb_array_elements(COALESCE(items::jsonb,'[]'::jsonb)) item
          ) ELSE 0 END),0) AS meals
        FROM orders
        WHERE organization_id=${organizationId}
          AND created_at >= ${from.toISOString()}::timestamptz
          AND created_at < ${to.toISOString()}::timestamptz
      `,
      sql`
        SELECT
          DATE(created_at) AS date,
          COALESCE(SUM(CASE WHEN status <> 'cancelled' AND payment_status IN ('paid','partial','partially_paid') THEN COALESCE(paid_amount,0) ELSE 0 END),0) AS collected,
          COALESCE(SUM(CASE WHEN status <> 'cancelled' AND (payment_status IN ('paid','partial','partially_paid') OR status='completed') THEN total ELSE 0 END),0) AS revenue,
          COUNT(*) FILTER (WHERE status <> 'cancelled' AND (payment_status IN ('paid','partial','partially_paid') OR status='completed'))::int AS orders,
          COALESCE(SUM(CASE WHEN status <> 'cancelled' AND (payment_status IN ('paid','partial','partially_paid') OR status='completed') THEN (
            SELECT COALESCE(SUM((item->>'quantity')::numeric),0)
            FROM jsonb_array_elements(COALESCE(items::jsonb,'[]'::jsonb)) item
          ) ELSE 0 END),0) AS meals
        FROM orders
        WHERE organization_id=${organizationId}
          AND created_at >= ${from.toISOString()}::timestamptz
          AND created_at < ${to.toISOString()}::timestamptz
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `,
      sql`
        SELECT COUNT(*)::int AS branches
        FROM branches
        WHERE organization_id=${organizationId}
      `,
    ]);

    const summary = summaryRows[0] || {};
    const orders = Number(summary.orders || 0);
    const sales = Number(summary.sales || 0);
    return NextResponse.json({
      data: {
        organization: orgRows[0],
        range: { from: from.toISOString(), to: to.toISOString() },
        summary: {
          collected: Number(summary.collected || 0),
          sales,
          meals: Number(summary.meals || 0),
          orders,
          paidOrders: Number(summary.paid_orders || 0),
          unpaidOrders: Number(summary.unpaid_orders || 0),
          averageOrder: orders ? Math.round(sales / orders) : 0,
          branches: Number(branchesRows[0]?.branches || 0),
        },
        timeline: timelineRows.map((row: any) => ({
          date: row.date,
          collected: Number(row.collected || 0),
          revenue: Number(row.revenue || 0),
          meals: Number(row.meals || 0),
          orders: Number(row.orders || 0),
        })),
      },
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error: any) {
    console.error('Restaurant analytics error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to load restaurant analytics' }, { status: 500 });
  }
}
