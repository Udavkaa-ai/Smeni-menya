import React, { useRef } from 'react';

const DOW = ['ВС','ПН','ВТ','СР','ЧТ','ПТ','СБ'];
const NAME = { SVETA: 'Света', MARIA: 'Мария', NONE: 'Никто' };

function colorClass(assigned) {
  if (assigned === 'SVETA') return 'sveta';
  if (assigned === 'MARIA') return 'maria';
  if (assigned === 'NONE') return 'none';
  return 'free';
}

export default function DayCard({ day, isToday, onTap, onLongPress }) {
  const cls = colorClass(day.assigned_to);
  const press = useRef({ timer: null, fired: false, x: 0, y: 0 });

  function handleStart(e) {
    const p = e.touches ? e.touches[0] : e;
    press.current.fired = false;
    press.current.x = p.clientX;
    press.current.y = p.clientY;
    press.current.timer = setTimeout(() => {
      press.current.fired = true;
      try { navigator.vibrate?.(15); } catch {}
      onLongPress?.();
    }, 500);
  }
  function handleMove(e) {
    const p = e.touches ? e.touches[0] : e;
    if (Math.abs(p.clientX - press.current.x) > 10 || Math.abs(p.clientY - press.current.y) > 10) {
      clearTimeout(press.current.timer);
    }
  }
  function handleEnd() {
    clearTimeout(press.current.timer);
    if (!press.current.fired) onTap?.();
  }
  function handleCancel() {
    clearTimeout(press.current.timer);
  }

  const dt = new Date(day.date + 'T00:00:00Z');
  const dow = DOW[dt.getUTCDay()];
  const dnum = dt.getUTCDate();

  return (
    <div
      className={`card ${cls} ${isToday ? 'today' : ''}`}
      onTouchStart={handleStart}
      onTouchMove={handleMove}
      onTouchEnd={handleEnd}
      onTouchCancel={handleCancel}
      onMouseDown={handleStart}
      onMouseMove={handleMove}
      onMouseUp={handleEnd}
      onMouseLeave={handleCancel}
    >
      <div className="row1">
        <span className="dow">{dow}</span>
        <span className="date">{dnum}</span>
        {day.is_work_day && <span className="work">основная работа</span>}
      </div>
      <div className="who">
        <span className={`dot ${cls}`} />
        {day.assigned_to ? NAME[day.assigned_to] : <span className="empty-day">Не назначено</span>}
      </div>
      {(day.start_time || day.end_time) && (
        <div className="meta">{day.start_time || '—'}–{day.end_time || '—'}</div>
      )}
      {day.description && <div className="desc">{day.description}</div>}
    </div>
  );
}
