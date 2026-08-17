// Utilidades e o hook de configurações compartilhados pelas sub-páginas de Ajustes.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, Settings as TSettings } from '../../api';
import { NumInput } from '../../ui';

export function useSettings() {
  const [s, setS] = useState<TSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<TSettings>('/api/settings').then(setS).catch((e) => setError((e as Error).message));
  }, []);

  async function save() {
    if (!s) return;
    setError('');
    try {
      const novo = await api.put<TSettings>('/api/settings', s);
      setS(novo);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return { s, setS, saved, error, save };
}

/** Cabeçalho padrão das sub-páginas de Ajustes, com botão de voltar ao menu. */
export function SettingsHeader({ title }: { title: string }) {
  const navigate = useNavigate();
  return (
    <header className="page-header detail-header">
      <button className="back-button" onClick={() => navigate('/config')} aria-label="Voltar para ajustes">
        <span aria-hidden="true">←</span> Ajustes
      </button>
      <h2>{title}</h2>
    </header>
  );
}

/** Botão de salvar comum às páginas que editam o objeto de configurações. */
export function SaveBar({
  error,
  saved,
  onSave,
}: {
  error: string;
  saved: boolean;
  onSave: () => void;
}) {
  return (
    <>
      {error && <div className="error">{error}</div>}
      <button className="btn-primary" onClick={onSave}>
        {saved ? '✓ Salvo' : 'Salvar configurações'}
      </button>
    </>
  );
}

export function CenterSpinner() {
  return (
    <div className="center-screen">
      <div className="spinner" />
    </div>
  );
}

export function HourMinInput({
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
export function fusoDoAparelho(): string {
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
export function TimezoneField({ value, onChange }: { value: string; onChange: (tz: string) => void }) {
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
