import { getSql } from '@/lib/neon-server';
import { TenantContext, setTenantContext } from '@/lib/tenant';
import { assertBranchAccess } from '@/lib/access-control';
import { generateId } from '@/lib/id';
import { logAudit } from '@/lib/audit';
import { hasPermission } from '@/lib/rbac';
import { getPersonalCreditProfile } from '@/lib/services/personal-credit.service';

function assertAction(ctx: TenantContext, action: 'payment' | 'adjust' | 'writeoff') {
  if (ctx.isSuperAdmin) return;
  const permission = `personal_credit:${action}`;
  if (!hasPermission(ctx.role, permission)) {
    throw new Error('Insufficient permissions for this credit operation');
  }
}

function money(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error('Invalid monetary amount');
  return Math.round(n * 100) / 100;
}

function positiveAmount(value: unknown, label: string): number {
  const amount = money(value);
  if (amount <= 0) throw new Error(`${label} must be greater than zero`);
  return amount;
}

async function prepare(ctx: TenantContext, profileId: string) {
  const sql = getSql();
  if (!ctx.isSuperAdmin) await setTenantContext(sql, ctx.organizationId);
  const profile = await getPersonalCreditProfile(ctx, profileId);
  if (!profile) throw new Error('Credit profile not found');
  assertBranchAccess(ctx, profile.branch_id);
  return { sql, profile: profile as any };
}

/**
 * Record a real payment against an outstanding personal-credit balance.
 * The profile update and ledger insert happen in the same SQL statement so
 * the balance and audit trail cannot get out of sync.
 */
export async function recordPersonalCreditPayment(
  ctx: TenantContext,
  profileId: string,
  amountInput: number,
  description?: string,
  paymentMethod?: string,
) {
  assertAction(ctx, 'payment');
  const amount = positiveAmount(amountInput, 'Payment');
  const { sql, profile: current } = await prepare(ctx, profileId);

  if (['paid', 'cancelled', 'closed', 'written_off'].includes(String(current.status))) {
    throw new Error('This credit profile cannot receive payments in its current status');
  }

  const ledgerId = generateId();
  const descriptionText = String(description || '').trim() || 'Credit payment';
  const rows = await sql`
    WITH updated AS (
      UPDATE personal_credit_profiles
      SET current_balance_ugx = current_balance_ugx - ${amount},
          total_paid_ugx = total_paid_ugx + ${amount},
          status = CASE WHEN current_balance_ugx - ${amount} <= 0 THEN 'paid' ELSE 'partially_paid' END,
          paid_at = CASE WHEN current_balance_ugx - ${amount} <= 0 THEN NOW() ELSE NULL END,
          updated_at = NOW()
      WHERE id = ${profileId}
        AND organization_id = ${current.organization_id}
        AND branch_id = ${current.branch_id}
        AND current_balance_ugx >= ${amount}
        AND status NOT IN ('paid','cancelled','closed','written_off')
      RETURNING id, organization_id, branch_id, current_balance_ugx, total_paid_ugx
    ), ledger AS (
      INSERT INTO personal_credit_ledger
        (id, organization_id, branch_id, profile_id, order_id, entry_type,
         amount_ugx, balance_after_ugx, description, created_by, created_at)
      SELECT ${ledgerId}, u.organization_id, u.branch_id, u.id, NULL, 'payment',
             ${amount}, u.current_balance_ugx, ${descriptionText}, ${ctx.userId}, NOW()
      FROM updated u
      RETURNING id
    )
    SELECT u.* FROM updated u
  `;

  if (!rows.length) {
    throw new Error('Payment exceeds the outstanding balance or the credit profile is no longer payable');
  }

  const updated = rows[0] as any;
  await logAudit(
    ctx.userId,
    'personal_credit.payment',
    {
      profileId,
      amount,
      paymentMethod: paymentMethod || 'cash',
      balanceAfter: Number(updated.current_balance_ugx),
      ledgerId,
    },
    updated.organization_id,
    updated.branch_id,
  );

  return getPersonalCreditProfile(ctx, profileId);
}

/**
 * Apply a signed balance adjustment. Positive increases the customer's debt;
 * negative reduces it. The ledger always stores the absolute movement amount,
 * while the description records the signed business action.
 */
