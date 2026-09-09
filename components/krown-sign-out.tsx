'use client';

import { useEffect, useState } from 'react';
import { LogOut, Loader2 } from 'lucide-react';

/**
 * Global KROWN sign-out control.
 * Visible for every authenticated role (Super Admin, Restaurant Admin,
 * Branch Manager, and operational staff) without changing device activation.
 */
export function KrownSignOut() {
  const [authenticated, setAuthenticated] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sync = () => {
      setAuthenticated(
        !!localStorage.getItem('krown_session_token') &&
        !!localStorage.getItem('krown_staff_profile')
      );
    };
    sync();
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  if (!authenticated) return null;

  async function signOut() {
    if (busy) return;
    setBusy(true);

    const token = localStorage.getItem('krown_session_token');
    try {
      // Revoke the server session when possible. Local cleanup below is always
      // performed so a failed network request cannot leave the UI authenticated.
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        keepalive: true,
      });
    } catch {
      // Continue with local sign-out even when offline.
    }

    localStorage.removeItem('krown_session_token');
    localStorage.removeItem('krown_staff_profile');
    sessionStorage.removeItem('krown_active_session');

    // Do NOT remove krown_device_id: signing out must not deactivate or unbind
    // the computer. The device can be reused for the next authorized login.
    window.dispatchEvent(new Event('storage'));
    window.location.replace('/');
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      aria-label="Sign out"
      title="Sign out"
      className="fixed right-4 top-4 z-[10000] inline-flex items-center gap-2 rounded-2xl border border-black/5 bg-white/90 px-4 py-3 text-xs font-black text-slate-700 shadow-lg backdrop-blur-xl transition hover:scale-[1.02] hover:bg-white disabled:cursor-wait disabled:opacity-70 dark:border-white/10 dark:bg-[#151519]/90 dark:text-slate-100 dark:hover:bg-[#1D1D22]"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
      <span>{busy ? 'Signing out…' : 'Sign out'}</span>
    </button>
  );
}
