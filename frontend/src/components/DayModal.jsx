import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, getUser } from '../api/client.js';
import { useWeekStore } from '../store/useWeekStore.js';
import {
  ruDateLong, NAMES, timeRange,
  computeDayCoverage, intervalLabel, minToTime,
  findIntraUserConflicts, timesOverlap,
} from '../utils/format.js';
import TimeStepper from './TimeStepper.jsx';

function newDraft(kind = 'duty', start = '09:00', end = '18:00') {
  return {
    _new: true,
    _localId: Math.random().toString(36).slice(2),
    kind,
    start_time: start,
    end_time: end,
    description: '',
    is_work_day: false,
  };
}

export default function DayModal({ day, onClose }) {
  const me = getUser();
  const other = me === 'SVETA' ? 'MARIA' : 'SVETA';
  const setToast = useWeekStore((s) => s.setToast);
  const qc = useQueryClient();

  const isDutyKind = (s) => s.kind !== 'work' && s.kind !== 'other';

  const initialMineDuty = (day.shifts || [])
    .filter((s) => s.user_name === me && isDutyKind(s))
    .map((s) => ({ ...s, kind: 'duty' }));
  const initialMineWork = (day.shifts || [])
    .filter((s) => s.user_name === me && s.kind === 'work')
    .map((s) => ({ ...s }));
  const initialMineOther = (day.shifts || [])
    .filter((s) => s.user_name === me && s.kind === 'other')
    .map((s) => ({ ...s }));

  const theirShifts = (day.shifts || []).filter((s) => s.user_name === other);
  const theirDuty  = theirShifts.filter((s) => isDutyKind(s));
  const theirWork  = theirShifts.filter((s) => s.kind === 'work');
  const theirOther = theirShifts.filter((s) => s.kind === 'other');
  const noneShift = (day.shifts || []).find((s) => s.user_name === 'NONE');

  const [duty, setDuty] = useState(initialMineDuty);
  const [work, setWork] = useState(initialMineWork);
  const [otherList, setOtherList] = useState(initialMineOther);
  const [removed, setRemoved] = useState([]);
  const [noOne, setNoOne] = useState(!!noneShift);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [transferringId, setTransferringId] = useState(null);

  const title = ruDateLong(day.date);

  // Recompute coverage in realtime as user edits — for the gaps list shown in the modal.
  const previewShifts = [
    ...theirShifts,
    ...duty.map((s) => ({ ...s, user_name: me, kind: 'duty' })),
    ...work.map((s) => ({ ...s, user_name: me, kind: 'work' })),
    ...otherList.map((s) => ({ ...s, user_name: me, kind: 'other' })),
    ...(noOne ? [{ user_name: 'NONE' }] : []),
  ];
  const { free, blocked, suggestSveta, suggestMaria } = computeDayCoverage(previewShifts);
  const mySuggest = me === 'SVETA' ? suggestSveta : suggestMaria;
  const otherSuggest = me === 'SVETA' ? suggestMaria : suggestSveta;
  const selfConflicts = findIntraUserConflicts(previewShifts).filter((c) => c.user_name === me);

  function patchAt(setter) {
    return (idx, patch) =>
      setter((arr) => arr.map((s, i) => (i === idx ? { ...s, ...patch, _dirty: !s._new } : s)));
  }
  function removeAt(setter) {
    return (idx) =>
      setter((arr) => {
        const item = arr[idx];
        if (item.id) setRemoved((r) => [...r, { id: item.id, version: item.version }]);
        return arr.filter((_, i) => i !== idx);
      });
  }

  const updDuty  = patchAt(setDuty);
  const updWork  = patchAt(setWork);
  const updOther = patchAt(setOtherList);
  const rmDuty   = removeAt(setDuty);
  const rmWork   = removeAt(setWork);
  const rmOther  = removeAt(setOtherList);

  function takeFreeGap(gap) {
    setDuty((arr) => [
      ...arr,
      newDraft('duty', minToTime(gap.start), minToTime(gap.end)),
    ]);
  }

  async function transfer(shiftId) {
    if (!window.confirm(`Предложить ${NAMES[other]} взять эту смену?`)) return;
    try {
      setTransferringId(shiftId);
      await api.transferShift(shiftId);
      setToast(`${NAMES[other]} получит запрос на передачу`);
      onClose();
    } catch {
      setToast('Не удалось отправить');
    } finally {
      setTransferringId(null);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    const ops = [];

    for (const r of removed) ops.push(api.deleteShift(r.id, r.version));

    for (const s of duty) {
      if (s._new) {
        ops.push(api.postShift({
          date: day.date, user_name: me, kind: 'duty',
          start_time: s.start_time, end_time: s.end_time,
          description: s.description, is_work_day: !!s.is_work_day,
        }));
      } else if (s._dirty) {
        ops.push(api.patchShift(s.id, {
          start_time: s.start_time, end_time: s.end_time,
          description: s.description, is_work_day: !!s.is_work_day,
          kind: 'duty', version: s.version,
        }));
      }
    }
    for (const s of work) {
      if (s._new) {
        ops.push(api.postShift({
          date: day.date, user_name: me, kind: 'work',
          start_time: s.start_time, end_time: s.end_time,
          description: '', is_work_day: true,
        }));
      } else if (s._dirty) {
        ops.push(api.patchShift(s.id, {
          start_time: s.start_time, end_time: s.end_time,
          description: '', is_work_day: true,
          kind: 'work', version: s.version,
        }));
      }
    }
    for (const s of otherList) {
      if (s._new) {
        ops.push(api.postShift({
          date: day.date, user_name: me, kind: 'other',
          start_time: s.start_time, end_time: s.end_time,
          description: '', is_work_day: false,
        }));
      } else if (s._dirty) {
        ops.push(api.patchShift(s.id, {
          start_time: s.start_time, end_time: s.end_time,
          description: '', is_work_day: false,
          kind: 'other', version: s.version,
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

  const myCls = me === 'SVETA' ? 'sveta' : 'maria';
  const otherCls = other === 'SVETA' ? 'sveta' : 'maria';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>

        {(theirDuty.length > 0 || theirWork.length > 0) && (
          <div>
            <span className="label">У {NAMES[other]}</span>
            {theirDuty.map((s) => (
              <div key={s.id} className={`other-shift ${otherCls}`}>
                <div className="other-head">
                  <span className={`dot ${otherCls}`} />
                  <b>дежурит</b>
                  {(s.start_time || s.end_time) && (
                    <span className="other-time">{timeRange(s.start_time, s.end_time)}</span>
                  )}
                </div>
                {s.description && <div className="other-desc">{s.description}</div>}
              </div>
            ))}
            {theirWork.map((s) => (
              <div key={s.id} className={`other-shift work ${otherCls}`}>
                <div className="other-head">
                  <span className={`dot ${otherCls}`} />
                  <b>основная работа</b>
                  {(s.start_time || s.end_time) && (
                    <span className="other-time">{timeRange(s.start_time, s.end_time)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Auto-detected free gaps with one-click take */}
        {free.length > 0 && !noOne && (
          <div>
            <span className="label">Свободное время</span>
            {free.map((g, i) => (
              <button
                key={i}
                type="button"
                className="free-gap-btn"
                onClick={() => takeFreeGap(g)}
              >
                <span>Свободно {intervalLabel(g)}</span>
                <span className="take-pill">+ беру</span>
              </button>
            ))}
          </div>
        )}

        {blocked.length > 0 && !noOne && (
          <div>
            <span className="label">Никто не сможет (основная работа у обеих)</span>
            {blocked.map((b, i) => (
              <div key={i} className="auto-blocked-row">
                <span className="dot none" />
                <span className="time-pill">{intervalLabel(b)}</span>
              </div>
            ))}
          </div>
        )}

        <div>
          <span className="label">Мои дежурства</span>
          {duty.length === 0 && (
            <div className="empty-mine">Вы пока не записаны на этот день</div>
          )}
          {duty.map((s, idx) => (
            <div key={s.id || s._localId} className={`my-shift ${myCls}`}>
              <div className="my-shift-head">
                <span className={`dot ${myCls}`} />
                <b>дежурство</b>
                {!s._new && (
                  <button
                    type="button"
                    className="transfer-btn"
                    title={`Предложить ${NAMES[other]}`}
                    disabled={transferringId === s.id}
                    onClick={() => transfer(s.id)}
                  >
                    → {NAMES[other]}
                  </button>
                )}
                <button
                  type="button"
                  className="x-btn"
                  onClick={() => rmDuty(idx)}
                  aria-label="Удалить смену"
                >×</button>
              </div>
              <div className="time-row stack">
                <TimeStepper value={s.start_time || ''} onChange={(v) => updDuty(idx, { start_time: v })} ariaLabel="начало" />
                <TimeStepper value={s.end_time || ''}   onChange={(v) => updDuty(idx, { end_time: v })}   ariaLabel="конец" />
              </div>
              <textarea
                value={s.description || ''}
                onChange={(e) => updDuty(idx, { description: e.target.value })}
                placeholder="Описание (лекарства, прогулка…)"
              />
            </div>
          ))}
          <button
            type="button"
            className="btn ghost full add-shift"
            onClick={() => setDuty((a) => [...a, newDraft('duty')])}
          >
            + Добавить дежурство
          </button>
        </div>

        <div>
          <span className="label">Моя основная работа</span>
          {work.length === 0 && (
            <div className="empty-mine">Не отмечена</div>
          )}
          {work.map((s, idx) => (
            <div key={s.id || s._localId} className={`my-shift work ${myCls}`}>
              <div className="my-shift-head">
                <span className={`dot ${myCls}`} />
                <b>основная работа</b>
                <button
                  type="button"
                  className="x-btn"
                  onClick={() => rmWork(idx)}
                  aria-label="Удалить"
                >×</button>
              </div>
              <div className="time-row stack">
                <TimeStepper value={s.start_time || ''} onChange={(v) => updWork(idx, { start_time: v })} ariaLabel="начало" />
                <TimeStepper value={s.end_time || ''}   onChange={(v) => updWork(idx, { end_time: v })}   ariaLabel="конец" />
              </div>
            </div>
          ))}
          <button
            type="button"
            className="btn ghost full add-shift"
            onClick={() => setWork((a) => [...a, newDraft('work', '09:00', '18:00')])}
          >
            + Добавить «основная работа»
          </button>
        </div>

        <div>
          <span className="label">Моё другое (личные дела)</span>
          {otherList.length === 0 && (
            <div className="empty-mine">Не отмечено</div>
          )}
          {otherList.map((s, idx) => (
            <div key={s.id || s._localId} className={`my-shift busy ${myCls}`}>
              <div className="my-shift-head">
                <span className={`dot ${myCls}`} />
                <b>другое</b>
                <button
                  type="button"
                  className="x-btn"
                  onClick={() => rmOther(idx)}
                  aria-label="Удалить"
                >×</button>
              </div>
              <div className="time-row stack">
                <TimeStepper value={s.start_time || ''} onChange={(v) => updOther(idx, { start_time: v })} ariaLabel="начало" />
                <TimeStepper value={s.end_time || ''}   onChange={(v) => updOther(idx, { end_time: v })}   ariaLabel="конец" />
              </div>
            </div>
          ))}
          <button
            type="button"
            className="btn ghost full add-shift"
            onClick={() => setOtherList((a) => [...a, newDraft('other', '09:00', '18:00')])}
          >
            + Добавить «другое»
          </button>
        </div>

        {selfConflicts.length > 0 && (
          <div className="self-conflict-warning">
            ⚠ У вас одновременно дежурство и занятость:
            {selfConflicts.map((c, i) => (
              <div key={i}>
                · {c.duty.start_time}–{c.duty.end_time} (дежурство) ↔ {c.busy.start_time}–{c.busy.end_time} (
                  {c.busy.kind === 'work' ? 'работа' : 'другое'})
              </div>
            ))}
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
              Уберите одно из них — нельзя быть в двух местах одновременно.
            </div>
          </div>
        )}

        {otherSuggest.length > 0 && (
          <div>
            <span className="label">{NAMES[other]} занята — кто-то должен взять</span>
            {otherSuggest.map((g, i) => (
              <button
                key={i}
                type="button"
                className="free-gap-btn suggest"
                onClick={() => setDuty((a) => [...a, newDraft('duty', minToTime(g.start), minToTime(g.end))])}
              >
                <span>{intervalLabel(g)} — {NAMES[other]} занята</span>
                <span className="take-pill">+ беру</span>
              </button>
            ))}
          </div>
        )}
        {mySuggest.length > 0 && (
          <div>
            <span className="label">Я занята — {NAMES[other]} могла бы взять</span>
            {mySuggest.map((g, i) => (
              <div key={i} className="auto-blocked-row">
                <span className={`dot ${other === 'SVETA' ? 'sveta' : 'maria'}`} />
                <span>Свободно для {NAMES[other]}</span>
                <span className="time-pill">{intervalLabel(g)}</span>
              </div>
            ))}
          </div>
        )}

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={noOne}
            onChange={(e) => setNoOne(e.target.checked)}
          />
          <span>Никто из нас не сможет (весь день)</span>
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
