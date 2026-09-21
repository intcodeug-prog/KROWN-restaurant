import { NextRequest, NextResponse } from 'next/server';
import { getProduct, updateProduct, deleteProduct } from '@/lib/services/product.service';
import { extractVerifiedTenantContext } from '@/lib/tenant';
import { hasPermission } from '@/lib/rbac';

async function context(request: NextRequest) { return extractVerifiedTenantContext(request); }

function branchForbidden(ctx: any, product: any) {
  return !!ctx.branchId && !!product.branch_id && product.branch_id !== ctx.branchId;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await context(request);
  if (!ctx) return NextResponse.json({ error: 'Missing or invalid tenant session' }, { status: 401 });
  try {
    const { id } = await params;
    const product = await getProduct(ctx, id);
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    if (branchForbidden(ctx, product)) return NextResponse.json({ error: 'Forbidden: product belongs to another branch' }, { status: 403 });
    return NextResponse.json({ data: product });
  } catch (error: any) { return NextResponse.json({ error: error.message || 'Failed to get product' }, { status: 500 }); }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await context(request);
  if (!ctx) return NextResponse.json({ error: 'Missing or invalid tenant session' }, { status: 401 });
  if (!hasPermission(ctx.role, 'products:update')) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  try {
    const { id } = await params;
    const existing = await getProduct(ctx, id);
    if (!existing) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    if (branchForbidden(ctx, existing)) return NextResponse.json({ error: 'Forbidden: product belongs to another branch' }, { status: 403 });
    const body = await request.json();
    const product = await updateProduct(ctx, id, { name: body.name, price: body.price, category: body.category, category_id: body.categoryId, image: body.image, available: body.available, requires_kitchen: body.requiresKitchen, description: body.description, linked_ingredient_id: body.linkedIngredientId, deduct_from_inventory: body.deductFromInventory, inventory_deduct_amount: body.inventoryDeductAmount, add_ons: Array.isArray(body.addOns) ? body.addOns : undefined });
    return NextResponse.json({ data: product });
  } catch (error: any) {
    const status = String(error?.message || '').startsWith('Forbidden') ? 403 : 500;
    return NextResponse.json({ error: error.message || 'Failed to update product' }, { status });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await context(request);
  if (!ctx) return NextResponse.json({ error: 'Missing or invalid tenant session' }, { status: 401 });
  if (!hasPermission(ctx.role, 'products:delete')) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  try {
    const { id } = await params;
    const existing = await getProduct(ctx, id);
    if (!existing) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    if (branchForbidden(ctx, existing)) return NextResponse.json({ error: 'Forbidden: product belongs to another branch' }, { status: 403 });
    await deleteProduct(ctx, id);
    return NextResponse.json({ data: { success: true } });
  } catch (error: any) {
    const status = String(error?.message || '').startsWith('Forbidden') ? 403 : 500;
    return NextResponse.json({ error: error.message || 'Failed to delete product' }, { status });
  }
}
