// KROWN POS — Server-Authoritative Order Processing
import { getSql } from '@/lib/neon-server';
import { TenantContext, setTenantContext } from '@/lib/tenant';
import { generateId } from '@/lib/id';
import { logAudit } from '@/lib/audit';
import * as inventoryService from '@/lib/services/inventory.service';

export interface OrderItem { productId: string; quantity: number; unitPrice: number; name: string; notes?: string; addOns?: { name: string; price: number }[]; }
export interface Order { id: string; organization_id: string; branch_id: string; table_number: string; seat?: string; status: 'pending'|'preparing'|'ready'|'completed'|'cancelled'; items: OrderItem[]; subtotal: number; tax: number; total: number; payment_method?: string; payment_status: 'unpaid'|'paid'|'partial'; company_id?: string; staff_id?: string; customer_name?: string; tin?: string; created_at: number; updated_at: number; }
export interface PaymentInput { method: string; amount: number; companyId?: string; }
export interface SplitPaymentInput { method: string; amount: number; companyId?: string; }
const VALID_STATES: Record<string,string[]> = { pending:['preparing','cancelled'], preparing:['ready','cancelled'], ready:['completed','cancelled'], completed:[], cancelled:[] };
const VAT_RATE = 0.18;

export async function createOrder(ctx: TenantContext, input: { branchId:string; tableNumber:string; seat?:string; items:{productId:string;quantity:number;notes?:string;addOns?:{name:string;price:number}[]}[]; staffId?:string; companyName?:string; tin?:string; companyId?:string }): Promise<Order> {
  const sql=getSql(); await setTenantContext(sql,ctx.organizationId); const id=generateId(); const now=Date.now();
  for(const item of input.items){ const rows=await sql`SELECT * FROM products WHERE id=${item.productId} AND organization_id=${ctx.organizationId}`; if(!rows.length) throw new Error(`Product not found: ${item.productId}`); if(!(rows[0] as any).available) throw new Error(`Product unavailable: ${(rows[0] as any).name}`); }
  let subtotal=0; const processedItems:OrderItem[]=[];
  for(const item of input.items){ const rows=await sql`SELECT * FROM products WHERE id=${item.productId} AND organization_id=${ctx.organizationId}`; const product=rows[0] as any; let itemTotal=product.price*item.quantity; for(const addOn of item.addOns||[]) itemTotal+=addOn.price*item.quantity; subtotal+=itemTotal; processedItems.push({productId:item.productId,quantity:item.quantity,unitPrice:product.price,name:product.name,notes:item.notes,addOns:item.addOns}); }
  const tax=Math.round(subtotal*VAT_RATE); const total=subtotal+tax;
  if(input.companyId){ const compRows=await sql`SELECT * FROM companies WHERE id=${input.companyId} AND organization_id=${ctx.organizationId}`; if(!compRows.length) throw new Error('Company not found'); const company=compRows[0] as any; if(company.status!=='active') throw new Error('Company account is not active'); const remaining=company.credit_limit_ugx-company.current_balance_ugx; if(total>remaining) throw new Error(`Insufficient company credit. Available: ${remaining}, Order total: ${total}`); }
  await sql`INSERT INTO orders (id,organization_id,restaurant_id,table_number,seat,status,items,subtotal,tax,total,payment_status,company_id,user_id,company_name,tin_number,created_at,updated_at) VALUES (${id},${ctx.organizationId},${input.branchId||ctx.branchId},${input.tableNumber},${input.seat||null},'pending',${JSON.stringify(processedItems)},${subtotal},${tax},${total},'unpaid',${input.companyId||null},${input.staffId||null},${input.companyName||null},${input.tin||null},NOW(),NOW())`;
  await inventoryService.deductInventory(ctx,processedItems.map(i=>({productId:i.productId,productName:i.name,quantity:i.quantity})),id,input.branchId||ctx.branchId,null);
  if(input.companyId) await sql`UPDATE companies SET current_balance_ugx=current_balance_ugx+${total},updated_at=NOW() WHERE id=${input.companyId} AND organization_id=${ctx.organizationId}`;
  await sql`UPDATE branches SET daily_revenue_ugx=daily_revenue_ugx+${total},orders_today=orders_today+1,updated_at=NOW() WHERE id=${input.branchId} AND organization_id=${ctx.organizationId}`;
  await sql`INSERT INTO accounting_ledger (id,organization_id,order_id,restaurant_id,type,amount,created_at) VALUES (${generateId()},${ctx.organizationId},${id},${input.branchId||ctx.branchId},'SALE',${total},NOW())`;
  await logAudit(ctx.userId,'order.create',{orderId:id,total,branchId:input.branchId},ctx.organizationId,ctx.branchId);
  return {id,organization_id:ctx.organizationId,branch_id:input.branchId,table_number:input.tableNumber,seat:input.seat,status:'pending',items:processedItems,subtotal,tax,total,payment_status:'unpaid',company_id:input.companyId,staff_id:input.staffId,customer_name:input.companyName,tin:input.tin,created_at:now,updated_at:now};
}

