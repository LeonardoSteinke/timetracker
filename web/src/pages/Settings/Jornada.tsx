import { WEEKDAYS_LONG } from '../../util';
import { NumInput } from '../../ui';
import { CenterSpinner, HourMinInput, SaveBar, SettingsHeader, useSettings } from './shared';

// ordem de exibição: segunda → domingo
const ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function SettingsJornada() {
  const { s, setS, saved, error, save } = useSettings();

  if (!s) return <CenterSpinner />;

  function setDay(wd: number, patch: Partial<{ expected: number; break: number }>) {
    if (!s) return;
    const cur = s.schedule[wd] || s.schedule[String(wd)] || { expected: 0, break: 0 };
    setS({ ...s, schedule: { ...s.schedule, [wd]: { ...cur, ...patch } } });
  }

  return (
    <div className="page">
      <SettingsHeader title="Jornada de trabalho" />

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
          <NumInput
            value={s.tolerance_minutes}
            min={0}
            max={240}
            onChange={(n) => setS({ ...s, tolerance_minutes: n })}
          />
          <span>minutos</span>
        </div>
      </section>

      <section className="card">
        <h3>Intervalo mínimo</h3>
        <p className="muted small">
          Ao voltar de um intervalo menor que isso, o app avisa antes de gravar o ponto (dá para
          registrar assim mesmo). Zero desliga a checagem.
        </p>
        <div className="inline-field">
          <NumInput
            value={s.min_break_minutes}
            min={0}
            max={480}
            onChange={(n) => setS({ ...s, min_break_minutes: n })}
          />
          <span>minutos</span>
        </div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={!!s.predict_min_break}
            onChange={(e) => setS({ ...s, predict_min_break: e.target.checked ? 1 : 0 })}
          />
          <span>Somar o intervalo mínimo ainda não cumprido na saída prevista</span>
        </label>
        <p className="muted small">
          Antes de bater o intervalo (ou enquanto ele for menor que o mínimo), a saída prevista
          empurra junto — já que ele não pode ser mais curto que isso.
        </p>
      </section>

      <SaveBar error={error} saved={saved} onSave={save} />
    </div>
  );
}
