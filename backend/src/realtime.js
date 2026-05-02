import { WebSocketServer } from 'ws';
import { verifyToken } from './auth.js';

const clients = new Set();

export function setupWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    const payload = token ? verifyToken(token) : null;
    if (!payload) {
      ws.close(4001, 'unauthorized');
      return;
    }
    ws.user = payload.name;
    clients.add(ws);

    ws.send(JSON.stringify({ type: 'HELLO', user: payload.name }));

    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
    ws.on('pong', () => { ws.isAlive = true; });
  });

  const interval = setInterval(() => {
    for (const ws of clients) {
      if (ws.isAlive === false) {
        ws.terminate();
        clients.delete(ws);
        continue;
      }
      ws.isAlive = false;
      try { ws.ping(); } catch {}
    }
  }, 30000);

  wss.on('close', () => clearInterval(interval));
}

export function broadcast(event, payload, exceptUser = null) {
  const data = JSON.stringify({ type: event, payload });
  for (const ws of clients) {
    if (exceptUser && ws.user === exceptUser) continue;
    if (ws.readyState === 1) {
      try { ws.send(data); } catch {}
    }
  }
}
