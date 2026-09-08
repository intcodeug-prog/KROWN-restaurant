/**
 * KROWN POS - Thin Client-Side Cache Layer
 *
 * Replaces the 2100-line monolithic singleton with a thin in-memory cache.
 * All business logic (totals, inventory deduction, corporate credit, role checks,
 * audit logging) is handled server-side. This layer:
 *   1. Fetches data from the Neon API endpoints on startup
 *   2. Caches it in memory with localStorage persistence for offline
 *   3. Exposes filtered getters for UI consumption
 *   4. Delegates all writes to the typed api.* methods
 *   5. Queues offline ops via the sync engine for later replay
 */

import {
  Product, Ingredient, Order, Branch, StaffMember, AuditLog,
  CompanyProfile, CompanyStaff, PlaceZone, Expense,
  InventoryMovement, ProductIngredient, ProductAddOn, PrintJob,
} from './mockData';
import { api } from '@/lib/neon-client';
import { queueOfflineOp, initAutoSync } from './sync';

type Listener = () => void;

export interface TableOccupancy {
  status: 'available' | 'occupied' | 'reserved';
  wholeTableOpen: boolean;
  openSeats: string[];
}

// ── Offline-aware write helper ──────────────────────────────────────────────
// Routes through new authenticated API endpoints; falls back to IndexedDB queue when offline.
const TABLE_ENDPOINT_MAP: Record<string, string> = {
  products: '/api/products',
  ingredients: '/api/ingredients',
  orders: '/api/orders',
  staff: '/api/staff',
  companies: '/api/companies',
  company_staff: '/api/companies',   // routed to /api/companies/:companyId/staff by safeWrite
  branches: '/api/branches',
  zones: '/api/zones',
  expenses: '/api/expenses',
  inventory_movements: '/api/inventory/movements',
  audit_logs: '/api/audit',
  print_jobs: '/api/print-jobs',
  product_ingredients: '/api/products',  // routed to /api/products/:id/recipe by safeWrite
};

