import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, getUser } from '../api/client.js';
import { useWeekStore } from '../store/useWeekStore.js';
import { ruDateLong, NAMES, timeRange } from '../utils/format.js';

// Each editable item has either { id, version, ... } (existing) or { _new: true, ... } (new).
function defaultDraft() {
  return {
    _new: true,
    _localId: Math.random().toString(36).slice(2),
    start_time: '09:00',
    end_time: '18:00',
    description: '',
    is_work_day: false,
  };
}

export default function DayModal({ day, onClose }) {
  const me = getUser();
  const other = me === 'SVETA' ? 'MARIA' : 'SVETA';
  const setToast = useWeekStore((s) => s.setToast);
  const qc = useQueryClient();

  const initialMine = (day.shifts || [])
    .filter((s) => s.user_name === me)
    .map((s) => ({ ...s }));
  const theirShifts = (day.shifts || []).filter((s) => s.user_name === other);
  const noneShift   = (day.shifts || []).find((s) => s.user_name === 'NONE');

  const [mine, setMine] = useState(initialMine);
  const [removed, setRemoved] = useState([]); // ids of existing shifts user removed
  const [noOne, setNoOne] = useState(!!noneShift);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const title = ruDateLong(day.date);

  function updateOne(idx, patch) {
    setMine((arr) => arr.map((s, i) => (i === idx ? { ...s, ...patch, _dirty: !s._new } : s)));
  }
  function removeOne(idx) {
    setMine((arr) => {
      const item = arr[idx];
      if (item.id) setRemoved((r) => [...r, { id: item.id, version: item.version }]);
      return arr.filter((_, i) => i !== idx);
    });
  }
  function addOne() {
    setMine((arr) => [...arr, defaultDraft()]);
  }

  async function save() {
    setBusy(true);
    setError(null);
    // Build all operations and fire them in parallel — they're independent.
    const ops = [];
    for (const r of removed) ops.push(api.deleteShift(r.id, r.version));
    for (const s of mine) {
      if (s._new) {
        ops.push(api.postShift({
          date: day.date,
          user_name: me,
          start_time: s.start_time,
          end_time: s.end_time,
          description: s.description,
          is_work_day: s.is_work_day,
        }));
      } else if (s._dirty) {
        ops.push(api.patchShift(s.id, {
          start_time: s.start_time,
          end_time: s.end_time,
          description: s.description,
          is_work_day: s.is_work_day,
          version: s.version,
        }));
      }
    }
    if (noOne && !noneShift) {
      ops.push(api.postShift({ date: day.date, user_name: 'NONE' }));
    } else if (!noOne && noneShift) {
      ops.push(api.deleteShift(noneShift.id, noneShift.version));
    }

    if (ops.length === 0) {
      setBusy(false);
      onClose();
      return;
    }

    try {
      await Promise.all(ops);
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
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>

        {theirShifts.length > 0 && (
          <div>
            <span className="label">Смены {NAMES[other]}</span>
            {theirShifts.map((s) => (
              <div key={s.id} className={`other-shift ${other === 'SVETA' ? 'sveta' : 'maria'}`}>
                <div className="other-head">
                  <span className={`dot ${other === 'SVETA' ? 'sveta' : 'maria'}`} />
                  <b>{NAMES[other]}</b>
                  {(s.start_time || s.end_time) && (
                    <span className="other-time">{timeRange(s.start_time, s.end_time)}</span>
                  )}
                </div>
                {s.description && <div className="other-desc">{s.description}</div>}
              </div>
            ))}
          </div>
        )}

        <div>
          <span className="label">Мои смены</span>
          {mine.length === 0 && (
            <div className="empty-mine">Вы пока не записаны на этот день</div>
          )}
          {mine.map((s, idx) => (
            <div key={s.id || s._localId} className="my-shift">
              <div className="my-shift-head">
                <span className={`dot ${me === 'SVETA' ? 'sveta' : 'maria'}`} />
                <b>{NAMES[me]}</b>
                <button
                  type="button"
                  className="x-btn"
                  onClick={() => removeOne(idx)}
                  aria-label="Удалить смену"
                >×</button>
              </div>
              <div className="time-row">
                <input
                  type="time"
                  value={s.start_time || ''}
                  onChange={(e) => updateOne(idx, { start_time: e.target.value })}
                />
                <input
                  type="time"
                  value={s.end_time || ''}
                  onChange={(e) => updateOne(idx, { end_time: e.target.value })}
                />
              </div>
              <textarea
                value={s.description || ''}
                onChange={(e) => updateOne(idx, { description: e.target.value })}
                placeholder="Описание (лекарства, прогулка…)"
              />
              <label className="checkbox-row compact">
                <input
                  type="checkbox"
                  checked={!!s.is_work_day}
                  onChange={(e) => updateOne(idx, { is_work_day: e.target.checked })}
                />
                <span>Это мой основной рабочий день</span>
              </label>
            </div>
          ))}
          <button type="button" className="btn ghost full add-shift" onClick={addOne}>
            + Добавить смену
          </button>
        </div>

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
