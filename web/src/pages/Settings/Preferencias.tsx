import { CenterSpinner, SaveBar, SettingsHeader, TimezoneField, useSettings } from './shared';

export default function SettingsPreferencias() {
  const { s, setS, saved, error, save } = useSettings();

  if (!s) return <CenterSpinner />;

  return (
    <div className="page">
      <SettingsHeader title="Preferências" />

      <section className="card">
        <TimezoneField value={s.timezone} onChange={(tz) => setS({ ...s, timezone: tz })} />
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

      <SaveBar error={error} saved={saved} onSave={save} />
    </div>
  );
}
