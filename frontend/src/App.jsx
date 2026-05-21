import React, { useEffect, useState } from 'react';
import Login from './components/Login.jsx';
import WeekView from './components/WeekView.jsx';
import NotificationsBell from './components/NotificationsBell.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import { isAuthed, getUser, setSession } from './api/client.js';
import { createRealtime } from './api/realtime.js';
import { ensurePushSubscription } from './api/push.js';
import { useWeekStore } from './store/useWeekStore.js';
import { formatNotification, NAMES, ruDateShort } from './utils/format.js';

const NAME = NAMES;
const CLS  = { SVETA: 'sveta', MARIA: 'maria' };

// Build a notification-shaped payload from a SHIFT_UPSERTED / SHIFT_REMOVED event
// so we can reuse the same Russian formatter.
function eventToToastPayload(msg) {
  if (msg.type === 'SHIFT_UPSERTED') {
    const s = msg.payload?.shift;
    if (!s) return null;
    if (msg.payload.action === 'added') {
      return {
        type: s.user_name === 'NONE' ? 'none_marked' : 'shift_added',
        date: s.date,
        by: s.updated_by,
        target_user: s.user_name,
        start_time: s.start_time,
        end_time: s.end_time,
        description: s.description,
      };
    }
    return {
      type: 'shift_updated',
      date: s.date,
      by: s.updated_by,
      target_user: s.user_name,
      start_time: s.start_time,
      end_time: s.end_time,
      description: s.description,
      is_work_day: s.is_work_day,
      changes: ['time', 'description', 'work_day'], // approximate; full diff is in the push payload
    };
  }
  if (msg.type === 'SHIFT_REMOVED') {
    const { date, user_name, prev } = msg.payload || {};
    return {
      type: user_name === 'NONE' ? 'none_unmarked' : 'shift_removed',
      date,
      by: prev?.updated_by,
      target_user: user_name,
    };
  }
  return null;
}

export default function App() {
  const [authed, setAuthed] = useState(isAuthed());
  const [me, setMe] = useState(getUser());
  const [live, setLive] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const toast = useWeekStore((s) => s.toast);
  const setToast = useWeekStore((s) => s.setToast);

  useEffect(() => {
    function onLogout() {
      setAuthed(false);
      setMe(null);
    }
    window.addEventListener('sm:logout', onLogout);

    // Bridge service-worker → window: when the SW (after a push-notification
    // click) posts OPEN_NOTIFICATIONS, surface it as a window event so the
    // bell component can react and open its panel.
    function onSWMessage(e) {
      if (e.data?.type === 'OPEN_NOTIFICATIONS') {
        window.dispatchEvent(new CustomEvent('sm:open-notifications'));
      }
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', onSWMessage);
    }
    return () => {
      window.removeEventListener('sm:logout', onLogout);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', onSWMessage);
      }
    };
  }, []);

  useEffect(() => {
    if (!authed) return;
    ensurePushSubscription();
    const rt = createRealtime({
      onStatus: setLive,
      onEvent: (msg) => {
        window.dispatchEvent(new CustomEvent('sm:event', { detail: msg }));
        // Show toast only for events caused by the OTHER user.
        const payload = eventToToastPayload(msg);
        if (payload && payload.by && payload.by !== me) {
          setToast(formatNotification(payload));
        }
        if (msg.type === 'SWAP_CREATED' && msg.payload?.to_user === me) {
          setToast(formatNotification({
            type: 'shift_request',
            by: msg.payload.from_user,
            from_date: msg.payload.from_date,
            to_date: msg.payload.to_date,
          }));
        }
      }
    });
    return () => rt.close();
  }, [authed, me, setToast]);

  function logout() {
    setSession(null, null);
    setAuthed(false);
    setMe(null);
  }

  if (!authed) {
    return (
      <Login
        onLoggedIn={(who) => {
          setMe(who);
          setAuthed(true);
        }}
      />
    );
  }

  return (
    <div className="app">
      <div className="header">
        <div>
          <h1>Сменимся</h1>
          <div className="me">
            <span className={`dot ${CLS[me] || ''}`} /> {NAME[me] || me} ·{' '}
            <span className={`live-badge ${live ? '' : 'off'}`}>
              <span className="pulse" /> {live ? 'онлайн' : 'оффлайн'}
            </span>
          </div>
        </div>
        <div className="header-actions">
          <NotificationsBell />
          <button
            type="button"
            className="iconbtn icon-only"
            onClick={() => setSettingsOpen(true)}
            aria-label="Настройки"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <button className="iconbtn" onClick={logout}>Выйти</button>
        </div>
      </div>
      <WeekView live={live} />
      {toast && <div className="toast">{toast}</div>}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
