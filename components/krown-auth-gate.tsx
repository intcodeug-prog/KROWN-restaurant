'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Smartphone, Eye, EyeOff, AlertCircle, ScanLine } from 'lucide-react';
import { activateDevice, getDeviceId } from '@/lib/device-auth-client';

type StaffProfile = { id: string; name: string; email: string; role: string; branch?: string; assignedBranchId?: string | null; status?: string; avatar?: string };

const KROWN_SUPPORT_WHATSAPP = '+256789649710';

type Mode = 'password' | 'activate';

export function KrownAuthGate() {
  const [visible, setVisible] = useState(() => typeof window !== 'undefined' && window.location.pathname === '/' && !(localStorage.getItem('krown_session_token') && localStorage.getItem('krown_staff_profile')));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<Mode>('password');
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

  useEffect(() => {
    const refresh = () => {
      const authenticated = !!localStorage.getItem('krown_session_token') && !!localStorage.getItem('krown_staff_profile');
      setVisible(window.location.pathname === '/' && !authenticated);
      const currentId = getDeviceId();
      setDeviceId(currentId);
      if (currentId) setMode('password');
    };
    refresh();
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      if (scanTimerRef.current) window.clearInterval(scanTimerRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const isActivated = !!deviceId;

  const passwordStrength = useMemo(() => {
    if (!password) return { label: '', level: 0 };
    let score = 0;
    if (password.length >= 5) score++;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Za-z]/.test(password) && /\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    const labels = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
    return { label: labels[Math.min(score, 4)], level: Math.min(score, 4) };
  }, [password]);

  function finishLogin(staff: StaffProfile, token: string, returnedDeviceId?: string | null) {
    localStorage.setItem('krown_session_token', token);
    localStorage.setItem('krown_staff_profile', JSON.stringify(staff));
    sessionStorage.setItem('krown_active_session', 'true');
    if (returnedDeviceId) {
      localStorage.setItem('krown_device_id', returnedDeviceId);
      setDeviceId(returnedDeviceId);
    }
    setVisible(false);
    window.location.reload();
  }

  function profileFromStaff(s: any): StaffProfile {
    return { id: s.id, name: s.name || 'Staff', email: s.email || '', role: s.role, branch: s.branch || 'Global HQ', assignedBranchId: s.assigned_branch_id || s.assignedBranchId || null, status: s.status || 'active', avatar: s.avatar };
  }

  async function handlePasswordLogin() {
    if (!email.trim() || !password) return setError('Enter your email and password.');
    if (password.length < 5) return setError('Password must be at least 5 characters.');
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim().toLowerCase(), password }) });
      const json = await response.json();
      if (!response.ok || !json?.data?.staff || !json?.data?.token) throw new Error(json?.error || 'Wrong email or password');
      finishLogin(profileFromStaff(json.data.staff), json.data.token, json.data.deviceId);
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
      localStorage.setItem('krown_device_id', data.id);
      setDeviceId(data.id);
      setActivationPin('');
      setMode('password');
      setError('');
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
            const cleaned = value.trim().replace(/^KROWN-ACTIVATE:/i, '');
            if (/^\d{8}$/.test(cleaned)) {
              setBusy(true);
              try {
                const data = await activateDevice(cleaned);
                localStorage.setItem('krown_device_id', data.id);
                setDeviceId(data.id);
                setActivationPin('');
                setMode('password');
                setError('');
              } catch (e: any) {
                setError(e?.message || 'Device activation failed.');
              } finally {
                setBusy(false);
              }
            } else setError('Invalid activation QR.');
          }
        } catch {}
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

  if (!visible) return null;

  return <div className="fixed inset-0 z-[9999] min-h-screen flex items-center justify-center bg-[#F4F4F6] dark:bg-[#08080A] p-4 overflow-y-auto">
    <div className="w-full max-w-md rounded-[2rem] bg-white/95 dark:bg-[#121216]/95 backdrop-blur-2xl border border-black/5 dark:border-white/10 shadow-2xl p-6 sm:p-8">
      <div className="flex flex-col items-center text-center mb-7">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 p-1 shadow-xl shadow-orange-500/25 mb-4"><Image src="/icon.svg" alt="KROWN ERP" width={64} height={64} className="w-full h-full rounded-xl object-contain" priority /></div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">KROWN ERP</h1>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">Secure restaurant staff access</p>
      </div>

      {!isActivated && <div className="mb-6 grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-black/30">
        <button onClick={() => { setMode('password'); setError(''); }} className={`py-3 rounded-xl text-xs font-black transition ${mode === 'password' ? 'bg-white dark:bg-[#1D1D22] shadow text-slate-900 dark:text-white' : 'text-slate-500'}`}>Email + Password</button>
        <button onClick={() => { setMode('activate'); setError(''); }} className={`py-3 rounded-xl text-xs font-black transition ${mode === 'activate' ? 'bg-white dark:bg-[#1D1D22] shadow text-slate-900 dark:text-white' : 'text-slate-500'}`}>Device Activation</button>
      </div>}

      {error && <div className="mb-5 p-3.5 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-2 text-red-500 text-xs font-semibold"><AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span></div>}

      {mode === 'password' && <div className="space-y-4">
        <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email address" className="w-full rounded-2xl bg-slate-50 dark:bg-black/30 border border-black/5 dark:border-white/10 px-4 py-4 text-sm outline-none focus:ring-2 focus:ring-orange-500/40" />
        <div className="relative"><input value={password} onChange={e => setPassword(e.target.value)} type={showPassword ? 'text' : 'password'} placeholder="Password" onKeyDown={e => e.key === 'Enter' && handlePasswordLogin()} className="w-full rounded-2xl bg-slate-50 dark:bg-black/30 border border-black/5 dark:border-white/10 px-4 py-4 pr-12 text-sm outline-none focus:ring-2 focus:ring-orange-500/40" /><button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">{showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button></div>
        {password && <div className="space-y-2"><div className="flex gap-1.5">{[0,1,2,3,4].map(i => <div key={i} className={`h-1.5 flex-1 rounded-full ${i < passwordStrength.level + 1 ? 'bg-orange-500' : 'bg-slate-200 dark:bg-white/10'}`} />)}</div><div className="flex justify-between text-[11px] font-bold"><span className="text-slate-400">Minimum 5 characters</span><span className="text-orange-500">{passwordStrength.label}</span></div></div>}
        <button disabled={busy} onClick={handlePasswordLogin} className="w-full py-4 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black disabled:opacity-60">{busy ? 'Signing in…' : 'Sign in with Email + Password'}</button>
      </div>}

      {!isActivated && mode === 'activate' && <div className="space-y-4">
        <div className="rounded-2xl bg-blue-500/10 border border-blue-500/20 p-4 text-xs text-blue-700 dark:text-blue-300"><div className="font-black flex items-center gap-2"><Smartphone className="w-4 h-4" /> Device activation</div><p className="mt-1 opacity-80">Need to activate this device? Contact the KROWN team on WhatsApp <span className="font-black">{KROWN_SUPPORT_WHATSAPP}</span> for the activation code or QR access.</p></div>
        <input autoFocus type="password" inputMode="numeric" maxLength={8} value={activationPin} onChange={e => setActivationPin(e.target.value.replace(/\D/g, ''))} placeholder="8-digit activation PIN" className="w-full text-center tracking-[0.25em] text-xl font-black bg-slate-50 dark:bg-black/30 border border-black/5 dark:border-white/10 rounded-2xl py-4 outline-none focus:ring-2 focus:ring-orange-500/40" />
        <button disabled={busy} onClick={activate} className="w-full py-4 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black disabled:opacity-60">{busy ? 'Activating…' : 'Activate Device'}</button>
        {scanAvailable && <button onClick={scanning ? stopScanner : startScanner} className="w-full py-3 rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 text-xs font-black flex items-center justify-center gap-2"><ScanLine className="w-4 h-4" /> {scanning ? 'Stop QR Scanner' : 'Scan Activation QR'}</button>}
        {scanning && <video ref={videoRef} muted playsInline className="w-full aspect-square object-cover rounded-2xl bg-black" />}
        <button onClick={() => setMode('password')} className="w-full text-xs font-bold text-slate-500">Back to Email + Password</button>
      </div>}
    </div>
  </div>;
}
