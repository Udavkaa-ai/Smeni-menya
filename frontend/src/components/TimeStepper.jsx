import React from 'react';
import { timeToMin, minToTime } from '../utils/format.js';

// Simple, fat-finger-friendly time picker:
//   [-1ч] [-15] HH:MM [+15] [+1ч]
// Tap-only, no rotating clock. Long-press +/- buttons jumps faster
// (handled in CSS via :active feedback; actual repeat is light enough by tapping).
export default function TimeStepper({ value, onChange, ariaLabel }) {
  const minutes = timeToMin(value);
  const display = minToTime(minutes ?? 0);

  function step(delta) {
    let m = (minutes ?? 0) + delta;
    if (m < 0) m = 0;
    if (m > 24 * 60) m = 24 * 60;
    onChange(minToTime(m));
  }

  return (
    <div className="time-stepper" aria-label={ariaLabel}>
      <button type="button" className="ts-btn big" onClick={() => step(-60)} aria-label="−1 час">−1ч</button>
      <button type="button" className="ts-btn"     onClick={() => step(-15)} aria-label="−15 минут">−15</button>
      <span className="ts-display">{display}</span>
      <button type="button" className="ts-btn"     onClick={() => step(+15)} aria-label="+15 минут">+15</button>
      <button type="button" className="ts-btn big" onClick={() => step(+60)} aria-label="+1 час">+1ч</button>
    </div>
  );
}
