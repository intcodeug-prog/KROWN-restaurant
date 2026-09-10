import { NextRequest, NextResponse } from 'next/server';
import * as zoneService from '@/lib/services/zone.service';
import { extractTenantContext } from '@/lib/tenant';
import { hasPermission } from '@/lib/rbac';
import { getSql } from '@/lib/neon-server';

export async function GET(request: NextRequest) {
  const ctx = extractTenantContext(request);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(ctx.role, 'zones:read')) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  try {
    const branchId = request.nextUrl.searchParams.get('branchId') || ctx.branchId || undefined;
    const zones = await zoneService.listZones(ctx, branchId);
    return NextResponse.json({ data: zones });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to list zones' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const ctx = extractTenantContext(request);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(ctx.role, 'zones:create')) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });

  try {
    const body = await request.json();
    const name = String(body?.name || '').trim().slice(0, 160);
    const branchId = body?.branchId || ctx.branchId;
    if (!name) return NextResponse.json({ error: 'Zone name is required' }, { status: 400 });
    if (!branchId) return NextResponse.json({ error: 'Branch is required' }, { status: 400 });

    // Prevent repeated seeding/retry requests from creating another copy of the
    // same zone. The production DB also receives a targeted unique constraint for
    // the known B Section incident; this application check covers normal creation.
    const sql = getSql();
    const existing = await sql`SELECT * FROM zones WHERE organization_id=${ctx.organizationId} AND branch_id=${branchId} AND lower(trim(name))=lower(${name}) LIMIT 1`;
    if (existing.length) return NextResponse.json({ data: existing[0], existing: true }, { status: 200 });

    const zone = await zoneService.createZone(ctx, {
      name,
      icon: typeof body.icon === 'string' ? body.icon.slice(0, 20) : undefined,
      description: typeof body.description === 'string' ? body.description.slice(0, 500) : undefined,
      branchId,
      branchName: typeof body.branchName === 'string' ? body.branchName.slice(0, 160) : undefined,
      tables: Array.isArray(body.tables) ? body.tables : [],
    });
    return NextResponse.json({ data: zone }, { status: 201 });
  } catch (error: any) {
    // A unique constraint race is safe to surface as the existing resource on
    // the next read; never create a second copy as a retry workaround.
    return NextResponse.json({ error: error.message || 'Failed to create zone' }, { status: 500 });
  }
}
