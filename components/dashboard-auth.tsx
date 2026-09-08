'use client';

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Lock, ShieldAlert, KeyRound, Mail } from 'lucide-react';
import { dataStore } from '@/lib/dataStore';
import { vibrate } from '@/lib/utils';
import { StaffMember } from '@/lib/mockData';

interface DashboardAuthProps {
  requiredRole?: 'Super Admin' | 'Branch Manager' | 'Head Chef' | 'Cashier' | 'Senior Waiter' | 'any';
  targetTitle: string;
  targetIcon?: React.ReactNode;
  onAuthenticated: (staff: StaffMember) => void;
  onCancel?: () => void;
}

export default function DashboardAuth({
  requiredRole = 'any',
  targetTitle,
  targetIcon,
  onAuthenticated,
  onCancel
}: DashboardAuthProps) {
  const [authMethod, setAuthMethod] = useState<'password' | 'pin'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [pinAttempt, setPinAttempt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const staffList = dataStore.getStaff();

  const handleVerifyCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSubmitting(true);
    vibrate(20);

    try {
      if (authMethod === 'password') {
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail || !password) {
          setErrorMsg('Please enter both staff email address and password.');
          setIsSubmitting(false);
          return;
        }

        // 1. Primary Auth via Neon API
        let authData: any = null;
        let authError: any = null;
        try {
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: cleanEmail, password }),
          });
          const json = await res.json();
          if (!res.ok || !json?.data?.staff) {
            authError = { message: json?.error || 'Login failed' };
          } else {
            authData = json.data;
            // Store JWT token so subsequent API calls are authenticated
            if (authData?.token) {
              localStorage.setItem('krown_session_token', authData.token);
            }
          }
        } catch (e: any) {
          authError = e;
        }

        if (authError) {
          setErrorMsg('Invalid email or password. Please check your credentials and try again.');
          setIsSubmitting(false);
          return;
        }

        if (authData?.staff) {
          // Find matching staff record by email or staff id
          const found = staffList.find(s => 
            s.id === authData.staff.id || s.email.toLowerCase() === cleanEmail
          ) || authData.staff;

          if (!found) {
            setErrorMsg('Authenticated, but no matching staff profile was found in the database.');
            setIsSubmitting(false);
            return;
          }

          if (found.status === 'banned') {
            setErrorMsg('Access Denied: This staff account has been BANNED by Admin.');
            setIsSubmitting(false);
            return;
          }

          if (found.status === 'paused') {
            setErrorMsg('Account On Hold: Shift is currently paused/on hold.');
            setIsSubmitting(false);
            return;
          }

          onAuthenticated(found);
        }
      } else {
        // 2. Quick PIN Unlock via Server-side RPC Function
        if (!selectedStaffId) {
          setErrorMsg('Please select a staff member.');
          setIsSubmitting(false);
          return;
        }
        if (!pinAttempt || pinAttempt.length < 4) {
          setErrorMsg('Please enter a valid 4-digit PIN.');
          setIsSubmitting(false);
          return;
        }

        const targetStaff = staffList.find(s => s.id === selectedStaffId);
        if (!targetStaff) {
          setErrorMsg('Staff member not found.');
          setIsSubmitting(false);
          return;
        }

        // Invoke server-side PIN verification via Neon API
        let isValidPin = false;
        try {
          const res = await fetch('/api/rpc/verify_staff_pin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ staff_id: targetStaff.id, pin_attempt: pinAttempt }),
          });
          const json = await res.json();
          isValidPin = json?.data === true || json?.valid === true;
        } catch (rpcError: any) {
          console.warn('[DashboardAuth] PIN verification error:', rpcError.message);
          setErrorMsg('PIN verification failed. Account may be temporarily locked due to failed attempts.');
          setIsSubmitting(false);
          return;
        }

        if (!isValidPin) {
          setErrorMsg('Incorrect PIN. Multiple failed attempts will lock your account.');
          setIsSubmitting(false);
          return;
        }

        if (targetStaff.status === 'banned') {
          setErrorMsg('Access Denied: This staff account has been BANNED by Admin.');
          setIsSubmitting(false);
          return;
        }

        if (targetStaff.status === 'paused') {
          setErrorMsg('Account On Hold: Shift is currently paused/on hold.');
          setIsSubmitting(false);
          return;
        }

        onAuthenticated(targetStaff);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Authentication failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white/90 dark:bg-[#121214]/90 backdrop-blur-2xl rounded-[3rem] p-8 max-w-lg w-full border border-black/10 dark:border-white/10 shadow-2xl space-y-6"
      >
        <div className="text-center flex flex-col items-center">
          <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-amber-500 rounded-3xl flex items-center justify-center shadow-lg shadow-orange-500/30 mb-4 text-white">
            {targetIcon || <Lock className="w-8 h-8" />}
          </div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{targetTitle} Auth</h2>
          <p className="text-slate-500 text-xs font-semibold mt-1">Authenticate staff account to unlock dashboard access</p>

          {/* Mode Switcher Tabs */}
          <div className="flex bg-slate-100 dark:bg-black/40 p-1 rounded-2xl mt-4 w-full border border-black/5 dark:border-white/5">
            <button
              type="button"
              onClick={() => { setAuthMethod('password'); setErrorMsg(null); }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                authMethod === 'password'
                  ? 'bg-orange-500 text-white shadow-md'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Password Login</span>
            </button>
            <button
              type="button"
              onClick={() => { setAuthMethod('pin'); setErrorMsg(null); }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                authMethod === 'pin'
                  ? 'bg-orange-500 text-white shadow-md'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Quick PIN Unlock</span>
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-2 text-red-500 text-xs font-bold">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleVerifyCredentials} className="space-y-4">
          {authMethod === 'password' ? (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Staff Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full bg-slate-50 dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-2xl py-3.5 px-4 text-slate-900 dark:text-white font-medium text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-2xl py-3.5 px-4 text-slate-900 dark:text-white font-medium text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Select Staff Account</label>
                <select
                  required
                  value={selectedStaffId}
                  onChange={e => setSelectedStaffId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-2xl py-3.5 px-4 text-slate-900 dark:text-white font-medium text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="">-- Choose Staff Member --</option>
                  {staffList.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.role} - {s.branch})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">4-Digit Quick PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  value={pinAttempt}
                  onChange={e => setPinAttempt(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full bg-slate-50 dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-2xl py-3.5 px-4 text-slate-900 dark:text-white font-medium text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 text-center tracking-widest text-lg font-mono"
                />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white py-4 rounded-2xl font-bold shadow-xl shadow-orange-500/20 transition-all active:scale-[0.98] text-sm flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              'Verify & Log Into Dashboard'
            )}
          </button>
        </form>

        {onCancel && (
          <button
            onClick={onCancel}
            className="w-full py-3 text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
          >
            Cancel & Return
          </button>
        )}
      </motion.div>
    </div>
  );
}
