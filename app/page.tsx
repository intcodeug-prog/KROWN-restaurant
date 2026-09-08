'use client';

import React, { useState, useEffect, useRef, startTransition } from 'react';
import Image from 'next/image';
import POSPage from '@/components/pos';
import AdminPage from '@/components/admin';
import ManagerPage from '@/components/manager';
import KitchenPage from '@/components/kitchen';
import CashierDashboard from '@/components/cashier';
import SuperAdminDashboard from '@/components/super-admin';
import DashboardAuth from '@/components/dashboard-auth';
import ErrorBoundary from '@/components/error-boundary';
import { UtensilsCrossed, Lock, Mail, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { StaffMember } from '@/lib/mockData';
import { dataStore } from '@/lib/dataStore';
import '@/lib/dataStore-hardening';
import {
  cacheOfflineAuth,
  storeOfflinePasswordHash,
  verifyOfflineCredentials,
  getCachedOfflineProfile,
  isOffline
} from '@/lib/offlineAuth';

/**
 * Normalize DB role names (snake_case) to display role names (Title Case).
 * DB stores: super_admin, branch_manager, cashier, senior_waiter, head_chef, kitchen_staff
 * UI expects: Super Admin, Branch Manager, Cashier, Senior Waiter, Head Chef, Kitchen Staff
 */
function normalizeRole(role: string | null | undefined): StaffMember['role'] {
  if (!role) return 'Cashier';
  const map: Record<string, StaffMember['role']> = {
    super_admin: 'Super Admin',
    admin: 'Super Admin',
    restaurant_admin: 'Restaurant Admin',
    branch_manager: 'Branch Manager',
    manager: 'Branch Manager',
    cashier: 'Cashier',
    senior_waiter: 'Senior Waiter',
    waiter: 'Senior Waiter',
    head_chef: 'Head Chef',
    chef: 'Head Chef',
    kitchen_staff: 'Kitchen Staff',
    'Super Admin': 'Super Admin',
    'Restaurant Admin': 'Restaurant Admin',
    'Branch Manager': 'Branch Manager',
    'Cashier': 'Cashier',
    'Senior Waiter': 'Senior Waiter',
    'Head Chef': 'Head Chef',
    'Kitchen Staff': 'Kitchen Staff',
  };
  return map[role] ?? map[role.toLowerCase()] ?? 'Cashier';
}

export default function AppRouter() {
  const [activeStaff, setActiveStaff] = useState<StaffMember | null>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'pos' | 'admin' | 'manager' | 'kitchen' | 'cashier' | 'super_admin'>('pos');
  const didLoginRef = useRef(false);

  useEffect(() => {
    try {
      const cached = localStorage.getItem('krown_staff_profile');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.id && parsed?.email && parsed?.role) {
          sessionStorage.setItem('krown_active_session', 'true');
          startTransition(() => {
            setActiveStaff(parsed);
            setUser({ uid: parsed.id, displayName: parsed.name, email: parsed.email, photoURL: parsed.avatar, assignedBranchId: parsed.assignedBranchId || null });
            if (parsed.role === 'Super Admin') setView('super_admin');
            else if (parsed.role === 'Restaurant Admin') setView('admin');
            else if (parsed.role === 'Branch Manager') setView('manager');
            else if (parsed.role === 'Cashier') setView('cashier');
            else if (parsed.role === 'Head Chef' || parsed.role === 'Kitchen Staff') setView('kitchen');
            else setView('pos');
          });
        }
      }
    } catch { /* ignore corrupted cache */ }
    startTransition(() => setLoading(false));
  }, []);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [pendingView, setPendingView] = useState<'pos' | 'admin' | 'manager' | 'kitchen' | 'cashier' | null>(null);

  // Auth Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [loginMode, setLoginMode] = useState<'password' | 'pin'>('password');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeStaff) {
      dataStore.setOnlineStaffPresence([]);
      return;
    }
    dataStore.setOnlineStaffPresence([{
      staffId: activeStaff.id,
      email: activeStaff.email,
      branch: activeStaff.branch,
      assignedBranchId: activeStaff.assignedBranchId,
    }]);
  }, [activeStaff]);

  useEffect(() => {
    if (!localStorage.getItem('krown_staff_profile')) {
      startTransition(() => setLoading(false));
      dataStore.refresh().catch(() => {});
      return;
    }
    const controller = new AbortController();
    const apiTimeout = setTimeout(() => controller.abort(), 5000);
    fetch('/api/auth/session', {
      headers: { Authorization: `Bearer ${localStorage.getItem('krown_session_token') || ''}` },
      signal: controller.signal,
    })
      .then(r => r.json())
      .then(json => {
        const authUser = json?.session?.user;
        if (!authUser) {
          if (!didLoginRef.current) {
            localStorage.removeItem('krown_session_token');
            sessionStorage.removeItem('krown_active_session');
            localStorage.removeItem('krown_staff_profile');
            setActiveStaff(null);
            setUser(null);
          }
          return;
        }
        const staff: StaffMember = {
          id: authUser.id,
          name: authUser.name || authUser.email?.split('@')[0] || 'Staff',
          email: authUser.email,
          role: normalizeRole(authUser.role),
          branch: authUser.branch || authUser.branch_name || 'Global HQ',
          assignedBranchId: authUser.assigned_branch_id || null,
          status: authUser.status || 'active',
          avatar: authUser.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(authUser.name || 'Staff')}&background=f97316&color=fff&bold=true&size=200`,
        };
        localStorage.setItem('krown_staff_profile', JSON.stringify(staff));
        setUser({ uid: staff.id, displayName: staff.name, email: staff.email, photoURL: staff.avatar, assignedBranchId: staff.assignedBranchId });
        setActiveStaff(staff);
        if (staff.role === 'Super Admin') setView('super_admin');
        else if (staff.role === 'Restaurant Admin') setView('admin');
        else if (staff.role === 'Branch Manager') setView('manager');
        else if (staff.role === 'Cashier') setView('cashier');
        else if (staff.role === 'Head Chef' || staff.role === 'Kitchen Staff') setView('kitchen');
        else setView('pos');
      })
      .catch(() => {})
      .finally(() => {
        clearTimeout(apiTimeout);
        setLoading(false);
        dataStore.refresh().catch(() => {});
      });
    return () => {
      controller.abort();
      clearTimeout(apiTimeout);
    };
  }, []);

  const handleNavigateWithAuth = (targetView: 'pos' | 'admin' | 'manager' | 'kitchen' | 'cashier' | 'super_admin') => {
    const role = activeStaff?.role;
    if (role === 'Super Admin') { setView(targetView); return; }
    if (role === 'Restaurant Admin') {
      if (targetView !== 'admin') { alert('Access Denied: Restaurant Admin accounts can only access the Admin Panel.'); return; }
      setView(targetView); return;
    }
    if (role === 'Branch Manager') {
      if (targetView === 'admin') { alert('Access Denied: Branch Managers cannot access Super Admin Global HQ Settings.'); return; }
      setView(targetView); return;
    }
    if (role === 'Cashier') {
      if (targetView === 'admin' || targetView === 'manager') { alert('Access Denied: Cashier accounts cannot access Manager or Admin dashboards.'); return; }
      setView(targetView); return;
    }
    if (role === 'Senior Waiter' && targetView !== 'pos') { alert('Access Denied: POS Waiter accounts are restricted to POS view.'); return; }
    if ((role === 'Head Chef' || role === 'Kitchen Staff') && targetView !== 'kitchen') { alert('Access Denied: Kitchen staff accounts are restricted to Kitchen Display.'); return; }
    setView(targetView);
  };

  const handlePinLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || email.trim() === '') { setLoginError('Please enter your staff email address for PIN login.'); return; }
    if (!pin || pin.length < 4) { setLoginError('Please enter your 4-digit PIN code.'); return; }
    setIsSubmitting(true); setLoginError(null);
    const cleanEmail = email.trim().toLowerCase(); let foundStaff: StaffMember | undefined;
    try {
      const res = await fetch('/api/auth/pin-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: cleanEmail, pin }) });
      const json = await res.json();
      if (res.ok && json?.data?.staff) {
        const s = json.data.staff;
        if (json.data.token) localStorage.setItem('krown_session_token', json.data.token);
        foundStaff = { id: s.id, name: s.name || cleanEmail.split('@')[0], email: s.email || cleanEmail, role: normalizeRole(s.role), branch: s.branch || 'Global HQ', assignedBranchId: s.assigned_branch_id || null, status: s.status || 'active', avatar: s.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(s.name || 'Staff')}&background=f97316&color=fff&bold=true&size=200` };
      } else if (!navigator.onLine) {
        const offlineEntry = await verifyOfflineCredentials(cleanEmail, pin);
        if (offlineEntry?.staff) {
          const s = offlineEntry.staff;
          foundStaff = { id: s.id, name: s.name || cleanEmail.split('@')[0], email: s.email || cleanEmail, role: normalizeRole(s.role), branch: s.branch || 'Global HQ', assignedBranchId: s.assigned_branch_id || s.assignedBranchId || null, status: s.status || 'active', avatar: s.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(s.name || 'Staff')}&background=f97316&color=fff&bold=true&size=200` };
        } else { setLoginError('OFFLINE MODE: No cached credentials. Connect to the internet once to cache your login.'); setIsSubmitting(false); return; }
      } else {
        const msg = json?.error || 'Invalid email or PIN'; setLoginError(msg.includes('locked') ? `\uD83D\uDD12 ${msg}` : msg); setIsSubmitting(false); return;
      }
    } catch (err: any) {
      const offlineEntry = await verifyOfflineCredentials(cleanEmail, pin);
      if (offlineEntry?.staff) { const s = offlineEntry.staff; foundStaff = { id: s.id, name: s.name || cleanEmail.split('@')[0], email: s.email || cleanEmail, role: normalizeRole(s.role), branch: s.branch || 'Global HQ', assignedBranchId: s.assigned_branch_id || s.assignedBranchId || null, status: s.status || 'active', avatar: s.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(s.name || 'Staff')}&background=f97316&color=fff&bold=true&size=200` }; }
      else { setLoginError('Login error: ' + (err.message || 'Network unavailable')); setIsSubmitting(false); return; }
    }
    if (foundStaff) {
      if (foundStaff.status === 'banned') { setLoginError('Access Denied: This account is BANNED.'); setIsSubmitting(false); return; }
      if (foundStaff.status === 'paused') { setLoginError('Account On Hold: Your account is currently paused.'); setIsSubmitting(false); return; }
      didLoginRef.current = true;
      setUser({ uid: foundStaff.id, displayName: foundStaff.name, email: foundStaff.email, photoURL: foundStaff.avatar, assignedBranchId: foundStaff.assignedBranchId });
      setActiveStaff(foundStaff); localStorage.setItem('krown_staff_profile', JSON.stringify(foundStaff)); if (typeof window !== 'undefined') sessionStorage.setItem('krown_active_session', 'true');
      if (foundStaff.role === 'Super Admin') setView('super_admin'); else if (foundStaff.role === 'Restaurant Admin') setView('admin'); else if (foundStaff.role === 'Branch Manager') setView('manager'); else if (foundStaff.role === 'Cashier') setView('cashier'); else if (foundStaff.role === 'Head Chef' || foundStaff.role === 'Kitchen Staff') setView('kitchen'); else setView('pos');
      setEmail(''); setPassword(''); setPin(''); setIsSubmitting(false); requestAnimationFrame(() => { dataStore.refresh().catch(() => {}); });
    } else setIsSubmitting(false);
  };

  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginMode === 'pin') return handlePinLogin(e);
    if (!email || !password) { setLoginError('Please enter both email and password.'); return; }
    setIsSubmitting(true); setLoginError(null);
    const cleanEmail = email.trim().toLowerCase(); let foundStaff: StaffMember | undefined; let authData: any = null; let authError: any = null;
    try {
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: cleanEmail, password }) });
      const json = await res.json();
      if (!res.ok || !json?.data?.staff) authError = { message: json?.error || 'Login failed' }; else { authData = json.data; if (authData?.token) localStorage.setItem('krown_session_token', authData.token); }
    } catch (e: any) { authError = e; }
    if (authError) {
      const offlineEntry = await verifyOfflineCredentials(cleanEmail, password);
      if (offlineEntry && offlineEntry.staff) { const s = offlineEntry.staff; foundStaff = { id: s.id, name: s.name || cleanEmail.split('@')[0], email: s.email || cleanEmail, role: normalizeRole(s.role), branch: s.branch || 'Global HQ', assignedBranchId: s.assigned_branch_id || s.assignedBranchId || null, status: s.status || 'active', avatar: s.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(s.name || 'Staff')}&background=f97316&color=fff&bold=true&size=200` }; }
      else if (authError.message?.toLowerCase().includes('failed to fetch') || authError.message?.toLowerCase().includes('network') || isOffline()) setLoginError('OFFLINE MODE: No internet detected and no cached login for this account. Connect to the internet once to cache credentials.');
      else if (authError.message.toLowerCase().includes('invalid login credentials') || authError.message.toLowerCase().includes('invalid_credentials') || authError.message.toLowerCase().includes('invalid email or password')) setLoginError('Wrong email or password. Please try again.');
      else if (authError.message.toLowerCase().includes('email not confirmed')) setLoginError('Please confirm your email address before logging in.');
      else if (authError.message.toLowerCase().includes('too many requests')) setLoginError('Too many login attempts. Please wait a few minutes.');
      else setLoginError(`Login error: ${authError.message}`);
      setIsSubmitting(false); return;
    }
    if (authData?.staff) {
      const s = authData.staff;
      foundStaff = { id: s.id, name: s.name || cleanEmail.split('@')[0], email: s.email || cleanEmail, role: normalizeRole(s.role), branch: s.branch || 'Global HQ', assignedBranchId: s.assigned_branch_id || null, status: s.status || 'active', avatar: s.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(s.name || 'Staff')}&background=f97316&color=fff&bold=true&size=200` };
    } else if (authData?.user) {
      const authUid = authData.user.id; const authEmail = authData.user.email?.toLowerCase() || cleanEmail; let dbStaff: any = null;
      try { const res = await fetch(`/api/db/staff?where=${encodeURIComponent(JSON.stringify({ id: authUid }))}&limit=1`); const { data } = await res.json(); if (data?.length) dbStaff = data[0]; } catch {}
      if (!dbStaff) { try { const res = await fetch(`/api/db/staff?where=${encodeURIComponent(JSON.stringify({ email: authEmail }))}&limit=1`); const { data } = await res.json(); if (data?.length) dbStaff = data[0]; } catch {} }
      if (dbStaff) foundStaff = { id: dbStaff.id, name: dbStaff.name || authEmail.split('@')[0], email: dbStaff.email || authEmail, role: normalizeRole(dbStaff.role), branch: dbStaff.branch || 'Global HQ', assignedBranchId: dbStaff.assigned_branch_id || null, status: dbStaff.status || 'active', avatar: dbStaff.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(dbStaff.name || 'Staff')}&background=f97316&color=fff&bold=true&size=200` };
    }
    if (foundStaff) {
      if (foundStaff.status === 'banned') { setLoginError('Access Denied: This staff account is BANNED by Admin.'); fetch('/api/auth/logout', { method: 'POST' }).catch(() => {}); localStorage.removeItem('krown_staff_profile'); setIsSubmitting(false); return; }
      if (foundStaff.status === 'paused') { setLoginError('Account On Hold: Your shift account is currently paused.'); fetch('/api/auth/logout', { method: 'POST' }).catch(() => {}); localStorage.removeItem('krown_staff_profile'); setIsSubmitting(false); return; }
      didLoginRef.current = true;
      setUser({ uid: foundStaff.id, displayName: foundStaff.name, email: foundStaff.email, photoURL: foundStaff.avatar, assignedBranchId: foundStaff.assignedBranchId });
      if (typeof window !== 'undefined') sessionStorage.setItem('krown_active_session', 'true');
      setActiveStaff(foundStaff); localStorage.setItem('krown_staff_profile', JSON.stringify(foundStaff));
      try { await storeOfflinePasswordHash(cleanEmail, password); await cacheOfflineAuth(foundStaff); } catch {}
      if (foundStaff.role === 'Super Admin') setView('super_admin'); else if (foundStaff.role === 'Restaurant Admin') setView('admin'); else if (foundStaff.role === 'Branch Manager') setView('manager'); else if (foundStaff.role === 'Cashier') setView('cashier'); else if (foundStaff.role === 'Head Chef' || foundStaff.role === 'Kitchen Staff') setView('kitchen'); else setView('pos');
      setEmail(''); setPassword(''); setPin(''); setIsSubmitting(false); requestAnimationFrame(() => { dataStore.refresh().catch(() => {}); }); return;
    }
    setLoginError('Login failed. Account not found.'); setIsSubmitting(false);
  };

  if (loading) return null;
  if (!user) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F4F4F6] dark:bg-[#0A0A0C] text-slate-900 dark:text-slate-100 p-4">
      <div className="w-full max-w-md bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl p-8 rounded-[2.5rem] shadow-2xl border border-black/5 dark:border-white/10 ring-1 ring-black/5 dark:ring-white/10">
        <div className="flex flex-col items-center mb-6">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-xl shadow-orange-500/30 mb-4 p-1 overflow-hidden ring-4 ring-orange-500/20 bg-gradient-to-br from-orange-500 to-amber-500"><Image src="/icon.svg" alt="KROWN ERP Logo" width={80} height={80} className="w-full h-full object-contain rounded-2xl" priority /></div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-center">KROWN ERP</h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-1 text-center font-medium">Multi-Branch Enterprise POS & Management System</p>
        </div>
        <div className="flex bg-slate-100 dark:bg-black/40 p-1 rounded-2xl mb-6 border border-black/5 dark:border-white/10">
          <button type="button" onClick={() => { setLoginMode('password'); setLoginError(null); }} className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all ${loginMode === 'password' ? 'bg-white dark:bg-[#1A1A1E] text-slate-900 dark:text-white shadow-md' : 'text-slate-500 dark:text-slate-400'}`}>Password Login</button>
          <button type="button" onClick={() => { setLoginMode('pin'); setLoginError(null); }} className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all ${loginMode === 'pin' ? 'bg-white dark:bg-[#1A1A1E] text-slate-900 dark:text-white shadow-md' : 'text-slate-500 dark:text-slate-400'}`}>🔑 Staff PIN Code</button>
        </div>
        <form onSubmit={handleStaffLogin} className="space-y-4">
          {loginMode === 'password' ? (
            <>
              <div><label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">Staff Email Address</label><div className="relative"><Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" /><input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" className="w-full bg-slate-50 dark:bg-black/40 border border-black/5 dark:border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all text-sm font-medium" /></div></div>
              <div><label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">Password</label><div className="relative"><Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" /><input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="w-full bg-slate-50 dark:bg-black/40 border border-black/5 dark:border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all text-sm font-medium" /></div></div>
            </>
          ) : (
            <>
              <div><label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">Staff Email</label><div className="relative"><Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" /><input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" className="w-full bg-slate-50 dark:bg-black/40 border border-black/5 dark:border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all text-sm font-medium" /></div></div>
              <div><label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">4-Digit Security PIN</label><div className="relative"><Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" /><input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} required value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} placeholder="Enter 4-digit PIN..." className="w-full bg-slate-50 dark:bg-black/40 border border-black/5 dark:border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all text-sm font-medium tracking-widest text-center text-lg" /></div></div>
            </>
          )}
          {loginError && <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-2 text-red-500 text-xs font-semibold"><ShieldAlert className="w-4 h-4 shrink-0" /><span>{loginError}</span></div>}
          <button type="submit" disabled={isSubmitting} className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-orange-500/30 transition-all active:scale-[0.98] text-center flex items-center justify-center gap-2">{isSubmitting ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span className="text-sm">Verifying...</span></> : (loginMode === 'pin' ? 'Unlock POS with PIN' : 'Log In to Staff Dashboard')}</button>
        </form>
        <div className="mt-4"><button onClick={() => alert('📱 To install KROWN ERP as an App:\n\n1. On Chrome/Android: Tap menu (⋮) -> "Install App" or "Add to Home Screen".\n2. On Safari/iOS: Tap Share icon -> "Add to Home Screen".')} className="w-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 py-3 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all border border-black/5 dark:border-white/10">📱 Install KROWN ERP Desktop/Mobile App (Offline Enabled)</button></div>
      </div>
    </div>
  );

  return (
    <ErrorBoundary>
      <AnimatePresence mode="wait">
        {view === 'pos' && <motion.div key="pos" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} className="h-screen w-full absolute top-0 left-0 bg-[#F4F4F6] dark:bg-[#0A0A0C]"><POSPage user={user} setView={handleNavigateWithAuth} activeStaff={activeStaff} /></motion.div>}
        {view === 'cashier' && <motion.div key="cashier" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} className="min-h-screen w-full absolute top-0 left-0 bg-[#F4F4F6] dark:bg-[#0A0A0C]"><CashierDashboard setView={handleNavigateWithAuth} activeStaff={activeStaff} /></motion.div>}
        {view === 'admin' && <motion.div key="admin" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} className="min-h-screen w-full absolute top-0 left-0 bg-[#F4F4F6] dark:bg-[#0A0A0C]"><AdminPage user={user} setView={handleNavigateWithAuth} /></motion.div>}
        {view === 'super_admin' && <motion.div key="super_admin" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} className="min-h-screen w-full absolute top-0 left-0 bg-[#F4F4F6] dark:bg-[#0A0A0C]"><SuperAdminDashboard user={user} setView={handleNavigateWithAuth} activeStaff={activeStaff} /></motion.div>}
        {view === 'manager' && <motion.div key="manager" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} className="min-h-screen w-full absolute top-0 left-0 bg-[#F4F4F6] dark:bg-[#0A0A0C]"><ManagerPage user={user} setView={handleNavigateWithAuth} /></motion.div>}
        {view === 'kitchen' && <motion.div key="kitchen" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} className="min-h-screen w-full absolute top-0 left-0 bg-[#F4F4F6] dark:bg-[#0A0A0C]"><KitchenPage setView={handleNavigateWithAuth} activeStaff={activeStaff} /></motion.div>}
      </AnimatePresence>
      <AnimatePresence>{showAuthModal && pendingView && <DashboardAuth targetTitle={pendingView.toUpperCase()} onAuthenticated={staff => { setActiveStaff(staff); setView(pendingView); setShowAuthModal(false); setPendingView(null); }} onCancel={() => { setShowAuthModal(false); setPendingView(null); }} />}</AnimatePresence>
    </ErrorBoundary>
  );
}
