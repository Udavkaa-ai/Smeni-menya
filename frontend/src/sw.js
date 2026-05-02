import { precacheAndRoute } from 'workbox-precaching';

precacheAndRoute(self.__WB_MANIFEST || []);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const TITLES = {
  day_updated: 'День изменён',
  shift_request: 'Запрос на обмен',
  shift_accepted: 'Обмен принят',
  shift_rejected: 'Обмен отклонён',
  empty_day_warning: 'Внимание: день не назначен',
};

const NAMES = { SVETA: 'Света', MARIA: 'Мария' };

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  const title = TITLES[data.type] || 'Сменимся';
  const who = data.by ? NAMES[data.by] || data.by : '';
  let body = '';
  if (data.type === 'day_updated') body = `${who} изменил(а) ${data.date}`;
  else if (data.type === 'shift_request') body = `${who}: ${data.from_date} ↔ ${data.to_date}`;
  else if (data.type === 'shift_accepted') body = `Обмен ${data.from_date} ↔ ${data.to_date} принят`;
  else if (data.type === 'shift_rejected') body = `Обмен ${data.from_date} ↔ ${data.to_date} отклонён`;
  else if (data.type === 'empty_day_warning') body = `День ${data.date} остался без дежурного`;

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
