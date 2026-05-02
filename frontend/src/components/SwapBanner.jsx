import React, { useState } from 'react';
import { api } from '../api/client.js';
import { useWeekStore } from '../store/useWeekStore.js';
import { ruDateShort, NAMES } from '../utils/format.js';

export default function SwapBanner({ swap, onChange }) {
  const setToast = useWeekStore((s) => s.setToast);
  const [busy, setBusy] = useState(false);

  async function respond(action) {
    setBusy(true);
    try {
      const updated = await api.respondSwap(swap.id, action);
      onChange?.(updated);
      const noun = swap.type === 'transfer' ? 'передача' : 'обмен';
      setToast(action === 'accept' ? `${noun} принят${swap.type === 'transfer' ? 'а' : ''}` : `${noun} отклонён${swap.type === 'transfer' ? 'а' : ''}`);
    } catch {
      setToast('Не получилось');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="banner swap">
      {swap.type === 'transfer' ? (
        <div>
          <b>{NAMES[swap.from_user]}</b> предлагает забрать её смену{' '}
          <b>{ruDateShort(swap.from_date)}</b>
        </div>
      ) : (
        <div>
          <b>{NAMES[swap.from_user]}</b> предлагает обмен:{' '}
          <b>{ruDateShort(swap.from_date)}</b> ↔ <b>{ruDateShort(swap.to_date)}</b>
        </div>
      )}
      <div className="actions">
        <button className="btn" disabled={busy} onClick={() => respond('reject')}>Отклонить</button>
        <button className="btn primary" disabled={busy} onClick={() => respond('accept')}>Принять</button>
      </div>
    </div>
  );
}
