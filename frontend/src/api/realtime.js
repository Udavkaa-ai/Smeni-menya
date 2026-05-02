import { wsUrl, getToken } from './client.js';

export function createRealtime({ onEvent, onStatus }) {
  let ws = null;
  let alive = true;
  let backoff = 1000;
  let reconnectTimer = null;

  function connect() {
    if (!getToken()) {
      onStatus?.(false);
      return;
    }
    try {
      ws = new WebSocket(wsUrl());
    } catch {
      scheduleReconnect();
      return;
    }
    ws.onopen = () => {
      backoff = 1000;
      onStatus?.(true);
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        onEvent?.(msg);
      } catch {}
    };
    ws.onclose = () => {
      onStatus?.(false);
      scheduleReconnect();
    };
    ws.onerror = () => {
      try { ws.close(); } catch {}
    };
  }

  function scheduleReconnect() {
    if (!alive) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 30000);
  }

  connect();

  return {
    close() {
      alive = false;
      clearTimeout(reconnectTimer);
      try { ws?.close(); } catch {}
    },
    reconnect() {
      try { ws?.close(); } catch {}
    }
  };
}
