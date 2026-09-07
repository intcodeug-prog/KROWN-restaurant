'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  HandCoins, Plus, Search, Filter, ChevronRight, ArrowLeft, Loader2,
  CheckCircle2, AlertCircle, X, CreditCard, Clock, TrendingUp, TrendingDown,
  AlertTriangle, DollarSign, Users, FileText, Download, RefreshCw, Wallet
} from 'lucide-react';
import { formatUGX } from '@/lib/mockData';

type ViewMode = 'dashboard' | 'profiles' | 'detail';

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('krown_session_token') : null;
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

function statusColor(s: string) {
  switch (s) {
    case 'active': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
    case 'partially_paid': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
    case 'paid': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
    case 'overdue': return 'bg-red-500/10 text-red-600 dark:text-red-400';
    case 'written_off': return 'bg-purple-500/10 text-purple-600 dark:text-purple-400';
    case 'cancelled': return 'bg-slate-500/10 text-slate-600 dark:text-slate-400';
    default: return 'bg-slate-500/10 text-slate-600 dark:text-slate-400';
  }
}

function entryTypeIcon(t: string) {
  switch (t) {
    case 'charge': return <TrendingUp className="w-4 h-4 text-red-500" />;
    case 'payment': return <TrendingDown className="w-4 h-4 text-emerald-500" />;
    case 'adjustment': return <RefreshCw className="w-4 h-4 text-blue-500" />;
    case 'reversal': return <RefreshCw className="w-4 h-4 text-orange-500" />;
    case 'write_off': return <AlertTriangle className="w-4 h-4 text-purple-500" />;
    default: return <DollarSign className="w-4 h-4 text-slate-400" />;
  }
}

