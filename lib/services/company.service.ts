// KROWN POS — Company + Corporate Credit Management
import { getSql } from '@/lib/neon-server';
import { TenantContext, setTenantContext } from '@/lib/tenant';
import { generateId } from '@/lib/id';
import { logAudit } from '@/lib/audit';

export interface Company {
  id: string; organization_id: string; name: string; tax_id: string;
  credit_limit_ugx: number; current_balance_ugx: number; contact_person: string; phone: string;
  status: 'active' | 'suspended' | 'closed'; branch_id?: string; created_at: number; updated_at: number;
}

export interface CompanyStaff {
  id: string; company_id: string; organization_id: string; name: string; work_id?: string;
  email?: string; department?: string; credit_limit_ugx?: number;
  status: 'active' | 'inactive' | 'banned'; total_spent_ugx: number; created_at: number; updated_at: number;
}

const COMPANY_UPDATE_FIELDS = new Set(['name', 'tax_id', 'credit_limit_ugx', 'contact_person', 'phone', 'branch_id']);
const STAFF_UPDATE_FIELDS = new Set(['name', 'work_id', 'email', 'department', 'credit_limit_ugx', 'status']);

function cleanText(value: unknown, max = 500) { return String(value ?? '').trim().slice(0, max); }
function finiteNonNegative(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export async function listCompanies(ctx: TenantContext, branchId?: string): Promise<Company[]> {
  const sql = getSql();
  await setTenantContext(sql, ctx.organizationId);
  if (ctx.isSuperAdmin) {
    const rows = branchId
      ? await sql`SELECT * FROM companies WHERE branch_id=${branchId} OR branch_id IS NULL ORDER BY name ASC`
      : await sql`SELECT * FROM companies ORDER BY name ASC`;
    return rows as Company[];
  }
  const rows = branchId
    ? await sql`SELECT * FROM companies WHERE organization_id=${ctx.organizationId} AND (branch_id=${branchId} OR branch_id IS NULL) ORDER BY name ASC`
    : await sql`SELECT * FROM companies WHERE organization_id=${ctx.organizationId} ORDER BY name ASC`;
  return rows as Company[];
}

export async function getCompany(ctx: TenantContext, companyId: string): Promise<Company | null> {
  const sql = getSql();
  await setTenantContext(sql, ctx.organizationId);
  const rows = await sql`SELECT * FROM companies WHERE id=${companyId} AND organization_id=${ctx.organizationId}`;
  return rows.length ? rows[0] as Company : null;
}

export async function createCompany(ctx: TenantContext, input: {
  name: string; taxId: string; creditLimitUGX: number; contactPerson: string; phone: string; branchId?: string;
}): Promise<Company> {
  const sql = getSql();
  await setTenantContext(sql, ctx.organizationId);
  const name = cleanText(input.name, 160);
  if (!name) throw new Error('Company name is required');
  const creditLimit = finiteNonNegative(input.creditLimitUGX);
  const id = generateId();

  await sql`INSERT INTO companies
    (id, organization_id, name, tax_id, credit_limit_ugx, current_balance_ugx, contact_person, phone, status, branch_id, created_at, updated_at)
    VALUES (${id}, ${ctx.organizationId}, ${name}, ${cleanText(input.taxId, 80)}, ${creditLimit}, 0,
      ${cleanText(input.contactPerson, 160)}, ${cleanText(input.phone, 40)}, 'active', ${input.branchId || ctx.branchId || null}, NOW(), NOW())`;

  await logAudit(ctx.userId, 'company.create', { companyId: id, name }, ctx.organizationId, ctx.branchId);
  const rows = await sql`SELECT * FROM companies WHERE id=${id} AND organization_id=${ctx.organizationId}`;
  return rows[0] as Company;
}

export async function updateCompany(ctx: TenantContext, companyId: string, updates: Partial<Pick<Company, 'name' | 'tax_id' | 'credit_limit_ugx' | 'contact_person' | 'phone' | 'branch_id'>>): Promise<Company> {
  const sql = getSql();
  await setTenantContext(sql, ctx.organizationId);
  const existing = await sql`SELECT * FROM companies WHERE id=${companyId} AND organization_id=${ctx.organizationId}`;
  if (!existing.length) throw new Error('Company not found');

  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (!COMPANY_UPDATE_FIELDS.has(key) || value === undefined) continue;
    if (key === 'name') safe[key] = cleanText(value, 160);
    else if (key === 'tax_id') safe[key] = cleanText(value, 80);
    else if (key === 'contact_person') safe[key] = cleanText(value, 160);
    else if (key === 'phone') safe[key] = cleanText(value, 40);
    else if (key === 'credit_limit_ugx') safe[key] = finiteNonNegative(value);
    else safe[key] = value;
  }
  const fields = Object.keys(safe);
  if (!fields.length) return existing[0] as Company;

  // Field names are selected only from the fixed allow-list above. Values remain
  // parameterized, so callers cannot inject SQL through the update payload.
  const values = fields.map(f => safe[f]);
  const setClauses = fields.map((f, i) => `${f}=$${i + 1}`).join(', ');
  await sql(`UPDATE companies SET ${setClauses}, updated_at=NOW() WHERE id=$${fields.length + 1} AND organization_id=$${fields.length + 2}`, [...values, companyId, ctx.organizationId]);

  await logAudit(ctx.userId, 'company.update', { companyId, fields }, ctx.organizationId, ctx.branchId);
  const rows = await sql`SELECT * FROM companies WHERE id=${companyId} AND organization_id=${ctx.organizationId}`;
  return rows[0] as Company;
}

