import { useCallback, useEffect, useRef, useState } from 'react';
import { api, Punch, PunchKind, TodayResponse } from '../api';
import { useAuth } from '../auth';
import { fmtClock, fmtHora, fmtMin, fmtSigned, fmtDataLonga, horaNoFuso } from '../util';

type LiveState = 'off' | 'working' | 'onbreak';

/** Recalcula worked/break ao vivo (em segundos) a partir dos punches. */
function liveCompute(punches: Punch[], nowMs: number) {
  const sorted = [...punches].sort((a, b) => a.ts.localeCompare(b.ts));
  let worked = 0;
  let brk = 0;
  let state: LiveState = 'off';
  let last: number | null = null;
  for (const p of sorted) {
    const t = Date.parse(p.ts);
    if (state === 'working' && last != null) worked += t - last;
    if (state === 'onbreak' && last != null) brk += t - last;
    if (p.kind === 'clock_in') state = 'working';
    else if (p.kind === 'clock_out') state = 'off';
    else if (p.kind === 'break_start' && state === 'working') state = 'onbreak';
    else if (p.kind === 'break_end' && state === 'onbreak') state = 'working';
    last = t;
  }
  if (state !== 'off' && last != null && nowMs > last) {
    if (state === 'working') worked += nowMs - last;
    else brk += nowMs - last;
  }
  return { workedSec: worked / 1000, breakSec: brk / 1000, state };
}

const STATUS_LABEL: Record<LiveState, string> = {
  off: 'Fora do expediente',
  working: 'Trabalhando',
  onbreak: 'Em intervalo',
};

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [data, setData] = useState<TodayResponse | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Ponto pendente de confirmação: o popup deixa ajustar a hora antes de gravar.
  const [pending, setPending] = useState<PunchKind | null>(null);
  const [pendingTime, setPendingTime] = useState('');
  const tick = useRef<number>();

  const load = useCallback(async () => {
    try {
      setData(await api.get<TodayResponse>('/api/punches/today'));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    tick.current = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick.current);
  }, []);

  /** Abre a confirmação já com a hora de agora — é só confirmar no caso normal. */
  function ask(kind: PunchKind) {
    if (!data) return;
    setPendingTime(horaNoFuso(new Date().toISOString(), data.timezone));
    setPending(kind);
  }

  async function confirmPunch() {
    if (!pending || !data) return;
    const kind = pending;
    // Hora intocada → grava o instante exato (com segundos); ajustada → date+time.
    const agora = horaNoFuso(new Date().toISOString(), data.timezone);
    const body = pendingTime === agora ? { kind } : { kind, date: data.today.date, time: pendingTime };

    setBusy(true);
    setError('');
    try {
      await api.post('/api/punches', body);
      setPending(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    );
  }

  const punches = data.today.punches;
  const live = liveCompute(punches, now);
  const workedMin = live.workedSec / 60;
  const expected = data.today.expectedMinutes;
  const remaining = Math.max(0, expected - workedMin);
  const dayBalance = workedMin - expected;
  const tol = 0; // saldo do dia exibido "cru"; tolerância aparece no total/relatórios
  void tol;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <div className="hello">Olá, {user?.name.split(' ')[0]}</div>
          <div className="muted small">{fmtDataLonga(data.today.date)}</div>
        </div>
        <button className="link-btn" onClick={() => logout()}>
          Sair
        </button>
      </header>

      <section className={`clock-card state-${live.state}`}>
        <div className="status-pill">{STATUS_LABEL[live.state]}</div>
        <div className="big-clock">{fmtClock(live.workedSec)}</div>
        <div className="clock-caption">tempo trabalhado hoje</div>

        <div className="mini-stats">
          <div>
            <span className="mini-value">{expected > 0 ? fmtMin(remaining) : '—'}</span>
            <span className="mini-label">falta</span>
          </div>
          <div>
            <span className="mini-value">{fmtMin(live.breakSec / 60)}</span>
            <span className="mini-label">intervalo</span>
          </div>
          <div>
            <span className={`mini-value ${dayBalance >= 0 ? 'pos' : 'neg'}`}>
              {expected > 0 || workedMin > 0 ? fmtSigned(dayBalance) : '—'}
            </span>
            <span className="mini-label">saldo dia</span>
          </div>
        </div>
      </section>

      <section className="actions">
        {live.state === 'off' && (
          <button className="btn-big btn-in" disabled={busy} onClick={() => ask('clock_in')}>
            ▶ Registrar entrada
          </button>
        )}
        {live.state === 'working' && (
          <>
            <button className="btn-big btn-break" disabled={busy} onClick={() => ask('break_start')}>
              ☕ Iniciar intervalo
            </button>
            <button className="btn-big btn-out" disabled={busy} onClick={() => ask('clock_out')}>
              ⏹ Registrar saída
            </button>
          </>
        )}
        {live.state === 'onbreak' && (
          <button className="btn-big btn-in" disabled={busy} onClick={() => ask('break_end')}>
            ↩ Voltar do intervalo
          </button>
        )}
      </section>

      {pending && (
        <ConfirmPunch
          kind={pending}
          date={data.today.date}
          time={pendingTime}
          busy={busy}
          onTime={setPendingTime}
          onCancel={() => setPending(null)}
          onConfirm={confirmPunch}
        />
      )}

      {error && <div className="error">{error}</div>}

      <section className="card">
        <div className="card-title-row">
          <h3>Registros de hoje</h3>
          <span className="badge">saldo total {fmtSigned(data.totalBalance)}</span>
        </div>
        {punches.length === 0 ? (
          <p className="muted">Nenhum registro ainda. Bata o ponto para começar.</p>
        ) : (
          <ul className="punch-list">
            {[...punches]
              .sort((a, b) => a.ts.localeCompare(b.ts))
              .map((p) => (
                <PunchRow key={p.id} p={p} onChanged={load} />
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Confirmação do ponto. O horário vem preenchido com agora — confirmar direto é
 * o caminho normal; mexer no campo é o que grava um ponto retroativo do dia.
 */
function ConfirmPunch({
  kind,
  date,
  time,
  busy,
  onTime,
  onCancel,
  onConfirm,
}: {
  kind: PunchKind;
  date: string;
  time: string;
  busy: boolean;
  onTime: (t: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3>{KIND_META[kind].label}</h3>
        <p className="muted small">{fmtDataLonga(date)}</p>
        <input
          type="time"
          className="modal-time"
          value={time}
          onChange={(e) => onTime(e.target.value)}
          disabled={busy}
          aria-label="horário do registro"
        />
        <p className="muted small">Ajuste a hora para registrar um ponto que você esqueceu.</p>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={onConfirm} disabled={busy || !time}>
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

const KIND_META: Record<PunchKind, { label: string; cls: string }> = {
  clock_in: { label: 'Entrada', cls: 'k-in' },
  clock_out: { label: 'Saída', cls: 'k-out' },
  break_start: { label: 'Início intervalo', cls: 'k-break' },
  break_end: { label: 'Fim intervalo', cls: 'k-break' },
};

function PunchRow({ p, onChanged }: { p: Punch; onChanged: () => void }) {
  const meta = KIND_META[p.kind];
  async function del() {
    if (!confirm('Remover este registro?')) return;
    await api.del(`/api/punches/${p.id}`);
    onChanged();
  }
  return (
    <li className="punch-row">
      <span className={`dot ${meta.cls}`} />
      <span className="punch-label">{meta.label}</span>
      <span className="punch-time">{fmtHora(p.ts)}</span>
      <button className="link-btn danger" onClick={del} aria-label="remover">
        ✕
      </button>
    </li>
  );
}
