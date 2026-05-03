import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { ruDateShort, NAMES, timeRange } from '../utils/format.js';

// Persistent in-app notifications. Each one stays on the screen until the
// user explicitly clicks "Понятно" / "Хорошо, я с мамой" / "Решено".
// Backed by /notifications + /notifications/:id/ack on the server.
export default function NotificationsBar() {
  const [items, setItems] = useState([]);
  const [busyId, setBusyId] = useState(null);

  async function refresh() {
    try { setItems(await api.notifications()); } catch {}
  }

  useEffect(() => { refresh(); }, []);

  // Wire up to WebSocket events broadcast by the server.
  useEffect(() => {
    function onEvent(e) {
      const msg = e.detail;
      if (!msg) return;
      if (msg.type === 'NOTIFICATION_NEW') {
        setItems((cur) => {
          // Server already deduped on (recipient, kind, related_date) for
          // conflicts; for everything else just prepend.
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

  async function ack(id) {
    setBusyId(id);
    setItems((cur) => cur.filter((n) => n.id !== id));   // optimistic
    try { await api.ackNotification(id); }
    catch { refresh(); /* roll back from server */ }
    finally { setBusyId(null); }
  }

  if (!items.length) return null;
  return (
    <div className="notifications-bar">
      {items.map((n) => (
        <NotificationCard key={n.id} n={n} onAck={() => ack(n.id)} disabled={busyId === n.id} />
      ))}
    </div>
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
