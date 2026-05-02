import React, { useRef } from 'react';
import { NAMES, timesOverlap, timeRange } from '../utils/format.js';

const DOW = ['ВС','ПН','ВТ','СР','ЧТ','ПТ','СБ'];

function shiftClass(user) {
  if (user === 'SVETA') return 'sveta';
  if (user === 'MARIA') return 'maria';
  if (user === 'NONE')  return 'none';
  return 'free';
}

function sortShifts(arr) {
  return [...arr].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
}

export default function DayCard({ day, isToday, isPast, onTap, onLongPress }) {
  const press = useRef({ timer: null, fired: false, x: 0, y: 0 });
  const allShifts = day.shifts || [];

  const sveta = sortShifts(allShifts.filter((s) => s.user_name === 'SVETA'));
  const maria = sortShifts(allShifts.filter((s) => s.user_name === 'MARIA'));
  const none  = allShifts.find((s) => s.user_name === 'NONE');

  // Conflict: any pair of shifts (same or different user) with overlapping times,
  // OR NONE marker plus any real shift.
  const conflict = (() => {
    const items = [...sveta, ...maria];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (timesOverlap(items[i], items[j])) return true;
      }
    }
    if (none && (sveta.length || maria.length)) return true;
    return false;
  })();

  let cardTone = 'free';
  if (sveta.length && maria.length) cardTone = 'duo';
  else if (sveta.length) cardTone = 'sveta';
  else if (maria.length) cardTone = 'maria';
  else if (none) cardTone = 'none';

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

  const anyWork = allShifts.some((s) => s.is_work_day);
  const totalShifts = sveta.length + maria.length + (none ? 1 : 0);

  return (
    <div
      className={`card tone-${cardTone} ${isToday ? 'today' : ''} ${isPast ? 'past' : ''} ${conflict ? 'conflict' : ''}`}
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
        {anyWork && <span className="work">основная работа</span>}
        {conflict && <span className="conflict-badge">⚠ накладывается</span>}
      </div>

      {totalShifts === 0 && (
        <div className="who">
          <span className="dot free" />
          <span className="empty-day">Не назначено</span>
        </div>
      )}

      {totalShifts > 0 && (
        <div className="shifts">
          {sveta.map((s) => <ShiftRow key={s.id} shift={s} />)}
          {maria.map((s) => <ShiftRow key={s.id} shift={s} />)}
          {none && (
            <div className="shift-row none-row">
              <span className="dot none" />
              <span className="who-name">Никто из нас не сможет</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ShiftRow({ shift }) {
  const cls = shiftClass(shift.user_name);
  const tr = timeRange(shift.start_time, shift.end_time);
  return (
    <div className={`shift-row ${cls}-row`}>
      <span className={`dot ${cls}`} />
      <span className="who-name">{NAMES[shift.user_name]}</span>
      {tr && <span className="time-pill">{tr}</span>}
      {shift.description && <div className="desc">{shift.description}</div>}
    </div>
  );
}
