import { pool } from './db.js';
import bcrypt from 'bcryptjs';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  push_subscription JSONB
);

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

CREATE INDEX IF NOT EXISTS days_date_idx ON days(date);

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

CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  actor TEXT,
  action TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
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

export async function migrate() {
  await pool.query(SCHEMA);
  await ensureUsers();
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
