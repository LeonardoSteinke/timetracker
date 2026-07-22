import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, Settings as TSettings } from '../api';
import { useInstall } from '../install';
import { WEEKDAYS_LONG } from '../util';

// ordem de exibição: segunda → domingo
const ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Campo numérico que aceita ficar vazio — vazio vale zero. */
function NumInput({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const [text, setText] = useState(String(value));

  // acompanha mudanças vindas de fora (carregar/salvar) sem atrapalhar a digitação
  useEffect(() => {
    if ((text === '' ? 0 : Number(text)) !== value) setText(String(value));
  }, [value]);

  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === '') {
          setText('');
          onChange(0);
          return;
        }
        const n = Math.min(max, Math.max(min, Number(raw) || 0));
        setText(String(n));
        onChange(n);
      }}
      onBlur={() => setText(String(value))}
    />
  );
}

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
      <NumInput value={h} min={0} max={24} onChange={(n) => onChange(Math.min(1440, n * 60 + m))} />
      <span>h</span>
      <NumInput value={m} min={0} max={59} onChange={(n) => onChange(h * 60 + n)} />
      <span>min</span>
    </div>
  );
}

/** Fuso do aparelho, ou o de São Paulo se o navegador não disser. */
function fusoDoAparelho(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
}

/**
 * Lista de fusos para o select. Os navegadores atuais sabem enumerar todos
 * (`Intl.supportedValuesOf`); nos que não sabem, fica uma lista curta com os
 * fusos do Brasil. O fuso do aparelho e o já salvo entram sempre, mesmo que
 * venham de fora da lista.
 */
function listaDeFusos(atual: string): string[] {
  const suportados = (Intl as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
  const todos = suportados
    ? suportados('timeZone')
    : [
        'America/Sao_Paulo', 'America/Bahia', 'America/Fortaleza', 'America/Recife',
        'America/Belem', 'America/Manaus', 'America/Cuiaba', 'America/Campo_Grande',
        'America/Porto_Velho', 'America/Boa_Vista', 'America/Rio_Branco', 'America/Noronha',
        'UTC',
      ];
  return [...new Set([atual, fusoDoAparelho(), ...todos])].filter(Boolean);
}

/**
 * Diferença do fuso para o UTC agora, como "UTC−03:00". Vem do próprio Intl
 * (`longOffset` devolve "GMT-03:00"), então já sai com o horário de verão que
 * estiver valendo hoje naquele fuso.
 */
function offsetUtc(tz: string, quando: Date): string {
  try {
    const nome = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
      .formatToParts(quando)
      .find((p) => p.type === 'timeZoneName')?.value;
    if (!nome) return '';
    // "GMT" puro é o próprio UTC; o resto vira "UTC±HH:MM" com o sinal de menos
    const resto = nome.replace('GMT', '') || '+00:00';
    return `UTC${resto.replace('-', '−')}`;
  } catch {
    return '';
  }
}

/**
 * O fuso decide a que dia pertence cada ponto, então mudá-lo recalcula o
 * histórico inteiro — por isso ele é escolhido de propósito num select, e não
 * pego do aparelho a cada abertura (uma viagem viraria remanejamento de dias).
 * O que o app faz é avisar quando os dois divergem e oferecer o ajuste.
 */
function TimezoneField({ value, onChange }: { value: string; onChange: (tz: string) => void }) {
  const doAparelho = fusoDoAparelho();
  // são centenas de fusos e cada rótulo custa um formatToParts: calcula uma vez
  const opcoes = useMemo(() => {
    const agora = new Date();
    return listaDeFusos(value).map((tz) => ({ tz, offset: offsetUtc(tz, agora) }));
  }, [value]);

  return (
    <>
      <label className="field">
        Fuso horário
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {opcoes.map(({ tz, offset }) => (
            <option key={tz} value={tz}>
              {tz.replace(/_/g, ' ')}
              {offset && ` (${offset})`}
              {tz === doAparelho ? ' — deste aparelho' : ''}
            </option>
          ))}
        </select>
      </label>
      {value !== doAparelho && (
        <p className="muted small">
          Este aparelho está em {doAparelho.replace(/_/g, ' ')}.{' '}
          <button className="link-btn" type="button" onClick={() => onChange(doAparelho)}>
            usar esse fuso
          </button>
        </p>
      )}
    </>
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
      </section>

      <section className="card">
        <h3>Preferências</h3>
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

      {error && <div className="error">{error}</div>}
      <button className="btn-primary" onClick={save}>
        {saved ? '✓ Salvo' : 'Salvar configurações'}
      </button>

      <AppCard />
      <PasswordCard />
    </div>
  );
}

/** Diz de onde o app está sendo aberto e, no celular, oferece instalar. */
function AppCard() {
  const { standalone, ios, mobile, canPrompt, install } = useInstall();

  return (
    <section className="card">
      <div className="card-title-row">
        <h3>Aplicativo</h3>
        <span className={`badge ${standalone ? 'ok' : ''}`}>{standalone ? 'instalado' : 'no navegador'}</span>
      </div>
      {standalone ? (
        <p className="muted small">
          Aberto pelo ícone, em tela cheia. As atualizações chegam sozinhas ao abrir o app.
        </p>
      ) : !mobile ? (
        <p className="muted small">
          Aberto numa aba do navegador. A instalação como app é coisa de celular — abra este endereço
          no telefone para adicionar o ícone à tela de início.
        </p>
      ) : (
        <>
          <p className="muted small">
            Instalando, o TimeTracker abre direto do ícone, em tela cheia e sem a barra do navegador.
          </p>
          {canPrompt ? (
            <button className="btn-secondary" onClick={() => install()}>
              📲 Instalar app
            </button>
          ) : (
            <p className="muted small">
              {ios
                ? 'No iPhone: toque em Compartilhar no Safari e escolha "Adicionar à Tela de Início".'
                : 'Use o menu do navegador e procure por "Instalar aplicativo" / "Adicionar à tela inicial".'}
            </p>
          )}
        </>
      )}
    </section>
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
