import webpush from 'web-push';
import { query } from './db.js';

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const RAW_SUBJECT = (process.env.VAPID_SUBJECT || 'mailto:admin@smeni-menya.local').trim();

// web-push requires the subject to be a mailto: or https: URL.
// Be forgiving: if a bare email or hostname was provided, normalize it.
function normalizeSubject(raw) {
  if (!raw) return null;
  if (raw.startsWith('mailto:') || raw.startsWith('https://')) return raw;
  if (raw.includes('@')) return `mailto:${raw}`;
  if (raw.startsWith('http://')) return raw.replace(/^http:\/\//, 'https://');
  return `https://${raw}`;
}

let enabled = false;
const VAPID_SUBJECT = normalizeSubject(RAW_SUBJECT);

if (VAPID_PUBLIC && VAPID_PRIVATE && VAPID_SUBJECT) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
    enabled = true;
    if (VAPID_SUBJECT !== RAW_SUBJECT) {
      console.warn(`[push] normalized VAPID_SUBJECT "${RAW_SUBJECT}" -> "${VAPID_SUBJECT}"`);
    }
    console.log('[push] enabled');
  } catch (err) {
    console.warn('[push] invalid VAPID config, push disabled:', err.message);
  }
} else {
  console.warn('[push] VAPID keys not set, push notifications disabled');
}

export function getPublicKey() {
  return enabled ? VAPID_PUBLIC : null;
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
