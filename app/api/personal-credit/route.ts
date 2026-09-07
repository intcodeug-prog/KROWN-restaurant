import { NextRequest, NextResponse } from 'next/server';
import { extractVerifiedTenantContext } from '@/lib/tenant';
import { createPersonalCreditProfile, listPersonalCreditProfiles, getCreditDashboard, getCreditReports, listAllCreditsSuperAdmin } from '@/lib/services/personal-credit.service';

export async function GET(request: NextRequest) {
  try {
    const ctx = await extractVerifiedTenantContext(request);
    if (!ctx) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    const params = new URL(request.url).searchParams;
    const branchId = params.get('branchId') || undefined;
    const status = params.get('status') || undefined;
    const search = params.get('search') || undefined;
    const page = parseInt(params.get('page') || '1');
    const limit = parseInt(params.get('limit') || '50');
    const view = params.get('view');

    if (view === 'dashboard') {
      const data = await getCreditDashboard(ctx, branchId);
      return NextResponse.json({ data });
    }
    if (view === 'reports') {
      const reportType = params.get('reportType') || 'outstanding';
      const dateFrom = params.get('dateFrom') || undefined;
      const dateTo = params.get('dateTo') || undefined;
      const data = await getCreditReports(ctx, reportType, branchId, dateFrom, dateTo);
      return NextResponse.json({ data });
    }
    if (ctx.isSuperAdmin && params.get('all') === 'true') {
      const data = await listAllCreditsSuperAdmin(ctx, search, status, page, limit);
      return NextResponse.json({ data });
    }
    const data = await listPersonalCreditProfiles(ctx, branchId, status, search, page, limit);
    return NextResponse.json({ data });
  } catch (e: any) {
    const status = /restricted|insufficient|branch is required|not found/i.test(e?.message || '') ? 403 : 400;
    return NextResponse.json({ data: null, error: e?.message || 'Unable to load personal credit' }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await extractVerifiedTenantContext(request);
    if (!ctx) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const data = await createPersonalCreditProfile(ctx, {
      branchId: body.branchId,
      fullName: body.fullName,
      phone: body.phone,
      email: body.email,
      creditLimitUgx: body.creditLimitUgx,
      notes: body.notes,
      dueDate: body.dueDate,
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (e: any) {
    const message = e?.message || 'Unable to create personal credit profile';
    const status = /restricted|insufficient|branch is required/i.test(message) ? 403 : 400;
    return NextResponse.json({ data: null, error: message }, { status });
  }
}
