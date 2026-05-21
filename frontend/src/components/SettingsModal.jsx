import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api/client.js';
import useBackButtonClose from '../utils/useBackButtonClose.js';

export default function SettingsModal({ onClose }) {
  useBackButtonClose(onClose);
  const [enabled, setEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getSettings()
      .then((s) => { setEnabled(!!s.notifications_enabled); setLoaded(true); })
      .catch(() => { setLoaded(true); });
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.setSettings({ notifications_enabled: enabled });
      onClose();
    } catch {
      setError('Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Настройки</h2>

        {!loaded && <div className="empty-mine">Загружаю…</div>}

        {loaded && (
          <label className="settings-row">
            <div>
              <div className="settings-title">Уведомления</div>
              <div className="settings-hint">
                Сообщать о делах сестры и конфликтах в браузере и в колокольчике.
              </div>
            </div>
            <span
              className={`toggle ${enabled ? 'on' : 'off'}`}
              role="switch"
              aria-checked={enabled}
              onClick={() => setEnabled((v) => !v)}
            >
              <span className="toggle-knob" />
            </span>
          </label>
        )}

        {error && <div style={{ color: '#B91C5B', fontSize: 14, fontWeight: 600 }}>{error}</div>}

        <div className="toolbar">
          <button className="btn" onClick={onClose}>Отмена</button>
          <button className="btn primary" disabled={saving || !loaded} onClick={save}>
            {saving ? 'Сохраняю…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
