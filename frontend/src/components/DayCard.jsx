import React from 'react';
import {
  NAMES, timeRange, computeDayCoverage, intervalLabel,
  buildTimelineSegments, minToTime, timeToMin,
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

// Always-expanded card. A single tap anywhere opens the editor.
// No long-press, no collapse/expand state — the simplest possible
// interaction that survives flaky pointer/touch quirks on iOS.
export default function DayCard({ day, prevShifts = [], isToday, isPast, onTap }) {
  const allShifts = day.shifts || [];
  const svetaBusy = sortShifts(allShifts.filter((s) => s.user_name === 'SVETA' && isBusyKind(s)));
  const mariaBusy = sortShifts(allShifts.filter((s) => s.user_name === 'MARIA' && isBusyKind(s)));

  const { blocked } = computeDayCoverage(allShifts, prevShifts);
  const segments = buildTimelineSegments(allShifts, prevShifts);

  // Vertical bars: own busy intervals on this day, plus the 0→end tail
  // of any overnight shift the user had on the previous day.
  function busyVbar(userName) {
    const own = allShifts
      .filter((s) => s.user_name === userName && isBusyKind(s))
      .flatMap((s) => {
        const a = timeToMin(s.start_time);
        const b = timeToMin(s.end_time);
        if (a == null || b == null) return [];
        if (b > a) return [{ id: s.id, start: a, end: b }];
        if (b < a) return [{ id: s.id, start: a, end: 1440 }];
        return [];
      });
    const tails = (prevShifts || [])
      .filter((s) => s.user_name === userName && isBusyKind(s))
      .flatMap((s) => {
        const a = timeToMin(s.start_time);
        const b = timeToMin(s.end_time);
        if (a == null || b == null || b >= a) return [];
        return [{ id: `${s.id}-tail`, start: 0, end: b }];
      });
    return [...own, ...tails].sort((a, b) => a.start - b.start);
  }
  const svetaVbar = busyVbar('SVETA');
  const mariaVbar = busyVbar('MARIA');

  let cardTone = 'free';
  if (blocked.length) cardTone = 'none';
  else if (svetaBusy.length && mariaBusy.length) cardTone = 'duo';
  else if (svetaBusy.length) cardTone = 'sveta';
  else if (mariaBusy.length) cardTone = 'maria';

  const dt = new Date(day.date + 'T00:00:00Z');
  const dow = DOW[dt.getUTCDay()];
  const dnum = dt.getUTCDate();

  const totalEntries = svetaBusy.length + mariaBusy.length;

  return (
    <div
      className={`card tone-${cardTone} ${isToday ? 'today' : ''} ${isPast ? 'past' : ''}`}
      onClick={onTap}
      role="button"
      tabIndex={0}
    >
      <div className="card-grid">
        <WorkVBar intervals={svetaVbar} cls="sveta" label="Света — занятость" />

        <div className="card-content">
          <div className="card-header">
            <div className="row1">
              <span className="dow">{dow}</span>
              <span className="date">{dnum}</span>
            </div>
            <Timeline segments={segments} />
          </div>

          {totalEntries === 0 && !blocked.length && (
            <div className="empty-day-row">
              <span className="dot free" />
              <span className="empty-day">Все свободны</span>
            </div>
          )}

          {totalEntries > 0 && (
            <div className="busy-list">
              {svetaBusy.map((s) => <BusyCard key={s.id} shift={s} />)}
              {mariaBusy.map((s) => <BusyCard key={s.id} shift={s} />)}
            </div>
          )}

          {blocked.length > 0 && (
            <div className="auto-blocks">
              {blocked.map((b, i) => (
                <div key={i} className="auto-blocked">
                  <span className="dot none" />
                  <span>Обе заняты — нужно решить</span>
                  <span className="time-pill">{intervalLabel(b)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <WorkVBar intervals={mariaVbar} cls="maria" label="Мария — занятость" />
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
    </div>
  );
}

function WorkVBar({ intervals, cls, label }) {
  if (!intervals?.length) return <div className="work-vbar" aria-hidden="true" />;
  return (
    <div className="work-vbar" aria-label={label} title={label}>
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
