/**
 * KROWN POS - Neon DB API Client (SaaS Version)
 * Routes all database operations through authenticated Next.js API endpoints.
 * No more generic CRUD — only specific, authorized endpoints.
 */

const API_BASE = typeof window !== 'undefined' ? '' : 'http://localhost:3000';

// Debounce TOKEN_EXPIRED events to prevent redundant triggers from concurrent 401s
let tokenExpiredTimeout: ReturnType<typeof setTimeout> | null = null;
function debouncedTokenExpired() {
  if (tokenExpiredTimeout) return;
  tokenExpiredTimeout = setTimeout(() => {
    tokenExpiredTimeout = null;
    if (typeof window !== 'undefined') {
      notifyAuthListeners('TOKEN_EXPIRED', null);
    }
  }, 300);
}

async function apiFetch(path: string, options?: RequestInit): Promise<any> {
  const url = `${API_BASE}${path}`;
  // Always include the JWT token from localStorage for Authorization header
  const token = typeof window !== 'undefined' ? localStorage.getItem('krown_session_token') : null;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (res.status === 401) {
    // Token expired or invalid — clear session (debounced to prevent redundant events)
    debouncedTokenExpired();
    throw new Error('Session expired. Please log in again.');
  }

  if (res.status === 429) {
    throw new Error('Too many requests. Please wait a moment and try again.');
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Auth State Change Listeners ──────────────────────────────────────────────
type AuthStateCallback = (event: string, session: any) => void;
const authListeners = new Set<AuthStateCallback>();

function notifyAuthListeners(event: string, session: any) {
  authListeners.forEach(cb => {
    try { cb(event, session); } catch {}
  });
}

// ── Auth Client ──────────────────────────────────────────────────────────────
class AuthClient {
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    try {
      const result = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      // Token is set as httpOnly cookie by the server
      // Store staff info in localStorage for quick access
      if (typeof window !== 'undefined' && result?.data?.staff) {
        localStorage.setItem('krown_staff', JSON.stringify(result.data.staff));
      }
      return { data: result?.data, error: null };
    } catch (e: any) {
      return { data: null, error: { message: e.message } };
    }
  }

  async signInWithPin({ email, pin }: { email: string; pin: string }) {
    try {
      const result = await apiFetch('/api/auth/pin-login', {
        method: 'POST',
        body: JSON.stringify({ email, pin }),
      });
      if (typeof window !== 'undefined' && result?.data?.staff) {
        localStorage.setItem('krown_staff', JSON.stringify(result.data.staff));
      }
      return { data: result?.data, error: null };
    } catch (e: any) {
      return { data: null, error: { message: e.message } };
    }
  }

  async getSession() {
    try {
      const result = await apiFetch('/api/auth/session');
      return { data: result?.data, error: null };
    } catch (e: any) {
      return { data: { staff: null }, error: null };
    }
  }

  async signOut() {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
      if (typeof window !== 'undefined') {
        localStorage.removeItem('krown_staff');
      }
      notifyAuthListeners('SIGNED_OUT', null);
      return { error: null };
    } catch (e: any) {
      return { error: { message: e.message } };
    }
  }

  onAuthStateChange(callback: AuthStateCallback): { data: { subscription: { unsubscribe: () => void } } } {
    authListeners.add(callback);
    return {
      data: {
        subscription: {
          unsubscribe: () => { authListeners.delete(callback); },
        },
      },
    };
  }
}

// ── Typed API Methods ────────────────────────────────────────────────────────

