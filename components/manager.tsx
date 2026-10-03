'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, Users, Store, Activity, Settings, 
  Box, Shield, Sun, Moon, UtensilsCrossed, Search, DollarSign, Calendar, Filter, Printer, Download, TrendingUp, CreditCard, Banknote, Smartphone, Building2, LogOut, HandCoins
} from 'lucide-react';
import { vibrate } from '@/lib/utils';
import ManagerMenu from './manager-menu';
import ManagerOrders from './manager-orders';
import ManagerInventory from './manager-inventory';
import ManagerReceipts from './manager-receipts';
import ManagerStaff from './manager-staff';
import ManagerAudit from './manager-audit';
import PersonalCredits from './personal-credits';
import AdminCompanies from './admin-companies';
import AdminZones from './admin-zones';
import GlobalSearchModal from './global-search-modal';
import { dataStore } from '@/lib/dataStore';
import { formatUGX } from '@/lib/mockData';

export default function ManagerPage({ user, setView }: { user: any, setView: (v: 'pos' | 'admin' | 'manager' | 'kitchen') => void }) {
  const [activeTab, setActiveTab] = useState<'orders' | 'finance' | 'companies' | 'zones' | 'menu' | 'inventory' | 'staff' | 'receipts' | 'audit' | 'credits'>('orders');
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('krown_theme');
      if (saved) return saved === 'dark';
      return document.documentElement.classList.contains('dark') || window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });
  const [showSearchModal, setShowSearchModal] = useState(false);

  // Date Filter (start/end range)
  const [dateFilterMode, setDateFilterMode] = useState<'all' | 'today' | '7days' | '30days' | 'custom'>('today');
  const [dateFrom, setDateFrom] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState<string>(() => new Date().toISOString().split('T')[0]);

  const activeStaff = dataStore.getStaff().find(s => s.email === user?.email);
  const managerBranchId = user?.assignedBranchId || activeStaff?.assignedBranchId || undefined;

  // Data state
  const [orders, setOrders] = useState<any[]>([]);
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);

  const toggleTheme = () => {
    vibrate(20);
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('krown_theme', next ? 'dark' : 'light');
  };

  useEffect(() => {
    const syncData = () => {
      let start: number | undefined;
      let end: number | undefined;

      if (dateFilterMode === 'today') {
        start = new Date().setHours(0, 0, 0, 0);
        end = new Date().setHours(23, 59, 59, 999);
      } else if (dateFilterMode === '7days') {
        start = Date.now() - 86400000 * 7;
      } else if (dateFilterMode === '30days') {
        start = Date.now() - 86400000 * 30;
      } else if (dateFilterMode === 'custom' && dateFrom && dateTo) {
        const f = new Date(dateFrom);
        const t = new Date(dateTo);
        start = new Date(f.getFullYear(), f.getMonth(), f.getDate(), 0, 0, 0, 0).getTime();
        end = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 23, 59, 59, 999).getTime();
      }

      setOrders(dataStore.getOrders(managerBranchId, start, end));
      setAllOrders(dataStore.getOrders(managerBranchId));
      setProducts(dataStore.getProducts(managerBranchId));
      setIngredients(dataStore.getIngredients(managerBranchId));
      setExpenses(dataStore.getExpenses(managerBranchId, start, end));
    };

    syncData();
    const unsub = dataStore.subscribe(syncData);
    return () => unsub();
  }, [dateFilterMode, dateFrom, dateTo, managerBranchId]);

  // Finance calculations — all monetary DB values are normalized to numbers in dataStore.
  const paidOrders = orders.filter(o =>
    o.paymentStatus === 'paid' ||
    o.paymentStatus === 'partially_paid' ||
    o.paymentStatus === 'partial' ||
    o.status === 'completed'
  );

  const amountCollectedForOrder = (o: any) => {
    if (o.paymentStatus === 'partially_paid' || o.paymentStatus === 'partial') return Number(o.paidAmount || 0);
    return Number(o.paidAmount || o.total || 0);
  };

  const grossSales = paidOrders.reduce((sum, o) => sum + amountCollectedForOrder(o), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + (Number(e.amountUGX) || 0), 0);
  const netProfit = grossSales - totalExpenses;
  const totalMealsSold = paidOrders.reduce(
    (sum, o) => sum + ((o.items || []).reduce((itemSum: number, item: any) => itemSum + (Number(item.quantity) || 0), 0)),
    0
  );
  const paymentBreakdown = dataStore.getPaymentBreakdown(orders);

  const productById = new Map<string, any>(products.map((p: any) => [String(p.id), p]));
  const productByName = new Map<string, any>(products.map((p: any) => [String(p.name || '').trim().toLowerCase(), p]));
  const mealSalesRows = paidOrders.flatMap((order: any) =>
    (order.items || []).map((item: any) => {
      const product = productById.get(String(item.productId || item.id || '')) ||
        productByName.get(String(item.name || '').trim().toLowerCase());
      const quantity = Number(item.quantity) || 0;
      const unitPrice = Number(item.unitPrice ?? item.price ?? product?.price ?? 0) || 0;
      const addOnPerUnit = Array.isArray(item.addOns)
        ? item.addOns.reduce((sum: number, addOn: any) => sum + (Number(addOn.price) || 0), 0)
        : 0;
      return {
        orderId: order.id,
        createdAt: Number(order.createdAt) || Date.now(),
        orderType: order.type || 'Dine In',
        table: order.table || '',
        meal: item.name || product?.name || 'Unknown item',
        category: item.category || product?.category || 'Uncategorized',
        quantity,
        unitPrice,
        lineTotal: (unitPrice + addOnPerUnit) * quantity,
        paymentMethod: order.paymentMethod === 'split' ? 'Split Payment' : (order.paymentMethod || 'Cash'),
        orderPaid: amountCollectedForOrder(order),
        paymentStatus: order.paymentStatus || order.status || '',
      };
    })
  );

  const categoryMap = new Map<string, { category: string; quantity: number; revenue: number }>();
  mealSalesRows.forEach((row: any) => {
    const key = row.category || 'Uncategorized';
    const current = categoryMap.get(key) || { category: key, quantity: 0, revenue: 0 };
    current.quantity += Number(row.quantity) || 0;
    current.revenue += Number(row.lineTotal) || 0;
    categoryMap.set(key, current);
  });
  const categorySales = Array.from(categoryMap.values()).sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue);
  const bestCategory = categorySales[0] || null;
  const leastCategory = categorySales.length
    ? [...categorySales].sort((a, b) => a.quantity - b.quantity || a.revenue - b.revenue)[0]
    : null;

  const financePeriodLabel =
    dateFilterMode === 'today' ? 'Today' :
    dateFilterMode === '7days' ? 'Last 7 Days' :
    dateFilterMode === '30days' ? 'Last 30 Days' :
    dateFilterMode === 'all' ? 'All Time' :
    `${dateFrom} to ${dateTo}`;

  // Print Finance Report
  const printFinancePDF = () => {
    if (typeof window === 'undefined') return;
    const printWin = window.open('', '_blank');
    if (!printWin) return;

    const divider = '-'.repeat(48);
    const doubleDivider = '='.repeat(48);
    printWin.document.write(`
      <html>
        <head>
          <title>KROWN Finance Statement</title>
          <style>
            @page { size: 80mm auto; margin: 0; }
            body { font-family: 'Courier New', Courier, monospace; width: 80mm; padding: 10px; margin: 0 auto; font-size: 12px; line-height: 1.35; color: #000; }
            .center { text-align: center; font-weight: bold; }
            .justify { display: flex; justify-content: space-between; gap: 8px; }
            .small { font-size: 10px; }
          </style>
        </head>
        <body>
          <div class="center">KROWN POS</div>
          <div class="center">BRANCH FINANCIAL STATEMENT</div>
          <div class="center small">${financePeriodLabel}</div>
          <div class="center small">Generated: ${new Date().toLocaleString()}</div>
          <div>${doubleDivider}</div>
          <div class="justify"><span>Collected Revenue:</span><span>${formatUGX(grossSales)}</span></div>
          <div class="justify"><span>Total Expenses:</span><span>${formatUGX(totalExpenses)}</span></div>
          <div class="justify"><strong>Net P&L:</strong><strong>${formatUGX(netProfit)}</strong></div>
          <div class="justify"><span>Meals / Items:</span><span>${totalMealsSold}</span></div>
          <div>${divider}</div>
          <div class="center">PAYMENT METHODS</div>
          ${Object.entries(paymentBreakdown).filter(([, data]) => data.count > 0).map(([method, data]) => `
            <div class="justify"><span>${method}</span><span>${formatUGX(data.total)} (${data.percentage}%)</span></div>
          `).join('')}
          <div>${divider}</div>
          <div class="center">CATEGORY PERFORMANCE</div>
          ${categorySales.map(c => `<div class="justify"><span>${c.category} (${c.quantity})</span><span>${formatUGX(c.revenue)}</span></div>`).join('')}
          <div>${divider}</div>
          <div class="small">Best sold: ${bestCategory ? `${bestCategory.category} (${bestCategory.quantity})` : 'No sales'}</div>
          <div class="small">Least sold: ${leastCategory ? `${leastCategory.category} (${leastCategory.quantity})` : 'No sales'}</div>
          <div>${doubleDivider}</div>
          <div class="center">Powered by KROWN POS</div>
          <br/><br/>
        </body>
      </html>
    `);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => { printWin.print(); printWin.close(); }, 300);
  };

  // Download a complete, Excel-friendly Finance Report as CSV
  const downloadFinanceCSV = () => {
    if (typeof window === 'undefined') return;

    const rows: Array<Array<string | number>> = [
      ['KROWN POS - Branch Financial Statement'],
      ['Period', financePeriodLabel],
      ['Generated', new Date().toLocaleString()],
      [],
      ['FINANCIAL SUMMARY'],
      ['Metric', 'Amount / Count'],
      ['Collected Revenue (UGX)', Math.round(grossSales)],
      ['Operating Expenses (UGX)', Math.round(totalExpenses)],
      ['Net P&L (UGX)', Math.round(netProfit)],
      ['Meals / Items Sold', totalMealsSold],
      ['Paid / Part-paid Orders', paidOrders.length],
      [],
      ['PAYMENT METHOD BREAKDOWN'],
      ['Payment Method', 'Transactions', 'Amount (UGX)', 'Share'],
      ...Object.entries(paymentBreakdown).map(([method, data]) => [
        method, data.count, Math.round(data.total), `${data.percentage}%`
      ]),
      [],
      ['CATEGORY SALES PERFORMANCE'],
      ['Category', 'Items Sold', 'Revenue (UGX)'],
      ...categorySales.map(c => [c.category, c.quantity, Math.round(c.revenue)]),
      [],
      ['ITEMIZED MEAL SALES'],
      ['Date', 'Order ID', 'Order Type', 'Table', 'Meal / Item', 'Category', 'Quantity', 'Unit Price (UGX)', 'Line Sales (UGX)', 'Payment Method', 'Order Amount Paid (UGX)', 'Payment Status'],
      ...mealSalesRows.map((row: any) => [
        new Date(row.createdAt).toLocaleString(),
        row.orderId,
        row.orderType,
        row.table,
        row.meal,
        row.category,
        row.quantity,
        Math.round(row.unitPrice),
        Math.round(row.lineTotal),
        row.paymentMethod,
        Math.round(row.orderPaid),
        row.paymentStatus,
      ]),
      [],
      ['EXPENSES'],
      ['Expense ID', 'Category', 'Description', 'Date', 'Amount (UGX)'],
      ...expenses.map((e: any) => [
        e.id,
        e.category || '',
        e.title || e.description || '',
        e.createdAt ? new Date(Number(e.createdAt)).toLocaleString() : '',
        Math.round(Number(e.amountUGX) || 0),
      ]),
    ];

    const csv = '\uFEFF' + rows
      .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safePeriod = financePeriodLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    a.href = url;
    a.download = `krown-finance-${safePeriod || 'report'}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#F4F4F6] dark:bg-[#0A0A0C] p-6 lg:p-10 font-sans flex flex-col lg:flex-row">
      {/* Sidebar */}
      <aside className="w-full lg:w-64 flex flex-col gap-2 pr-0 lg:pr-6 border-b lg:border-b-0 lg:border-r border-black/5 dark:border-white/5 pb-6 lg:pb-0 mb-6 lg:mb-0 mr-0 lg:mr-8 shrink-0">
        <div className="flex items-center justify-between gap-3 mb-6 px-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/30">
              <Store className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold tracking-tight text-slate-900 dark:text-white">Branch Manager</h1>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Krown ERP Portal</p>
            </div>
          </div>

          <button
            onClick={() => setShowSearchModal(true)}
            className="p-2.5 bg-orange-500/10 text-orange-500 rounded-xl font-bold hover:bg-orange-500/20"
            title="Global Search"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex flex-row lg:flex-col gap-1 flex-1 overflow-x-auto lg:overflow-y-auto custom-scrollbar pb-2 lg:pb-0">
          {[
            { id: 'orders', icon: Activity, label: 'Live Orders' },
            { id: 'finance', icon: DollarSign, label: 'Finance & P&L' },
            { id: 'companies', icon: Settings, label: 'Corporate Accounts' },
            { id: 'zones', icon: Box, label: 'Seating Places' },
            { id: 'menu', icon: UtensilsCrossed, label: 'Menu Mgmt' },
            { id: 'inventory', icon: Box, label: 'Inventory' },
            { id: 'staff', icon: Users, label: 'Staff' },
            { id: 'receipts', icon: Settings, label: 'Receipts & Cashier' },
            { id: 'credits', icon: HandCoins, label: 'Personal Credits' },
            { id: 'audit', icon: Shield, label: 'Security & Audit Logs' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => { vibrate(20); setActiveTab(tab.id as any); }}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl font-medium transition-all shrink-0 text-sm ${
                activeTab === tab.id 
                  ? 'bg-black text-white dark:bg-white dark:text-black shadow-md' 
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 dark:hover:text-white dark:hover:bg-white/5'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto hidden lg:flex flex-col gap-2 pt-4">
          <button 
            onClick={toggleTheme}
            className="flex items-center gap-3 px-4 py-3 rounded-2xl font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 dark:hover:text-white dark:hover:bg-white/5 transition-all text-sm"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            Toggle Theme
          </button>
          <button 
            onClick={() => { vibrate(30); setView('pos'); }}
            className="flex items-center gap-3 px-4 py-3 rounded-2xl font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 dark:hover:text-white dark:hover:bg-white/5 transition-all text-sm"
          >
            <ChevronLeft className="w-4 h-4" />
            Exit Manager
          </button>
          <button 
            onClick={() => { localStorage.removeItem('krown_session_token'); localStorage.removeItem('krown_staff_profile'); sessionStorage.removeItem('krown_active_session'); fetch('/api/auth/logout', { method: 'POST' }).catch(() => {}); window.location.href = '/'; }}
            className="flex items-center gap-3 px-4 py-3 rounded-2xl font-medium text-red-400 hover:text-red-600 hover:bg-red-500/5 dark:hover:text-red-400 dark:hover:bg-red-500/5 transition-all text-sm"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 flex flex-col h-[calc(100vh-5rem)]">
        {/* Date Filter Header Bar */}
        <header className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 p-4 rounded-2xl mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSearchModal(true)}
              className="bg-slate-100 dark:bg-black/40 border border-black/10 dark:border-white/10 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2"
            >
              <Search className="w-4 h-4 text-orange-500" /> Global Search...
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {dateFilterMode === 'custom' && (
              <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-black/40 border border-black/10 dark:border-white/10 p-1 rounded-xl">
                <Calendar className="w-4 h-4 text-orange-500 shrink-0 ml-2" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="bg-transparent text-slate-900 dark:text-white text-xs font-bold py-1 px-2 focus:outline-none cursor-pointer"
                />
                <span className="text-[10px] font-bold text-slate-400">→</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="bg-transparent text-slate-900 dark:text-white text-xs font-bold py-1 px-2 focus:outline-none cursor-pointer"
                />
              </div>
            )}

            <select
              value={dateFilterMode}
              onChange={(e) => setDateFilterMode(e.target.value as any)}
              className="bg-slate-100 dark:bg-black/40 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-xs font-bold py-2 px-3 rounded-xl focus:outline-none cursor-pointer"
            >
              <option value="all">📅 All Time Historical</option>
              <option value="today">☀️ Today</option>
              <option value="custom">📅 Custom Range ({dateFrom} → {dateTo})</option>
              <option value="7days">📊 Last 7 Days</option>
              <option value="30days">📈 Last 30 Days</option>
            </select>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'orders' && (
            <motion.div key="orders" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="h-full overflow-y-auto">
              <ManagerOrders orders={orders} allOrders={allOrders} />
            </motion.div>
          )}

          {activeTab === 'finance' && (
            <motion.div key="finance" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="h-full overflow-y-auto custom-scrollbar pr-2 space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Finance & P&L Analytics</h2>
                  <p className="text-slate-500 font-medium text-xs">Collected revenue, payment methods, meal-level sales, category performance, expenses and net P&L</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={downloadFinanceCSV}
                    className="bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white px-5 py-2.5 rounded-2xl font-bold text-xs flex items-center gap-2 shadow-lg"
                  >
                    <Download className="w-4 h-4" /> Download CSV
                  </button>
                  <button
                    onClick={printFinancePDF}
                    className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-5 py-2.5 rounded-2xl font-bold text-xs flex items-center gap-2 shadow-lg"
                  >
                    <Printer className="w-4 h-4" /> Print PDF Statement
                  </button>
                </div>
              </div>

              {/* Financial KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-orange-500 to-amber-500 rounded-[2.5rem] p-6 text-white shadow-2xl shadow-orange-500/20">
                  <div className="flex items-center gap-2 text-white/80 mb-2">
                    <TrendingUp className="w-5 h-5" />
                    <span className="font-bold text-xs uppercase tracking-wider">Gross Sales</span>
                  </div>
                  <h3 className="text-3xl font-extrabold">{formatUGX(grossSales)}</h3>
                  <p className="text-xs text-white/80 mt-2 font-medium">Orders Count: {orders.filter(o => o.paymentStatus === 'paid' || o.status === 'completed').length}</p>
                </div>

                <div className="bg-gradient-to-br from-amber-600 to-orange-600 rounded-[2.5rem] p-6 text-white shadow-2xl shadow-amber-500/20">
                  <div className="flex items-center gap-2 text-white/80 mb-2">
                    <UtensilsCrossed className="w-5 h-5" />
                    <span className="font-bold text-xs uppercase tracking-wider">Meals Sold</span>
                  </div>
                  <h3 className="text-3xl font-extrabold">{totalMealsSold}</h3>
                  <p className="text-xs text-white/80 mt-2 font-medium">plates served this period</p>
                </div>

                <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-black/5 dark:border-white/10 rounded-[2.5rem] p-6 shadow-xl">
                  <div className="flex items-center gap-2 text-red-500 mb-2">
                    <DollarSign className="w-5 h-5" />
                    <span className="font-bold text-xs uppercase tracking-wider">Total Expenses</span>
                  </div>
                  <h3 className="text-3xl font-extrabold text-slate-900 dark:text-white">{formatUGX(totalExpenses)}</h3>
                  <p className="text-xs text-slate-400 mt-2 font-medium">Operating overheads & stock purchases</p>
                </div>

                <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-black/5 dark:border-white/10 rounded-[2.5rem] p-6 shadow-xl">
                  <div className="flex items-center gap-2 text-green-500 mb-2">
                    <TrendingUp className="w-5 h-5" />
                    <span className="font-bold text-xs uppercase tracking-wider">Net Profit</span>
                  </div>
                  <h3 className="text-3xl font-extrabold text-green-500">{formatUGX(netProfit)}</h3>
                  <p className="text-xs text-slate-400 mt-2 font-medium">Net earnings after expenses</p>
                </div>
              </div>

              {/* Payment Methods Breakdown */}
              <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-black/5 dark:border-white/10 rounded-[2.5rem] p-6 shadow-xl space-y-4">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Payment Method Breakdown (6 Methods)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(paymentBreakdown).map(([method, data]) => (
                    <div key={method} className="bg-slate-50 dark:bg-black/20 p-4 rounded-2xl border border-black/5 dark:border-white/5 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-sm text-slate-900 dark:text-white">{method}</span>
                        <span className="bg-orange-500/10 text-orange-600 dark:text-orange-400 text-xs font-bold px-2 py-0.5 rounded-full">{data.percentage}%</span>
                      </div>
                      <p className="text-xl font-extrabold text-orange-500">{formatUGX(data.total)}</p>
                      <p className="text-[11px] text-slate-400 font-medium">{data.count} transactions</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Category performance */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div className="bg-white/80 dark:bg-[#121214]/80 border border-black/5 dark:border-white/10 rounded-[2rem] p-6 shadow-xl">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Best Sold Category</p>
                  <h3 className="text-2xl font-extrabold text-green-500 mt-2">{bestCategory?.category || 'No sales yet'}</h3>
                  <p className="text-xs text-slate-500 mt-1">{bestCategory ? `${bestCategory.quantity} items • ${formatUGX(bestCategory.revenue)}` : 'No paid sales in this period'}</p>
                </div>
                <div className="bg-white/80 dark:bg-[#121214]/80 border border-black/5 dark:border-white/10 rounded-[2rem] p-6 shadow-xl">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Least Sold Category</p>
                  <h3 className="text-2xl font-extrabold text-orange-500 mt-2">{leastCategory?.category || 'No sales yet'}</h3>
                  <p className="text-xs text-slate-500 mt-1">{leastCategory ? `${leastCategory.quantity} items • ${formatUGX(leastCategory.revenue)}` : 'No paid sales in this period'}</p>
                </div>
                <div className="bg-white/80 dark:bg-[#121214]/80 border border-black/5 dark:border-white/10 rounded-[2rem] p-6 shadow-xl">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Paid / Part-paid Orders</p>
                  <h3 className="text-2xl font-extrabold text-slate-900 dark:text-white mt-2">{paidOrders.length}</h3>
                  <p className="text-xs text-slate-500 mt-1">{financePeriodLabel}</p>
                </div>
              </div>

              <div className="bg-white/80 dark:bg-[#121214]/80 border border-black/5 dark:border-white/10 rounded-[2.5rem] p-6 shadow-xl overflow-hidden">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">Category Sales Performance</h3>
                    <p className="text-xs text-slate-500">Quantity sold and sales value by menu category</p>
                  </div>
                  <span className="text-xs font-bold text-orange-500">{categorySales.length} categories</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-[11px] uppercase tracking-wider text-slate-400 border-b border-black/5 dark:border-white/10">
                      <tr><th className="text-left py-3">Category</th><th className="text-right py-3">Items Sold</th><th className="text-right py-3">Revenue</th></tr>
                    </thead>
                    <tbody>
                      {categorySales.map((category) => (
                        <tr key={category.category} className="border-b border-black/5 dark:border-white/5 last:border-0">
                          <td className="py-3 font-bold text-slate-900 dark:text-white">{category.category}</td>
                          <td className="py-3 text-right text-slate-600 dark:text-slate-300">{category.quantity}</td>
                          <td className="py-3 text-right font-bold text-orange-500">{formatUGX(category.revenue)}</td>
                        </tr>
                      ))}
                      {categorySales.length === 0 && <tr><td colSpan={3} className="py-8 text-center text-slate-400">No paid sales in this period.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white/80 dark:bg-[#121214]/80 border border-black/5 dark:border-white/10 rounded-[2.5rem] p-6 shadow-xl overflow-hidden">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">Itemized Meal Sales</h3>
                    <p className="text-xs text-slate-500">Every sold meal/item with category, quantity, value and payment method</p>
                  </div>
                  <span className="text-xs font-bold text-orange-500">{mealSalesRows.length} line items</span>
                </div>
                <div className="overflow-x-auto max-h-[28rem] custom-scrollbar">
                  <table className="w-full text-sm min-w-[1050px]">
                    <thead className="sticky top-0 bg-white dark:bg-[#121214] text-[11px] uppercase tracking-wider text-slate-400 border-b border-black/5 dark:border-white/10">
                      <tr>
                        <th className="text-left py-3 pr-4">Date</th>
                        <th className="text-left py-3 pr-4">Meal / Item</th>
                        <th className="text-left py-3 pr-4">Category</th>
                        <th className="text-left py-3 pr-4">Order Type</th>
                        <th className="text-right py-3 pr-4">Qty</th>
                        <th className="text-right py-3 pr-4">Unit Price</th>
                        <th className="text-right py-3 pr-4">Line Sales</th>
                        <th className="text-left py-3 pr-4">Payment</th>
                        <th className="text-right py-3">Order Paid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mealSalesRows.map((row: any, index: number) => (
                        <tr key={`${row.orderId}-${index}`} className="border-b border-black/5 dark:border-white/5 last:border-0">
                          <td className="py-3 pr-4 whitespace-nowrap text-xs text-slate-500">{new Date(row.createdAt).toLocaleString()}</td>
                          <td className="py-3 pr-4 font-bold text-slate-900 dark:text-white">{row.meal}</td>
                          <td className="py-3 pr-4"><span className="px-2 py-1 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 text-xs font-bold">{row.category}</span></td>
                          <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">{row.orderType}</td>
                          <td className="py-3 pr-4 text-right">{row.quantity}</td>
                          <td className="py-3 pr-4 text-right">{formatUGX(row.unitPrice)}</td>
                          <td className="py-3 pr-4 text-right font-bold">{formatUGX(row.lineTotal)}</td>
                          <td className="py-3 pr-4 font-medium text-slate-700 dark:text-slate-200">{row.paymentMethod}</td>
                          <td className="py-3 text-right font-bold text-green-500">{formatUGX(row.orderPaid)}</td>
                        </tr>
                      ))}
                      {mealSalesRows.length === 0 && <tr><td colSpan={9} className="py-10 text-center text-slate-400">No paid meal sales in this period.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'companies' && (
            <motion.div key="companies" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="h-full overflow-y-auto">
              <AdminCompanies currentBranchId={managerBranchId} />
            </motion.div>
          )}

          {activeTab === 'zones' && (
            <motion.div key="zones" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="h-full overflow-y-auto">
              <AdminZones currentBranchId={managerBranchId} />
            </motion.div>
          )}

          {activeTab === 'menu' && (
            <motion.div key="menu" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="h-full overflow-y-auto">
              <ManagerMenu products={products} user={user} />
            </motion.div>
          )}

          {activeTab === 'inventory' && (
            <motion.div key="inventory" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="h-full overflow-y-auto">
              <ManagerInventory ingredients={ingredients} user={user} />
            </motion.div>
          )}

          {activeTab === 'staff' && (
            <motion.div key="staff" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="h-full overflow-y-auto">
              <ManagerStaff currentBranchId={managerBranchId} />
            </motion.div>
          )}

          {activeTab === 'receipts' && (
            <motion.div key="receipts" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="h-full overflow-y-auto">
              <ManagerReceipts orders={orders} />
            </motion.div>
          )}

          {activeTab === 'credits' && (
            <motion.div key="credits" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="h-full overflow-y-auto">
              <PersonalCredits branchId={managerBranchId} />
            </motion.div>
          )}

          {activeTab === 'audit' && (
            <motion.div key="audit" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="h-full overflow-y-auto">
              <ManagerAudit currentBranchId={managerBranchId} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Global Search Modal */}
      <GlobalSearchModal isOpen={showSearchModal} onClose={() => setShowSearchModal(false)} />
    </div>
  );
}
