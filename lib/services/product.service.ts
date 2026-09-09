// KROWN POS — Product CRUD + Recipe Management
import { getSql } from '@/lib/neon-server';
import { TenantContext, setTenantContext, checkSubscriptionLimit } from '@/lib/tenant';
import { generateId } from '@/lib/id';
import { logAudit } from '@/lib/audit';

// ── Types ──────────────────────────────────────────────────────────────────
export interface Product {
  id: string;
  organization_id: string;
  name: string;
  price: number;
  category: string;
  image: string;
  available: boolean;
  requires_kitchen: boolean;
  description?: string;
  branch_id?: string;
  linked_ingredient_id?: string;
  deduct_from_inventory: boolean;
  inventory_deduct_amount: number;
  created_at: number;
  updated_at: number;
}

export interface ProductIngredient {
  id: string;
  product_id: string;
  ingredient_id: string;
  quantity_per_unit: number;
  organization_id: string;
  branch_id?: string;
  created_at: number;
}

// ── Service Methods ────────────────────────────────────────────────────────

export async function listProducts(
  ctx: TenantContext,
  branchId?: string
): Promise<Product[]> {
  const sql = getSql();
  await setTenantContext(sql, ctx.organizationId);

  let rows;
  if (branchId) {
    rows = await sql`SELECT * FROM products WHERE organization_id = ${ctx.organizationId} AND (branch_id = ${branchId} OR branch_id IS NULL) ORDER BY name ASC`;
  } else {
    rows = await sql`SELECT * FROM products WHERE organization_id = ${ctx.organizationId} ORDER BY name ASC`;
  }

  return rows as Product[];
}

export async function getProduct(
  ctx: TenantContext,
  productId: string
): Promise<Product | null> {
  const sql = getSql();
  await setTenantContext(sql, ctx.organizationId);

  const rows = await sql`SELECT * FROM products WHERE id = ${productId} AND organization_id = ${ctx.organizationId}`;
  return rows.length > 0 ? (rows[0] as Product) : null;
}

export async function createProduct(
  ctx: TenantContext,
  input: {
    name: string;
    price: number;
    category: string;
    image?: string;
    available?: boolean;
    requiresKitchen?: boolean;
    description?: string;
    branchId?: string;
    linkedIngredientId?: string;
    deductFromInventory?: boolean;
    inventoryDeductAmount?: number;
  }
): Promise<Product> {
  const sql = getSql();
  await setTenantContext(sql, ctx.organizationId);

  // Menu limits are branch-scoped. This prevents one busy branch from
  // consuming the entire organization's menu allowance and blocking another
  // branch, while preserving the subscription limit itself.
  const targetBranchId = input.branchId || ctx.branchId || null;
  const countRows = targetBranchId
    ? await sql`SELECT COUNT(*)::int as count FROM products WHERE organization_id = ${ctx.organizationId} AND branch_id = ${targetBranchId}`
    : await sql`SELECT COUNT(*)::int as count FROM products WHERE organization_id = ${ctx.organizationId} AND branch_id IS NULL`;
  const currentCount = (countRows[0] as any).count;
  const limitCheck = await checkSubscriptionLimit(ctx.organizationId, 'menu_items', currentCount);
  if (!limitCheck.allowed) {
    throw new Error(`Subscription limit reached: ${limitCheck.current}/${limitCheck.limit} menu items for this branch. Please upgrade your plan.`);
  }

  const id = generateId();

  await sql`
    INSERT INTO products (id, organization_id, name, price, category, image, available, requires_kitchen, description, branch_id, linked_ingredient_id, deduct_from_inventory, inventory_deduct_amount, created_at, updated_at)
    VALUES (${id}, ${ctx.organizationId}, ${input.name}, ${input.price}, ${input.category}, ${input.image || ''}, ${input.available ?? true}, ${input.requiresKitchen ?? true}, ${input.description || null}, ${targetBranchId}, ${input.linkedIngredientId || null}, ${input.deductFromInventory ?? false}, ${input.inventoryDeductAmount ?? 0}, NOW(), NOW())
  `;

  await logAudit(ctx.userId, 'product.create', { productId: id, name: input.name }, ctx.organizationId, ctx.branchId);

  const rows = await sql`SELECT * FROM products WHERE id = ${id} AND organization_id = ${ctx.organizationId}`;
  return rows[0] as Product;
}

