const BASE = import.meta.env.VITE_API_BASE || '/api';

let token = localStorage.getItem('sm_token') || null;
let user = localStorage.getItem('sm_user') || null;

export function getToken() { return token; }
export function getUser() { return user; }
export function isAuthed() { return !!token; }

export function setSession(t, u) {
  token = t; user = u;
  if (t) localStorage.setItem('sm_token', t); else localStorage.removeItem('sm_token');
  if (u) localStorage.setItem('sm_user', u); else localStorage.removeItem('sm_user');
}

async function request(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (res.status === 401) {
    setSession(null, null);
    window.dispatchEvent(new CustomEvent('sm:logout'));
    throw new Error('unauthorized');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `http_${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  login: (name, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ name, password }) }),
  me: () => request('/auth/me'),
  vapid: () => request('/auth/vapid'),
  subscribePush: (sub) =>
    request('/push/subscribe', { method: 'POST', body: JSON.stringify(sub) }),
  week: (start) => request(`/week?start=${start}`),
  putShift: (body) =>
    request('/shift', { method: 'PUT', body: JSON.stringify(body) }),
  deleteShift: ({ date, user_name, version }) =>
    request(`/shift?date=${date}&user_name=${user_name}&version=${version}`, {
      method: 'DELETE',
    }),
  createSwap: (from_date, to_date) =>
    request('/swap', { method: 'POST', body: JSON.stringify({ from_date, to_date }) }),
  listSwaps: () => request('/swap'),
  respondSwap: (id, action) =>
    request(`/swap/${id}/respond`, { method: 'POST', body: JSON.stringify({ action }) }),
  stats: (start) => request(`/stats?start=${start}`),
};

export function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const base = import.meta.env.VITE_WS_BASE || `${proto}://${location.host}/ws`;
  return `${base}?token=${encodeURIComponent(token || '')}`;
}