export async function adjustPersonalCredit(
  ctx: TenantContext,
  profileId: string,
  amountInput: number,
  reason: string,
) {
  assertAction(ctx, 'adjust');
  const amount = money(amountInput);
  if (amount === 0) throw new Error('Adjustment amount cannot be zero');
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) throw new Error('A reason is required for adjustment');

  const { sql, profile: current } = await prepare(ctx, profileId);
  if (['cancelled', 'closed', 'written_off'].includes(String(current.status))) {
    throw new Error('This credit profile cannot be adjusted in its current status');
  }

  const increase = amount > 0;
  const absAmount = Math.abs(amount);
  const ledgerId = generateId();
  const rows = await sql`
    WITH updated AS (
      UPDATE personal_credit_profiles
      SET current_balance_ugx = CASE
            WHEN ${increase} THEN current_balance_ugx + ${absAmount}
            ELSE GREATEST(current_balance_ugx - ${absAmount}, 0)
          END,
          original_amount_ugx = CASE
            WHEN ${increase} THEN original_amount_ugx + ${absAmount}
            ELSE original_amount_ugx
          END,
          status = CASE
            WHEN ${increase} THEN 'active'
            WHEN current_balance_ugx - ${absAmount} <= 0 THEN 'paid'
            ELSE 'partially_paid'
          END,
          paid_at = CASE
            WHEN NOT ${increase} AND current_balance_ugx - ${absAmount} <= 0 THEN NOW()
            WHEN ${increase} THEN NULL
            ELSE paid_at
          END,
          updated_at = NOW()
      WHERE id = ${profileId}
        AND organization_id = ${current.organization_id}
        AND branch_id = ${current.branch_id}
        AND status NOT IN ('cancelled','closed','written_off')
      RETURNING id, organization_id, branch_id, current_balance_ugx
    ), ledger AS (
      INSERT INTO personal_credit_ledger
        (id, organization_id, branch_id, profile_id, order_id, entry_type,
         amount_ugx, balance_after_ugx, description, created_by, created_at)
      SELECT ${ledgerId}, u.organization_id, u.branch_id, u.id, NULL, 'adjustment',
             ${absAmount}, u.current_balance_ugx,
             ${`Adjustment (${increase ? '+' : '-'}${absAmount}): ${cleanReason}`},
             ${ctx.userId}, NOW()
      FROM updated u
      RETURNING id
    )
    SELECT u.* FROM updated u
  `;

  if (!rows.length) throw new Error('Adjustment failed: credit profile was not found or cannot be adjusted');
  const updated = rows[0] as any;

  await logAudit(
    ctx.userId,
    'personal_credit.adjust',
    {
      profileId,
      amount,
      reason: cleanReason,
      balanceAfter: Number(updated.current_balance_ugx),
      ledgerId,
    },
    updated.organization_id,
    updated.branch_id,
  );

  return getPersonalCreditProfile(ctx, profileId);
}

/**
 * Write off the complete outstanding balance and create a matching ledger
 * entry containing the amount that was actually written off.
 */
export async function writeOffCredit(
  ctx: TenantContext,
  profileId: string,
  reason: string,
) {
  assertAction(ctx, 'writeoff');
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) throw new Error('A reason is required for write-off');

  const { sql, profile: current } = await prepare(ctx, profileId);
  if (['paid', 'cancelled', 'closed', 'written_off'].includes(String(current.status))) {
    throw new Error('This credit profile is not eligible for write-off');
  }

  const ledgerId = generateId();
  const rows = await sql`
    WITH target AS (
      SELECT id, organization_id, branch_id, current_balance_ugx
      FROM personal_credit_profiles
      WHERE id = ${profileId}
        AND organization_id = ${current.organization_id}
        AND branch_id = ${current.branch_id}
        AND current_balance_ugx > 0
        AND status NOT IN ('paid','cancelled','closed','written_off')
      FOR UPDATE
    ), updated AS (
      UPDATE personal_credit_profiles p
      SET current_balance_ugx = 0,
          status = 'written_off',
          written_off_at = NOW(),
          updated_at = NOW()
      FROM target t
      WHERE p.id = t.id
      RETURNING p.id, p.organization_id, p.branch_id, p.current_balance_ugx
    ), ledger AS (
      INSERT INTO personal_credit_ledger
        (id, organization_id, branch_id, profile_id, order_id, entry_type,
         amount_ugx, balance_after_ugx, description, created_by, created_at)
      SELECT ${ledgerId}, t.organization_id, t.branch_id, t.id, NULL, 'write_off',
             t.current_balance_ugx, 0, ${`Write-off: ${cleanReason}`}, ${ctx.userId}, NOW()
      FROM target t
      JOIN updated u ON u.id = t.id
      RETURNING id
    )
    SELECT t.id, t.organization_id, t.branch_id, t.current_balance_ugx AS written_off_amount
    FROM target t
    JOIN updated u ON u.id = t.id
  `;

  if (!rows.length) throw new Error('Write-off failed: profile not found, already settled, or zero balance');
  const updated = rows[0] as any;
  const writtenOffAmount = Number(updated.written_off_amount);

  await logAudit(
    ctx.userId,
    'personal_credit.writeoff',
    { profileId, reason: cleanReason, writtenOffAmount, ledgerId },
    updated.organization_id,
    updated.branch_id,
  );

  return getPersonalCreditProfile(ctx, profileId);
}
