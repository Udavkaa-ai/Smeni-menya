import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { query, withTransaction } from './db.js';
import { login, authMiddleware } from './auth.js';
import { setupWebSocket, broadcast } from './realtime.js';
import { migrate } from './migrate.js';
import { getPublicKey, saveSubscription, notifyUser } from './push.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '256kb' }));

const otherUser = (u) => (u === 'SVETA' ? 'MARIA' : 'SVETA');

const ymd = (d) => {
  const dt = new Date(d);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
};

const isValidIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

const audit = (actor, action, payload) =>
  query('INSERT INTO audit_log (actor, action, payload) VALUES ($1,$2,$3)', [
    actor,
    action,
    payload,
  ]).catch(() => {});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/auth/vapid', (_req, res) => {
  res.json({ publicKey: getPublicKey() });
});

app.post('/auth/login', async (req, res) => {
  const { name, password } = req.body || {};
  const result = await login(name, password);
  if (!result) return res.status(401).json({ error: 'invalid_credentials' });
  res.json(result);
});

app.get('/auth/me', authMiddleware, (req, res) => res.json(req.user));

app.post('/push/subscribe', authMiddleware, async (req, res) => {
  const subscription = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'bad_subscription' });
  }
  await saveSubscription(req.user.name, subscription);
  res.json({ ok: true });
});

app.get('/week', authMiddleware, async (req, res) => {
  const start = req.query.start;
  if (!start || !isValidIso(start)) {
    return res.status(400).json({ error: 'bad_start_date' });
  }
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const end = dates[6];

  const { rows } = await query(
    'SELECT * FROM days WHERE date >= $1 AND date <= $2 ORDER BY date',
    [start, end]
  );
  const map = new Map(rows.map((r) => [ymd(r.date), r]));

  const days = await Promise.all(
    dates.map(async (date) => {
      if (map.has(date)) {
        const r = map.get(date);
        return {
          id: r.id,
          date: ymd(r.date),
          assigned_to: r.assigned_to,
          start_time: r.start_time,
          end_time: r.end_time,
          description: r.description,
          is_work_day: r.is_work_day,
          updated_by: r.updated_by,
          updated_at: r.updated_at,
          version: r.version,
        };
      }
      const ins = await query(
        `INSERT INTO days (date) VALUES ($1)
         ON CONFLICT (date) DO UPDATE SET date = EXCLUDED.date
         RETURNING *`,
        [date]
      );
      const r = ins.rows[0];
      return {
        id: r.id,
        date: ymd(r.date),
        assigned_to: r.assigned_to,
        start_time: r.start_time,
        end_time: r.end_time,
        description: r.description,
        is_work_day: r.is_work_day,
        updated_by: r.updated_by,
        updated_at: r.updated_at,
        version: r.version,
      };
    })
  );

  res.json({ start, days });
});