export async function toggleStatus(ctx: TenantContext, companyId: string, newStatus: Company['status']): Promise<Company> {
  if (!['active', 'suspended', 'closed'].includes(newStatus)) throw new Error('Invalid company status');
  const sql = getSql();
  await setTenantContext(sql, ctx.organizationId);
  const existing = await sql`SELECT * FROM companies WHERE id=${companyId} AND organization_id=${ctx.organizationId}`;
  if (!existing.length) throw new Error('Company not found');
  await sql`UPDATE companies SET status=${newStatus}, updated_at=NOW() WHERE id=${companyId} AND organization_id=${ctx.organizationId}`;
  await logAudit(ctx.userId, 'company.toggle_status', { companyId, status: newStatus }, ctx.organizationId, ctx.branchId);
  const rows = await sql`SELECT * FROM companies WHERE id=${companyId} AND organization_id=${ctx.organizationId}`;
  return rows[0] as Company;
}

export async function listCompanyStaff(ctx: TenantContext, companyId: string): Promise<CompanyStaff[]> {
  const sql = getSql();
  await setTenantContext(sql, ctx.organizationId);
  const company = await sql`SELECT id FROM companies WHERE id=${companyId} AND organization_id=${ctx.organizationId}`;
  if (!company.length) throw new Error('Company not found');
  const rows = await sql`SELECT * FROM company_staff WHERE company_id=${companyId} AND organization_id=${ctx.organizationId} ORDER BY name ASC`;
  return rows as CompanyStaff[];
}

export async function addCompanyStaff(ctx: TenantContext, companyId: string, input: {
  name: string; workId?: string; email?: string; department?: string; creditLimitUGX?: number;
}): Promise<CompanyStaff> {
  const sql = getSql();
  await setTenantContext(sql, ctx.organizationId);
  const company = await sql`SELECT id, status FROM companies WHERE id=${companyId} AND organization_id=${ctx.organizationId}`;
  if (!company.length) throw new Error('Company not found');
  if (company[0].status !== 'active') throw new Error('Company account is not active');
  const name = cleanText(input.name, 160);
  if (!name) throw new Error('Staff name is required');
  const creditLimit = finiteNonNegative(input.creditLimitUGX, 0);
  const id = generateId();

  await sql`INSERT INTO company_staff
    (id, company_id, organization_id, name, work_id, email, department, credit_limit_ugx, status, created_at, updated_at)
    VALUES (${id}, ${companyId}, ${ctx.organizationId}, ${name}, ${cleanText(input.workId, 80) || null},
      ${cleanText(input.email, 254) || null}, ${cleanText(input.department, 120) || null}, ${creditLimit}, 'active', NOW(), NOW())`;

  await logAudit(ctx.userId, 'company.add_staff', { companyId, staffId: id, name }, ctx.organizationId, ctx.branchId);
  const rows = await sql`SELECT * FROM company_staff WHERE id=${id} AND organization_id=${ctx.organizationId}`;
  return rows[0] as CompanyStaff;
}

