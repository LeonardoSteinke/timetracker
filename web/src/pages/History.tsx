import { useEffect, useState } from 'react';
import { api, RangeReport } from '../api';
import { fmtMin, fmtSigned, WEEKDAYS, fmtDataCurta, dayjs } from '../util';

type Preset = 7 | 30 | 90;

export default function History() {
  const [preset, setPreset] = useState<Preset>(30);
  const [report, setReport] = useState<RangeReport | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const to = dayjs().format('YYYY-MM-DD');
    const from = dayjs().subtract(preset - 1, 'day').format('YYYY-MM-DD');
    api
      .get<RangeReport>(`/api/reports/range?from=${from}&to=${to}`)
      .then(setReport)
      .catch((e) => setError((e as Error).message));
  }, [preset]);

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
              <span className="mini-label">saldo período</span>
            </div>
          </section>

          <section className="hist-list card">
            {[...report.days]
              .filter((d) => d.punches.length > 0 || d.expectedMinutes > 0)
              .reverse()
              .map((d) => (
                <div key={d.date} className="hist-row">
                  <div className="hist-date">
                    <span className="hist-wd">{WEEKDAYS[d.weekday]}</span>
                    <span className="muted small">{fmtDataCurta(d.date)}</span>
                  </div>
                  <div className="hist-mid">
                    <span>{fmtMin(d.workedMinutes)}</span>
                    <span className="muted small">/ {fmtMin(d.expectedMinutes)}</span>
                  </div>
                  <span className={`hist-bal ${d.balance >= 0 ? 'pos' : 'neg'}`}>
                    {d.expectedMinutes > 0 || d.workedMinutes > 0 ? fmtSigned(d.balance) : '—'}
                  </span>
                </div>
              ))}
          </section>
        </>
      )}

      {error && <div className="error">{error}</div>}
    </div>
  );
}
