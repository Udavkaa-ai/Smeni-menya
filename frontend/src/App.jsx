import React, { useEffect, useState } from 'react';
import Login from './components/Login.jsx';
import WeekView from './components/WeekView.jsx';
import { isAuthed, getUser, setSession } from './api/client.js';
import { createRealtime } from './api/realtime.js';
import { ensurePushSubscription } from './api/push.js';
import { useWeekStore } from './store/useWeekStore.js';

const NAME = { SVETA: 'Света', MARIA: 'Мария' };
const CLS  = { SVETA: 'sveta', MARIA: 'maria' };

export default function App() {
  const [authed, setAuthed] = useState(isAuthed());
  const [me, setMe] = useState(getUser());
  const [live, setLive] = useState(false);
  const toast = useWeekStore((s) => s.toast);
  const setToast = useWeekStore((s) => s.setToast);

  useEffect(() => {
    function onLogout() {
      setAuthed(false);
      setMe(null);
    }
    window.addEventListener('sm:logout', onLogout);
    return () => window.removeEventListener('sm:logout', onLogout);
  }, []);

  useEffect(() => {
    if (!authed) return;
    ensurePushSubscription();
    const rt = createRealtime({
      onStatus: setLive,
      onEvent: (msg) => {
        window.dispatchEvent(new CustomEvent('sm:event', { detail: msg }));
        if (msg.type === 'DAY_UPDATED' && msg.payload?.updated_by && msg.payload.updated_by !== me) {
          setToast(`${NAME[msg.payload.updated_by] || msg.payload.updated_by} изменил(а) ${msg.payload.date}`);
        }
        if (msg.type === 'SWAP_CREATED' && msg.payload?.to_user === me) {
          setToast('Поступил запрос на обмен');
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
        <button className="iconbtn" onClick={logout}>Выйти</button>
      </div>
      <WeekView live={live} />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
