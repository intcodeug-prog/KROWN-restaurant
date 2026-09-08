import { NextRequest, NextResponse } from 'next/server';
import { listOrders } from '@/lib/services/order.service';
import { createIdempotentOrder } from '@/lib/services/idempotent-order.service';
import { extractVerifiedTenantContext } from '@/lib/tenant';
import { hasPermission } from '@/lib/rbac';
import { assertBranchAccess } from '@/lib/access-control';

function normalizePaymentState(order: any) {
  if (order?.payment_status === 'paid' && Number(order?.paid_amount || 0) <= 0) {
    return { ...order, payment_status: 'unpaid', status: order.status === 'completed' ? 'pending' : order.status };
  }
  return order;
}

export async function GET(request: NextRequest) {
  const ctx = await extractVerifiedTenantContext(request);
  if (!ctx) return NextResponse.json({ error:'Authentication required' }, { status:401 });
  try {
    const requestedBranchId=request.nextUrl.searchParams.get('branchId')||undefined;
    const branchId=requestedBranchId||ctx.branchId||undefined;
    if (requestedBranchId || ctx.branchId) await assertBranchAccess(ctx,branchId!);
    const startDate=request.nextUrl.searchParams.get('startDate'); const endDate=request.nextUrl.searchParams.get('endDate');
    const orders=await listOrders(ctx,branchId,startDate?Number(startDate):undefined,endDate?Number(endDate):undefined);
    const limit=Math.min(Math.max(parseInt(request.nextUrl.searchParams.get('limit')||'100',10)||100,1),500);
    return NextResponse.json({data:orders.slice(0,limit).map(normalizePaymentState)});
  }catch(error:any){const status=String(error?.message||'').startsWith('Forbidden')?403:500;return NextResponse.json({error:error?.message||'Failed to list orders'},{status});}
}

export async function POST(request: NextRequest) {
  const ctx=await extractVerifiedTenantContext(request);
  if(!ctx)return NextResponse.json({error:'Authentication required'},{status:401});
  if(!hasPermission(ctx.role,'orders:create'))return NextResponse.json({error:'Insufficient permissions'},{status:403});
  try{
    const body=await request.json(); const branchId=body.branchId||body.branch_id||ctx.branchId;
    if(!branchId)return NextResponse.json({error:'Branch is required'},{status:400});
    await assertBranchAccess(ctx,branchId);
    const items=(body.items||[]).map((item:any)=>({productId:item.productId||item.product_id,quantity:Number(item.quantity||1),notes:item.notes,addOns:item.addOns||item.add_ons}));
    if(!items.length)return NextResponse.json({error:'At least one order item is required'},{status:400});
    if(items.some((item:any)=>!item.productId||!Number.isFinite(item.quantity)||item.quantity<=0))return NextResponse.json({error:'Invalid order item'},{status:400});
    const idempotencyKey=String(body.idempotencyKey||body.idempotency_key||body.id||request.headers.get('Idempotency-Key')||'').trim();
    if(!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey))return NextResponse.json({error:'A valid order identity/idempotency key is required'},{status:400});
    const result=await createIdempotentOrder(ctx,{branchId,tableNumber:String(body.table||body.table_number||'1'),seat:body.seat,type:body.type,place:body.place,items,staffId:ctx.userId,companyName:body.companyName||body.company_name,tin:body.tin,companyId:body.companyId||body.company_id,idempotencyKey,orderId:body.id||undefined});
    return NextResponse.json({data:result.order,replayed:result.replayed},{status:result.replayed?200:201});
  }catch(error:any){const message=error?.message||'Failed to create order';return NextResponse.json({error:message},{status:/Forbidden/i.test(message)?403:/invalid|required|credit|quantity/i.test(message)?400:500});}
}