app.patch('/day/:id', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad_id' });

  const {
    assigned_to = null,
    start_time = null,
    end_time = null,
    description = '',
    is_work_day = false,
    version,
  } = req.body || {};

  if (
    assigned_to !== null &&
    !['SVETA', 'MARIA', 'NONE'].includes(assigned_to)
  ) {
    return res.status(400).json({ error: 'bad_assigned_to' });
  }
  if (typeof version !== 'number') {
    return res.status(400).json({ error: 'version_required' });
  }

  try {
    const result = await withTransaction(async (client) => {
      const cur = await client.query('SELECT * FROM days WHERE id = $1 FOR UPDATE', [id]);
      if (cur.rowCount === 0) return { status: 404 };
      const row = cur.rows[0];
      if (row.version !== version) {
        return { status: 409, body: { error: 'version_conflict', current: row } };
      }
      const upd = await client.query(
        `UPDATE days SET assigned_to = $1, start_time = $2, end_time = $3,
                         description = $4, is_work_day = $5,
                         updated_by = $6, updated_at = NOW(),
                         version = version + 1
         WHERE id = $7 RETURNING *`,
        [
          assigned_to,
          start_time,
          end_time,
          description,
          !!is_work_day,
          req.user.name,
          id,
        ]
      );
      return { status: 200, body: upd.rows[0] };
    });

    if (result.status !== 200) return res.status(result.status).json(result.body || {});

    const day = result.body;
    const dayPayload = {
      id: day.id,
      date: ymd(day.date),
      assigned_to: day.assigned_to,
      start_time: day.start_time,
      end_time: day.end_time,
      description: day.description,
      is_work_day: day.is_work_day,
      updated_by: day.updated_by,
      updated_at: day.updated_at,
      version: day.version,
    };

    audit(req.user.name, 'DAY_UPDATED', dayPayload);
    broadcast('DAY_UPDATED', dayPayload);

    const target = otherUser(req.user.name);
    notifyUser(target, {
      type: 'day_updated',
      date: dayPayload.date,
      by: req.user.name,
    });
    if (dayPayload.assigned_to === null) {
      notifyUser(target, {
        type: 'empty_day_warning',
        date: dayPayload.date,
        by: req.user.name,
      });
    }

    res.json(dayPayload);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

app.post('/swap', authMiddleware, async (req, res) => {
  const { from_date, to_date } = req.body || {};
  if (!isValidIso(from_date) || !isValidIso(to_date)) {
    return res.status(400).json({ error: 'bad_dates' });
  }
  if (from_date === to_date) {
    return res.status(400).json({ error: 'same_date' });
  }
  const from_user = req.user.name;
  const to_user = otherUser(from_user);

  const { rows } = await query(
    `INSERT INTO swap_requests (from_user, to_user, from_date, to_date)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [from_user, to_user, from_date, to_date]
  );
  const swap = rows[0];
  const payload = {
    id: swap.id,
    from_user: swap.from_user,
    to_user: swap.to_user,
    from_date: ymd(swap.from_date),
    to_date: ymd(swap.to_date),
    status: swap.status,
    created_at: swap.created_at,
  };
  broadcast('SWAP_CREATED', payload);
  notifyUser(to_user, {
    type: 'shift_request',
    from_date: payload.from_date,
    to_date: payload.to_date,
    by: from_user,
  });
  audit(from_user, 'SWAP_CREATED', payload);
  res.json(payload);
});

app.get('/swap', authMiddleware, async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM swap_requests
      WHERE (from_user = $1 OR to_user = $1)
        AND status = 'PENDING'
      ORDER BY created_at DESC`,
    [req.user.name]
  );
  res.json(
    rows.map((r) => ({
      id: r.id,
      from_user: r.from_user,
      to_user: r.to_user,
      from_date: ymd(r.from_date),
      to_date: ymd(r.to_date),
      status: r.status,
      created_at: r.created_at,
    }))
  );
});

app.post('/swap/:id/respond', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const { action } = req.body || {};
  if (!['accept', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'bad_action' });
  }

  try {
    const result = await withTransaction(async (client) => {
      const sw = await client.query('SELECT * FROM swap_requests WHERE id = $1 FOR UPDATE', [id]);
      if (sw.rowCount === 0) return { status: 404 };
      const swap = sw.rows[0];
      if (swap.status !== 'PENDING') {
        return { status: 409, body: { error: 'already_resolved' } };
      }
      if (swap.to_user !== req.user.name) {
        return { status: 403, body: { error: 'not_recipient' } };
      }

      if (action === 'reject') {
        const upd = await client.query(
          `UPDATE swap_requests SET status = 'REJECTED' WHERE id = $1 RETURNING *`,
          [id]
        );
        return { status: 200, body: { swap: upd.rows[0], days: [] } };
      }

      const fromDate = ymd(swap.from_date);
      const toDate = ymd(swap.to_date);
      const dq = await client.query(
        `SELECT * FROM days WHERE date IN ($1, $2) FOR UPDATE`,
        [fromDate, toDate]
      );
      const byDate = new Map(dq.rows.map((r) => [ymd(r.date), r]));

      async function ensureDay(date) {
        if (byDate.has(date)) return byDate.get(date);
        const ins = await client.query(
          `INSERT INTO days (date) VALUES ($1) RETURNING *`,
          [date]
        );
        return ins.rows[0];
      }
      const dayFrom = await ensureDay(fromDate);
      const dayTo = await ensureDay(toDate);

      const newFromAssigned = dayTo.assigned_to;
      const newToAssigned = dayFrom.assigned_to;

      const u1 = await client.query(
        `UPDATE days SET assigned_to = $1, updated_by = $2, updated_at = NOW(),
                         version = version + 1
         WHERE id = $3 RETURNING *`,
        [newFromAssigned, req.user.name, dayFrom.id]
      );
      const u2 = await client.query(
        `UPDATE days SET assigned_to = $1, updated_by = $2, updated_at = NOW(),
                         version = version + 1
         WHERE id = $3 RETURNING *`,
        [newToAssigned, req.user.name, dayTo.id]
      );
      const upd = await client.query(
        `UPDATE swap_requests SET status = 'ACCEPTED' WHERE id = $1 RETURNING *`,
        [id]
      );
      return { status: 200, body: { swap: upd.rows[0], days: [u1.rows[0], u2.rows[0]] } };
    });

    if (result.status !== 200) return res.status(result.status).json(result.body || {});

    const swap = result.body.swap;
    const swapPayload = {
      id: swap.id,
      from_user: swap.from_user,
      to_user: swap.to_user,
      from_date: ymd(swap.from_date),
      to_date: ymd(swap.to_date),
      status: swap.status,
      created_at: swap.created_at,
    };

    for (const d of result.body.days) {
      const payload = {
        id: d.id,
        date: ymd(d.date),
        assigned_to: d.assigned_to,
        start_time: d.start_time,
        end_time: d.end_time,
        description: d.description,
        is_work_day: d.is_work_day,
        updated_by: d.updated_by,
        updated_at: d.updated_at,
        version: d.version,
      };
      broadcast('DAY_UPDATED', payload);
    }
    broadcast('SWAP_UPDATED', swapPayload);

    const initiator = swapPayload.from_user;
    notifyUser(initiator, {
      type: action === 'accept' ? 'shift_accepted' : 'shift_rejected',
      from_date: swapPayload.from_date,
      to_date: swapPayload.to_date,
      by: req.user.name,
    });
    audit(req.user.name, `SWAP_${action.toUpperCase()}ED`, swapPayload);

    res.json(swapPayload);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

app.get('/stats', authMiddleware, async (req, res) => {
  const start = req.query.start;
  if (!isValidIso(start)) return res.status(400).json({ error: 'bad_start_date' });
  const end = addDays(start, 6);
  const { rows } = await query(
    `SELECT assigned_to, COUNT(*)::int AS count FROM days
     WHERE date >= $1 AND date <= $2 GROUP BY assigned_to`,
    [start, end]
  );
  res.json(rows);
});

const PORT = process.env.PORT || 8080;

(async () => {
  try {
    await migrate();
  } catch (err) {
    console.error('[migrate] failed:', err.message);
  }
  const server = http.createServer(app);
  setupWebSocket(server);
  server.listen(PORT, () => {
    console.log(`[smeni-menya] listening on :${PORT}`);
  });
})();
