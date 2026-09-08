import { NextRequest, NextResponse } from 'next/server';
import { listIngredients, createIngredient } from '@/lib/services/ingredient.service';
import { extractTenantContext } from '@/lib/tenant';
import { hasPermission } from '@/lib/rbac';
import { assertBranchAccess } from '@/lib/access-control';

export async function GET(request: NextRequest) {
  const ctx = extractTenantContext(request);
  if (!ctx) {
    return NextResponse.json({ error: 'Missing tenant context' }, { status: 401 });
  }

  try {
    const branchId = request.nextUrl.searchParams.get('branchId') || ctx.branchId || undefined;
    if (branchId) await assertBranchAccess(ctx, branchId);
    const ingredients = await listIngredients(ctx, branchId);
    return NextResponse.json({ data: ingredients });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to list ingredients' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const ctx = extractTenantContext(request);
  if (!ctx) {
    return NextResponse.json({ error: 'Missing tenant context' }, { status: 401 });
  }

  if (!hasPermission(ctx.role, 'ingredients:create')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const ingredient = await createIngredient(ctx, {
      name: body.name,
      quantity: body.quantity,
      unit: body.unit,
      minThreshold: body.minThreshold,
      category: body.category,
      costPerUnitUGX: body.costPerUnitUGX,
      supplier: body.supplier,
      branchId: body.branchId,
      linkedProductId: body.linkedProductId,
      deductFromSales: body.deductFromSales,
      deductAmountPerSale: body.deductAmountPerSale,
    });
    return NextResponse.json({ data: ingredient }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to create ingredient' }, { status: 500 });
  }
}
