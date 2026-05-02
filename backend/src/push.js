import webpush from 'web-push';
import { query } from './db.js';

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@smeni-menya.local';

let enabled = false;
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  enabled = true;
} else {
  console.warn('[push] VAPID keys not set, push notifications disabled');
}

export function getPublicKey() {
  return VAPID_PUBLIC || null;
}

export async function saveSubscription(user, subscription) {
  await query('UPDATE users SET push_subscription = $1 WHERE name = $2', [
    subscription,
    user,
  ]);
}

export async function notifyUser(userName, payload) {
  if (!enabled) return;
  const { rows } = await query(
    'SELECT push_subscription FROM users WHERE name = $1',
    [userName]
  );
  const sub = rows[0]?.push_subscription;
  if (!sub) return;
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload));
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      await query('UPDATE users SET push_subscription = NULL WHERE name = $1', [
        userName,
      ]);
    } else {
      console.warn('[push] send error:', err.message);
    }
  }
}
