import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getUser } from '../api/client.js';
import { useWeekStore, addDaysIso } from '../store/useWeekStore.js';
import DayCard from './DayCard.jsx';
import DayModal from './DayModal.jsx';
import SwapModal from './SwapModal.jsx';
import SwapBanner from './SwapBanner.jsx';

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

export default function WeekView({ live }) {
  const weekStart = useWeekStore((s) => s.weekStart);
  const next = useWeekStore((s) => s.next);
  const prev = useWeekStore((s) => s.prev);
  const goToday = useWeekStore((s) => s.goToday);
  const qc = useQueryClient();

  const [openDayId, setOpenDayId] = useState(null);
  const [swapFromDate, setSwapFromDate] = useState(null);
  const [swaps, setSwaps] = useState([]);
  const me = getUser();

  const { data, isLoading } = useQuery({
    queryKey: ['week', weekStart],
    queryFn: () => api.week(weekStart),
  });

  useEffect(() => {
    api.listSwaps().then(setSwaps).catch(() => {});
  }, []);

  useEffect(() => {
    function onEvent(e) {
      const msg = e.detail;
      if (!msg) return;
      if (msg.type === 'DAY_UPDATED') {
        qc.setQueriesData({ queryKey: ['week'] }, (prev) => {
          if (!prev) return prev;
          const inWeek = prev.days.some((d) => d.id === msg.payload.id);
          if (!inWeek) return prev;
          return {
            ...prev,
            days: prev.days.map((d) => (d.id === msg.payload.id ? msg.payload : d)),
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
  const openDay = days.find((d) => d.id === openDayId) || null;
  const todayIso = new Date().toISOString().slice(0, 10);

  const incoming = swaps.find((s) => s.to_user === me && s.status === 'PENDING');
  const outgoing = swaps.find((s) => s.from_user === me && s.status === 'PENDING');

  return (
    <>
      <div className="weeknav">
        <button className="iconbtn" onClick={prev} aria-label="Предыдущая неделя">‹</button>
        <div onClick={goToday} className="range">{rangeLabel(weekStart)}</div>
        <button className="iconbtn" onClick={next} aria-label="Следующая неделя">›</button>
      </div>

      {incoming && (
        <SwapBanner
          swap={incoming}
          mode="incoming"
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
        {isLoading && <div style={{ color: '#6b7280', textAlign: 'center', padding: 20 }}>Загрузка…</div>}
        {days.map((d) => (
          <DayCard
            key={d.id}
            day={d}
            isToday={d.date === todayIso}
            onTap={() => setOpenDayId(d.id)}
            onLongPress={() => setSwapFromDate(d.date)}
          />
        ))}
      </div>

      {openDay && (
        <DayModal
          day={openDay}
          onClose={() => setOpenDayId(null)}
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