export default function PersonalCredits({ branchId }: { branchId?: string }) {
  const [view, setView] = useState<ViewMode>('dashboard');
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<any>(null);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [totalProfiles, setTotalProfiles] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedProfile, setSelectedProfile] = useState<any>(null);
  const [ledger, setLedger] = useState<any[]>([]);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showWriteOffModal, setShowWriteOffModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Form states
  const [createForm, setCreateForm] = useState({ fullName: '', phone: '', email: '', creditLimitUgx: '', notes: '', dueDate: '' });
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDesc, setPaymentDesc] = useState('');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [writeOffReason, setWriteOffReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Load Dashboard ──────────────────────────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (branchId) params.set('branchId', branchId);
      const res = await fetch(`/api/personal-credit?view=dashboard&${params}`, { headers: authHeaders() });
      const json = await res.json();
      if (json.data) setDashboard(json.data);
    } catch (err) {
      console.error('[Credits] Dashboard error:', err);
    }
  }, [branchId]);

  // ── Load Profiles ───────────────────────────────────────────────────────────
  const loadProfiles = useCallback(async () => {
    try {
      const params = new URLSearchParams({ view: 'list', page: String(page), limit: '20' });
      if (branchId) params.set('branchId', branchId);
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
      if (search) params.set('search', search);
      const res = await fetch(`/api/personal-credit?${params}`, { headers: authHeaders() });
      const json = await res.json();
      if (json.data) {
        setProfiles(json.data.profiles || []);
        setTotalProfiles(json.data.total || 0);
      }
    } catch (err) {
      console.error('[Credits] Load profiles error:', err);
    }
  }, [branchId, page, statusFilter, search]);

  // ── Load Profile Detail ─────────────────────────────────────────────────────
  const loadDetail = useCallback(async (profileId: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/personal-credit/${profileId}`, { headers: authHeaders() });
      const json = await res.json();
      if (json.data) setSelectedProfile(json.data);
      const histRes = await fetch(`/api/personal-credit/${profileId}?view=history`, { headers: authHeaders() });
      const histJson = await histRes.json();
      if (histJson.data?.ledger) setLedger(histJson.data.ledger);
    } catch (err) {
      console.error('[Credits] Detail error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Effects ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      if (view === 'dashboard') {
        const params = new URLSearchParams();
        if (branchId) params.set('branchId', branchId);
        try {
          const res = await fetch(`/api/personal-credit?view=dashboard&${params}`, { headers: authHeaders() });
          const json = await res.json();
          if (!cancelled && json.data) setDashboard(json.data);
        } catch { /* ignore */ }
        if (!cancelled) setLoading(false);
      }
      if (view === 'profiles') {
        const params = new URLSearchParams({ view: 'list', page: String(page), limit: '20' });
        if (branchId) params.set('branchId', branchId);
        if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
        if (search) params.set('search', search);
        try {
          const res = await fetch(`/api/personal-credit?${params}`, { headers: authHeaders() });
          const json = await res.json();
          if (!cancelled && json.data) {
            setProfiles(json.data.profiles || []);
            setTotalProfiles(json.data.total || 0);
          }
        } catch { /* ignore */ }
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [view, branchId, page, statusFilter, search]);

  // ── Create Profile ──────────────────────────────────────────────────────────
  const handleCreate = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/personal-credit', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ ...createForm, creditLimitUgx: Number(createForm.creditLimitUgx) || 0 })
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      showToast('success', `Credit profile created for ${createForm.fullName}`);
      setShowCreateModal(false);
      setCreateForm({ fullName: '', phone: '', email: '', creditLimitUgx: '', notes: '', dueDate: '' });
      loadProfiles();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to create credit profile');
    } finally {
      setActionLoading(false);
    }
  };

  // ── Record Payment ──────────────────────────────────────────────────────────
  const handlePayment = async () => {
    if (!selectedProfile) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/personal-credit/${selectedProfile.id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'payment', amount: Number(paymentAmount), description: paymentDesc || undefined })
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      showToast('success', `Payment of ${formatUGX(Number(paymentAmount))} recorded`);
      setShowPaymentModal(false);
      setPaymentAmount('');
      setPaymentDesc('');
      loadDetail(selectedProfile.id);
    } catch (err: any) {
      showToast('error', err.message || 'Failed to record payment');
    } finally {
      setActionLoading(false);
    }
  };

  // ── Adjustment ──────────────────────────────────────────────────────────────
  const handleAdjust = async () => {
    if (!selectedProfile) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/personal-credit/${selectedProfile.id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'adjust', amount: Number(adjustAmount), reason: adjustReason })
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      showToast('success', 'Adjustment applied');
      setShowAdjustModal(false);
      setAdjustAmount('');
      setAdjustReason('');
      loadDetail(selectedProfile.id);
    } catch (err: any) {
      showToast('error', err.message || 'Failed to apply adjustment');
    } finally {
      setActionLoading(false);
    }
  };

  // ── Write Off ───────────────────────────────────────────────────────────────
  const handleWriteOff = async () => {
    if (!selectedProfile) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/personal-credit/${selectedProfile.id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'writeoff', reason: writeOffReason })
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      showToast('success', 'Credit written off');
      setShowWriteOffModal(false);
      setWriteOffReason('');
      loadDetail(selectedProfile.id);
    } catch (err: any) {
      showToast('error', err.message || 'Failed to write off');
    } finally {
      setActionLoading(false);
    }
  };

  // ── Cancel ──────────────────────────────────────────────────────────────────
  const handleCancel = async () => {
    if (!selectedProfile) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/personal-credit/${selectedProfile.id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'cancel', reason: cancelReason })
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      showToast('success', 'Credit cancelled');
      setShowCancelModal(false);
      setCancelReason('');
      loadDetail(selectedProfile.id);
    } catch (err: any) {
      showToast('error', err.message || 'Failed to cancel');
    } finally {
      setActionLoading(false);
    }
  };

  // ── Export ──────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    try {
      const params = new URLSearchParams({ view: 'list', limit: '500' });
      if (branchId) params.set('branchId', branchId);
      const res = await fetch(`/api/personal-credit?${params}`, { headers: authHeaders() });
      const json = await res.json();
      const rows = json.data?.profiles || [];
      const csv = [['Name', 'Phone', 'Reference', 'Credit Limit', 'Balance', 'Total Paid', 'Status', 'Due Date'].join(',')];
      rows.forEach((r: any) => csv.push([r.full_name, r.phone || '', r.public_reference, r.credit_limit_ugx, r.current_balance_ugx, r.total_paid_ugx, r.status, r.due_date || ''].join(',')));
      const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `credits-export-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      URL.revokeObjectURL(url);
      showToast('success', `Exported ${rows.length} records`);
    } catch { showToast('error', 'Export failed'); }
  };

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: DASHBOARD
  // ════════════════════════════════════════════════════════════════════════════
  if (view === 'dashboard') {
    return (
      <div className="flex flex-col h-full gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Personal Credits</h2>
            <p className="text-slate-500 font-medium text-sm mt-0.5">Customer credit management dashboard</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={loadDashboard} disabled={loading} className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">
              <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={handleExport} className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors" title="Export CSV">
              <Download className="w-4 h-4 text-slate-500" />
            </button>
            <button onClick={() => setView('profiles')} className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-3 rounded-2xl font-bold flex items-center gap-2 shadow-lg shadow-orange-500/20 transition-all active:scale-95 text-sm">
              View All Profiles <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {loading && !dashboard ? (
          <div className="flex items-center justify-center py-24"><Loader2 className="w-8 h-8 text-orange-500 animate-spin" /></div>
        ) : dashboard && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Outstanding', value: formatUGX(dashboard.totalOutstanding), icon: Wallet, color: 'text-orange-500' },
                { label: 'Active Credits', value: String(dashboard.totalActive), icon: HandCoins, color: 'text-blue-500' },
                { label: 'Total Collected', value: formatUGX(dashboard.totalCollected), icon: TrendingDown, color: 'text-emerald-500' },
                { label: 'Overdue', value: formatUGX(dashboard.overdueAmount), icon: AlertTriangle, color: 'text-red-500' },
              ].map((stat, i) => (
                <div key={i} className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 rounded-[1.5rem] p-5 shadow-lg">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center">
                      <stat.icon className={`w-5 h-5 ${stat.color}`} />
                    </div>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{stat.label}</span>
                  </div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 rounded-[1.5rem] p-5 shadow-lg">
                <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-orange-500" /> Largest Balances
                </h3>
                {(dashboard.largestBalances || []).length === 0 ? (
                  <p className="text-slate-400 text-sm">No outstanding balances</p>
                ) : (
                  <div className="space-y-3">
                    {dashboard.largestBalances.map((p: any) => (
                      <button key={p.id} onClick={() => { setSelectedProfile(p); setView('detail'); loadDetail(p.id); }} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-left">
                        <div>
                          <p className="font-bold text-sm text-slate-900 dark:text-white">{p.full_name}</p>
                          <p className="text-xs text-slate-500">{p.public_reference}</p>
                        </div>
                        <span className="font-bold text-red-500 text-sm">{formatUGX(p.current_balance_ugx)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 rounded-[1.5rem] p-5 shadow-lg">
                <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-500" /> Recent Payments
                </h3>
                {(dashboard.recentPayments || []).length === 0 ? (
                  <p className="text-slate-400 text-sm">No recent payments</p>
                ) : (
                  <div className="space-y-3">
                    {dashboard.recentPayments.map((l: any) => (
                      <div key={l.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-white/5">
                        <div>
                          <p className="font-bold text-sm text-slate-900 dark:text-white">{l.staff_name || 'System'}</p>
                          <p className="text-xs text-slate-500">{new Date(l.created_at).toLocaleString()}</p>
                        </div>
                        <span className="font-bold text-emerald-500 text-sm">+{formatUGX(l.amount_ugx)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 rounded-[1.5rem] p-5 shadow-lg">
              <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-500" /> Recent Activity
              </h3>
              {(dashboard.recentActivity || []).length === 0 ? (
                <p className="text-slate-400 text-sm">No recent activity</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                      <th className="pb-3 pr-4">Type</th><th className="pb-3 pr-4">Staff</th><th className="pb-3 pr-4">Description</th><th className="pb-3 text-right">Amount</th><th className="pb-3 text-right">Balance After</th><th className="pb-3 text-right">Time</th>
                    </tr></thead>
                    <tbody className="divide-y divide-black/5 dark:divide-white/5">
                      {dashboard.recentActivity.map((l: any) => (
                        <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                          <td className="py-3 pr-4"><div className="flex items-center gap-2">{entryTypeIcon(l.entry_type)}<span className="font-semibold capitalize">{l.entry_type.replace('_', ' ')}</span></div></td>
                          <td className="py-3 pr-4 text-slate-500">{l.staff_name || 'System'}</td>
                          <td className="py-3 pr-4 text-slate-500 max-w-[200px] truncate">{l.description}</td>
                          <td className="py-3 text-right font-bold text-red-500">{l.entry_type === 'payment' || l.entry_type === 'reversal' ? '+' : '-'}{formatUGX(l.amount_ugx)}</td>
                          <td className="py-3 text-right font-semibold text-slate-500">{formatUGX(l.balance_after_ugx)}</td>
                          <td className="py-3 text-right text-xs text-slate-400">{new Date(l.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {renderToast()}
        {showCreateModal && renderCreateModal()}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: PROFILES LIST
  // ════════════════════════════════════════════════════════════════════════════
  if (view === 'profiles') {
    return (
      <div className="flex flex-col h-full gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setView('dashboard')} className="p-2 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">
              <ArrowLeft className="w-4 h-4 text-slate-500" />
            </button>
            <div>
              <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Credit Profiles</h2>
              <p className="text-slate-500 font-medium text-sm mt-0.5">{totalProfiles} total profiles</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Search by name, phone, ref..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 pr-4 py-2.5 bg-slate-100 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-xl text-sm w-56 text-slate-900 dark:text-white" />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2.5 bg-slate-100 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-xl text-sm text-slate-900 dark:text-white">
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="partially_paid">Partially Paid</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="written_off">Written Off</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <button onClick={() => setShowCreateModal(true)} className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-3 rounded-2xl font-bold flex items-center gap-2 shadow-lg shadow-orange-500/20 transition-all active:scale-95 text-sm shrink-0">
              <Plus className="w-4 h-4" /> New Credit
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24"><Loader2 className="w-8 h-8 text-orange-500 animate-spin" /></div>
        ) : profiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center"><HandCoins className="w-8 h-8 text-slate-400" /></div>
            <div><p className="font-bold text-slate-700 dark:text-white">No Credit Profiles</p><p className="text-slate-500 text-sm mt-1">Create a new credit profile for a customer.</p></div>
          </div>
        ) : (
          <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 shadow-2xl rounded-[2rem] p-6 ring-1 ring-black/5 dark:ring-white/10 flex-1 overflow-y-auto custom-scrollbar">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {profiles.map((p: any) => (
                <button key={p.id} onClick={() => { setSelectedProfile(p); setView('detail'); loadDetail(p.id); }} className="p-5 rounded-2xl border border-black/5 dark:border-white/5 hover:border-orange-500/30 bg-slate-50 dark:bg-black/20 hover:bg-white dark:hover:bg-white/5 transition-all text-left shadow-sm hover:shadow-md">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                      <Users className="w-5 h-5 text-orange-500" />
                    </div>
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${statusColor(p.status)}`}>{p.status.replace('_', ' ')}</span>
                  </div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm">{p.full_name}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">{p.phone || p.email || 'No contact'}</p>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">{p.public_reference}</p>
                  <div className="mt-3 pt-3 border-t border-black/5 dark:border-white/5 grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-bold">Balance</p>
                      <p className="text-sm font-bold text-red-500">{formatUGX(p.current_balance_ugx)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-bold">Paid</p>
                      <p className="text-sm font-bold text-emerald-500">{formatUGX(p.total_paid_ugx)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            {totalProfiles > 20 && (
              <div className="flex items-center justify-center gap-3 mt-6">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-sm font-bold disabled:opacity-40">Prev</button>
                <span className="text-sm text-slate-500">Page {page} of {Math.ceil(totalProfiles / 20)}</span>
                <button disabled={page >= Math.ceil(totalProfiles / 20)} onClick={() => setPage(p => p + 1)} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-sm font-bold disabled:opacity-40">Next</button>
              </div>
            )}
          </div>
        )}

        {renderToast()}
        {showCreateModal && renderCreateModal()}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: PROFILE DETAIL
  // ════════════════════════════════════════════════════════════════════════════
  if (view === 'detail' && selectedProfile) {
    const p = selectedProfile;
    const isActive = ['active', 'partially_paid', 'overdue'].includes(p.status);
    return (
      <div className="flex flex-col h-full gap-6">
        <div className="flex items-center gap-3">
          <button onClick={() => { setView('profiles'); loadProfiles(); }} className="p-2 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-4 h-4 text-slate-500" />
          </button>
          <div className="flex-1">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">{p.full_name}</h2>
            <p className="text-slate-500 font-medium text-sm mt-0.5">{p.public_reference} &middot; <span className={`font-bold ${statusColor(p.status).split(' ').filter(s => s.startsWith('text-')).join(' ')}`}>{p.status.replace('_', ' ')}</span></p>
          </div>
          {isActive && (
            <div className="flex items-center gap-2">
              <button onClick={() => setShowPaymentModal(true)} className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-2xl font-bold flex items-center gap-2 text-sm transition-all active:scale-95">
                <CreditCard className="w-4 h-4" /> Record Payment
              </button>
              <button onClick={() => setShowAdjustModal(true)} className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2.5 rounded-2xl font-bold flex items-center gap-2 text-sm transition-all active:scale-95">
                <RefreshCw className="w-4 h-4" /> Adjust
              </button>
              <button onClick={() => setShowWriteOffModal(true)} className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2.5 rounded-2xl font-bold flex items-center gap-2 text-sm transition-all active:scale-95">
                <AlertTriangle className="w-4 h-4" /> Write Off
              </button>
              <button onClick={() => setShowCancelModal(true)} className="bg-red-500/10 hover:bg-red-500/20 text-red-500 px-4 py-2.5 rounded-2xl font-bold flex items-center gap-2 text-sm transition-all active:scale-95">
                <X className="w-4 h-4" /> Cancel
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Credit Limit', value: formatUGX(p.credit_limit_ugx), color: 'text-slate-900 dark:text-white' },
            { label: 'Outstanding', value: formatUGX(p.current_balance_ugx), color: 'text-red-500' },
            { label: 'Total Paid', value: formatUGX(p.total_paid_ugx), color: 'text-emerald-500' },
            { label: 'Original Amount', value: formatUGX(p.original_amount_ugx), color: 'text-blue-500' },
            { label: 'Due Date', value: p.due_date ? new Date(p.due_date).toLocaleDateString() : 'N/A', color: 'text-slate-600 dark:text-slate-300' },
          ].map((s, i) => (
            <div key={i} className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 rounded-[1.5rem] p-4 shadow-lg">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{s.label}</p>
              <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 shadow-2xl rounded-[2rem] p-6 ring-1 ring-black/5 dark:ring-white/10 flex-1 overflow-y-auto custom-scrollbar">
          <h3 className="font-bold text-slate-900 dark:text-white mb-4">Ledger History</h3>
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-orange-500 animate-spin" /></div>
          ) : ledger.length === 0 ? (
            <p className="text-slate-400 text-sm">No ledger entries</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="pb-3 pr-4">Type</th><th className="pb-3 pr-4">Staff</th><th className="pb-3 pr-4">Description</th><th className="pb-3 text-right">Amount</th><th className="pb-3 text-right">Balance</th><th className="pb-3 text-right">Time</th>
                </tr></thead>
                <tbody className="divide-y divide-black/5 dark:divide-white/5">
                  {ledger.map((l: any) => (
                    <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                      <td className="py-3 pr-4"><div className="flex items-center gap-2">{entryTypeIcon(l.entry_type)}<span className="font-semibold capitalize">{l.entry_type.replace('_', ' ')}</span></div></td>
                      <td className="py-3 pr-4 text-slate-500">{l.staff_name || 'System'}</td>
                      <td className="py-3 pr-4 text-slate-500 max-w-[200px] truncate">{l.description}</td>
                      <td className={`py-3 text-right font-bold ${l.entry_type === 'payment' || l.entry_type === 'reversal' ? 'text-emerald-500' : 'text-red-500'}`}>{l.entry_type === 'payment' || l.entry_type === 'reversal' ? '+' : '-'}{formatUGX(l.amount_ugx)}</td>
                      <td className="py-3 text-right font-semibold text-slate-500">{formatUGX(l.balance_after_ugx)}</td>
                      <td className="py-3 text-right text-xs text-slate-400">{new Date(l.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {renderToast()}
        {showPaymentModal && renderPaymentModal()}
        {showAdjustModal && renderAdjustModal()}
        {showWriteOffModal && renderWriteOffModal()}
        {showCancelModal && renderCancelModal()}
      </div>
    );
  }

  return null;

  // ════════════════════════════════════════════════════════════════════════════
  // SHARED MODALS
  // ════════════════════════════════════════════════════════════════════════════
  function renderToast() {
    if (!toast) return null;
    return (
      <AnimatePresence>
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
          className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl font-semibold text-sm shadow-lg ${
            toast.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400' : 'bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-400'
          }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {toast.msg}
        </motion.div>
      </AnimatePresence>
    );
  }

  function renderCreateModal() {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white dark:bg-[#121214] rounded-[2.5rem] p-8 max-w-md w-full border border-black/10 dark:border-white/10 shadow-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">New Credit Profile</h3>
            <button onClick={() => setShowCreateModal(false)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5"><X className="w-5 h-5 text-slate-400" /></button>
          </div>
          <div className="space-y-3">
            <div><label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Customer Name *</label><input type="text" value={createForm.fullName} onChange={e => setCreateForm(f => ({ ...f, fullName: e.target.value }))} className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white" placeholder="John Doe" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Phone</label><input type="tel" value={createForm.phone} onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))} className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white" placeholder="+256..." /></div>
              <div><label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Email</label><input type="email" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white" placeholder="john@email.com" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Credit Limit (UGX)</label><input type="number" value={createForm.creditLimitUgx} onChange={e => setCreateForm(f => ({ ...f, creditLimitUgx: e.target.value }))} className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white" placeholder="500000" /></div>
              <div><label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Due Date</label><input type="date" value={createForm.dueDate} onChange={e => setCreateForm(f => ({ ...f, dueDate: e.target.value }))} className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white" /></div>
            </div>
            <div><label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Notes</label><textarea value={createForm.notes} onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))} className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white" rows={2} placeholder="Optional notes..." /></div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setShowCreateModal(false)} className="flex-1 py-3 rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 font-bold text-sm">Cancel</button>
            <button onClick={handleCreate} disabled={actionLoading || !createForm.fullName.trim()} className="flex-1 py-3 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm disabled:opacity-50 transition-all">
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Create Profile'}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  function renderPaymentModal() {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white dark:bg-[#121214] rounded-[2.5rem] p-8 max-w-md w-full border border-black/10 dark:border-white/10 shadow-2xl space-y-4">
          <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Record Payment</h3>
          <p className="text-sm text-slate-500">Outstanding: <span className="font-bold text-red-500">{formatUGX(selectedProfile?.current_balance_ugx || 0)}</span></p>
          <div><label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Payment Amount (UGX) *</label><input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white" placeholder="100000" /></div>
          <div><label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Description</label><input type="text" value={paymentDesc} onChange={e => setPaymentDesc(e.target.value)} className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white" placeholder="Optional" /></div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setShowPaymentModal(false)} className="flex-1 py-3 rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 font-bold text-sm">Cancel</button>
            <button onClick={handlePayment} disabled={actionLoading || !paymentAmount || Number(paymentAmount) <= 0} className="flex-1 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm disabled:opacity-50 transition-all">
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Record Payment'}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  function renderAdjustModal() {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white dark:bg-[#121214] rounded-[2.5rem] p-8 max-w-md w-full border border-black/10 dark:border-white/10 shadow-2xl space-y-4">
          <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Adjust Credit</h3>
          <p className="text-xs text-slate-500">Use positive values to increase balance, negative to decrease.</p>
          <div><label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Amount (UGX) *</label><input type="number" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white" placeholder="-50000 or 50000" /></div>
          <div><label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Reason *</label><input type="text" value={adjustReason} onChange={e => setAdjustReason(e.target.value)} className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white" placeholder="Why this adjustment?" /></div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setShowAdjustModal(false)} className="flex-1 py-3 rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 font-bold text-sm">Cancel</button>
            <button onClick={handleAdjust} disabled={actionLoading || !adjustAmount || !adjustReason.trim()} className="flex-1 py-3 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white font-bold text-sm disabled:opacity-50 transition-all">
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Apply Adjustment'}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  function renderWriteOffModal() {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white dark:bg-[#121214] rounded-[2.5rem] p-8 max-w-md w-full border border-black/10 dark:border-white/10 shadow-2xl space-y-4">
          <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Write Off Credit</h3>
          <p className="text-sm text-slate-500">This will set the balance to zero and mark as written off. Outstanding: <span className="font-bold text-red-500">{formatUGX(selectedProfile?.current_balance_ugx || 0)}</span></p>
          <div><label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Reason *</label><input type="text" value={writeOffReason} onChange={e => setWriteOffReason(e.target.value)} className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white" placeholder="Why write off this credit?" /></div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setShowWriteOffModal(false)} className="flex-1 py-3 rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 font-bold text-sm">Cancel</button>
            <button onClick={handleWriteOff} disabled={actionLoading || !writeOffReason.trim()} className="flex-1 py-3 rounded-2xl bg-purple-500 hover:bg-purple-600 text-white font-bold text-sm disabled:opacity-50 transition-all">
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Write Off'}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  function renderCancelModal() {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white dark:bg-[#121214] rounded-[2.5rem] p-8 max-w-md w-full border border-black/10 dark:border-white/10 shadow-2xl space-y-4">
          <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Cancel Credit</h3>
          <p className="text-sm text-slate-500">This will permanently cancel this credit profile. This action cannot be undone.</p>
          <div><label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Reason *</label><input type="text" value={cancelReason} onChange={e => setCancelReason(e.target.value)} className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white" placeholder="Why cancel?" /></div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setShowCancelModal(false)} className="flex-1 py-3 rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 font-bold text-sm">Cancel</button>
            <button onClick={handleCancel} disabled={actionLoading || !cancelReason.trim()} className="flex-1 py-3 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-bold text-sm disabled:opacity-50 transition-all">
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Cancel Credit'}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }
}
