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

// ---------- helpers ----------
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

const isValidIso = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

const audit = (actor, action, payload) =>
  query('INSERT INTO audit_log (actor, action, payload) VALUES ($1,$2,$3)', [
    actor,
    action,
    payload,
  ]).catch(() => {});

const formatShift = (r) => ({
  id: r.id,
  date: ymd(r.date),
  user_name: r.user_name,
  kind: r.kind || 'duty',
  start_time: r.start_time,
  end_time: r.end_time,
  description: r.description || '',
  is_work_day: !!r.is_work_day,
  updated_by: r.updated_by,
  updated_at: r.updated_at,
  version: r.version,
});

const formatSwap = (r) => ({
  id: r.id,
  type: r.type || 'swap',
  shift_id: r.shift_id || null,
  from_user: r.from_user,
  to_user: r.to_user,
  from_date: ymd(r.from_date),
  to_date: ymd(r.to_date),
  status: r.status,
  created_at: r.created_at,
});

// Detect changes between previous and next shift (both formatted).
function diffShift(prev, next) {
  const changes = [];
  if (!prev) return ['created'];
  if (prev.start_time !== next.start_time || prev.end_time !== next.end_time) changes.push('time');
  if ((prev.description || '') !== (next.description || '')) changes.push('description');
  if (!!prev.is_work_day !== !!next.is_work_day) changes.push('work_day');
  return changes;
}

// Build a notification payload describing what happened. Frontend/SW formats it in Russian.
function buildShiftNotification({ action, by, shift, prev }) {
  const date = shift?.date || (prev && prev.date);
  const target_user = shift?.user_name || prev?.user_name;
  if (action === 'added') {
    return {
      type: target_user === 'NONE' ? 'none_marked' : 'shift_added',
      date,
      by,
      target_user,
      start_time: shift.start_time,
      end_time: shift.end_time,
      description: shift.description,
      is_work_day: shift.is_work_day,
    };
  }
  if (action === 'removed') {
    return {
      type: target_user === 'NONE' ? 'none_unmarked' : 'shift_removed',
      date,
      by,
      target_user,
    };
  }
  // updated
  const changes = diffShift(prev, shift);
  return {
    type: 'shift_updated',
    date,
    by,
    target_user,
    changes,
    start_time: shift.start_time,
    end_time: shift.end_time,
    description: shift.description,
    is_work_day: shift.is_work_day,
    prev_start_time: prev?.start_time,
    prev_end_time: prev?.end_time,
  };
}

// ---------- public routes ----------
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

// ---------- week / shifts ----------
app.get('/week', authMiddleware, async (req, res) => {
  const start = req.query.start;
  if (!isValidIso(start)) return res.status(400).json({ error: 'bad_start_date' });
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const end = dates[6];

  const { rows } = await query(
    `SELECT * FROM shifts
      WHERE date >= $1 AND date <= $2
      ORDER BY date, user_name`,
    [start, end]
  );

  const byDate = new Map(dates.map((d) => [d, []]));
  for (const r of rows) {
    const dateStr = ymd(r.date);
    if (byDate.has(dateStr)) byDate.get(dateStr).push(formatShift(r));
  }

  res.json({
    start,
    days: dates.map((date) => ({ date, shifts: byDate.get(date) || [] })),
  });
});

