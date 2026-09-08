'use client';

import { useEffect, useMemo, useState } from 'react';
import { Banknote, CalendarDays, ChevronDown, Clock3, CreditCard, Smartphone, Users } from 'lucide-react';
import { dataStore } from '@/lib/dataStore';
import '@/lib/dataStore-hardening';
import { formatUGX } from '@/lib/mockData';

const CREDIT_METHODS = new Set(['Corporate Credit', 'corporate credit', 'Personal Credit', 'personal credit', 'corporate_credit', 'personal_credit']);

export default function ManagerCashierShifts({ activeStaff }: { activeStaff?: any }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [type, setType] = useState('All');
  const [, forceRefresh] = useState(0);

  useEffect(() => {
    const unsub = dataStore.subscribe(() => forceRefresh(v => v + 1));
    return () => unsub();
  }, []);

  const rows = useMemo(() => {
    const start = new Date(`${date}T00:00:00`).getTime();
    const end = new Date(`${date}T23:59:59.999`).getTime();
    const branchId = activeStaff?.assignedBranchId;
    const orders = dataStore.getOrders(branchId, start, end);
    const audits = dataStore.getAuditLogs(branchId).filter((a:any) => {
      const ts = Number(a.timestamp || 0);
      return ts >= start && ts <= end && (a.action === 'order.pay' || a.action === 'order.split_payment');
    });
    const staff = dataStore.getStaff(branchId).filter((s:any) => ['Cashier', 'Senior Waiter'].includes(s.role));
    const byCashier = new Map<string, any>();

    for (const audit of audits) {
      const details = audit.details || {};
      const orderId = details.orderId;
      const order = orders.find((o:any) => o.id === orderId);
      if (!order) continue;
      const method = details.method || (audit.action === 'order.split_payment' ? 'Split' : order.paymentMethod || 'Cash');
      if (type !== 'All' && method !== type) continue;
      const cashierId = audit.userId || audit.userEmail || 'unknown';
      const cashier = staff.find((s:any) => s.id === audit.userId) || { id: cashierId, name: audit.userName || audit.userEmail || 'Unknown cashier', email: audit.userEmail };
      const amount = Number(details.amount || details.totalPaid || order.paidAmount || 0);
      const isCredit = CREDIT_METHODS.has(method);
      const current = byCashier.get(cashierId) || { ...cashier, collected: 0, sales: 0, creditSales: 0, transactions: [], first: 0, last: 0 };
      current.sales += amount;
      if (isCredit) current.creditSales += amount; else current.collected += amount;
      const ts = Number(audit.timestamp || 0);
      current.first = current.first ? Math.min(current.first, ts) : ts;
      current.last = Math.max(current.last, ts);
      current.transactions.push({ id: order.id, amount, method, time: ts, table: order.table, type: order.type });
      byCashier.set(cashierId, current);
    }

    return Array.from(byCashier.values()).sort((a,b) => b.collected - a.collected);
  }, [date, type, activeStaff?.assignedBranchId, forceRefresh]);

  const totalCollected = rows.reduce((s,r)=>s+r.collected,0);
  const totalCredit = rows.reduce((s,r)=>s+r.creditSales,0);

  return (
    <section className="mt-8 bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl rounded-[2rem] border border-black/5 dark:border-white/10 shadow-xl overflow-hidden">
      <div className="p-6 border-b border-black/5 dark:border-white/10 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><Users className="w-5 h-5 text-orange-500" /><h2 className="text-xl font-black text-slate-900 dark:text-white">Cashier Shift Management</h2></div>
          <p className="text-xs text-slate-500 mt-1">Collected sales are attributed to the staff member who actually confirmed the payment.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 bg-slate-50 dark:bg-white/5 rounded-xl px-3 py-2"><CalendarDays className="w-4 h-4 text-slate-400" /><input type="date" value={date} onChange={e=>setDate(e.target.value)} className="bg-transparent outline-none text-xs font-bold text-slate-700 dark:text-slate-200" /></label>
          <label className="relative flex items-center gap-2 bg-slate-50 dark:bg-white/5 rounded-xl px-3 py-2"><CreditCard className="w-4 h-4 text-slate-400" /><select value={type} onChange={e=>setType(e.target.value)} className="appearance-none bg-transparent pr-5 outline-none text-xs font-bold text-slate-700 dark:text-slate-200"><option>All</option><option>Cash</option><option>MTN Mobile Money</option><option>Airtel Money</option><option>Credit Card</option><option>Bank Transfer</option><option>Corporate Credit</option><option>Personal Credit</option><option>Split</option></select><ChevronDown className="w-3 h-3 absolute right-2 text-slate-400 pointer-events-none" /></label>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 bg-slate-50/70 dark:bg-black/20">
        <div className="rounded-2xl bg-white dark:bg-white/5 p-4"><p className="text-[10px] uppercase font-black tracking-wider text-slate-400">Collected</p><p className="text-2xl font-black text-green-500 mt-1">{formatUGX(totalCollected)}</p></div>
        <div className="rounded-2xl bg-white dark:bg-white/5 p-4"><p className="text-[10px] uppercase font-black tracking-wider text-slate-400">Credit Sales</p><p className="text-2xl font-black text-purple-500 mt-1">{formatUGX(totalCredit)}</p></div>
        <div className="rounded-2xl bg-white dark:bg-white/5 p-4"><p className="text-[10px] uppercase font-black tracking-wider text-slate-400">Active Cashiers</p><p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{rows.length}</p></div>
      </div>
      <div className="p-6 space-y-3">
        {rows.length === 0 ? <div className="py-10 text-center text-sm font-semibold text-slate-400">No confirmed cashier transactions for this date/filter.</div> : rows.map(row => (
          <details key={row.id} className="group rounded-2xl border border-black/5 dark:border-white/10 bg-white dark:bg-white/[0.03] overflow-hidden">
            <summary className="list-none cursor-pointer p-4 flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
              <div className="flex items-center gap-3 min-w-0"><div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center font-black">{String(row.name||'C').slice(0,1).toUpperCase()}</div><div className="min-w-0"><p className="font-black text-sm text-slate-900 dark:text-white truncate">{row.name}</p><p className="text-[10px] text-slate-400 truncate">{row.email || 'Cashier account'}</p></div></div>
              <div className="grid grid-cols-3 gap-6 text-right"><div><p className="text-[9px] uppercase font-black text-slate-400">Collected</p><p className="text-sm font-black text-green-500">{formatUGX(row.collected)}</p></div><div><p className="text-[9px] uppercase font-black text-slate-400">Sales</p><p className="text-sm font-black text-slate-900 dark:text-white">{formatUGX(row.sales)}</p></div><div><p className="text-[9px] uppercase font-black text-slate-400">Shift</p><p className="text-[10px] font-bold text-slate-500 flex items-center justify-end gap-1"><Clock3 className="w-3 h-3" />{row.first ? new Date(row.first).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—'} – {row.last ? new Date(row.last).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—'}</p></div></div>
            </summary>
            <div className="border-t border-black/5 dark:border-white/10 p-4 space-y-2 bg-slate-50/60 dark:bg-black/20">{row.transactions.map((t:any,i:number)=><div key={`${t.id}-${i}`} className="flex items-center justify-between text-xs"><div className="flex items-center gap-2"><Banknote className="w-3.5 h-3.5 text-slate-400" /><span className="font-bold text-slate-700 dark:text-slate-200">#{t.id.slice(-6).toUpperCase()} • Table {t.table || '—'}</span><span className="text-slate-400">{t.method}</span></div><div className="text-right"><span className="font-black text-slate-900 dark:text-white">{formatUGX(t.amount)}</span><span className="ml-2 text-[10px] text-slate-400">{new Date(t.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span></div></div>)}</div>
          </details>
        ))}
      </div>
    </section>
  );
}
