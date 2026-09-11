'use client';

import { useEffect, useState } from 'react';
import { KrownAuthGate } from '@/components/krown-auth-gate';

const SESSION_KEY = 'krown_active_session';
const TOKEN_KEY = 'krown_session_token';
const PROFILE_KEY = 'krown_staff_profile';

function hasActivePageSession() {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(SESSION_KEY) === 'true';
}

function clearPersistedStaffSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(PROFILE_KEY);
  localStorage.removeItem('krown_organization_id');
  localStorage.removeItem('krown_branch_id');
}

export function KrownAuthOverlay() {
  const [show, setShow] = useState(() => {
    if (typeof window === 'undefined' || window.location.pathname !== '/') return false;

    const activePageSession = hasActivePageSession();
    const hasCredentials = !!localStorage.getItem(TOKEN_KEY) && !!localStorage.getItem(PROFILE_KEY);

    // The login token/profile may intentionally remain in persistent storage for
    // offline/device support, but it must never restore an authenticated UI after
    // the browser/PWA page session has ended. sessionStorage is scoped to this
    // browsing context and is cleared when that page session ends.
    if (!activePageSession) {
      if (hasCredentials) clearPersistedStaffSession();
      return true;
    }

    return !hasCredentials;
  });

  useEffect(() => {
    if (window.location.pathname !== '/') return;

    const sync = () => {
      const activePageSession = hasActivePageSession();
      const hasCredentials = !!localStorage.getItem(TOKEN_KEY) && !!localStorage.getItem(PROFILE_KEY);

      if (!activePageSession) {
        clearPersistedStaffSession();
        setShow(true);
        return;
      }

      setShow(!hasCredentials);
    };

    sync();
    const timer = window.setTimeout(sync, 250);
    window.addEventListener('storage', sync);
    window.addEventListener('pageshow', sync);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('storage', sync);
      window.removeEventListener('pageshow', sync);
    };
  }, []);

  if (!show) return null;
  return <KrownAuthGate />;
}
