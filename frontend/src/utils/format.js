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

// Time overlap check for HH:MM strings.
export function timesOverlap(a, b) {
  if (!a?.start_time || !a?.end_time) return false;
  if (!b?.start_time || !b?.end_time) return false;
  return a.start_time < b.end_time && b.start_time < a.end_time;
}

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
