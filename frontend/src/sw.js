import { precacheAndRoute } from 'workbox-precaching';

precacheAndRoute(self.__WB_MANIFEST || []);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const NAMES = { SVETA: 'Света', MARIA: 'Мария', NONE: 'Никто' };
const DOWS = ['вс','пн','вт','ср','чт','пт','сб'];
const MONTHS = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];

function ruDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00Z');
  return `${DOWS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
function timeRange(s, e) {
  if (!s && !e) return null;
  return `${s || '—'}–${e || '—'}`;
}
function trim(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function buildMessage(p) {
  const by = NAMES[p.by] || p.by || '';
  const date = ruDate(p.date);
  const tr = timeRange(p.start_time, p.end_time);

  switch (p.type) {
    case 'shift_added': {
      const time = tr ? `, ${tr}` : '';
      return { title: 'Новая смена', body: `${by} взяла ${date}${time}` };
    }
    case 'shift_removed':
      return { title: 'Смена снята', body: `${by} убрала свою смену на ${date}` };
    case 'shift_updated': {
      const parts = [];
      if (p.changes?.includes('time')) {
        const prev = timeRange(p.prev_start_time, p.prev_end_time);
        const next = tr || 'без времени';
        parts.push(prev ? `время: ${prev} → ${next}` : `время: ${next}`);
      }
      if (p.changes?.includes('description')) {
        parts.push(p.description ? `описание: «${trim(p.description, 40)}»` : 'убрала описание');
      }
      if (p.changes?.includes('work_day')) {
        parts.push(p.is_work_day ? 'отметила «основная работа»' : 'сняла «основная работа»');
      }
      const tail = parts.length ? ` — ${parts.join(', ')}` : '';
      return { title: 'Смена изменена', body: `${by} обновила ${date}${tail}` };
    }
    case 'none_marked':
      return { title: 'Никто не сможет', body: `${by} отметила ${date}: никто из нас не сможет` };
    case 'none_unmarked':
      return { title: 'Отметка снята', body: `${by} убрала отметку «никто» с ${date}` };
    case 'shift_request':
      return {
        title: 'Запрос на обмен',
        body: `${by} предлагает обмен: ${ruDate(p.from_date)} ↔ ${ruDate(p.to_date)}`
      };
    case 'shift_accepted':
      return {
        title: 'Обмен принят',
        body: `${by} приняла обмен: ${ruDate(p.from_date)} ↔ ${ruDate(p.to_date)}`
      };
    case 'shift_rejected':
      return {
        title: 'Обмен отклонён',
        body: `${by} отклонила обмен: ${ruDate(p.from_date)} ↔ ${ruDate(p.to_date)}`
      };
    case 'empty_day_warning':
      return { title: 'Внимание', body: `День ${date} остался без дежурного` };
    default:
      return { title: 'Сменимся', body: `${by} изменила ${date}`.trim() };
  }
}

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  const { title, body } = buildMessage(data);
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data,
      tag: `${data.type}:${data.date || data.from_date || ''}`,
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) return w.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});