async function safeWrite(
  table: string,
  method: 'upsert' | 'update' | 'insert' | 'delete',
  payload: any,
  _conflictKey = 'id'
): Promise<void> {
  const baseEndpoint = TABLE_ENDPOINT_MAP[table] || `/api/${table}`;

  // For DELETE and UPDATE operations, the endpoint must include the record ID.
  // Without this, DELETE goes to /api/products instead of /api/products/<id>.
  let endpoint = baseEndpoint;
  let httpMethod: string;
  let body: string | undefined;

  if (method === 'delete') {
    if (!payload?.id) {
      console.warn(`[DataStore] DELETE on ${table} skipped — payload has no id:`, payload);
      return; // Prevent DELETE /undefined
    }
    endpoint = `${baseEndpoint}/${payload.id}`;
    httpMethod = 'DELETE';
    body = undefined; // DELETE has no body
  } else if (method === 'update') {
    if (!payload?.id) {
      console.warn(`[DataStore] UPDATE on ${table} skipped — payload has no id:`, payload);
      return;
    }
    endpoint = `${baseEndpoint}/${payload.id}`;
    httpMethod = 'PUT';
    body = JSON.stringify(payload);
  } else {
    // insert / upsert → POST to collection endpoint
    httpMethod = 'POST';
    body = JSON.stringify(payload);
  }

  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  if (!isOnline) {
    await queueOfflineOp({ endpoint, method: httpMethod, body: payload });
    return;
  }
  try {
    const res = await fetch(endpoint, {
      method: httpMethod,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      credentials: 'include',
      ...(body ? { body } : {}),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.warn(`[DataStore] API ${method} error on ${table}:`, errBody.error || res.status);
      await queueOfflineOp({ endpoint, method: httpMethod, body: payload });
    }
  } catch (e) {
    console.warn(`[DataStore] Network error on ${table}, queuing offline:`, e);
    await queueOfflineOp({ endpoint, method: httpMethod, body: payload });
  }
}

// ─── DB Mapping Helpers ─────────────────────────────────────────────────────

function toDbOrder(o: Order): any {
  let createdNum: number;
  if (typeof o.createdAt === 'number') {
    createdNum = o.createdAt;
  } else if (typeof o.createdAt === 'string') {
    createdNum = new Date(o.createdAt).getTime();
  } else {
    createdNum = Date.now();
  }
  return {
    id: o.id, table_number: o.table, place: o.place, seat: o.seat,
    type: o.type, status: o.status, payment_status: o.paymentStatus ?? 'unpaid',
    paid_amount: o.paidAmount ?? 0, split_payments: o.splitPayments ?? [],
    items: o.items, subtotal: o.subtotal, tax: o.tax, total: o.total,
    payment_method: o.paymentMethod ?? null,
    is_corporate_credit: o.isCorporateCredit ?? false,
    company_id: o.companyId ?? null, company_name: o.companyName ?? null,
    company_staff_id: o.companyStaffId ?? null, company_staff_name: o.companyStaffName ?? null,
    work_id: o.workId ?? null,
    prep_estimated_minutes: o.prepEstimatedMinutes ?? 15,
    prep_started_at: o.prepStartedAt
      ? (typeof o.prepStartedAt === 'number' ? o.prepStartedAt : new Date(o.prepStartedAt).getTime())
      : null,
    restaurant_id: o.restaurantId ?? null, branch_name: o.branchName ?? null,
    user_id: o.userId ?? null, created_at: createdNum,
    tin_number: o.tinNumber ?? null, notes: o.notes ?? null,
    amount_received: o.amountReceived ?? null, change_amount: o.change ?? null,
  };
}

function fromDbOrder(r: any): Order {
  let parsedCreatedAt = Date.now();
  if (r.created_at) {
    parsedCreatedAt = typeof r.created_at === 'string' ? new Date(r.created_at).getTime() : Number(r.created_at);
  }
  // Normalize type from snake_case (DB) to title case (client)
  const typeMap: Record<string, string> = { dine_in: 'Dine In', takeaway: 'Takeaway', delivery: 'Delivery' };
  const normalizedType = typeMap[r.type] || r.type || 'Dine In';
  return {
    id: r.id, table: r.table_number, place: r.place || undefined, seat: r.seat,
    type: normalizedType as any, status: r.status,
    paymentStatus: r.payment_status || 'unpaid', paidAmount: r.paid_amount || 0,
    splitPayments: r.split_payments || [], items: r.items ?? [],
    subtotal: r.subtotal, tax: r.tax, total: r.total,
    paymentMethod: r.payment_method,
    isCorporateCredit: r.is_corporate_credit, companyId: r.company_id,
    companyName: r.company_name, companyStaffId: r.company_staff_id,
    companyStaffName: r.company_staff_name, workId: r.work_id,
    prepEstimatedMinutes: r.prep_estimated_minutes,
    amountReceived: r.amount_received ? Number(r.amount_received) : undefined,
    change: r.change_amount ? Number(r.change_amount) : undefined,
    prepStartedAt: r.prep_started_at
      ? (typeof r.prep_started_at === 'string' ? new Date(r.prep_started_at).getTime() : Number(r.prep_started_at))
      : undefined,
    restaurantId: r.restaurant_id, branchName: r.branch_name,
    userId: r.user_id, createdAt: parsedCreatedAt,
    tinNumber: r.tin_number ?? undefined, notes: r.notes ?? undefined,
  };
}

function toDbProduct(p: Product): any {
  return {
    id: p.id, name: p.name, price: p.price, category: p.category,
    image: p.image, available: p.available,
    requires_kitchen: p.requiresKitchen ?? true, description: p.description ?? null,
    branch_id: p.branchId ?? null, branch_name: p.branchName ?? null,
    linked_ingredient_id: p.linkedIngredientId ?? null,
    deduct_from_inventory: p.deductFromInventory ?? false,
    inventory_deduct_amount: p.inventoryDeductAmount ?? 1, add_ons: p.addOns ?? [],
  };
}

function fromDbProduct(r: any): Product {
  return {
    id: r.id, name: r.name, price: r.price, category: r.category,
    image: r.image, available: r.available, requiresKitchen: r.requires_kitchen ?? true,
    description: r.description, branchId: r.branch_id, branchName: r.branch_name,
    linkedIngredientId: r.linked_ingredient_id ?? undefined,
    deductFromInventory: r.deduct_from_inventory ?? false,
    inventoryDeductAmount: r.inventory_deduct_amount ?? 1, addOns: r.add_ons ?? [],
  };
}

function toDbIngredient(i: Ingredient): any {
  return {
    id: i.id, name: i.name, quantity: i.quantity, unit: i.unit,
    min_threshold: i.minThreshold, category: i.category,
    cost_per_unit_ugx: i.costPerUnitUGX, supplier: i.supplier,
    branch_id: i.branchId ?? null, branch_name: i.branchName ?? null,
    deduct_from_sales: i.deductFromSales ?? false,
    linked_product_id: i.linkedProductId ?? null,
    deduct_amount_per_sale: i.deductAmountPerSale ?? 1,
  };
}

function fromDbIngredient(r: any): Ingredient {
  return {
    id: r.id, name: r.name, quantity: r.quantity, unit: r.unit,
    minThreshold: r.min_threshold, category: r.category,
    costPerUnitUGX: r.cost_per_unit_ugx, supplier: r.supplier,
    branchId: r.branch_id, branchName: r.branch_name,
    deductFromSales: r.deduct_from_sales ?? false,
    linkedProductId: r.linked_product_id ?? undefined,
    deductAmountPerSale: r.deduct_amount_per_sale ?? 1,
  };
}

function toDbCompany(c: CompanyProfile): any {
  let createdNum: number;
  if (typeof c.createdAt === 'number') createdNum = c.createdAt;
  else if (typeof c.createdAt === 'string') createdNum = new Date(c.createdAt).getTime();
  else createdNum = Date.now();
  return {
    id: c.id, name: c.name, tax_id: c.taxId,
    credit_limit_ugx: c.creditLimitUGX, current_balance_ugx: c.currentBalanceUGX,
    contact_person: c.contactPerson, phone: c.phone, status: c.status,
    created_at: createdNum, branch_id: c.branchId || null, branch_name: c.branchName || null,
  };
}

function fromDbCompany(r: any): CompanyProfile {
  let parsedCreatedAt = Date.now();
  if (r.created_at) {
    parsedCreatedAt = typeof r.created_at === 'string' ? new Date(r.created_at).getTime() : Number(r.created_at);
  }
  return {
    id: r.id, name: r.name, taxId: r.tax_id,
    creditLimitUGX: r.credit_limit_ugx, currentBalanceUGX: r.current_balance_ugx,
    contactPerson: r.contact_person, phone: r.phone, status: r.status,
    createdAt: parsedCreatedAt, branchId: r.branch_id || null, branchName: r.branch_name || null,
  };
}

function toDbCompanyStaff(s: CompanyStaff): any {
  return {
    id: s.id, company_id: s.companyId, name: s.name, work_id: s.workId,
    email: s.email, department: s.department,
    credit_limit_ugx: s.creditLimitUGX, status: s.status,
  };
}

function fromDbCompanyStaff(r: any): CompanyStaff {
  return {
    id: r.id, companyId: r.company_id, name: r.name, workId: r.work_id,
    email: r.email, department: r.department,
    creditLimitUGX: r.credit_limit_ugx, status: r.status,
  };
}

function toDbStaff(s: StaffMember): any {
  return {
    id: s.id, name: s.name, email: s.email, role: s.role,
    branch: s.branch, status: s.status, avatar: s.avatar,
    phone: s.phone ?? null, pin_code: s.pinCode ?? null,
    id_type: s.idType ?? null, id_number: s.idNumber ?? null,
    assigned_branch_id: s.assignedBranchId ?? null,
  };
}

function fromDbStaff(r: any): StaffMember {
  return {
    id: r.id, name: r.name, email: r.email, phone: r.phone,
    pinCode: r.pin_code || r.pinCode, idType: r.id_type, idNumber: r.id_number,
    role: r.role, branch: r.branch, assignedBranchId: r.assigned_branch_id,
    status: r.status, avatar: r.avatar,
  };
}

function toDbZone(z: PlaceZone): any {
  return {
    id: z.id, name: z.name, icon: z.icon, description: z.description,
    branch_id: z.branchId ?? null, branch_name: z.branchName ?? null,
    tables: z.tables ?? [],
  };
}

function fromDbZone(r: any): PlaceZone {
  return {
    id: r.id, name: r.name, icon: r.icon, description: r.description,
    branchId: r.branch_id, branchName: r.branch_name, tables: r.tables ?? [],
  };
}

function toDbExpense(e: Expense): any {
  let createdNum: number;
  if (typeof e.createdAt === 'number') createdNum = e.createdAt;
  else if (typeof e.createdAt === 'string') createdNum = new Date(e.createdAt).getTime();
  else createdNum = Date.now();
  return {
    id: e.id, branch_id: e.branchId ?? null, branch_name: e.branchName ?? null,
    title: e.title, category: e.category, amount_ugx: e.amountUGX,
    vat_amount_ugx: e.vatAmountUGX, receipt_url: e.receiptUrl ?? null,
    notes: e.notes ?? null, created_at: createdNum,
  };
}

function fromDbExpense(r: any): Expense {
  return {
    id: r.id, branchId: r.branch_id, branchName: r.branch_name,
    title: r.title, category: r.category, amountUGX: r.amount_ugx,
    vatAmountUGX: r.vat_amount_ugx, receiptUrl: r.receipt_url,
    notes: r.notes, createdAt: r.created_at,
  };
}

function toDbBranch(b: Branch): any {
  return {
    id: b.id, name: b.name, location: b.location, city: b.city || 'Kampala',
    manager: b.manager || 'Branch Manager', phone: b.phone || '+256 700 000 000',
    email: b.email || 'info@krownpos.com', tax_id: b.taxId || 'URA-100293481',
    address: b.address || b.location,
    receipt_header_note: b.receiptHeaderNote || `Welcome to ${b.name}`,
    receipt_footer_note: b.receiptFooterNote || 'Thank you for dining with us! Powered by Krown Enterprise POS',
    tables_count: b.tablesCount || 20, daily_revenue_ugx: b.dailyRevenueUGX || 0,
    orders_today: b.ordersToday || 0, status: b.status || 'online',
  };
}

function fromDbBranch(r: any): Branch {
  return {
    id: r.id, name: r.name, location: r.location, city: r.city || 'Kampala',
    manager: r.manager || r.manager_name || 'Branch Manager',
    phone: r.phone || '+256 700 000 000', email: r.email || 'info@krownpos.com',
    taxId: r.tax_id || 'URA-100293481', address: r.address || r.location,
    receiptHeaderNote: r.receipt_header_note || `Welcome to ${r.name}`,
    receiptFooterNote: r.receipt_footer_note || 'Thank you for dining with us! Powered by Krown Enterprise POS',
    tablesCount: Number(r.tables_count) || 20,
    dailyRevenueUGX: Number(r.daily_revenue_ugx) || 0,
    ordersToday: Number(r.orders_today) || 0, status: r.status || 'online',
  };
}

function toDbMovement(m: InventoryMovement): any {
  return {
    id: m.id, ingredient_id: m.ingredientId, ingredient_name: m.ingredientName,
    type: m.type, quantity_change: m.quantityChange,
    quantity_before: m.quantityBefore, quantity_after: m.quantityAfter,
    order_id: m.orderId ?? null, product_name: m.productName ?? null,
    branch_id: m.branchId ?? null, branch_name: m.branchName ?? null,
    performed_by: m.performedBy ?? 'System POS', created_at: m.createdAt || Date.now(),
  };
}

function fromDbMovement(r: any): InventoryMovement {
  return {
    id: r.id, ingredientId: r.ingredient_id, ingredientName: r.ingredient_name,
    type: r.type || 'sale_deduction', quantityChange: Number(r.quantity_change) || 0,
    quantityBefore: Number(r.quantity_before) || 0, quantityAfter: Number(r.quantity_after) || 0,
    orderId: r.order_id, productName: r.product_name,
    branchId: r.branch_id, branchName: r.branch_name,
    performedBy: r.performed_by,
    createdAt: r.created_at ? (typeof r.created_at === 'string' ? new Date(r.created_at).getTime() : Number(r.created_at)) : Date.now(),
  };
}

function toDbAuditLog(l: AuditLog): any {
  return {
    id: l.id, user_email: l.userEmail, action: l.action,
    details: l.details || {}, ip_address: l.ipAddress || l.pcInfo || '',
    created_at: l.timestamp || Date.now(),
    staff_id: l.userId || null, branch_id: l.branchId || null, branch_name: l.branchName || null,
  };
}

function fromDbAuditLog(r: any): AuditLog {
  const dt = r.details || {};
  return {
    id: r.id, userEmail: r.user_email || dt.userEmail || dt.email || 'System',
    userId: r.staff_id || r.user_id || dt.userId || dt.staffId,
    userName: dt.userName || dt.name || (r.user_email ? r.user_email.split('@')[0] : 'Staff'),
    role: dt.role || dt.staffRole, action: r.action || 'ACTIVITY',
    section: dt.section || dt.portal || 'System',
    pcInfo: r.ip_address || dt.pcInfo || dt.device, details: dt,
    ipAddress: r.ip_address,
    timestamp: r.created_at ? (typeof r.created_at === 'string' ? new Date(r.created_at).getTime() : Number(r.created_at)) : Date.now(),
    branchId: r.branch_id || dt.branchId, branchName: r.branch_name || dt.branchName || dt.branch,
  };
}

function toDbPrintJob(pj: PrintJob): any {
  return {
    id: pj.id, order_id: pj.orderId, type: pj.type,
    destination: pj.destination, printer_id: pj.printerId ?? null,
    payload: pj.payload, status: pj.status, attempts: pj.attempts,
    created_at: pj.createdAt, last_error: pj.lastError ?? null,
    printed_at: pj.printedAt ?? null,
  };
}

function fromDbPrintJob(r: any): PrintJob {
  return {
    id: r.id, orderId: r.order_id, type: r.type,
    destination: r.destination, printerId: r.printer_id,
    payload: r.payload, status: r.status, attempts: r.attempts ?? 0,
    createdAt: r.created_at ? Number(r.created_at) : Date.now(),
    lastError: r.last_error, printedAt: r.printed_at ? Number(r.printed_at) : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

class DataStoreEngine {
  private products: Product[] = [];
  private productIngredients: ProductIngredient[] = [];
  private ingredients: Ingredient[] = [];
  private inventoryMovements: InventoryMovement[] = [];
  private orders: Order[] = [];
  private branches: Branch[] = [];
  private staff: StaffMember[] = [];
  private auditLogs: AuditLog[] = [];
  private companies: CompanyProfile[] = [];
  private companyStaff: CompanyStaff[] = [];
  private zones: PlaceZone[] = [];
  private expenses: Expense[] = [];
  private listeners: Set<Listener> = new Set();
  private customCategories: string[] = [];
  private printJobs: PrintJob[] = [];
  private onlineStaffPresence: Array<{ staffId: string; email?: string; branch?: string; assignedBranchId?: string }> = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastFetchAt: number = 0;

  constructor() {
    this.loadLocal();
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('krown_session_token');
      if (token) {
        this.fetchAll().catch(e => console.warn('[DataStore] init error:', e));
      }
      initAutoSync();
      this.startPolling();
    }
  }

  private startPolling() {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(async () => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('krown_session_token') : null;
      if (!token) return;
      try {
        await this.refreshOrders();
        this.lastFetchAt = Date.now();
      } catch { /* ignore poll errors */ }
    }, 2000);
  }

  private async refreshOrders() {
    try {
      const safe = async (p: Promise<any>): Promise<{ data: any; ok: boolean }> => {
        try { const res = await p; return { data: res?.data ?? res ?? [], ok: true }; }
        catch (e) { console.warn('[DataStore] refreshOrders API error:', e); return { data: [], ok: false }; }
      };
      const ordersRes = await safe(api.orders.list(undefined, undefined, undefined, 500));
      if (ordersRes.ok && Array.isArray(ordersRes.data)) {
        const dbOrders = ordersRes.data.map(fromDbOrder);
        const dbOrderIds = new Set(dbOrders.map(o => o.id));
        // Keep local-only orders (not yet in DB) — these are optimistically inserted
        const localOnlyOrders = this.orders.filter(o => !dbOrderIds.has(o.id));
        // Merge: local-only orders first, then all DB orders
        this.orders = [...localOnlyOrders, ...dbOrders];
        this.persistLocal();
      }
    } catch (e) { console.warn('[DataStore] refreshOrders error:', e); }
  }

  // ── Public refresh method — call after login to fetch fresh data from API ──
  public async refresh() {
    try {
      await this.fetchAll();
    } catch (e) {
      console.warn('[DataStore] refresh error:', e);
    }
  }

  // ── Online presence ────────────────────────────────────────────────────────

  public setOnlineStaffPresence(presence: Array<{ staffId: string; email?: string; branch?: string; assignedBranchId?: string }>) {
    this.onlineStaffPresence = presence;
    this.notify();
  }

  public isBranchOnline(branchId: string, branchName: string): boolean {
    if (!this.onlineStaffPresence || this.onlineStaffPresence.length === 0) return false;
    return this.onlineStaffPresence.some(p =>
      (p.assignedBranchId && p.assignedBranchId === branchId) ||
      (p.branch && (p.branch === branchName || branchName.toLowerCase().includes(p.branch.toLowerCase()) || p.branch.toLowerCase().includes(branchName.toLowerCase())))
    );
  }

  // ── Persistence ────────────────────────────────────────────────────────────

  private loadLocal() {
    if (typeof window === 'undefined') return;
    try {
      const sStaff = localStorage.getItem('krown_staff');
      if (sStaff) this.staff = JSON.parse(sStaff);
      const sOrders = localStorage.getItem('krown_orders');
      if (sOrders) this.orders = JSON.parse(sOrders);
      const sProds = localStorage.getItem('krown_products');
      if (sProds) this.products = JSON.parse(sProds);
      const sCats = localStorage.getItem('krown_categories');
      if (sCats) this.customCategories = JSON.parse(sCats);
      const sJobs = localStorage.getItem('krown_print_jobs');
      if (sJobs) this.printJobs = JSON.parse(sJobs);
      const sZones = localStorage.getItem('krown_zones');
      if (sZones) this.zones = JSON.parse(sZones);
      const sBranches = localStorage.getItem('krown_branches');
      if (sBranches) this.branches = JSON.parse(sBranches);
      const sCompanies = localStorage.getItem('krown_companies');
      if (sCompanies) this.companies = JSON.parse(sCompanies);
      const sExpenses = localStorage.getItem('krown_expenses');
      if (sExpenses) this.expenses = JSON.parse(sExpenses);
      const sAudit = localStorage.getItem('krown_audit');
      if (sAudit) this.auditLogs = JSON.parse(sAudit);
    } catch (e) {
      console.warn('[DataStore] loadLocal parse warning:', e);
    }
  }

  private persistLocal() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('krown_products', JSON.stringify(this.products));
      localStorage.setItem('krown_ingredients', JSON.stringify(this.ingredients));
      localStorage.setItem('krown_orders', JSON.stringify(this.orders));
      localStorage.setItem('krown_branches', JSON.stringify(this.branches));
      localStorage.setItem('krown_staff', JSON.stringify(this.staff));
      localStorage.setItem('krown_audit', JSON.stringify(this.auditLogs));
      localStorage.setItem('krown_companies', JSON.stringify(this.companies));
      localStorage.setItem('krown_cstaff', JSON.stringify(this.companyStaff));
      localStorage.setItem('krown_zones', JSON.stringify(this.zones));
      localStorage.setItem('krown_expenses', JSON.stringify(this.expenses));
      localStorage.setItem('krown_categories', JSON.stringify(this.customCategories));
      localStorage.setItem('krown_print_jobs', JSON.stringify(this.printJobs));
    } catch { /* ignore */ }
    this.notify();
  }

  // ── Observer ───────────────────────────────────────────────────────────────

  public subscribe(l: Listener) {
    this.listeners.add(l);
    return () => { this.listeners.delete(l); };
  }
  private notify() { this.listeners.forEach(cb => cb()); }

  // ── Fetch all data from API ────────────────────────────────────────────────

  private async fetchAll() {
    try {
      // Each call returns { data, ok } — ok=true means the API actually succeeded.
      // On failure (401, network, etc.) ok=false, so we keep cached in-memory data
      // instead of overwriting it with an empty array.
      const safe = async (p: Promise<any>): Promise<{ data: any; ok: boolean }> => {
        try {
          const res = await p;
          return { data: res?.data ?? res ?? [], ok: true };
        } catch {
          return { data: [], ok: false };
        }
      };

      const [
        productsRes, ingredientsRes, ordersRes, branchesRes, staffRes,
        companiesRes, zonesRes, auditRes, expensesRes, movementsRes, printJobsRes,
      ] = await Promise.all([
        safe(api.products.list()),
        safe(api.ingredients.list()),
        safe(api.orders.list(undefined, undefined, undefined, 500)),
        safe(api.branches.list()),
        safe(api.staff.list()),
        safe(api.companies.list()),
        safe(api.zones.list()),
        safe(api.audit.list()),
        safe(api.expenses.list()),
        safe(api.inventory.movements()),
        safe(api.printJobs.list()),
      ]);

      // Only overwrite in-memory data when the API actually succeeded with non-empty data.
      // This prevents failed API calls (401, network errors) from wiping out cached data.
      if (productsRes.ok && Array.isArray(productsRes.data)) this.products = productsRes.data.map(fromDbProduct);
      if (ingredientsRes.ok && Array.isArray(ingredientsRes.data)) this.ingredients = ingredientsRes.data.map(fromDbIngredient);
      if (movementsRes.ok && Array.isArray(movementsRes.data)) this.inventoryMovements = movementsRes.data.map(fromDbMovement);
      if (ordersRes.ok && Array.isArray(ordersRes.data)) {
        const dbOrders = ordersRes.data.map(fromDbOrder);
        const dbOrderIds = new Set(dbOrders.map(o => o.id));
        const localOnlyOrders = this.orders.filter(o => !dbOrderIds.has(o.id));
        this.orders = [...localOnlyOrders, ...dbOrders];
      }
      if (branchesRes.ok && Array.isArray(branchesRes.data)) this.branches = branchesRes.data.map(fromDbBranch);
      if (staffRes.ok && Array.isArray(staffRes.data) && staffRes.data.length > 0) {
        const dbStaffList = staffRes.data.map(fromDbStaff);
        const map = new Map<string, StaffMember>();
        this.staff.forEach(s => map.set(s.id, s));
        dbStaffList.forEach(s => map.set(s.id, s));
        this.staff = Array.from(map.values());
      }
      if (companiesRes.ok && Array.isArray(companiesRes.data)) this.companies = companiesRes.data.map(fromDbCompany);

      // Load company staff for each company (nested resource)
      if (companiesRes.ok && Array.isArray(companiesRes.data) && companiesRes.data.length > 0) {
        const staffResults = await Promise.all(
          companiesRes.data.map((c: any) =>
            safe(api.companies.listStaff(c.id))
          )
        );
        const allCompanyStaff = staffResults.filter(r => r.ok).flatMap((r: any) => r.data ?? []);
        if (Array.isArray(allCompanyStaff) && allCompanyStaff.length > 0) {
          this.companyStaff = allCompanyStaff.map(fromDbCompanyStaff);
        }
      }

      // Load product ingredients (recipes) — fetch from /api/db/product_ingredients via legacy read route
      try {
        const piRes = await fetch('/api/db/product_ingredients', {
          headers: {
            'Authorization': `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('krown_session_token') || '' : ''}`,
          },
        });
        if (piRes.ok) {
          const piData = await piRes.json();
          const prodIngs = piData?.data ?? [];
          if (Array.isArray(prodIngs) && prodIngs.length > 0) {
            this.productIngredients = prodIngs.map((r: any) => ({
              id: r.id, productId: r.product_id, ingredientId: r.ingredient_id,
              quantityPerUnit: Number(r.quantity_per_unit) || 1,
              branchId: r.branch_id, createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
            }));
          }
        }
      } catch { /* product ingredients are non-critical */ }
      if (zonesRes.ok && Array.isArray(zonesRes.data)) this.zones = zonesRes.data.map(fromDbZone);
      if (auditRes.ok && Array.isArray(auditRes.data)) this.auditLogs = auditRes.data.map(fromDbAuditLog);
      if (expensesRes.ok && Array.isArray(expensesRes.data)) this.expenses = expensesRes.data.map(fromDbExpense);
      if (printJobsRes.ok && Array.isArray(printJobsRes.data)) this.printJobs = printJobsRes.data.map(fromDbPrintJob);

      this.persistLocal();
    } catch (e) {
      console.warn('[DataStore] fetchAll error:', e);
    }
  }

  // ── Scoped Getters ─────────────────────────────────────────────────────────

  public getProducts(branchId?: string): Product[] {
    if (branchId && branchId !== 'all') {
      const b = this.branches.find(x => x.id === branchId || x.name.toLowerCase() === branchId.toLowerCase());
      const targetId = b ? b.id : branchId;
      const bName = b ? b.name.toLowerCase() : branchId.toLowerCase();
      const filtered = this.products.filter(p =>
        p.branchId === targetId ||
        (p.branchName && p.branchName.toLowerCase() === bName) ||
        (bName.includes('mirabal') && (p.branchName?.toLowerCase().includes('mirabal') || p.branchId === 'branch-mirabal'))
      );
      if (filtered.length === 0 && bName.includes('mirabal')) {
        return this.products.filter(p => p.branchId === 'branch-mirabal' || p.branchName?.toLowerCase() === 'mirabal');
      }
      return filtered;
    }
    return this.products;
  }

  public getIngredients(branchId?: string): Ingredient[] {
    if (branchId && branchId !== 'all') return this.ingredients.filter(i => i.branchId === branchId);
    return this.ingredients;
  }

  public getInventoryMovements(branchId?: string): InventoryMovement[] {
    if (branchId && branchId !== 'all') return this.inventoryMovements.filter(m => m.branchId === branchId);
    return this.inventoryMovements;
  }

  public getOrders(branchId?: string, startDate?: number, endDate?: number): Order[] {
    let res = this.orders;
    if (branchId && branchId !== 'all') {
      res = res.filter(o => o.restaurantId === branchId);
    }
    if (startDate) res = res.filter(o => o.createdAt >= startDate);
    if (endDate) res = res.filter(o => o.createdAt <= endDate);
    return res;
  }

  public getBranches(): Branch[] { return this.branches; }

  public getStaff(branchId?: string): StaffMember[] {
    if (branchId && branchId !== 'all') {
      const b = this.branches.find(x => x.id === branchId);
      return this.staff.filter(s => s.assignedBranchId === branchId || s.branch === branchId || (b && s.branch === b.name));
    }
    return this.staff;
  }

  public getAuditLogs(branchId?: string): AuditLog[] {
    if (branchId && branchId !== 'all') {
      const branchObj = this.branches.find(b => b.id === branchId || b.name.toLowerCase() === branchId.toLowerCase());
      const bName = branchObj ? branchObj.name.toLowerCase() : branchId.toLowerCase();
      return this.auditLogs.filter(l =>
        l.branchId === branchId ||
        (l.branchName && l.branchName.toLowerCase() === bName) ||
        (l.details && (l.details.branchId === branchId || (l.details.branch && String(l.details.branch).toLowerCase() === bName)))
      );
    }
    return this.auditLogs;
  }

  public getCompanies(branchId?: string): CompanyProfile[] {
    if (branchId && branchId !== 'all') return this.companies.filter(c => c.branchId === branchId);
    return this.companies;
  }

  public getCompanyStaff(companyId?: string): CompanyStaff[] {
    if (companyId) return this.companyStaff.filter(s => s.companyId === companyId);
    return this.companyStaff;
  }

  public getZones(branchId?: string): PlaceZone[] {
    if (branchId && branchId !== 'all') return this.zones.filter(z => z.branchId === branchId);
    return this.zones;
  }

  public getExpenses(branchId?: string, startDate?: number, endDate?: number): Expense[] {
    let res = this.expenses;
    if (branchId && branchId !== 'all') res = res.filter(e => e.branchId === branchId);
    if (startDate) res = res.filter(e => e.createdAt >= startDate);
    if (endDate) res = res.filter(e => e.createdAt <= endDate);
    return res;
  }

  public getPrintJobs(orderId?: string): PrintJob[] {
    if (orderId) return this.printJobs.filter(pj => pj.orderId === orderId);
    return this.printJobs;
  }

  public getCustomCategories(): string[] { return this.customCategories; }

  public getProductIngredients(productId?: string): ProductIngredient[] {
    if (productId) return this.productIngredients.filter(pi => pi.productId === productId);
    return this.productIngredients;
  }

  // ── Search ─────────────────────────────────────────────────────────────────

  public globalSearch(query: string, branchId?: string) {
    const q = query.trim().toLowerCase();
    if (!q) return { products: [], ingredients: [], staff: [], companies: [], orders: [], branches: [] };
    return {
      products: this.getProducts(branchId).filter(p => p.name.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q)),
      ingredients: this.getIngredients(branchId).filter(i => i.name.toLowerCase().includes(q) || (i.category || '').toLowerCase().includes(q) || (i.supplier || '').toLowerCase().includes(q)),
      staff: this.getStaff(branchId).filter(s => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q) || s.role.toLowerCase().includes(q) || (s.branch || '').toLowerCase().includes(q)),
      companies: this.getCompanies().filter(c => c.name.toLowerCase().includes(q) || c.taxId.toLowerCase().includes(q) || c.contactPerson.toLowerCase().includes(q)),
      orders: this.getOrders(branchId).filter(o => o.id.toLowerCase().includes(q) || o.table.toLowerCase().includes(q) || (o.companyName || '').toLowerCase().includes(q) || (o.tinNumber || '').toLowerCase().includes(q)),
      branches: this.branches.filter(b => b.name.toLowerCase().includes(q) || b.location.toLowerCase().includes(q) || (b.city || '').toLowerCase().includes(q)),
    };
  }

  // ── Table Occupancy ────────────────────────────────────────────────────────

  public getTableOccupancy(tableNumber: string): TableOccupancy {
    const stored = this.zones.flatMap(z => z.tables || []).find(t => t.tableNumber === tableNumber);
    if (stored?.status === 'reserved') return { status: 'reserved', wholeTableOpen: false, openSeats: [] };
    const open = this.orders.filter(o =>
      o.table === tableNumber && o.paymentStatus !== 'paid' && o.status !== 'cancelled' && o.status !== 'completed'
    );
    const wholeTableOpen = open.some(o => (o.seat || '') === 'Whole Table' || (o.seat || '') === '');
    const openSeats = open.filter(o => (o.seat || '') !== 'Whole Table' && (o.seat || '') !== '').map(o => o.seat as string);
    return { status: (wholeTableOpen || openSeats.length > 0) ? 'occupied' : 'available', wholeTableOpen, openSeats };
  }

  public updateTableOccupancy(tableNumber: string, status: 'available' | 'occupied' | 'reserved') {
    this.zones = this.zones.map(z => {
      const hasTable = (z.tables || []).some(t => t.tableNumber === tableNumber);
      if (hasTable) {
        const updatedTables = (z.tables || []).map(t =>
          t.tableNumber === tableNumber ? { ...t, status } : t
        );
        const updatedZone = { ...z, tables: updatedTables };
        safeWrite('zones', 'upsert', toDbZone(updatedZone));
        return updatedZone;
      }
      return z;
    });
    this.persistLocal();
  }

  public getOpenOrderByTable(tableNumber: string, seat?: string): Order | null {
    const seatScope = seat && seat !== 'Whole Table' ? seat : '';
    return this.orders.find(o => {
      if (!o || o.table !== tableNumber) return false;
      if (o.paymentStatus === 'paid' || o.status === 'cancelled' || o.status === 'completed') return false;
      const oSeat = o.seat || '';
      if (seatScope) {
        if (oSeat === 'Whole Table' || oSeat === '') return false;
        return oSeat === seatScope;
      }
      return oSeat === 'Whole Table' || oSeat === '';
    }) || null;
  }

  public getOpenOrderById(orderId: string): Order | null {
    return this.orders.find(o =>
      (o.id === orderId || o.id.includes(orderId)) &&
      o.paymentStatus !== 'paid' && o.status !== 'cancelled' && o.status !== 'completed'
    ) || null;
  }

  // ── Payment Breakdown ──────────────────────────────────────────────────────

  public getPaymentBreakdown(orders: Order[]): Record<string, { total: number; count: number; percentage: number }> {
    const breakdown: Record<string, { total: number; count: number; percentage: number }> = {
      'Cash': { total: 0, count: 0, percentage: 0 },
      'MTN Mobile Money': { total: 0, count: 0, percentage: 0 },
      'Airtel Money': { total: 0, count: 0, percentage: 0 },
      'Credit Card': { total: 0, count: 0, percentage: 0 },
      'Bank Transfer': { total: 0, count: 0, percentage: 0 },
      'Corporate Credit': { total: 0, count: 0, percentage: 0 },
    };
    let totalPaidSum = 0;
    const paidOrders = orders.filter(o => o.paymentStatus === 'paid' || o.status === 'completed' || o.paymentStatus === 'partially_paid');
    paidOrders.forEach(o => {
      if (o.splitPayments && o.splitPayments.length > 0) {
        o.splitPayments.forEach((sp: any) => {
          const pm = sp.paymentMethod || 'Cash';
          if (!breakdown[pm]) breakdown[pm] = { total: 0, count: 0, percentage: 0 };
          breakdown[pm].total += (sp.amount || 0);
          breakdown[pm].count += 1;
          totalPaidSum += (sp.amount || 0);
        });
      } else {
        const pm = o.paymentMethod || 'Cash';
        if (!breakdown[pm]) breakdown[pm] = { total: 0, count: 0, percentage: 0 };
        const amt = o.paidAmount || o.total || 0;
        breakdown[pm].total += amt;
        breakdown[pm].count += 1;
        totalPaidSum += amt;
      }
    });
    if (totalPaidSum > 0) {
      Object.keys(breakdown).forEach(k => {
        breakdown[k].percentage = Math.round((breakdown[k].total / totalPaidSum) * 100);
      });
    }
    return breakdown;
  }

  // ── Company Staff Spending (read-only derived) ─────────────────────────────

  public getCompanyStaffSpending(companyId: string): Array<{ staffId: string; staffName: string; workId?: string; totalSpent: number; orders: Order[] }> {
    const staffList = this.companyStaff.filter(s => s.companyId === companyId);
    const companyOrders = this.orders.filter(o => o.companyId === companyId && (o.paymentStatus === 'paid' || o.status === 'completed'));
    return staffList.map(s => {
      const staffOrders = companyOrders.filter(o => o.companyStaffId === s.id);
      return { staffId: s.id, staffName: s.name, workId: s.workId, totalSpent: staffOrders.reduce((sum, o) => sum + (o.total || 0), 0), orders: staffOrders };
    });
  }

  public isCompanyStaffAllowed(staffId: string): boolean {
    const s = this.companyStaff.find(cs => cs.id === staffId);
    if (!s) return false;
    if (s.status === 'banned' || s.status === 'inactive') return false;
    const company = this.companies.find(c => c.id === s.companyId);
    if (!company || company.status === 'suspended' || company.status === 'closed') return false;
    return true;
  }

  // ── Write Methods (delegate to API) ────────────────────────────────────────

  public async createOrder(orderData: {
    table: string; place?: string; seat?: string;
    type: 'Dine In' | 'Takeaway' | 'Delivery';
    items: any[]; subtotal: number; tax: number; total: number;
    paymentMethod: Order['paymentMethod'];
    isCorporateCredit?: boolean; companyId?: string; companyName?: string;
    companyStaffId?: string; companyStaffName?: string; workId?: string;
    restaurantId?: string; branchName?: string; userId?: string;
    tinNumber?: string; notes?: string;
  }): Promise<Order> {
    const orderId = crypto.randomUUID();
    const branchObj = this.branches.find(b => b.id === orderData.restaurantId);
    const newOrder: Order = {
      id: orderId,
      table: orderData.table,
      place: orderData.place || 'Main Dining Hall',
      seat: orderData.seat || 'Whole Table',
      type: orderData.type,
      status: 'pending',
      items: orderData.items,
      subtotal: orderData.subtotal,
      tax: orderData.tax,
      total: orderData.total,
      paymentMethod: orderData.paymentMethod,
      isCorporateCredit: orderData.paymentMethod === 'Corporate Credit' || orderData.isCorporateCredit,
      companyId: orderData.companyId,
      companyName: orderData.companyName,
      companyStaffId: orderData.companyStaffId,
      companyStaffName: orderData.companyStaffName,
      workId: orderData.workId,
      prepEstimatedMinutes: 15,
      prepStartedAt: Date.now(),
      restaurantId: orderData.restaurantId || this.branches[0]?.id || '',
      branchName: orderData.branchName || branchObj?.name || this.branches[0]?.name || '',
      userId: orderData.userId || 'demo-user',
      createdAt: Date.now(),
      tinNumber: orderData.tinNumber,
      notes: orderData.notes,
    };

    // Optimistic insert for instant UI feedback
    this.orders = [newOrder, ...this.orders];
    if (newOrder.type === 'Dine In' && newOrder.table) {
      this.updateTableOccupancy(newOrder.table, 'occupied');
    }
    this.persistLocal();

    try {
      const res = await api.orders.create({
        id: orderId,
        branchId: orderData.restaurantId || this.branches[0]?.id,
        table: orderData.table,
        seat: orderData.seat,
        type: orderData.type,
        place: orderData.place,
        items: orderData.items.map((item: any) => ({
          productId: item.id || item.productId,
          quantity: item.quantity || 1,
          notes: item.note || item.notes,
          addOns: item.addOns,
        })),
        staffId: orderData.userId,
        companyId: orderData.companyId,
        companyName: orderData.companyName,
        tin: orderData.tinNumber,
      });
      const serverOrder = res.data ?? res;
      if (serverOrder?.id) {
        this.orders = this.orders.map(o => o.id === orderId ? fromDbOrder(serverOrder) : o);
        this.persistLocal();
      }
    } catch (e) {
      console.warn('[DataStore] createOrder API error:', e);
      // Remove the optimistic order since it failed to persist
      this.orders = this.orders.filter(o => o.id !== orderId);
      if (newOrder.type === 'Dine In' && newOrder.table) {
        this.updateTableOccupancy(newOrder.table, 'available');
      }
      this.persistLocal();
    }

    return newOrder;
  }

  public async placeOrder(orderData: any): Promise<Order> {
    return this.createOrder(orderData);
  }

  public async addItemsToOrder(orderId: string, newItems: any[]): Promise<Order | null> {
    let targetOrder: Order | null = null;
    this.orders = this.orders.map(o => {
      if (o.id === orderId) {
        const mergedItems = [...o.items];
        newItems.forEach((newItem: any) => {
          const existing = mergedItems.find(i => i.id === newItem.id || i.name === newItem.name);
          if (existing) {
            existing.quantity = (existing.quantity || 1) + (newItem.quantity || 1);
          } else {
            mergedItems.push({ ...newItem });
          }
        });
        const grandTotal = mergedItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        const updated: Order = { ...o, items: mergedItems, subtotal: grandTotal, tax: 0, total: grandTotal };
        targetOrder = updated;
        if (updated.type === 'Dine In' && updated.table) {
          this.updateTableOccupancy(updated.table, 'occupied');
        }
        return updated;
      }
      return o;
    });
    this.persistLocal();
    if (targetOrder) {
      try {
        await api.orders.addItems(orderId, newItems);
      } catch (e) {
        console.warn('[DataStore] addItems API error:', e);
      }
    }
    return targetOrder;
  }

  public async updateOrderStatus(orderId: string, newStatus: Order['status']) {
    this.orders = this.orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o);
    this.persistLocal();
    try {
      await api.orders.updateStatus(orderId, newStatus);
    } catch (e) {
      console.warn('[DataStore] updateStatus API error:', e);
    }
  }

  public async payOrder(orderId: string, paymentData: {
    paymentMethod: Order['paymentMethod'];
    isCorporateCredit?: boolean; companyId?: string; companyName?: string;
    companyStaffId?: string; companyStaffName?: string; workId?: string;
    tinNumber?: string; amountReceived?: number; change?: number;
  }): Promise<Order | null> {
    let targetOrder: Order | null = null;
    this.orders = this.orders.map(o => {
      if (o.id === orderId) {
        const updated: Order = {
          ...o,
          paymentMethod: paymentData.paymentMethod,
          isCorporateCredit: paymentData.isCorporateCredit ?? (paymentData.paymentMethod === 'Corporate Credit'),
          companyId: paymentData.companyId ?? o.companyId,
          companyName: paymentData.companyName ?? o.companyName,
          companyStaffId: paymentData.companyStaffId ?? o.companyStaffId,
          companyStaffName: paymentData.companyStaffName ?? o.companyStaffName,
          workId: paymentData.workId ?? o.workId,
          tinNumber: paymentData.tinNumber ?? o.tinNumber,
          amountReceived: paymentData.amountReceived ?? o.amountReceived,
          change: paymentData.change ?? o.change,
          paymentStatus: 'paid',
          paidAmount: o.total,
          status: 'completed',
        };
        targetOrder = updated;

        if (updated.table) {
          const hasRemainingUnpaid = this.orders.some(other =>
            other.id !== updated.id && other.table === updated.table &&
            other.paymentStatus !== 'paid' && other.status !== 'completed' && other.status !== 'cancelled'
          );
          if (!hasRemainingUnpaid) this.updateTableOccupancy(updated.table, 'available');
        }

        return updated;
      }
      return o;
    });
    this.persistLocal();
    if (targetOrder) {
      try {
        await api.orders.pay(orderId, paymentData);
      } catch (e) {
        console.warn('[DataStore] pay API error:', e);
      }
    }
    return targetOrder;
  }

  public async addSplitPayment(orderId: string, split: {
    amount: number; paymentMethod: Order['paymentMethod'];
    splitIndex: number; totalSplits: number; seatCovered?: string;
    itemsCovered?: string[]; guestLabel?: string;
    guestItems?: { id?: string; name: string; price: number; quantity: number; amount: number }[];
  }): Promise<Order | null> {
    let targetOrder: Order | null = null;
    this.orders = this.orders.map(o => {
      if (o.id === orderId) {
        const newSplit: any = {
          id: crypto.randomUUID(), amount: split.amount,
          paymentMethod: split.paymentMethod, paidAt: Date.now(),
          splitIndex: split.splitIndex, totalSplits: split.totalSplits,
          seatCovered: split.seatCovered, itemsCovered: split.itemsCovered,
          guestLabel: split.guestLabel, guestItems: split.guestItems,
        };
        const updatedSplits = [...(o.splitPayments || []), newSplit];
        const newPaidAmount = (o.paidAmount || 0) + split.amount;
        const isFullyPaid = newPaidAmount >= o.total - 1;
        const updated: Order = {
          ...o, splitPayments: updatedSplits, paidAmount: newPaidAmount,
          paymentStatus: isFullyPaid ? 'paid' : 'partially_paid',
          paymentMethod: split.paymentMethod,
        };
        targetOrder = updated;
        return updated;
      }
      return o;
    });
    this.persistLocal();
    if (targetOrder) {
      try {
        const splits = (targetOrder as any).splitPayments || [];
        await api.orders.splitPay(orderId, splits);
      } catch (e) {
        console.warn('[DataStore] splitPay API error:', e);
      }
    }
    return targetOrder;
  }

  public async updateOrderCustomerTin(orderId: string, tin: string): Promise<Order | null> {
    let targetOrder: Order | null = null;
    this.orders = this.orders.map(o => {
      if (o.id === orderId) {
        const updated = { ...o, tinNumber: tin };
        targetOrder = updated;
        return updated;
      }
      return o;
    });
    this.persistLocal();
    if (targetOrder) {
      try {
        await api.orders.updateTin(orderId, tin);
      } catch (e) {
        console.warn('[DataStore] updateTin API error:', e);
      }
    }
    return targetOrder;
  }

  // ── Products ───────────────────────────────────────────────────────────────

  public addProduct(data: {
    name: string; price: number; category: any; image: string;
    available?: boolean; requiresKitchen?: boolean; description?: string;
    branchId?: string; branchName?: string;
    deductFromInventory?: boolean; inventoryDeductAmount?: number;
    addOns?: ProductAddOn[];
  }): Product {
    const p: Product = {
      id: crypto.randomUUID(),
      name: data.name, price: Number(data.price),
      category: data.category || 'mains',
      image: data.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80',
      available: data.available ?? true,
      requiresKitchen: data.requiresKitchen ?? true,
      description: data.description,
      branchId: data.branchId, branchName: data.branchName,
      deductFromInventory: data.deductFromInventory ?? false,
      inventoryDeductAmount: data.inventoryDeductAmount ?? 1,
      addOns: data.addOns ?? [],
    };
    this.products = [p, ...this.products];
    this.persistLocal();
    api.products.create(data).catch(e => console.warn('[DataStore] addProduct API error:', e));
    return p;
  }

  public updateProduct(id: string, updates: Partial<Product>) {
    this.products = this.products.map(p => p.id === id ? { ...p, ...updates } : p);
    this.persistLocal();
    api.products.update(id, updates).catch(e => console.warn('[DataStore] updateProduct API error:', e));
  }

  public toggleProductAvailability(id: string) {
    this.products = this.products.map(p => p.id === id ? { ...p, available: !p.available } : p);
    this.persistLocal();
    api.products.toggle(id).catch(e => console.warn('[DataStore] toggleProduct API error:', e));
  }

  // ── Ingredients ────────────────────────────────────────────────────────────

  public addIngredient(data: {
    name: string; quantity: number; unit: string;
    category?: string; minThreshold?: number; costPerUnitUGX?: number; supplier?: string;
    branchId?: string; branchName?: string;
    deductFromSales?: boolean; linkedProductId?: string; deductAmountPerSale?: number;
  }): Ingredient {
    const ing: Ingredient = {
      id: crypto.randomUUID(),
      name: data.name, quantity: Number(data.quantity),
      unit: data.unit || 'Units', minThreshold: data.minThreshold || 5,
      category: data.category || 'Pantry',
      costPerUnitUGX: data.costPerUnitUGX || 15000,
      supplier: data.supplier || 'Local Supplier',
      branchId: data.branchId, branchName: data.branchName,
      deductFromSales: data.deductFromSales ?? false,
      linkedProductId: data.linkedProductId,
      deductAmountPerSale: data.deductAmountPerSale ?? 1,
    };
    this.ingredients = [ing, ...this.ingredients];
    this.persistLocal();
    api.ingredients.create(data).catch(e => console.warn('[DataStore] addIngredient API error:', e));
    return ing;
  }

  public updateIngredient(id: string, updates: Partial<Ingredient>) {
    this.ingredients = this.ingredients.map(ing => ing.id === id ? { ...ing, ...updates } : ing);
    this.persistLocal();
    api.ingredients.update(id, updates).catch(e => console.warn('[DataStore] updateIngredient API error:', e));
  }

  public updateIngredientQuantity(id: string, newQuantity: number) {
    this.ingredients = this.ingredients.map(ing => ing.id === id ? { ...ing, quantity: Math.max(0, newQuantity) } : ing);
    this.persistLocal();
    api.ingredients.updateQuantity(id, newQuantity).catch(e => console.warn('[DataStore] updateIngredientQty API error:', e));
  }

  public deleteIngredient(id: string) {
    this.ingredients = this.ingredients.filter(ing => ing.id !== id);
    this.persistLocal();
    api.ingredients.delete(id).catch(e => console.warn('[DataStore] deleteIngredient API error:', e));
  }

  // ── Staff ──────────────────────────────────────────────────────────────────

  public addStaff(s: StaffMember) {
    this.staff = [s, ...this.staff.filter(x => x.id !== s.id)];
    this.persistLocal();
    api.staff.create(s).catch(e => console.warn('[DataStore] addStaff API error:', e));
  }

  public addStaffMember(data: {
    name: string; email: string; phone?: string;
    idType?: 'National ID' | 'Passport' | 'Student ID'; idNumber?: string;
    role: StaffMember['role']; branch: string; assignedBranchId?: string; avatar?: string;
  }): StaffMember {
    const s: StaffMember = {
      id: crypto.randomUUID(),
      name: data.name, email: data.email,
      phone: data.phone, idType: data.idType, idNumber: data.idNumber,
      role: data.role, branch: data.branch, assignedBranchId: data.assignedBranchId || undefined,
      status: 'active',
      avatar: data.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    };
    this.staff = [s, ...this.staff];
    this.persistLocal();
    api.staff.create(data).catch(e => console.warn('[DataStore] addStaffMember API error:', e));
    return s;
  }

  public updateStaffRole(id: string, role: StaffMember['role'], branchId?: string) {
    let targetStaff: StaffMember | null = null;
    this.staff = this.staff.map(s => {
      if (s.id === id) {
        const updated = { ...s, role, assignedBranchId: branchId ?? s.assignedBranchId };
        targetStaff = updated;
        api.staff.updateRole(id, role).catch(e => console.warn('[DataStore] updateStaffRole API error:', e));
        return updated;
      }
      return s;
    });
    this.persistLocal();
    return targetStaff;
  }

  public deleteStaff(id: string) {
    this.staff = this.staff.filter(s => s.id !== id);
    this.persistLocal();
    api.staff.delete(id).catch(e => console.warn('[DataStore] deleteStaff API error:', e));
  }

  public updateStaffStatus(id: string, status: StaffMember['status']) {
    let targetStaff: StaffMember | null = null;
    this.staff = this.staff.map(s => {
      if (s.id === id) {
        const updated = { ...s, status };
        targetStaff = updated;
        api.staff.updateStatus(id, status).catch(e => console.warn('[DataStore] updateStaffStatus API error:', e));
        return updated;
      }
      return s;
    });
    this.persistLocal();
    return targetStaff;
  }

  public deleteStaffMember(id: string) {
    this.deleteStaff(id);
  }

  public resetStaffPassword(id: string) {
    // Server-side operation only
  }

  public assignSuperAdminRole(id: string) {
    this.staff = this.staff.map(s => {
      if (s.id === id) {
        const updated = { ...s, role: 'Super Admin' as const, assignedBranchId: 'all', branch: 'Global HQ' };
        api.staff.updateRole(id, 'Super Admin').catch(e => console.warn('[DataStore] assignSuperAdmin API error:', e));
        return updated;
      }
      return s;
    });
    this.persistLocal();
  }

  public syncStaffFromDB(freshStaff: StaffMember[]) {
    const map = new Map<string, StaffMember>();
    this.staff.forEach(s => map.set(s.id, s));
    freshStaff.forEach(s => map.set(s.id, s));
    this.staff = Array.from(map.values());
    this.persistLocal();
    this.notify();
  }

  // ── Companies ──────────────────────────────────────────────────────────────

  public addCompany(data: { name: string; taxId: string; creditLimitUGX: number; contactPerson: string; phone: string; branchId?: string; branchName?: string; }): CompanyProfile {
    const c: CompanyProfile = {
      id: crypto.randomUUID(),
      name: data.name, taxId: data.taxId || 'URA-000000',
      creditLimitUGX: Number(data.creditLimitUGX) || 10000000,
      currentBalanceUGX: 0, contactPerson: data.contactPerson || 'N/A',
      phone: data.phone || '+256 700 000 000', status: 'active', createdAt: Date.now(),
      branchId: data.branchId, branchName: data.branchName,
    };
    this.companies = [c, ...this.companies];
    this.persistLocal();
    api.companies.create(data).catch(e => console.warn('[DataStore] addCompany API error:', e));
    return c;
  }

  public toggleCompanyStatus(id: string, newStatus: 'active' | 'suspended' | 'closed') {
    this.companies = this.companies.map(c => c.id === id ? { ...c, status: newStatus } : c);
    this.persistLocal();
    api.companies.updateStatus(id, newStatus).catch(e => console.warn('[DataStore] toggleCompanyStatus API error:', e));
  }

  public updateCompanyStatus(id: string, newStatus: 'active' | 'suspended' | 'closed') {
    this.toggleCompanyStatus(id, newStatus);
  }

  public settleCompanyBalance(companyId: string, amountPaid: number, paymentMethod: any, notes?: string): CompanyProfile | null {
    let updatedComp: CompanyProfile | null = null;
    this.companies = this.companies.map(c => {
      if (c.id === companyId) {
        const newBalance = Math.max(0, c.currentBalanceUGX - amountPaid);
        const updated = { ...c, currentBalanceUGX: newBalance };
        updatedComp = updated;
        api.companies.settle(companyId, { amountPaid, paymentMethod, notes }).catch(e => console.warn('[DataStore] settleBalance API error:', e));
        return updated;
      }
      return c;
    });
    this.persistLocal();
    return updatedComp;
  }

  // ── Company Staff ──────────────────────────────────────────────────────────

  public addCompanyStaff(data: { companyId: string; name: string; workId?: string; email?: string; department?: string; creditLimitUGX?: number; }): CompanyStaff {
    const s: CompanyStaff = {
      id: crypto.randomUUID(),
      companyId: data.companyId, name: data.name,
      workId: data.workId || `ID-${Math.floor(1000 + Math.random() * 9000)}`,
      email: data.email || '', department: data.department || 'General Staff',
      creditLimitUGX: data.creditLimitUGX || 500000, status: 'active',
    };
    this.companyStaff = [s, ...this.companyStaff];
    this.persistLocal();
    api.companies.addStaff(data.companyId, data).catch(e => console.warn('[DataStore] addCompanyStaff API error:', e));
    return s;
  }

  public updateCompanyStaffStatus(id: string, newStatus: 'active' | 'inactive' | 'banned') {
    this.companyStaff = this.companyStaff.map(s => s.id === id ? { ...s, status: newStatus } : s);
    this.persistLocal();
    safeWrite('company_staff', 'update', { id, status: newStatus });
  }

  public deleteCompanyStaff(id: string) {
    this.companyStaff = this.companyStaff.filter(s => s.id !== id);
    this.persistLocal();
    safeWrite('company_staff', 'delete', { id });
  }

  // ── Branches ───────────────────────────────────────────────────────────────

  public addBranch(data: {
    name: string; location: string; city?: string; manager: string; phone: string;
    email?: string; taxId?: string; address?: string; receiptHeaderNote?: string; receiptFooterNote?: string;
    tablesCount?: number;
  }): Branch {
    const b: Branch = {
      id: crypto.randomUUID(),
      name: data.name, location: data.location,
      city: data.city || 'Kampala', manager: data.manager || 'Branch Manager',
      phone: data.phone || '+256 700 000 000', email: data.email || 'info@krownpos.com',
      taxId: data.taxId || 'URA-100293481', address: data.address || data.location,
      receiptHeaderNote: data.receiptHeaderNote || `Welcome to ${data.name}`,
      receiptFooterNote: data.receiptFooterNote || 'Thank you for dining with us! Powered by Krown Enterprise POS',
      tablesCount: data.tablesCount || 20, dailyRevenueUGX: 0, ordersToday: 0,
      status: 'online',
    };
    this.branches = [...this.branches, b];
    this.persistLocal();
    api.branches.create(data).catch(e => console.warn('[DataStore] addBranch API error:', e));
    return b;
  }

  public updateBranchStatus(id: string, newStatus: Branch['status']) {
    this.branches = this.branches.map(b => b.id === id ? { ...b, status: newStatus } : b);
    this.persistLocal();
    api.branches.updateStatus(id, newStatus).catch(e => console.warn('[DataStore] updateBranchStatus API error:', e));
  }

  public deleteBranch(id: string) {
    this.branches = this.branches.filter(b => b.id !== id);
    this.persistLocal();
    api.branches.delete(id).catch(e => console.warn('[DataStore] deleteBranch API error:', e));
  }

  public clearBranchSales(branchId: string, branchName?: string) {
    const bName = branchName?.toLowerCase() || 'mirabal';
    this.orders = this.orders.filter(o => o.branchId !== branchId && o.branchName?.toLowerCase() !== bName);
    this.printJobs = this.printJobs.filter(pj => pj.branchName?.toLowerCase() !== bName);
    this.branches = this.branches.map(b => {
      if (b.id === branchId || b.name.toLowerCase() === bName) {
        return { ...b, dailyRevenueUGX: 0, ordersToday: 0 };
      }
      return b;
    });
    this.persistLocal();
    safeWrite('orders', 'delete', { where: { branch_id: branchId } });
    safeWrite('print_jobs', 'delete', { where: { branch_id: branchId } });
  }

  // ── Zones ──────────────────────────────────────────────────────────────────

  public addPlaceZone(data: { name: string; icon: string; description: string; branchId?: string; branchName?: string; tables: { tableNumber: string; seatsCount: number }[]; }): PlaceZone {
    const z: PlaceZone = {
      id: crypto.randomUUID(),
      name: data.name, icon: data.icon || '📍',
      description: data.description || 'Seating area',
      branchId: data.branchId, branchName: data.branchName,
      tables: data.tables || [],
    };
    this.zones = [...this.zones, z];
    this.persistLocal();
    api.zones.create(data).catch(e => console.warn('[DataStore] addPlaceZone API error:', e));
    return z;
  }

  public updatePlaceZone(updatedZone: PlaceZone) {
    this.zones = this.zones.map(z => z.id === updatedZone.id ? updatedZone : z);
    this.persistLocal();
    api.zones.update(updatedZone.id, updatedZone).catch(e => console.warn('[DataStore] updatePlaceZone API error:', e));
  }

  public deletePlaceZone(id: string) {
    this.zones = this.zones.filter(z => z.id !== id);
    this.persistLocal();
    api.zones.delete(id).catch(e => console.warn('[DataStore] deletePlaceZone API error:', e));
  }

  public addTableToZone(zoneId: string, tableNumber: string, seatsCount: number = 4, shape: 'round' | 'rectangle' = 'round') {
    this.zones = this.zones.map(z => {
      if (z.id === zoneId) {
        const existing = z.tables || [];
        if (existing.some(t => t.tableNumber.toUpperCase() === tableNumber.toUpperCase())) return z;
        const updatedZone = { ...z, tables: [...existing, { tableNumber, seatsCount, shape }] };
        api.zones.addTable(zoneId, { tableNumber, seatsCount, shape }).catch(e => console.warn('[DataStore] addTableToZone API error:', e));
        return updatedZone;
      }
      return z;
    });
    this.persistLocal();
  }

  public addSeatToTable(zoneId: string, tableNumber: string) {
    this.zones = this.zones.map(z => {
      if (z.id === zoneId) {
        const updatedTables = (z.tables || []).map(t =>
          t.tableNumber === tableNumber ? { ...t, seatsCount: Math.min(24, t.seatsCount + 1) } : t
        );
        const updatedZone = { ...z, tables: updatedTables };
        api.zones.updateTable(zoneId, tableNumber, { seatsCount: (updatedTables.find(t => t.tableNumber === tableNumber)?.seatsCount ?? 4) }).catch(e => console.warn('[DataStore] addSeat API error:', e));
        return updatedZone;
      }
      return z;
    });
    this.persistLocal();
  }

  public removeSeatFromTable(zoneId: string, tableNumber: string) {
    this.zones = this.zones.map(z => {
      if (z.id === zoneId) {
        const updatedTables = (z.tables || []).map(t =>
          t.tableNumber === tableNumber ? { ...t, seatsCount: Math.max(1, t.seatsCount - 1) } : t
        );
        const updatedZone = { ...z, tables: updatedTables };
        api.zones.updateTable(zoneId, tableNumber, { seatsCount: (updatedTables.find(t => t.tableNumber === tableNumber)?.seatsCount ?? 1) }).catch(e => console.warn('[DataStore] removeSeat API error:', e));
        return updatedZone;
      }
      return z;
    });
    this.persistLocal();
  }

  public deleteTableFromZone(zoneId: string, tableNumber: string) {
    this.zones = this.zones.map(z => {
      if (z.id === zoneId) {
        const updatedZone = { ...z, tables: (z.tables || []).filter(t => t.tableNumber !== tableNumber) };
        api.zones.deleteTable(zoneId, tableNumber).catch(e => console.warn('[DataStore] deleteTable API error:', e));
        return updatedZone;
      }
      return z;
    });
    this.persistLocal();
  }

  // ── Expenses ───────────────────────────────────────────────────────────────

  public addExpense(data: {
    branchId?: string; branchName?: string; title: string;
    category: Expense['category']; amountUGX: number; vatAmountUGX?: number;
    notes?: string; receiptUrl?: string;
  }): Expense {
    const exp: Expense = {
      id: crypto.randomUUID(),
      branchId: data.branchId,
      branchName: data.branchName || 'Main Branch',
      title: data.title, category: data.category,
      amountUGX: Number(data.amountUGX),
      vatAmountUGX: data.vatAmountUGX ?? Math.round(Number(data.amountUGX) * 0.18),
      notes: data.notes, receiptUrl: data.receiptUrl, createdAt: Date.now(),
    };
    this.expenses = [exp, ...this.expenses];
    this.persistLocal();
    api.expenses.create(data).catch(e => console.warn('[DataStore] addExpense API error:', e));
    return exp;
  }

  // ── Recipes / Product Ingredients ──────────────────────────────────────────

  public async saveProductIngredients(productId: string, ingredients: { ingredientId: string; quantityPerUnit: number }[], branchId?: string) {
    this.productIngredients = this.productIngredients.filter(pi => pi.productId !== productId);
    const newItems = ingredients.map(i => ({
      id: crypto.randomUUID(), productId,
      ingredientId: i.ingredientId, quantityPerUnit: Number(i.quantityPerUnit),
      branchId, createdAt: Date.now(),
    }));
    this.productIngredients = [...this.productIngredients, ...newItems];
    this.persistLocal();
    this.notify();

    api.products.saveRecipe(productId, ingredients).catch(e => console.warn('[DataStore] saveProductIngredients API error:', e));
  }

  // ── Print Jobs ─────────────────────────────────────────────────────────────

  public addPrintJob(pj: Omit<PrintJob, 'attempts' | 'createdAt' | 'printedAt' | 'lastError'>): PrintJob {
    const newJob: PrintJob = {
      ...pj, attempts: 0, createdAt: Date.now(), printedAt: null, lastError: null,
    };
    this.printJobs = [newJob, ...this.printJobs];
    this.persistLocal();
    api.printJobs.create(newJob).catch(e => console.warn('[DataStore] addPrintJob API error:', e));
    return newJob;
  }

  public updatePrintJobStatus(id: string, status: PrintJob['status'], details?: { attempts?: number; lastError?: string | null; printedAt?: number | null }) {
    this.printJobs = this.printJobs.map(pj => {
      if (pj.id === id) {
        return {
          ...pj, status,
          attempts: details?.attempts !== undefined ? details.attempts : pj.attempts,
          lastError: details?.lastError !== undefined ? details.lastError : pj.lastError,
          printedAt: details?.printedAt !== undefined ? details.printedAt : pj.printedAt,
        };
      }
      return pj;
    });
    this.persistLocal();
    api.printJobs.update(id, { status, ...details }).catch(e => console.warn('[DataStore] updatePrintJob API error:', e));
  }

  // ── Audit (server-side, stub for backward compat) ──────────────────────────

  public logAudit(
    _userEmail: string,
    _action: string,
    _details: any,
    _branchId?: string,
    _branchName?: string,
    _section?: string,
    _pcInfo?: string
  ) {
    // Audit logging is handled server-side by middleware.
    // This stub exists for backward compatibility with existing callers.
  }

  // ── Categories ─────────────────────────────────────────────────────────────

  public addCustomCategory(cat: string) {
    const cleaned = cat.trim();
    if (cleaned && !this.customCategories.some(c => c.toLowerCase() === cleaned.toLowerCase())) {
      this.customCategories = [...this.customCategories, cleaned];
      this.persistLocal();
    }
  }

  public deleteCustomCategory(cat: string) {
    this.customCategories = this.customCategories.filter(c => c.toLowerCase() !== cat.trim().toLowerCase());
    this.persistLocal();
  }
}

export const dataStore = new DataStoreEngine();
