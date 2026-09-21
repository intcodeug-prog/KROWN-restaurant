import { NextRequest, NextResponse } from 'next/server';
import { listProducts, createProduct } from '@/lib/services/product.service';
import { extractVerifiedTenantContext } from '@/lib/tenant';
import { hasPermission } from '@/lib/rbac';
import { assertBranchAccess } from '@/lib/access-control';

export async function GET(request: NextRequest) {
  const ctx = await extractVerifiedTenantContext(request);
  if (!ctx) return NextResponse.json({ error: 'Missing or invalid tenant session' }, { status: 401 });
  try {
    const requestedBranch = request.nextUrl.searchParams.get('branchId');
    const branchId = requestedBranch || ctx.branchId || undefined;
    if (branchId) await assertBranchAccess(ctx, branchId);
    const products = await listProducts(ctx, branchId);
    return NextResponse.json({ data: products });
  } catch (error: any) {
    const status = String(error?.message || '').startsWith('Forbidden') ? 403 : 500;
    return NextResponse.json({ error: error.message || 'Failed to list products' }, { status });
  }
}

export async function POST(request: NextRequest) {
  const ctx = await extractVerifiedTenantContext(request);
  if (!ctx) return NextResponse.json({ error: 'Missing or invalid tenant session' }, { status: 401 });
  if (!hasPermission(ctx.role, 'products:create')) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  try {
    const body = await request.json();
    const branchId = body.branchId || ctx.branchId;
    if (!branchId) return NextResponse.json({ error: 'Branch is required' }, { status: 400 });
    await assertBranchAccess(ctx, branchId);
    const product = await createProduct(ctx, {
      name: body.name, price: body.price, category: body.category, categoryId: body.categoryId, image: body.image,
      available: body.available, requiresKitchen: body.requiresKitchen, description: body.description,
      branchId, linkedIngredientId: body.linkedIngredientId, deductFromInventory: body.deductFromInventory,
      addOns: Array.isArray(body.addOns) ? body.addOns : [],
      inventoryDeductAmount: body.inventoryDeductAmount,
    });
    return NextResponse.json({ data: product }, { status: 201 });
  } catch (error: any) {
    const message = error?.message || 'Failed to create product';
    const status = message.startsWith('Forbidden') ? 403 : message.startsWith('Subscription limit reached') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
