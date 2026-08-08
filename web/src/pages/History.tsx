import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, DaySummary, OverrideKind, RangeReport, Settings } from '../api';
import { fmtMin, fmtSigned, WEEKDAYS, fmtDataLonga, dayjs, OVERRIDE_LABEL } from '../util';

const OVERRIDE_KINDS: OverrideKind[] = ['vacation', 'dayoff', 'holiday', 'sick', 'custom'];

type Totais = { worked: number; expected: number; balance: number };

/** Totais de um conjunto de dias (o /range só devolve o do período inteiro). */
function sumDays(days: DaySummary[]): Totais {
  return days.reduce(
    (a, d) => ({
      worked: a.worked + d.workedMinutes,
      expected: a.expected + d.expectedMinutes,
      balance: a.balance + d.balance,
    }),
    { worked: 0, expected: 0, balance: 0 }
  );
}

export default function History() {
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    api.get<{ totalBalance: number }>('/api/reports/total').then((r) => setTotal(r.totalBalance));
  }, []);

  return (
    <div className="page">
      <header className="page-header">
        <h2>Histórico</h2>
      </header>

      <section className="total-card">
        <span className="total-label">Saldo total do banco de horas</span>
        <span className={`total-value ${(total ?? 0) >= 0 ? 'pos' : 'neg'}`}>
          {total === null ? '…' : fmtSigned(total)}
        </span>
      </section>

      <CalendarView />
    </div>
  );
}

/** Trabalhado / previsto / saldo do mês exibido. */
function Totals({ totals, context }: { totals: Totais; context: string }) {
  return (
    <section className="week-totals card" aria-label={`Resumo ${context}`}>
      <div>
        <span className="mini-value">{fmtMin(totals.worked)}</span>
        <span className="mini-label">trabalhado</span>
      </div>
      <div>
        <span className="mini-value">{fmtMin(totals.expected)}</span>
        <span className="mini-label">previsto</span>
      </div>
      <div>
        <span className={`mini-value ${totals.balance >= 0 ? 'pos' : 'neg'}`}>{fmtSigned(totals.balance)}</span>
        <span className="mini-label">saldo</span>
      </div>
    </section>
  );
}

// ─── Exceção em período (férias, folga emendada, atestado) ───────────────────

function PeriodOverride({ defaultFrom, onDone }: { defaultFrom: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<OverrideKind>('vacation');
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultFrom);
  const [hours, setHours] = useState('4');
  const [note, setNote] = useState('');
  const [onlyWorkdays, setOnlyWorkdays] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const invalido = !from || !to || from > to;

  async function run(fn: () => Promise<{ days: number }>, verbo: string) {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const r = await fn();
      setMsg(`${r.days} ${r.days === 1 ? 'dia' : 'dias'} ${verbo}.`);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn-secondary export-btn" onClick={() => setOpen(true)}>
        🏖 Registrar férias / folga em período
      </button>
    );
  }

  return (
    <section className="card form">
      <div className="card-title-row">
        <h3>Exceção em período</h3>
        <button className="link-btn" onClick={() => setOpen(false)}>
          fechar
        </button>
      </div>
      <p className="muted small">
        Aplica a mesma exceção a todos os dias do intervalo — férias, folga emendada, atestado. Dias
        futuros só passam a contar quando chegarem.
      </p>

      <label>
        Tipo
        <select value={kind} onChange={(e) => setKind(e.target.value as OverrideKind)} disabled={busy}>
          {OVERRIDE_KINDS.map((k) => (
            <option key={k} value={k}>
              {OVERRIDE_LABEL[k]}
            </option>
          ))}
        </select>
      </label>

      <div className="range-row">
        <label>
          De
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} disabled={busy} />
        </label>
        <label>
          Até
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} disabled={busy} />
        </label>
      </div>

      {kind === 'custom' && (
        <div className="hm-input">
          <input
            type="number"
            min={0}
            max={23}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            disabled={busy}
          />
          <span>h previstas por dia</span>
        </div>
      )}

      <label className="check-row">
        <input
          type="checkbox"
          checked={onlyWorkdays}
          onChange={(e) => setOnlyWorkdays(e.target.checked)}
          disabled={busy}
        />
        Só nos dias com jornada prevista (pula fim de semana)
      </label>

      <label>
        Observação
        <input
          value={note}
          maxLength={200}
          placeholder="ex.: férias 2026"
          onChange={(e) => setNote(e.target.value)}
          disabled={busy}
        />
      </label>

      {msg && <div className="ok-msg">{msg}</div>}
      {error && <div className="error">{error}</div>}

      <button
        className="btn-primary"
        disabled={busy || invalido}
        onClick={() =>
          run(
            () =>
              api.put<{ days: number }>('/api/overrides/range', {
                from,
                to,
                kind,
                expected: kind === 'custom' ? Number(hours) * 60 : null,
                note: note.trim() || null,
                onlyWorkdays,
              }),
            'marcados'
          )
        }
      >
        Aplicar de {fmtDataLonga(from)} a {fmtDataLonga(to)}
      </button>

      <button
        className="link-btn danger"
        disabled={busy || invalido}
        onClick={() =>
          confirm('Remover todas as exceções desse período?') &&
          run(() => api.del<{ days: number }>(`/api/overrides/range?from=${from}&to=${to}`), 'liberados')
        }
      >
        Remover exceções do período
      </button>
    </section>
  );
}

