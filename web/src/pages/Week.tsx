import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, WeekReport } from '../api';
import { fmtMin, fmtSigned, fmtHora, WEEKDAYS, fmtDataCurta, dayjs, OVERRIDE_LABEL } from '../util';

export default function Week() {
  const [report, setReport] = useState<WeekReport | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const qs = start ? `?start=${start}` : '';
    api
      .get<WeekReport>(`/api/reports/week${qs}`)
      .then(setReport)
      .catch((e) => setError((e as Error).message));
  }, [start]);

  if (!report) {
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    );
  }

  const maxExpected = Math.max(60, ...report.days.map((d) => Math.max(d.expectedMinutes, d.workedMinutes)));

  return (
    <div className="page">
      <header className="page-header">
        <h2>Semana</h2>
        <div className="week-nav">
          <button className="link-btn" onClick={() => setStart(dayjs(report.start).subtract(7, 'day').format('YYYY-MM-DD'))}>
            ‹
          </button>
          <span className="muted small">
            {fmtDataCurta(report.start)} – {fmtDataCurta(report.end)}
          </span>
          <button className="link-btn" onClick={() => setStart(dayjs(report.start).add(7, 'day').format('YYYY-MM-DD'))}>
            ›
          </button>
        </div>
      </header>

      <section className="week-totals card">
        <div>
          <span className="mini-value">{fmtMin(report.totals.worked)}</span>
          <span className="mini-label">trabalhado</span>
        </div>
        <div>
          <span className="mini-value">{fmtMin(report.totals.expected)}</span>
          <span className="mini-label">previsto</span>
        </div>
        <div>
          <span className={`mini-value ${report.totals.balance >= 0 ? 'pos' : 'neg'}`}>
            {fmtSigned(report.totals.balance)}
          </span>
          <span className="mini-label">saldo semana</span>
        </div>
      </section>

      <section className="week-list">
        {report.days.map((d) => {
          const pct = Math.min(100, (d.workedMinutes / maxExpected) * 100);
          const expPct = Math.min(100, (d.expectedMinutes / maxExpected) * 100);
          const isToday = d.date === dayjs().format('YYYY-MM-DD');
          return (
            <Link key={d.date} to={`/dia/${d.date}`} className={`week-day ${isToday ? 'today' : ''}`}>
              <div className="wd-head">
                <span className="wd-name">
                  {WEEKDAYS[d.weekday]} {fmtDataCurta(d.date)}
                  {d.open && <span className="live-dot" title="em andamento" />}
                  {d.override && <span className="tag">{OVERRIDE_LABEL[d.override.kind]}</span>}
                </span>
                <span className={`wd-balance ${d.balance >= 0 ? 'pos' : 'neg'}`}>
                  {d.expectedMinutes > 0 || d.workedMinutes > 0 ? fmtSigned(d.balance) : '—'}
                </span>
              </div>
              <div className="bar">
                <div className="bar-expected" style={{ width: `${expPct}%` }} />
                <div className={`bar-worked ${d.balance >= 0 ? 'pos' : 'neg'}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="wd-foot muted small">
                {d.punches.length > 0 && (
                  <span className="wd-span">
                    {fmtHora(d.punches[0].ts)} → {d.open ? 'agora' : fmtHora(d.punches[d.punches.length - 1].ts)}
                  </span>
                )}
                {fmtMin(d.workedMinutes)} de {fmtMin(d.expectedMinutes)}
                {d.breakMinutes > 0 && ` · ${fmtMin(d.breakMinutes)} intervalo`}
              </div>
            </Link>
          );
        })}
      </section>

      {error && <div className="error">{error}</div>}
    </div>
  );
}