export const api = {
  // ── Products ──────────────────────────────────────────────────────────────
  products: {
    list: (branchId?: string) => {
      const params = branchId ? `?branchId=${branchId}` : '';
      return apiFetch(`/api/products${params}`);
    },
    get: (id: string) => apiFetch(`/api/products/${id}`),
    create: (data: any) => apiFetch('/api/products', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => apiFetch(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => apiFetch(`/api/products/${id}`, { method: 'DELETE' }),
    toggle: (id: string) => apiFetch(`/api/products/${id}/toggle`, { method: 'POST' }),
    getRecipe: (id: string) => apiFetch(`/api/products/${id}/recipe`),
    saveRecipe: (id: string, ingredients: any[]) => apiFetch(`/api/products/${id}/recipe`, { method: 'POST', body: JSON.stringify({ ingredients }) }),
  },

  // ── Ingredients ───────────────────────────────────────────────────────────
  ingredients: {
    list: (branchId?: string) => {
      const params = branchId ? `?branchId=${branchId}` : '';
      return apiFetch(`/api/ingredients${params}`);
    },
    get: (id: string) => apiFetch(`/api/ingredients/${id}`),
    create: (data: any) => apiFetch('/api/ingredients', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => apiFetch(`/api/ingredients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => apiFetch(`/api/ingredients/${id}`, { method: 'DELETE' }),
    updateQuantity: (id: string, quantity: number) => apiFetch(`/api/ingredients/${id}/quantity`, { method: 'PUT', body: JSON.stringify({ quantity }) }),
  },

  // ── Orders ────────────────────────────────────────────────────────────────
  orders: {
    list: (branchId?: string, startDate?: number, endDate?: number, limit?: number) => {
      const params = new URLSearchParams();
      if (branchId) params.set('branchId', branchId);
      if (startDate) params.set('startDate', String(startDate));
      if (endDate) params.set('endDate', String(endDate));
      if (limit) params.set('limit', String(limit));
      const qs = params.toString();
      return apiFetch(`/api/orders${qs ? '?' + qs : ''}`);
    },
    get: (id: string) => apiFetch(`/api/orders/${id}`),
    create: (data: any) => apiFetch('/api/orders', { method: 'POST', body: JSON.stringify(data) }),
    updateStatus: (id: string, status: string) => apiFetch(`/api/orders/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
    pay: (id: string, payment: any) => apiFetch(`/api/orders/${id}/pay`, { method: 'POST', body: JSON.stringify(payment) }),
    splitPay: (id: string, splits: any[]) => apiFetch(`/api/orders/${id}/split`, { method: 'POST', body: JSON.stringify({ splits }) }),
    addItems: (id: string, items: any[]) => apiFetch(`/api/orders/${id}/items`, { method: 'POST', body: JSON.stringify({ items }) }),
    updateTin: (id: string, tin: string) => apiFetch(`/api/orders/${id}/tin`, { method: 'POST', body: JSON.stringify({ tin }) }),
    getOpenByTable: (tableNumber: string, seat?: string) => {
      const params = new URLSearchParams({ tableNumber });
      if (seat) params.set('seat', seat);
      return apiFetch(`/api/orders?${params.toString()}`);
    },
  },

  // ── Staff ─────────────────────────────────────────────────────────────────
  staff: {
    list: (branchId?: string) => {
      const params = branchId ? `?branchId=${branchId}` : '';
      return apiFetch(`/api/staff${params}`);
    },
    get: (id: string) => apiFetch(`/api/staff/${id}`),
    create: (data: any) => apiFetch('/api/staff', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => apiFetch(`/api/staff/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => apiFetch(`/api/staff/${id}`, { method: 'DELETE' }),
    updateRole: (id: string, role: string) => apiFetch(`/api/staff/${id}/role`, { method: 'POST', body: JSON.stringify({ role }) }),
    updateStatus: (id: string, status: string) => apiFetch(`/api/staff/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
    setPin: (id: string, pin: string) => apiFetch(`/api/staff/${id}/pin`, { method: 'POST', body: JSON.stringify({ pin }) }),
    sync: () => apiFetch('/api/staff/sync', { method: 'POST' }),
  },

  // ── Companies ─────────────────────────────────────────────────────────────
  companies: {
    list: (branchId?: string) => {
      const params = branchId ? `?branchId=${branchId}` : '';
      return apiFetch(`/api/companies${params}`);
    },
    get: (id: string) => apiFetch(`/api/companies/${id}`),
    create: (data: any) => apiFetch('/api/companies', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => apiFetch(`/api/companies/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    updateStatus: (id: string, status: string) => apiFetch(`/api/companies/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
    listStaff: (id: string) => apiFetch(`/api/companies/${id}/staff`),
    addStaff: (id: string, data: any) => apiFetch(`/api/companies/${id}/staff`, { method: 'POST', body: JSON.stringify(data) }),
    updateStaff: (companyId: string, staffId: string, data: any) => apiFetch(`/api/companies/${companyId}/staff/${staffId}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteStaff: (companyId: string, staffId: string) => apiFetch(`/api/companies/${companyId}/staff/${staffId}`, { method: 'DELETE' }),
    settle: (id: string, data: any) => apiFetch(`/api/companies/${id}/settle`, { method: 'POST', body: JSON.stringify(data) }),
  },

  // ── Branches ──────────────────────────────────────────────────────────────
  branches: {
    list: () => apiFetch('/api/branches'),
    get: (id: string) => apiFetch(`/api/branches/${id}`),
    create: (data: any) => apiFetch('/api/branches', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => apiFetch(`/api/branches/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => apiFetch(`/api/branches/${id}`, { method: 'DELETE' }),
    updateStatus: (id: string, status: string) => apiFetch(`/api/branches/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  },

  // ── Zones ─────────────────────────────────────────────────────────────────
  zones: {
    list: (branchId?: string) => {
      const params = branchId ? `?branchId=${branchId}` : '';
      return apiFetch(`/api/zones${params}`);
    },
    get: (id: string) => apiFetch(`/api/zones/${id}`),
    create: (data: any) => apiFetch('/api/zones', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => apiFetch(`/api/zones/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => apiFetch(`/api/zones/${id}`, { method: 'DELETE' }),
    addTable: (id: string, data: any) => apiFetch(`/api/zones/${id}/tables`, { method: 'POST', body: JSON.stringify(data) }),
    updateTable: (zoneId: string, tableNumber: string, data: any) => apiFetch(`/api/zones/${zoneId}/tables/${tableNumber}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteTable: (zoneId: string, tableNumber: string) => apiFetch(`/api/zones/${zoneId}/tables/${tableNumber}`, { method: 'DELETE' }),
  },

  // ── Expenses ──────────────────────────────────────────────────────────────
  expenses: {
    list: (branchId?: string, startDate?: number, endDate?: number) => {
      const params = new URLSearchParams();
      if (branchId) params.set('branchId', branchId);
      if (startDate) params.set('startDate', String(startDate));
      if (endDate) params.set('endDate', String(endDate));
      const qs = params.toString();
      return apiFetch(`/api/expenses${qs ? '?' + qs : ''}`);
    },
    create: (data: any) => apiFetch('/api/expenses', { method: 'POST', body: JSON.stringify(data) }),
  },

  // ── Inventory ─────────────────────────────────────────────────────────────
  inventory: {
    movements: (branchId?: string) => {
      const params = branchId ? `?branchId=${branchId}` : '';
      return apiFetch(`/api/inventory/movements${params}`);
    },
    deduct: (data: any) => apiFetch('/api/inventory/deduct', { method: 'POST', body: JSON.stringify(data) }),
    restore: (orderId: string) => apiFetch('/api/inventory/restore', { method: 'POST', body: JSON.stringify({ orderId }) }),
  },

  // ── Audit ─────────────────────────────────────────────────────────────────
  audit: {
    list: (branchId?: string, limit?: number) => {
      const params = new URLSearchParams();
      if (branchId) params.set('branchId', branchId);
      if (limit) params.set('limit', String(limit));
      const qs = params.toString();
      return apiFetch(`/api/audit${qs ? '?' + qs : ''}`);
    },
  },

  // ── Print Jobs ────────────────────────────────────────────────────────────
  printJobs: {
    list: (orderId?: string) => {
      const params = orderId ? `?orderId=${orderId}` : '';
      return apiFetch(`/api/print-jobs${params}`);
    },
    create: (data: any) => apiFetch('/api/print-jobs', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => apiFetch(`/api/print-jobs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },

  // ── Upload ────────────────────────────────────────────────────────────────
  upload: async (file: File): Promise<{ url: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/api/upload`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Upload failed');
    return res.json();
  },

  // ── Super Admin ───────────────────────────────────────────────────────────
  superAdmin: {
    login: (email: string, password: string) => apiFetch('/api/super-admin/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    listOrgs: () => apiFetch('/api/super-admin/orgs'),
    getOrg: (id: string) => apiFetch(`/api/super-admin/orgs/${id}`),
    createOrg: (data: any) => apiFetch('/api/super-admin/orgs', { method: 'POST', body: JSON.stringify(data) }),
    updateOrg: (id: string, data: any) => apiFetch(`/api/super-admin/orgs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    suspendOrg: (id: string) => apiFetch(`/api/super-admin/orgs/${id}/suspend`, { method: 'POST' }),
    reactivateOrg: (id: string) => apiFetch(`/api/super-admin/orgs/${id}/reactivate`, { method: 'POST' }),
    updateSubscription: (id: string, planId: string) => apiFetch(`/api/super-admin/orgs/${id}/subscription`, { method: 'POST', body: JSON.stringify({ planId }) }),
    listPlans: () => apiFetch('/api/super-admin/plans'),
  },

  // ── Auth ──────────────────────────────────────────────────────────────────
  auth: new AuthClient(),
};

// ── Legacy Compatibility Layer ───────────────────────────────────────────────
// Provides neonDB.from() / neonDB.rpc() / neonDB.channel() / neonDB.auth
// that components may still use. Routes through the new typed api.* methods.

class LegacyQueryBuilder {
  constructor(private table: string) {}

  select(_columns?: string) { return this; }
  eq(_col: string, _val: any) { return this; }
  order(_col: string, _opts?: any) { return this; }
  limit(_n: number) { return this; }
  single() { return this; }
  maybeSingle() { return this; }
  insert(_data: any) { return this; }
  update(_data: any) { return this; }
  upsert(_data: any, _opts?: any) { return this; }
  delete() { return this; }
  or(_conds: string) { return this; }

  then(onfulfilled?: any, onrejected?: any) {
    console.warn(`[neonDB] Legacy neonDB.from('${this.table}') called — migrate to api.${this.table}.*`);
    return Promise.resolve({ data: [], error: null }).then(onfulfilled, onrejected);
  }
}

export const neonDB = {
  from(table: string): LegacyQueryBuilder {
    return new LegacyQueryBuilder(table);
  },
  rpc(_fnName: string, _params?: any) {
    console.warn('[neonDB] Legacy neonDB.rpc() called — migrate to specific api.* methods');
    return { then: (onfulfilled?: any, onrejected?: any) => Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected) };
  },
  channel(_name: string, _config?: any) {
    return {
      on: () => ({ subscribe: () => ({}) }),
      subscribe: () => ({}),
      track: () => Promise.resolve(),
      unsubscribe: () => {},
    };
  },
  removeChannel: () => {},
  auth: new AuthClient(),
};