export async function updateCompanyStaff(ctx: TenantContext, companyId: string, staffId: string, updates: Partial<Pick<CompanyStaff, 'name' | 'work_id' | 'email' | 'department' | 'credit_limit_ugx' | 'status'>>): Promise<CompanyStaff> {
  const sql = getSql();
  await setTenantContext(sql, ctx.organizationId);
  const existing = await sql`SELECT * FROM company_staff WHERE id=${staffId} AND company_id=${companyId} AND organization_id=${ctx.organizationId}`;
  if (!existing.length) throw new Error('Company staff not found');

  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (!STAFF_UPDATE_FIELDS.has(key) || value === undefined) continue;
    if (key === 'name') safe[key] = cleanText(value, 160);
    else if (key === 'work_id') safe[key] = cleanText(value, 80) || null;
    else if (key === 'email') safe[key] = cleanText(value, 254) || null;
    else if (key === 'department') safe[key] = cleanText(value, 120) || null;
    else if (key === 'credit_limit_ugx') safe[key] = finiteNonNegative(value, 0);
    else if (key === 'status' && ['active', 'inactive', 'banned'].includes(String(value))) safe[key] = value;
  }
  const fields = Object.keys(safe);
  if (!fields.length) return existing[0] as CompanyStaff;
  const values = fields.map(f => safe[f]);
  const setClauses = fields.map((f, i) => `${f}=$${i + 1}`).join(', ');
  await sql(`UPDATE company_staff SET ${setClauses}, updated_at=NOW() WHERE id=$${fields.length + 1} AND company_id=$${fields.length + 2} AND organization_id=$${fields.length + 3}`, [...values, staffId, companyId, ctx.organizationId]);
  await logAudit(ctx.userId, 'company.update_staff', { companyId, staffId, fields }, ctx.organizationId, ctx.branchId);
  const rows = await sql`SELECT * FROM company_staff WHERE id=${staffId} AND organization_id=${ctx.organizationId}`;
  return rows[0] as CompanyStaff;
}

export async function deleteCompanyStaff(ctx: TenantContext, companyId: string, staffId: string): Promise<void> {
  const sql = getSql();
  await setTenantContext(sql, ctx.organizationId);
  const existing = await sql`SELECT id FROM company_staff WHERE id=${staffId} AND company_id=${companyId} AND organization_id=${ctx.organizationId}`;
  if (!existing.length) throw new Error('Company staff not found');
  await sql`DELETE FROM company_staff WHERE id=${staffId} AND company_id=${companyId} AND organization_id=${ctx.organizationId}`;
  await logAudit(ctx.userId, 'company.delete_staff', { companyId, staffId }, ctx.organizationId, ctx.branchId);
}

export async function settleBalance(ctx: TenantContext, companyId: string, amount: number, paymentMethod: string): Promise<Company> {
  const sql = getSql();
  await setTenantContext(sql, ctx.organizationId);
  const cleanAmount = finiteNonNegative(amount);
  if (cleanAmount <= 0) throw new Error('Settlement amount must be greater than zero');

  const existing = await sql`SELECT * FROM companies WHERE id=${companyId} AND organization_id=${ctx.organizationId} FOR UPDATE`;
  if (!existing.length) throw new Error('Company not found');
  const company = existing[0] as Company;
  if (cleanAmount > Number(company.current_balance_ugx)) throw new Error('Settlement amount exceeds current balance');
  const newBalance = Number(company.current_balance_ugx) - cleanAmount;

  await sql`UPDATE companies SET current_balance_ugx=${newBalance}, updated_at=NOW() WHERE id=${companyId} AND organization_id=${ctx.organizationId}`;
  await sql`INSERT INTO accounting_ledger (id, organization_id, restaurant_id, type, amount, created_at)
    VALUES (${generateId()}, ${ctx.organizationId}, ${company.branch_id || ctx.branchId || null}, 'SETTLEMENT', ${cleanAmount}, NOW())`;
  await logAudit(ctx.userId, 'company.settle_balance', { companyId, amount: cleanAmount, method: cleanText(paymentMethod, 40) }, ctx.organizationId, ctx.branchId);

  const rows = await sql`SELECT * FROM companies WHERE id=${companyId} AND organization_id=${ctx.organizationId}`;
  return rows[0] as Company;
}

export async function checkStaffAllowed(ctx: TenantContext, staffId: string): Promise<{ allowed: boolean; reason?: string; companyStaff?: CompanyStaff }> {
  const sql = getSql();
  await setTenantContext(sql, ctx.organizationId);
  const rows = await sql`SELECT cs.*, c.status AS company_status
    FROM company_staff cs JOIN companies c ON cs.company_id=c.id
    WHERE cs.id=${staffId} AND cs.organization_id=${ctx.organizationId} AND c.organization_id=${ctx.organizationId}`;
  if (!rows.length) return { allowed: false, reason: 'Staff member not found' };
  const record = rows[0] as any;
  if (record.status !== 'active') return { allowed: false, reason: 'Staff member is not active' };
  if (record.company_status !== 'active') return { allowed: false, reason: 'Company account is not active' };
  if (record.credit_limit_ugx !== null && Number(record.total_spent_ugx || 0) >= Number(record.credit_limit_ugx)) return { allowed: false, reason: 'Staff credit limit reached' };
  return { allowed: true, companyStaff: record as CompanyStaff };
}
