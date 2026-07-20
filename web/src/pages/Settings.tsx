import { FormEvent, useEffect, useState } from 'react';
import { api, Settings as TSettings } from '../api';
import { WEEKDAYS_LONG } from '../util';

// ordem de exibição: segunda → domingo
const ORDER = [1, 2, 3, 4, 5, 6, 0];

function HourMinInput({
  minutes,
  onChange,
}: {
  minutes: number;
  onChange: (m: number) => void;
}) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return (
    <div className="hm-input">
      <input
        type="number"
        min={0}
        max={24}
        value={h}
        onChange={(e) => onChange(Math.min(1440, (Number(e.target.value) || 0) * 60 + m))}
      />
      <span>h</span>
      <input
        type="number"
        min={0}
        max={59}
        value={m}
        onChange={(e) => onChange(h * 60 + Math.min(59, Number(e.target.value) || 0))}
      />
      <span>min</span>
    </div>
  );
}

export default function Settings() {
  const [s, setS] = useState<TSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<TSettings>('/api/settings').then(setS).catch((e) => setError((e as Error).message));
  }, []);

  function setDay(wd: number, patch: Partial<{ expected: number; break: number }>) {
    if (!s) return;
    const cur = s.schedule[wd] || s.schedule[String(wd)] || { expected: 0, break: 0 };
    setS({ ...s, schedule: { ...s.schedule, [wd]: { ...cur, ...patch } } });
  }

  async function save() {
    if (!s) return;
    setError('');
    try {
      const saved = await api.put<TSettings>('/api/settings', s);
      setS(saved);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!s) {
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <h2>Configurações</h2>
      </header>

      <section className="card">
        <h3>Jornada por dia da semana</h3>
        <p className="muted small">Horas previstas de trabalho (já sem o intervalo).</p>
        <div className="schedule-grid">
          {ORDER.map((wd) => {
            const day = s.schedule[wd] || s.schedule[String(wd)] || { expected: 0, break: 0 };
            return (
              <div key={wd} className="sched-row">
                <span className="sched-name">{WEEKDAYS_LONG[wd]}</span>
                <HourMinInput minutes={day.expected} onChange={(m) => setDay(wd, { expected: m })} />
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h3>Tolerância</h3>
        <p className="muted small">Diferenças menores que isso não contam no saldo do dia.</p>
        <div className="inline-field">
          <input
            type="number"
            min={0}
            max={240}
            value={s.tolerance_minutes}
            onChange={(e) => setS({ ...s, tolerance_minutes: Number(e.target.value) || 0 })}
          />
          <span>minutos</span>
        </div>
      </section>

      <section className="card">
        <h3>Preferências</h3>
        <label className="field">
          Fuso horário
          <input value={s.timezone} onChange={(e) => setS({ ...s, timezone: e.target.value })} />
        </label>
        <label className="field">
          Início da semana
          <select
            value={s.week_start}
            onChange={(e) => setS({ ...s, week_start: Number(e.target.value) as 0 | 1 })}
          >
            <option value={1}>Segunda-feira</option>
            <option value={0}>Domingo</option>
          </select>
        </label>
      </section>

      {error && <div className="error">{error}</div>}
      <button className="btn-primary" onClick={save}>
        {saved ? '✓ Salvo' : 'Salvar configurações'}
      </button>

      <PasswordCard />
    </div>
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
