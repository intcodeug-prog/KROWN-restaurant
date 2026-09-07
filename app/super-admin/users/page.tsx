'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle, Ban, Building2, Check, ChevronDown, KeyRound, Loader2,
  MoreHorizontal, Plus, RefreshCw, Search, ShieldCheck, Store, Trash2,
  UserCheck, UserPlus, UserX, Users, X
} from 'lucide-react';

const ROLES = [
  { value: 'admin', label: 'Admin / Restaurant Admin', description: 'Full restaurant administration' },
  { value: 'manager', label: 'Manager', description: 'Operations and staff management' },
  { value: 'cashier', label: 'Cashier', description: 'POS sales and payments' },
  { value: 'waiter', label: 'Waiter', description: 'Orders and tables' },
  { value: 'kitchen_staff', label: 'Kitchen Staff', description: 'Kitchen and preparation workflow' },
];

const ROLE_LABELS: Record<string, string> = Object.fromEntries(ROLES.map(r => [r.value === 'admin' ? 'restaurant_admin' : r.value, r.label]));

const STATUS_FILTERS = ['all', 'active', 'suspended', 'banned', 'deleted'];

function token() {
  return typeof window !== 'undefined' ? localStorage.getItem('krown_session_token') || '' : '';
}

function headers() {
  return { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' };
}

function initials(name: string) {
  return name?.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase() || 'U';
}

function statusClass(status: string) {
  if (status === 'active') return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
  if (status === 'suspended') return 'bg-amber-500/10 text-amber-700 dark:text-amber-400';
  if (status === 'banned' || status === 'deleted') return 'bg-red-500/10 text-red-600 dark:text-red-400';
  return 'bg-slate-500/10 text-slate-500';
}

export default function SuperAdminUsersPage() {
  const router = useRouter();
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [restaurantFilter, setRestaurantFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [resetUser, setResetUser] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [form, setForm] = useState({
    organizationId: '', assignedBranchId: '', name: '', email: '', phone: '', role: 'admin', password: ''
  });

  const loadRestaurants = useCallback(async () => {
    const r = await fetch('/api/super-admin/orgs', { headers: headers() });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Failed to load restaurants');
    setRestaurants(d.data || []);
    return d.data || [];
  }, []);

  const loadUsers = useCallback(async () => {
    const params = new URLSearchParams({ limit: '100', page: '1' });
    if (search.trim()) params.set('search', search.trim());
    if (roleFilter !== 'all') params.set('role', roleFilter === 'admin' ? 'restaurant_admin' : roleFilter);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (restaurantFilter !== 'all') params.set('organizationId', restaurantFilter);
    const r = await fetch(`/api/super-admin/users?${params.toString()}`, { headers: headers() });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Failed to load users');
    setUsers(d.data || []);
  }, [search, roleFilter, statusFilter, restaurantFilter]);

  const loadBranches = useCallback(async (organizationId: string) => {
    if (!organizationId) { setBranches([]); return; }
    setLoadingBranches(true);
    try {
      const r = await fetch(`/api/super-admin/branches?organizationId=${encodeURIComponent(organizationId)}`, { headers: headers() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to load branches');
      setBranches(d.data || []);
    } finally {
      setLoadingBranches(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setError('');
    try {
      await Promise.all([loadRestaurants(), loadUsers()]);
    } catch (e: any) {
      setError(e.message || 'Unable to load user management');
    }
  }, [loadRestaurants, loadUsers]);

  useEffect(() => {
    if (!token()) { router.replace('/'); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [orgs] = await Promise.all([loadRestaurants(), loadUsers()]);
        if (!cancelled && !form.organizationId && orgs[0]?.id) setForm(f => ({ ...f, organizationId: orgs[0].id }));
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Unable to load user management');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // Initial data load; filters are handled by the dedicated filter effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (loading) return;
    const id = window.setTimeout(() => { loadUsers().catch(e => setError(e.message || 'Failed to refresh users')); }, 180);
    return () => window.clearTimeout(id);
  }, [search, roleFilter, statusFilter, restaurantFilter, loading, loadUsers]);

  useEffect(() => {
    if (showCreate && form.organizationId) {
      // Branch data is an external resource; avoid synchronous setState lint cascading-render warning.
      const organizationId = form.organizationId;
      void loadBranches(organizationId).catch(e => setError(e.message || 'Failed to load branches'));
    }
  }, [showCreate, form.organizationId, loadBranches]);

  const selectedRestaurant = useMemo(() => restaurants.find(r => r.id === form.organizationId), [restaurants, form.organizationId]);

  const openCreate = () => {
    setError(''); setNotice(''); setBranches([]);
    const defaultOrg = restaurantFilter !== 'all' ? restaurantFilter : restaurants[0]?.id || '';
    setForm({ organizationId: defaultOrg, assignedBranchId: '', name: '', email: '', phone: '', role: 'admin', password: '' });
    setShowCreate(true);
    if (defaultOrg) loadBranches(defaultOrg).catch(e => setError(e.message || 'Failed to load branches'));
  };

  const createUser = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true); setError(''); setNotice('');
    try {
      const r = await fetch('/api/super-admin/users', {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ ...form, assignedBranchId: form.assignedBranchId || null })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to create user');
      setShowCreate(false);
      setNotice(`${d.data?.name || 'User'} was created successfully.`);
      await loadUsers();
    } catch (e: any) { setError(e.message || 'Failed to create user'); }
    finally { setSaving(false); }
  };

  const changeStatus = async (id: string, action: 'suspend' | 'ban' | 'activate' | 'restore' | 'delete') => {
    const labels: Record<string, string> = { suspend: 'suspend', ban: 'ban', activate: 'activate', restore: 'restore', delete: 'delete' };
    if (!window.confirm(`Are you sure you want to ${labels[action]} this user?`)) return;
    setOpenMenu(null); setActionLoading(`${id}:${action}`); setError('');
    try {
      const r = await fetch(`/api/super-admin/users/${id}`, {
        method: action === 'delete' ? 'DELETE' : 'PATCH',
        headers: headers(),
        ...(action === 'delete' ? {} : { body: JSON.stringify({ action }) })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `Failed to ${action} user`);
      setNotice(d.message || `User ${action} completed successfully.`);
      await loadUsers();
    } catch (e: any) { setError(e.message || `Failed to ${action} user`); }
    finally { setActionLoading(null); }
  };

  const resetPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetUser || newPassword.length < 8) return;
    setResetting(true); setError('');
    try {
      const r = await fetch(`/api/super-admin/users/${resetUser.id}`, {
        method: 'PATCH', headers: headers(), body: JSON.stringify({ action: 'reset_password', password: newPassword })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to reset password');
      setResetUser(null); setNewPassword(''); setNotice('Password reset successfully. Existing sessions were revoked.');
    } catch (e: any) { setError(e.message || 'Failed to reset password'); }
    finally { setResetting(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#f5f6f8] dark:bg-[#09090b] p-6 lg:p-10">
      <div className="max-w-7xl mx-auto space-y-5 animate-pulse">
        <div className="h-28 rounded-3xl bg-slate-200 dark:bg-white/5" />
        <div className="h-20 rounded-3xl bg-slate-200 dark:bg-white/5" />
        <div className="h-[520px] rounded-3xl bg-slate-200 dark:bg-white/5" />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f5f6f8] dark:bg-[#09090b] text-slate-900 dark:text-white p-5 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 text-orange-500 text-xs font-black uppercase tracking-[0.18em] mb-2"><ShieldCheck className="w-4 h-4"/>Platform Administration</div>
            <h1 className="text-3xl lg:text-4xl font-black tracking-tight">Users</h1>
            <p className="text-sm text-slate-500 mt-2 max-w-2xl">Create and manage restaurant staff from one place. Every account is attached to a restaurant, with optional branch-level assignment.</p>
          </div>
          <button onClick={openCreate} className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-black shadow-lg shadow-orange-500/20 transition"><UserPlus className="w-5 h-5"/> Create User</button>
        </header>

        {error && <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm font-semibold"><AlertCircle className="w-5 h-5 shrink-0"/>{error}<button className="ml-auto" onClick={() => setError('')}><X className="w-4 h-4"/></button></div>}
        {notice && <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-sm font-semibold"><Check className="w-5 h-5"/>{notice}<button className="ml-auto" onClick={() => setNotice('')}><X className="w-4 h-4"/></button></div>}

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-2xl bg-white dark:bg-[#121214] border border-slate-200/70 dark:border-white/5 p-5"><Users className="w-5 h-5 text-orange-500 mb-3"/><div className="text-2xl font-black">{users.length}</div><div className="text-xs text-slate-500">Users in current view</div></div>
          <div className="rounded-2xl bg-white dark:bg-[#121214] border border-slate-200/70 dark:border-white/5 p-5"><Store className="w-5 h-5 text-blue-500 mb-3"/><div className="text-2xl font-black">{restaurants.length}</div><div className="text-xs text-slate-500">Restaurants</div></div>
          <div className="rounded-2xl bg-white dark:bg-[#121214] border border-slate-200/70 dark:border-white/5 p-5"><UserCheck className="w-5 h-5 text-emerald-500 mb-3"/><div className="text-2xl font-black">{users.filter(u => u.status === 'active').length}</div><div className="text-xs text-slate-500">Active accounts</div></div>
          <div className="rounded-2xl bg-white dark:bg-[#121214] border border-slate-200/70 dark:border-white/5 p-5"><Building2 className="w-5 h-5 text-purple-500 mb-3"/><div className="text-2xl font-black">{new Set(users.map(u => u.organization_id)).size}</div><div className="text-xs text-slate-500">Restaurants represented</div></div>
        </section>

        <section className="rounded-3xl bg-white dark:bg-[#121214] border border-slate-200/70 dark:border-white/5 shadow-sm overflow-hidden">
          <div className="p-4 lg:p-5 border-b border-slate-200/70 dark:border-white/5 flex flex-col xl:flex-row gap-3">
            <div className="relative flex-1"><Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email or phone…" className="w-full h-11 pl-10 pr-4 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 outline-none focus:ring-2 focus:ring-orange-500/30 text-sm"/></div>
            <select value={restaurantFilter} onChange={e => setRestaurantFilter(e.target.value)} className="h-11 px-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm min-w-[190px]"><option value="all">All restaurants</option>{restaurants.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
            <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="h-11 px-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm min-w-[160px]"><option value="all">All roles</option>{ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-11 px-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm min-w-[140px]">{STATUS_FILTERS.map(s => <option key={s} value={s}>{s === 'all' ? 'All status' : s[0].toUpperCase() + s.slice(1)}</option>)}</select>
            <button onClick={() => refresh().catch(e => setError(e.message || 'Refresh failed'))} className="h-11 w-11 rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-white/5" title="Refresh"><RefreshCw className="w-4 h-4"/></button>
          </div>

          {users.length === 0 ? <div className="py-20 text-center"><Users className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-700 mb-4"/><h3 className="font-black text-lg">No users found</h3><p className="text-sm text-slate-500 mt-1">Try changing your filters or create a new restaurant user.</p><button onClick={openCreate} className="mt-5 px-4 py-2.5 rounded-xl bg-orange-500 text-white font-bold text-sm"><Plus className="inline w-4 h-4 mr-1"/> Create User</button></div> :
            <div className="overflow-x-auto"><table className="w-full min-w-[850px]"><thead><tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-200/70 dark:border-white/5"><th className="px-5 py-4">User</th><th className="px-5 py-4">Restaurant</th><th className="px-5 py-4">Branch</th><th className="px-5 py-4">Role</th><th className="px-5 py-4">Status</th><th className="px-5 py-4 text-right">Actions</th></tr></thead><tbody>{users.map(u => <tr key={u.id} className="border-b last:border-0 border-slate-200/60 dark:border-white/5 hover:bg-slate-50/70 dark:hover:bg-white/[0.02] transition"><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-amber-500 text-white flex items-center justify-center font-black">{initials(u.name)}</div><div className="min-w-0"><div className="font-bold truncate max-w-[220px]">{u.name}</div><div className="text-xs text-slate-500 truncate max-w-[220px]">{u.email}</div></div></div></td><td className="px-5 py-4"><div className="font-semibold text-sm">{u.organization_name || '—'}</div></td><td className="px-5 py-4 text-sm text-slate-500">{u.branch_name || <span className="italic">All branches</span>}</td><td className="px-5 py-4"><span className="px-2.5 py-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-black uppercase">{ROLE_LABELS[u.role] || String(u.role).replace(/_/g, ' ')}</span></td><td className="px-5 py-4"><span className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase ${statusClass(u.status)}`}>{u.status}</span></td><td className="px-5 py-4"><div className="relative flex justify-end"><button onClick={() => setOpenMenu(openMenu === u.id ? null : u.id)} className="w-9 h-9 rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-white/5"><MoreHorizontal className="w-4 h-4"/></button>{openMenu === u.id && <div className="absolute right-0 top-11 z-30 w-52 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/10 shadow-2xl p-1.5"><button onClick={() => { setResetUser(u); setNewPassword(''); setOpenMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm hover:bg-slate-100 dark:hover:bg-white/5"><KeyRound className="w-4 h-4 text-blue-500"/> Reset password</button>{u.status === 'active' ? <><button onClick={() => changeStatus(u.id, 'suspend')} disabled={!!actionLoading} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm hover:bg-slate-100 dark:hover:bg-white/5"><UserX className="w-4 h-4 text-amber-500"/> Suspend</button><button onClick={() => changeStatus(u.id, 'ban')} disabled={!!actionLoading} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm hover:bg-slate-100 dark:hover:bg-white/5"><Ban className="w-4 h-4 text-red-500"/> Ban</button></> : <button onClick={() => changeStatus(u.id, 'activate')} disabled={!!actionLoading} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm hover:bg-slate-100 dark:hover:bg-white/5"><UserCheck className="w-4 h-4 text-emerald-500"/> Activate / restore</button>}<button onClick={() => changeStatus(u.id, 'delete')} disabled={!!actionLoading} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"><Trash2 className="w-4 h-4"/> Delete</button></div>}</div></td></tr>)}</tbody></table></div>}
        </section>
      </div>

      {showCreate && <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center" onMouseDown={e => { if (e.target === e.currentTarget) setShowCreate(false); }}><form onSubmit={createUser} className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-[2rem] bg-white dark:bg-[#141416] border border-white/20 shadow-2xl" onMouseDown={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-white/95 dark:bg-[#141416]/95 backdrop-blur p-6 border-b border-slate-200/70 dark:border-white/5 flex items-center justify-between"><div><div className="flex items-center gap-2 text-orange-500 text-[10px] font-black uppercase tracking-widest"><UserPlus className="w-4 h-4"/> New staff account</div><h2 className="text-2xl font-black mt-1">Create User</h2><p className="text-xs text-slate-500 mt-1">The restaurant is the account owner; branch is the optional operational scope.</p></div><button type="button" onClick={() => setShowCreate(false)} className="w-10 h-10 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-center"><X/></button></div>
        <div className="p-6 space-y-5">
          <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4"><div className="text-xs font-black uppercase tracking-wider text-orange-600 mb-1">Step 1 · Restaurant</div><p className="text-xs text-slate-500 mb-3">Choose exactly which restaurant owns this account.</p><select required value={form.organizationId} onChange={e => setForm(f => ({ ...f, organizationId: e.target.value, assignedBranchId: '' }))} className="w-full h-12 px-4 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 font-semibold outline-none focus:ring-2 focus:ring-orange-500/30"><option value="">Select restaurant…</option>{restaurants.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 p-4"><div className="text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Step 2 · Branch assignment</div><p className="text-xs text-slate-500 mb-3">If the restaurant has branches, assign this staff member to one. Leave it as All branches for restaurant-wide access.</p>{loadingBranches ? <div className="h-12 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-orange-500"/></div> : <select value={form.assignedBranchId} onChange={e => setForm(f => ({ ...f, assignedBranchId: e.target.value }))} disabled={!form.organizationId || branches.length === 0} className="w-full h-12 px-4 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 font-semibold outline-none disabled:opacity-50"><option value="">{!form.organizationId ? 'Select a restaurant first' : branches.length ? 'All branches' : 'No branches created for this restaurant'}</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}{b.location ? ` · ${b.location}` : ''}</option>)}</select>}{selectedRestaurant && <div className="mt-3 flex items-center gap-2 text-xs text-slate-500"><Store className="w-4 h-4"/><span>{selectedRestaurant.name}</span><span>·</span><span>{branches.length} branch{branches.length === 1 ? '' : 'es'} available</span></div>}</div>
          <div className="grid md:grid-cols-2 gap-4"><label className="block"><span className="text-xs font-bold text-slate-600 dark:text-slate-300">Full name</span><input required minLength={2} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="mt-2 w-full h-12 px-4 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 outline-none focus:ring-2 focus:ring-orange-500/30" placeholder="e.g. Sarah Namusoke"/></label><label className="block"><span className="text-xs font-bold text-slate-600 dark:text-slate-300">Email address</span><input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="mt-2 w-full h-12 px-4 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 outline-none focus:ring-2 focus:ring-orange-500/30" placeholder="staff@restaurant.com"/></label></div>
          <div className="grid md:grid-cols-2 gap-4"><label className="block"><span className="text-xs font-bold text-slate-600 dark:text-slate-300">Phone <span className="font-normal text-slate-400">(optional)</span></span><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="mt-2 w-full h-12 px-4 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 outline-none" placeholder="+256…"/></label><label className="block"><span className="text-xs font-bold text-slate-600 dark:text-slate-300">Role</span><select required value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className="mt-2 w-full h-12 px-4 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 outline-none">{ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select></label></div>
          <label className="block"><span className="text-xs font-bold text-slate-600 dark:text-slate-300">Initial password</span><input required minLength={8} type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="mt-2 w-full h-12 px-4 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 outline-none focus:ring-2 focus:ring-orange-500/30" placeholder="Minimum 8 characters"/><span className="block mt-1.5 text-[11px] text-slate-400">Stored securely as an Argon2 password hash; never stored as plaintext.</span></label>
        </div>
        <div className="p-6 pt-0 flex flex-col-reverse sm:flex-row justify-end gap-3"><button type="button" onClick={() => setShowCreate(false)} className="px-5 py-3 rounded-xl border border-slate-200 dark:border-white/10 font-bold">Cancel</button><button disabled={saving || !form.organizationId} className="px-6 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-black flex items-center justify-center gap-2 disabled:opacity-50">{saving ? <Loader2 className="w-4 h-4 animate-spin"/> : <UserPlus className="w-4 h-4"/>}{saving ? 'Creating account…' : 'Create User'}</button></div>
      </form></div>}

      {resetUser && <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center"><form onSubmit={resetPassword} className="w-full max-w-md rounded-3xl bg-white dark:bg-[#141416] border border-white/20 shadow-2xl p-6 space-y-5"><div className="flex items-start justify-between"><div><div className="text-xs font-black uppercase tracking-wider text-blue-500">Security action</div><h2 className="text-xl font-black mt-1">Reset password</h2><p className="text-sm text-slate-500 mt-1">{resetUser.name} · {resetUser.email}</p></div><button type="button" onClick={() => setResetUser(null)}><X/></button></div><input required minLength={8} type="password" autoFocus value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New password · minimum 8 characters" className="w-full h-12 px-4 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent outline-none focus:ring-2 focus:ring-blue-500/30"/><button disabled={resetting || newPassword.length < 8} className="w-full h-12 rounded-xl bg-blue-600 text-white font-black flex items-center justify-center gap-2 disabled:opacity-50">{resetting && <Loader2 className="w-4 h-4 animate-spin"/>}{resetting ? 'Resetting…' : 'Reset Password'}</button></form></div>}
    </div>
  );
}
