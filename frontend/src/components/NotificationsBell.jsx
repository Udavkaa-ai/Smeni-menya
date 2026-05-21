import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api/client.js';
import { ruDateShort, NAMES, timeRange } from '../utils/format.js';
import useBackButtonClose from '../utils/useBackButtonClose.js';

// Notifications collapsed into a bell button + bottom-sheet panel.
//   - Bell shows the unread count as a badge.
//   - Tap bell → open panel with the list, each row has an Ack button.
//   - Listens for sm:open-notifications event (fired by the SW when the
//     user clicks a browser push), and for the ?open=notifications query
//     parameter on first load.
export default function NotificationsBell() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);

  async function refresh() {
    try { setItems(await api.notifications()); } catch {}
  }

  useEffect(() => { refresh(); }, []);

  // Real-time sync via the existing sm:event bus (WebSocket).
  useEffect(() => {
    function onEvent(e) {
      const msg = e.detail;
      if (!msg) return;
      if (msg.type === 'NOTIFICATION_NEW') {
        setItems((cur) => {
          if (cur.some((n) => n.id === msg.payload.id)) return cur;
          return [msg.payload, ...cur];
        });
      } else if (msg.type === 'NOTIFICATION_ACK') {
        setItems((cur) => cur.filter((n) => n.id !== msg.payload?.id));
      }
    }
    window.addEventListener('sm:event', onEvent);
    return () => window.removeEventListener('sm:event', onEvent);
  }, []);

  // Auto-open the panel when the user lands here from a browser push.
  useEffect(() => {
    function onOpen() { setOpen(true); }
    window.addEventListener('sm:open-notifications', onOpen);

    // Deep-link via ?open=notifications (cold-start case).
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('open') === 'notifications') {
        setOpen(true);
        url.searchParams.delete('open');
        window.history.replaceState({}, '', url.pathname + url.search + url.hash);
      }
    } catch {}

    return () => window.removeEventListener('sm:open-notifications', onOpen);
  }, []);

  async function ack(id) {
    setBusyId(id);
    setItems((cur) => cur.filter((n) => n.id !== id));
    try { await api.ackNotification(id); }
    catch { refresh(); }
    finally { setBusyId(null); }
  }

  return (
    <>
      <button
        type="button"
        className={`bell-btn ${items.length ? 'has-unread' : ''}`}
        onClick={() => setOpen(true)}
        aria-label={`Уведомления${items.length ? `: ${items.length}` : ''}`}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {items.length > 0 && <span className="bell-badge">{items.length}</span>}
      </button>
      {open && (
        <NotificationsPanel
          items={items}
          busyId={busyId}
          onAck={ack}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function NotificationsPanel({ items, busyId, onAck, onClose }) {
  useBackButtonClose(onClose);
  // Portal to document.body so the fixed-position backdrop covers the
  // whole viewport. Without this, the bell is mounted inside .header which
  // uses backdrop-filter — that creates a new containing block and
  // confines `position: fixed` children to the tiny header rectangle.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal notifications-panel" onClick={(e) => e.stopPropagation()}>
        <h2>Уведомления</h2>
        {items.length === 0 && (
          <div className="empty-mine">Новых уведомлений нет</div>
        )}
        {items.map((n) => (
          <NotificationCard key={n.id} n={n} onAck={() => onAck(n.id)} disabled={busyId === n.id} />
        ))}
        <div className="toolbar">
          <button className="btn primary full" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function NotificationCard({ n, onAck, disabled }) {
  const { kind, payload = {}, related_date } = n;
  const date = ruDateShort(related_date || payload.date);
  const by = payload.by ? NAMES[payload.by] || payload.by : '';
  const tr = timeRange(payload.start_time, payload.end_time);
  let title, body, button, cls;

  if (kind === 'conflict') {
    cls = 'conflict';
    title = 'Конфликт занятости';
    body = `${date}: обе заняты ${tr}. Нужно решить кто переносит.`;
    button = 'Решено';
  } else if (kind === 'shift_added') {
    cls = 'added';
    title = `${by}: новая занятость`;
    body = `${date}${tr ? `, ${tr}` : ''}${payload.description ? ` — ${payload.description}` : ''}`;
    button = 'Хорошо, я с мамой';
  } else if (kind === 'shift_removed') {
    cls = 'removed';
    title = `${by}: занятость снята`;
    body = `${date}${tr ? `, ${tr}` : ''}${payload.description ? ` — ${payload.description}` : ''}`;
    button = 'Понятно';
  } else if (kind === 'shift_updated') {
    cls = 'updated';
    const prev = timeRange(payload.prev_start_time, payload.prev_end_time);
    title = `${by}: занятость изменена`;
    body = `${date}${prev ? `: ${prev} → ${tr}` : tr ? `, ${tr}` : ''}`;
    button = 'Понятно';
  } else {
    cls = 'info';
    title = 'Уведомление';
    body = JSON.stringify(payload);
    button = 'OK';
  }

  return (
    <div className={`notif notif-${cls}`}>
      <div className="notif-body">
        <div className="notif-title">{title}</div>
        <div className="notif-text">{body}</div>
      </div>
      <button type="button" className="notif-btn" disabled={disabled} onClick={onAck}>
        {button}
      </button>
    </div>
  );
}
