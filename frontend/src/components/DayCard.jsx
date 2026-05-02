import React, { useRef } from 'react';
import {
  NAMES, timeRange, timesOverlap,
  computeDayCoverage, intervalLabel, minToTime,
  buildTimelineSegments, workIntervalsFor, findIntraUserConflicts,
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

export default function DayCard({ day, isToday, isPast, expanded = true, onTap, onLongPress }) {
  // press state — used to distinguish tap from long-press from drag.
  // We use Pointer Events so touch and mouse don't both fire on the same gesture.
  const press = useRef({ timer: null, fired: false, x: 0, y: 0, pointerId: null });
  const lastTap = useRef(0);
  const allShifts = day.shifts || [];

  const isDuty = (s) => s.kind !== 'work' && s.kind !== 'other';
  const sveta = sortShifts(allShifts.filter((s) => s.user_name === 'SVETA' && isDuty(s)));
  const maria = sortShifts(allShifts.filter((s) => s.user_name === 'MARIA' && isDuty(s)));
  const work  = sortShifts(allShifts.filter((s) => s.kind === 'work'));
  const other = sortShifts(allShifts.filter((s) => s.kind === 'other'));
  const none  = allShifts.find((s) => s.user_name === 'NONE');

  // Cross-user duty overlap.
  const dutyClash = (() => {
    const items = [...sveta, ...maria];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (timesOverlap(items[i], items[j])) return true;
      }
    }
    return false;
  })();
  // Intra-user: own duty overlapping own work/other (impossible to be in two places).
  const selfConflicts = findIntraUserConflicts(allShifts);
  const conflict = dutyClash || selfConflicts.length > 0;

  const { free, blocked, suggestSveta, suggestMaria } = computeDayCoverage(allShifts);
  const segments = buildTimelineSegments(allShifts);
  const svetaWork = workIntervalsFor(allShifts, 'SVETA');
  const mariaWork = workIntervalsFor(allShifts, 'MARIA');

  let cardTone = 'free';
  if (sveta.length && maria.length) cardTone = 'duo';
  else if (sveta.length) cardTone = 'sveta';
  else if (maria.length) cardTone = 'maria';
  else if (none || blocked.length) cardTone = 'none';

  function handleStart(e) {
    if (press.current.pointerId != null) return;       // ignore extra fingers
    if (e.target.closest('button, input, textarea, label')) return; // not interactive
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
    // Belt-and-suspenders: ignore taps that arrive within 350ms of the
    // previous one (some platforms still synthesize duplicate events).
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

  const totalShifts = sveta.length + maria.length + work.length + other.length + (none ? 1 : 0);
  const isFullyFree = free.length === 1 && free[0].start === 0 && free[0].end === 24 * 60;

  return (
    <div
      className={`card tone-${cardTone} ${isToday ? 'today' : ''} ${isPast ? 'past' : ''} ${conflict ? 'conflict' : ''} ${expanded ? 'expanded' : 'collapsed'}`}
      onPointerDown={handleStart}
      onPointerMove={handleMove}
      onPointerUp={handleEnd}
      onPointerCancel={handleCancel}
      onPointerLeave={handleCancel}
    >
      <WorkVBar intervals={svetaWork} side="left" cls="sveta" label="Света — основная работа" />
      <WorkVBar intervals={mariaWork} side="right" cls="maria" label="Мария — основная работа" />

      <div className="card-content">
        <div className="row1">
          <span className="dow">{dow}</span>
          <span className="date">{dnum}</span>
          {conflict && <span className="conflict-badge">⚠ накладывается</span>}
          {!expanded && <span className="expand-hint">▾</span>}
        </div>

        <Timeline segments={segments} />

        {!expanded && (
          <CompactSummary
            sveta={sveta} maria={maria} work={work} other={other}
            none={!!none} blocked={blocked}
          />
        )}

        {expanded && totalShifts === 0 && (
          <div className="who">
            <span className="dot free" />
            <span className="empty-day">Не назначено</span>
          </div>
        )}

        {expanded && totalShifts > 0 && (
          <div className="shifts">
            {sveta.map((s) => <ShiftRow key={s.id} shift={s} />)}
            {maria.map((s) => <ShiftRow key={s.id} shift={s} />)}
            {work.map((s) => <BusyRow key={s.id} shift={s} kind="work" />)}
            {other.map((s) => <BusyRow key={s.id} shift={s} kind="other" />)}
            {none && (
              <div className="shift-row none-row">
                <span className="dot none" />
                <span className="who-name">Никто из нас не сможет</span>
              </div>
            )}
          </div>
        )}

        {expanded && selfConflicts.length > 0 && (
          <div className="self-conflict">
            {selfConflicts.map((c, i) => (
              <div key={i}>
                ⚠ {NAMES[c.user_name]} одновременно дежурит и занята —
                {' '}{c.duty.start_time}–{c.duty.end_time} ↔ {c.busy.start_time}–{c.busy.end_time}
              </div>
            ))}
          </div>
        )}

        {expanded && suggestMaria.length > 0 && (
          <div className="suggest-list">
            {suggestMaria.map((s, i) => (
              <div key={i} className="suggest-row maria">
                <span className="dot maria" />
                <b>Маша</b> может взять
                <span className="time-pill">{intervalLabel(s)}</span>
              </div>
            ))}
          </div>
        )}
        {expanded && suggestSveta.length > 0 && (
          <div className="suggest-list">
            {suggestSveta.map((s, i) => (
              <div key={i} className="suggest-row sveta">
                <span className="dot sveta" />
                <b>Света</b> может взять
                <span className="time-pill">{intervalLabel(s)}</span>
              </div>
            ))}
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

        {expanded && !isFullyFree && free.length > 0 && (
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

        {expanded && totalShifts > 0 && (
          <div className="card-edit-hint">тап ещё раз — редактировать</div>
        )}
      </div>
    </div>
  );
}

function CompactSummary({ sveta, maria, work, other, none, blocked }) {
  const chips = [];
  if (sveta.length) chips.push({ cls: 'sveta', label: NAMES.SVETA, count: sveta.length });
  if (maria.length) chips.push({ cls: 'maria', label: NAMES.MARIA, count: maria.length });
  if (none) chips.push({ cls: 'none', label: 'Никто' });
  if (!none && blocked.length) chips.push({ cls: 'none', label: 'Никто', count: blocked.length });
  if (work.length)  chips.push({ cls: 'busy', label: 'работа', count: work.length });
  if (other.length) chips.push({ cls: 'busy', label: 'другое', count: other.length });

  if (chips.length === 0) {
    return (
      <div className="compact-summary">
        <span className="empty-day">Не назначено</span>
      </div>
    );
  }
  return (
    <div className="compact-summary">
      {chips.map((c, i) => (
        <span key={i} className={`compact-chip chip-${c.cls}`}>
          <span className={`dot ${c.cls === 'busy' ? 'free' : c.cls}`} />
          {c.label}
          {c.count > 1 ? ` ×${c.count}` : ''}
        </span>
      ))}
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

function BusyRow({ shift, kind }) {
  const cls = shiftClass(shift.user_name);
  const tr = timeRange(shift.start_time, shift.end_time);
  const label = kind === 'work' ? 'основная работа' : 'другое';
  return (
    <div className={`shift-row busy-row ${cls}-row`}>
      <span className={`dot ${cls}`} />
      <span className="who-name">{NAMES[shift.user_name]}: {label}</span>
      {tr && <span className="time-pill">{tr}</span>}
    </div>
  );
}