// ─── Calendário: grade do mês ─────────────────────────────────────────────────

function CalendarView() {
  const [month, setMonth] = useState(() => dayjs().startOf('month'));
  const [weekStart, setWeekStart] = useState<0 | 1>(1);
  const [days, setDays] = useState<Record<string, DaySummary> | null>(null);
  const [error, setError] = useState('');
  const today = dayjs().format('YYYY-MM-DD');

  useEffect(() => {
    api
      .get<Settings>('/api/settings')
      .then((s) => setWeekStart(s.week_start))
      .catch(() => {});
  }, []);

  // A grade fecha as semanas com dias vizinhos — buscamos o intervalo inteiro.
  const grid = useMemo(() => {
    const lead = (month.day() - weekStart + 7) % 7;
    const start = month.subtract(lead, 'day');
    const cells = Math.ceil((lead + month.daysInMonth()) / 7) * 7;
    return { start, cells, from: start.format('YYYY-MM-DD'), to: start.add(cells - 1, 'day').format('YYYY-MM-DD') };
  }, [month, weekStart]);

  const load = useCallback(() => {
    api
      .get<RangeReport>(`/api/reports/range?from=${grid.from}&to=${grid.to}`)
      .then((r) => setDays(Object.fromEntries(r.days.map((d) => [d.date, d]))))
      .catch((e) => setError((e as Error).message));
  }, [grid.from, grid.to]);

  useEffect(() => {
    setDays(null);
    load();
  }, [load]);

  const monthFrom = month.format('YYYY-MM-DD');
  const monthTo = month.endOf('month').format('YYYY-MM-DD');
  const monthDays = days ? Object.values(days).filter((d) => d.date >= monthFrom && d.date <= monthTo) : [];
  const header = Array.from({ length: 7 }, (_, i) => WEEKDAYS[(weekStart + i) % 7]);

  return (
    <>
      <div className="cal-nav">
        <button className="link-btn" onClick={() => setMonth(month.subtract(1, 'month'))} aria-label="mês anterior">
          ‹
        </button>
        <span className="cal-month">{month.format('MMMM [de] YYYY')}</span>
        <button className="link-btn" onClick={() => setMonth(month.add(1, 'month'))} aria-label="próximo mês">
          ›
        </button>
      </div>

      <section className="card cal-card">
        <div className="cal-grid cal-head">
          {header.map((w) => (
            <span key={w} className="cal-wd">
              {w}
            </span>
          ))}
        </div>
        <div className="cal-grid">
          {Array.from({ length: grid.cells }, (_, i) => {
            const d = grid.start.add(i, 'day');
            const key = d.format('YYYY-MM-DD');
            const day = days?.[key];
            // dia fora da janela ativa (futuro / antes do 1º ponto) fica neutro
            const vazio =
              !day || !day.counted || (day.workedMinutes === 0 && day.expectedMinutes === 0 && !day.override);
            const cls = [
              'cal-cell',
              d.month() !== month.month() ? 'outside' : '',
              key === today ? 'today' : '',
              vazio ? 'empty' : day!.balance >= 0 ? 'pos' : 'neg',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <Link key={key} to={`/dia/${key}`} className={cls}>
                <span className="cal-num">{d.date()}</span>
                <span className="cal-bal">{vazio ? '' : fmtSigned(day!.balance)}</span>
                {day?.override && <span className="cal-flag" title={OVERRIDE_LABEL[day.override.kind]} />}
                {day?.open && <span className="live-dot" />}
              </Link>
            );
          })}
        </div>
      </section>

      {days === null ? (
        <div className="center-screen">
          <div className="spinner" />
        </div>
      ) : (
        <>
          <Totals totals={sumDays(monthDays)} context="do mês" />
          <div className="cal-legend muted small">
            <span>
              <i className="sw pos" /> saldo positivo
            </span>
            <span>
              <i className="sw neg" /> negativo
            </span>
            <span>
              <i className="sw flag" /> exceção
            </span>
          </div>
          <PeriodOverride defaultFrom={today} onDone={load} />
          <a className="btn-secondary export-btn" href={`/api/reports/export.csv?from=${monthFrom}&to=${monthTo}`}>
            ⤓ Exportar CSV ({month.format('MMMM')})
          </a>
        </>
      )}

      {error && <div className="error">{error}</div>}
    </>
  );
}
