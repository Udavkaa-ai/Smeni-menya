import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getUser } from '../api/client.js';
import { useWeekStore } from '../store/useWeekStore.js';
import DayCard from './DayCard.jsx';
import DayModal from './DayModal.jsx';
import SwapModal from './SwapModal.jsx';
import SwapBanner from './SwapBanner.jsx';
import { todayIso } from '../utils/format.js';

const MONTHS = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];

function rangeLabel(start) {
  const a = new Date(start + 'T00:00:00Z');
  const b = new Date(start + 'T00:00:00Z'); b.setUTCDate(b.getUTCDate() + 6);
  const sameMonth = a.getUTCMonth() === b.getUTCMonth();
  const aMonth = MONTHS[a.getUTCMonth()];
  const bMonth = MONTHS[b.getUTCMonth()];
  return sameMonth
    ? `${a.getUTCDate()}–${b.getUTCDate()} ${aMonth}`
    : `${a.getUTCDate()} ${aMonth} – ${b.getUTCDate()} ${bMonth}`;
}

export default function WeekView() {
  const weekStart = useWeekStore((s) => s.weekStart);
  const next = useWeekStore((s) => s.next);
  const prev = useWeekStore((s) => s.prev);
  const goToday = useWeekStore((s) => s.goToday);
  const qc = useQueryClient();

  const [openDate, setOpenDate] = useState(null);
  const [swapFromDate, setSwapFromDate] = useState(null);
  const [swaps, setSwaps] = useState([]);
  const [showPast, setShowPast] = useState(false);
  // Days that are visually expanded (showing full details) on the card list.
  // Today is always expanded; other days expand on first tap.
  const today = todayIso();
  const [expanded, setExpanded] = useState(() => new Set([today]));
  const me = getUser();

  const { data, isLoading } = useQuery({
    queryKey: ['week', weekStart],
    queryFn: () => api.week(weekStart),
  });

  useEffect(() => {
    api.listSwaps().then(setSwaps).catch(() => {});
  }, []);

  // Reset past-days collapse when navigating between weeks.
  useEffect(() => { setShowPast(false); }, [weekStart]);

  // Apply real-time updates from WebSocket.
  useEffect(() => {
    function onEvent(e) {
      const msg = e.detail;
      if (!msg) return;
      if (msg.type === 'SHIFT_UPSERTED') {
        const shift = msg.payload?.shift;
        if (!shift) return;
        qc.setQueriesData({ queryKey: ['week'] }, (prev) => {
          if (!prev) return prev;
          if (!prev.days.some((d) => d.date === shift.date)) return prev;
          return {
            ...prev,
            days: prev.days.map((d) => {
              if (d.date !== shift.date) return d;
              const others = (d.shifts || []).filter((s) => s.id !== shift.id);
              return { ...d, shifts: [...others, shift] };
            }),
          };
        });
      } else if (msg.type === 'SHIFT_REMOVED') {
        const { id, date } = msg.payload || {};
        qc.setQueriesData({ queryKey: ['week'] }, (prev) => {
          if (!prev) return prev;
          if (!prev.days.some((d) => d.date === date)) return prev;
          return {
            ...prev,
            days: prev.days.map((d) =>
              d.date !== date ? d : { ...d, shifts: (d.shifts || []).filter((s) => s.id !== id) }
            ),
          };
        });
      } else if (msg.type === 'SWAP_CREATED' || msg.type === 'SWAP_UPDATED') {
        api.listSwaps().then(setSwaps).catch(() => {});
        if (msg.type === 'SWAP_UPDATED') {
          qc.invalidateQueries({ queryKey: ['week'] });
        }
      }
    }
    window.addEventListener('sm:event', onEvent);
    return () => window.removeEventListener('sm:event', onEvent);
  }, [qc]);

  // Swipe between weeks
  const scrollRef = useRef(null);
  const touchRef = useRef({ x: 0, y: 0, t: 0, lock: null });
  function onTouchStart(e) {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now(), lock: null };
  }
  function onTouchMove(e) {
    const t = e.touches[0];
    const dx = t.clientX - touchRef.current.x;
    const dy = t.clientY - touchRef.current.y;
    if (touchRef.current.lock == null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      touchRef.current.lock = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
  }
  function onTouchEnd(e) {
    const t = e.changedTouches[0];
    const dx = t.clientX - touchRef.current.x;
    const dt = Date.now() - touchRef.current.t;
    if (touchRef.current.lock === 'x' && Math.abs(dx) > 60 && dt < 600) {
      if (dx < 0) next();
      else prev();
    }
  }

  const days = data?.days || [];

  // First tap on a collapsed day expands it inline; second tap opens the editor.
  // Today is auto-expanded. Long-press always opens swap.
  function handleCardTap(date) {
    if (expanded.has(date)) {
      setOpenDate(date);
    } else {
      setExpanded((s) => new Set([...s, date]));
    }
  }

  const partition = useMemo(() => {
    const past = [];
    const present = [];
    for (const d of days) {
      if (d.date < today) past.push(d);
      else present.push(d);
    }
    return { past, present };
  }, [days, today]);

  const openDay = days.find((d) => d.date === openDate) || null;

  const incoming = swaps.find((s) => s.to_user === me && s.status === 'PENDING');
  const outgoing = swaps.find((s) => s.from_user === me && s.status === 'PENDING');

  return (
    <>
      <div className="weeknav">
        <button className="navbtn" onClick={prev} aria-label="Предыдущая неделя">‹</button>
        <div className="range" onClick={goToday}>
          {rangeLabel(weekStart)}
          <small>нажмите, чтобы вернуться к сегодня</small>
        </div>
        <button className="navbtn" onClick={next} aria-label="Следующая неделя">›</button>
      </div>

      {incoming && (
        <SwapBanner
          swap={incoming}
          onChange={(updated) => {
            setSwaps((s) => s.map((x) => (x.id === updated.id ? updated : x)));
          }}
        />
      )}
      {!incoming && outgoing && (
        <div className="banner swap">
          Ожидаем ответ на обмен: {outgoing.from_date} ↔ {outgoing.to_date}
        </div>
      )}

      <div
        className="scroll"
        ref={scrollRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {isLoading && <div className="loading">Загружаю неделю…</div>}

        {/* Past days collapsed under a single button */}
        {partition.past.length > 0 && (
          <>
            <button
              className={`past-toggle ${showPast ? 'open' : ''}`}
              onClick={() => setShowPast((v) => !v)}
            >
              <span className="past-toggle-icon">{showPast ? '▾' : '▸'}</span>
              <span>Прошедшие дни ({partition.past.length})</span>
            </button>
            {showPast && (
              <div className="past-list">
                {partition.past.map((d) => (
                  <DayCard
                    key={d.date}
                    day={d}
                    isToday={d.date === today}
                    isPast
                    expanded={expanded.has(d.date)}
                    onTap={() => handleCardTap(d.date)}
                    onLongPress={() => setSwapFromDate(d.date)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Today + future */}
        {partition.present.map((d) => (
          <DayCard
            key={d.date}
            day={d}
            isToday={d.date === today}
            expanded={expanded.has(d.date)}
            onTap={() => handleCardTap(d.date)}
            onLongPress={() => setSwapFromDate(d.date)}
          />
        ))}
      </div>

      {openDay && (
        <DayModal
          day={openDay}
          onClose={() => setOpenDate(null)}
        />
      )}
      {swapFromDate && (
        <SwapModal
          fromDate={swapFromDate}
          weekStart={weekStart}
          days={days}
          onClose={() => setSwapFromDate(null)}
        />
      )}
    </>
  );
}
