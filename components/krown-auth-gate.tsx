'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { ShieldCheck, ScanLine, Smartphone, LockKeyhole, Eye, EyeOff, AlertCircle, RefreshCw } from 'lucide-react';
import { activateDevice, createDeviceProof, getDeviceId } from '@/lib/device-auth-client';

type StaffProfile = { id: string; name: string; email: string; role: string; branch?: string; assignedBranchId?: string | null; status?: string; avatar?: string };

const KROWN_SUPPORT_WHATSAPP = '+256789649710';

export function KrownAuthGate() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(() => typeof window !== 'undefined' && window.location.pathname === '/' && !(localStorage.getItem('krown_session_token') && localStorage.getItem('krown_staff_profile')));
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'pin' | 'password' | 'activate' | 'forgot-pin'>('pin');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deviceId, setDeviceId] = useState<string | null>(() => getDeviceId());
  const [activationPin, setActivationPin] = useState('');
  const [scanAvailable] = useState(() => typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const [forgotPinStep, setForgotPinStep] = useState<'email' | 'otp' | 'new-pin'>('email');
  const [forgotPinEmail, setForgotPinEmail] = useState('');
  const [forgotPinOtp, setForgotPinOtp] = useState('');
  const [forgotPinNew, setForgotPinNew] = useState('');
  const [forgotPinConfirm, setForgotPinConfirm] = useState('');
  const [forgotPinStaffId, setForgotPinStaffId] = useState('');
  const [forgotPinSuccess, setForgotPinSuccess] = useState(false);

  useEffect(() => {
    if (pathname !== '/') return;
    const refresh = () => {
      const authenticated = !!localStorage.getItem('krown_session_token') && !!localStorage.getItem('krown_staff_profile');
      setVisible(!authenticated);
      setDeviceId(getDeviceId());
    };
    const timer = window.setTimeout(refresh, 0);
    return () => {
      window.clearTimeout(timer);
      if (scanTimerRef.current) window.clearInterval(scanTimerRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [pathname]);

  const isActivated = !!deviceId;
  const pinHint = useMemo(() => 'Enter your staff PIN', []);
  if (!visible) return null;

  function finishLogin(staff: StaffProfile, token: string, returnedDeviceId?: string | null) {
    localStorage.setItem('krown_session_token', token);
    localStorage.setItem('krown_staff_profile', JSON.stringify(staff));
    sessionStorage.setItem('krown_active_session', 'true');
    if (returnedDeviceId) localStorage.setItem('krown_device_id', returnedDeviceId);
    window.location.reload();
  }

  function profileFromStaff(s: any): StaffProfile {
    return { id: s.id, name: s.name || 'Staff', email: s.email || '', role: s.role, branch: s.branch || 'Global HQ', assignedBranchId: s.assigned_branch_id || s.assignedBranchId || null, status: s.status || 'active', avatar: s.avatar };
  }

  async function tryAdminPin(): Promise<boolean> {
    const response = await fetch('/api/auth/pin-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) });
    const json = await response.json();
    if (!response.ok || !json?.data?.staff || !json?.data?.token) return false;
    finishLogin(profileFromStaff(json.data.staff), json.data.token, json.data.deviceId);
    return true;
  }

  async function handlePinLogin() {
    if (!/^\d{4,6}$/.test(pin)) return setError('Enter your 4–6 digit PIN.');
    setBusy(true);
    setError('');
    try {
      if (!isActivated) {
        // Try admin PIN bypass (only super_admin can login without device)
        const adminRes = await fetch('/api/auth/pin-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) });
        const adminJson = await adminRes.json();
        if (adminRes.ok && adminJson?.data?.staff && adminJson?.data?.token) {
          finishLogin(profileFromStaff(adminJson.data.staff), adminJson.data.token, adminJson.data.deviceId);
          return;
        }
        setError('This device is not activated. Contact the KROWN team on WhatsApp +256 789 649 710 for access.');
        setMode('activate');
        return;
      }
      const proof = await createDeviceProof(deviceId!);
      const response = await fetch('/api/auth/pin-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin, deviceId, challenge: proof.challenge, signature: proof.signature }) });
      const json = await response.json();
      if (!response.ok || !json?.data?.staff || !json?.data?.token) throw new Error(json?.error || 'Invalid PIN');
      finishLogin(profileFromStaff(json.data.staff), json.data.token, json.data.deviceId);
    } catch (e: any) {
      setError(e?.message || 'Unable to sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordLogin() {
    if (!email.trim() || !password) return setError('Enter your email and password.');
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim().toLowerCase(), password }) });
      const json = await response.json();
      if (!response.ok || !json?.data?.staff || !json?.data?.token) throw new Error(json?.error || 'Wrong email or password');
      finishLogin(profileFromStaff(json.data.staff), json.data.token);
    } catch (e: any) {
      setError(e?.message || 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  }

  async function activate() {
    const cleaned = activationPin.trim().replace(/^KROWN-ACTIVATE:/i, '');
    if (!/^\d{8}$/.test(cleaned)) return setError('Enter the 8-digit activation PIN provided for this device.');
    setBusy(true);
    setError('');
    try {
      const data = await activateDevice(cleaned);
      setDeviceId(data.id);
      setActivationPin('');
      setMode('pin');
      setError('Device activated. Enter your staff PIN to continue.');
    } catch (e: any) {
      setError(e?.message || 'Device activation failed.');
    } finally {
      setBusy(false);
    }
  }

  async function startScanner() {
    if (!scanAvailable || scanning) return;
    setScanning(true);
    setError('');
    try {
      const Detector = (window as any).BarcodeDetector;
      const detector = new Detector({ formats: ['qr_code'] });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      streamRef.current = stream;
      if (!videoRef.current) throw new Error('Camera preview unavailable');
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      scanTimerRef.current = window.setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        try {
          const results = await detector.detect(videoRef.current);
          const value = results?.[0]?.rawValue;
          if (value) {
            setActivationPin(value);
            stopScanner();
            await activate();
          }
        } catch {
          // Ignore frames that cannot be decoded.
        }
      }, 300);
    } catch (e: any) {
      stopScanner();
      setError(e?.message || 'Camera access was unavailable. Use the activation PIN instead.');
    }
  }

  function stopScanner() {
    if (scanTimerRef.current) window.clearInterval(scanTimerRef.current);
    scanTimerRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setScanning(false);
  }

  async function handleForgotPinRequest() {
    if (!forgotPinEmail.trim()) return setError('Enter your email address.');
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/pin-reset-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotPinEmail.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (data.staffId) setForgotPinStaffId(data.staffId);
      setForgotPinStep('otp');
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Failed to send reset code.');
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPinVerify() {
    if (!forgotPinOtp || forgotPinOtp.length !== 6) return setError('Enter the 6-digit code.');
    if (!forgotPinNew || !/^\d{4,8}$/.test(forgotPinNew)) return setError('New PIN must be 4-8 digits.');
    if (forgotPinNew !== forgotPinConfirm) return setError('PINs do not match.');
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/pin-reset-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: forgotPinStaffId, code: forgotPinOtp, newPin: forgotPinNew }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to reset PIN');
      setForgotPinSuccess(true);
    } catch (e: any) {
      setError(e?.message || 'Failed to reset PIN.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="fixed inset-0 z-[9999] min-h-screen flex items-center justify-center bg-[#F4F4F6] dark:bg-[#08080A] p-4 overflow-y-auto"><div className="w-full max-w-md rounded-[2rem] bg-white/95 dark:bg-[#121216]/95 backdrop-blur-2xl border border-black/5 dark:border-white/10 shadow-2xl p-6 sm:p-8">
    <div className="flex flex-col items-center text-center mb-7"><div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 p-1 shadow-xl shadow-orange-500/25 mb-4"><Image src="/icon.svg" alt="KROWN ERP" width={64} height={64} className="w-full h-full rounded-xl object-contain" priority /></div><h1 className="text-2xl font-black text-slate-900 dark:text-white">KROWN ERP</h1><p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">Secure restaurant staff access</p></div>
    <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-black/30 mb-6"><button onClick={() => { setMode('pin'); setError(''); }} className={`py-3 rounded-xl text-xs font-black transition ${mode === 'pin' ? 'bg-white dark:bg-[#1D1D22] shadow text-slate-900 dark:text-white' : 'text-slate-500'}`}>PIN</button><button onClick={() => { setMode('password'); setError(''); }} className={`py-3 rounded-xl text-xs font-black transition ${mode === 'password' ? 'bg-white dark:bg-[#1D1D22] shadow text-slate-900 dark:text-white' : 'text-slate-500'}`}>Email + Password</button><button onClick={() => { setMode('activate'); setError(''); }} className={`py-3 rounded-xl text-xs font-black transition ${mode === 'activate' ? 'bg-white dark:bg-[#1D1D22] shadow text-slate-900 dark:text-white' : 'text-slate-500'}`}>Device Activation</button></div>
    {mode === 'pin' && <div className="space-y-5"><div className="text-center"><div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-wider"><ShieldCheck className="w-3.5 h-3.5" /> {isActivated ? 'Device ready' : 'PIN login'}</div><p className="text-sm text-slate-500 dark:text-slate-400 mt-3">{pinHint}</p></div><input autoFocus type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} onKeyDown={e => e.key === 'Enter' && handlePinLogin()} placeholder="••••" className="w-full text-center tracking-[0.45em] text-3xl font-black bg-slate-50 dark:bg-black/30 border border-black/5 dark:border-white/10 rounded-2xl py-5 outline-none focus:ring-2 focus:ring-orange-500/40" /><button disabled={busy} onClick={handlePinLogin} className="w-full py-4 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black shadow-lg shadow-orange-500/25 disabled:opacity-60">{busy ? 'Verifying…' : 'Unlock with PIN'}</button>{!isActivated && <button onClick={() => setMode('activate')} className="w-full py-3 rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 text-xs font-bold">Activate device</button>}<button onClick={() => { setMode('forgot-pin'); setForgotPinStep('email'); setForgotPinEmail(''); setForgotPinOtp(''); setForgotPinNew(''); setForgotPinConfirm(''); setForgotPinStaffId(''); setForgotPinSuccess(false); setError(''); }} className="text-[11px] text-orange-500 hover:text-orange-400 font-bold">Forgot PIN?</button><p className="text-[11px] text-center text-slate-400">Waiters, kitchen staff and cashiers enter only their PIN. No username or email is required.</p></div>}
    {mode === 'password' && <div className="space-y-4"><input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email address" className="w-full rounded-2xl bg-slate-50 dark:bg-black/30 border border-black/5 dark:border-white/10 px-4 py-4 text-sm outline-none focus:ring-2 focus:ring-orange-500/40" /><div className="relative"><input value={password} onChange={e => setPassword(e.target.value)} type={showPassword ? 'text' : 'password'} placeholder="Password" onKeyDown={e => e.key === 'Enter' && handlePasswordLogin()} className="w-full rounded-2xl bg-slate-50 dark:bg-black/30 border border-black/5 dark:border-white/10 px-4 py-4 pr-12 text-sm outline-none focus:ring-2 focus:ring-orange-500/40" /><button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">{showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button></div><button disabled={busy} onClick={handlePasswordLogin} className="w-full py-4 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black disabled:opacity-60">{busy ? 'Signing in…' : 'Sign in with Email + Password'}</button><p className="text-[11px] text-center text-slate-400">PIN is the primary KROWN login. Email + password remains available.</p></div>}
    {mode === 'activate' && <div className="space-y-4"><div className="rounded-2xl bg-blue-500/10 border border-blue-500/20 p-4 text-xs text-blue-700 dark:text-blue-300"><div className="font-black flex items-center gap-2"><Smartphone className="w-4 h-4" /> Device activation</div><p className="mt-1 opacity-80">Need to activate this device? Contact the KROWN team on WhatsApp <span className="font-black">{KROWN_SUPPORT_WHATSAPP}</span> for the activation code or QR access.</p></div><input autoFocus type="password" inputMode="numeric" maxLength={8} value={activationPin} onChange={e => setActivationPin(e.target.value.replace(/\D/g, ''))} placeholder="8-digit activation PIN" className="w-full text-center tracking-[0.25em] text-xl font-black bg-slate-50 dark:bg-black/30 border border-black/5 dark:border-white/10 rounded-2xl py-4 outline-none focus:ring-2 focus:ring-orange-500/40" /><button disabled={busy} onClick={activate} className="w-full py-4 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black disabled:opacity-60">{busy ? 'Activating…' : 'Activate Device'}</button>{scanAvailable && <button onClick={scanning ? stopScanner : startScanner} className="w-full py-3 rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 text-xs font-black flex items-center justify-center gap-2"><ScanLine className="w-4 h-4" /> {scanning ? 'Stop QR Scanner' : 'Scan Activation QR'}</button>}{scanning && <video ref={videoRef} muted playsInline className="w-full aspect-square object-cover rounded-2xl bg-black" />}<button onClick={() => setMode('pin')} className="w-full text-xs font-bold text-slate-500">Back to PIN login</button></div>}
    {mode === 'forgot-pin' && !forgotPinSuccess && <div className="space-y-5">
      <div className="text-center"><div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[10px] font-black uppercase tracking-wider"><LockKeyhole className="w-3.5 h-3.5" /> Reset PIN</div><p className="text-sm text-slate-500 dark:text-slate-400 mt-3">{forgotPinStep === 'email' ? 'Enter your email to receive a reset code' : forgotPinStep === 'otp' ? 'Enter the 6-digit code from your email' : 'Set your new 4-8 digit PIN'}</p></div>
      {forgotPinStep === 'email' && <><input autoFocus type="email" value={forgotPinEmail} onChange={e => setForgotPinEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleForgotPinRequest()} placeholder="Email address" className="w-full rounded-2xl bg-slate-50 dark:bg-black/30 border border-black/5 dark:border-white/10 px-4 py-4 text-sm outline-none focus:ring-2 focus:ring-orange-500/40" /><button disabled={busy} onClick={handleForgotPinRequest} className="w-full py-4 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black disabled:opacity-60">{busy ? 'Sending…' : 'Send Reset Code'}</button></>}
      {forgotPinStep === 'otp' && <><input autoFocus type="password" inputMode="numeric" maxLength={6} value={forgotPinOtp} onChange={e => setForgotPinOtp(e.target.value.replace(/\D/g, ''))} placeholder="6-digit code" className="w-full text-center tracking-[0.45em] text-2xl font-black bg-slate-50 dark:bg-black/30 border border-black/5 dark:border-white/10 rounded-2xl py-4 outline-none focus:ring-2 focus:ring-orange-500/40" /><input type="password" inputMode="numeric" maxLength={8} value={forgotPinNew} onChange={e => setForgotPinNew(e.target.value.replace(/\D/g, ''))} placeholder="New PIN (4-8 digits)" className="w-full text-center tracking-[0.3em] text-xl font-black bg-slate-50 dark:bg-black/30 border border-black/5 dark:border-white/10 rounded-2xl py-4 outline-none focus:ring-2 focus:ring-orange-500/40" /><input type="password" inputMode="numeric" maxLength={8} value={forgotPinConfirm} onChange={e => setForgotPinConfirm(e.target.value.replace(/\D/g, ''))} onKeyDown={e => e.key === 'Enter' && handleForgotPinVerify()} placeholder="Confirm new PIN" className="w-full text-center tracking-[0.3em] text-xl font-black bg-slate-50 dark:bg-black/30 border border-black/5 dark:border-white/10 rounded-2xl py-4 outline-none focus:ring-2 focus:ring-orange-500/40" /><button disabled={busy} onClick={handleForgotPinVerify} className="w-full py-4 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black disabled:opacity-60">{busy ? 'Resetting…' : 'Reset PIN'}</button></>}
      <button onClick={() => { setMode('pin'); setError(''); }} className="w-full text-xs font-bold text-slate-500">Back to PIN login</button>
    </div>}
    {mode === 'forgot-pin' && forgotPinSuccess && <div className="space-y-5 text-center">
      <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto"><ShieldCheck className="w-8 h-8 text-emerald-500" /></div>
      <h2 className="text-xl font-black text-slate-900 dark:text-white">PIN Reset Complete</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400">Your PIN has been updated. You can now log in with your new PIN.</p>
      <button onClick={() => { setMode('pin'); setError(''); setForgotPinSuccess(false); setForgotPinStep('email'); }} className="w-full py-4 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black">Log In with New PIN</button>
    </div>}
    {error && <div className="mt-5 rounded-2xl bg-red-500/10 border border-red-500/20 p-3.5 text-xs font-bold text-red-600 dark:text-red-400 flex gap-2"><AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span></div>}
    {busy && <RefreshCw className="w-4 h-4 animate-spin text-orange-500 mx-auto mt-4" />}
    <div className="mt-6 pt-5 border-t border-black/5 dark:border-white/10 text-center text-[10px] text-slate-400 flex items-center justify-center gap-1"><LockKeyhole className="w-3 h-3" /> Secure KROWN authentication</div>
  </div></div>;
}
