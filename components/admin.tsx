import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, Users, Store, Activity, Settings, LogOut,
  TrendingUp, Box, Shield, Sun, Moon, UtensilsCrossed, Receipt, CreditCard, Banknote, Smartphone, Percent,
  Calendar, Filter, Plus, DollarSign, FileText, Upload, Search, Printer, Download, HandCoins
} from 'lucide-react';
import { vibrate } from '@/lib/utils';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import ManagerMenu from './manager-menu';
import ManagerInventory from './manager-inventory';
import ManagerStaff from './manager-staff';
import ManagerAudit from './manager-audit';
import AdminBranches from './admin-branches';
import AdminCompanies from './admin-companies';
import AdminZones from './admin-zones';
import PersonalCredits from './personal-credits';
import GlobalSearchModal from './global-search-modal';
import { 
  formatUGX, 
  Branch,
  Expense
} from '@/lib/mockData';
import { dataStore } from '@/lib/dataStore';
import { uploadImageFile } from '@/lib/imageUpload';

export default function AdminPage({ user, setView }: { user: any, setView: (v: 'pos' | 'admin' | 'manager' | 'kitchen') => void }) {
  const [activeTab, setActiveTab] = useState<'overview' | 'branches' | 'companies' | 'zones' | 'menu' | 'staff' | 'inventory' | 'finance' | 'audit' | 'credits'>('overview');
  // Persistent Branch Selector State
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');
  const [showSearchModal, setShowSearchModal] = useState<boolean>(false);
  
  // Date Filter State
  const [dateFilterMode, setDateFilterMode] = useState<'all' | 'today' | '7days' | '30days' | 'custom'>('all');
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  
  // Data State
  const [branches, setBranches] = useState<Branch[]>(() => dataStore.getBranches());
  const [orders, setOrders] = useState<any[]>(() => dataStore.getOrders(selectedBranchId));
  const [auditLogs, setAuditLogs] = useState<any[]>(() => dataStore.getAuditLogs(selectedBranchId));
  const [products, setProducts] = useState<any[]>(() => dataStore.getProducts(selectedBranchId));
  const [ingredients, setIngredients] = useState<any[]>(() => dataStore.getIngredients(selectedBranchId));
  const [companies, setCompanies] = useState<any[]>(() => dataStore.getCompanies());
  const [expenses, setExpenses] = useState<Expense[]>(() => dataStore.getExpenses(selectedBranchId));

  // Add Expense Modal
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expTitle, setExpTitle] = useState('');
  const [expCategory, setExpCategory] = useState<Expense['category']>('Rent & Lease');
  const [expAmount, setExpAmount] = useState('');
  const [expNotes, setExpNotes] = useState('');
  const [expReceiptUrl, setExpReceiptUrl] = useState('');
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);

  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('krown_theme');
      if (saved) return saved === 'dark';
      return document.documentElement.classList.contains('dark') || window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

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

  // Sync data whenever store updates or selectedBranchId/dateFilter changes
  useEffect(() => {
    const syncData = () => {
      let now = Date.now();
      let start: number | undefined;
      let end: number | undefined;

      if (dateFilterMode === 'today') {
        start = new Date().setHours(0, 0, 0, 0);
        end = new Date().setHours(23, 59, 59, 999);
      } else if (dateFilterMode === '7days') {
        start = now - 86400000 * 7;
      } else if (dateFilterMode === '30days') {
        start = now - 86400000 * 30;
      } else if (dateFilterMode === 'custom' && selectedDate) {
        const d = new Date(selectedDate);
        start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
        end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
      }

      setBranches(dataStore.getBranches());
      setOrders(dataStore.getOrders(selectedBranchId, start, end));
      setAuditLogs(dataStore.getAuditLogs(selectedBranchId));
      setProducts(dataStore.getProducts(selectedBranchId));
      setIngredients(dataStore.getIngredients(selectedBranchId));
      setCompanies(dataStore.getCompanies());
      setExpenses(dataStore.getExpenses(selectedBranchId, start, end));
    };

    syncData();
    const unsub = dataStore.subscribe(syncData);
    return () => unsub();
  }, [selectedBranchId, dateFilterMode, selectedDate]);

  const displayBranches = branches;
  const displayOrders = orders;

  // Financial Calculations
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const todaySales = displayOrders
    .filter(o => o.createdAt >= todayStart && (o.paymentStatus === 'paid' || o.status === 'completed'))
    .reduce((sum, o) => sum + (o.total || 0), 0);

  const grossSales = displayOrders
    .filter(o => o.paymentStatus === 'paid' || o.status === 'completed')
    .reduce((sum, o) => sum + (o.total || 0), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + (e.amountUGX || 0), 0);
  const outputVAT = grossSales * 0.18; // 18% URA Output VAT on sales
  const inputVAT = expenses.reduce((sum, e) => sum + (e.vatAmountUGX || 0), 0);
  const netURAPayable = Math.max(0, outputVAT - inputVAT);
  const netProfit = grossSales - totalExpenses;
  const totalCorporateOutstanding = companies.reduce((sum, c) => sum + (c.currentBalanceUGX || 0), 0);

  // Dynamic 7 Days Revenue Trend from real orders
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const revenueTrend7Days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
    const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
    const dayName = daysOfWeek[d.getDay()];
    const revenueUGX = displayOrders
      .filter(o => o.createdAt >= startOfDay && o.createdAt <= endOfDay && (o.paymentStatus === 'paid' || o.status === 'completed'))
      .reduce((sum, o) => sum + (o.total || 0), 0);
    return { day: dayName, revenueUGX };
  });

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingReceipt(true);
    const res = await uploadImageFile(file);
    setIsUploadingReceipt(false);
    if (res.url) setExpReceiptUrl(res.url);
  };

  const handleCreateExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expTitle.trim() || !expAmount) return;

    const targetBranch = displayBranches.find(b => b.id === selectedBranchId);

    dataStore.addExpense({
      branchId: selectedBranchId !== 'all' ? selectedBranchId : 'br-1',
      branchName: targetBranch?.name || 'Main Branch',
      title: expTitle.trim(),
      category: expCategory,
      amountUGX: Number(expAmount),
      vatAmountUGX: Math.round(Number(expAmount) * 0.18),
      notes: expNotes.trim(),
      receiptUrl: expReceiptUrl
    });

    setExpTitle('');
    setExpAmount('');
    setExpNotes('');
    setExpReceiptUrl('');
    setShowAddExpense(false);
  };

  return (
    <div className="min-h-screen bg-[#F4F4F6] dark:bg-[#0A0A0C] p-6 lg:p-10 font-sans flex flex-col lg:flex-row">
      {/* Sidebar Navigation */}
      <aside className="w-full lg:w-64 flex flex-col gap-2 pr-0 lg:pr-6 border-b lg:border-b-0 lg:border-r border-black/5 dark:border-white/5 pb-6 lg:pb-0 mb-6 lg:mb-0 mr-0 lg:mr-8 shrink-0">
        <div className="flex items-center justify-between lg:justify-start gap-3 mb-6 lg:mb-8 px-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/30">
              <Store className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold tracking-tight text-slate-900 dark:text-white text-lg">KROWN ERP HQ</h1>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Global Admin & Multi-Branch POS</p>
            </div>
          </div>
          <button onClick={toggleTheme} className="lg:hidden text-slate-500 p-2">
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>

        <nav className="flex flex-row lg:flex-col gap-1 flex-1 overflow-x-auto lg:overflow-y-auto custom-scrollbar pb-2 lg:pb-0">
          {[
            { id: 'overview', icon: Activity, label: 'Overview' },
            { id: 'branches', icon: Store, label: 'Branches' },
            { id: 'companies', icon: Receipt, label: 'Corporate Accounts' },
            { id: 'zones', icon: Box, label: 'Seating Places' },
            { id: 'menu', icon: UtensilsCrossed, label: 'Global Menu' },
            { id: 'staff', icon: Users, label: 'Staff & Managers' },
            { id: 'inventory', icon: Box, label: 'Global Inventory' },
            { id: 'finance', icon: Receipt, label: 'Financial & Tax' },
            { id: 'credits', icon: HandCoins, label: 'Personal Credits' },
            { id: 'audit', icon: Shield, label: 'Audit & Security' },
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
            onClick={() => { localStorage.removeItem('krown_session_token'); localStorage.removeItem('krown_staff_profile'); sessionStorage.removeItem('krown_active_session'); fetch('/api/auth/logout', { method: 'POST' }).catch(() => {}); window.location.href = '/'; }}
            className="flex items-center gap-3 px-4 py-3 rounded-2xl font-medium text-red-400 hover:text-red-600 hover:bg-red-500/5 dark:hover:text-red-400 dark:hover:bg-red-500/5 transition-all text-sm"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 flex flex-col h-[calc(100vh-5rem)]">
        {/* Top Header Controls: Persistent Branch Selector & Date Filter */}
        <header className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 p-4 rounded-2xl mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <button
              onClick={() => setShowSearchModal(true)}
              className="bg-slate-100 dark:bg-black/40 border border-black/10 dark:border-white/10 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2 hover:bg-slate-200 transition-all"
            >
              <Search className="w-4 h-4 text-orange-500" /> Global Search...
            </button>

            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-orange-500 shrink-0" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider shrink-0">Selected Branch:</span>
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="bg-slate-100 dark:bg-black/40 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-xs font-bold py-2 px-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all cursor-pointer flex-1 sm:flex-initial"
              >
                <option value="all">🏢 All Branches Combined (Global HQ)</option>
                {displayBranches.map(b => (
                  <option key={b.id} value={b.id}>📍 {b.name} ({b.city})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end">
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-black/40 border border-black/10 dark:border-white/10 p-1 rounded-xl">
              <Calendar className="w-4 h-4 text-orange-500 shrink-0 ml-2" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setDateFilterMode('custom');
                }}
                className="bg-transparent text-slate-900 dark:text-white text-xs font-bold py-1 px-2 focus:outline-none cursor-pointer"
                title="Select Specific Calendar Date"
              />
            </div>

            <select
              value={dateFilterMode}
              onChange={(e) => setDateFilterMode(e.target.value as any)}
              className="bg-slate-100 dark:bg-black/40 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-xs font-bold py-2 px-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all cursor-pointer"
            >
              <option value="all">📅 All Time Historical</option>
              <option value="today">☀️ Today</option>
              <option value="custom">📅 Custom Date ({selectedDate})</option>
              <option value="7days">📊 Last 7 Days</option>
              <option value="30days">📈 Last 30 Days</option>
            </select>
          </div>
        </header>

        {/* Tab Views */}
        <AnimatePresence mode="wait">
          {/* 1. OVERVIEW */}
          {activeTab === 'overview' && (
            <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2 flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">System Overview</h2>
                  <p className="text-slate-500 font-medium text-xs">
                    {selectedBranchId === 'all' ? 'Combined global performance across all branches.' : `Filtered metrics for ${displayBranches.find(b => b.id === selectedBranchId)?.name}.`}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 shadow-2xl shadow-emerald-500/20 rounded-[2rem] p-5 text-white relative overflow-hidden">
                  <div className="flex items-center gap-2 text-white/80 mb-2">
                    <DollarSign className="w-4 h-4" />
                    <span className="font-semibold text-xs uppercase tracking-wider">Today Sales</span>
                  </div>
                  <h3 className="text-xl font-extrabold">{formatUGX(todaySales)}</h3>
                  <p className="text-[10px] text-white/80 mt-1 font-medium">Sales since 12 AM Midnight</p>
                </div>

                <div className="bg-gradient-to-br from-orange-500 to-amber-500 shadow-2xl shadow-orange-500/20 rounded-[2rem] p-5 text-white relative overflow-hidden">
                  <div className="flex items-center gap-2 text-white/80 mb-2">
                    <TrendingUp className="w-4 h-4" />
                    <span className="font-semibold text-xs uppercase tracking-wider">Gross Sales</span>
                  </div>
                  <h3 className="text-xl font-extrabold">{formatUGX(grossSales)}</h3>
                  <p className="text-[10px] text-white/80 mt-1 font-medium">Total Revenue</p>
                </div>

                <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 shadow-2xl rounded-[2rem] p-5 ring-1 ring-black/5 dark:ring-white/10">
                  <div className="flex items-center gap-2 text-slate-500 mb-2">
                    <Activity className="w-4 h-4 text-orange-500" />
                    <span className="font-semibold text-xs uppercase tracking-wider">Orders</span>
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{displayOrders.length}</h3>
                  <p className="text-[10px] text-slate-400 font-medium mt-1">Processed orders</p>
                </div>

                <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 shadow-2xl rounded-[2rem] p-5 ring-1 ring-black/5 dark:ring-white/10">
                  <div className="flex items-center gap-2 text-slate-500 mb-2">
                    <Percent className="w-4 h-4 text-orange-500" />
                    <span className="font-semibold text-xs uppercase tracking-wider">Tax Reserve</span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">{formatUGX(netURAPayable)}</h3>
                  <p className="text-[10px] text-slate-400 font-medium mt-1">Calculated reserve</p>
                </div>

                <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 shadow-2xl rounded-[2rem] p-5 ring-1 ring-black/5 dark:ring-white/10">
                  <div className="flex items-center gap-2 text-slate-500 mb-2">
                    <DollarSign className="w-4 h-4 text-red-500" />
                    <span className="font-semibold text-xs uppercase tracking-wider">Expenses</span>
                  </div>
                  <h3 className="text-xl font-bold text-red-500">{formatUGX(totalExpenses)}</h3>
                  <p className="text-[10px] text-slate-400 font-medium mt-1">Operating costs</p>
                </div>

                <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 shadow-2xl rounded-[2rem] p-5 ring-1 ring-black/5 dark:ring-white/10">
                  <div className="flex items-center gap-2 text-slate-500 mb-2">
                    <TrendingUp className="w-4 h-4 text-green-500" />
                    <span className="font-semibold text-xs uppercase tracking-wider">Net Profit</span>
                  </div>
                  <h3 className="text-xl font-bold text-green-500">{formatUGX(netProfit)}</h3>
                  <p className="text-[10px] text-slate-400 font-medium mt-1">Sales minus Expenses</p>
                </div>

                <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 shadow-2xl rounded-[2rem] p-5 ring-1 ring-black/5 dark:ring-white/10">
                  <div className="flex items-center gap-2 text-slate-500 mb-2">
                    <Receipt className="w-4 h-4 text-purple-500" />
                    <span className="font-semibold text-xs uppercase tracking-wider">Corporate Credit</span>
                  </div>
                  <h3 className="text-xl font-bold text-purple-600 dark:text-purple-400">{formatUGX(totalCorporateOutstanding)}</h3>
                  <p className="text-[10px] text-slate-400 font-medium mt-1">Billed balances</p>
                </div>
              </div>

              {/* Chart */}
              <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 shadow-2xl rounded-[2rem] p-8 ring-1 ring-black/5 dark:ring-white/10 flex-1 min-h-[350px]">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Revenue Trend (UGX)</h3>
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={revenueTrend7Days}>
                      <XAxis dataKey="day" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#888888" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `UGX ${(val / 1000000).toFixed(1)}M`} />
                      <Tooltip formatter={(value: any) => [formatUGX(value), 'Revenue']} />
                      <Line type="monotone" dataKey="revenueUGX" stroke="#f97316" strokeWidth={4} dot={{ r: 5, fill: '#f97316' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </motion.div>
          )}

          {/* 2. FINANCIAL & URA TAX ANALYTICS */}
          {activeTab === 'finance' && (
            <motion.div key="finance" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col h-full gap-6 overflow-y-auto custom-scrollbar pr-2 flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Financial & Revenue Analytics</h2>
                  <p className="text-slate-500 font-medium text-xs">P&L ledger, branch operating expenses, and revenue reports.</p>
                </div>
                <button
                  onClick={() => setShowAddExpense(true)}
                  className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-3 rounded-2xl font-bold flex items-center gap-2 shadow-lg shadow-orange-500/20 transition-all active:scale-95 text-xs shrink-0"
                >
                  <Plus className="w-4 h-4" /> Record Branch Expense
                </button>
              </div>

              {/* Financial P&L Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl p-6 rounded-[2rem] border border-black/5 dark:border-white/5 shadow-xl">
                  <span className="text-xs font-bold uppercase text-slate-400">Gross Sales Revenue</span>
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{formatUGX(grossSales)}</h3>
                  <p className="text-[11px] text-slate-500 mt-1">Receipts total</p>
                </div>

                <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl p-6 rounded-[2rem] border border-black/5 dark:border-white/5 shadow-xl">
                  <span className="text-xs font-bold uppercase text-slate-400">Total Operating Expenses</span>
                  <h3 className="text-2xl font-bold text-red-500 mt-2">{formatUGX(totalExpenses)}</h3>
                  <p className="text-[11px] text-slate-500 mt-1">Rent, Utilities, Stock, Wages</p>
                </div>

                <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl p-6 rounded-[2rem] border border-black/5 dark:border-white/5 shadow-xl">
                  <span className="text-xs font-bold uppercase text-slate-400">Net Tax Reserve</span>
                  <h3 className="text-2xl font-bold text-orange-500 mt-2">{formatUGX(netURAPayable)}</h3>
                  <p className="text-[11px] text-slate-500 mt-1">Calculated tax reserve ({formatUGX(netURAPayable)})</p>
                </div>

                <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl p-6 rounded-[2rem] border border-black/5 dark:border-white/5 shadow-xl">
                  <span className="text-xs font-bold uppercase text-slate-400">Net Operating Margin</span>
                  <h3 className="text-2xl font-bold text-green-500 mt-2">{formatUGX(netProfit)}</h3>
                  <p className="text-[11px] text-slate-500 mt-1">Gross Sales - Total Expenses</p>
                </div>
              </div>

              {/* Expense Ledger Table */}
              <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 shadow-2xl rounded-[2rem] p-6 ring-1 ring-black/5 dark:ring-white/10 flex-1">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-orange-500" /> Recorded Operating Expenses Ledger
                </h3>

                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-black/5 dark:border-white/5 text-slate-400 text-xs font-bold uppercase tracking-wider">
                        <th className="py-3 px-4">Title & Description</th>
                        <th className="py-3 px-4">Category</th>
                        <th className="py-3 px-4">Branch</th>
                        <th className="py-3 px-4 text-right">Amount (UGX)</th>
                        <th className="py-3 px-4 text-right">Tax Amount</th>
                        <th className="py-3 px-4 text-right">Receipt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5 dark:divide-white/5 text-sm">
                      {expenses.map(e => (
                        <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                          <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                            {e.title}
                            {e.notes && <p className="text-xs font-normal text-slate-400">{e.notes}</p>}
                          </td>
                          <td className="py-3 px-4">
                            <span className="bg-orange-500/10 text-orange-600 dark:text-orange-400 px-2.5 py-1 rounded-lg text-xs font-bold">
                              {e.category}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-xs font-semibold text-slate-500">{e.branchName || 'Kampala Central'}</td>
                          <td className="py-3 px-4 text-right font-bold text-red-500">{formatUGX(e.amountUGX)}</td>
                          <td className="py-3 px-4 text-right font-semibold text-slate-500">{formatUGX(e.vatAmountUGX)}</td>
                          <td className="py-3 px-4 text-right">
                            {e.receiptUrl ? (
                              <a href={e.receiptUrl} target="_blank" rel="noreferrer" className="text-xs text-orange-500 underline font-bold">View Receipt</a>
                            ) : (
                              <span className="text-xs text-slate-400">N/A</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {/* 3. AUDIT & SECURITY */}
          {activeTab === 'audit' && (
            <motion.div key="audit" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col h-full gap-6 flex-1">
              <ManagerAudit currentBranchId={selectedBranchId} />
            </motion.div>
          )}

          {/* 4. OTHER SUB-COMPONENTS */}
          {activeTab === 'branches' && (
            <motion.div key="branches" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full flex-1">
              <AdminBranches restaurants={displayBranches} selectedBranchId={selectedBranchId} />
            </motion.div>
          )}

          {activeTab === 'companies' && (
            <motion.div key="companies" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full flex-1">
              <AdminCompanies currentBranchId={selectedBranchId === 'all' ? undefined : selectedBranchId} />
            </motion.div>
          )}

          {activeTab === 'zones' && (
            <motion.div key="zones" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full flex-1">
              <AdminZones currentBranchId={selectedBranchId === 'all' ? undefined : selectedBranchId} />
            </motion.div>
          )}

          {activeTab === 'menu' && (
            <motion.div key="menu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full flex-1">
              <ManagerMenu products={products} user={user} branchId={selectedBranchId === 'all' ? undefined : selectedBranchId} />
            </motion.div>
          )}

          {activeTab === 'staff' && (
            <motion.div key="staff" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full flex-1">
              <ManagerStaff currentBranchId={selectedBranchId} />
            </motion.div>
          )}

          {activeTab === 'inventory' && (
            <motion.div key="inventory" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full flex-1">
              <ManagerInventory ingredients={ingredients} user={user} branchId={selectedBranchId === 'all' ? undefined : selectedBranchId} />
            </motion.div>
          )}

          {activeTab === 'credits' && (
            <motion.div key="credits" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full flex-1">
              <PersonalCredits branchId={selectedBranchId === 'all' ? undefined : selectedBranchId} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Add Expense Modal */}
      <AnimatePresence>
        {showAddExpense && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white dark:bg-[#121214] rounded-[2.5rem] p-8 max-w-md w-full border border-black/10 dark:border-white/10 shadow-2xl space-y-4">
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Record Branch Expense</h3>
              <form onSubmit={handleCreateExpense} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Expense Title / Description *</label>
                  <input type="text" required value={expTitle} onChange={e => setExpTitle(e.target.value)} placeholder="e.g. Monthly Electricity Utility Bill" className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Expense Category</label>
                    <select value={expCategory} onChange={e => setExpCategory(e.target.value as any)} className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white">
                      <option value="Rent & Lease">Rent & Lease</option>
                      <option value="Utilities & Electricity">Utilities & Electricity</option>
                      <option value="Salaries & Wages">Salaries & Wages</option>
                      <option value="Raw Material Stock">Raw Material Stock</option>
                      <option value="Equipment & Repairs">Equipment & Repairs</option>
                      <option value="Marketing">Marketing</option>
                      <option value="General">General</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Amount (UGX) *</label>
                    <input type="number" required value={expAmount} onChange={e => setExpAmount(e.target.value)} placeholder="1850000" className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Receipt Attachment (Optional)</label>
                  <input type="file" accept="image/*" onChange={handleReceiptUpload} className="text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-orange-500 file:text-white hover:file:bg-orange-600 cursor-pointer" />
                  {isUploadingReceipt && <p className="text-[10px] text-orange-500 font-bold mt-1">Uploading receipt image...</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Notes / Vendor Info</label>
                  <input type="text" value={expNotes} onChange={e => setExpNotes(e.target.value)} placeholder="Invoice #940 paid via bank" className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white" />
                </div>

                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setShowAddExpense(false)} className="flex-1 py-3 font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white">Cancel</button>
                  <button type="submit" className="flex-1 bg-orange-500 text-white py-3 rounded-xl font-bold shadow-lg shadow-orange-500/20">Save Expense</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global Search Modal */}
      <GlobalSearchModal isOpen={showSearchModal} onClose={() => setShowSearchModal(false)} />
    </div>
  );
}
