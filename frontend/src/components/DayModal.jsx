import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useWeekStore } from '../store/useWeekStore.js';

const DOW_FULL = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];

const OPTIONS = [
  { value: 'SVETA', label: 'Света', cls: 'sveta' },
  { value: 'MARIA', label: 'Мария', cls: 'maria' },
  { value: 'NONE',  label: 'Никто', cls: 'none' },
];

export default function DayModal({ day, onClose }) {
  const [assigned, setAssigned] = useState(day.assigned_to || '');
  const [startTime, setStartTime] = useState(day.start_time || '09:00');
  const [endTime, setEndTime] = useState(day.end_time || '18:00');
  const [description, setDescription] = useState(day.description || '');
  const [isWork, setIsWork] = useState(!!day.is_work_day);
  const [error, setError] = useState(null);
  const setToast = useWeekStore((s) => s.setToast);
  const qc = useQueryClient();

  const dt = new Date(day.date + 'T00:00:00Z');
  const title = `${DOW_FULL[dt.getUTCDay()]}, ${dt.getUTCDate()}`;

  const save = useMutation({
    mutationFn: () =>
      api.patchDay(day.id, {
        assigned_to: assigned || null,
        start_time: assigned && assigned !== 'NONE' ? startTime : null,
        end_time: assigned && assigned !== 'NONE' ? endTime : null,
        description,
        is_work_day: isWork,
        version: day.version,
      }),
    onSuccess: (updated) => {
      qc.setQueriesData({ queryKey: ['week'] }, (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          days: prev.days.map((d) => (d.id === updated.id ? updated : d)),
        };
      });
      setToast('Сохранено');
      onClose();
    },
    onError: (err) => {
      if (err.status === 409) {
        setError('Кто-то изменил этот день. Обновляю…');
        qc.invalidateQueries({ queryKey: ['week'] });
        setTimeout(onClose, 1500);
      } else {
        setError('Ошибка сохранения');
      }
    },
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>

        <div>
          <span className="label">Кто дежурит</span>
          <div className="radio-group">
            {OPTIONS.map((o) => (
              <label key={o.value} className={`radio-row ${assigned === o.value ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="assigned"
                  checked={assigned === o.value}
                  onChange={() => setAssigned(o.value)}
                />
                <span className={`dot ${o.cls}`} />
                <span>{o.label}</span>
              </label>
            ))}
            <label className={`radio-row ${assigned === '' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="assigned"
                checked={assigned === ''}
                onChange={() => setAssigned('')}
              />
              <span className="dot free" />
              <span>Не выбрано</span>
            </label>
          </div>
        </div>

        {assigned && assigned !== 'NONE' && (
          <div>
            <span className="label">Время</span>
            <div className="time-row">
              <input type="time" value={startTime || ''} onChange={(e) => setStartTime(e.target.value)} />
              <input type="time" value={endTime || ''} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
        )}

        <div>
          <span className="label">Описание (лекарства, прогулка, дела…)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Например: Лекарства в 14:00, прогулка после обеда"
          />
        </div>

        <label className="checkbox-row">
          <input type="checkbox" checked={isWork} onChange={(e) => setIsWork(e.target.checked)} />
          <span>Основная работа</span>
        </label>

        {error && <div style={{ color: '#b91c1c', fontSize: 14 }}>{error}</div>}

        <div className="toolbar">
          <button className="btn" onClick={onClose}>Отмена</button>
          <button className="btn primary" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Сохраняю…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}
