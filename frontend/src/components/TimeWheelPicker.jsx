import React, { useEffect, useRef } from 'react';
import { timeToMin, minToTime } from '../utils/format.js';

// Stable arrays — prevents Wheel's effect from re-running on every render.
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINS  = Array.from({ length: 12 }, (_, i) => i * 5);

const ITEM_H = 56;

// Vertical scroll-snap wheel — a single column of values where the centered
// item is the current selection. Drag/scroll up-down to change.
function Wheel({ values, value, onChange, suffix }) {
  const scrollRef = useRef(null);
  const debounce = useRef(null);
  const programmatic = useRef(false);
  // Remember the last value WE just emitted via onChange so the next
  // useEffect run (triggered by parent re-render) doesn't snap the scroll
  // position back while the user is still mid-drag.
  const lastEmitted = useRef(null);

  // Snap to the current value when prop changes externally — but skip the
  // snap if the change came from our own onChange call.
  useEffect(() => {
    if (lastEmitted.current === value) {
      lastEmitted.current = null;
      return;
    }
    const el = scrollRef.current;
    if (!el) return;
    const idx = values.indexOf(value);
    if (idx < 0) return;
    const top = idx * ITEM_H;
    if (Math.abs(el.scrollTop - top) > 2) {
      programmatic.current = true;
      el.scrollTo({ top, behavior: 'auto' });
      setTimeout(() => { programmatic.current = false; }, 60);
    }
    // values is stable (module-level constants), so it's safe to omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function onScroll() {
    if (programmatic.current) return;
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      const el = scrollRef.current;
      if (!el) return;
      const idx = Math.round(el.scrollTop / ITEM_H);
      const v = values[Math.max(0, Math.min(values.length - 1, idx))];
      if (v !== value) {
        lastEmitted.current = v;
        onChange(v);
      }
    }, 150);
  }

  return (
    <div className="wheel-wrap" aria-label={suffix}>
      <div className="wheel" ref={scrollRef} onScroll={onScroll}>
        <div className="wheel-pad" />
        {values.map((v) => (
          <div
            key={v}
            className={`wheel-item ${v === value ? 'sel' : ''}`}
          >
            <span className="wheel-num">{String(v).padStart(2, '0')}</span>
            {suffix && <span className="wheel-suffix">{suffix}</span>}
          </div>
        ))}
        <div className="wheel-pad" />
      </div>
      <div className="wheel-center-band" aria-hidden="true" />
    </div>
  );
}

export default function TimeWheelPicker({ value, onChange, label }) {
  const minutes = timeToMin(value) ?? 0;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const mSnap = Math.round(m / 5) * 5;

  function set(newH, newM) {
    onChange(`${String(newH).padStart(2,'0')}:${String(newM).padStart(2,'0')}`);
  }

  return (
    <div className="time-wheel-picker">
      {label && <span className="time-wheel-label">{label}</span>}
      <div className="time-wheel-row">
        <Wheel values={HOURS} value={h}     onChange={(v) => set(v, mSnap)} suffix="ч" />
        <Wheel values={MINS}  value={mSnap} onChange={(v) => set(h, v)}     suffix="м" />
      </div>
    </div>
  );
}