// Create a new shift. Body:
//   { date, user_name, start_time, end_time, description, is_work_day }
// You can only create your own shift, or the shared 'NONE' marker.
app.post('/shift', authMiddleware, async (req, res) => {
  const {
    date,
    user_name,
    kind = 'duty',
    start_time = null,
    end_time = null,
    description = '',
    is_work_day = false,
  } = req.body || {};

  if (!isValidIso(date)) return res.status(400).json({ error: 'bad_date' });
  if (!['SVETA', 'MARIA', 'NONE'].includes(user_name)) {
    return res.status(400).json({ error: 'bad_user' });
  }
  if (!['duty', 'work'].includes(kind)) {
    return res.status(400).json({ error: 'bad_kind' });
  }
  if (user_name !== req.user.name && user_name !== 'NONE') {
    return res.status(403).json({ error: 'cannot_edit_other_user' });
  }

  try {
    const ins = await query(
      `INSERT INTO shifts
          (date, user_name, kind, start_time, end_time, description, is_work_day, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        date,
        user_name,
        kind,
        start_time || null,
        end_time || null,
        description || '',
        !!is_work_day,
        req.user.name,
      ]
    );
    const shift = formatShift(ins.rows[0]);

    broadcast('SHIFT_UPSERTED', { shift, action: 'added' }, req.user.name);
    notifyUser(otherUser(req.user.name), buildShiftNotification({
      action: 'added', by: req.user.name, shift, prev: null,
    }));
    audit(req.user.name, 'SHIFT_ADDED', { shift });

    res.json(shift);
  } catch (err) {
    if (err.code === '23505') {
      // unique violation — only thrown for duplicate NONE per date
      return res.status(409).json({ error: 'duplicate_none' });
    }
    console.error('[shift POST] error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// Update a shift by id. Body:
//   { start_time, end_time, description, is_work_day, version }
app.patch('/shift/:id', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad_id' });

  const {
    start_time = null,
    end_time = null,
    description = '',
    is_work_day = false,
    kind,
    version,
  } = req.body || {};

  if (!Number.isInteger(version) || version < 1) {
    return res.status(400).json({ error: 'bad_version' });
  }
  if (kind !== undefined && !['duty', 'work'].includes(kind)) {
    return res.status(400).json({ error: 'bad_kind' });
  }

  try {
    const result = await withTransaction(async (client) => {
      const cur = await client.query('SELECT * FROM shifts WHERE id = $1 FOR UPDATE', [id]);
      if (cur.rowCount === 0) return { status: 404, body: { error: 'not_found' } };
      const prev = formatShift(cur.rows[0]);
      if (prev.user_name !== req.user.name && prev.user_name !== 'NONE') {
        return { status: 403, body: { error: 'cannot_edit_other_user' } };
      }
      if (prev.version !== version) {
        return { status: 409, body: { error: 'version_conflict', current: prev } };
      }
      const upd = await client.query(
        `UPDATE shifts SET
            start_time  = $1,
            end_time    = $2,
            description = $3,
            is_work_day = $4,
            kind        = COALESCE($5, kind),
            updated_by  = $6,
            updated_at  = NOW(),
            version     = version + 1
         WHERE id = $7 RETURNING *`,
        [
          start_time || null,
          end_time || null,
          description || '',
          !!is_work_day,
          kind || null,
          req.user.name,
          id,
        ]
      );
      return { status: 200, body: upd.rows[0], prev };
    });

    if (result.status !== 200) return res.status(result.status).json(result.body || {});

    const shift = formatShift(result.body);
    broadcast('SHIFT_UPSERTED', { shift, action: 'updated' }, req.user.name);
    notifyUser(otherUser(req.user.name), buildShiftNotification({
      action: 'updated', by: req.user.name, shift, prev: result.prev,
    }));
    audit(req.user.name, 'SHIFT_UPDATED', { shift, prev: result.prev });

    res.json(shift);
  } catch (err) {
    console.error('[shift PATCH] error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// Delete a shift by id. Query: version
app.delete('/shift/:id', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad_id' });
  const version = Number(req.query.version);
  if (!Number.isInteger(version) || version < 1) {
    return res.status(400).json({ error: 'bad_version' });
  }

  try {
    const result = await withTransaction(async (client) => {
      const cur = await client.query('SELECT * FROM shifts WHERE id = $1 FOR UPDATE', [id]);
      if (cur.rowCount === 0) return { status: 404, body: { error: 'not_found' } };
      const prev = formatShift(cur.rows[0]);
      if (prev.user_name !== req.user.name && prev.user_name !== 'NONE') {
        return { status: 403, body: { error: 'cannot_edit_other_user' } };
      }
      if (prev.version !== version) {
        return { status: 409, body: { error: 'version_conflict', current: prev } };
      }
      await client.query('DELETE FROM shifts WHERE id = $1', [id]);
      return { status: 200, prev };
    });

    if (result.status !== 200) return res.status(result.status).json(result.body || {});

    broadcast(
      'SHIFT_REMOVED',
      { id, date: result.prev.date, user_name: result.prev.user_name, prev: result.prev },
      req.user.name
    );
    notifyUser(otherUser(req.user.name), buildShiftNotification({
      action: 'removed', by: req.user.name, shift: null, prev: result.prev,
    }));
    audit(req.user.name, 'SHIFT_REMOVED', { prev: result.prev });

    res.json({ ok: true, id });
  } catch (err) {
    console.error('[shift DELETE] error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// ---------- swap & transfer ----------
// POST /swap — propose a two-day mutual exchange.
app.post('/swap', authMiddleware, async (req, res) => {
  const { from_date, to_date } = req.body || {};
  if (!isValidIso(from_date) || !isValidIso(to_date)) {
    return res.status(400).json({ error: 'bad_dates' });
  }
  if (from_date === to_date) return res.status(400).json({ error: 'same_date' });

  const from_user = req.user.name;
  const to_user = otherUser(from_user);

  const mine = await query(
    `SELECT 1 FROM shifts WHERE date = $1 AND user_name = $2 AND kind = 'duty'`,
    [from_date, from_user]
  );
  if (mine.rowCount === 0) {
    return res.status(400).json({ error: 'no_shift_to_swap' });
  }

  const { rows } = await query(
    `INSERT INTO swap_requests (from_user, to_user, from_date, to_date, type)
     VALUES ($1,$2,$3,$4,'swap') RETURNING *`,
    [from_user, to_user, from_date, to_date]
  );
  const payload = formatSwap(rows[0]);
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

// POST /shift/:id/transfer — propose to hand a single shift to the other user.
app.post('/shift/:id/transfer', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad_id' });

  const cur = await query('SELECT * FROM shifts WHERE id = $1', [id]);
  if (cur.rowCount === 0) return res.status(404).json({ error: 'not_found' });
  const shift = cur.rows[0];
  if (shift.user_name !== req.user.name) {
    return res.status(403).json({ error: 'not_yours' });
  }
  if (shift.kind !== 'duty') {
    return res.status(400).json({ error: 'only_duty_shifts' });
  }

  const from_user = req.user.name;
  const to_user = otherUser(from_user);
  const dateIso = ymd(shift.date);

  const { rows } = await query(
    `INSERT INTO swap_requests (from_user, to_user, from_date, to_date, type, shift_id)
     VALUES ($1,$2,$3,$3,'transfer',$4) RETURNING *`,
    [from_user, to_user, dateIso, id]
  );
  const payload = formatSwap(rows[0]);
  broadcast('SWAP_CREATED', payload);
  notifyUser(to_user, {
    type: 'transfer_request',
    date: dateIso,
    start_time: shift.start_time,
    end_time: shift.end_time,
    description: shift.description,
    by: from_user,
  });
  audit(from_user, 'TRANSFER_CREATED', payload);
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
  res.json(rows.map(formatSwap));
});

app.post('/swap/:id/respond', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const { action } = req.body || {};
  if (!['accept', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'bad_action' });
  }

  try {
    const result = await withTransaction(async (client) => {
      const sw = await client.query(
        'SELECT * FROM swap_requests WHERE id = $1 FOR UPDATE',
        [id]
      );
      if (sw.rowCount === 0) return { status: 404 };
      const swap = sw.rows[0];
      if (swap.status !== 'PENDING') return { status: 409, body: { error: 'already_resolved' } };
      if (swap.to_user !== req.user.name) return { status: 403, body: { error: 'not_recipient' } };

      if (action === 'reject') {
        const upd = await client.query(
          `UPDATE swap_requests SET status = 'REJECTED' WHERE id = $1 RETURNING *`,
          [id]
        );
        return { status: 200, body: { swap: upd.rows[0], shifts: [] } };
      }

      // ---- TRANSFER ---- //
      if (swap.type === 'transfer') {
        const r = await client.query(
          'SELECT * FROM shifts WHERE id = $1 FOR UPDATE',
          [swap.shift_id]
        );
        if (r.rowCount === 0) return { status: 410, body: { error: 'shift_gone' } };
        const sh = r.rows[0];
        if (sh.user_name !== swap.from_user) {
          return { status: 409, body: { error: 'shift_changed_hands' } };
        }
        const u = await client.query(
          `UPDATE shifts SET user_name = $1, updated_by = $2,
                            updated_at = NOW(), version = version + 1
           WHERE id = $3 RETURNING *`,
          [swap.to_user, req.user.name, sh.id]
        );
        const upd = await client.query(
          `UPDATE swap_requests SET status = 'ACCEPTED' WHERE id = $1 RETURNING *`,
          [id]
        );
        return { status: 200, body: { swap: upd.rows[0], shifts: [u.rows[0]] } };
      }

      // ---- SWAP ---- //
      const fromDate = ymd(swap.from_date);
      const toDate = ymd(swap.to_date);
      const involved = await client.query(
        `SELECT * FROM shifts
          WHERE ((date = $1 AND user_name IN ($2,$3))
              OR (date = $4 AND user_name IN ($2,$3)))
            AND kind = 'duty'
          FOR UPDATE`,
        [fromDate, swap.from_user, swap.to_user, toDate]
      );
      const get = (date, user) =>
        involved.rows.find((r) => ymd(r.date) === date && r.user_name === user) || null;

      const myFrom = get(fromDate, swap.from_user);
      const theirTo = get(toDate, swap.to_user);

      if (!myFrom) return { status: 409, body: { error: 'requester_shift_missing' } };

      const u1 = await client.query(
        `UPDATE shifts SET user_name = $1, updated_by = $2,
                          updated_at = NOW(), version = version + 1
         WHERE id = $3 RETURNING *`,
        [swap.to_user, req.user.name, myFrom.id]
      );
      let u2 = null;
      if (theirTo) {
        u2 = await client.query(
          `UPDATE shifts SET user_name = $1, updated_by = $2,
                            updated_at = NOW(), version = version + 1
           WHERE id = $3 RETURNING *`,
          [swap.from_user, req.user.name, theirTo.id]
        );
      }
      const upd = await client.query(
        `UPDATE swap_requests SET status = 'ACCEPTED' WHERE id = $1 RETURNING *`,
        [id]
      );
      return {
        status: 200,
        body: {
          swap: upd.rows[0],
          shifts: [u1.rows[0], u2?.rows[0]].filter(Boolean),
        },
      };
    });

    if (result.status !== 200) return res.status(result.status).json(result.body || {});

    const swapPayload = formatSwap(result.body.swap);
    for (const r of result.body.shifts) {
      broadcast('SHIFT_UPSERTED', { shift: formatShift(r), action: 'updated' });
    }
    broadcast('SWAP_UPDATED', swapPayload);

    const initiator = swapPayload.from_user;
    notifyUser(initiator, {
      type: action === 'accept' ? 'shift_accepted' : 'shift_rejected',
      from_date: swapPayload.from_date,
      to_date: swapPayload.to_date,
      by: req.user.name,
    });
    audit(req.user.name, `${swapPayload.type.toUpperCase()}_${action.toUpperCase()}ED`, swapPayload);

    res.json(swapPayload);
  } catch (err) {
    console.error('[swap respond] error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// ---------- stats ----------
app.get('/stats', authMiddleware, async (req, res) => {
  const start = req.query.start;
  if (!isValidIso(start)) return res.status(400).json({ error: 'bad_start_date' });
  const end = addDays(start, 6);
  const { rows } = await query(
    `SELECT user_name, COUNT(*)::int AS count FROM shifts
      WHERE date >= $1 AND date <= $2 GROUP BY user_name`,
    [start, end]
  );
  res.json(rows);
});

// ---------- bootstrap ----------
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