export async function payOrder(ctx:TenantContext,orderId:string,payment:PaymentInput):Promise<Order>{
  const sql=getSql(); await setTenantContext(sql,ctx.organizationId);
  const rows=await sql`SELECT * FROM orders WHERE id=${orderId} AND organization_id=${ctx.organizationId}`; if(!rows.length) throw new Error('Order not found'); const order=rows[0] as any;
  if(order.payment_status==='paid') throw new Error('Order is already paid'); if(order.status==='cancelled') throw new Error('Cannot pay a cancelled order');
  const due=Math.max(0,Number(order.total||0)-Number(order.paid_amount||0)); const received=Number(payment.amount||0);
  if(!Number.isFinite(received)||received<=0) throw new Error('Payment amount must be greater than zero');
  if(received<due) throw new Error(`Payment is short by ${due-received}`);
  const appliedAmount=due;
  const paymentStatus='paid'; const orderStatus='completed';
  await sql`UPDATE orders SET payment_method=${payment.method},payment_status=${paymentStatus},paid_amount=${Number(order.paid_amount||0)+appliedAmount},status=${orderStatus},updated_at=NOW() WHERE id=${orderId} AND organization_id=${ctx.organizationId}`;
  const creditMethod=['corporate credit','personal credit','personal_credit','corporate_credit'].includes(String(payment.method||'').toLowerCase());
  if(!creditMethod){ await sql`INSERT INTO accounting_ledger (id,organization_id,order_id,restaurant_id,type,amount,created_at) VALUES (${generateId()},${ctx.organizationId},${orderId},${order.restaurant_id||null},'PAYMENT',${appliedAmount},NOW())`; }
  await logAudit(ctx.userId,'order.pay',{orderId,method:payment.method,amount:appliedAmount,receivedAmount:received},ctx.organizationId,ctx.branchId);
  const updated=await sql`SELECT * FROM orders WHERE id=${orderId} AND organization_id=${ctx.organizationId}`; return updated[0] as Order;
}

export async function updateStatus(ctx:TenantContext,orderId:string,newStatus:Order['status']):Promise<Order>{
  const sql=getSql(); await setTenantContext(sql,ctx.organizationId); const rows=await sql`SELECT * FROM orders WHERE id=${orderId} AND organization_id=${ctx.organizationId}`; if(!rows.length) throw new Error('Order not found'); const order=rows[0] as any; const allowed=VALID_STATES[order.status]||[]; if(!allowed.includes(newStatus)) throw new Error(`Invalid status transition: ${order.status} → ${newStatus}`); await sql`UPDATE orders SET status=${newStatus},updated_at=NOW() WHERE id=${orderId} AND organization_id=${ctx.organizationId}`; await logAudit(ctx.userId,'order.update_status',{orderId,from:order.status,to:newStatus},ctx.organizationId,ctx.branchId); const updated=await sql`SELECT * FROM orders WHERE id=${orderId} AND organization_id=${ctx.organizationId}`; return updated[0] as Order;
}

