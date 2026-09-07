import { getSql } from '@/lib/neon-server';
import { TenantContext, setTenantContext } from '@/lib/tenant';
import { assertBranchAccess } from '@/lib/access-control';
import { generateId } from '@/lib/id';
import { logAudit } from '@/lib/audit';
import { hasPermission } from '@/lib/rbac';

export interface PersonalCreditProfile {
  id: string;
  organization_id: string;
  branch_id: string;
  public_reference: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  credit_limit_ugx: number;
  current_balance_ugx: number;
  original_amount_ugx: number;
  total_paid_ugx: number;
  status: string;
  notes: string | null;
  due_date: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  written_off_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  branch_name?: string;
  organization_name?: string;
}

export interface CreditLedgerEntry {
  id: string;
  organization_id: string;
  branch_id: string;
  profile_id: string;
  order_id: string | null;
  entry_type: string;
  amount_ugx: number;
  balance_after_ugx: number;
  description: string | null;
  created_by: string;
  created_at: string;
  staff_name?: string;
  order_total?: number;
}

export interface CreditDashboard {
  totalOutstanding: number;
  totalActive: number;
  totalCollected: number;
  overdueAmount: number;
  customersWithBalance: number;
  creditsCreatedToday: number;
  paymentsReceivedToday: number;
  overdueCredits: number;
  largestBalances: PersonalCreditProfile[];
  recentPayments: CreditLedgerEntry[];
  recentActivity: CreditLedgerEntry[];
}

const ACTION_TO_PERMISSION: Record<string, string> = {
  view: 'personal_credit:view',
  create: 'personal_credit:create',
  charge: 'personal_credit:charge',
  payment: 'personal_credit:payment',
  adjust: 'personal_credit:adjust',
  reverse: 'personal_credit:reverse',
  writeoff: 'personal_credit:writeoff',
  cancel: 'personal_credit:cancel',
  manage: 'personal_credit:manage',
  export: 'personal_credit:export',
  audit: 'personal_credit:audit',
};

function assertCreditAccess(ctx: TenantContext, action: string = 'view') {
  if (ctx.isSuperAdmin) return;
  const permission = ACTION_TO_PERMISSION[action] || 'personal_credit:view';
  if (!hasPermission(ctx.role, permission)) {
    throw new Error('Insufficient permissions for this credit operation');
  }
}

function money(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error('Invalid monetary amount');
  return Math.round(n * 100) / 100;
}

function assertPositiveAmount(amount: number, label: string) {
  if (amount <= 0) throw new Error(`${label} must be greater than zero`);
}

async function nextPublicReference(sql: ReturnType<typeof getSql>, prefix: string): Promise<string> {
  const year = new Date().getFullYear();
  for (let i = 0; i < 10; i++) {
    const seq = String(Math.floor(Math.random() * 999999)).padStart(6, '0');
    const ref = `${prefix}-${year}-${seq}`;
    const table = prefix === 'CRD' ? 'personal_credit_profiles' : 'personal_credit_ledger';
    const col = prefix === 'CRD' ? 'public_reference' : 'id';
    const rows = await sql(`SELECT 1 FROM ${table} WHERE ${col} = $1 LIMIT 1`, [ref]);
    if (!rows.length) return ref;
  }
  throw new Error('Unable to allocate a reference');
}

async function getIdempotencyKey(sql: ReturnType<typeof getSql>, key: string) {
  const rows = await sql`SELECT * FROM idempotency_keys WHERE key = ${key} AND expires_at > NOW() LIMIT 1`;
  return rows.length ? rows[0] : null;
}

async function setIdempotencyKey(sql: ReturnType<typeof getSql>, key: string, orgId: string, staffId: string, requestHash: string, responseBody: any) {
  await sql`INSERT INTO idempotency_keys (key, organization_id, staff_id, request_hash, response_body, status, created_at, expires_at) VALUES (${key},${orgId},${staffId},${requestHash},${JSON.stringify(responseBody)},'completed',NOW(),NOW() + interval '24 hours') ON CONFLICT (key) DO UPDATE SET response_body=${JSON.stringify(responseBody)}, status='completed'`;
}

