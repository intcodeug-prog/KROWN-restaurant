import { NextRequest, NextResponse } from 'next/server';
import { extractVerifiedTenantContext } from '@/lib/tenant';
import { listCategories, createCategory } from '@/lib/services/category.service';
import { hasPermission } from '@/lib/rbac';

export async function GET(request: NextRequest) {
  try {
    const ctx = await extractVerifiedTenantContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const categories = await listCategories(ctx);
    return NextResponse.json({ data: categories });
  } catch (e: any) {
    const message = e.message || 'Internal server error';
    const status = message === 'Category already exists for this branch' ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = extractTenantContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(ctx.role, 'categories:create')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { name, icon, description, sort_order } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Category name is required' }, { status: 400 });
    }

    const category = await createCategory(ctx, { name: name.trim(), icon, description, sort_order });
    return NextResponse.json({ data: category }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
