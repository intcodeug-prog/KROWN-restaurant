'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';

import { ChefHat, CheckCircle, Clock, ChevronLeft, Printer, LogOut } from 'lucide-react';
import { vibrate } from '@/lib/utils';
import { useNotification } from '@/hooks/use-notification';
import { printTicket } from '@/lib/printer';
import { dataStore } from '@/lib/dataStore';

export default function KitchenPage({ setView, activeStaff }: { setView: (v: 'pos' | 'admin' | 'manager' | 'kitchen' | 'cashier') => void; activeStaff?: any }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [completedTodayCount, setCompletedTodayCount] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const { notify } = useNotification();
  const autoPrinted = useRef(new Set());

  const role = activeStaff?.role || 'Head Chef';
  const isSuperAdmin = role === 'Super Admin' || role === 'Branch Manager';
  const activeBranchId = activeStaff?.assignedBranchId;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Clear auto-print tracking when branch changes
    autoPrinted.current.clear();
    const printedRef = autoPrinted.current;

    const syncOrders = () => {
      const twentyFourHoursAgoMs = Date.now() - 24 * 60 * 60 * 1000;
      const live = dataStore.getOrders(activeBranchId, twentyFourHoursAgoMs).filter(o => o.status === 'pending' || o.status === 'preparing');
      setOrders(live);

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const allToday = dataStore.getOrders(activeBranchId, startOfToday.getTime());
      setCompletedTodayCount(allToday.filter(o => o.status === 'completed' || o.status === 'ready').length);

      const fresh = live.filter(o => !printedRef.has(o.id));
      fresh.forEach(o => {
        printedRef.add(o.id);
        printTicket('prep', o);
      });
      if (fresh.length > 0) notify('new-order');
    };

    syncOrders();
    const unsub = dataStore.subscribe(syncOrders);
    return () => {
      unsub();
      printedRef.clear();
    };
    // notify is a stable hook reference, printTicket is module-level
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchId]);

  const updateOrderStatus = async (order: any, newStatus: any) => {
    vibrate(40);
    await dataStore.updateOrderStatus(order.id, newStatus);
  };

  return (
    <div className="min-h-screen bg-[#F4F4F6] dark:bg-[#0A0A0C] p-4 sm:p-6 lg:p-8 font-sans">
      <header className="flex items-center justify-between mb-6 sm:mb-8">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => { vibrate(30); setView('pos'); }}
            className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white/80 dark:bg-white/5 shadow-sm border border-black/5 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors backdrop-blur-xl"
            title="Return to POS / Switch View"
          >
            <ChevronLeft className="w-6 h-6 text-slate-600 dark:text-slate-300" />
          </button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
              <ChefHat className="w-8 h-8 text-orange-500" /> Kitchen Display System
            </h1>
            <p className="text-slate-500 font-medium">Live Order Monitoring • {activeStaff?.name || 'Head Chef'}</p>
          </div>
        </div>
        <button
          onClick={() => { localStorage.removeItem('krown_session_token'); localStorage.removeItem('krown_staff_profile'); sessionStorage.removeItem('krown_active_session'); fetch('/api/auth/logout', { method: 'POST' }).catch(() => {}); window.location.href = '/'; }}
          className="p-3 rounded-2xl bg-white/80 dark:bg-white/5 shadow-sm border border-black/5 dark:border-white/10 hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition-colors backdrop-blur-xl"
          title="Sign Out"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      <div className="flex gap-4 mb-6">
        <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-black/5 dark:border-white/10 rounded-2xl px-5 py-3 flex items-center gap-3 shadow-sm">
          <div className="w-8 h-8 bg-green-500/10 text-green-500 rounded-xl flex items-center justify-center">
            <CheckCircle className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Prepared Today</p>
            <p className="text-lg font-black text-slate-900 dark:text-white">{completedTodayCount} <span className="text-xs font-bold text-slate-400">meals</span></p>
          </div>
        </div>
        <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-black/5 dark:border-white/10 rounded-2xl px-5 py-3 flex items-center gap-3 shadow-sm">
          <div className="w-8 h-8 bg-orange-500/10 text-orange-500 rounded-xl flex items-center justify-center">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pending</p>
            <p className="text-lg font-black text-orange-500">{orders.length} <span className="text-xs font-bold text-slate-400">orders</span></p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-start">
        <AnimatePresence>
          {orders.map(order => (
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              key={order.id}
              className={`flex flex-col bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border ${
                order.status === 'preparing' ? 'border-yellow-500/50 shadow-yellow-500/10' : 
                order.status === 'pending' ? 'border-orange-500/50 shadow-orange-500/10' : 
                'border-white/40 dark:border-white/5 shadow-black/5'
              } shadow-2xl rounded-[2rem] p-6 ring-1 ring-black/5 dark:ring-white/10`}
            >
              <div className="flex justify-between items-start mb-4 border-b border-slate-100 dark:border-white/10 pb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">#{order.id.slice(-5).toUpperCase()}</h3>
                    <span className={`px-2 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider ${
                      order.status === 'preparing' ? 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400' : 'bg-orange-500/20 text-orange-600 dark:text-orange-400'
                    }`}>
                      {order.status}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-orange-500">
                    📍 {order.place || 'Main Dining'} • {order.table} • {order.seat || 'Table'}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300">{order.type}</p>
                    {order.type === 'Takeaway' && (
                      <span className="bg-blue-500/20 text-blue-600 dark:text-blue-400 font-extrabold text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">
                        🛍️ Takeaway Order
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-orange-500 bg-orange-500/10 px-3 py-1 rounded-full">
                    <Clock className="w-3.5 h-3.5" />
                    Elapsed: {Math.floor((now - order.createdAt) / 60000)}m
                  </div>
                  <div className="text-[10px] font-semibold text-slate-400">
                    Est Prep: ~{order.prepEstimatedMinutes || 15} mins
                  </div>
                </div>
              </div>
              
              <div className="flex-1 space-y-3 mb-6 overflow-y-auto custom-scrollbar pr-2 min-h-0">
                {order.items?.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-start border-b border-slate-100 dark:border-white/5 pb-2">
                    <div className="flex gap-3">
                      <span className="font-bold text-orange-500 text-base">{item.quantity}x</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-900 dark:text-white text-sm">{item.name}</p>
                          {item.requiresKitchen === false && (
                            <span className="text-[9px] font-bold bg-slate-100 dark:bg-white/10 text-slate-500 px-1.5 py-0.5 rounded">
                              🥤 Pre-Packaged
                            </span>
                          )}
                        </div>
                        {item.note && <p className="text-xs text-slate-500 italic">Note: {item.note}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-auto pt-4 flex gap-2">
                <button
                  onClick={() => printTicket('prep', order)}
                  title="Print Kitchen Ticket"
                  className="p-3 bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-200 dark:hover:bg-white/20 transition-colors"
                >
                  <Printer className="w-5 h-5" />
                </button>
                {order.status === 'pending' ? (
                  <button
                    onClick={() => updateOrderStatus(order, 'preparing')}
                    className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-yellow-500/30 transition-all active:scale-[0.98]"
                  >
                    Start Preparing (~{order.prepEstimatedMinutes || 15}m)
                  </button>
                ) : (
                  <button
                    onClick={() => updateOrderStatus(order, 'ready')}
                    className="flex-1 bg-green-500 hover:bg-green-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-green-500/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-5 h-5" /> Mark Ready & Deliver
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {orders.length === 0 && (
          <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-400 opacity-60">
            <ChefHat className="w-20 h-20 mb-4" />
            <h2 className="text-2xl font-bold">No active orders</h2>
            <p className="font-medium">Kitchen is caught up!</p>
          </div>
        )}
      </div>
    </div>
  );
}