// ── LIST PROFILES ──────────────────────────────────────────────────────────────
export async function listPersonalCreditProfiles(ctx: TenantContext, branchId?: string, status?: string, search?: string, page: number = 1, limit: number = 50) {
  assertCreditAccess(ctx, 'view');
  const sql = getSql();
  if (!ctx.isSuperAdmin) await setTenantContext(sql, ctx.organizationId);
  const effectiveBranch = branchId || ctx.branchId || undefined;
  if (effectiveBranch) assertBranchAccess(ctx, effectiveBranch);

  const offset = Math.max(0, (page - 1) * limit);
  const statusFilter = status && status !== 'all' ? status : null;

  if (ctx.isSuperAdmin && !effectiveBranch) {
    let where = '1=1';
    const params: any[] = [];
    if (statusFilter) { where += ` AND p.status = $${params.length + 1}`; params.push(statusFilter); }
    if (search) { where += ` AND (p.full_name ILIKE $${params.length + 1} OR p.phone ILIKE $${params.length + 1} OR p.public_reference ILIKE $${params.length + 1})`; params.push(`%${search}%`); }
    const countParams = [...params];
    const countResult = await sql(`SELECT COUNT(*)::int as count FROM personal_credit_profiles p WHERE ${where}`, countParams);
    const total = countResult[0]?.count || 0;
    params.push(limit, offset);
    const rows = await sql(`SELECT p.*, b.name AS branch_name, o.name AS organization_name FROM personal_credit_profiles p JOIN branches b ON b.id=p.branch_id JOIN organizations o ON o.id=p.organization_id WHERE ${where} ORDER BY p.updated_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    return { profiles: rows, total, page, limit };
  }
  if (!effectiveBranch) throw new Error('Branch is required');

  let where = `p.organization_id = $1 AND p.branch_id = $2`;
  const params: any[] = [ctx.organizationId, effectiveBranch];
  if (statusFilter) { where += ` AND p.status = $${params.length + 1}`; params.push(statusFilter); }
  if (search) { where += ` AND (p.full_name ILIKE $${params.length + 1} OR p.phone ILIKE $${params.length + 1} OR p.public_reference ILIKE $${params.length + 1})`; params.push(`%${search}%`); }
  const countParams = [...params];
  const countResult = await sql(`SELECT COUNT(*)::int as count FROM personal_credit_profiles p WHERE ${where}`, countParams);
  const total = countResult[0]?.count || 0;
  params.push(limit, offset);
  const rows = await sql(`SELECT p.*, b.name AS branch_name FROM personal_credit_profiles p JOIN branches b ON b.id=p.branch_id WHERE ${where} ORDER BY p.updated_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return { profiles: rows, total, page, limit };
}

// ── GET SINGLE PROFILE ────────────────────────────────────────────────────────
export async function getPersonalCreditProfile(ctx: TenantContext, profileId: string) {
  assertCreditAccess(ctx, 'view');
  const sql = getSql();
  if (!ctx.isSuperAdmin) await setTenantContext(sql, ctx.organizationId);
  const rows = ctx.isSuperAdmin
    ? await sql`SELECT p.*, b.name AS branch_name, o.name AS organization_name FROM personal_credit_profiles p JOIN branches b ON b.id=p.branch_id JOIN organizations o ON o.id=p.organization_id WHERE p.id=${profileId} OR p.public_reference=${profileId} LIMIT 1`
    : await sql`SELECT p.*, b.name AS branch_name FROM personal_credit_profiles p JOIN branches b ON b.id=p.branch_id WHERE (p.id=${profileId} OR p.public_reference=${profileId}) AND p.organization_id=${ctx.organizationId} LIMIT 1`;
  if (!rows.length) return null;
  const profile = rows[0] as any;
  assertBranchAccess(ctx, profile.branch_id);
  return profile;
}

// ── CREATE PROFILE ─────────────────────────────────────────────────────────────
export async function createPersonalCreditProfile(ctx: TenantContext, input: { branchId?: string; fullName: string; phone?: string; email?: string; creditLimitUgx?: number; notes?: string; dueDate?: string }) {
  assertCreditAccess(ctx, 'create');
  const sql = getSql();
  if (!ctx.isSuperAdmin) await setTenantContext(sql, ctx.organizationId);
  const branchId = input.branchId || ctx.branchId;
  if (!branchId) throw new Error('Branch is required');
  const branchRows = await sql`SELECT id,organization_id FROM branches WHERE id=${branchId} LIMIT 1`;
  if (!branchRows.length || (!ctx.isSuperAdmin && (branchRows[0] as any).organization_id !== ctx.organizationId)) throw new Error('Branch not found');
  assertBranchAccess(ctx, branchId);
  const organizationId = (branchRows[0] as any).organization_id;
  const name = String(input.fullName || '').trim();
  if (name.length < 2 || name.length > 160) throw new Error('A valid customer name is required');
  const limit = money(input.creditLimitUgx ?? 0);
  if (limit < 0) throw new Error('Credit limit cannot be negative');
  const ref = await nextPublicReference(sql, 'CRD');
  const id = generateId();
  const dueDate = input.dueDate || null;

  await sql`INSERT INTO personal_credit_profiles (id, organization_id, branch_id, public_reference, full_name, phone, email, credit_limit_ugx, current_balance_ugx, original_amount_ugx, total_paid_ugx, status, notes, due_date, created_by, created_at, updated_at) VALUES (${id},${organizationId},${branchId},${ref},${name},${input.phone?.trim()||null},${input.email?.trim().toLowerCase()||null},${limit},0,0,0,'active',${input.notes?.trim()||null},${dueDate},${ctx.userId},NOW(),NOW())`;
  await logAudit(ctx.userId, 'personal_credit.create', { profileId: id, publicReference: ref, branchId, creditLimit: limit }, organizationId, branchId);
  return getPersonalCreditProfile(ctx, id);
}

// ── CHARGE (ADD CREDIT) ───────────────────────────────────────────────────────
export async function chargePersonalCredit(ctx: TenantContext, profileId: string, orderId: string, amountInput: number) {
  assertCreditAccess(ctx, 'charge');
  const amount = money(amountInput);
  assertPositiveAmount(amount, 'Charge');
  const sql = getSql();
  if (!ctx.isSuperAdmin) await setTenantContext(sql, ctx.organizationId);
  const ledgerId = generateId();

  const rows = await sql`WITH profile AS (
    SELECT id,organization_id,branch_id,credit_limit_ugx,current_balance_ugx
    FROM personal_credit_profiles
    WHERE id=${profileId} AND (${ctx.isSuperAdmin} OR organization_id=${ctx.organizationId}) AND status IN ('active','partially_paid')
  ), ord AS (
    SELECT id,organization_id,restaurant_id,total,personal_credit_profile_id
    FROM orders
    WHERE id=${orderId} AND (${ctx.isSuperAdmin} OR organization_id=${ctx.organizationId})
  ), eligible AS (
    SELECT p.*,o.id AS order_id
    FROM profile p JOIN ord o ON o.organization_id=p.organization_id AND o.restaurant_id=p.branch_id
    WHERE (o.personal_credit_profile_id IS NULL OR o.personal_credit_profile_id=p.id)
    AND p.current_balance_ugx + ${amount} <= p.credit_limit_ugx
  ), updated_profile AS (
    UPDATE personal_credit_profiles p
    SET current_balance_ugx=p.current_balance_ugx+${amount},
        original_amount_ugx=CASE WHEN original_amount_ugx=0 THEN ${amount} ELSE original_amount_ugx+${amount} END,
        updated_at=NOW()
    FROM eligible e WHERE p.id=e.id
    RETURNING p.id,p.organization_id,p.branch_id,p.current_balance_ugx
  ), updated_order AS (
    UPDATE orders o
    SET personal_credit_profile_id=${profileId}, is_personal_credit=true, payment_status='unpaid', payment_method='personal_credit', updated_at=NOW()
    FROM eligible e WHERE o.id=e.order_id AND EXISTS (SELECT 1 FROM updated_profile u WHERE u.id=e.id)
    RETURNING o.id
  ), ledger AS (
    INSERT INTO personal_credit_ledger (id,organization_id,branch_id,profile_id,order_id,entry_type,amount_ugx,balance_after_ugx,description,created_by,created_at)
    SELECT ${ledgerId},u.organization_id,u.branch_id,u.id,uo.id,'charge',${amount},u.current_balance_ugx,'Restaurant order credit charge',${ctx.userId},NOW()
    FROM updated_profile u JOIN updated_order uo ON true
    RETURNING profile_id
  ) SELECT u.*,uo.id AS order_id FROM updated_profile u JOIN updated_order uo ON true`;

  if (!rows.length) throw new Error('Credit charge failed: profile/order not found, branch mismatch, order already assigned, or credit limit exceeded');
  const profile = rows[0] as any;
  assertBranchAccess(ctx, profile.branch_id);
  await logAudit(ctx.userId, 'personal_credit.charge', { profileId, orderId, amount, balanceAfter: Number(profile.current_balance_ugx) }, profile.organization_id, profile.branch_id);
  return getPersonalCreditProfile(ctx, profileId);
}

// ── RECORD PAYMENT ─────────────────────────────────────────────────────────────
export async function recordPersonalCreditPayment(ctx: TenantContext, profileId: string, amountInput: number, description?: string, paymentMethod?: string, idempotencyKey?: string) {
  assertCreditAccess(ctx, 'payment');
  const amount = money(amountInput);
  assertPositiveAmount(amount, 'Payment');
  const sql = getSql();

  if (idempotencyKey) {
    const existing = await getIdempotencyKey(sql, idempotencyKey);
    if (existing && existing.status === 'completed') return existing.response_body;
  }

  if (!ctx.isSuperAdmin) await setTenantContext(sql, ctx.organizationId);
  const ledgerId = generateId();

  const rows = await sql`WITH target AS (
    SELECT id,organization_id,branch_id,current_balance_ugx,total_paid_ugx
    FROM personal_credit_profiles
    WHERE id=${profileId} AND (${ctx.isSuperAdmin} OR organization_id=${ctx.organizationId}) AND status IN ('active','partially_paid','overdue')
  ), updated AS (
    UPDATE personal_credit_profiles p
    SET current_balance_ugx=GREATEST(p.current_balance_ugx-${amount},0),
        total_paid_ugx=p.total_paid_ugx+${amount},
        status=CASE WHEN p.current_balance_ugx-${amount}<=0 THEN 'paid' ELSE 'partially_paid' END,
        paid_at=CASE WHEN p.current_balance_ugx-${amount}<=0 THEN NOW() ELSE p.paid_at END,
        updated_at=NOW()
    FROM target t WHERE p.id=t.id AND p.current_balance_ugx >= ${amount}
    RETURNING p.id,p.organization_id,p.branch_id,p.current_balance_ugx,p.total_paid_ugx
  ), ledger AS (
    INSERT INTO personal_credit_ledger (id,organization_id,branch_id,profile_id,entry_type,amount_ugx,balance_after_ugx,description,created_by,created_at)
    SELECT ${ledgerId},u.organization_id,u.branch_id,u.id,'payment',${amount},u.current_balance_ugx,${description?.trim()||'Credit payment'},${ctx.userId},NOW()
    FROM updated u
    RETURNING profile_id
  ) SELECT * FROM updated`;

  if (!rows.length) throw new Error('Payment exceeds the outstanding balance or credit profile is not active');
  const profile = rows[0] as any;
  assertBranchAccess(ctx, profile.branch_id);

  const result = await getPersonalCreditProfile(ctx, profileId);
  await logAudit(ctx.userId, 'personal_credit.payment', { profileId, amount, balanceAfter: Number(profile.current_balance_ugx), paymentMethod }, profile.organization_id, profile.branch_id);

  if (idempotencyKey) {
    await setIdempotencyKey(sql, idempotencyKey, profile.organization_id, ctx.userId, `${profileId}:${amount}`, result);
  }

  return result;
}

// ── ADJUSTMENT ─────────────────────────────────────────────────────────────────
export async function adjustPersonalCredit(ctx: TenantContext, profileId: string, amountInput: number, reason: string, idempotencyKey?: string) {
  assertCreditAccess(ctx, 'adjust');
  const amount = money(amountInput);
  if (amount === 0) throw new Error('Adjustment amount cannot be zero');
  const sql = getSql();

  if (idempotencyKey) {
    const existing = await getIdempotencyKey(sql, idempotencyKey);
    if (existing && existing.status === 'completed') return existing.response_body;
  }

  if (!ctx.isSuperAdmin) await setTenantContext(sql, ctx.organizationId);
  const ledgerId = generateId();
  const isIncrease = amount > 0;
  const absAmount = Math.abs(amount);

  const rows = await sql`WITH target AS (
    SELECT id,organization_id,branch_id,current_balance_ugx
    FROM personal_credit_profiles
    WHERE id=${profileId} AND (${ctx.isSuperAdmin} OR organization_id=${ctx.organizationId}) AND status NOT IN ('cancelled','closed')
  ), updated AS (
    UPDATE personal_credit_profiles p
    SET current_balance_ugx=CASE WHEN ${isIncrease} THEN p.current_balance_ugx+${absAmount} ELSE GREATEST(p.current_balance_ugx-${absAmount},0) END,
        original_amount_ugx=CASE WHEN ${isIncrease} THEN p.original_amount_ugx+${absAmount} ELSE p.original_amount_ugx END,
        status=CASE
          WHEN ${isIncrease} AND p.current_balance_ugx+${absAmount}>0 THEN 'active'
          WHEN NOT ${isIncrease} AND p.current_balance_ugx-${absAmount}<=0 THEN 'paid'
          ELSE p.status END,
        updated_at=NOW()
    FROM target t WHERE p.id=t.id
    RETURNING p.id,p.organization_id,p.branch_id,p.current_balance_ugx
  ), ledger AS (
    INSERT INTO personal_credit_ledger (id,organization_id,branch_id,profile_id,entry_type,amount_ugx,balance_after_ugx,description,created_by,created_at)
    SELECT ${ledgerId},u.organization_id,u.branch_id,u.id,'adjustment',${absAmount},u.current_balance_ugx,${`Adjustment: ${reason}`},${ctx.userId},NOW()
    FROM updated u
    RETURNING profile_id
  ) SELECT * FROM updated`;

  if (!rows.length) throw new Error('Adjustment failed: credit profile not found or is cancelled');
  const profile = rows[0] as any;
  assertBranchAccess(ctx, profile.branch_id);

  const result = await getPersonalCreditProfile(ctx, profileId);
  await logAudit(ctx.userId, 'personal_credit.adjust', { profileId, amount, reason, balanceAfter: Number(profile.current_balance_ugx) }, profile.organization_id, profile.branch_id);

  if (idempotencyKey) {
    await setIdempotencyKey(sql, idempotencyKey, profile.organization_id, ctx.userId, `${profileId}:${amount}:${reason}`, result);
  }

  return result;
}

// ── PAYMENT REVERSAL ───────────────────────────────────────────────────────────
export async function reversePayment(ctx: TenantContext, profileId: string, ledgerEntryId: string, reason: string, idempotencyKey?: string) {
  assertCreditAccess(ctx, 'reverse');
  if (!reason?.trim()) throw new Error('A reason is required for payment reversal');
  const sql = getSql();

  if (idempotencyKey) {
    const existing = await getIdempotencyKey(sql, idempotencyKey);
    if (existing && existing.status === 'completed') return existing.response_body;
  }

  if (!ctx.isSuperAdmin) await setTenantContext(sql, ctx.organizationId);

  const entry = await sql`SELECT * FROM personal_credit_ledger WHERE id=${ledgerEntryId} AND profile_id=${profileId} AND entry_type='payment' AND (${ctx.isSuperAdmin} OR organization_id=${ctx.organizationId}) LIMIT 1`;
  if (!entry.length) throw new Error('Payment entry not found');
  const payment = entry[0] as any;

  const reversalId = generateId();
  const rows = await sql`WITH target AS (
    SELECT id,organization_id,branch_id,current_balance_ugx
    FROM personal_credit_profiles
    WHERE id=${profileId} AND (${ctx.isSuperAdmin} OR organization_id=${ctx.organizationId}) AND status NOT IN ('cancelled','closed')
  ), updated AS (
    UPDATE personal_credit_profiles p
    SET current_balance_ugx=p.current_balance_ugx+${payment.amount_ugx},
        total_paid_ugx=GREATEST(p.total_paid_ugx-${payment.amount_ugx},0),
        status=CASE WHEN p.current_balance_ugx+${payment.amount_ugx}>0 THEN 'active' ELSE p.status END,
        paid_at=CASE WHEN p.current_balance_ugx+${payment.amount_ugx}>0 THEN NULL ELSE p.paid_at END,
        updated_at=NOW()
    FROM target t WHERE p.id=t.id
    RETURNING p.id,p.organization_id,p.branch_id,p.current_balance_ugx
  ), ledger AS (
    INSERT INTO personal_credit_ledger (id,organization_id,branch_id,profile_id,entry_type,amount_ugx,balance_after_ugx,description,created_by,created_at)
    SELECT ${reversalId},u.organization_id,u.branch_id,u.id,'reversal',${payment.amount_ugx},u.current_balance_ugx,${`Reversal of payment ${ledgerEntryId}: ${reason}`},${ctx.userId},NOW()
    FROM updated u
    RETURNING profile_id
  ) SELECT * FROM updated`;

  if (!rows.length) throw new Error('Payment reversal failed');
  const profile = rows[0] as any;
  assertBranchAccess(ctx, profile.branch_id);

  const result = await getPersonalCreditProfile(ctx, profileId);
  await logAudit(ctx.userId, 'personal_credit.reversal', { profileId, originalPaymentId: ledgerEntryId, reversedAmount: payment.amount_ugx, reason }, profile.organization_id, profile.branch_id);

  if (idempotencyKey) {
    await setIdempotencyKey(sql, idempotencyKey, profile.organization_id, ctx.userId, `${profileId}:${ledgerEntryId}:${reason}`, result);
  }

  return result;
}

// ── WRITE OFF ──────────────────────────────────────────────────────────────────
export async function writeOffCredit(ctx: TenantContext, profileId: string, reason: string, idempotencyKey?: string) {
  assertCreditAccess(ctx, 'writeoff');
  if (!reason?.trim()) throw new Error('A reason is required for write-off');
  const sql = getSql();

  if (idempotencyKey) {
    const existing = await getIdempotencyKey(sql, idempotencyKey);
    if (existing && existing.status === 'completed') return existing.response_body;
  }

  if (!ctx.isSuperAdmin) await setTenantContext(sql, ctx.organizationId);
  const ledgerId = generateId();

  const rows = await sql`WITH target AS (
    SELECT id,organization_id,branch_id,current_balance_ugx
    FROM personal_credit_profiles
    WHERE id=${profileId} AND (${ctx.isSuperAdmin} OR organization_id=${ctx.organizationId}) AND status NOT IN ('paid','cancelled','closed') AND current_balance_ugx > 0
  ), updated AS (
    UPDATE personal_credit_profiles p
    SET current_balance_ugx=0,
        status='written_off',
        written_off_at=NOW(),
        updated_at=NOW()
    FROM target t WHERE p.id=t.id
    RETURNING p.id,p.organization_id,p.branch_id,p.current_balance_ugx
  ), ledger AS (
    INSERT INTO personal_credit_ledger (id,organization_id,branch_id,profile_id,entry_type,amount_ugx,balance_after_ugx,description,created_by,created_at)
    SELECT ${ledgerId},u.organization_id,u.branch_id,u.id,'write_off',u.current_balance_ugx,0,${`Write-off: ${reason}`},${ctx.userId},NOW()
    FROM updated u
    RETURNING profile_id
  ) SELECT * FROM updated`;

  if (!rows.length) throw new Error('Write-off failed: credit profile not found, already paid, or zero balance');
  const profile = rows[0] as any;
  assertBranchAccess(ctx, profile.branch_id);

  const result = await getPersonalCreditProfile(ctx, profileId);
  await logAudit(ctx.userId, 'personal_credit.writeoff', { profileId, reason, writtenOffAmount: profile.current_balance_ugx }, profile.organization_id, profile.branch_id);

  if (idempotencyKey) {
    await setIdempotencyKey(sql, idempotencyKey, profile.organization_id, ctx.userId, `${profileId}:${reason}`, result);
  }

  return result;
}

// ── CANCEL CREDIT ──────────────────────────────────────────────────────────────
export async function cancelCredit(ctx: TenantContext, profileId: string, reason: string) {
  assertCreditAccess(ctx, 'cancel');
  if (!reason?.trim()) throw new Error('A reason is required for cancellation');
  const sql = getSql();
  if (!ctx.isSuperAdmin) await setTenantContext(sql, ctx.organizationId);

  const rows = await sql`UPDATE personal_credit_profiles
    SET status='cancelled', cancelled_at=NOW(), updated_at=NOW()
    WHERE id=${profileId} AND (${ctx.isSuperAdmin} OR organization_id=${ctx.organizationId})
    AND status NOT IN ('paid','cancelled','closed')
    RETURNING id,organization_id,branch_id,current_balance_ugx`;

  if (!rows.length) throw new Error('Cancel failed: credit profile not found or already paid/cancelled');
  const profile = rows[0] as any;
  assertBranchAccess(ctx, profile.branch_id);

  await logAudit(ctx.userId, 'personal_credit.cancel', { profileId, reason, outstandingBalance: profile.current_balance_ugx }, profile.organization_id, profile.branch_id);
  return getPersonalCreditProfile(ctx, profileId);
}

// ── GET CREDIT HISTORY ────────────────────────────────────────────────────────
export async function getPersonalCreditHistory(ctx: TenantContext, profileId: string) {
  assertCreditAccess(ctx, 'view');
  const sql = getSql();
  const profile = await getPersonalCreditProfile(ctx, profileId);
  if (!profile) return null;
  const ledger = await sql`SELECT l.*, s.name AS staff_name, o.total AS order_total, o.table_number FROM personal_credit_ledger l LEFT JOIN staff s ON s.id=l.created_by LEFT JOIN orders o ON o.id=l.order_id WHERE l.profile_id=${profileId} AND l.organization_id=${profile.organization_id} ORDER BY l.created_at DESC LIMIT 500`;
  return { profile, ledger };
}

// ── DASHBOARD ──────────────────────────────────────────────────────────────────
export async function getCreditDashboard(ctx: TenantContext, branchId?: string) {
  assertCreditAccess(ctx, 'view');
  const sql = getSql();
  if (!ctx.isSuperAdmin) await setTenantContext(sql, ctx.organizationId);
  const effectiveBranch = branchId || ctx.branchId;
  if (effectiveBranch) assertBranchAccess(ctx, effectiveBranch);

  const orgFilter = ctx.isSuperAdmin && !effectiveBranch ? sql`1=1` : sql`p.organization_id = ${ctx.organizationId}`;
  const branchFilter = effectiveBranch ? sql`AND p.branch_id = ${effectiveBranch}` : sql``;
  const ledgerOrgFilter = ctx.isSuperAdmin && !effectiveBranch ? sql`1=1` : sql`l.organization_id = ${ctx.organizationId}`;
  const ledgerBranchFilter = effectiveBranch ? sql`AND l.branch_id = ${effectiveBranch}` : sql``;

  const totals = await sql`SELECT
    COALESCE(SUM(CASE WHEN p.status IN ('active','partially_paid','overdue') THEN p.current_balance_ugx ELSE 0 END),0) as total_outstanding,
    COALESCE(SUM(CASE WHEN p.status IN ('active','partially_paid') THEN p.current_balance_ugx ELSE 0 END),0) as total_active,
    COALESCE(SUM(p.total_paid_ugx),0) as total_collected,
    COALESCE(SUM(CASE WHEN p.status='overdue' THEN p.current_balance_ugx ELSE 0 END),0) as overdue_amount,
    COUNT(*) FILTER (WHERE p.status IN ('active','partially_paid','overdue') AND p.current_balance_ugx > 0) as customers_with_balance,
    COUNT(*) FILTER (WHERE p.created_at::date = CURRENT_DATE) as credits_today,
    COUNT(*) FILTER (WHERE p.status='overdue') as overdue_credits
  FROM personal_credit_profiles p WHERE ${orgFilter} ${branchFilter}`;

  const paymentsToday = await sql`SELECT COALESCE(SUM(l.amount_ugx),0) as total
    FROM personal_credit_ledger l
    WHERE l.entry_type='payment' AND l.created_at::date = CURRENT_DATE AND ${ledgerOrgFilter} ${ledgerBranchFilter}`;

  const largestBalances = await sql`SELECT p.*, b.name AS branch_name FROM personal_credit_profiles p JOIN branches b ON b.id=p.branch_id
    WHERE ${orgFilter} ${branchFilter} AND p.current_balance_ugx > 0
    ORDER BY p.current_balance_ugx DESC LIMIT 10`;

  const recentPayments = await sql`SELECT l.*, s.name AS staff_name FROM personal_credit_ledger l LEFT JOIN staff s ON s.id=l.created_by
    WHERE l.entry_type='payment' AND ${ledgerOrgFilter} ${ledgerBranchFilter}
    ORDER BY l.created_at DESC LIMIT 10`;

  const recentActivity = await sql`SELECT l.*, s.name AS staff_name FROM personal_credit_ledger l LEFT JOIN staff s ON s.id=l.created_by
    WHERE ${ledgerOrgFilter} ${ledgerBranchFilter}
    ORDER BY l.created_at DESC LIMIT 20`;

  const t = totals[0] as any;
  return {
    totalOutstanding: Number(t.total_outstanding),
    totalActive: Number(t.total_active),
    totalCollected: Number(t.total_collected),
    overdueAmount: Number(t.overdue_amount),
    customersWithBalance: Number(t.customers_with_balance),
    creditsCreatedToday: Number(t.credits_today),
    paymentsReceivedToday: Number(paymentsToday[0]?.total || 0),
    overdueCredits: Number(t.overdue_credits),
    largestBalances,
    recentPayments,
    recentActivity,
  };
}

// ── REPORTS ────────────────────────────────────────────────────────────────────
export async function getCreditReports(ctx: TenantContext, reportType: string, branchId?: string, dateFrom?: string, dateTo?: string) {
  assertCreditAccess(ctx, 'view');
  const sql = getSql();
  if (!ctx.isSuperAdmin) await setTenantContext(sql, ctx.organizationId);
  const effectiveBranch = branchId || ctx.branchId;
  if (effectiveBranch) assertBranchAccess(ctx, effectiveBranch);

  const isSuperNoBranch = ctx.isSuperAdmin && !effectiveBranch;

  if (reportType === 'outstanding') {
    if (isSuperNoBranch) {
      return await sql`SELECT p.*, b.name AS branch_name FROM personal_credit_profiles p JOIN branches b ON b.id=p.branch_id WHERE p.current_balance_ugx > 0 AND p.status NOT IN ('paid','cancelled','written_off') ORDER BY p.current_balance_ugx DESC LIMIT 500`;
    }
    return await sql`SELECT p.*, b.name AS branch_name FROM personal_credit_profiles p JOIN branches b ON b.id=p.branch_id WHERE p.organization_id=${ctx.organizationId!} AND p.branch_id=${effectiveBranch!} AND p.current_balance_ugx > 0 AND p.status NOT IN ('paid','cancelled','written_off') ORDER BY p.current_balance_ugx DESC LIMIT 500`;
  }
  if (reportType === 'collections') {
    if (isSuperNoBranch) {
      let q = `SELECT l.*, s.name AS staff_name, p.full_name AS customer_name, p.public_reference AS customer_ref FROM personal_credit_ledger l LEFT JOIN staff s ON s.id=l.created_by JOIN personal_credit_profiles p ON p.id=l.profile_id WHERE l.entry_type='payment'`;
      const params: any[] = [];
      if (dateFrom) { q += ` AND l.created_at >= $${params.length + 1}`; params.push(dateFrom); }
      if (dateTo) { q += ` AND l.created_at <= $${params.length + 1}`; params.push(dateTo); }
      q += ` ORDER BY l.created_at DESC LIMIT 500`;
      return await sql(q, params);
    }
    let q = `SELECT l.*, s.name AS staff_name, p.full_name AS customer_name, p.public_reference AS customer_ref FROM personal_credit_ledger l LEFT JOIN staff s ON s.id=l.created_by JOIN personal_credit_profiles p ON p.id=l.profile_id WHERE l.organization_id = $1 AND l.branch_id = $2 AND l.entry_type='payment'`;
    const params: any[] = [ctx.organizationId, effectiveBranch!];
    if (dateFrom) { q += ` AND l.created_at >= $${params.length + 1}`; params.push(dateFrom); }
    if (dateTo) { q += ` AND l.created_at <= $${params.length + 1}`; params.push(dateTo); }
    q += ` ORDER BY l.created_at DESC LIMIT 500`;
    return await sql(q, params);
  }
  if (reportType === 'created') {
    if (isSuperNoBranch) {
      let q = `SELECT p.*, b.name AS branch_name, s.name AS created_by_name FROM personal_credit_profiles p JOIN branches b ON b.id=p.branch_id LEFT JOIN staff s ON s.id=p.created_by WHERE 1=1`;
      const params: any[] = [];
      if (dateFrom) { q += ` AND p.created_at >= $${params.length + 1}`; params.push(dateFrom); }
      if (dateTo) { q += ` AND p.created_at <= $${params.length + 1}`; params.push(dateTo); }
      q += ` ORDER BY p.created_at DESC LIMIT 500`;
      return await sql(q, params);
    }
    let q = `SELECT p.*, b.name AS branch_name, s.name AS created_by_name FROM personal_credit_profiles p JOIN branches b ON b.id=p.branch_id LEFT JOIN staff s ON s.id=p.created_by WHERE p.organization_id = $1 AND p.branch_id = $2`;
    const params: any[] = [ctx.organizationId, effectiveBranch!];
    if (dateFrom) { q += ` AND p.created_at >= $${params.length + 1}`; params.push(dateFrom); }
    if (dateTo) { q += ` AND p.created_at <= $${params.length + 1}`; params.push(dateTo); }
    q += ` ORDER BY p.created_at DESC LIMIT 500`;
    return await sql(q, params);
  }
  if (reportType === 'writeoffs') {
    if (isSuperNoBranch) {
      return await sql`SELECT l.*, s.name AS staff_name, p.full_name AS customer_name FROM personal_credit_ledger l LEFT JOIN staff s ON s.id=l.created_by JOIN personal_credit_profiles p ON p.id=l.profile_id WHERE l.entry_type='write_off' ORDER BY l.created_at DESC LIMIT 500`;
    }
    return await sql`SELECT l.*, s.name AS staff_name, p.full_name AS customer_name FROM personal_credit_ledger l LEFT JOIN staff s ON s.id=l.created_by JOIN personal_credit_profiles p ON p.id=l.profile_id WHERE l.organization_id=${ctx.organizationId!} AND l.branch_id=${effectiveBranch!} AND l.entry_type='write_off' ORDER BY l.created_at DESC LIMIT 500`;
  }
  throw new Error('Invalid report type');
}

// ── SUPER ADMIN: LIST ALL ──────────────────────────────────────────────────────
export async function listAllCreditsSuperAdmin(ctx: TenantContext, search?: string, status?: string, page: number = 1, limit: number = 50) {
  if (!ctx.isSuperAdmin) throw new Error('Super Admin access required');
  const sql = getSql();
  const offset = Math.max(0, (page - 1) * limit);
  let where = '1=1';
  const params: any[] = [];
  if (status && status !== 'all') { where += ` AND p.status = $${params.length + 1}`; params.push(status); }
  if (search) { where += ` AND (p.full_name ILIKE $${params.length + 1} OR p.phone ILIKE $${params.length + 1} OR p.public_reference ILIKE $${params.length + 1} OR o.name ILIKE $${params.length + 1})`; params.push(`%${search}%`); }
  const countParams = [...params];
  const countResult = await sql(`SELECT COUNT(*)::int as count FROM personal_credit_profiles p LEFT JOIN organizations o ON o.id=p.organization_id WHERE ${where}`, countParams);
  const total = countResult[0]?.count || 0;
  params.push(limit, offset);
  const rows = await sql(`SELECT p.*, b.name AS branch_name, o.name AS organization_name FROM personal_credit_profiles p JOIN branches b ON b.id=p.branch_id LEFT JOIN organizations o ON o.id=p.organization_id WHERE ${where} ORDER BY p.updated_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return { profiles: rows, total, page, limit };
}
