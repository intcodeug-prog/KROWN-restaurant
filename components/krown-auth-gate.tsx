'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Eye, EyeOff, ScanLine, ShieldCheck, Smartphone, WifiOff } from 'lucide-react';
import { activateDevice, createDeviceProof, getDeviceId } from '@/lib/device-auth-client';
import { verifyOfflineCredentials, verifyOfflinePin, storeOfflinePasswordHash, storeOfflinePin, cacheOfflineAuth } from '@/lib/offlineAuth';

type StaffProfile = { id: string; name: string; email: string; role: string; branch?: string; assignedBranchId?: string | null; organizationId?: string | null; status?: string; avatar?: string };
type Mode = 'pin' | 'password' | 'activate';
const KROWN_LOGO = 'https://iili.io/nK49crl.png';
const KROWN_SUPPORT_WHATSAPP = '+256789649710';

export function KrownAuthGate() {
  const [visible, setVisible] = useState(() => typeof window !== 'undefined' && window.location.pathname === '/' && !(localStorage.getItem('krown_session_token') && localStorage.getItem('krown_staff_profile')));
  const [mode, setMode] = useState<Mode>('pin');
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deviceId, setDeviceId] = useState<string | null>(() => getDeviceId());
  const [activationPin, setActivationPin] = useState('');
  const [scanning, setScanning] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const [scanAvailable] = useState(() => typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const refresh = () => {
      const authenticated = !!localStorage.getItem('krown_session_token') && !!localStorage.getItem('krown_staff_profile');
      setVisible(window.location.pathname === '/' && !authenticated);
      setDeviceId(getDeviceId());
    };
    const onlineHandler = () => setOnline(true);
    const offlineHandler = () => setOnline(false);
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('online', onlineHandler);
    window.addEventListener('offline', offlineHandler);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('online', onlineHandler);
      window.removeEventListener('offline', offlineHandler);
      if (scanTimerRef.current) window.clearInterval(scanTimerRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const isActivated = !!deviceId;
  const passwordStrength = useMemo(() => {
    if (!password) return { label: '', level: 0 };
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Za-z]/.test(password) && /\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return { label: ['Weak', 'Fair', 'Strong', 'Very strong'][Math.min(score, 3)], level: Math.min(score, 3) };
  }, [password]);

  function profileFromStaff(s: any): StaffProfile {
    return { id: s.id, name: s.name || 'Staff', email: s.email || '', role: s.role, branch: s.branch || 'Branch', assignedBranchId: s.assigned_branch_id || s.assignedBranchId || null, organizationId: s.organization_id || s.organizationId || null, status: s.status || 'active', avatar: s.avatar };
  }

  function finishLogin(staff: StaffProfile, token: string, returnedDeviceId?: string | null) {
    localStorage.setItem('krown_session_token', token);
    localStorage.setItem('krown_staff_profile', JSON.stringify(staff));
    if (staff.organizationId) localStorage.setItem('krown_organization_id', staff.organizationId);
    if (staff.assignedBranchId) localStorage.setItem('krown_branch_id', staff.assignedBranchId);
    if (returnedDeviceId) localStorage.setItem('krown_device_id', returnedDeviceId);
    sessionStorage.setItem('krown_active_session', 'true');
    // Do NOT reload the PWA after authentication. The previous hard reload caused
    // the visible flash and could race the auth overlay/AppRouter. Reveal the
    // already-mounted application immediately and let it hydrate from local cache.
    setVisible(false);
    window.dispatchEvent(new CustomEvent('krown-authenticated', { detail: { staffId: staff.id, organizationId: staff.organizationId, branchId: staff.assignedBranchId } }));
  }

  async function handlePinLogin() {
    if (!/^\d{4,6}$/.test(pin)) { setError('Enter your 4–6 digit PIN.'); return; }
    if (!isActivated) { setError('This computer is not activated for a restaurant or branch.'); return; }
    setBusy(true); setError('');
    try {
      if (!online) {
        const cached = await verifyOfflinePin(pin);
        if (!cached) throw new Error('Wrong PIN for this activated restaurant or branch.');
        finishLogin(profileFromStaff(cached.staff), `offline:${cached.deviceId}:${Date.now()}`, cached.deviceId);
        return;
      }
      const proof = await createDeviceProof(deviceId!);
      const response = await fetch('/api/auth/pin-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin, deviceId, challenge: proof.challenge, signature: proof.signature }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.data?.staff || !json?.data?.token) throw new Error(json?.error || 'Wrong PIN for this restaurant or branch.');
      const staff = profileFromStaff(json.data.staff);
      await cacheOfflineAuth(staff);
      await storeOfflinePin(staff, pin);
      finishLogin(staff, json.data.token, json.data.deviceId);
    } catch (e: any) { setError(e?.message || 'Unable to sign in.'); }
    finally { setBusy(false); }
  }

  async function handlePasswordLogin() {
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    if (!isActivated) { setError('This computer is not activated for a restaurant or branch.'); return; }
    setBusy(true); setError('');
    try {
      if (!online) {
        const cached = await verifyOfflineCredentials(email, password);
        if (!cached) throw new Error('Wrong email or password for this activated restaurant or branch.');
        finishLogin(profileFromStaff(cached.staff), `offline:${cached.deviceId}:${Date.now()}`, cached.deviceId);
        return;
      }
      const proof = await createDeviceProof(deviceId!);
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim().toLowerCase(), password, deviceId, deviceProof: proof }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.data?.staff || !json?.data?.token) throw new Error(json?.error || 'Wrong email or password for this restaurant or branch.');
      const staff = profileFromStaff(json.data.staff);
      await cacheOfflineAuth(staff);
      await storeOfflinePasswordHash(staff.email, password);
      finishLogin(staff, json.data.token, json.data.deviceId);
    } catch (e: any) { setError(e?.message || 'Unable to sign in.'); }
    finally { setBusy(false); }
  }

  async function activate() {
    const cleaned = activationPin.trim().replace(/^KROWN-ACTIVATE:/i, '');
    if (!/^\d{8}$/.test(cleaned)) { setError('Enter the 8-digit activation code.'); return; }
    setBusy(true); setError('');
    try {
      const data = await activateDevice(cleaned);
      localStorage.setItem('krown_device_id', data.id);
      if (data.organization_id) localStorage.setItem('krown_organization_id', data.organization_id);
      if (data.branch_id) localStorage.setItem('krown_branch_id', data.branch_id);
      setDeviceId(data.id); setActivationPin(''); setMode('pin');
    } catch (e: any) { setError(e?.message || 'Invalid activation code for this restaurant or branch.'); }
    finally { setBusy(false); }
  }

  async function startScanner() {
    if (!scanAvailable || scanning) return;
    setScanning(true); setError('');
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
          if (!value) return;
          stopScanner();
          const cleaned = value.trim().replace(/^KROWN-ACTIVATE:/i, '');
          if (!/^\d{8}$/.test(cleaned)) { setError('Invalid activation code.'); return; }
          setActivationPin(cleaned); setBusy(true);
          try {
            const data = await activateDevice(cleaned);
            localStorage.setItem('krown_device_id', data.id);
            if (data.organization_id) localStorage.setItem('krown_organization_id', data.organization_id);
            if (data.branch_id) localStorage.setItem('krown_branch_id', data.branch_id);
            setDeviceId(data.id); setActivationPin(''); setMode('pin');
          } catch (e: any) { setError(e?.message || 'Invalid activation code for this restaurant or branch.'); }
          finally { setBusy(false); }
        } catch {}
      }, 300);
    } catch (e: any) { stopScanner(); setError(e?.message || 'Camera unavailable. Enter the activation code instead.'); }
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
        <div className="w-16 h-16 rounded-2xl bg-white dark:bg-[#1D1D22] p-2 shadow-xl mb-4"><img src={KROWN_LOGO} alt="KROWN ERP" width={64} height={64} className="w-full h-full rounded-xl object-contain" /></div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">KROWN ERP</h1>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">Secure restaurant staff access</p>
      </div>

      <div className={`grid ${isActivated ? 'grid-cols-2' : 'grid-cols-3'} gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-black/30 mb-6`}>
        <button onClick={() => { setMode('pin'); setError(''); }} className={`py-3 rounded-xl text-xs font-black ${mode === 'pin' ? 'bg-white dark:bg-[#1D1D22] shadow text-slate-900 dark:text-white' : 'text-slate-500'}`}>PIN</button>
        <button onClick={() => { setMode('password'); setError(''); }} className={`py-3 rounded-xl text-xs font-black ${mode === 'password' ? 'bg-white dark:bg-[#1D1D22] shadow text-slate-900 dark:text-white' : 'text-slate-500'}`}>Email + Password</button>
        {!isActivated && <button onClick={() => { setMode('activate'); setError(''); }} className={`py-3 rounded-xl text-xs font-black ${mode === 'activate' ? 'bg-white dark:bg-[#1D1D22] shadow text-slate-900 dark:text-white' : 'text-slate-500'}`}>Activate</button>}
      </div>

      {error && <div className="mb-5 p-3.5 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-2 text-red-500 text-xs font-semibold"><AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span></div>}

      {mode === 'pin' && <div className="space-y-5">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-wider"><ShieldCheck className="w-3.5 h-3.5" /> {isActivated ? 'Activated device' : 'Device not activated'}</div>
          {!online && <div className="inline-flex items-center gap-1 ml-2 px-2 py-1 rounded-full bg-slate-500/10 text-slate-500 text-[10px] font-black"><WifiOff className="w-3 h-3" /> Offline</div>}
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-3">Enter your staff PIN</p>
        </div>
        <input autoFocus type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} onKeyDown={e => e.key === 'Enter' && handlePinLogin()} placeholder="••••" className="w-full text-center tracking-[0.45em] text-3xl font-black bg-slate-50 dark:bg-black/30 border border-black/5 dark:border-white/10 rounded-2xl py-5 outline-none focus:ring-2 focus:ring-orange-500/40" />
        <button disabled={busy || !isActivated} onClick={handlePinLogin} className="w-full py-4 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black shadow-lg shadow-orange-500/25 disabled:opacity-60">{busy ? 'Verifying…' : 'Unlock with PIN'}</button>
        {!isActivated && <button onClick={() => setMode('activate')} className="w-full py-3 rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 text-xs font-bold">Activate this computer</button>}
        <p className="text-[11px] text-center text-slate-400">This PIN is checked against the activated restaurant and branch on this computer.</p>
      </div>}

      {mode === 'password' && <div className="space-y-4">
        <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email address" className="w-full rounded-2xl bg-slate-50 dark:bg-black/30 border border-black/5 dark:border-white/10 px-4 py-4 text-sm outline-none focus:ring-2 focus:ring-orange-500/40" />
        <div className="relative"><input value={password} onChange={e => setPassword(e.target.value)} type={showPassword ? 'text' : 'password'} placeholder="Password" onKeyDown={e => e.key === 'Enter' && handlePasswordLogin()} className="w-full rounded-2xl bg-slate-50 dark:bg-black/30 border border-black/5 dark:border-white/10 px-4 py-4 pr-12 text-sm outline-none focus:ring-2 focus:ring-orange-500/40" /><button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">{showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button></div>
        {password && <div className="space-y-2"><div className="flex gap-1.5">{[0,1,2,3].map(i => <div key={i} className={`h-1.5 flex-1 rounded-full ${i < passwordStrength.level + 1 ? 'bg-orange-500' : 'bg-slate-200 dark:bg-white/10'}`} />)}</div><div className="flex justify-between text-[11px] font-bold"><span className="text-slate-400">Use your registered password</span><span className="text-orange-500">{passwordStrength.label}</span></div></div>}
        <button disabled={busy || !isActivated} onClick={handlePasswordLogin} className="w-full py-4 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black disabled:opacity-60">{busy ? 'Signing in…' : 'Sign in'}</button>
      </div>}

      {mode === 'activate' && !isActivated && <div className="space-y-4">
        <div className="rounded-2xl bg-blue-500/10 border border-blue-500/20 p-4 text-xs text-blue-700 dark:text-blue-300"><div className="font-black flex items-center gap-2"><Smartphone className="w-4 h-4" /> Device activation</div><p className="mt-1 opacity-80">Enter the activation code assigned to this restaurant and branch. A code for another restaurant is invalid here.</p></div>
        <input autoFocus type="password" inputMode="numeric" maxLength={8} value={activationPin} onChange={e => setActivationPin(e.target.value.replace(/\D/g, ''))} placeholder="8-digit activation code" className="w-full text-center tracking-[0.25em] text-xl font-black bg-slate-50 dark:bg-black/30 border border-black/5 dark:border-white/10 rounded-2xl py-4 outline-none focus:ring-2 focus:ring-orange-500/40" />
        <button disabled={busy} onClick={activate} className="w-full py-4 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black disabled:opacity-60">{busy ? 'Activating…' : 'Activate Computer'}</button>
        {scanAvailable && <button onClick={scanning ? stopScanner : startScanner} className="w-full py-3 rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 text-xs font-black flex items-center justify-center gap-2"><ScanLine className="w-4 h-4" /> {scanning ? 'Stop QR Scanner' : 'Scan Activation QR'}</button>}
        {scanning && <video ref={videoRef} muted playsInline className="w-full aspect-square object-cover rounded-2xl bg-black" />}
        <button onClick={() => setMode('pin')} className="w-full text-xs font-bold text-slate-500">Back to PIN</button>
        <p className="text-[11px] text-center text-slate-400">{KROWN_SUPPORT_WHATSAPP} • KROWN Support</p>
      </div>}
    </div>
  </div>;
}
