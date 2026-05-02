import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, getUser } from '../api/client.js';
import { useWeekStore } from '../store/useWeekStore.js';
import { ruDateLong, NAMES, timeRange } from '../utils/format.js';
import TimeWheelPicker from './TimeWheelPicker.jsx';

const isBusyKind = (s) => s.kind === 'work' || s.kind === 'other';

function newDraft(start = '09:00', end = '18:00') {
  return {
    _new: true,
    _localId: Math.random().toString(36).slice(2),
    kind: 'other',
    start_time: start,
    end_time: end,
    description: '',
  };
}

export default function DayModal({ day, onClose }) {
  const me = getUser();
  const other = me === 'SVETA' ? 'MARIA' : 'SVETA';
  const myCls = me === 'SVETA' ? 'sveta' : 'maria';
  const otherCls = other === 'SVETA' ? 'sveta' : 'maria';
  const setToast = useWeekStore((s) => s.setToast);
  const qc = useQueryClient();

  const initialMine = (day.shifts || [])
    .filter((s) => s.user_name === me && isBusyKind(s))
    .map((s) => ({ ...s }));
  const theirBusy = (day.shifts || []).filter((s) => s.user_name === other && isBusyKind(s));
  const noneShift = (day.shifts || []).find((s) => s.user_name === 'NONE');

  const [busy, setBusy] = useState(initialMine);
  const [removed, setRemoved] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const title = ruDateLong(day.date);

  function update(idx, patch) {
    setBusy((arr) => arr.map((s, i) => (i === idx ? { ...s, ...patch, _dirty: !s._new } : s)));
  }
  function remove(idx) {
    setBusy((arr) => {
      const item = arr[idx];
      if (item.id) setRemoved((r) => [...r, { id: item.id, version: item.version }]);
      return arr.filter((_, i) => i !== idx);
    });
  }
  function add() {
    setBusy((arr) => [...arr, newDraft()]);
  }

  async function clearDay() {
    if (!window.confirm('Удалить все мои записи и снять «никто весь день»?')) return;
    setSaving(true);
    setError(null);
    const ops = [];
    for (const s of busy) {
      if (s.id) ops.push(api.deleteShift(s.id, s.version).catch(() => {}));
    }
    if (noneShift) ops.push(api.deleteShift(noneShift.id, noneShift.version).catch(() => {}));
    try {
      await Promise.all(ops);
      qc.invalidateQueries({ queryKey: ['week'] });
      setToast('День очищен');
      onClose();
    } catch {
      setError('Не получилось очистить');
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    const ops = [];
    for (const r of removed) ops.push(api.deleteShift(r.id, r.version));
    for (const s of busy) {
      if (s._new) {
        ops.push(api.postShift({
          date: day.date, user_name: me, kind: 'other',
          start_time: s.start_time, end_time: s.end_time,
          description: s.description, is_work_day: false,
        }));
      } else if (s._dirty) {
        ops.push(api.patchShift(s.id, {
          start_time: s.start_time, end_time: s.end_time,
          description: s.description, is_work_day: false,
          kind: 'other', version: s.version,
        }));
      }
    }
    // Если в БД лежит legacy NONE-маркер — снимаем его при сохранении,
    // чтобы экраны не залипали в «весь день никто не сможет».
    if (noneShift) ops.push(api.deleteShift(noneShift.id, noneShift.version).catch(() => {}));

    if (ops.length === 0) {
      setSaving(false);
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
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>

        {theirBusy.length > 0 && (
          <div>
            <span className="label">{NAMES[other]} занята</span>
            {theirBusy.map((s) => (
              <div key={s.id} className={`busy-card ${otherCls}`}>
                <div className="busy-head">
                  <span className={`dot ${otherCls}`} />
                  <b>{NAMES[other]}</b>
                  {(s.start_time || s.end_time) && (
                    <span className="busy-time">{timeRange(s.start_time, s.end_time)}</span>
                  )}
                </div>
                {s.description && <div className="busy-desc">{s.description}</div>}
              </div>
            ))}
          </div>
        )}

        <div>
          <span className="label">Моя занятость</span>
          {busy.length === 0 && (
            <div className="empty-mine">Не отмечено — значит я с мамой</div>
          )}
          {busy.map((s, idx) => (
            <div key={s.id || s._localId} className={`busy-card editable ${myCls}`}>
              <div className="busy-head">
                <span className={`dot ${myCls}`} />
                <b>{NAMES[me]}</b>
                <button
                  type="button"
                  className="x-btn"
                  onClick={() => remove(idx)}
                  aria-label="Удалить"
                >×</button>
              </div>
              <div className="time-pair">
                <TimeWheelPicker
                  value={s.start_time || '09:00'}
                  onChange={(v) => update(idx, { start_time: v })}
                  label="С"
                />
                <TimeWheelPicker
                  value={s.end_time || '18:00'}
                  onChange={(v) => update(idx, { end_time: v })}
                  label="До"
                />
              </div>
              <textarea
                value={s.description || ''}
                onChange={(e) => update(idx, { description: e.target.value })}
                placeholder="Что за занятость? (работа, прогулка, дела…)"
              />
            </div>
          ))}
          <button
            type="button"
            className="btn ghost full add-shift"
            onClick={add}
          >
            + Добавить занятость
          </button>
        </div>

        {(busy.length > 0 || noneShift) && (
          <button type="button" className="btn danger full" disabled={saving} onClick={clearDay}>
            Очистить весь день
          </button>
        )}

        {error && <div style={{ color: '#B91C5B', fontSize: 14, fontWeight: 600 }}>{error}</div>}

        <div className="toolbar">
          <button className="btn" onClick={onClose}>Отмена</button>
          <button className="btn primary" disabled={saving} onClick={save}>
            {saving ? 'Сохраняю…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}
