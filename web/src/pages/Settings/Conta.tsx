import { FormEvent, useEffect, useState } from 'react';
import { api, User } from '../../api';
import { useAuth } from '../../auth';
import { SettingsHeader } from './shared';

export default function SettingsConta() {
  return (
    <div className="page">
      <SettingsHeader title="Conta" />
      <ProfileCard />
      <PasswordCard />
    </div>
  );
}

/** Nome de exibição. O nome de usuário é a identidade do login e não muda. */
function ProfileCard() {
  const { user, atualizar } = useAuth();
  const [nome, setNome] = useState(user?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => setNome(user?.name ?? ''), [user?.name]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErro('');
    setMsg('');
    try {
      atualizar(await api.patch<User>('/api/auth/me', { name: nome.trim() }));
      setMsg('Nome atualizado.');
      setTimeout(() => setMsg(''), 1800);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const mudou = nome.trim() !== user?.name && nome.trim().length > 0;

  return (
    <section className="card">
      <h3>Perfil</h3>
      <form onSubmit={salvar} className="form">
        <label>
          Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} required />
        </label>
        <label>
          Nome de usuário
          <input value={user?.username ?? ''} disabled />
          <span className="muted small">É o seu login — não dá para trocar.</span>
        </label>
        {erro && <div className="error">{erro}</div>}
        {msg && <div className="success">{msg}</div>}
        <button className="btn-secondary" type="submit" disabled={busy || !mudou}>
          Salvar nome
        </button>
      </form>
    </section>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      await api.post('/api/auth/password', { current, next });
      setMsg('Senha alterada.');
      setCurrent('');
      setNext('');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className="card">
      <h3>Trocar senha</h3>
      <form onSubmit={submit} className="form">
        <label>
          Senha atual
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </label>
        <label>
          Nova senha
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={6} />
        </label>
        {error && <div className="error">{error}</div>}
        {msg && <div className="success">{msg}</div>}
        <button className="btn-secondary" type="submit">
          Alterar senha
        </button>
      </form>
    </section>
  );
}
