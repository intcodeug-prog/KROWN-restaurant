'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, Clock, ChevronRight, Printer, Download, Eye, Receipt, Building2,
  MapPin, X, CheckCircle2, DollarSign, Split, CreditCard, Banknote, Smartphone,
  Store, Shield, Filter, RefreshCw, ChevronLeft, ArrowRight, UserCheck, AlertCircle, Plus, LogOut
} from 'lucide-react';
import { formatUGX } from '@/lib/mockData';
import { printTicket, downloadReceiptFile, generateFormattedThermalReceipt } from '@/lib/printer';
import { dataStore } from '@/lib/dataStore';
import { vibrate } from '@/lib/utils';
import { useNotification } from '@/hooks/use-notification';
import { getPrinterConfig, setPrinterConfig, testNetworkPrinter, retryNetworkPrintJob } from '@/lib/printBridge';

export default function CashierDashboard({ setView, activeStaff }: { setView: (v: 'pos' | 'admin' | 'manager' | 'kitchen' | 'cashier') => void; activeStaff?: any }) {
  const [viewTab, setViewTab] = useState<'orders'>('orders');
  const [orders, setOrders] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(() => activeStaff?.assignedBranchId || '');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'partially_paid' | 'paid'>('all');
  
  // Active Selected Order for Payment / Details
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm'>('80mm');

  // Role check
  const role = activeStaff?.role || 'Cashier';
  const isSuperAdmin = role === 'Super Admin';
  const isManager = role === 'Branch Manager' || isSuperAdmin;
  const isKitchen = role === 'Head Chef' || role === 'Kitchen Staff' || isManager;

  // Payment Form State
  const [tinNumber, setTinNumber] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'MTN Mobile Money' | 'Airtel Money' | 'Credit Card' | 'Corporate Credit'>('MTN Mobile Money');
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  const [cashAmountReceived, setCashAmountReceived] = useState<string>('');
  const [printJobsList, setPrintJobsList] = useState<any[]>([]);
  const [printerStatus, setPrinterStatus] = useState<string>('UNKNOWN');
  const [printerStatusMsg, setPrinterStatusMsg] = useState<string>('');

  const refreshPrintJobs = () => {
    if (selectedOrder) {
      setPrintJobsList(dataStore.getPrintJobs(selectedOrder.id));
    } else {
      setPrintJobsList(dataStore.getPrintJobs());
    }
  };

  const checkPrinterHealth = async () => {
    try {
      const cfg = getPrinterConfig();
      if (!cfg.enabled || !cfg.kitchenIp) {
        setPrinterStatus('DISABLED');
        setPrinterStatusMsg('Printer bridge is disabled.');
        return;
      }
      setPrinterStatus('CHECKING');
      const res = await fetch(`http://${cfg.bridgeHost}:${cfg.bridgePort}/printers/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: cfg.kitchenIp, port: cfg.kitchenPort })
      });
      if (!res.ok) throw new Error('Agent unreachable');
      const data = await res.json();
      if (data.ok) {
        setPrinterStatus('CONNECTED');
        setPrinterStatusMsg('Printer is online.');
      } else {
        setPrinterStatus(data.status || 'UNREACHABLE');
        setPrinterStatusMsg(data.error || 'Connection timeout.');
      }
    } catch (e) {
      setPrinterStatus('AGENT_OFFLINE');
      setPrinterStatusMsg('Local print bridge is offline.');
    }
  };

  useEffect(() => {
    const t = setTimeout(() => {
      refreshPrintJobs();
      checkPrinterHealth();
    }, 0);
    const interval = setInterval(refreshPrintJobs, 3000);
    return () => {
      clearTimeout(t);
      clearInterval(interval);
    };
    // refreshPrintJobs and checkPrinterHealth are stable component-scoped functions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrder]);

  // ── ENTERPRISE SPLIT BILL STATE ─────────────────────────────────────────────
  interface GuestSplitRow {
    id: string;
    label: string;
    paymentMethod: 'Cash' | 'MTN Mobile Money' | 'Airtel Money' | 'Credit Card' | 'Corporate Credit';
    assigned: Record<number, number>; // order item index -> quantity
  }
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [guests, setGuests] = useState<GuestSplitRow[]>([]);
  const [splitBusy, setSplitBusy] = useState(false);
  const [splitResult, setSplitResult] = useState<{ guestLabel: string; amount: number; printed: boolean }[]>([]);

  // Printer Settings Modal State
  const [showPrinterSettings, setShowPrinterSettings] = useState(false);
  const [printerCfg, setPrinterCfg] = useState(() => getPrinterConfig());
  const [printerTestMsg, setPrinterTestMsg] = useState('');

  const { notify } = useNotification();

  // ── Split Bill Helpers ──────────────────────────────────────────────────────
  const unitPriceOf = (item: any) => {
    const addOnsTotal = (item.addOns || []).reduce((s: number, a: any) => s + (Number(a.price) || 0), 0);
    return (Number(item.price) || 0) + addOnsTotal;
  };

  const openSplitModal = (order: any) => {
    const firstGuest: GuestSplitRow = {
      id: `guest-${Date.now()}-1`,
      label: 'Guest 1',
      paymentMethod: 'Cash',
      assigned: {},
    };
    setGuests([firstGuest]);
    setSplitResult([]);
    setShowSplitModal(true);
  };

  const addSplitGuest = () => {
    setGuests(prev => [...prev, {
      id: `guest-${Date.now()}-${prev.length + 1}`,
      label: `Guest ${prev.length + 1}`,
      paymentMethod: 'Cash',
      assigned: {},
    }]);
  };

  const removeSplitGuest = (guestId: string) => {
    setGuests(prev => prev.length > 1 ? prev.filter(g => g.id !== guestId) : prev);
  };

  const assignedQtyForItem = (itemIdx: number) =>
    guests.reduce((sum, g) => sum + (g.assigned[itemIdx] || 0), 0);

  const remainingQtyForItem = (itemIdx: number) => {
    const orderItem = selectedOrder?.items?.[itemIdx];
    if (!orderItem) return 0;
    return Math.max(0, (Number(orderItem.quantity) || 0) - assignedQtyForItem(itemIdx));
  };

  const adjustGuestItem = (guestId: string, itemIdx: number, delta: number) => {
    setGuests(prev => prev.map(g => {
      if (g.id !== guestId) return g;
      const cur = g.assigned[itemIdx] || 0;
      if (delta > 0 && remainingQtyForItem(itemIdx) <= 0) return g;
      const next = Math.max(0, Math.min(cur + delta, (selectedOrder?.items?.[itemIdx]?.quantity || 0)));
      return { ...g, assigned: { ...g.assigned, [itemIdx]: next } };
    }));
  };

  const guestAmount = (g: GuestSplitRow) =>
    Object.entries(g.assigned).reduce((sum, [idx, qty]) => {
      const item = selectedOrder?.items?.[Number(idx)];
      if (!item || !qty) return sum;
      return sum + (unitPriceOf(item) * qty);
    }, 0);

  const totalRemaining = () => {
    if (!selectedOrder) return 0;
    let remaining = 0;
    selectedOrder.items?.forEach((item: any, idx: number) => {
      remaining += unitPriceOf(item) * remainingQtyForItem(idx);
    });
    return remaining;
  };

  // Process all guest payments: one split payment + receipt per guest
  const processSplitPayments = async () => {
    if (!selectedOrder) return;
    const payableGuests = guests.filter(g => guestAmount(g) > 0);
    if (payableGuests.length === 0) {
      alert('Assign at least one item to a guest before processing the split.');
      return;
    }

    setSplitBusy(true);
    try {
      const results: { guestLabel: string; amount: number; printed: boolean }[] = [];
      let splitIndex = (selectedOrder.splitPayments?.length || 0);
      const totalSplits = payableGuests.length + (totalRemaining() > 0 ? 1 : 0);

      for (const guest of payableGuests) {
        splitIndex += 1;
        const guestItems = Object.entries(guest.assigned)
          .filter(([, qty]) => (qty || 0) > 0)
          .map(([idx, qty]) => {
            const item = selectedOrder.items?.[Number(idx)];
            return {
              id: item?.id,
              name: item?.name || 'Item',
              price: unitPriceOf(item),
              quantity: qty,
              amount: Math.round(unitPriceOf(item) * qty),
            };
          });
        const amount = Math.round(guestItems.reduce((s, gi) => s + gi.amount, 0));

        const updated = await dataStore.addSplitPayment(selectedOrder.id, {
          amount,
          paymentMethod: guest.paymentMethod,
          splitIndex,
          totalSplits,
          seatCovered: selectedOrder.seat,
          guestLabel: guest.label,
          itemsCovered: guestItems.map(gi => gi.name),
          guestItems,
        });

        if (updated) {
          // Print this guest's personal receipt
          const printed = await printTicket('split', updated, printerCfg.paperWidth, {
            splitIndex,
            totalSplits,
            amount,
            paymentMethod: guest.paymentMethod,
            seatCovered: selectedOrder.seat,
            guestLabel: guest.label,
            guestItems,
          }).then(() => true).catch(() => false);
          results.push({ guestLabel: guest.label, amount, printed });
        }
      }

      setSplitResult(results);
      setSelectedOrder(dataStore.getOpenOrderById(selectedOrder.id) || dataStore.getOrders().find(o => o.id === selectedOrder.id) || null);
      vibrate([50, 100, 50]);
      notify('ready');
    } catch (e) {
      console.warn('Split payment error:', e);
    } finally {
      setSplitBusy(false);
    }
  };

  useEffect(() => {
    const syncData = () => {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const startOfTodayMs = startOfToday.getTime();
      const allOrders = dataStore.getOrders(selectedBranchId, startOfTodayMs);
      setOrders(allOrders);
      const allBranches = dataStore.getBranches();
      setBranches(allBranches);
      const c = dataStore.getCompanies();
      setCompanies(c);
      if (!selectedCompanyId && c[0]) setSelectedCompanyId(c[0].id);
    };

    syncData();
    const unsub = dataStore.subscribe(syncData);
    return () => unsub();
    // selectedCompanyId is read inside syncData for default selection only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId]);

  const availableCompanyStaff = dataStore.getCompanyStaff(selectedCompanyId);

  // Filter Orders by Lookup: Order Number, Table ID, Seat Number, or Company
  const filteredOrders = orders.filter(o => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || 
      (o.id || '').toLowerCase().includes(query) ||
      (o.table || '').toLowerCase().includes(query) ||
      (o.seat || '').toLowerCase().includes(query) ||
      (o.place || '').toLowerCase().includes(query) ||
      (o.companyName || '').toLowerCase().includes(query);

    const isPaid = o.paymentStatus === 'paid' || o.status === 'completed';
    const isPartiallyPaid = o.paymentStatus === 'partially_paid';
    const isUnpaid = !isPaid && !isPartiallyPaid;

    if (statusFilter === 'unpaid') return matchesSearch && isUnpaid;
    if (statusFilter === 'partially_paid') return matchesSearch && isPartiallyPaid;
    if (statusFilter === 'paid') return matchesSearch && isPaid;

    return matchesSearch;
  });

  const unpaidCount = orders.filter(o => o.paymentStatus !== 'paid' && o.status !== 'completed').length;
  const totalRevenueToday = orders
    .filter(o => o.paymentStatus === 'paid' || o.paymentStatus === 'partially_paid')
    .reduce((sum, o) => sum + (o.paidAmount || o.total || 0), 0);

  // Process Full Order Payment Settlement
  const handleCompleteFullPayment = async (order: any) => {
    if (!order) return;
    setIsProcessing(true);
    vibrate(30);

    try {
      const activeCompObj = companies.find(c => c.id === selectedCompanyId);
      const activeStaffObj = availableCompanyStaff.find(s => s.id === selectedStaffId);

      if (paymentMethod === 'Corporate Credit' && activeCompObj?.status === 'suspended') {
        alert(`Account On Hold: ${activeCompObj.name} is suspended. Cannot bill corporate credit.`);
        setIsProcessing(false);
        return;
      }

      const amountDue = order.total - (order.paidAmount || 0);
      let calculatedChange = 0;
      let calculatedReceived = amountDue;

      if (paymentMethod === 'Cash') {
        const received = Number(cashAmountReceived);
        if (!received || received < amountDue) {
          alert(`Invalid Cash Amount: Please enter cash amount equal to or greater than ${formatUGX(amountDue)}.`);
          setIsProcessing(false);
          return;
        }
        calculatedReceived = received;
        calculatedChange = received - amountDue;
      }

      const updated = await dataStore.payOrder(order.id, {
        paymentMethod,
        isCorporateCredit: paymentMethod === 'Corporate Credit',
        companyId: paymentMethod === 'Corporate Credit' ? selectedCompanyId : undefined,
        companyName: paymentMethod === 'Corporate Credit' ? activeCompObj?.name : undefined,
        companyStaffId: paymentMethod === 'Corporate Credit' ? selectedStaffId : undefined,
        companyStaffName: paymentMethod === 'Corporate Credit' ? activeStaffObj?.name : undefined,
        workId: paymentMethod === 'Corporate Credit' ? activeStaffObj?.workId : undefined,
        tinNumber: tinNumber.trim() || undefined,
        amountReceived: calculatedReceived,
        change: calculatedChange
      });

      if (updated) {
        // Auto-print thermal paid receipt for cashier & client
        printTicket('receipt', updated, paperWidth);
        setSelectedOrder(updated);
        setCashAmountReceived('');
      }
    } catch (e) {
      console.warn('Payment error:', e);
    } finally {
      setIsProcessing(false);
    }
  };

  // Test the configured network printer
  const handleTestPrinter = async () => {
    setPrinterTestMsg('Testing...');
    setPrinterCfg(setPrinterConfig(printerCfg));
    const ok = await testNetworkPrinter('receipt');
    setPrinterTestMsg(ok ? 'SUCCESS: printer responded via bridge.' : 'FAILED: bridge unreachable. Start tools/krown-print-bridge.mjs on the POS computer.');
  };

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-[#F4F4F6] dark:bg-[#0A0A0C] font-sans selection:bg-orange-500/30">
      {/* Mobile Top Header Bar */}
      <div className="md:hidden bg-white/90 dark:bg-[#121214]/90 backdrop-blur-2xl border-b border-black/5 dark:border-white/5 px-4 py-3 flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-orange-500 rounded-xl flex items-center justify-center shadow-md shadow-orange-500/30">
            <DollarSign className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-extrabold text-sm text-slate-900 dark:text-white leading-none">CASHIER POS</h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">{role}</p>
          </div>
        </div>

        <button
          onClick={() => { vibrate(20); setView('pos'); }}
          className="p-2 bg-slate-100 dark:bg-white/10 rounded-xl font-bold text-xs flex items-center gap-1 text-slate-700 dark:text-slate-200"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Exit POS</span>
        </button>
        <button
          onClick={() => { localStorage.removeItem('krown_session_token'); localStorage.removeItem('krown_staff_profile'); sessionStorage.removeItem('krown_active_session'); fetch('/api/auth/logout', { method: 'POST' }).catch(() => {}); window.location.href = '/'; }}
          className="p-2 bg-red-500/10 rounded-xl text-red-400 hover:text-red-600 transition-colors"
          title="Sign Out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* Desktop Sidebar Navigation */}
      <nav className="hidden md:flex w-20 lg:w-24 bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border-r border-black/5 dark:border-white/5 flex-col items-center py-8 z-10 shrink-0">
        <div className="w-12 h-12 bg-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/30 mb-8">
          <DollarSign className="w-6 h-6 text-white" />
        </div>

        <div className="flex flex-col gap-4 w-full px-4">
          <button
            onClick={() => { vibrate(20); setView('pos'); }}
            className="flex flex-col items-center justify-center gap-1.5 w-full py-3 rounded-2xl transition-all duration-300 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5"
          >
            <ChevronLeft className="w-5 h-5 stroke-[2]" />
            <span className="text-[10px] font-medium tracking-wide">POS</span>
          </button>

          <button
            onClick={() => { vibrate(20); setViewTab('orders'); }}
            className={`flex flex-col items-center justify-center gap-1.5 w-full py-3 rounded-2xl transition-all duration-300 ${
              viewTab === 'orders'
                ? 'text-orange-500 bg-orange-500/10'
                : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5'
            }`}
          >
            <DollarSign className="w-5 h-5 stroke-[2]" />
            <span className="text-[10px] font-bold tracking-wide">Cashier</span>
          </button>

          {isKitchen && (
            <button
              onClick={() => { vibrate(20); setView('kitchen'); }}
              className="flex flex-col items-center justify-center gap-1.5 w-full py-3 rounded-2xl transition-all duration-300 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5"
            >
              <Clock className="w-5 h-5 stroke-[2]" />
              <span className="text-[10px] font-medium tracking-wide">Kitchen</span>
            </button>
          )}

          {isManager && (
            <button
              onClick={() => { vibrate(20); setView('manager'); }}
              className="flex flex-col items-center justify-center gap-1.5 w-full py-3 rounded-2xl transition-all duration-300 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5"
            >
              <Store className="w-5 h-5 stroke-[2]" />
              <span className="text-[10px] font-medium tracking-wide">Manager</span>
            </button>
          )}

          <button
            onClick={() => { localStorage.removeItem('krown_session_token'); localStorage.removeItem('krown_staff_profile'); sessionStorage.removeItem('krown_active_session'); fetch('/api/auth/logout', { method: 'POST' }).catch(() => {}); window.location.href = '/'; }}
            className="flex flex-col items-center justify-center gap-1.5 w-full py-3 rounded-2xl transition-all duration-300 text-red-400 hover:text-red-600 hover:bg-red-500/5 dark:hover:text-red-400 dark:hover:bg-red-500/5"
          >
            <LogOut className="w-5 h-5 stroke-[2]" />
            <span className="text-[10px] font-medium tracking-wide">Sign Out</span>
          </button>
        </div>
      </nav>

      {/* Main Cashier Workspace */}
      <main className="flex-1 flex flex-col h-full min-w-0 p-6 lg:p-8 overflow-y-auto custom-scrollbar">
        {/* Top Header & Metrics Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
              <DollarSign className="w-8 h-8 text-orange-500" /> Cashier Dashboard & Payment Center
            </h1>
            <p className="text-slate-500 font-medium text-sm mt-1">
              Search orders by Order Number, Table ID, or Seat. Process split bills, settlements, and thermal receipts across branches.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-white dark:bg-[#121214] border border-black/5 dark:border-white/10 rounded-2xl px-4 py-2.5 flex items-center gap-2 shadow-sm">
              <Store className="w-4 h-4 text-orange-500" />
              <span className="font-bold text-xs text-slate-900 dark:text-white">
                {branches.find(b => b.id === selectedBranchId)?.name || 'Assigned Branch'}
              </span>
            </div>
            <button
              onClick={() => { vibrate(20); setShowPrinterSettings(true); }}
              className="bg-white dark:bg-[#121214] border border-black/5 dark:border-white/10 rounded-2xl px-4 py-2.5 flex items-center gap-2 shadow-sm hover:border-orange-500/40 transition-all"
              title="Ethernet thermal printer setup"
            >
              <Printer className="w-4 h-4 text-purple-500" />
              <span className="font-bold text-xs text-slate-900 dark:text-white">Printer Setup</span>
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
          <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl p-6 rounded-[2rem] border border-black/5 dark:border-white/10 shadow-xl flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Unpaid / Open Orders</p>
              <h3 className="text-3xl font-black text-slate-900 dark:text-white mt-1">{unpaidCount}</h3>
            </div>
            <div className="w-12 h-12 bg-orange-500/10 text-orange-500 rounded-2xl flex items-center justify-center font-bold">
              <Clock className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl p-6 rounded-[2rem] border border-black/5 dark:border-white/10 shadow-xl flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Collected Today</p>
              <h3 className="text-2xl font-black text-green-500 mt-1">{formatUGX(totalRevenueToday)}</h3>
            </div>
            <div className="w-12 h-12 bg-green-500/10 text-green-500 rounded-2xl flex items-center justify-center font-bold">
              <DollarSign className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl p-6 rounded-[2rem] border border-black/5 dark:border-white/10 shadow-xl flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Thermal Printer Status</p>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-1">Ready ({paperWidth})</h3>
            </div>
            <div className="w-12 h-12 bg-purple-500/10 text-purple-500 rounded-2xl flex items-center justify-center font-bold">
              <Printer className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Live Search & Filter Bar */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by Order # (e.g. ORD-8820), Table ID (e.g. T4), or Seat (e.g. Seat 1)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white dark:bg-[#121214] border border-black/5 dark:border-white/10 rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-orange-500 text-slate-900 dark:text-white text-sm font-medium shadow-sm"
            />
          </div>

          {/* Status Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
            {[
              { id: 'all', label: 'All Orders' },
              { id: 'unpaid', label: 'Unpaid / Pending' },
              { id: 'partially_paid', label: 'Partially Paid' },
              { id: 'paid', label: 'Completed / Paid' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => { vibrate(15); setStatusFilter(tab.id as any); }}
                className={`px-5 py-3.5 rounded-2xl font-bold text-xs whitespace-nowrap transition-all ${
                  statusFilter === tab.id
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-md'
                    : 'bg-white dark:bg-[#121214] text-slate-500 border border-black/5 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Orders Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {filteredOrders.map(order => {
              const isPaid = order.paymentStatus === 'paid' || order.status === 'completed';
              const isPartiallyPaid = order.paymentStatus === 'partially_paid';

              return (
                <motion.div
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  key={order.id}
                  onClick={() => { vibrate(20); setSelectedOrder(order); }}
                  className={`bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border ${
                    isPaid ? 'border-green-500/40 shadow-green-500/5' :
                    isPartiallyPaid ? 'border-yellow-500/50 shadow-yellow-500/5' :
                    'border-orange-500/40 shadow-orange-500/5'
                  } rounded-[2.5rem] p-6 shadow-xl cursor-pointer hover:scale-[1.01] transition-all flex flex-col justify-between group`}
                >
                  <div>
                    <div className="flex justify-between items-start mb-3 border-b border-black/5 dark:border-white/5 pb-3">
                      <div>
                        <h3 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                          #{order.id.slice(-5).toUpperCase()}
                          <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                            isPaid ? 'bg-green-500/20 text-green-600 dark:text-green-400' :
                            isPartiallyPaid ? 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400' :
                            'bg-orange-500/20 text-orange-600 dark:text-orange-400'
                          }`}>
                            {isPaid ? 'Paid' : isPartiallyPaid ? 'Split / Partial' : 'Unpaid'}
                          </span>
                        </h3>
                        <p className="text-xs font-bold text-orange-500 mt-1">
                          📍 {order.place || 'Main Dining'} • Table {order.table} ({order.seat || 'Whole Table'})
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{new Date(order.createdAt).toLocaleString()}</p>
                      </div>

                      <div className="text-right">
                        <span className="text-2xl font-black text-slate-900 dark:text-white block">
                          {formatUGX(order.total)}
                        </span>
                        {isPartiallyPaid && (
                          <span className="text-[11px] font-bold text-yellow-600 dark:text-yellow-400 block">
                            Paid: {formatUGX(order.paidAmount || 0)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Ordered Items Preview */}
                    <div className="space-y-1.5 mb-4 text-xs font-medium text-slate-600 dark:text-slate-300">
                      {order.items?.slice(0, 3).map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between">
                          <span className="truncate">{item.quantity}x {item.name}</span>
                          <span className="font-bold text-slate-900 dark:text-white">{formatUGX(item.price * item.quantity)}</span>
                        </div>
                      ))}
                      {order.items?.length > 3 && (
                        <p className="text-[10px] italic text-slate-400">+ {order.items.length - 3} more items...</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-black/5 dark:border-white/5">
                    <span className="text-xs font-bold text-slate-400">{order.branchName || 'Kampala Central'}</span>
                    <button className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1 shadow-md group-hover:translate-x-1 transition-transform">
                      Process Payment <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {filteredOrders.length === 0 && (
            <div className="col-span-full py-16 text-center text-slate-400">
              <Search className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="text-lg font-bold">No orders found matching lookup query</p>
              <p className="text-xs text-slate-500 mt-1">Try searching by Order Number, Table Number, or Seat</p>
            </div>
          )}
        </div>
      </main>

      {/* Order Payment & Detail Drawer Modal */}
      <AnimatePresence>
        {selectedOrder && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-[#121214] rounded-[2.5rem] p-8 max-w-2xl w-full border border-black/10 dark:border-white/10 shadow-2xl space-y-6 max-h-[90vh] flex flex-col"
            >
              <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-4">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    Order #{selectedOrder.id.toUpperCase()}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    {selectedOrder.place || 'Main Dining'} • Table {selectedOrder.table} ({selectedOrder.seat || 'Whole Table'})
                  </p>
                </div>
                <button onClick={() => setSelectedOrder(null)} className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar pr-1">
                {/* Items Summary Table */}
                <div className="bg-slate-50 dark:bg-black/30 p-4 rounded-2xl border border-black/5 dark:border-white/5 space-y-2">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400 mb-2">Order Breakdown</h4>
                  {selectedOrder.items?.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center text-xs font-semibold text-slate-800 dark:text-slate-200">
                      <span>{item.quantity}x {item.name}</span>
                      <span>{formatUGX((item.price || 0) * item.quantity)}</span>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-black/5 dark:border-white/5 flex justify-between text-xs text-slate-500">
                    <span>Subtotal</span>
                    <span>{formatUGX(selectedOrder.subtotal || selectedOrder.total)}</span>
                  </div>
                  <div className="flex justify-between text-base font-black text-slate-900 dark:text-white pt-2 border-t border-black/5 dark:border-white/5">
                    <span>Grand Total</span>
                    <span className="text-orange-500">{formatUGX(selectedOrder.total)}</span>
                  </div>
                  {selectedOrder.paidAmount > 0 && (
                    <div className="flex justify-between text-xs font-bold text-green-500 pt-1">
                      <span>Already Paid (Splits)</span>
                      <span>{formatUGX(selectedOrder.paidAmount)}</span>
                    </div>
                  )}
                </div>

                {/* Customer TIN Input */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Customer TIN Number (Optional for VAT Invoices)</label>
                  <input
                    type="text"
                    placeholder="e.g. 1002938491 (Optional)"
                    value={tinNumber}
                    onChange={e => setTinNumber(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white font-mono"
                  />
                </div>

                {/* Payment Method Selection */}
                <div className="space-y-3">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Select Payment Method</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {[
                      { id: 'Cash', label: 'Cash', icon: Banknote },
                      { id: 'MTN Mobile Money', label: 'MTN MoMo', icon: Smartphone },
                      { id: 'Airtel Money', label: 'Airtel Money', icon: Smartphone },
                      { id: 'Credit Card', label: 'Credit Card', icon: CreditCard },
                      { id: 'Corporate Credit', label: 'Corporate Credit', icon: Store }
                    ].map(pm => (
                      <button
                        key={pm.id}
                        onClick={() => setPaymentMethod(pm.id as any)}
                        className={`p-3 rounded-2xl border flex items-center gap-2 transition-all text-xs font-bold ${
                          paymentMethod === pm.id
                            ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent shadow-md'
                            : 'bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-300 border-black/5 dark:border-white/5'
                        }`}
                      >
                        <pm.icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{pm.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Corporate Credit Dropdowns */}
                {paymentMethod === 'Corporate Credit' && (
                  <div className="bg-slate-50 dark:bg-black/30 p-4 rounded-2xl border border-black/5 dark:border-white/5 space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Company Profile</label>
                      <select
                        value={selectedCompanyId}
                        onChange={e => setSelectedCompanyId(e.target.value)}
                        className="w-full bg-white dark:bg-[#121214] border border-black/10 dark:border-white/10 rounded-xl p-2.5 text-xs font-semibold text-slate-900 dark:text-white"
                      >
                        {companies.map(c => (
                          <option key={c.id} value={c.id}>{c.name} (Tax ID: {c.taxId})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Company Staff Member</label>
                      <select
                        value={selectedStaffId}
                        onChange={e => setSelectedStaffId(e.target.value)}
                        className="w-full bg-white dark:bg-[#121214] border border-black/10 dark:border-white/10 rounded-xl p-2.5 text-xs font-semibold text-slate-900 dark:text-white"
                      >
                        <option value="">-- Select Staff Account --</option>
                        {availableCompanyStaff.map(s => (
                          <option key={s.id} value={s.id}>{s.name} ({s.workId || 'Staff'}) - {s.department || 'Staff'}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* Cash Settlement Calculations */}
                {paymentMethod === 'Cash' && selectedOrder.paymentStatus !== 'paid' && (
                  <div className="bg-orange-500/5 dark:bg-orange-500/10 border border-orange-500/20 p-4 rounded-2xl space-y-3">
                    <h5 className="font-extrabold text-xs text-orange-600 dark:text-orange-400 uppercase tracking-wider">Cash Settlement Calc</h5>
                    <div className="flex gap-4 items-center">
                      <div className="flex-1">
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">CASH AMOUNT RECEIVED (UGX)</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          placeholder="e.g. 50000"
                          value={cashAmountReceived}
                          onChange={e => {
                            const cleaned = e.target.value.replace(/\D/g, '');
                            setCashAmountReceived(cleaned);
                          }}
                          className="w-full bg-white dark:bg-[#121214] border border-black/10 dark:border-white/10 rounded-xl p-2.5 text-sm font-bold text-slate-900 dark:text-white"
                        />
                      </div>
                      <div className="text-right">
                        <span className="block text-[10px] font-bold text-slate-500 mb-1">CHANGE TO GIVE</span>
                        <span className={`text-lg font-black ${
                          Number(cashAmountReceived) - (selectedOrder.total - (selectedOrder.paidAmount || 0)) >= 0
                            ? 'text-green-500'
                            : 'text-rose-500'
                        }`}>
                          {Number(cashAmountReceived) > 0
                            ? formatUGX(Math.max(0, Number(cashAmountReceived) - (selectedOrder.total - (selectedOrder.paidAmount || 0))))
                            : formatUGX(0)
                          }
                        </span>
                      </div>
                    </div>
                    {Number(cashAmountReceived) > 0 && Number(cashAmountReceived) < (selectedOrder.total - (selectedOrder.paidAmount || 0)) && (
                      <p className="text-[10px] text-rose-500 font-extrabold flex items-center gap-1">
                        ⚠️ Amount received is less than total due.
                      </p>
                    )}
                  </div>
                )}

                {/* Split Payments Log if any exist */}
                {selectedOrder.splitPayments?.length > 0 && (
                  <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-2xl space-y-2">
                    <h5 className="font-bold text-xs text-yellow-600 dark:text-yellow-400 uppercase tracking-wider">Recorded Split Payments</h5>
                    {selectedOrder.splitPayments.map((sp: any, idx: number) => (
                      <div key={idx} className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
                        <span>Split #{sp.splitIndex}: {sp.paymentMethod}</span>
                        <span className="font-bold">{formatUGX(sp.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Printer Connectivity Status Widget */}
              <div className="bg-slate-50 dark:bg-black/30 border border-black/5 dark:border-white/5 p-3.5 rounded-2xl flex items-center justify-between text-xs font-semibold">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Kitchen/Receipt Printer</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`w-2 h-2 rounded-full ${
                      printerStatus === 'CONNECTED' ? 'bg-green-500' :
                      printerStatus === 'CHECKING' ? 'bg-amber-500 animate-pulse' :
                      printerStatus === 'PORT_CLOSED' || printerStatus === 'UNREACHABLE' ? 'bg-rose-500' : 'bg-slate-400'
                    }`} />
                    <span className="capitalize text-[10px] text-slate-700 dark:text-slate-300 font-bold">{printerStatus.toLowerCase().replace('_', ' ')}</span>
                  </div>
                </div>
                <button
                  onClick={checkPrinterHealth}
                  className="bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 p-2 rounded-lg border border-black/5 dark:border-white/5 active:scale-95 transition-all text-slate-600 dark:text-slate-300"
                  title="Test printer network status"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3 pt-2">
                <div className="flex gap-3">
                  <button
                    onClick={() => openSplitModal(selectedOrder)}
                    disabled={selectedOrder.paymentStatus === 'paid'}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:hover:bg-purple-600 text-white py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20 text-xs transition-all active:scale-95"
                  >
                    <Split className="w-4 h-4" /> Split Bill
                  </button>

                  {selectedOrder.paymentStatus !== 'paid' ? (
                    <button
                      onClick={() => printTicket('cashier_order', selectedOrder, paperWidth)}
                      className="flex-1 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-950 py-3.5 rounded-2xl font-bold flex items-center justify-center gap-1.5 text-xs transition-all active:scale-95"
                    >
                      <Printer className="w-4 h-4" /> Print Bill
                    </button>
                  ) : (
                    <button
                      onClick={() => printTicket('receipt', selectedOrder, paperWidth)}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3.5 rounded-2xl font-bold flex items-center justify-center gap-1.5 text-xs transition-all active:scale-95"
                    >
                      <Printer className="w-4 h-4" /> Print Receipt
                    </button>
                  )}
                </div>

                {selectedOrder.paymentStatus !== 'paid' && (
                  <button
                    onClick={() => handleCompleteFullPayment(selectedOrder)}
                    disabled={isProcessing || (paymentMethod === 'Cash' && (!cashAmountReceived || Number(cashAmountReceived) < (selectedOrder.total - (selectedOrder.paidAmount || 0))))}
                    className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-50 text-white py-4 rounded-2xl font-bold shadow-xl shadow-orange-500/30 text-sm flex items-center justify-center gap-2 active:scale-[0.98]"
                  >
                    {isProcessing ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      `Complete Full Settlement (${formatUGX(selectedOrder.total - (selectedOrder.paidAmount || 0))})`
                    )}
                  </button>
                )}
              </div>

              {/* Print Queue Monitor */}
              {printJobsList.length > 0 && (
                <div className="bg-slate-50 dark:bg-black/35 border border-black/5 dark:border-white/5 rounded-2xl p-4 space-y-3 mt-4">
                  <div className="flex justify-between items-center pb-2 border-b border-black/5 dark:border-white/5">
                    <h5 className="font-extrabold text-[10px] text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" /> Recent Print Jobs
                    </h5>
                    <button
                      onClick={refreshPrintJobs}
                      className="text-[9px] font-bold text-orange-500 hover:underline"
                    >
                      Refresh
                    </button>
                  </div>
                  <div className="space-y-2 max-h-[160px] overflow-y-auto custom-scrollbar">
                    {printJobsList.map((job) => (
                      <div key={job.id} className="flex justify-between items-center text-xs font-semibold p-2.5 bg-white dark:bg-[#121214] rounded-xl border border-black/5 dark:border-white/5 shadow-sm">
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${
                              job.status === 'PRINTED' ? 'bg-green-500' :
                              job.status === 'PRINTING' ? 'bg-amber-500 animate-pulse' :
                              job.status === 'FAILED' ? 'bg-rose-500' : 'bg-slate-400'
                            }`} />
                            <span className="text-[10px] text-slate-700 dark:text-slate-300 font-extrabold capitalize">{job.type.replace('_', ' ').toLowerCase()}</span>
                          </div>
                          <span className="text-[9px] text-slate-400 block truncate mt-0.5">{job.destination}</span>
                          {job.lastError && (
                            <span className="text-[9px] text-rose-500 block leading-tight font-medium mt-0.5 truncate">{job.lastError}</span>
                          )}
                        </div>
                        {job.status === 'FAILED' && (
                          <button
                            onClick={async () => {
                              vibrate(20);
                              await retryNetworkPrintJob(job.id);
                              refreshPrintJobs();
                            }}
                            className="bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 text-[9px] font-bold px-2 py-1 rounded-lg transition-all"
                          >
                            Retry
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Enterprise Split Bill Modal */}
      <AnimatePresence>
        {showSplitModal && selectedOrder && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-[#121214] rounded-[2.5rem] p-8 max-w-3xl w-full border border-black/10 dark:border-white/10 shadow-2xl space-y-5 max-h-[92vh] flex flex-col"
            >
              <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-3">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Split className="w-5 h-5 text-orange-500" /> Split Order #{selectedOrder.id.slice(-5).toUpperCase()}
                  </h3>
                  <p className="text-xs text-slate-500">Give each guest their own items and their own receipt — one bill per table.</p>
                </div>
                <button onClick={() => setShowSplitModal(false)} className="p-1.5 text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Item availability bar */}
              <div className="bg-slate-50 dark:bg-black/30 p-4 rounded-2xl border border-black/5 dark:border-white/5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-2">
                  <span>ORDER ITEMS</span>
                  <span className="text-orange-500">Remaining unassigned: {formatUGX(totalRemaining())}</span>
                </div>
                <div className="space-y-1.5">
                  {selectedOrder.items?.map((item: any, idx: number) => {
                    const remaining = remainingQtyForItem(idx);
                    return (
                      <div key={idx} className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                        <span className="truncate">
                          {item.quantity}x {item.name}
                          {item.addOns?.length > 0 && (
                            <span className="text-[10px] text-orange-500"> +{item.addOns.map((a: any) => a.name).join(', ')}</span>
                          )}
                        </span>
                        <span className={remaining > 0 ? 'font-bold text-slate-900 dark:text-white' : 'font-bold text-green-500'}>
                          {formatUGX(unitPriceOf(item) * item.quantity)}{remaining > 0 ? ` (${remaining} left)` : ' ✓'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Guests */}
              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-1">
                {guests.map((guest, gi) => {
                  const gAmount = guestAmount(guest);
                  const gCount = Object.values(guest.assigned).reduce((s, q) => s + q, 0);
                  return (
                    <div key={guest.id} className={`rounded-2xl border p-4 space-y-3 ${gCount > 0 ? 'bg-purple-500/5 border-purple-500/30' : 'bg-slate-50 dark:bg-black/20 border-black/5 dark:border-white/5'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1">
                          <span className="w-8 h-8 rounded-full bg-purple-600 text-white font-black text-xs flex items-center justify-center">
                            {gi + 1}
                          </span>
                          <input
                            value={guest.label}
                            onChange={e => setGuests(prev => prev.map(g => g.id === guest.id ? { ...g, label: e.target.value } : g))}
                            className="bg-transparent font-bold text-sm text-slate-900 dark:text-white border-b border-transparent focus:border-orange-500 outline-none"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={guest.paymentMethod}
                            onChange={e => setGuests(prev => prev.map(g => g.id === guest.id ? { ...g, paymentMethod: e.target.value as any } : g))}
                            className="bg-white dark:bg-[#121214] border border-black/10 dark:border-white/10 rounded-xl px-2 py-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200 focus:outline-none"
                          >
                            <option>Cash</option>
                            <option>MTN Mobile Money</option>
                            <option>Airtel Money</option>
                            <option>Credit Card</option>
                            <option>Corporate Credit</option>
                          </select>
                          <button onClick={() => removeSplitGuest(guest.id)} className="p-1.5 text-red-400 hover:text-red-500">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        {selectedOrder.items?.map((item: any, idx: number) => {
                          const remaining = remainingQtyForItem(idx);
                          const gQty = guest.assigned[idx] || 0;
                          if (gQty === 0 && remaining === 0) return null;
                          return (
                            <div key={idx} className="flex items-center justify-between gap-2 text-xs">
                              <span className="flex-1 truncate text-slate-600 dark:text-slate-300">
                                {item.name}
                                {item.addOns?.length > 0 && <span className="text-[10px] text-orange-500"> +{item.addOns.map((a: any) => a.name).join(', ')}</span>}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => adjustGuestItem(guest.id, idx, -1)}
                                  disabled={gQty === 0}
                                  className="w-6 h-6 rounded-lg bg-slate-200 dark:bg-white/10 disabled:opacity-30 font-black text-xs text-slate-700 dark:text-white"
                                >
                                  −
                                </button>
                                <span className="w-6 text-center font-black">{gQty}</span>
                                <button
                                  onClick={() => adjustGuestItem(guest.id, idx, 1)}
                                  disabled={remaining === 0}
                                  className="w-6 h-6 rounded-lg bg-orange-500 disabled:opacity-30 text-white font-black text-xs shadow-sm"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {gCount === 0 && <p className="text-[11px] text-slate-400 italic">No items assigned — use + to give this guest their own items.</p>}
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t border-black/5 dark:border-white/5 text-xs font-bold">
                        <span className="text-slate-500">{gCount} item{gCount === 1 ? '' : 's'}</span>
                        <span className="text-purple-600 dark:text-purple-400">{formatUGX(gAmount)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Split Summary */}
              <div className="bg-purple-500/10 border border-purple-500/20 p-4 rounded-2xl space-y-1.5 text-xs font-bold">
                <div className="flex justify-between text-purple-700 dark:text-purple-300">
                  <span>Assigned to guests</span>
                  <span>{formatUGX(guests.reduce((s, g) => s + guestAmount(g), 0))}</span>
                </div>
                <div className="flex justify-between text-orange-600 dark:text-orange-400">
                  <span>Unassigned (pay with final settlement)</span>
                  <span>{formatUGX(totalRemaining())}</span>
                </div>
                <div className="flex justify-between text-slate-900 dark:text-white pt-1 border-t border-purple-500/20">
                  <span>Order Total</span>
                  <span>{formatUGX(selectedOrder.total)}</span>
                </div>
              </div>

              {splitResult.length > 0 && (
                <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-3 space-y-1">
                  {splitResult.map((r, i) => (
                    <div key={i} className="flex justify-between text-xs font-bold text-green-600 dark:text-green-400">
                      <span>✓ {r.guestLabel} paid {formatUGX(r.amount)}</span>
                      <span>{r.printed ? 'Receipt printed' : 'Receipt not printed (offline)'}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={addSplitGuest}
                  className="px-4 py-3 rounded-2xl font-bold text-xs bg-slate-100 dark:bg-white/10 dark:text-white text-slate-700 hover:bg-slate-200 transition-all flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> Add Guest
                </button>
                <button
                  onClick={processSplitPayments}
                  disabled={splitBusy}
                  className="flex-1 bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white py-3.5 rounded-2xl font-bold shadow-lg flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                >
                  {splitBusy ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    `Process ${guests.filter(g => guestAmount(g) > 0).length} Guest Payment${guests.filter(g => guestAmount(g) > 0).length === 1 ? '' : 's'} & Print Receipts`
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Printer Setup Modal (Ethernet Thermal Printers) */}
      <AnimatePresence>
        {showPrinterSettings && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-[#121214] rounded-[2.5rem] p-8 max-w-md w-full border border-black/10 dark:border-white/10 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-3">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Printer className="w-5 h-5 text-orange-500" /> Ethernet Printer Setup
                </h3>
                <button onClick={() => setShowPrinterSettings(false)} className="p-1.5 text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                The kitchen printer prints order tickets automatically over ethernet (IP:9100). Run{' '}
                <code className="bg-slate-100 dark:bg-black/30 px-1.5 py-0.5 rounded font-mono text-[10px]">tools/krown-print-bridge.mjs</code>{' '}
                on the POS computer and enable the bridge below.
              </p>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={printerCfg.enabled}
                  onChange={e => setPrinterCfg(setPrinterConfig({ enabled: e.target.checked }))}
                  className="w-4 h-4 rounded text-orange-500 focus:ring-orange-500"
                />
                <span className="font-bold text-xs text-slate-900 dark:text-white">Enable Network Bridge Printing</span>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Bridge Host</label>
                  <input
                    value={printerCfg.bridgeHost}
                    onChange={e => setPrinterCfg(setPrinterConfig({ bridgeHost: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-2.5 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Bridge Port</label>
                  <input
                    type="number"
                    value={printerCfg.bridgePort}
                    onChange={e => setPrinterCfg(setPrinterConfig({ bridgePort: Number(e.target.value) || 9101 }))}
                    className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-2.5 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Kitchen Printer IP</label>
                  <input
                    value={printerCfg.kitchenIp}
                    onChange={e => setPrinterCfg(setPrinterConfig({ kitchenIp: e.target.value }))}
                    placeholder="192.168.1.100"
                    className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-2.5 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Kitchen Port</label>
                  <input
                    type="number"
                    value={printerCfg.kitchenPort}
                    onChange={e => setPrinterCfg(setPrinterConfig({ kitchenPort: Number(e.target.value) || 9100 }))}
                    className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-2.5 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Receipt Printer IP</label>
                  <input
                    value={printerCfg.receiptIp}
                    onChange={e => setPrinterCfg(setPrinterConfig({ receiptIp: e.target.value }))}
                    placeholder="192.168.1.101"
                    className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-2.5 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Receipt Port</label>
                  <input
                    type="number"
                    value={printerCfg.receiptPort}
                    onChange={e => setPrinterCfg(setPrinterConfig({ receiptPort: Number(e.target.value) || 9100 }))}
                    className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-2.5 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setPrinterCfg(setPrinterConfig({ paperWidth: printerCfg.paperWidth === '80mm' ? '58mm' : '80mm' }))}
                  className="flex-1 py-2.5 rounded-xl font-bold text-xs bg-slate-100 dark:bg-white/10 dark:text-white text-slate-700"
                >
                  Paper: {printerCfg.paperWidth}
                </button>
                <button
                  onClick={handleTestPrinter}
                  className="flex-1 py-2.5 rounded-xl font-bold text-xs bg-orange-500 text-white shadow-md"
                >
                  Test Print
                </button>
              </div>
              {printerTestMsg && (
                <p className={`text-[11px] font-bold ${printerTestMsg.startsWith('SUCCESS') ? 'text-green-500' : 'text-red-500'}`}>{printerTestMsg}</p>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Tables View (shows zones & tables with occupancy) ─────────────────────────
function TablesView({ selectedBranchId }: { selectedBranchId: string }) {
  const [zones, setZones] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    const syncData = () => {
      setZones(dataStore.getZones(selectedBranchId));
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      setOrders(dataStore.getOrders(selectedBranchId, today.getTime()));
    };
    syncData();
    const unsub = dataStore.subscribe(syncData);
    return () => unsub();
  }, [selectedBranchId]);

  const getTableStatus = (zoneId: string, zoneName: string, tableNumber: string): 'available' | 'occupied' => {
    const hasActiveOrder = orders.some(o =>
      o.table === tableNumber &&
      (o.place === zoneId || o.place === zoneName) &&
      o.status !== 'completed' && o.status !== 'cancelled'
    );
    return hasActiveOrder ? 'occupied' : 'available';
  };

  if (zones.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center">
          <MapPin className="w-8 h-8 text-slate-400" />
        </div>
        <div>
          <p className="font-bold text-slate-700 dark:text-white">No Tables Configured</p>
          <p className="text-slate-500 text-sm mt-1">Ask your manager to set up dining places and tables.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-6">
      <div>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
          <MapPin className="w-8 h-8 text-orange-500" /> Table Management
        </h2>
        <p className="text-slate-500 font-medium text-sm mt-1">View table occupancy across all dining places.</p>
      </div>

      {zones.map(zone => (
        <div key={zone.id} className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 shadow-2xl rounded-[2rem] p-6 ring-1 ring-black/5 dark:ring-white/10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-lg">{zone.icon || '📍'} {zone.name}</h3>
              <p className="text-xs text-slate-500">{zone.description || `${zone.tables?.length || 0} tables`}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {(zone.tables || []).map((t: any) => {
              const status = getTableStatus(zone.id, zone.name, t.tableNumber);
              return (
                <div
                  key={t.tableNumber}
                  className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all ${
                    status === 'occupied'
                      ? 'bg-red-500/10 border-red-500/30'
                      : 'bg-green-500/10 border-green-500/30'
                  }`}
                >
                  <span className="font-black text-xl text-slate-900 dark:text-white">{t.tableNumber}</span>
                  <div className="flex gap-0.5 mt-2">
                    {Array.from({ length: t.seatsCount || t.seats || 4 }, (_, i) => (
                      <div key={i} className={`w-2 h-2 rounded-full ${status === 'occupied' ? 'bg-red-500' : 'bg-green-500'}`} />
                    ))}
                  </div>
                  <span className={`text-[10px] font-bold uppercase mt-2 ${status === 'occupied' ? 'text-red-500' : 'text-green-500'}`}>
                    {status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
