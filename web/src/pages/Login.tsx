import { FormEvent, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';

export default function Login() {
  const { login, register } = useAuth();
  // Link de convite (…/?convite=CÓDIGO): já abre em "Criar conta" com o código
  // preenchido, então quem foi convidado só escolhe nome de usuário e senha.
  const [params] = useSearchParams();
  const convite = params.get('convite')?.trim() || '';
  const [mode, setMode] = useState<'login' | 'register'>(convite ? 'register' : 'login');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirma, setConfirma] = useState('');
  const [code, setCode] = useState(convite);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (mode === 'register' && password !== confirma) {
      setError('As senhas não conferem.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') await login(username.trim(), password);
      else await register(name.trim(), username.trim(), password, code.trim());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <aside className="login-context" aria-hidden="true">
        <span>TimeTracker / jornada pessoal</span>
        <h2>Seu trabalho tem ritmo.<br />O registro só acompanha.</h2>
        <p>Jornada, pausas e saldo em um lugar privado, direto e sem ruído.</p>
        <i />
      </aside>
      <div className="login-card">
        <div className="brand">
          <div className="brand-icon" aria-hidden="true">
            <span className="brand-hand brand-hand-hour" />
            <span className="brand-hand brand-hand-minute" />
            <span className="brand-center" />
          </div>
          <div className="brand-kicker">Seu tempo. Seus dados.</div>
          <h1>Time<span>Tracker</span></h1>
          <p className="muted">Um registro de jornada simples, privado e seu.</p>
        </div>

        <div className="segmented">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')} type="button">
            Entrar
          </button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')} type="button">
            Criar conta
          </button>
        </div>

        <form onSubmit={submit} className="form">
          {mode === 'register' && (
            <label>
              Nome
              <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
            </label>
          )}
          <label>
            Usuário
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoCapitalize="none"
              autoComplete="username"
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={mode === 'register' ? 6 : undefined}
            />
          </label>
          {mode === 'register' && (
            <label>
              Confirmar senha
              <input
                type="password"
                value={confirma}
                onChange={(e) => setConfirma(e.target.value)}
                required
                autoComplete="new-password"
              />
            </label>
          )}
          {mode === 'register' && (
            <label>
              Código de convite
              <input value={code} onChange={(e) => setCode(e.target.value)} required />
              <span className="muted small">
                {convite
                  ? 'Veio do seu link de convite — é só criar a conta.'
                  : 'Peça a quem já usa o app, ou use o código de administrador da instância.'}
              </span>
            </label>
          )}

          {error && <div className="error">{error}</div>}

          <button className="btn-primary" disabled={busy} type="submit">
            {busy ? '…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>
      </div>
    </div>
  );
}
