import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, DaySummary, RangeReport, Settings } from '../api';
import { fmtMin, fmtSigned, WEEKDAYS, fmtDataCurta, dayjs, OVERRIDE_LABEL } from '../util';

type Preset = 7 | 30 | 90;
type View = 'lista' | 'calendario';
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
  const [view, setView] = useState<View>('lista');
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

      <div className="segmented">
        <button className={view === 'lista' ? 'active' : ''} onClick={() => setView('lista')} type="button">
          Lista
        </button>
        <button className={view === 'calendario' ? 'active' : ''} onClick={() => setView('calendario')} type="button">
          Calendário
        </button>
      </div>

      {view === 'lista' ? <ListView /> : <CalendarView />}
    </div>
  );
}

/** Trabalhado / previsto / saldo — compartilhado pelas duas visões. */
function Totals({ totals, label }: { totals: Totais; label: string }) {
  return (
    <section className="week-totals card">
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
        <span className="mini-label">{label}</span>
      </div>
    </section>
  );
}

// ─── Visão lista: últimos N dias ─────────────────────────────────────────────

function ListView() {
  const [preset, setPreset] = useState<Preset>(30);
  const [report, setReport] = useState<RangeReport | null>(null);
  const [error, setError] = useState('');

  const range = useMemo(
    () => ({
      to: dayjs().format('YYYY-MM-DD'),
      from: dayjs().subtract(preset - 1, 'day').format('YYYY-MM-DD'),
    }),
    [preset]
  );

  useEffect(() => {
    api
      .get<RangeReport>(`/api/reports/range?from=${range.from}&to=${range.to}`)
      .then(setReport)
      .catch((e) => setError((e as Error).message));
  }, [range]);

  return (
    <>
      <div className="segmented small-seg">
        {([7, 30, 90] as Preset[]).map((p) => (
          <button key={p} className={preset === p ? 'active' : ''} onClick={() => setPreset(p)} type="button">
            {p} dias
          </button>
        ))}
      </div>

      {!report ? (
        <div className="center-screen">
          <div className="spinner" />
        </div>
      ) : (
        <>
          <Totals totals={report.totals} label="saldo período" />

          <section className="hist-list card">
            {[...report.days]
              .filter((d) => d.punches.length > 0 || d.expectedMinutes > 0 || d.override)
              .reverse()
              .map((d) => (
                <Link key={d.date} to={`/dia/${d.date}`} className="hist-row">
                  <div className="hist-date">
                    <span className="hist-wd">{WEEKDAYS[d.weekday]}</span>
                    <span className="muted small">{fmtDataCurta(d.date)}</span>
                  </div>
                  <div className="hist-mid">
                    <span>{fmtMin(d.workedMinutes)}</span>
                    <span className="muted small">/ {fmtMin(d.expectedMinutes)}</span>
                    {d.override && <span className="tag">{OVERRIDE_LABEL[d.override.kind]}</span>}
                  </div>
                  <span className={`hist-bal ${d.balance >= 0 ? 'pos' : 'neg'}`}>
                    {d.expectedMinutes > 0 || d.workedMinutes > 0 ? fmtSigned(d.balance) : '—'}
                  </span>
                </Link>
              ))}
          </section>

          <a className="btn-secondary export-btn" href={`/api/reports/export.csv?from=${range.from}&to=${range.to}`}>
            ⤓ Exportar CSV ({preset} dias)
          </a>
        </>
      )}

      {error && <div className="error">{error}</div>}
    </>
  );
}

// ─── Visão calendário: grade do mês ──────────────────────────────────────────

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

  useEffect(() => {
    setDays(null);
    api
      .get<RangeReport>(`/api/reports/range?from=${grid.from}&to=${grid.to}`)
      .then((r) => setDays(Object.fromEntries(r.days.map((d) => [d.date, d]))))
      .catch((e) => setError((e as Error).message));
  }, [grid.from, grid.to]);

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
            const vazio = !day || (day.workedMinutes === 0 && day.expectedMinutes === 0 && !day.override);
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
          <Totals totals={sumDays(monthDays)} label="saldo do mês" />
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
          <a className="btn-secondary export-btn" href={`/api/reports/export.csv?from=${monthFrom}&to=${monthTo}`}>
            ⤓ Exportar CSV ({month.format('MMMM')})
          </a>
        </>
      )}

      {error && <div className="error">{error}</div>}
    </>
  );
}
