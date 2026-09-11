'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, LogOut, RefreshCw, Search, Store, X } from 'lucide-react';
import { api } from '@/lib/neon-client';
import { formatUGX } from '@/lib/mockData';
import { vibrate } from '@/lib/utils';

type Props = { setView: (v: 'pos' | 'admin' | 'manager' | 'kitchen' | 'cashier') => void; activeStaff?: any };

function normalizeOrder(r: any) {
  return { ...r, table: r.table ?? r.table_number ?? '', paymentStatus: r.paymentStatus ?? r.payment_status ?? 'unpaid', paidAmount: Number(r.paidAmount ?? r.paid_amount ?? 0), total: Number(r.total ?? 0), createdAt: typeof r.createdAt === 'number' ? r.createdAt : new Date(r.createdAt ?? r.created_at).getTime(), restaurantId: r.restaurantId ?? r.restaurant_id, branchName: r.branchName ?? r.branch_name, items: Array.isArray(r.items) ? r.items : [] };
}

export default function CashierDashboard({ setView, activeStaff }: Props) {
  const [orders, setOrders] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState(activeStaff?.assignedBranchId || '');
  const [summary, setSummary] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [cashReceived, setCashReceived] = useState('');
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (activeStaff?.assignedBranchId && activeStaff.assignedBranchId !== selectedBranchId) setSelectedBranchId(activeStaff.assignedBranchId); }, [activeStaff?.assignedBranchId]);

  const loadToday = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const now = new Date(); const start = new Date(now); start.setHours(0,0,0,0); const end = new Date(now); end.setHours(23,59,59,999);
      const branchId = selectedBranchId || activeStaff?.assignedBranchId || undefined;
      if (!branchId) throw new Error('No branch is assigned to this account.');
      const [ordersRes, branchesRes, summaryRes] = await Promise.all([
        api.orders.list(branchId, start.getTime(), end.getTime(), 500),
        api.branches.list(),
        fetch(`/api/cashier/daily-summary?branchId=${encodeURIComponent(branchId)}`, { headers: { Authorization: `Bearer ${localStorage.getItem('krown_session_token') || ''}` }, cache: 'no-store' }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Unable to load daily collection'); return j; }),
      ]);
      setOrders((ordersRes?.data || ordersRes || []).map(normalizeOrder));
      setBranches(branchesRes?.data || branchesRes || []);
      setSummary(summaryRes?.data || null);
      setLastUpdated(Date.now());
    } catch (e: any) { console.error('[KROWN] Cashier daily totals load failed:', e); setError(e?.message || 'Unable to load today\'s sales.'); }
    finally { setLoading(false); }
  }, [activeStaff?.assignedBranchId, selectedBranchId]);

  useEffect(() => { loadToday(); const timer = window.setInterval(loadToday, 10000); const onAuthenticated = () => loadToday(); window.addEventListener('krown-authenticated', onAuthenticated); return () => { window.clearInterval(timer); window.removeEventListener('krown-authenticated', onAuthenticated); }; }, [loadToday]);

  const isPaid = (o: any) => o.paymentStatus === 'paid' || o.status === 'completed';
  const isPartial = (o: any) => o.paymentStatus === 'partial' || o.paymentStatus === 'partially_paid';
  const totalCollectedToday = Number(summary?.collected ?? orders.reduce((sum, order) => { if (!isPaid(order) && !isPartial(order)) return sum; const paid = Number(order.paidAmount || 0); return sum + (paid > 0 ? paid : isPaid(order) ? Number(order.total || 0) : 0); }, 0));
  const totalPlatesToday = Number(summary?.plates ?? orders.reduce((sum, order) => isPaid(order) ? sum + order.items.reduce((n: number, item: any) => n + (Number(item.quantity) || 0), 0) : sum, 0));
  const openOrders = Number(summary?.openOrders ?? orders.filter(o => !isPaid(o) && !isPartial(o)).length);
  const filtered = useMemo(() => { const q = search.trim().toLowerCase(); if (!q) return orders; return orders.filter(o => [o.id,o.table,o.seat,o.place,o.companyName].some(v => String(v || '').toLowerCase().includes(q))); }, [orders, search]);

  const collectPayment = async () => {
    if (!selectedOrder) return; const due = Math.max(0, Number(selectedOrder.total || 0) - Number(selectedOrder.paidAmount || 0)); const received = paymentMethod === 'Cash' ? Number(cashReceived) : due;
    if (!Number.isFinite(received) || received < due) { setError(`Payment must be at least ${formatUGX(due)}.`); return; }
    setPaying(true); setError('');
    try { const result = await api.orders.pay(selectedOrder.id, { method: paymentMethod, amount: due }); const updated = normalizeOrder(result?.data || result); setSelectedOrder(null); setCashReceived(''); vibrate([30,60,30]); await loadToday(); if (updated) setOrders(prev => prev.map(o => o.id === updated.id ? updated : o)); }
    catch (e: any) { setError(e?.message || 'Payment could not be completed.'); } finally { setPaying(false); }
  };

  const branchName = branches.find(b => b.id === selectedBranchId)?.name || activeStaff?.branch || 'Assigned Branch';
  return (
    <div className="min-h-screen bg-[#F4F4F6] dark:bg-[#0A0A0C] text-slate-900 dark:text-white p-4 md:p-8"><div className="max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-7"><div><div className="flex items-center gap-2 text-orange-500 font-bold text-xs uppercase tracking-wider"><Store className="w-4 h-4" /> {branchName}</div><h1 className="text-3xl md:text-4xl font-black tracking-tight mt-1">Cashier</h1><p className="text-sm text-slate-500 mt-1">Live daily collections and payment settlement.</p></div><div className="flex gap-2"><button onClick={loadToday} disabled={loading} className="px-4 py-3 rounded-2xl bg-white dark:bg-[#151518] border border-black/5 dark:border-white/10 font-bold text-sm flex items-center gap-2 shadow-sm"><RefreshCw className={`w-4 h-4 ${loading?'animate-spin':''}`} /> Refresh</button><button onClick={() => { localStorage.removeItem('krown_session_token'); localStorage.removeItem('krown_staff_profile'); sessionStorage.removeItem('krown_active_session'); fetch('/api/auth/logout',{method:'POST'}).catch(()=>{}); window.location.href='/'; }} className="px-4 py-3 rounded-2xl bg-red-500/10 text-red-500 font-bold text-sm flex items-center gap-2"><LogOut className="w-4 h-4" /> Sign out</button></div></header>
      {error && <div className="mb-5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 px-4 py-3 flex items-center justify-between"><span className="text-sm font-semibold">{error}</span><button onClick={()=>setError('')}><X className="w-4 h-4" /></button></div>}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-7"><div className="rounded-[2rem] bg-white/90 dark:bg-[#151518] border border-black/5 dark:border-white/10 p-6 shadow-xl"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Collected Today</p><p className="text-3xl md:text-4xl font-black text-green-500 mt-2">{loading && !summary ? 'Loading…' : formatUGX(totalCollectedToday)}</p><p className="text-xs text-slate-400 mt-2">Authoritative paid collections for this branch</p></div><div className="rounded-[2rem] bg-white/90 dark:bg-[#151518] border border-black/5 dark:border-white/10 p-6 shadow-xl"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Plates Sold Today</p><p className="text-3xl md:text-4xl font-black text-orange-500 mt-2">{totalPlatesToday.toLocaleString()}</p><p className="text-xs text-slate-400 mt-2">Settled orders</p></div><div className="rounded-[2rem] bg-white/90 dark:bg-[#151518] border border-black/5 dark:border-white/10 p-6 shadow-xl"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Open Orders</p><p className="text-3xl md:text-4xl font-black mt-2">{openOrders.toLocaleString()}</p><p className="text-xs text-slate-400 mt-2">Awaiting settlement</p></div></section>
      <div className="flex flex-col md:flex-row gap-3 mb-5"><div className="relative flex-1"><Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" /><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search order, table, seat or company" className="w-full bg-white dark:bg-[#151518] border border-black/5 dark:border-white/10 rounded-2xl py-4 pl-12 pr-4 outline-none font-medium" /></div><div className="px-4 py-3 rounded-2xl bg-white dark:bg-[#151518] border border-black/5 dark:border-white/10 text-xs font-bold text-slate-500 flex items-center">{lastUpdated?`Updated ${new Date(lastUpdated).toLocaleTimeString()}`:'Loading live data…'}</div></div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">{filtered.map(order=>{const paid=isPaid(order),partial=isPartial(order);return <button key={order.id} onClick={()=>!paid&&setSelectedOrder(order)} className={`text-left rounded-[2rem] bg-white/90 dark:bg-[#151518] border p-5 shadow-lg transition-transform hover:scale-[1.01] ${paid?'border-green-500/20':partial?'border-yellow-500/30':'border-orange-500/30'}`}><div className="flex justify-between gap-3"><div><p className="font-black text-lg">#{String(order.id).slice(-6).toUpperCase()}</p><p className="text-xs text-orange-500 font-bold mt-1">Table {order.table||'—'} {order.seat?`• ${order.seat}`:''}</p></div><span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full h-fit ${paid?'bg-green-500/10 text-green-600':partial?'bg-yellow-500/10 text-yellow-600':'bg-orange-500/10 text-orange-600'}`}>{paid?'Paid':partial?'Partial':'Unpaid'}</span></div><div className="mt-5 flex justify-between items-end"><span className="text-2xl font-black">{formatUGX(order.total)}</span><span className="text-xs text-slate-400">{new Date(order.createdAt).toLocaleTimeString()}</span></div></button>})}{!loading&&filtered.length===0&&<div className="col-span-full rounded-[2rem] bg-white dark:bg-[#151518] p-10 text-center text-slate-400 font-semibold">No orders found for today.</div>}</div>
      {selectedOrder&&<div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-4" onClick={()=>!paying&&setSelectedOrder(null)}><div className="w-full max-w-md rounded-[2rem] bg-white dark:bg-[#151518] p-6 shadow-2xl" onClick={e=>e.stopPropagation()}><div className="flex justify-between items-start"><div><p className="text-xs text-slate-400 font-bold uppercase">Collect payment</p><h2 className="text-2xl font-black mt-1">{formatUGX(Math.max(0,selectedOrder.total-selectedOrder.paidAmount))}</h2></div><button onClick={()=>setSelectedOrder(null)} className="p-2 rounded-xl bg-slate-100 dark:bg-white/10"><X className="w-5 h-5"/></button></div><div className="grid grid-cols-2 gap-2 mt-6">{['Cash','MTN Mobile Money','Airtel Money','Credit Card'].map(method=><button key={method} onClick={()=>setPaymentMethod(method)} className={`p-3 rounded-xl text-xs font-bold border ${paymentMethod===method?'border-orange-500 bg-orange-500/10 text-orange-500':'border-black/5 dark:border-white/10'}`}>{method}</button>)}</div>{paymentMethod==='Cash'&&<input value={cashReceived} onChange={e=>setCashReceived(e.target.value)} inputMode="numeric" placeholder="Cash received" className="w-full mt-4 p-4 rounded-xl bg-slate-100 dark:bg-white/5 outline-none font-bold"/>}<button disabled={paying} onClick={collectPayment} className="w-full mt-5 p-4 rounded-2xl bg-orange-500 text-white font-black flex items-center justify-center gap-2 disabled:opacity-50">{paying?'Processing…':'Complete Payment'}</button></div></div>}
    </div></div>
  );
}
