import React, { useState } from 'react';
import { api, setSession } from '../api/client.js';

export default function Login({ onLoggedIn }) {
  const [name, setName] = useState('SVETA');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token, name: who } = await api.login(name, password);
      setSession(token, who);
      onLoggedIn?.(who);
    } catch {
      setError('Неверный логин или пароль');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="login-screen" onSubmit={submit}>
      <h1>Сменимся</h1>
      <p>График дежурств для двоих</p>
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
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Введите пароль"
        autoComplete="current-password"
      />
      {error && <div style={{ color: '#b91c1c', fontSize: 14 }}>{error}</div>}
      <button className="btn primary full" disabled={busy} type="submit">
        {busy ? 'Вхожу…' : 'Войти'}
      </button>
    </form>
  );
}
