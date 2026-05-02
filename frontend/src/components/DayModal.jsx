import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getUser } from '../api/client.js';
import { useWeekStore } from '../store/useWeekStore.js';
import { ruDateLong, NAMES, timeRange } from '../utils/format.js';

export default function DayModal({ day, onClose }) {
  const me = getUser();
  const other = me === 'SVETA' ? 'MARIA' : 'SVETA';
  const setToast = useWeekStore((s) => s.setToast);
  const qc = useQueryClient();

  const myShift = day.shifts.find((s) => s.user_name === me) || null;
  const theirShift = day.shifts.find((s) => s.user_name === other) || null;
  const noneShift = day.shifts.find((s) => s.user_name === 'NONE') || null;

  const [taking, setTaking] = useState(!!myShift);
  const [startTime, setStartTime] = useState(myShift?.start_time || '09:00');
  const [endTime, setEndTime] = useState(myShift?.end_time || '18:00');
  const [description, setDescription] = useState(myShift?.description || '');
  const [isWork, setIsWork] = useState(!!myShift?.is_work_day);
  const [noOne, setNoOne] = useState(!!noneShift);
  const [error, setError] = useState(null);

  const title = ruDateLong(day.date);

  const upsertMine = useMutation({
    mutationFn: () =>
      api.putShift({
        date: day.date,
        user_name: me,
        start_time: startTime,
        end_time: endTime,
        description,
        is_work_day: isWork,
        version: myShift?.version ?? 0,
      }),
  });

  const removeMine = useMutation({
    mutationFn: () =>
      api.deleteShift({
        date: day.date,
        user_name: me,
        version: myShift.version,
      }),
  });

  const upsertNone = useMutation({
    mutationFn: () =>
      api.putShift({
        date: day.date,
        user_name: 'NONE',
        version: noneShift?.version ?? 0,
      }),
  });

  const removeNone = useMutation({
    mutationFn: () =>
      api.deleteShift({
        date: day.date,
        user_name: 'NONE',
        version: noneShift.version,
      }),
  });

  async function save() {
    setError(null);
    try {
      // 1. Sync NONE marker
      if (noOne && !noneShift) await upsertNone.mutateAsync();
      else if (!noOne && noneShift) await removeNone.mutateAsync();

      // 2. Sync my shift
      if (taking) {
        await upsertMine.mutateAsync();
      } else if (myShift) {
        await removeMine.mutateAsync();
      }

      qc.invalidateQueries({ queryKey: ['week'] });
      setToast('Сохранено');
      onClose();
    } catch (err) {
      if (err.status === 409) {
        setError('Кто-то уже изменил эту дату — обновляю…');
        qc.invalidateQueries({ queryKey: ['week'] });
        setTimeout(onClose, 1200);
      } else {
        setError('Не удалось сохранить');
      }
    }
  }

  const busy = upsertMine.isPending || removeMine.isPending || upsertNone.isPending || removeNone.isPending;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>

        {theirShift && (
          <div className={`other-shift ${other === 'SVETA' ? 'sveta' : 'maria'}`}>
            <div className="other-head">
              <span className={`dot ${other === 'SVETA' ? 'sveta' : 'maria'}`} />
              <b>{NAMES[other]}</b> уже записалась
            </div>
            {(theirShift.start_time || theirShift.end_time) && (
              <div className="other-time">{timeRange(theirShift.start_time, theirShift.end_time)}</div>
            )}
            {theirShift.description && <div className="other-desc">{theirShift.description}</div>}
          </div>
        )}

        <label className="checkbox-row big">
          <input
            type="checkbox"
            checked={taking}
            onChange={(e) => setTaking(e.target.checked)}
          />
          <span><b>Я беру этот день</b></span>
        </label>

        {taking && (
          <>
            <div>
              <span className="label">Время</span>
              <div className="time-row">
                <input type="time" value={startTime || ''} onChange={(e) => setStartTime(e.target.value)} />
                <input type="time" value={endTime || ''} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>

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
              <span>Это мой основной рабочий день</span>
            </label>
          </>
        )}

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={noOne}
            onChange={(e) => setNoOne(e.target.checked)}
          />
          <span>Никто из нас не сможет</span>
        </label>

        {error && <div style={{ color: '#B91C5B', fontSize: 14, fontWeight: 600 }}>{error}</div>}

        <div className="toolbar">
          <button className="btn" onClick={onClose}>Отмена</button>
          <button className="btn primary" disabled={busy} onClick={save}>
            {busy ? 'Сохраняю…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}
