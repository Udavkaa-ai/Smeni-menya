import React, { useRef } from 'react';
import {
  NAMES, timeRange, timesOverlap,
  computeDayCoverage, intervalLabel, minToTime,
  buildTimelineSegments, workIntervalsFor,
} from '../utils/format.js';

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

  const sveta = sortShifts(allShifts.filter((s) => s.user_name === 'SVETA' && s.kind !== 'work'));
  const maria = sortShifts(allShifts.filter((s) => s.user_name === 'MARIA' && s.kind !== 'work'));
  const work  = sortShifts(allShifts.filter((s) => s.kind === 'work'));
  const none  = allShifts.find((s) => s.user_name === 'NONE');

  const conflict = (() => {
    const items = [...sveta, ...maria];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (timesOverlap(items[i], items[j])) return true;
      }
    }
    return false;
  })();

  const { free, blocked } = computeDayCoverage(allShifts);
  const segments = buildTimelineSegments(allShifts);
  const svetaWork = workIntervalsFor(allShifts, 'SVETA');
  const mariaWork = workIntervalsFor(allShifts, 'MARIA');

  let cardTone = 'free';
  if (sveta.length && maria.length) cardTone = 'duo';
  else if (sveta.length) cardTone = 'sveta';
  else if (maria.length) cardTone = 'maria';
  else if (none || blocked.length) cardTone = 'none';

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

  const totalShifts = sveta.length + maria.length + work.length + (none ? 1 : 0);
  const isFullyFree = free.length === 1 && free[0].start === 0 && free[0].end === 24 * 60;

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
      <WorkVBar intervals={svetaWork} side="left" cls="sveta" label="Света — основная работа" />
      <WorkVBar intervals={mariaWork} side="right" cls="maria" label="Мария — основная работа" />

      <div className="card-content">
        <div className="row1">
          <span className="dow">{dow}</span>
          <span className="date">{dnum}</span>
          {conflict && <span className="conflict-badge">⚠ накладывается</span>}
        </div>

        <Timeline segments={segments} />

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
            {work.map((s) => <WorkRow key={s.id} shift={s} />)}
            {none && (
              <div className="shift-row none-row">
                <span className="dot none" />
                <span className="who-name">Никто из нас не сможет</span>
              </div>
            )}
          </div>
        )}

        {!none && blocked.length > 0 && (
          <div className="auto-blocks">
            {blocked.map((b, i) => (
              <div key={i} className="auto-blocked">
                <span className="dot none" />
                <span>Никто не сможет</span>
                <span className="time-pill">{intervalLabel(b)}</span>
              </div>
            ))}
          </div>
        )}

        {!isFullyFree && free.length > 0 && (
          <div className="auto-free">
            {free.map((f, i) => (
              <div key={i} className="auto-free-row">
                <span className="dot free" />
                <span>Свободно</span>
                <span className="time-pill">{intervalLabel(f)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Timeline({ segments }) {
  return (
    <div className="day-timeline" aria-hidden="true">
      <div className="day-timeline-track">
        {segments.map((s, i) => (
          <div
            key={i}
            className={`tl-seg tl-${s.state}`}
            style={{ flex: `${s.end - s.start} 0 0` }}
            title={`${minToTime(s.start)}–${minToTime(s.end)}`}
          />
        ))}
      </div>
      <div className="day-timeline-axis">
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h} className="ax" style={{ left: `${(h * 60 / 1440) * 100}%` }}>
            {h === 24 ? '24' : h}
          </span>
        ))}
      </div>
    </div>
  );
}

function WorkVBar({ intervals, side, cls, label }) {
  if (!intervals?.length) return <div className={`work-vbar ${side}`} aria-hidden="true" />;
  return (
    <div className={`work-vbar ${side}`} aria-label={label} title={label}>
      {intervals.map((iv, i) => (
        <div
          key={iv.id || i}
          className={`vbar-seg ${cls}`}
          style={{
            top: `${(iv.start / 1440) * 100}%`,
            height: `${((iv.end - iv.start) / 1440) * 100}%`,
          }}
          title={`${minToTime(iv.start)}–${minToTime(iv.end)} основная работа`}
        />
      ))}
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

function WorkRow({ shift }) {
  const cls = shiftClass(shift.user_name);
  const tr = timeRange(shift.start_time, shift.end_time);
  return (
    <div className={`shift-row work-row ${cls}-row`}>
      <span className={`dot ${cls}`} />
      <span className="who-name">{NAMES[shift.user_name]}: основная работа</span>
      {tr && <span className="time-pill">{tr}</span>}
    </div>
  );
}
