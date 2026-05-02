// Russian date / time / notification formatting helpers — used by UI and toasts.

const DOWS  = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const DOWS_FULL = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
const MONTHS = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];

export const NAMES   = { SVETA: 'Света',  MARIA: 'Мария',  NONE: 'Никто' };
export const ACCUS   = { SVETA: 'Свету',  MARIA: 'Марию' };       // accusative
export const FROM_F  = { SVETA: 'Света',  MARIA: 'Мария' };       // for headings
export const NAME_FEM = { SVETA: 'взяла', MARIA: 'взяла' };       // both feminine

export function ruDateShort(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00Z');
  return `${DOWS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function ruDateLong(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00Z');
  return `${DOWS_FULL[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function timeRange(s, e) {
  if (!s && !e) return null;
  return `${s || '—'}–${e || '—'}`;
}

// Build human-readable Russian message for a notification payload from the server.
export function formatNotification(p) {
  if (!p) return '';
  const by   = NAMES[p.by] || p.by;
  const date = ruDateShort(p.date);
  const tr   = timeRange(p.start_time, p.end_time);

  switch (p.type) {
    case 'shift_added': {
      // someone added a shift for self
      const time = tr ? `, ${tr}` : '';
      return `${by} взяла ${date}${time}`;
    }
    case 'shift_removed': {
      return `${by} убрала свою смену на ${date}`;
    }
    case 'shift_updated': {
      const parts = [];
      if (p.changes?.includes('time')) {
        const prev = timeRange(p.prev_start_time, p.prev_end_time);
        const next = tr || 'без времени';
        parts.push(prev ? `время: ${prev} → ${next}` : `время: ${next}`);
      }
      if (p.changes?.includes('description')) {
        parts.push(p.description ? `описание: «${trim(p.description, 40)}»` : 'убрала описание');
      }
      if (p.changes?.includes('work_day')) {
        parts.push(p.is_work_day ? 'отметила «основная работа»' : 'сняла «основная работа»');
      }
      const tail = parts.length ? ` — ${parts.join(', ')}` : '';
      return `${by} обновила ${date}${tail}`;
    }
    case 'none_marked':
      return `${by} отметила ${date}: никто из нас не сможет`;
    case 'none_unmarked':
      return `${by} убрала отметку «никто» с ${date}`;
    case 'shift_request':
      return `${by} предлагает обмен: ${ruDateShort(p.from_date)} ↔ ${ruDateShort(p.to_date)}`;
    case 'transfer_request': {
      const tr = timeRange(p.start_time, p.end_time);
      return `${by} предлагает забрать её смену ${ruDateShort(p.date)}${tr ? `, ${tr}` : ''}`;
    }
    case 'shift_accepted':
      return `${by} приняла обмен: ${ruDateShort(p.from_date)} ↔ ${ruDateShort(p.to_date)}`;
    case 'shift_rejected':
      return `${by} отклонила обмен: ${ruDateShort(p.from_date)} ↔ ${ruDateShort(p.to_date)}`;
    case 'empty_day_warning':
      return `Внимание: ${ruDateShort(p.date)} остался без дежурного`;
    default:
      return `${by} изменила ${date || ''}`.trim();
  }
}

export function notificationTitle(type) {
  switch (type) {
    case 'shift_added':    return 'Новая смена';
    case 'shift_removed':  return 'Смена снята';
    case 'shift_updated':  return 'Смена изменена';
    case 'none_marked':    return 'Никто не сможет';
    case 'none_unmarked':  return 'Отметка снята';
    case 'shift_request':  return 'Запрос на обмен';
    case 'shift_accepted': return 'Обмен принят';
    case 'shift_rejected': return 'Обмен отклонён';
    case 'empty_day_warning': return 'Внимание: пустой день';
    default: return 'Сменимся';
  }
}

function trim(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// True if a shift wraps past midnight (e.g. 21:00–04:00).
export function isOvernight(shift) {
  const a = timeToMin(shift?.start_time);
  const b = timeToMin(shift?.end_time);
  return a != null && b != null && b < a;
}

// Time overlap check for HH:MM strings.
export function timesOverlap(a, b) {
  if (!a?.start_time || !a?.end_time) return false;
  if (!b?.start_time || !b?.end_time) return false;
  return a.start_time < b.end_time && b.start_time < a.end_time;
}

// Convert "HH:MM" to minutes since midnight (0..1440). null/empty → null.
export function timeToMin(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}
export function minToTime(m) {
  if (m == null) return '';
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// Merge a list of intervals [{start, end}] into non-overlapping union.
function mergeIntervals(intervals) {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const out = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    const cur = sorted[i];
    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

// Subtract `holes` (each {start,end}) from `total` ({start,end}). Returns array of remaining gaps.
function subtract(total, holes) {
  const merged = mergeIntervals(holes);
  const gaps = [];
  let cursor = total.start;
  for (const h of merged) {
    if (h.end <= total.start) continue;
    if (h.start >= total.end) break;
    if (h.start > cursor) gaps.push({ start: cursor, end: Math.min(h.start, total.end) });
    cursor = Math.max(cursor, h.end);
    if (cursor >= total.end) break;
  }
  if (cursor < total.end) gaps.push({ start: cursor, end: total.end });
  return gaps;
}

// Intersect two interval sets — used to find moments when BOTH users are blocked by work.
function intersect(setA, setB) {
  const out = [];
  for (const a of setA) {
    for (const b of setB) {
      const start = Math.max(a.start, b.start);
      const end = Math.min(a.end, b.end);
      if (end > start) out.push({ start, end });
    }
  }
  return mergeIntervals(out);
}

const DAY_START = 0;
const DAY_END   = 24 * 60;

// Compute fine-grained day coverage in the SIMPLIFIED model:
// users only enter BUSY (work/other) intervals. Duty is implicit —
// whoever isn't busy is "with mom" by default. Existing duty entries
// from the old model are silently ignored here.
//
// Returns:
//   blocked       — both users are busy OR a NONE marker is set
//   svetaBusy/mariaBusy — each user's busy intervals (merged)
//   svetaCovers   — Maria is busy, Sveta is not (Sveta is on duty)
//   mariaCovers   — Sveta is busy, Maria is not (Maria is on duty)
//   free          — neither is busy → either is with mom by default
// Given a shift that may be overnight (end_time < start_time), return the
// intervals it occupies on the SAME day. An overnight shift shows up as
// (start, 24:00) on its own date; the (00:00, end) tail is added separately
// to the NEXT day via prev_shifts.
function intervalsOnDay(shift) {
  const a = timeToMin(shift.start_time);
  const b = timeToMin(shift.end_time);
  if (a == null || b == null) return [];
  if (b > a) return [{ start: a, end: b }];
  if (b < a) return [{ start: a, end: 1440 }];
  return [];
}

// Given a previous-day shift, return the (00:00, end) tail it adds to today.
function tailFromPrevDay(shift) {
  const a = timeToMin(shift.start_time);
  const b = timeToMin(shift.end_time);
  if (a == null || b == null || b >= a) return [];
  return [{ start: 0, end: b }];
}

export function computeDayCoverage(shifts, prevShifts = []) {
  const list = shifts || [];
  const noneMarker = list.find((s) => s.user_name === 'NONE');
  const allDayBlocked = !!noneMarker;
  const isBusy = (k) => k === 'work' || k === 'other';

  function busyFor(userName) {
    const own = list
      .filter((s) => s.user_name === userName && isBusy(s.kind))
      .flatMap(intervalsOnDay);
    const tails = (prevShifts || [])
      .filter((s) => s.user_name === userName && isBusy(s.kind))
      .flatMap(tailFromPrevDay);
    return mergeIntervals([...own, ...tails]);
  }

  const svetaBusy = busyFor('SVETA');
  const mariaBusy = busyFor('MARIA');

  const blocked = allDayBlocked
    ? [{ start: DAY_START, end: DAY_END }]
    : intersect(svetaBusy, mariaBusy);

  const svetaCovers = mariaBusy.flatMap((iv) => subtract(iv, svetaBusy));
  const mariaCovers = svetaBusy.flatMap((iv) => subtract(iv, mariaBusy));

  const free = subtract(
    { start: DAY_START, end: DAY_END },
    [...svetaBusy, ...mariaBusy, ...blocked]
  );

  return {
    free,
    blocked,
    svetaBusy,
    mariaBusy,
    svetaCovers: mergeIntervals(svetaCovers),
    mariaCovers: mergeIntervals(mariaCovers),
    // back-compat fields so call sites that destructure don't break:
    duty: [],
    suggestSveta: [],
    suggestMaria: [],
  };
}

export function intervalLabel(iv) {
  return `${minToTime(iv.start)}–${minToTime(iv.end)}`;
}

// Build a list of contiguous timeline segments covering 0..1440 minutes.
// In the simplified busy-only model:
//   'sveta'   — only Sveta is busy   (her color)
//   'maria'   — only Maria is busy   (her color)
//   'blocked' — both busy or NONE marker
//   'free'    — neither is busy (default; either is with mom)
export function buildTimelineSegments(shifts, prevShifts = []) {
  const list = shifts || [];
  const isBusy = (k) => k === 'work' || k === 'other';
  const noneFlag = !!list.find((s) => s.user_name === 'NONE');

  // For each user, expand busy entries into [{start,end}] intervals
  // that respect overnight wrapping AND tail-from-prev-day.
  function intervalsOf(user) {
    const own = list
      .filter((s) => s.user_name === user && isBusy(s.kind))
      .flatMap(intervalsOnDay);
    const tails = (prevShifts || [])
      .filter((s) => s.user_name === user && isBusy(s.kind))
      .flatMap(tailFromPrevDay);
    return [...own, ...tails];
  }
  const intsS = intervalsOf('SVETA');
  const intsM = intervalsOf('MARIA');

  const points = new Set([0, 1440]);
  for (const iv of [...intsS, ...intsM]) {
    points.add(iv.start);
    points.add(iv.end);
  }
  const sorted = [...points].sort((a, b) => a - b);

  const inSet = (set, mid) => set.some((iv) => iv.start < mid && mid < iv.end);

  const raw = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (end <= start) continue;
    const mid = (start + end) / 2;
    const sB = inSet(intsS, mid);
    const mB = inSet(intsM, mid);

    let state = 'free';
    if (noneFlag || (sB && mB)) state = 'blocked';
    else if (sB) state = 'sveta';
    else if (mB) state = 'maria';

    raw.push({ start, end, state });
  }

  const merged = [];
  for (const seg of raw) {
    const last = merged[merged.length - 1];
    if (last && last.state === seg.state) last.end = seg.end;
    else merged.push({ ...seg });
  }
  return merged;
}

// Detect when a single user has overlapping duty + busy (work/other) shifts —
// nonsensical because she can't be on duty and away simultaneously.
export function findIntraUserConflicts(shifts) {
  const conflicts = [];
  for (const u of ['SVETA', 'MARIA']) {
    const duty = (shifts || []).filter((s) => s.user_name === u && s.kind !== 'work' && s.kind !== 'other');
    const busy = (shifts || []).filter((s) => s.user_name === u && (s.kind === 'work' || s.kind === 'other'));
    for (const d of duty) {
      for (const b of busy) {
        if (timesOverlap(d, b)) {
          conflicts.push({ user_name: u, duty: d, busy: b });
        }
      }
    }
  }
  return conflicts;
}

// Extract work intervals for a single user as plain {start, end} list, sorted.
export function workIntervalsFor(shifts, userName) {
  return (shifts || [])
    .filter((s) => s.user_name === userName && s.kind === 'work')
    .map((s) => ({ start: timeToMin(s.start_time), end: timeToMin(s.end_time), id: s.id }))
    .filter((x) => x.start != null && x.end != null && x.end > x.start)
    .sort((a, b) => a.start - b.start);
}

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
