import { pool } from './db.js';
import bcrypt from 'bcryptjs';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  push_subscription JSONB
);

-- Legacy table from v1, kept for data migration only.
CREATE TABLE IF NOT EXISTS days (
  id SERIAL PRIMARY KEY,
  date DATE UNIQUE NOT NULL,
  assigned_to TEXT CHECK (assigned_to IN ('SVETA','MARIA','NONE') OR assigned_to IS NULL),
  start_time TEXT,
  end_time TEXT,
  description TEXT DEFAULT '',
  is_work_day BOOLEAN DEFAULT false,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  version INT DEFAULT 1
);

-- Per-user shift entries: each user can mark one or more shifts on a date.
-- A special pseudo-user 'NONE' represents "никто из нас не сможет"
-- (only one NONE marker per date, enforced by partial unique index below).
CREATE TABLE IF NOT EXISTS shifts (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  user_name TEXT NOT NULL CHECK (user_name IN ('SVETA','MARIA','NONE')),
  start_time TEXT,
  end_time TEXT,
  description TEXT DEFAULT '',
  is_work_day BOOLEAN DEFAULT false,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  version INT DEFAULT 1
);

CREATE INDEX IF NOT EXISTS shifts_date_idx ON shifts(date);

-- v1 had UNIQUE (date, user_name) — drop it to allow multiple shifts per user.
ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_date_user_name_key;

-- Keep NONE marker globally unique per date.
CREATE UNIQUE INDEX IF NOT EXISTS shifts_none_unique ON shifts(date) WHERE user_name = 'NONE';

-- Shifts have a kind: 'duty' (caregiving), 'work' (main job, busy),
-- or 'other' (any other personal busy time, no details required).
-- Default is 'duty' for existing rows.
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'duty';
-- Drop any older check constraint so we can broaden it.
ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_kind_check;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shifts_kind_check') THEN
    ALTER TABLE shifts ADD CONSTRAINT shifts_kind_check CHECK (kind IN ('duty','work','other'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS swap_requests (
  id SERIAL PRIMARY KEY,
  from_user TEXT NOT NULL,
  to_user TEXT NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REJECTED','CANCELLED')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS swap_status_idx ON swap_requests(status);

-- Swap requests have a type: 'swap' (mutual two-day exchange) or
-- 'transfer' (one-way handover of a single shift).
ALTER TABLE swap_requests ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'swap';
ALTER TABLE swap_requests ADD COLUMN IF NOT EXISTS shift_id INTEGER;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'swap_requests_type_check') THEN
    ALTER TABLE swap_requests ADD CONSTRAINT swap_requests_type_check CHECK (type IN ('swap','transfer'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  actor TEXT,
  action TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Persistent notifications shown in-app until acknowledged.
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  recipient TEXT NOT NULL CHECK (recipient IN ('SVETA','MARIA')),
  kind TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  related_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS notifications_recipient_unack_idx
  ON notifications(recipient, created_at) WHERE acknowledged_at IS NULL;
`;

async function ensureUsers() {
  const sveta = process.env.SVETA_PASSWORD || 'sveta123';
  const maria = process.env.MARIA_PASSWORD || 'maria123';
  const sHash = await bcrypt.hash(sveta, 10);
  const mHash = await bcrypt.hash(maria, 10);
  await pool.query(
    `INSERT INTO users (name, password_hash) VALUES ('SVETA', $1)
     ON CONFLICT (name) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [sHash]
  );
  await pool.query(
    `INSERT INTO users (name, password_hash) VALUES ('MARIA', $1)
     ON CONFLICT (name) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [mHash]
  );
}

// One-time idempotent migration: copy any old `days` rows into `shifts`.
// Old model had one assignee per day; new model has shifts keyed by id.
// We use NOT EXISTS instead of ON CONFLICT because shifts no longer has a
// (date, user_name) unique constraint.
async function migrateDaysToShifts() {
  await pool.query(`
    INSERT INTO shifts (date, user_name, start_time, end_time, description, is_work_day, updated_by, updated_at)
    SELECT d.date, d.assigned_to,
           NULLIF(d.start_time, ''),
           NULLIF(d.end_time, ''),
           COALESCE(d.description, ''),
           COALESCE(d.is_work_day, false),
           d.updated_by,
           COALESCE(d.updated_at, NOW())
    FROM days d
    WHERE d.assigned_to IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM shifts s
         WHERE s.date = d.date AND s.user_name = d.assigned_to
      );
  `);
}

export async function migrate() {
  await pool.query(SCHEMA);
  await ensureUsers();
  await migrateDaysToShifts();
  console.log('[migrate] schema ready, users seeded');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
