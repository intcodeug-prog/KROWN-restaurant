'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2, Shield, ArrowLeft } from 'lucide-react';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'valid' | 'invalid' | 'success' | 'error'>('loading');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!token) { if (!cancelled) { setStatus('invalid'); setErrorMsg('No reset token provided'); } return; }
      try {
        const res = await fetch(`/api/reset-password/verify?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!cancelled) {
          if (data.valid) setStatus('valid');
          else { setStatus('invalid'); setErrorMsg(data.error || 'Invalid or expired link'); }
        }
      } catch { if (!cancelled) { setStatus('invalid'); setErrorMsg('Failed to verify reset link'); } }
    };
    run();
    return () => { cancelled = true; };
  }, [token]);

  const passwordChecks = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'Uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'Lowercase letter', met: /[a-z]/.test(password) },
    { label: 'Number', met: /[0-9]/.test(password) },
  ];
  const isPasswordValid = passwordChecks.every(c => c.met);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPasswordValid) return;
    if (password !== confirmPassword) { setErrorMsg('Passwords do not match'); return; }
    setSubmitting(true); setErrorMsg('');
    try {
      const res = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (data.success) { setStatus('success'); setSuccessMsg(data.message || 'Password reset successfully'); }
      else setErrorMsg(data.error || 'Failed to reset password');
    } catch { setErrorMsg('Network error. Please try again.'); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-orange-500/20">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Reset Password</h1>
          <p className="text-sm text-slate-400">Set a new secure password for your account</p>
        </div>

        <div className="bg-[#121214] rounded-[2rem] p-8 border border-white/10 shadow-2xl">
          <AnimatePresence mode="wait">
            {status === 'loading' && (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center py-8 gap-4">
                <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
                <p className="text-slate-400 text-sm">Verifying reset link...</p>
              </motion.div>
            )}

            {status === 'invalid' && (
              <motion.div key="invalid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center py-8 gap-4">
                <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center">
                  <AlertCircle className="w-7 h-7 text-red-500" />
                </div>
                <h2 className="text-lg font-bold text-white">Link Invalid</h2>
                <p className="text-slate-400 text-sm text-center max-w-xs">{errorMsg}</p>
                <button onClick={() => router.push('/')} className="mt-4 flex items-center gap-2 text-sm text-orange-400 hover:text-orange-300 transition-colors">
                  <ArrowLeft className="w-4 h-4" /> Back to Login
                </button>
              </motion.div>
            )}

            {status === 'success' && (
              <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center py-8 gap-4">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, delay: 0.1 }}
                  className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-green-500" />
                </motion.div>
                <h2 className="text-lg font-bold text-white">Password Reset!</h2>
                <p className="text-slate-400 text-sm text-center max-w-xs">{successMsg}</p>
                <button onClick={() => router.push('/')}
                  className="mt-4 bg-gradient-to-r from-orange-500 to-amber-500 text-black font-bold py-3 px-8 rounded-xl hover:shadow-lg hover:shadow-orange-500/20 transition-all">
                  Go to Login
                </button>
              </motion.div>
            )}

            {status === 'valid' && (
              <motion.form key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onSubmit={handleSubmit} className="space-y-5">
                {errorMsg && (
                  <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {errorMsg}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="Enter new password" required
                      className="w-full bg-black/30 border border-white/10 rounded-xl py-3 pl-10 pr-11 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {password && (
                    <div className="grid grid-cols-2 gap-1.5 mt-2">
                      {passwordChecks.map(check => (
                        <div key={check.label} className={`flex items-center gap-1.5 text-xs ${check.met ? 'text-green-400' : 'text-slate-500'}`}>
                          <CheckCircle2 className={`w-3 h-3 ${check.met ? 'text-green-400' : 'text-slate-600'}`} />
                          {check.label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input type={showConfirm ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password" required
                      className={`w-full bg-black/30 border rounded-xl py-3 pl-10 pr-11 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 transition-all ${
                        confirmPassword && password !== confirmPassword ? 'border-red-500/50 focus:ring-red-500/50' : 'border-white/10 focus:ring-orange-500/50 focus:border-orange-500/50'
                      }`} />
                    <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {confirmPassword && password !== confirmPassword && (
                    <p className="text-xs text-red-400 mt-1">Passwords do not match</p>
                  )}
                </div>

                <button type="submit" disabled={submitting || !isPasswordValid || password !== confirmPassword}
                  className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-black font-bold py-3.5 rounded-xl shadow-lg shadow-orange-500/20 disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-xl hover:shadow-orange-500/30 transition-all flex items-center justify-center gap-2">
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Resetting...</> : 'Reset Password'}
                </button>

                <button type="button" onClick={() => router.push('/')}
                  className="w-full text-center text-sm text-slate-500 hover:text-slate-300 transition-colors py-2">
                  Back to Login
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">KROWN POS &mdash; Secure Password Reset</p>
      </motion.div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