export async function splitPayment(ctx:TenantContext,orderId:string,splits:SplitPaymentInput[]):Promise<Order>{
  const sql=getSql(); await setTenantContext(sql,ctx.organizationId); const rows=await sql`SELECT * FROM orders WHERE id=${orderId} AND organization_id=${ctx.organizationId}`; if(!rows.length) throw new Error('Order not found'); const order=rows[0] as any; if(order.payment_status==='paid') throw new Error('Order is already paid');
  const totalPaid=Math.round(splits.reduce((sum,s)=>sum+Number(s.amount||0),0)); if(!Number.isFinite(totalPaid)||totalPaid<=0) throw new Error('Split payment amount must be greater than zero');
  const existingPaid=Number((await sql`SELECT COALESCE(SUM(amount),0) AS total FROM accounting_ledger WHERE order_id=${orderId} AND organization_id=${ctx.organizationId} AND type='PAYMENT'`)[0]?.total||0);
  const delta=Math.max(0,totalPaid-existingPaid); const cappedPaid=Math.min(Number(order.total||0),totalPaid); const paymentStatus=cappedPaid>=Number(order.total||0)?'paid':'partial'; const nextStatus=paymentStatus==='paid'?'completed':order.status;
  await sql`UPDATE orders SET payment_status=${paymentStatus},paid_amount=${cappedPaid},payment_method='split',status=${nextStatus},updated_at=NOW() WHERE id=${orderId} AND organization_id=${ctx.organizationId}`;
  if(delta>0) await sql`INSERT INTO accounting_ledger (id,organization_id,order_id,restaurant_id,type,amount,created_at) VALUES (${generateId()},${ctx.organizationId},${orderId},${order.restaurant_id||null},'PAYMENT',${delta},NOW())`;
  await logAudit(ctx.userId,'order.split_payment',{orderId,splits:splits.length,totalPaid:cappedPaid},ctx.organizationId,ctx.branchId);
  const updated=await sql`SELECT * FROM orders WHERE id=${orderId} AND organization_id=${ctx.organizationId}`; return updated[0] as Order;
}

export async function addItemsToOrder(ctx:TenantContext,orderId:string,items:{productId:string;quantity:number;notes?:string}[]):Promise<Order>{
  const sql=getSql(); await setTenantContext(sql,ctx.organizationId); const rows=await sql`SELECT * FROM orders WHERE id=${orderId} AND organization_id=${ctx.organizationId}`; if(!rows.length) throw new Error('Order not found'); const order=rows[0] as any; if(order.status!=='pending'&&order.status!=='preparing') throw new Error('Can only add items to pending or preparing orders');
  let additionalSubtotal=0; const newItems:OrderItem[]=[]; for(const item of items){ const prodRows=await sql`SELECT * FROM products WHERE id=${item.productId} AND organization_id=${ctx.organizationId}`; if(!prodRows.length) throw new Error(`Product not found: ${item.productId}`); const product=prodRows[0] as any; if(!product.available) throw new Error(`Product unavailable: ${product.name}`); additionalSubtotal+=product.price*item.quantity; newItems.push({productId:item.productId,quantity:item.quantity,unitPrice:product.price,name:product.name,notes:item.notes}); }
  const existingItems=typeof order.items==='string'?JSON.parse(order.items):order.items; const allItems=[...existingItems,...newItems]; const newSubtotal=order.subtotal+additionalSubtotal; const newTax=Math.round(newSubtotal*VAT_RATE); const newTotal=newSubtotal+newTax;
  await sql`UPDATE orders SET items=${JSON.stringify(allItems)},subtotal=${newSubtotal},tax=${newTax},total=${newTotal},updated_at=NOW() WHERE id=${orderId} AND organization_id=${ctx.organizationId}`;
  for(const item of newItems){ const recipeRows=await sql`SELECT * FROM product_ingredients WHERE product_id=${item.productId} AND organization_id=${ctx.organizationId}`; for(const recipe of recipeRows as any[]){ const requiredQty=recipe.quantity_per_unit*item.quantity; await sql`UPDATE ingredients SET quantity=quantity-${requiredQty},updated_at=NOW() WHERE id=${recipe.ingredient_id} AND organization_id=${ctx.organizationId}`; } }
  await logAudit(ctx.userId,'order.add_items',{orderId,itemCount:items.length},ctx.organizationId,ctx.branchId); const updated=await sql`SELECT * FROM orders WHERE id=${orderId} AND organization_id=${ctx.organizationId}`; return updated[0] as Order;
}