export async function updateProduct(
  ctx: TenantContext,
  productId: string,
  updates: Partial<Pick<Product, 'name' | 'price' | 'category' | 'image' | 'available' | 'requires_kitchen' | 'description' | 'linked_ingredient_id' | 'deduct_from_inventory' | 'inventory_deduct_amount'>>
): Promise<Product> {
  const sql = getSql();
  await setTenantContext(sql, ctx.organizationId);

  const existing = await sql`SELECT * FROM products WHERE id = ${productId} AND organization_id = ${ctx.organizationId}`;
  if (existing.length === 0) throw new Error('Product not found');

  const fields: string[] = [];
  const values: any[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(key);
      values.push(value);
    }
  }

  if (fields.length === 0) return existing[0] as Product;

  const setClauses = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
  values.push(productId, ctx.organizationId);

  await sql(`UPDATE products SET ${setClauses}, updated_at = NOW() WHERE id = $${fields.length + 1} AND organization_id = $${fields.length + 2}`, values);

  await logAudit(ctx.userId, 'product.update', { productId, fields }, ctx.organizationId, ctx.branchId);

  const rows = await sql`SELECT * FROM products WHERE id = ${productId} AND organization_id = ${ctx.organizationId}`;
  return rows[0] as Product;
}

export async function deleteProduct(
  ctx: TenantContext,
  productId: string
): Promise<void> {
  const sql = getSql();
  await setTenantContext(sql, ctx.organizationId);

  const existing = await sql`SELECT * FROM products WHERE id = ${productId} AND organization_id = ${ctx.organizationId}`;
  if (existing.length === 0) throw new Error('Product not found');

  await sql`DELETE FROM product_ingredients WHERE product_id = ${productId} AND organization_id = ${ctx.organizationId}`;
  await sql`DELETE FROM products WHERE id = ${productId} AND organization_id = ${ctx.organizationId}`;

  await logAudit(ctx.userId, 'product.delete', { productId }, ctx.organizationId, ctx.branchId);
}

export async function toggleAvailability(
  ctx: TenantContext,
  productId: string
): Promise<Product> {
  const sql = getSql();
  await setTenantContext(sql, ctx.organizationId);

  const rows = await sql`SELECT * FROM products WHERE id = ${productId} AND organization_id = ${ctx.organizationId}`;
  if (rows.length === 0) throw new Error('Product not found');
  const product = rows[0] as Product;

  const newAvailability = !product.available;

  await sql`
    UPDATE products SET available = ${newAvailability}, updated_at = NOW()
    WHERE id = ${productId} AND organization_id = ${ctx.organizationId}
  `;

  await logAudit(ctx.userId, 'product.toggle_availability', { productId, available: newAvailability }, ctx.organizationId, ctx.branchId);

  const updated = await sql`SELECT * FROM products WHERE id = ${productId} AND organization_id = ${ctx.organizationId}`;
  return updated[0] as Product;
}

export async function getRecipe(
  ctx: TenantContext,
  productId: string
): Promise<ProductIngredient[]> {
  const sql = getSql();
  await setTenantContext(sql, ctx.organizationId);

  const rows = await sql`SELECT * FROM product_ingredients WHERE product_id = ${productId} AND organization_id = ${ctx.organizationId}`;
  return rows as ProductIngredient[];
}

export async function saveRecipe(
  ctx: TenantContext,
  productId: string,
  ingredients: { ingredientId: string; quantityPerUnit: number }[]
): Promise<ProductIngredient[]> {
  const sql = getSql();
  await setTenantContext(sql, ctx.organizationId);

  const existing = await sql`SELECT * FROM products WHERE id = ${productId} AND organization_id = ${ctx.organizationId}`;
  if (existing.length === 0) throw new Error('Product not found');

  const now = Date.now();

  await sql`DELETE FROM product_ingredients WHERE product_id = ${productId} AND organization_id = ${ctx.organizationId}`;

  const saved: ProductIngredient[] = [];
  for (const ing of ingredients) {
    const id = generateId();
    await sql`
      INSERT INTO product_ingredients (id, product_id, ingredient_id, quantity_per_unit, organization_id, branch_id, created_at)
      VALUES (${id}, ${productId}, ${ing.ingredientId}, ${ing.quantityPerUnit}, ${ctx.organizationId}, ${ctx.branchId}, NOW())
    `;
    saved.push({
      id,
      product_id: productId,
      ingredient_id: ing.ingredientId,
      quantity_per_unit: ing.quantityPerUnit,
      organization_id: ctx.organizationId,
      created_at: now,
    });
  }

  await logAudit(ctx.userId, 'product.save_recipe', { productId, ingredientCount: ingredients.length }, ctx.organizationId, ctx.branchId);
  return saved;
}
