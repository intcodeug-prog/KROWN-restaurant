import { getSql } from '@/lib/neon-server';
import { TenantContext, setTenantContext } from '@/lib/tenant';
import { assertBranchAccess } from '@/lib/access-control';
import { generateId } from '@/lib/id';
import { logAudit } from '@/lib/audit';
import * as inventoryService from '@/lib/services/inventory.service';
import type { Order, OrderItem } from '@/lib/services/order.service';

const VAT_RATE = 0.18;

export async function createIdempotentOrder(ctx: TenantContext, input: {
  branchId: string;
  tableNumber: string;
  seat?: string;
  type?: string;
  place?: string;
  items: { productId: string; quantity: number; notes?: string; addOns?: { name:string; price:number }[] }[];
  staffId: string;
  companyName?: string;
  tin?: string;
  companyId?: string;
  idempotencyKey: string;
  orderId?: string;
}): Promise<{ order: Order; replayed: boolean }> {
  await assertBranchAccess(ctx, input.branchId);
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(input.idempotencyKey)) throw new Error('Invalid idempotency key');
  const sql = getSql();
  await setTenantContext(sql, ctx.organizationId);

  const existing = await sql`SELECT * FROM orders WHERE organization_id=${ctx.organizationId} AND idempotency_key=${input.idempotencyKey} LIMIT 1`;
  if (existing.length) return { order: existing[0] as Order, replayed: true };

  let subtotal = 0;
  const processedItems: OrderItem[] = [];
  for (const item of input.items) {
    const rows = await sql`SELECT id,name,price,available FROM products WHERE id=${item.productId} AND organization_id=${ctx.organizationId} AND (branch_id=${input.branchId} OR branch_id IS NULL) LIMIT 1`;
    if (!rows.length) throw new Error(`Product not found: ${item.productId}`);
    const product = rows[0] as any;
    if (!product.available) throw new Error(`Product unavailable: ${product.name}`);
    const qty = Number(item.quantity);
    if (!Number.isFinite(qty) || qty <= 0) throw new Error('Invalid order quantity');
    let itemTotal = Number(product.price) * qty;
    for (const addOn of item.addOns || []) itemTotal += Number(addOn.price) * qty;
    subtotal += itemTotal;
    processedItems.push({ productId:item.productId, quantity:qty, unitPrice:Number(product.price), name:product.name, notes:item.notes, addOns:item.addOns });
  }
  const tax = Math.round(subtotal * VAT_RATE);
  const total = subtotal + tax;

  if (input.companyId) {
    const companies = await sql`SELECT credit_limit_ugx,current_balance_ugx,status FROM companies WHERE id=${input.companyId} AND organization_id=${ctx.organizationId} AND branch_id=${input.branchId} LIMIT 1`;
    if (!companies.length) throw new Error('Company not found');
    const company = companies[0] as any;
    if (company.status !== 'active') throw new Error('Company account is not active');
    const remaining = Number(company.credit_limit_ugx) - Number(company.current_balance_ugx);
    if (total > remaining) throw new Error(`Insufficient company credit. Available: ${remaining}`);
  }

  const id = input.orderId || generateId();
  const orderType = input.type || 'dine_in';
  const orderPlace = input.place || null;
  const inserted = await sql`
    INSERT INTO orders (id,organization_id,restaurant_id,table_number,seat,type,place,status,items,subtotal,tax,total,payment_status,company_id,user_id,company_name,tin_number,idempotency_key,created_at,updated_at)
    VALUES (${id},${ctx.organizationId},${input.branchId},${input.tableNumber},${input.seat||null},${orderType},${orderPlace},'pending',${JSON.stringify(processedItems)},${subtotal},${tax},${total},'unpaid',${input.companyId||null},${ctx.userId},${input.companyName||null},${input.tin||null},${input.idempotencyKey},NOW(),NOW())
    ON CONFLICT (idempotency_key) DO NOTHING RETURNING *
  `;
  if (!inserted.length) {
    const replay = await sql`SELECT * FROM orders WHERE organization_id=${ctx.organizationId} AND idempotency_key=${input.idempotencyKey} LIMIT 1`;
    if (!replay.length) throw new Error('Order idempotency conflict could not be resolved');
    return { order: replay[0] as Order, replayed:true };
  }

  const orderItems = processedItems.map(item => ({ productId:item.productId, productName:item.name, quantity:item.quantity }));
  await inventoryService.deductInventory(ctx, orderItems, id, input.branchId, null);
  if (input.companyId) await sql`UPDATE companies SET current_balance_ugx=current_balance_ugx+${total},updated_at=NOW() WHERE id=${input.companyId} AND organization_id=${ctx.organizationId}`;
  await sql`UPDATE branches SET daily_revenue_ugx=daily_revenue_ugx+${total},orders_today=orders_today+1,updated_at=NOW() WHERE id=${input.branchId} AND organization_id=${ctx.organizationId}`;
  await sql`INSERT INTO accounting_ledger(id,organization_id,order_id,restaurant_id,type,amount,created_at) VALUES(${generateId()},${ctx.organizationId},${id},${input.branchId},'SALE',${total},NOW())`;
  await logAudit(ctx.userId,'order.create',{orderId:id,total,branchId:input.branchId,idempotencyKey:input.idempotencyKey},ctx.organizationId,input.branchId);
  return { order: inserted[0] as Order, replayed:false };
}