export async function cancelOrder(ctx:TenantContext,orderId:string):Promise<Order>{
  const sql=getSql(); await setTenantContext(sql,ctx.organizationId); const rows=await sql`SELECT * FROM orders WHERE id=${orderId} AND organization_id=${ctx.organizationId}`; if(!rows.length) throw new Error('Order not found'); const order=rows[0] as any; if(order.status==='completed') throw new Error('Cannot cancel a completed order'); if(order.status==='cancelled') throw new Error('Order is already cancelled'); await sql`UPDATE orders SET status='cancelled',updated_at=NOW() WHERE id=${orderId} AND organization_id=${ctx.organizationId}`;
  const items=typeof order.items==='string'?JSON.parse(order.items):order.items; for(const item of items){ const recipeRows=await sql`SELECT * FROM product_ingredients WHERE product_id=${item.productId} AND organization_id=${ctx.organizationId}`; for(const recipe of recipeRows as any[]){ const restoreQty=recipe.quantity_per_unit*item.quantity; await sql`UPDATE ingredients SET quantity=quantity+${restoreQty},updated_at=NOW() WHERE id=${recipe.ingredient_id} AND organization_id=${ctx.organizationId}`; } }
  if(order.company_id) await sql`UPDATE companies SET current_balance_ugx=current_balance_ugx-${order.total},updated_at=NOW() WHERE id=${order.company_id} AND organization_id=${ctx.organizationId}`;
  await logAudit(ctx.userId,'order.cancel',{orderId,total:order.total},ctx.organizationId,ctx.branchId); const updated=await sql`SELECT * FROM orders WHERE id=${orderId} AND organization_id=${ctx.organizationId}`; return updated[0] as Order;
}

export async function getOrder(ctx:TenantContext,orderId:string):Promise<Order|null>{ const sql=getSql(); await setTenantContext(sql,ctx.organizationId); const rows=await sql`SELECT * FROM orders WHERE id=${orderId} AND organization_id=${ctx.organizationId}`; return rows.length?(rows[0] as Order):null; }

export async function listOrders(ctx:TenantContext,branchId?:string,startDate?:number,endDate?:number):Promise<Order[]>{
  const sql=getSql(); await setTenantContext(sql,ctx.organizationId); const pgStart=startDate?new Date(startDate).toISOString():null; const pgEnd=endDate?new Date(endDate).toISOString():null; let rows;
  if(branchId&&pgStart&&pgEnd) rows=await sql`SELECT * FROM orders WHERE organization_id=${ctx.organizationId} AND restaurant_id=${branchId} AND created_at>=${pgStart}::timestamptz AND created_at<=${pgEnd}::timestamptz ORDER BY created_at DESC`;
  else if(branchId) rows=await sql`SELECT * FROM orders WHERE organization_id=${ctx.organizationId} AND restaurant_id=${branchId} ORDER BY created_at DESC`;
  else if(pgStart&&pgEnd) rows=await sql`SELECT * FROM orders WHERE organization_id=${ctx.organizationId} AND created_at>=${pgStart}::timestamptz AND created_at<=${pgEnd}::timestamptz ORDER BY created_at DESC`;
  else rows=await sql`SELECT * FROM orders WHERE organization_id=${ctx.organizationId} ORDER BY created_at DESC`;
  return rows as Order[];
}

export async function getOpenOrderByTable(ctx:TenantContext,tableNumber:string,seat?:string):Promise<Order|null>{ const sql=getSql(); await setTenantContext(sql,ctx.organizationId); const rows=seat?await sql`SELECT * FROM orders WHERE organization_id=${ctx.organizationId} AND table_number=${tableNumber} AND seat=${seat} AND status IN ('pending','preparing','ready') LIMIT 1`:await sql`SELECT * FROM orders WHERE organization_id=${ctx.organizationId} AND table_number=${tableNumber} AND status IN ('pending','preparing','ready') LIMIT 1`; return rows.length?(rows[0] as Order):null; }

export async function updateOrderTin(ctx:TenantContext,orderId:string,tin:string):Promise<Order>{ const sql=getSql(); await setTenantContext(sql,ctx.organizationId); const rows=await sql`SELECT * FROM orders WHERE id=${orderId} AND organization_id=${ctx.organizationId}`; if(!rows.length) throw new Error('Order not found'); await sql`UPDATE orders SET tin_number=${tin},updated_at=NOW() WHERE id=${orderId} AND organization_id=${ctx.organizationId}`; await logAudit(ctx.userId,'order.update_tin',{orderId,tin},ctx.organizationId,ctx.branchId); const updated=await sql`SELECT * FROM orders WHERE id=${orderId} AND organization_id=${ctx.organizationId}`; return updated[0] as Order; }
