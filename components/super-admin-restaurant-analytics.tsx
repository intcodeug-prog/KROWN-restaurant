'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, CalendarDays, TrendingUp, ShoppingBag, WalletCards, RefreshCw, ArrowUpRight } from 'lucide-react';

function money(value: number) {
  return new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function localDateInput(d: Date) {
  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfToday() { const d = new Date(); d.setHours(0,0,0,0); return d; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

export default function SuperAdminRestaurantAnalytics() {
  const [open, setOpen] = useState(false);
  const [restaurant, setRestaurant] = useState<any>(null);
  const [from, setFrom] = useState(localDateInput(startOfToday()));
  const [to, setTo] = useState(localDateInput(startOfToday()));
  const [period, setPeriod] = useState<'day'|'week'|'month'|'year'|'custom'>('day');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const openFor = async (org: any) => {
    setRestaurant(org); setOpen(true); setError('');
    const today = startOfToday();
    let a = today; let b = addDays(today, 1);
    if (period === 'week') { a = addDays(today, -6); b = addDays(today, 1); }
    if (period === 'month') { a = new Date(today.getFullYear(), today.getMonth(), 1); b = addDays(today, 1); }
    if (period === 'year') { a = new Date(today.getFullYear(), 0, 1); b = addDays(today, 1); }
    if (period === 'custom') { a = new Date(`${from}T00:00:00`); b = addDays(new Date(`${to}T00:00:00`), 1); }
    await load(org.id, a, b);
  };

  const load = async (orgId: string, a: Date, b: Date) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('krown_session_token') || '';
      const qs = new URLSearchParams({ organizationId: orgId, from: a.toISOString(), to: b.toISOString() });
      const res = await fetch(`/api/super-admin/restaurant-analytics?${qs.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Unable to load restaurant analytics');
      setData(json.data);
    } catch (e: any) { setError(e.message || 'Unable to load analytics'); setData(null); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const onClick = async (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest('button[title="View Details"]') as HTMLButtonElement | null;
      if (!button) return;
      const row = button.closest('tr');
      const name = row?.querySelector('td:first-child p.font-bold')?.textContent?.trim();
      if (!name) return;
      try {
        const token = localStorage.getItem('krown_session_token') || '';
        const res = await fetch('/api/super-admin/orgs', { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json();
        const org = (json.data || []).find((x: any) => x.name === name);
        if (org) openFor(org);
      } catch { /* existing details panel remains available */ }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [period, from, to]);

  const chart = useMemo(() => data?.timeline || [], [data]);
  if (!open) return null;

  const refresh = () => {
    if (!restaurant) return;
    const a = new Date(`${from}T00:00:00`);
    const b = addDays(new Date(`${to}T00:00:00`), 1);
    load(restaurant.id, a, b);
  };

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md p-4 md:p-8 flex items-center justify-center" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
        <motion.div initial={{opacity:0, y:24, scale:.98}} animate={{opacity:1,y:0,scale:1}} className="w-full max-w-6xl max-h-[94vh] overflow-y-auto rounded-[2rem] bg-white dark:bg-[#0F1012] border border-black/10 dark:border-white/10 shadow-2xl">
          <div className="sticky top-0 z-10 p-6 md:p-8 bg-white/90 dark:bg-[#0F1012]/90 backdrop-blur-xl border-b border-black/5 dark:border-white/5 flex items-center justify-between gap-4">
            <div><p className="text-[10px] uppercase tracking-[.2em] font-bold text-orange-500">Restaurant performance</p><h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white mt-1">{restaurant?.name}</h2><p className="text-xs text-slate-500 mt-1">Live financial and sales intelligence</p></div>
            <button onClick={()=>setOpen(false)} className="p-3 rounded-2xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10"><X className="w-5 h-5"/></button>
          </div>
          <div className="p-6 md:p-8 space-y-6">
            <div className="flex flex-wrap gap-2">
              {(['day','week','month','year'] as const).map(p => <button key={p} onClick={()=>{setPeriod(p); const t=startOfToday(); let a=t; if(p==='week')a=addDays(t,-6); if(p==='month')a=new Date(t.getFullYear(),t.getMonth(),1); if(p==='year')a=new Date(t.getFullYear(),0,1); setFrom(localDateInput(a));setTo(localDateInput(t)); setTimeout(()=>load(restaurant.id,a,addDays(t,1)),0)}} className={`px-4 py-2.5 rounded-xl text-xs font-bold capitalize ${period===p?'bg-black text-white dark:bg-white dark:text-black':'bg-slate-100 dark:bg-white/5 text-slate-500'}`}>{p}</button>)}
              <button onClick={()=>setPeriod('custom')} className={`px-4 py-2.5 rounded-xl text-xs font-bold ${period==='custom'?'bg-black text-white dark:bg-white dark:text-black':'bg-slate-100 dark:bg-white/5 text-slate-500'}`}>Custom range</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-black/5 dark:border-white/5">
              <label className="text-xs font-bold text-slate-500">From<input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="mt-1 w-full rounded-xl p-3 bg-white dark:bg-black/20 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white"/></label>
              <label className="text-xs font-bold text-slate-500">To<input type="date" value={to} onChange={e=>setTo(e.target.value)} className="mt-1 w-full rounded-xl p-3 bg-white dark:bg-black/20 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white"/></label>
              <button onClick={refresh} disabled={loading} className="self-end h-11 px-5 rounded-xl bg-orange-500 text-white font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${loading?'animate-spin':''}`}/> Apply</button>
            </div>
            {error && <div className="p-4 rounded-2xl bg-red-500/10 text-red-600 text-sm font-semibold">{error}</div>}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                ['Total collected', money(data?.summary?.collected), WalletCards],
                ['Meals sold', Number(data?.summary?.meals || 0).toLocaleString(), ShoppingBag],
                ['Orders', Number(data?.summary?.orders || 0).toLocaleString(), TrendingUp],
              ].map(([label,value,Icon]: any)=><div key={label} className="rounded-[1.5rem] p-6 bg-slate-950 text-white shadow-xl"><Icon className="w-5 h-5 text-orange-400 mb-5"/><p className="text-[10px] uppercase tracking-widest text-white/50 font-bold">{label}</p><p className="text-2xl md:text-3xl font-extrabold mt-2">{loading?'…':value}</p></div>)}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-[1.5rem] p-6 bg-white dark:bg-white/5 border border-black/5 dark:border-white/10"><p className="text-sm font-bold">Sales summary</p><div className="mt-5 space-y-4 text-sm"><div className="flex justify-between"><span className="text-slate-500">Paid orders</span><b>{Number(data?.summary?.paidOrders||0).toLocaleString()}</b></div><div className="flex justify-between"><span className="text-slate-500">Outstanding orders</span><b>{Number(data?.summary?.unpaidOrders||0).toLocaleString()}</b></div><div className="flex justify-between"><span className="text-slate-500">Average order value</span><b>{money(data?.summary?.averageOrder||0)}</b></div></div></div>
              <div className="rounded-[1.5rem] p-6 bg-white dark:bg-white/5 border border-black/5 dark:border-white/10"><p className="text-sm font-bold">Selected period</p><div className="mt-5 flex items-center gap-3"><CalendarDays className="w-5 h-5 text-orange-500"/><div><p className="font-bold">{from} → {to}</p><p className="text-xs text-slate-500">All figures are calculated from the restaurant&apos;s recorded orders.</p></div></div></div>
            </div>
            <div className="rounded-[1.5rem] p-6 bg-white dark:bg-white/5 border border-black/5 dark:border-white/10"><div className="flex items-center justify-between"><div><p className="text-sm font-bold">Revenue & meals timeline</p><p className="text-xs text-slate-500">Daily breakdown for the selected range</p></div><ArrowUpRight className="w-5 h-5 text-orange-500"/></div><div className="mt-5 space-y-2">{chart.length===0&&!loading?<p className="py-10 text-center text-sm text-slate-400">No sales recorded for this period.</p>:chart.map((x:any)=><div key={x.date} className="grid grid-cols-[90px_1fr_auto_auto] gap-3 items-center text-xs"><span className="text-slate-500">{x.date}</span><div className="h-2 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden"><div className="h-full bg-orange-500 rounded-full" style={{width:`${Math.min(100,Math.max(2,(Number(x.revenue||0)/Math.max(1,...chart.map((c:any)=>Number(c.revenue||0))))*100))}%`}}/></div><b>{money(x.revenue)}</b><span className="text-slate-400">{Number(x.meals||0)} meals</span></div>)}</div></div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
