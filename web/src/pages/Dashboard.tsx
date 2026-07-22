import { useCallback, useEffect, useRef, useState } from 'react';
import { api, Punch, PunchKind, TodayResponse } from '../api';
import { useAuth } from '../auth';
import {
  cacheToday,
  descartar,
  enfileirar,
  enviarFila,
  getCachedToday,
  getFila,
  isNetworkError,
  juntarPendentes,
  startSync,
  subscribe,
  subscribeOnline,
} from '../offline';
import { fmtClock, fmtHora, fmtMin, fmtSigned, fmtDataLonga, horaNoFuso, isoFromLocal } from '../util';

type LiveState = 'off' | 'working';

/**
 * Recalcula worked/break ao vivo (em segundos). Mesma regra do servidor: os
 * pontos alternam entrada/saída, trabalhado é a soma dos pares e intervalo é o
 * buraco entre uma saída e a entrada seguinte.
 */
function liveCompute(punches: Punch[], nowMs: number) {
  const sorted = [...punches].sort((a, b) => a.ts.localeCompare(b.ts));
  let worked = 0;
  let brk = 0;
  for (let i = 0; i < sorted.length; i += 2) {
    const entrada = Date.parse(sorted[i].ts);
    const saidaPunch = sorted[i + 1];
    const saida = saidaPunch ? Date.parse(saidaPunch.ts) : nowMs;
    if (saida > entrada) worked += saida - entrada;

    const proximaEntrada = sorted[i + 2];
    if (saidaPunch && proximaEntrada) {
      const gap = Date.parse(proximaEntrada.ts) - saida;
      if (gap > 0) brk += gap;
    }
  }
  const state: LiveState = sorted.length % 2 === 1 ? 'working' : 'off';
  return { workedSec: worked / 1000, breakSec: brk / 1000, state };
}

const STATUS_LABEL: Record<LiveState, string> = {
  off: 'Fora do expediente',
  working: 'Trabalhando',
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
  // Sem servidor: os números da tela vêm do último retrato + fila local.
  const [semRede, setSemRede] = useState(false);
  const [fila, setFila] = useState(() => getFila(user?.id));
  const tick = useRef<number>();

  const load = useCallback(async () => {
    try {
      const fresco = await api.get<TodayResponse>('/api/punches/today');
      cacheToday(fresco);
      setData(fresco);
      setSemRede(false);
      setError('');
    } catch (e) {
      if (!isNetworkError(e)) {
        setError((e as Error).message);
        return;
      }
      setSemRede(true);
      setData((atual) => getCachedToday() ?? atual);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Fila local: redesenha quando um ponto entra ou sai dela.
  useEffect(() => {
    if (!user) return;
    setFila(getFila(user.id));
    return subscribe(() => setFila(getFila(user.id)));
  }, [user]);

  // Volta a rede (ou o app volta ao primeiro plano) → sobe a fila e recarrega.
  useEffect(() => {
    if (!user) return;
    return startSync(user.id, load);
  }, [user, load]);

  useEffect(() => {
    const aoVoltar = () => navigator.onLine && load();
    window.addEventListener('online', aoVoltar);
    return () => window.removeEventListener('online', aoVoltar);
  }, [load]);

  useEffect(() => subscribeOnline(() => setSemRede(!navigator.onLine)), []);

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

  /**
   * O ponto sempre entra primeiro na fila local e só depois vai para o
   * servidor: com conexão a diferença é de milissegundos, e sem conexão o
   * registro não se perde. O `clientId` da fila impede duplicata no reenvio.
   */
  async function confirmPunch() {
    if (!pending || !data || !user) return;
    // Hora intocada → instante exato (com segundos); ajustada → hora escolhida.
    const agora = horaNoFuso(new Date().toISOString(), data.timezone);
    const ts =
      pendingTime === agora
        ? new Date().toISOString()
        : isoFromLocal(data.today.date, pendingTime, data.timezone);

    setBusy(true);
    setError('');
    try {
      enfileirar(user.id, ts);
      setPending(null);
      await enviarFila(user.id);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return semRede ? (
      <div className="center-screen">
        <p className="muted center">
          Sem conexão e sem dados guardados neste aparelho.
          <br />
          Abra o app uma vez com internet para poder usá-lo offline.
        </p>
      </div>
    ) : (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    );
  }

  const view = juntarPendentes(data, fila);
  const punches = view.today.punches;
  const naFila = fila.length;
  const live = liveCompute(punches, now);
  const workedMin = live.workedSec / 60;
  const expected = view.today.expectedMinutes;
  const remaining = Math.max(0, expected - workedMin);
  const dayBalance = workedMin - expected;
  const tol = 0; // saldo do dia exibido "cru"; tolerância aparece no total/relatórios
  void tol;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <div className="hello">Olá, {user?.name.split(' ')[0]}</div>
          <div className="muted small">{fmtDataLonga(view.today.date)}</div>
        </div>
        <button className="link-btn" onClick={() => logout()}>
          Sair
        </button>
      </header>

      {(semRede || naFila > 0) && (
        <div className="offline-bar">
          {semRede ? '📴 Sem conexão — o ponto é registrado aqui mesmo.' : '🔄 Enviando…'}
          {naFila > 0 && (
            <strong>
              {' '}
              {naFila} {naFila === 1 ? 'registro aguardando envio' : 'registros aguardando envio'}
            </strong>
          )}
        </div>
      )}

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
        {live.state === 'off' ? (
          <button className="btn-big btn-in" disabled={busy} onClick={() => ask('clock_in')}>
            ▶ Registrar entrada
          </button>
        ) : (
          <button className="btn-big btn-out" disabled={busy} onClick={() => ask('clock_out')}>
            ⏹ Registrar saída
          </button>
        )}
        <p className="muted small center">
          {live.state === 'off'
            ? 'Saiu para o almoço? A saída e a entrada seguinte viram intervalo.'
            : 'A próxima saída fecha a sessão — o tempo até a entrada seguinte conta como intervalo.'}
        </p>
      </section>

      {pending && (
        <ConfirmPunch
          kind={pending}
          date={view.today.date}
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
          <span className="badge" title={semRede ? 'último valor sincronizado' : undefined}>
            saldo total {fmtSigned(view.totalBalance)}
            {semRede && '*'}
          </span>
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
};

function PunchRow({ p, onChanged }: { p: Punch; onChanged: () => void }) {
  const meta = KIND_META[p.kind];
  async function del() {
    if (!confirm('Remover este registro?')) return;
    // Ponto ainda na fila nunca chegou ao servidor: some tirando ele da fila.
    if (p.pending && p.clientId) {
      descartar(p.clientId);
      return;
    }
    try {
      await api.del(`/api/punches/${p.id}`);
      onChanged();
    } catch (e) {
      alert(isNetworkError(e) ? 'Sem conexão: só dá para remover um ponto já sincronizado online.' : (e as Error).message);
    }
  }
  return (
    <li className={`punch-row${p.pending ? ' is-pending' : ''}`}>
      <span className={`dot ${meta.cls}`} />
      <span className="punch-label">{meta.label}</span>
      <span className="punch-time">{fmtHora(p.ts)}</span>
      {p.pending && <span className="pending-tag" title="aguardando envio">⏳</span>}
      <button className="link-btn danger" onClick={del} aria-label="remover">
        ✕
      </button>
    </li>
  );
}
