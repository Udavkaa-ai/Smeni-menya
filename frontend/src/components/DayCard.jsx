import React, { useRef } from 'react';
import {
  NAMES, timeRange, computeDayCoverage, intervalLabel,
  buildTimelineSegments, workIntervalsFor, minToTime,
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

const isBusyKind = (s) => s.kind === 'work' || s.kind === 'other';

export default function DayCard({ day, isToday, isPast, expanded = true, onTap, onLongPress }) {
  const press = useRef({ timer: null, fired: false, x: 0, y: 0, pointerId: null });
  const lastTap = useRef(0);
  const allShifts = day.shifts || [];

  // In the simplified model we only render BUSY entries. Legacy duty entries
  // sit in DB but are ignored by the UI.
  const svetaBusy = sortShifts(allShifts.filter((s) => s.user_name === 'SVETA' && isBusyKind(s)));
  const mariaBusy = sortShifts(allShifts.filter((s) => s.user_name === 'MARIA' && isBusyKind(s)));
  const none = allShifts.find((s) => s.user_name === 'NONE');

  const { blocked } = computeDayCoverage(allShifts);
  const segments = buildTimelineSegments(allShifts);
  const svetaWork = workIntervalsFor(allShifts, 'SVETA').concat(
    allShifts
      .filter((s) => s.user_name === 'SVETA' && s.kind === 'other')
      .map((s) => ({ start: timeToMinSafe(s.start_time), end: timeToMinSafe(s.end_time), id: s.id }))
      .filter((x) => x.start != null && x.end != null && x.end > x.start)
  );
  const mariaWork = workIntervalsFor(allShifts, 'MARIA').concat(
    allShifts
      .filter((s) => s.user_name === 'MARIA' && s.kind === 'other')
      .map((s) => ({ start: timeToMinSafe(s.start_time), end: timeToMinSafe(s.end_time), id: s.id }))
      .filter((x) => x.start != null && x.end != null && x.end > x.start)
  );

  let cardTone = 'free';
  if (none || blocked.length) cardTone = 'none';
  else if (svetaBusy.length && mariaBusy.length) cardTone = 'duo';
  else if (svetaBusy.length) cardTone = 'sveta';
  else if (mariaBusy.length) cardTone = 'maria';

  function handleStart(e) {
    if (press.current.pointerId != null) return;
    if (e.target.closest('button, input, textarea, label')) return;
    press.current.pointerId = e.pointerId;
    press.current.fired = false;
    press.current.x = e.clientX;
    press.current.y = e.clientY;
    press.current.timer = setTimeout(() => {
      press.current.fired = true;
      try { navigator.vibrate?.(15); } catch {}
      onLongPress?.();
    }, 500);
  }
  function handleMove(e) {
    if (press.current.pointerId !== e.pointerId) return;
    if (Math.abs(e.clientX - press.current.x) > 10 || Math.abs(e.clientY - press.current.y) > 10) {
      clearTimeout(press.current.timer);
      press.current.pointerId = null;
    }
  }
  function handleEnd(e) {
    if (press.current.pointerId !== e.pointerId) return;
    clearTimeout(press.current.timer);
    const wasLongPress = press.current.fired;
    press.current.pointerId = null;
    if (wasLongPress) return;
    const now = Date.now();
    if (now - lastTap.current < 350) return;
    lastTap.current = now;
    onTap?.();
  }
  function handleCancel() {
    clearTimeout(press.current.timer);
    press.current.pointerId = null;
  }

  const dt = new Date(day.date + 'T00:00:00Z');
  const dow = DOW[dt.getUTCDay()];
  const dnum = dt.getUTCDate();

  const totalEntries = svetaBusy.length + mariaBusy.length + (none ? 1 : 0);

  return (
    <div
      className={`card tone-${cardTone} ${isToday ? 'today' : ''} ${isPast ? 'past' : ''} ${expanded ? 'expanded' : 'collapsed'}`}
      onPointerDown={handleStart}
      onPointerMove={handleMove}
      onPointerUp={handleEnd}
      onPointerCancel={handleCancel}
      onPointerLeave={handleCancel}
    >
      <WorkVBar intervals={svetaWork} side="left"  cls="sveta" label="Света — занятость" />
      <WorkVBar intervals={mariaWork} side="right" cls="maria" label="Мария — занятость" />

      <div className="card-content">
        <div className="row1">
          <span className="dow">{dow}</span>
          <span className="date">{dnum}</span>
          {!expanded && <span className="expand-hint">▾</span>}
        </div>

        <Timeline segments={segments} />

        {!expanded && (
          <CompactSummary svetaBusy={svetaBusy} mariaBusy={mariaBusy} none={!!none} blocked={blocked} />
        )}

        {expanded && totalEntries === 0 && (
          <div className="who">
            <span className="dot free" />
            <span className="empty-day">Все свободны</span>
          </div>
        )}

        {expanded && totalEntries > 0 && (
          <div className="busy-list">
            {svetaBusy.map((s) => <BusyCard key={s.id} shift={s} />)}
            {mariaBusy.map((s) => <BusyCard key={s.id} shift={s} />)}
            {none && (
              <div className="busy-card none">
                <div className="busy-head">
                  <span className="dot none" />
                  <b>Никто из нас не сможет</b>
                </div>
              </div>
            )}
          </div>
        )}

        {expanded && !none && blocked.length > 0 && (
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
      </div>
    </div>
  );
}

function timeToMinSafe(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
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
          title={`${minToTime(iv.start)}–${minToTime(iv.end)} занятость`}
        />
      ))}
    </div>
  );
}

function CompactSummary({ svetaBusy, mariaBusy, none, blocked }) {
  const chips = [];
  if (svetaBusy.length) chips.push({ cls: 'sveta', label: NAMES.SVETA, count: svetaBusy.length });
  if (mariaBusy.length) chips.push({ cls: 'maria', label: NAMES.MARIA, count: mariaBusy.length });
  if (none) chips.push({ cls: 'none', label: 'Никто' });
  else if (blocked.length) chips.push({ cls: 'none', label: 'Никто', count: blocked.length });

  if (chips.length === 0) {
    return (
      <div className="compact-summary">
        <span className="empty-day">Все свободны</span>
      </div>
    );
  }
  return (
    <div className="compact-summary">
      {chips.map((c, i) => (
        <span key={i} className={`compact-chip chip-${c.cls}`}>
          <span className={`dot ${c.cls}`} />
          {c.label}
          {c.count > 1 ? ` ×${c.count}` : ''}
        </span>
      ))}
    </div>
  );
}

function BusyCard({ shift }) {
  const cls = shiftClass(shift.user_name);
  const tr = timeRange(shift.start_time, shift.end_time);
  return (
    <div className={`busy-card ${cls}`}>
      <div className="busy-head">
        <span className={`dot ${cls}`} />
        <b>{NAMES[shift.user_name]}</b>
        {tr && <span className="busy-time">{tr}</span>}
      </div>
      {shift.description && <div className="busy-desc">{shift.description}</div>}
    </div>
  );
}
