import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { query } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TOKEN_TTL = '30d';

export async function login(name, password) {
  const upper = String(name || '').toUpperCase();
  if (!['SVETA', 'MARIA'].includes(upper)) return null;
  const { rows } = await query('SELECT * FROM users WHERE name = $1', [upper]);
  const user = rows[0];
  if (!user) return null;
  const ok = await bcrypt.compare(password || '', user.password_hash);
  if (!ok) return null;
  const token = jwt.sign({ name: upper }, JWT_SECRET, { expiresIn: TOKEN_TTL });
  return { token, name: upper };
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { name: payload.name };
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}
