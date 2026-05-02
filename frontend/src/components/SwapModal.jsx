import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useWeekStore } from '../store/useWeekStore.js';

const DOW = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];

export default function SwapModal({ fromDate, days, onClose }) {
  const others = days.filter((d) => d.date !== fromDate);
  const [toDate, setToDate] = useState(others[0]?.date || null);
  const setToast = useWeekStore((s) => s.setToast);
  const [error, setError] = useState(null);

  const create = useMutation({
    mutationFn: () => api.createSwap(fromDate, toDate),
    onSuccess: () => {
      setToast('Запрос на обмен отправлен');
      onClose();
    },
    onError: () => setError('Не удалось отправить запрос'),
  });

  const fromDt = new Date(fromDate + 'T00:00:00Z');

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Обмен сменами</h2>
        <div style={{ fontSize: 14, color: '#6b7280' }}>
          Ваш день: <b>{DOW[fromDt.getUTCDay()]}, {fromDt.getUTCDate()}</b>
        </div>
        <span className="label">Выбрать день для обмена</span>
        <div className="radio-group">
          {others.map((d) => {
            const dt = new Date(d.date + 'T00:00:00Z');
            return (
              <label key={d.id} className={`radio-row ${toDate === d.date ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="swap-to"
                  checked={toDate === d.date}
                  onChange={() => setToDate(d.date)}
                />
                <span>{DOW[dt.getUTCDay()]}, {dt.getUTCDate()} — {d.assigned_to ? d.assigned_to : 'свободно'}</span>
              </label>
            );
          })}
        </div>

        {error && <div style={{ color: '#b91c1c', fontSize: 14 }}>{error}</div>}

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
