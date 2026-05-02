import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, getUser } from '../api/client.js';
import { useWeekStore } from '../store/useWeekStore.js';
import { ruDateShort, NAMES } from '../utils/format.js';

export default function SwapModal({ fromDate, days, onClose }) {
  const me = getUser();
  const other = me === 'SVETA' ? 'MARIA' : 'SVETA';
  const setToast = useWeekStore((s) => s.setToast);

  const myShiftOnFrom = (days.find((d) => d.date === fromDate)?.shifts || [])
    .find((s) => s.user_name === me);

  // Candidate days: any other day where the other user has a shift.
  const candidates = days.filter(
    (d) => d.date !== fromDate && (d.shifts || []).some((s) => s.user_name === other)
  );
  const [toDate, setToDate] = useState(candidates[0]?.date || null);
  const [error, setError] = useState(null);

  const create = useMutation({
    mutationFn: () => api.createSwap(fromDate, toDate),
    onSuccess: () => {
      setToast('Запрос на обмен отправлен');
      onClose();
    },
    onError: (err) => {
      if (err.data?.error === 'no_shift_to_swap') setError('У вас нет смены на этот день');
      else setError('Не удалось отправить запрос');
    },
  });

  if (!myShiftOnFrom) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h2>Обмен сменами</h2>
          <p>У вас нет смены на <b>{ruDateShort(fromDate)}</b>. Сначала отметьте, что берёте этот день.</p>
          <button className="btn primary full" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Обмен сменами</h2>
        <div style={{ fontSize: 14, color: 'var(--muted)' }}>
          Ваша смена: <b>{ruDateShort(fromDate)}</b>
        </div>

        <span className="label">На какую смену {NAMES[other]} меняемся?</span>

        {candidates.length === 0 ? (
          <div className="banner">У {NAMES[other]} нет смен на этой неделе. Перелистните неделю.</div>
        ) : (
          <div className="radio-group">
            {candidates.map((d) => {
              const theirs = d.shifts.find((s) => s.user_name === other);
              const tr = theirs.start_time && theirs.end_time
                ? `${theirs.start_time}–${theirs.end_time}` : '';
              return (
                <label key={d.date} className={`radio-row ${toDate === d.date ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="swap-to"
                    checked={toDate === d.date}
                    onChange={() => setToDate(d.date)}
                  />
                  <span>{ruDateShort(d.date)}{tr ? ` · ${tr}` : ''}</span>
                </label>
              );
            })}
          </div>
        )}

        {error && <div style={{ color: '#B91C5B', fontSize: 14, fontWeight: 600 }}>{error}</div>}

        <div className="toolbar">
          <button className="btn" onClick={onClose}>Отмена</button>
          <button
            className="btn primary"
            disabled={!toDate || create.isPending}
            onClick={() => create.mutate()}
          >
            Отправить
          </button>
        </div>
      </div>
    </div>
  );
}
