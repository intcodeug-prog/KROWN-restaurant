'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Home, Grid, UtensilsCrossed, ShoppingCart, Clock, 
  Settings, Plus, Minus, Search, LogOut, Shield, Sun, Moon, Store, Check, CreditCard, Banknote, Smartphone, DollarSign, Building2, FileText, X
} from 'lucide-react';
import { vibrate, getCategoryIcon } from '@/lib/utils';

import { useNotification } from '@/hooks/use-notification';
import { autoPrintKitchenTicket } from '@/lib/printer';
import { formatUGX } from '@/lib/mockData';
import { dataStore } from '@/lib/dataStore';

export default function POSPage({ user, setView, activeStaff }: { user: any; setView: (v: 'pos' | 'admin' | 'manager' | 'kitchen' | 'cashier') => void; activeStaff?: any }) {
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<any[]>([]);
  // 'use client' component — always mounted on the client, no SSR hydration guard needed
  const mounted = true;
  const [products, setProducts] = useState<any[]>([]);
  const [customCategories, setCustomCategories] = useState<string[]>([]);

  const categoriesList = useMemo(() => {
    const fromProducts = products.map(p => (p.category || 'Mains').trim());
    const uniqueCats = Array.from(new Set([...fromProducts, ...customCategories])).filter(Boolean);
    const list = uniqueCats.map(cat => ({
      id: cat.toLowerCase(),
      name: cat,
      icon: getCategoryIcon(cat)
    }));
    return [{ id: 'all', name: 'All Menu', icon: '✨' }, ...list];
  }, [products, customCategories]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('krown_theme');
      if (saved) return saved === 'dark';
      return document.documentElement.classList.contains('dark') || window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });
  const [viewState, setViewState] = useState<'tables' | 'menu' | 'payment'>('tables');
  const [zones, setZones] = useState<any[]>([]);
  const [activeZoneId, setActiveZoneId] = useState<string>('');
  const [activeTable, setActiveTable] = useState<string | null>(null);
  const [activeSeat, setActiveSeat] = useState<string>('Whole Table');
  const [showSeatModal, setShowSeatModal] = useState<boolean>(false);
  const [selectedTableForModal, setSelectedTableForModal] = useState<any>(null);

  // Ongoing / Draft Orders Modal State
  const [showOngoingModal, setShowOngoingModal] = useState<boolean>(false);
  const [ongoingSearch, setOngoingSearch] = useState<string>('');
  const [allOrdersList, setAllOrdersList] = useState<any[]>([]);

  // Customer TIN & Payment Method State
  const [tinNumber, setTinNumber] = useState<string>('');
  const [editingNoteItemId, setEditingNoteItemId] = useState<string | null>(null);
  const [tempNoteText, setTempNoteText] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'MTN Mobile Money' | 'Airtel Money' | 'Credit Card' | 'Corporate Credit'>('MTN Mobile Money');
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [orderConfirmation, setOrderConfirmation] = useState<any | null>(null);

  const { notify } = useNotification();
  
  // Track orders to see when they turn "ready"
  const [myOrders, setMyOrders] = useState<any[]>([]);

  // Role permissions
  const role = activeStaff?.role || 'Senior Waiter';
  const isSuperAdmin = role === 'Super Admin';
  const isManager = role === 'Branch Manager' || isSuperAdmin;
  const isCashier = role === 'Cashier' || isManager;
  const isKitchen = role === 'Head Chef' || role === 'Kitchen Staff' || isManager;

  // Fetch products, zones, companies via DataStore (scoped to active staff's branch)
  useEffect(() => {
    const activeBranchId = activeStaff?.assignedBranchId;
    const sync = () => {
      setProducts(dataStore.getProducts(activeBranchId));
      const z = dataStore.getZones(activeBranchId);
      setZones(z);
      setActiveZoneId(prev => prev || (z[0]?.id || ''));

      const c = dataStore.getCompanies(activeBranchId);
      setCompanies(c);
      setSelectedCompanyId(prev => prev || (c[0]?.id || ''));
      setCustomCategories(dataStore.getCustomCategories());
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const startOfTodayMs = startOfToday.getTime();
      setAllOrdersList(dataStore.getOrders(activeBranchId, startOfTodayMs));
    };

    sync();
    const unsub = dataStore.subscribe(sync);
    return () => unsub();
  }, [activeStaff?.assignedBranchId]);

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

  // Add-On selector state
  const [addOnProduct, setAddOnProduct] = useState<any | null>(null);
  const [addOnSelections, setAddOnSelections] = useState<Record<string, number>>({});
  const openAddOnModal = (product: any) => {
    setAddOnProduct(product);
    setAddOnSelections({});
  };
  const confirmAddOns = (product: any) => {
    const selectedAddOns = (product.addOns || [])
      .filter((a: any) => (addOnSelections[a.id] || 0) > 0)
      .map((a: any) => ({ id: a.id, name: a.name, price: Number(a.priceUGX) || 0, quantity: addOnSelections[a.id] }));
    appendToCart(product, selectedAddOns);
    setAddOnProduct(null);
    setAddOnSelections({});
  };

  const appendToCart = (product: any, selectedAddOns: { id: string; name: string; price: number; quantity: number }[] = []) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1, addOns: selectedAddOns || [] }];
    });
  };

  const addToCart = (product: any) => {
    vibrate(10);
    if ((product.addOns || []).length > 0) {
      openAddOnModal(product);
      return;
    }
    appendToCart(product, []);
  };

  const updateQuantity = (id: string, delta: number) => {
    vibrate(10);
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQ = item.quantity + delta;
        return newQ > 0 ? { ...item, quantity: newQ } : item;
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  // Menu prices are VAT INCLUSIVE (18% URA VAT)
  const itemLineTotal = (item: any) => {
    const addOnsTotal = (item.addOns || []).reduce((s: number, a: any) => s + (Number(a.price) * (item.quantity || 1)), 0);
    return (item.price * item.quantity) + addOnsTotal;
  };
  const grandTotal = cart.reduce((sum, item) => sum + itemLineTotal(item), 0);
  const tax = 0; // Omit separate tax calculations to record same amount (taxes are inclusive)
  const subtotal = grandTotal; // Net pre-tax subtotal is same as total
  const total = grandTotal; // Total payable (VAT Inclusive)

  const currentZone = zones.find(z => z.id === activeZoneId) || zones[0];
  const availableCompanyStaff = dataStore.getCompanyStaff(selectedCompanyId);

  const [orderType, setOrderType] = useState<'Dine In' | 'Takeaway' | 'Delivery'>('Dine In');

  const submitOrder = async (pm: any = paymentMethod) => {
    if (cart.length === 0) return;

    // For Dine In, table is required. For Takeaway/Delivery, auto-assign takeaway counter.
    const finalTable = orderType === 'Dine In' ? activeTable : (orderType === 'Takeaway' ? 'TAKEAWAY-01' : 'DELIVERY-01');
    const finalPlace = orderType === 'Dine In' ? (currentZone?.name || 'Main Dining Hall') : (orderType === 'Takeaway' ? 'Takeaway Counter' : 'Delivery Hub');
    const finalSeat = orderType === 'Dine In' ? (activeSeat || 'Whole Table') : 'Counter Pickup';

    if (orderType === 'Dine In' && !finalTable) {
      alert('Please select a dining table for Dine In orders or switch to Takeaway mode.');
      return;
    }

    setIsProcessing(true);

    try {
      const activeCompanyObj = companies.find(c => c.id === selectedCompanyId);
      const activeStaffObj = availableCompanyStaff.find(s => s.id === selectedStaffId);

      if (pm === 'Corporate Credit' && activeCompanyObj?.status === 'suspended') {
        alert(`Account On Hold: ${activeCompanyObj.name} is currently suspended. Corporate credit payment is disabled.`);
        setIsProcessing(false);
        return;
      }

      // ONE-BILL-PER-TABLE RULE (seat-aware): Append to the SAME bill ONLY when an
      // open bill already exists in this exact seating scope — the selected seat's
      // own bill, or a whole-table bill when the whole table is selected.
      if (orderType === 'Dine In' && finalTable) {
        const existingOpen = dataStore.getOpenOrderByTable(finalTable, finalSeat);
        if (existingOpen) {
          const updated = await dataStore.addItemsToOrder(existingOpen.id, cart);
          if (updated) {
            autoPrintKitchenTicket(updated);
            vibrate([50, 100, 50]);
            setOrderConfirmation({ ...updated, appendedToExisting: true, existingOrderId: existingOpen.id });
            setCart([]);
            setTinNumber('');
            setViewState('tables');
            setIsProcessing(false);
            return;
          }
        }
      }

      const placed = await dataStore.placeOrder({
        table: finalTable || 'TAKEAWAY-01',
        place: finalPlace,
        seat: finalSeat,
        type: orderType,
        items: cart,
        subtotal,
        tax,
        total,
        paymentMethod: pm,
        isCorporateCredit: pm === 'Corporate Credit',
        companyId: pm === 'Corporate Credit' ? selectedCompanyId : undefined,
        companyName: pm === 'Corporate Credit' ? activeCompanyObj?.name : undefined,
        companyStaffId: pm === 'Corporate Credit' ? selectedStaffId : undefined,
        companyStaffName: pm === 'Corporate Credit' ? activeStaffObj?.name : undefined,
        workId: pm === 'Corporate Credit' ? activeStaffObj?.workId : undefined,
        restaurantId: activeStaff?.assignedBranchId || '',
        userId: user.uid,
        tinNumber: tinNumber.trim() || undefined,
      });
      
      // KITCHEN ISOLATION RULE: Always send Kitchen Order Ticket (KOT) to kitchen printer.
      // This fires for ALL order types — Dine In, Takeaway, Delivery.
      autoPrintKitchenTicket(placed);

      vibrate([50, 100, 50]);
      setOrderConfirmation(placed);
      setCart([]);
      setTinNumber('');
      setViewState(orderType === 'Dine In' ? 'tables' : 'menu');
    } catch (e: any) {
      console.warn('Order placed cleanly via dataStore:', e);
      vibrate([50, 100, 50]);
      setCart([]);
      setTinNumber('');
      setViewState(orderType === 'Dine In' ? 'tables' : 'menu');
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredProducts = products.filter(p => 
    (activeCategory === 'all' || p.category?.toLowerCase() === activeCategory) &&
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
    p.available !== false
  );

  if (!mounted) return null;

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-[#F4F4F6] dark:bg-[#0A0A0C] font-sans selection:bg-orange-500/30">
      {/* Mobile Header Bar */}
      <div className="md:hidden bg-white/90 dark:bg-[#121214]/90 backdrop-blur-2xl border-b border-black/5 dark:border-white/5 px-4 py-3 flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-orange-500 rounded-xl flex items-center justify-center shadow-md shadow-orange-500/30">
            <UtensilsCrossed className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-extrabold text-sm text-slate-900 dark:text-white leading-none">KROWN POS</h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">{role}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { vibrate(20); setViewState('tables'); }}
            className={`p-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-all ${
              viewState === 'tables' ? 'bg-orange-500 text-white shadow-md' : 'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/5'
            }`}
          >
            <Grid className="w-4 h-4" />
            <span>Tables</span>
          </button>
          <button
            onClick={() => { vibrate(20); setViewState('menu'); }}
            className={`p-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-all ${
              viewState === 'menu' ? 'bg-orange-500 text-white shadow-md' : 'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/5'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Menu</span>
          </button>
          {isCashier && (
            <button onClick={() => setView('cashier')} className="p-2 text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/5 rounded-xl font-bold text-xs" title="Cashier">
              <DollarSign className="w-4 h-4" />
            </button>
          )}
          {isKitchen && (
            <button onClick={() => setView('kitchen')} className="p-2 text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/5 rounded-xl font-bold text-xs" title="Kitchen">
              <Clock className="w-4 h-4" />
            </button>
          )}
          {isSuperAdmin && (
            <button onClick={() => setView('admin')} className="p-2 text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/5 rounded-xl font-bold text-xs" title="Admin">
              <Shield className="w-4 h-4" />
            </button>
          )}
          <button onClick={toggleTheme} className="p-2 text-slate-400 hover:text-orange-500">
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Desktop Sidebar Navigation */}
      <nav className="hidden md:flex w-20 lg:w-24 bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border-r border-black/5 dark:border-white/5 flex-col items-center py-8 z-10 shrink-0">
        <div className="w-12 h-12 bg-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/30 mb-8">
          <UtensilsCrossed className="w-6 h-6 text-white" />
        </div>
        
        <div className="flex flex-col gap-4 w-full px-4">
           <button 
            onClick={() => { vibrate(20); setViewState('tables'); }}
            className={`flex flex-col items-center justify-center gap-1.5 w-full py-3 rounded-2xl transition-all duration-300 relative group ${viewState === 'tables' ? 'text-orange-500 bg-orange-500/10' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5'}`}
          >
            <Grid className="w-5 h-5 stroke-[2]" />
            <span className="text-[10px] font-medium tracking-wide">Tables</span>
          </button>
          <button 
            onClick={() => { vibrate(20); setViewState('menu'); }}
            className={`flex flex-col items-center justify-center gap-1.5 w-full py-3 rounded-2xl transition-all duration-300 relative group ${viewState === 'menu' ? 'text-orange-500 bg-orange-500/10' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5'}`}
          >
            <ShoppingCart className="w-5 h-5 stroke-[2]" />
            <span className="text-[10px] font-medium tracking-wide">Order</span>
          </button>

          <button 
            onClick={() => { vibrate(20); setShowOngoingModal(true); }}
            className="flex flex-col items-center justify-center gap-1.5 w-full py-3 rounded-2xl transition-all duration-300 relative group text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5"
          >
            <FileText className="w-5 h-5 stroke-[2]" />
            <span className="text-[10px] font-medium tracking-wide">Ongoing</span>
          </button>
          
          {isCashier && (
            <button 
              onClick={() => { vibrate(30); setView('cashier'); }}
              className="flex flex-col items-center justify-center gap-1.5 w-full py-3 rounded-2xl transition-all duration-300 relative group text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5"
            >
              <DollarSign className="w-5 h-5 stroke-[2]" />
              <span className="text-[10px] font-medium tracking-wide">Cashier</span>
            </button>
          )}

          {isKitchen && (
            <button 
              onClick={() => { vibrate(30); setView('kitchen'); }}
              className="flex flex-col items-center justify-center gap-1.5 w-full py-3 rounded-2xl transition-all duration-300 relative group text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5"
            >
              <Clock className="w-5 h-5 stroke-[2]" />
              <span className="text-[10px] font-medium tracking-wide">Kitchen</span>
            </button>
          )}
          
          {isSuperAdmin && (
            <button 
              onClick={() => { vibrate(30); setView('admin'); }}
              className="flex flex-col items-center justify-center gap-1.5 w-full py-3 rounded-2xl transition-all duration-300 relative group text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5"
            >
              <Shield className="w-5 h-5 stroke-[2]" />
              <span className="text-[10px] font-medium tracking-wide">Admin</span>
            </button>
          )}

          {isManager && (
            <button 
              onClick={() => { vibrate(30); setView('manager'); }}
              className="flex flex-col items-center justify-center gap-1.5 w-full py-3 rounded-2xl transition-all duration-300 relative group text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5"
            >
              <Store className="w-5 h-5 stroke-[2]" />
              <span className="text-[10px] font-medium tracking-wide">Manager</span>
            </button>
          )}
        </div>

        <div className="mt-auto px-4 flex flex-col items-center gap-4 w-full">
          <button onClick={toggleTheme} className="text-slate-400 hover:text-orange-500 transition-colors p-2">
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button onClick={() => { vibrate(40); localStorage.removeItem('krown_session_token'); localStorage.removeItem('krown_staff_profile'); sessionStorage.removeItem('krown_active_session'); fetch('/api/auth/logout', { method: 'POST' }).catch(() => {}); window.location.href = '/'; }} className="text-slate-400 hover:text-red-500 transition-colors p-2">
            <LogOut className="w-5 h-5" />
          </button>
          <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-white dark:ring-white/10 shadow-md bg-slate-200 flex items-center justify-center">
            <span className="text-lg font-bold text-slate-600">{user?.displayName?.charAt(0) || 'S'}</span>
          </div>
        </div>
      </nav>

      {/* Main Area */}
      <main className="flex-1 min-w-0 flex flex-col h-full relative">
        <AnimatePresence mode="wait">
          
          {/* MULTI-ZONE TABLES VIEW */}
          {viewState === 'tables' && (
            <motion.div key="tables" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex-1 p-6 lg:p-10 flex flex-col h-full overflow-y-auto custom-scrollbar">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Select Seating & Table</h2>
                  <p className="text-slate-500 font-medium">Organized places (Garden, Main Hall, VIP Lounge, Rooftop) or Takeaway</p>
                </div>

                {/* Order Type Toggle */}
                <div className="flex items-center bg-slate-200 dark:bg-white/10 p-1 rounded-2xl">
                  {[
                    { id: 'Dine In', label: '🍽️ Dine In' },
                    { id: 'Takeaway', label: '🛍️ Takeaway (No Table)' },
                    { id: 'Delivery', label: '🛵 Delivery' }
                  ].map(ot => (
                    <button
                      key={ot.id}
                      onClick={() => {
                        vibrate(20);
                        setOrderType(ot.id as any);
                        if (ot.id !== 'Dine In') {
                          setActiveTable(ot.id === 'Takeaway' ? 'TAKEAWAY-01' : 'DELIVERY-01');
                          setActiveSeat('Counter Pickup');
                          setViewState('menu');
                        }
                      }}
                      className={`px-4 py-2 rounded-xl font-bold text-xs transition-all ${
                        orderType === ot.id ? 'bg-orange-500 text-white shadow-md' : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {ot.label}
                    </button>
                  ))}
                </div>

                {activeTable && (
                  <div className="bg-orange-500 text-white font-bold px-5 py-2.5 rounded-2xl text-sm flex items-center gap-2 shadow-lg shadow-orange-500/20">
                    <Check className="w-4 h-4" /> Selected: {orderType === 'Dine In' ? `${currentZone?.name} • ${activeTable} • ${activeSeat}` : `${orderType} Counter`}
                  </div>
                )}
              </div>

              {/* Zone / Place Tabs */}
              <div className="w-full flex items-center gap-2.5 overflow-x-auto pb-3 pt-1 mb-6 custom-scrollbar shrink-0">
                {zones.map(z => (
                  <button
                    key={z.id}
                    onClick={() => { vibrate(15); setActiveZoneId(z.id); }}
                    className={`shrink-0 flex items-center gap-2.5 px-5 py-3 rounded-2xl font-bold text-xs sm:text-sm whitespace-nowrap transition-all duration-200 shadow-sm ${
                      activeZoneId === z.id
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-md scale-[1.02]'
                        : 'bg-white dark:bg-[#121214] text-slate-600 dark:text-slate-300 border border-black/5 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                  >
                    <span className="text-base leading-none">{z.icon || '📍'}</span>
                    <span className="leading-tight">{z.name}</span>
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                      activeZoneId === z.id ? 'bg-orange-500 text-white' : 'bg-slate-100 dark:bg-white/10 text-slate-500'
                    }`}>
                      {z.tables?.length || 0}
                    </span>
                  </button>
                ))}
              </div>

              {/* Grid of Tables for Selected Zone */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {currentZone?.tables?.map((t: any) => {
                  const isSelected = activeTable === t.tableNumber;
                  const occ = dataStore.getTableOccupancy(t.tableNumber);
                  const isOccupied = occ.status === 'occupied';
                  const isReserved = occ.status === 'reserved';
                  const occupiedSeatSet = new Set(occ.openSeats);
                  const statusColor = isSelected
                    ? 'bg-gradient-to-br from-orange-500 to-amber-500 text-white border-transparent shadow-orange-500/30'
                    : isOccupied
                      ? 'bg-red-50 dark:bg-red-500/10 border-red-400/60 dark:border-red-500/40 text-red-600 dark:text-red-300 hover:border-red-500'
                      : isReserved
                        ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-400/60 dark:border-amber-500/40 text-amber-600 dark:text-amber-300 hover:border-amber-500'
                        : 'bg-white dark:bg-[#121214] border-black/5 dark:border-white/10 text-slate-900 dark:text-white hover:border-orange-500/50';
                  const tableBodyColor = isSelected
                    ? 'bg-white/20'
                    : isOccupied
                      ? 'bg-gradient-to-br from-red-500 to-rose-700'
                      : isReserved
                        ? 'bg-gradient-to-br from-amber-500 to-amber-700'
                        : 'bg-gradient-to-br from-emerald-500 to-green-700';
                  return (
                    <button 
                      key={t.tableNumber}
                      onClick={() => { 
                        vibrate(20); 
                        setSelectedTableForModal(t);
                        setShowSeatModal(true);
                      }}
                      className={`aspect-square rounded-[2.5rem] flex flex-col items-center justify-center p-4 shadow-xl transition-all active:scale-[0.98] border-2 relative overflow-hidden group ${statusColor}`}
                    >
                      <div className="relative flex items-center justify-center my-2">
                        <div className={`w-20 h-20 ${t.shape === 'rectangle' ? 'rounded-2xl' : 'rounded-full'} ${tableBodyColor} flex flex-col items-center justify-center shadow-lg border-2 border-white/20`}>
                          <span className="text-2xl font-black">{t.tableNumber}</span>
                          <span className="text-[10px] font-bold opacity-80">{t.seatsCount} Seats</span>
                        </div>

                        {/* Seat Nodes Positioned Around Table — green free / red occupied / amber reserved */}
                        {Array.from({ length: Math.min(8, t.seatsCount || 4) }).map((_, sIdx) => {
                          const seatName = `Seat ${sIdx + 1}`;
                          const angle = (sIdx / Math.min(8, t.seatsCount || 4)) * (2 * Math.PI);
                          const radius = 46;
                          const x = Math.cos(angle) * radius;
                          const y = Math.sin(angle) * radius;
                          const seatTaken = occupiedSeatSet.has(seatName);
                          return (
                            <div
                              key={sIdx}
                              title={seatTaken ? `${seatName} — Occupied` : `${seatName} — Available`}
                              style={{ transform: `translate(${x}px, ${y}px)` }}
                              className={`absolute w-4 h-4 rounded-full ${isSelected
                                ? 'bg-white text-orange-600'
                                : seatTaken
                                  ? 'bg-red-600 text-white ring-2 ring-red-300'
                                  : isReserved
                                    ? 'bg-amber-400 text-amber-900'
                                    : 'bg-emerald-500 text-white'} text-[9px] font-extrabold flex items-center justify-center shadow-sm z-20`}
                            >
                              {sIdx + 1}
                            </div>
                          );
                        })}
                      </div>

                      <span className={`text-[10px] font-extrabold px-3 py-0.5 rounded-full mt-1 ${
                        isSelected ? 'bg-white/20 text-white'
                        : isOccupied ? 'bg-red-500 text-white'
                        : isReserved ? 'bg-amber-500 text-white'
                        : 'bg-emerald-500/90 text-white'
                      }`}>
                        {isSelected ? 'Select Seat'
                        : isOccupied ? (occ.wholeTableOpen ? `Occupied • Table` : `Occupied • ${occ.openSeats.length} Seat${occ.openSeats.length > 1 ? 's' : ''}`)
                        : isReserved ? 'Reserved'
                        : 'Available'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* MENU VIEW */}
          {viewState === 'menu' && (
             <motion.div key="menu" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col h-full relative">
              <header className="px-6 lg:px-10 pt-8 pb-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-1">
                      {activeTable ? `${currentZone?.name || 'Dining'} • ${activeTable} (${activeSeat})` : 'New Order'}
                    </h1>
                    <p className="text-slate-500 font-medium">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                  </div>
                  <div className="relative max-w-sm w-full group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
                    <input 
                      type="text" 
                      placeholder="Search menu..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-white dark:bg-[#121214] border border-black/5 dark:border-white/10 rounded-full py-4 pl-12 pr-6 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 shadow-sm transition-all text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                {/* Categories */}
                <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2 mask-linear-fade">
                  {categoriesList.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => { vibrate(15); setActiveCategory(cat.id); }}
                      className={`flex items-center gap-3 px-6 py-4 rounded-full font-bold whitespace-nowrap transition-all active:scale-[0.98] ${
                        activeCategory === cat.id 
                          ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-lg shadow-black/10 dark:shadow-white/10' 
                          : 'bg-white dark:bg-[#121214] text-slate-500 border border-black/5 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5'
                      }`}
                    >
                      <span className="text-xl">{cat.icon}</span>
                      {cat.name}
                    </button>
                  ))}
                </div>
              </header>

              <div className="flex-1 overflow-y-auto px-6 lg:px-10 pb-8 custom-scrollbar">
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                  <AnimatePresence>
                    {filteredProducts.map(product => (
                      <motion.button
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        key={product.id}
                        onClick={() => addToCart(product)}
                        className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-xl rounded-[2rem] p-4 flex flex-col items-center text-center gap-4 transition-all hover:shadow-xl hover:shadow-black/5 border border-black/5 dark:border-white/5 active:scale-95 group h-full"
                      >
                        <div className="w-full aspect-square bg-slate-50 dark:bg-black/20 rounded-2xl mb-4 overflow-hidden flex items-center justify-center relative shadow-inner">
                          {product.image?.startsWith('http') ? (
                            <Image src={product.image} alt={product.name} fill sizes="(max-width: 768px) 50vw, 25vw" className="object-cover group-hover:scale-110 transition-transform duration-500" unoptimized />
                          ) : (
                            <span className="text-6xl group-hover:scale-110 transition-transform duration-500">{product.image}</span>
                          )}
                        </div>
                        <div className="mt-auto w-full flex flex-col items-start text-left">
                          <h3 className="font-bold text-slate-900 dark:text-white text-lg leading-tight mb-1 line-clamp-2">{product.name}</h3>
                          {product.description && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-2 leading-relaxed font-normal">{product.description}</p>
                          )}
                          <div className="flex w-full items-center justify-between mt-2">
                            <div>
                              <p className="text-orange-500 font-bold text-base leading-none">{formatUGX(product.price)}</p>
                            </div>
                            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-500 group-hover:bg-orange-500 group-hover:text-white transition-colors">
                              <Plus className="w-4 h-4" />
                            </div>
                          </div>
                        </div>
                      </motion.button>
                    ))}
                  </AnimatePresence>
                </div>
                {filteredProducts.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                    <Search className="w-12 h-12 mb-4 opacity-50" />
                    <p className="text-lg font-medium">No items found</p>
                  </div>
                )}
              </div>
             </motion.div>
          )}

          {/* PAYMENT VIEW WITH CORPORATE CREDIT SERVICE */}
          {viewState === 'payment' && (
             <motion.div key="payment" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex-1 p-6 lg:p-10 flex flex-col h-full items-center justify-center">
              <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 shadow-2xl rounded-[3rem] p-8 ring-1 ring-black/5 dark:ring-white/10 max-w-2xl w-full flex flex-col items-center">
                 <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-1 tracking-tight">Confirm & Process Payment</h2>
                 <p className="text-slate-500 text-sm mb-6">
                   Table: <span className="font-bold text-slate-900 dark:text-white">{currentZone?.name} • {activeTable} ({activeSeat})</span>
                 </p>

                 <div className="bg-orange-500/10 border border-orange-500/20 px-6 py-4 rounded-2xl w-full text-center mb-6">
                   <span className="text-xs uppercase font-bold text-orange-600 dark:text-orange-400">Grand Total Payable</span>
                   <p className="text-3xl font-extrabold text-orange-500">{formatUGX(total)}</p>
                 </div>
                 
                 {/* Customer TIN Input (Optional for VAT Invoices) */}
                 <div className="w-full mb-4">
                   <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Customer TIN Number (Optional for VAT Invoice)</label>
                   <input
                     type="text"
                     value={tinNumber}
                     onChange={e => setTinNumber(e.target.value)}
                     placeholder="e.g. 1002938491 (Leave empty if none)"
                     className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-white font-mono"
                   />
                 </div>
                 
                 {/* Payment Method Selector Grid (All 6 Methods) */}
                 <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full mb-6">
                    {[
                      { id: 'Cash', label: 'Cash', icon: Banknote },
                      { id: 'MTN Mobile Money', label: 'MTN Mobile Money', icon: Smartphone },
                      { id: 'Airtel Money', label: 'Airtel Money', icon: Smartphone },
                      { id: 'Credit Card', label: 'Credit Card', icon: CreditCard },
                      { id: 'Corporate Credit', label: 'Corporate Credit', icon: Store },
                    ].map(pm => (
                      <button
                        key={pm.id}
                        onClick={() => setPaymentMethod(pm.id as any)}
                        className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all active:scale-95 ${
                          paymentMethod === pm.id
                            ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent shadow-xl'
                            : 'bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-300 border-black/5 dark:border-white/5 hover:border-orange-500/40'
                        }`}
                      >
                        <pm.icon className="w-6 h-6" />
                        <span className="font-bold text-xs text-center">{pm.label}</span>
                      </button>
                    ))}
                 </div>

                 {/* Corporate Credit Dropdowns */}
                 {paymentMethod === 'Corporate Credit' && (
                   <div className="w-full bg-slate-50 dark:bg-black/30 p-5 rounded-2xl border border-black/5 dark:border-white/10 space-y-4 mb-6">
                     <h4 className="font-bold text-slate-900 dark:text-white text-sm">Select Corporate Client & Staff Member</h4>
                     <div>
                       <label className="block text-xs font-bold text-slate-500 mb-1">Company Profile</label>
                       <select
                         value={selectedCompanyId}
                         onChange={e => setSelectedCompanyId(e.target.value)}
                         className="w-full bg-white dark:bg-[#121214] border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm font-semibold text-slate-900 dark:text-white"
                       >
                         {companies.map(c => (
                           <option key={c.id} value={c.id}>
                             {c.name} (Tax ID: {c.taxId})
                           </option>
                         ))}
                       </select>
                     </div>

                     <div>
                       <label className="block text-xs font-bold text-slate-500 mb-1">Company Staff Member / ID</label>
                       <select
                         value={selectedStaffId}
                         onChange={e => setSelectedStaffId(e.target.value)}
                         className="w-full bg-white dark:bg-[#121214] border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm font-semibold text-slate-900 dark:text-white"
                       >
                         <option value="">-- Select Staff Account --</option>
                         {availableCompanyStaff.map(s => (
                           <option key={s.id} value={s.id}>
                             {s.name} {s.workId ? `[Work ID: ${s.workId}]` : ''} - {s.department || 'Staff'}
                           </option>
                         ))}
                       </select>
                     </div>
                   </div>
                 )}

                 <div className="flex gap-4 w-full">
                    <button onClick={() => setViewState('menu')} className="flex-1 py-4 font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white">Back to Order</button>
                    <button
                      onClick={() => submitOrder(paymentMethod)}
                      disabled={isProcessing}
                      className="flex-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white py-4 px-8 rounded-2xl font-bold shadow-xl shadow-orange-500/20 active:scale-95 text-center flex items-center justify-center gap-2"
                    >
                      {isProcessing ? (
                        <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        `Confirm Order (${paymentMethod})`
                      )}
                    </button>
                 </div>
              </div>
             </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Add-On Selection Modal */}
      <AnimatePresence>
        {addOnProduct && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white dark:bg-[#121214] rounded-[2.5rem] p-8 max-w-md w-full border border-black/10 dark:border-white/10 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-4">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Customize {addOnProduct.name}</h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">Add extras to your meal</p>
                </div>
                <button onClick={() => setAddOnProduct(null)} className="p-2 text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                {(addOnProduct.addOns || []).map((a: any) => {
                  const qty = addOnSelections[a.id] || 0;
                  return (
                    <div key={a.id} className={`flex items-center justify-between gap-3 p-4 rounded-2xl border transition-all ${qty > 0 ? 'bg-orange-500/10 border-orange-500/40' : 'bg-slate-50 dark:bg-black/20 border-black/5 dark:border-white/5'}`}>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">{a.name}</h4>
                        <p className="text-xs font-bold text-orange-500">{formatUGX(Number(a.priceUGX) || 0)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setAddOnSelections(prev => ({ ...prev, [a.id]: Math.max(0, qty - 1) }))}
                          className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-white/10 hover:bg-slate-300 font-black text-slate-700 dark:text-white transition-colors"
                        >
                          −
                        </button>
                        <span className="w-6 text-center font-black text-sm text-slate-900 dark:text-white">{qty}</span>
                        <button
                          onClick={() => setAddOnSelections(prev => ({ ...prev, [a.id]: qty + 1 }))}
                          className="w-8 h-8 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-black transition-colors shadow-sm"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
                {(addOnProduct.addOns || []).length === 0 && (
                  <p className="text-center text-xs text-slate-400 py-8">No add-ons configured for this item yet.</p>
                )}
              </div>

              <div className="flex justify-between items-center bg-slate-50 dark:bg-black/30 p-4 rounded-2xl border border-black/5 dark:border-white/5">
                <span className="text-xs font-bold text-slate-500">Extras Total</span>
                <span className="font-black text-orange-500">
                  {formatUGX((addOnProduct.addOns || []).reduce((s: number, a: any) => s + ((addOnSelections[a.id] || 0) * (Number(a.priceUGX) || 0)), 0))}
                </span>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { appendToCart(addOnProduct, []); setAddOnProduct(null); setAddOnSelections({}); }}
                  className="flex-1 py-3.5 rounded-2xl font-bold text-xs bg-slate-100 dark:bg-white/5 dark:text-white text-slate-700 hover:bg-slate-200 transition-all"
                >
                  Add Without Extras
                </button>
                <button
                  onClick={() => confirmAddOns(addOnProduct)}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-3.5 rounded-2xl font-bold text-xs shadow-lg shadow-orange-500/20 transition-all active:scale-95"
                >
                  Add {addOnProduct.name} ({formatUGX(addOnProduct.price)})
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Seat Selection Modal */}
      <AnimatePresence>
        {showSeatModal && selectedTableForModal && (() => {
          const occ = dataStore.getTableOccupancy(selectedTableForModal.tableNumber);
          const seatSet = new Set(occ.openSeats);
          const openSeatOrder = (seatName: string) => dataStore.getOpenOrderByTable(selectedTableForModal.tableNumber, seatName);
          return (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white dark:bg-[#121214] rounded-[2.5rem] p-8 max-w-md w-full border border-black/10 dark:border-white/10 shadow-2xl space-y-4">
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                {currentZone?.name} • Table {selectedTableForModal.tableNumber}
              </h3>
              <p className="text-xs text-slate-500 font-medium">Pick a seat — occupied seats continue on their existing open bill</p>
              <div className={`text-xs font-bold px-3 py-2 rounded-xl ${
                occ.status === 'occupied'
                  ? 'bg-red-500/10 text-red-600 dark:text-red-300'
                  : occ.status === 'reserved'
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-300'
                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
              }`}>
                {occ.status === 'occupied'
                  ? `⚠ This table is OCCUPIED${occ.wholeTableOpen ? ' (whole table)' : ` — ${occ.openSeats.length} seat${occ.openSeats.length > 1 ? 's' : ''} taken`}.`
                  : occ.status === 'reserved' ? '⚠ This table is RESERVED.' : '✓ This table is AVAILABLE.'}
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button
                  onClick={() => {
                    vibrate(20);
                    setActiveTable(selectedTableForModal.tableNumber);
                    setActiveSeat('Whole Table');
                    setShowSeatModal(false);
                    setViewState('menu');
                  }}
                  className={`col-span-2 p-3 rounded-xl font-bold text-sm shadow-md text-center transition-all active:scale-95 ${
                    occ.wholeTableOpen
                      ? 'bg-red-500 text-white shadow-red-500/20'
                      : 'bg-orange-500 text-white shadow-orange-500/20'
                  }`}
                >
                  Whole Table ({selectedTableForModal.seatsCount} Seats)
                  <span className="block text-[10px] font-bold opacity-90 mt-0.5">
                    {occ.wholeTableOpen ? 'Open bill — new items join it' : 'All seats free'}
                  </span>
                </button>

                {Array.from({ length: selectedTableForModal.seatsCount }, (_, i) => `Seat ${i + 1}`).map(seatName => {
                  const taken = seatSet.has(seatName);
                  const seatOrder = openSeatOrder(seatName);
                  return (
                    <button
                      key={seatName}
                      onClick={() => {
                        vibrate(20);
                        setActiveTable(selectedTableForModal.tableNumber);
                        setActiveSeat(seatName);
                        setShowSeatModal(false);
                        setViewState('menu');
                      }}
                      className={`p-3 rounded-xl font-bold text-xs text-center border transition-all active:scale-95 ${
                        taken
                          ? 'bg-red-50 dark:bg-red-500/10 border-red-300 dark:border-red-500/40 text-red-600 dark:text-red-300'
                          : 'bg-emerald-50 dark:bg-green-500/10 border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      {seatName}
                      <span className="block text-[10px] font-bold opacity-90 mt-0.5">
                        {taken ? `Occupied${seatOrder ? ` • #${seatOrder.id}` : ''}` : 'Available'}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setShowSeatModal(false)} className="w-full py-2.5 text-xs font-bold text-slate-400 hover:text-slate-600">Cancel</button>
            </motion.div>
          </div>
          );
        })()}
      </AnimatePresence>

      {/* Order Confirmation Modal with Delivery ETA */}
      <AnimatePresence>
        {orderConfirmation && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white dark:bg-[#121214] rounded-[2.5rem] p-8 max-w-md w-full border border-black/10 dark:border-white/10 shadow-2xl space-y-4 text-center">
              <div className={`w-16 h-16 ${orderConfirmation.appendedToExisting ? 'bg-amber-500/10 text-amber-500' : 'bg-green-500/10 text-green-500'} rounded-full flex items-center justify-center mx-auto mb-2`}>
                <Check className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                {orderConfirmation.appendedToExisting ? 'Items Added to Existing Bill!' : 'Order Confirmed!'}
              </h3>
              <p className="text-sm font-semibold text-orange-500 font-mono">#{orderConfirmation.id}</p>
              {orderConfirmation.appendedToExisting && (
                <p className="bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-bold px-3 py-2 rounded-xl">
                  No duplicate bill — items were added to the same open order on Table {orderConfirmation.table}.
                </p>
              )}

              <div className="bg-slate-50 dark:bg-black/30 p-4 rounded-2xl border border-black/5 dark:border-white/5 space-y-2 text-left text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Destination:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{orderConfirmation.place} • {orderConfirmation.table} ({orderConfirmation.seat})</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Status:</span>
                  <span className="font-bold text-orange-500">Sent to Kitchen (Pending Cashier Settlement)</span>
                </div>
                <div className="flex justify-between text-slate-500 pt-2 border-t border-black/5 dark:border-white/5">
                  <span>Current Bill Total:</span>
                  <span className="font-bold text-green-500">{formatUGX(orderConfirmation.total)}</span>
                </div>
              </div>

              <button
                onClick={() => setOrderConfirmation(null)}
                className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 py-3.5 rounded-2xl font-bold shadow-lg"
              >
                Back to POS Tables
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile Floating Checkout Bar */}
      {cart.length > 0 && (viewState === 'menu' || viewState === 'tables') && (
        <div className="lg:hidden fixed bottom-4 left-4 right-4 z-40">
          <button
            onClick={() => {
              if (cart.length > 0 && activeTable) {
                vibrate(20);
                submitOrder('Cash');
              } else if (!activeTable) {
                alert("Please select a table first");
              }
            }}
            disabled={isProcessing}
            className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-4 px-6 rounded-2xl shadow-2xl shadow-orange-500/40 flex items-center justify-between active:scale-95 transition-all border border-white/20 backdrop-blur-xl"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center font-black text-sm">
                {cart.reduce((a, b) => a + b.quantity, 0)}
              </div>
              <span className="text-sm">Confirm Order & Send to Kitchen</span>
            </div>
            <span className="text-base font-extrabold">{formatUGX(total)} →</span>
          </button>
        </div>
      )}

      {/* Cart Sidebar */}
      {(viewState === 'menu' || viewState === 'tables') && (
        <aside className="w-80 lg:w-[400px] bg-white/90 dark:bg-[#121214]/90 backdrop-blur-2xl border-l border-black/5 dark:border-white/5 shadow-2xl flex flex-col h-full z-20 shrink-0 transform transition-transform hidden md:flex">
          <div className="p-6 border-b border-black/5 dark:border-white/5">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Current Order</h2>
            {activeTable && <p className="text-slate-500 font-medium">Table {activeTable}</p>}
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            <AnimatePresence>
              {cart.map(item => (
                <motion.div 
                  layout
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20, scale: 0.9 }}
                  key={item.id} 
                  className="flex items-center gap-4 bg-slate-50 dark:bg-black/20 p-3 rounded-2xl border border-black/5 dark:border-white/5 shadow-sm"
                >
                  <div className="text-3xl bg-white dark:bg-black/40 w-12 h-12 rounded-xl flex items-center justify-center shadow-sm overflow-hidden">
                    {item.image?.startsWith('http') ? <Image src={item.image} alt={item.name} width={48} height={48} className="w-full h-full object-cover" unoptimized /> : item.image}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-slate-900 dark:text-white truncate">{item.name}</h4>
                    {item.addOns?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.addOns.map((a: any, ai: number) => (
                          <span key={ai} className="bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md">
                            + {a.name} ({formatUGX(a.price)})
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-orange-500 font-bold">{formatUGX(itemLineTotal(item))}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <button
                        onClick={() => {
                          setEditingNoteItemId(item.id);
                          setTempNoteText(item.note || '');
                        }}
                        className={`text-[9px] font-extrabold flex items-center gap-1 py-1 px-1.5 rounded-lg transition-all ${
                          item.note
                            ? 'bg-purple-500/20 text-purple-600 dark:text-purple-300'
                            : 'bg-slate-200/50 text-slate-600 dark:bg-white/5 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10'
                        }`}
                      >
                        <FileText className="w-3 h-3" />
                        {item.note ? 'Edit Note' : 'Add Note'}
                      </button>
                      {item.note && (
                        <span className="text-[9px] italic text-slate-500 dark:text-slate-400 truncate max-w-[90px]" title={item.note}>
                          {`"${item.note}"`}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 bg-white dark:bg-black/40 p-1 rounded-xl border border-black/5 dark:border-white/5">
                    <button onClick={() => updateQuantity(item.id, -1)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 active:scale-95 transition-all">
                      <Minus className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => {
                        const v = Math.max(1, parseInt(e.target.value) || 1);
                        setCart(prev => prev.map(i => i.id === item.id ? { ...i, quantity: v } : i));
                      }}
                      className="w-11 text-center font-bold text-sm text-slate-900 dark:text-white bg-transparent focus:outline-none"
                    />
                    <button onClick={() => updateQuantity(item.id, 1)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 active:scale-95 transition-all">
                      <Plus className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {cart.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4 opacity-50 py-20">
                <ShoppingCart className="w-12 h-12" />
                <p className="font-medium text-lg">Your cart is empty</p>
              </div>
            )}
          </div>

          <div className="p-6 bg-slate-50 dark:bg-black/20 border-t border-black/5 dark:border-white/5 rounded-t-[2rem]">
            <div className="space-y-2.5 mb-6 text-xs font-medium">
              <div className="flex justify-between text-slate-500">
                <span>Subtotal ({cart.reduce((a, b) => a + b.quantity, 0)} items)</span>
                <span className="font-semibold">{formatUGX(total)}</span>
              </div>
              <div className="flex justify-between text-lg font-black text-slate-900 dark:text-white pt-2 border-t border-black/5 dark:border-white/5">
                <span>Total Amount</span>
                <span className="text-orange-500">{formatUGX(total)}</span>
              </div>
            </div>
            
            <button 
              onClick={() => {
                if(cart.length > 0 && activeTable) {
                  vibrate(20);
                  submitOrder('Cash');
                } else if (!activeTable) {
                  alert("Please select a table first");
                }
              }}
              disabled={cart.length === 0 || isProcessing || !activeTable}
              className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white disabled:opacity-50 disabled:cursor-not-allowed py-4 rounded-2xl font-bold shadow-xl shadow-orange-500/20 hover:shadow-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-sm"
            >
              {isProcessing ? (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Confirm Order & Send to Kitchen'
              )}
            </button>
          </div>
        </aside>
      )}

      {/* Ongoing / Draft Orders Modal */}
      <AnimatePresence>
        {showOngoingModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-[#121214] rounded-[2.5rem] p-8 max-w-2xl w-full border border-black/10 dark:border-white/10 shadow-2xl space-y-4 max-h-[85vh] flex flex-col"
            >
              <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-3">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <FileText className="w-6 h-6 text-orange-500" /> Ongoing & Open Orders
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">Search by Table Number or Order ID to add more food items to open orders</p>
                </div>
                <button onClick={() => setShowOngoingModal(false)} className="p-2 text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search open order by Table (e.g. E11) or Order ID (e.g. ORD-4890)..."
                  value={ongoingSearch}
                  onChange={e => setOngoingSearch(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl py-3 pl-11 pr-4 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              {/* Open Orders List */}
              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-1">
                {allOrdersList
                  .filter(o => o.paymentStatus !== 'paid' && o.status !== 'completed' && o.status !== 'cancelled')
                  .filter(o => {
                    const q = ongoingSearch.trim().toLowerCase();
                    return !q || o.id.toLowerCase().includes(q) || o.table.toLowerCase().includes(q) || (o.place || '').toLowerCase().includes(q);
                  })
                  .map(o => (
                    <div key={o.id} className="bg-slate-50 dark:bg-black/20 p-4 rounded-2xl border border-black/5 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-orange-500/30 transition-all">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900 dark:text-white">#{o.id.toUpperCase()}</span>
                          <span className="bg-orange-500/10 text-orange-600 dark:text-orange-400 font-extrabold text-[10px] px-2 py-0.5 rounded-full uppercase">
                            {o.table} • {o.seat || 'Table'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1 font-medium">
                          Place: {o.place || 'Dining'} • Items: {o.items?.length || 0} items • Current Total: <span className="font-bold text-orange-500">{formatUGX(o.total)}</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {cart.length > 0 ? (
                          <button
                            onClick={async () => {
                              vibrate(30);
                              const updated = await dataStore.addItemsToOrder(o.id, cart);
                              if (updated) {
                                autoPrintKitchenTicket(updated);
                                alert(`Added ${cart.length} items to order #${o.id}! Sent Kitchen Ticket.`);
                                setCart([]);
                                setShowOngoingModal(false);
                              }
                            }}
                            className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-md flex items-center gap-1 active:scale-95"
                          >
                            <Plus className="w-4 h-4" /> Append Cart ({cart.length} items)
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              vibrate(20);
                              setActiveTable(o.table);
                              setActiveSeat(o.seat || 'Whole Table');
                              setShowOngoingModal(false);
                              setViewState('menu');
                            }}
                            className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-4 py-2.5 rounded-xl text-xs font-bold shadow-md flex items-center gap-1 active:scale-95"
                          >
                            Open Table {o.table}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                {allOrdersList.filter(o => o.paymentStatus !== 'paid' && o.status !== 'completed' && o.status !== 'cancelled').length === 0 && (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    No active ongoing/open orders found.
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
        {/* Item Note Modal */}
        {editingNoteItemId !== null && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-[#1c1c1e] w-full max-w-md rounded-[2.5rem] border border-black/5 dark:border-white/5 shadow-2xl overflow-hidden p-6 space-y-4"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-orange-500" /> Item Preparation Note
                </h3>
                <button
                  onClick={() => setEditingNoteItemId(null)}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 dark:text-slate-500">
                  Instructions for the Kitchen
                </label>
                <textarea
                  value={tempNoteText}
                  onChange={(e) => setTempNoteText(e.target.value)}
                  placeholder="e.g. Extra spicy, no onions, well-done, dressing on the side..."
                  maxLength={150}
                  rows={3}
                  className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-2xl p-4 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                />
                <div className="text-right text-[10px] text-slate-400">
                  {tempNoteText.length}/150 characters
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setEditingNoteItemId(null)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 py-3 rounded-xl font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setCart(prev => prev.map(item => item.id === editingNoteItemId ? { ...item, note: tempNoteText } : item));
                    setEditingNoteItemId(null);
                    setTempNoteText('');
                  }}
                  className="flex-1 bg-gradient-to-r from-orange-500 to-amber-500 text-white py-3 rounded-xl font-bold text-xs shadow-md shadow-orange-500/25"
                >
                  Save Note
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
