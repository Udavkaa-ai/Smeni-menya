import React, { useState } from 'react';
import { api } from '../api/client.js';
import { useWeekStore } from '../store/useWeekStore.js';

export default function SwapBanner({ swap, onChange }) {
  const setToast = useWeekStore((s) => s.setToast);
  const [busy, setBusy] = useState(false);

  async function respond(action) {
    setBusy(true);
    try {
      const updated = await api.respondSwap(swap.id, action);
      onChange?.(updated);
      setToast(action === 'accept' ? 'Обмен принят' : 'Обмен отклонён');
    } catch {
      setToast('Не получилось');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="banner swap">
      <div>
        <b>{swap.from_user === 'SVETA' ? 'Света' : 'Мария'}</b> предлагает обмен:{' '}
        <b>{swap.from_date}</b> ↔ <b>{swap.to_date}</b>
      </div>
      <div className="actions">
        <button className="btn" disabled={busy} onClick={() => respond('reject')}>Отклонить</button>
        <button className="btn primary" disabled={busy} onClick={() => respond('accept')}>Принять</button>
      </div>
    </div>
  );
}
