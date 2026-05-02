import React, { useState } from 'react';
import { api, setSession } from '../api/client.js';

const LAST_USER_KEY = 'sm_last_user';

export default function Login({ onLoggedIn }) {
  const initialName = localStorage.getItem(LAST_USER_KEY) || 'SVETA';
  const [name, setName] = useState(initialName);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token, name: who } = await api.login(name, password);
      localStorage.setItem(LAST_USER_KEY, who);
      setSession(token, who);
      onLoggedIn?.(who);
    } catch (err) {
      if (err.status === 401) {
        setError('Неверный логин или пароль');
      } else if (err.status === 502 || err.status === 504) {
        setError('Сервер не отвечает (' + err.status + '). Возможно, ещё деплоится — попробуй через минуту.');
      } else if (err.message === 'Failed to fetch' || !err.status) {
        setError('Нет связи с сервером. Проверь интернет.');
      } else {
        setError('Ошибка: ' + (err.data?.error || err.message || 'неизвестная'));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="login-screen" onSubmit={submit}>
      <div className="logo">💜</div>
      <h1>Сменимся</h1>
      <p>График дежурств для Светы и Марии</p>
      <div className="login-card">
        <span className="label">Кто вы?</span>
        <div className="radio-group">
          <label className={`radio-row ${name === 'SVETA' ? 'selected' : ''}`}>
            <input type="radio" name="who" checked={name === 'SVETA'} onChange={() => setName('SVETA')} />
            <span className="dot sveta" />
            <span>Света</span>
          </label>
          <label className={`radio-row ${name === 'MARIA' ? 'selected' : ''}`}>
            <input type="radio" name="who" checked={name === 'MARIA'} onChange={() => setName('MARIA')} />
            <span className="dot maria" />
            <span>Мария</span>
          </label>
        </div>
        <span className="label">Пароль</span>
        <div className="password-field">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Введите пароль"
            autoComplete="current-password"
          />
          <button
            type="button"
            className="eye-btn"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
            tabIndex={-1}
          >
            {showPassword ? '🙈' : '👁'}
          </button>
        </div>
        {error && <div style={{ color: '#B91C5B', fontSize: 14, fontWeight: 600 }}>{error}</div>}
        <button className="btn primary full" disabled={busy} type="submit">
          {busy ? 'Вхожу…' : 'Войти'}
        </button>
      </div>
    </form>
  );
}
