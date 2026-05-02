import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import './styles.css';

// Bump this when the client-side data shape or SW caches change in a way
// that breaks older clients. On version mismatch we wipe localStorage
// (except auth), unregister old service workers, drop all Cache Storage
// entries, then reload — the user just sees a brief "Updating…" splash.
const APP_DATA_VERSION = '2026.05.02-r1';

const AUTH_KEYS = ['sm_token', 'sm_user', 'sm_last_user'];

async function ensureFreshClientData() {
  if (localStorage.getItem('sm_data_version') === APP_DATA_VERSION) return false;

  // First-time visitor (no auth, no caches) — just stamp the version.
  const hasAuth = AUTH_KEYS.some((k) => localStorage.getItem(k) !== null);
  let cacheKeys = [];
  try {
    if ('caches' in window) cacheKeys = await caches.keys();
  } catch {}

  if (!hasAuth && cacheKeys.length === 0) {
    localStorage.setItem('sm_data_version', APP_DATA_VERSION);
    return false;
  }

  // Returning user with stale state — wipe everything but the JWT so they
  // don't have to log in again.
  const keep = {};
  for (const k of AUTH_KEYS) {
    const v = localStorage.getItem(k);
    if (v != null) keep[k] = v;
  }
  localStorage.clear();
  for (const [k, v] of Object.entries(keep)) localStorage.setItem(k, v);
  localStorage.setItem('sm_data_version', APP_DATA_VERSION);

  try {
    await Promise.all(cacheKeys.map((k) => caches.delete(k)));
  } catch {}

  if ('serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    } catch {}
  }
  return true;
}

(async () => {
  const needsReload = await ensureFreshClientData();
  if (needsReload) {
    document.getElementById('root').innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;
                  height:100dvh;font-family:Manrope,system-ui,sans-serif;
                  color:#8B6FE0;font-weight:700;font-size:16px;
                  text-align:center;padding:20px;
                  background:linear-gradient(180deg,#F5F1FB,#FBF7FF);">
        Обновляю до новой версии…
      </div>`;
    // Small delay so the splash actually paints before reload tears it down.
    setTimeout(() => location.reload(), 250);
    return;
  }

  const qc = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 }
    }
  });

  createRoot(document.getElementById('root')).render(
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>
  );
})();
