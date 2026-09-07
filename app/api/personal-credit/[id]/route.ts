import { NextRequest, NextResponse } from 'next/server';
import { extractVerifiedTenantContext } from '@/lib/tenant';
import { getPersonalCreditHistory, recordPersonalCreditPayment, chargePersonalCredit, adjustPersonalCredit, reversePayment, writeOffCredit, cancelCredit, getPersonalCreditProfile } from '@/lib/services/personal-credit.service';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await extractVerifiedTenantContext(request);
    if (!ctx) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const data = await getPersonalCreditHistory(ctx, id);
    if (!data) return NextResponse.json({ data: null, error: 'Credit profile not found' }, { status: 404 });
    return NextResponse.json({ data });
  } catch (e: any) {
    const message = e?.message || 'Unable to load credit history';
    return NextResponse.json({ data: null, error: message }, { status: /restricted|Forbidden/i.test(message) ? 403 : 400 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await extractVerifiedTenantContext(request);
    if (!ctx) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const body = await request.json();

    if (body.action === 'payment') {
      const data = await recordPersonalCreditPayment(ctx, id, body.amountUgx, body.description, body.paymentMethod, body.idempotencyKey);
      return NextResponse.json({ data });
    }
    if (body.action === 'charge') {
      if (!body.orderId) return NextResponse.json({ data: null, error: 'orderId is required for a credit charge' }, { status: 400 });
      const data = await chargePersonalCredit(ctx, id, body.orderId, body.amountUgx);
      return NextResponse.json({ data });
    }
    if (body.action === 'adjust') {
      if (!body.reason?.trim()) return NextResponse.json({ data: null, error: 'reason is required for adjustment' }, { status: 400 });
      const data = await adjustPersonalCredit(ctx, id, body.amountUgx, body.reason, body.idempotencyKey);
      return NextResponse.json({ data });
    }
    if (body.action === 'reverse') {
      if (!body.ledgerEntryId) return NextResponse.json({ data: null, error: 'ledgerEntryId is required for reversal' }, { status: 400 });
      if (!body.reason?.trim()) return NextResponse.json({ data: null, error: 'reason is required for reversal' }, { status: 400 });
      const data = await reversePayment(ctx, id, body.ledgerEntryId, body.reason, body.idempotencyKey);
      return NextResponse.json({ data });
    }
    if (body.action === 'writeoff') {
      if (!body.reason?.trim()) return NextResponse.json({ data: null, error: 'reason is required for write-off' }, { status: 400 });
      const data = await writeOffCredit(ctx, id, body.reason, body.idempotencyKey);
      return NextResponse.json({ data });
    }
    if (body.action === 'cancel') {
      if (!body.reason?.trim()) return NextResponse.json({ data: null, error: 'reason is required for cancellation' }, { status: 400 });
      const data = await cancelCredit(ctx, id, body.reason);
      return NextResponse.json({ data });
    }
    if (body.action === 'profile') {
      const data = await getPersonalCreditProfile(ctx, id);
      return NextResponse.json({ data });
    }
    return NextResponse.json({ data: null, error: 'Unsupported credit action' }, { status: 400 });
  } catch (e: any) {
    const message = e?.message || 'Unable to update credit';
    return NextResponse.json({ data: null, error: message }, { status: /restricted|Forbidden/i.test(message) ? 403 : 400 });
  }
}
