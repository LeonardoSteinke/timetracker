import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, InvitesResponse, Settings as TSettings, User } from '../api';
import { useAuth } from '../auth';
import { useInstall } from '../install';
import { assinar, cancelar, enviarTeste, estado, PushEstado, suportado } from '../push';
import { NumInput } from '../ui';
import { WEEKDAYS_LONG } from '../util';

// ordem de exibição: segunda → domingo
const ORDER = [1, 2, 3, 4, 5, 6, 0];

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

      <NotificationsCard s={s} onChange={setS} />

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

      <ProfileCard />
      <InvitesCard />
      <AdminCard />
      <AppCard />
      <PasswordCard />
    </div>
  );
}

/**
 * Avisos no celular. Duas coisas convivem aqui: ligar o push *neste aparelho*
 * (efeito imediato, é uma assinatura do navegador) e escolher *quais* avisos
 * chegar (preferência do usuário, salva junto com o resto da página).
 */
function NotificationsCard({ s, onChange }: { s: TSettings; onChange: (s: TSettings) => void }) {
  const { standalone, ios } = useInstall();
  const [push, setPush] = useState<PushEstado | null>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    estado().then(setPush);
  }, []);

  async function alternar() {
    setBusy(true);
    setErro('');
    setMsg('');
    try {
      if (push?.ativo) await cancelar();
      else await assinar();
      setPush(await estado());
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function testar() {
    setBusy(true);
    setErro('');
    setMsg('');
    try {
      await enviarTeste();
      setMsg('Aviso de teste enviado.');
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // No iPhone o push só existe com o app na tela de início — no Safari em aba
  // nem a permissão pode ser pedida, então o caminho é instalar primeiro.
  const precisaInstalar = ios && !standalone;
  const indisponivel = !suportado() || (push && !push.disponivel);

  return (
    <section className="card">
      <div className="card-title-row">
        <h3>Notificações</h3>
        <span className={`badge ${push?.ativo ? 'ok' : ''}`}>
          {push?.ativo ? 'ativas neste aparelho' : 'desligadas'}
        </span>
      </div>

      {precisaInstalar ? (
        <p className="muted small">
          Para receber avisos no iPhone, o app precisa estar na tela de início: toque em Compartilhar
          no Safari e escolha "Adicionar à Tela de Início". Depois volte aqui pelo ícone.
        </p>
      ) : indisponivel ? (
        <p className="muted small">
          {suportado()
            ? 'O servidor está sem notificações configuradas.'
            : 'Este navegador não suporta notificações — abra o app instalado no celular.'}
        </p>
      ) : (
        <>
          <p className="muted small">
            Avisos no celular mesmo com o app fechado. Ligar vale só para este aparelho.
          </p>
          <button className="btn-secondary" onClick={alternar} disabled={busy || !push}>
            {push?.ativo ? 'Desligar neste aparelho' : '🔔 Ativar neste aparelho'}
          </button>
          {push?.ativo && (
            <button className="link-btn" onClick={testar} disabled={busy}>
              Enviar teste
            </button>
          )}
          {push?.permissao === 'denied' && (
            <p className="muted small">
              A permissão está bloqueada. Libere as notificações do TimeTracker nos ajustes do
              sistema para poder ativar.
            </p>
          )}
        </>
      )}

      {erro && <div className="error">{erro}</div>}
      {msg && <div className="success">{msg}</div>}

      <label className="check-row">
        <input
          type="checkbox"
          checked={!!s.notify_end_of_day}
          onChange={(e) => onChange({ ...s, notify_end_of_day: e.target.checked ? 1 : 0 })}
        />
        <span>Hora de sair — quando a jornada do dia fecha</span>
      </label>
      {!!s.notify_end_of_day && (
        <div className="inline-field">
          <NumInput
            value={s.notify_end_lead_minutes}
            min={0}
            max={120}
            onChange={(n) => onChange({ ...s, notify_end_lead_minutes: n })}
          />
          <span>minutos de antecedência (0 = na hora)</span>
        </div>
      )}

      <label className="check-row">
        <input
          type="checkbox"
          checked={!!s.notify_break_done}
          onChange={(e) => onChange({ ...s, notify_break_done: e.target.checked ? 1 : 0 })}
        />
        <span>Intervalo mínimo cumprido — quando já dá para voltar</span>
      </label>
      <p className="muted small">As escolhas acima entram com o botão Salvar configurações.</p>
    </section>
  );
}

/** Nome de exibição. O nome de usuário é a identidade do login e não muda. */
function ProfileCard() {
  const { user, atualizar } = useAuth();
  const [nome, setNome] = useState(user?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => setNome(user?.name ?? ''), [user?.name]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErro('');
    setMsg('');
    try {
      atualizar(await api.patch<User>('/api/auth/me', { name: nome.trim() }));
      setMsg('Nome atualizado.');
      setTimeout(() => setMsg(''), 1800);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const mudou = nome.trim() !== user?.name && nome.trim().length > 0;

  return (
    <section className="card">
      <h3>Perfil</h3>
      <form onSubmit={salvar} className="form">
        <label>
          Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} required />
        </label>
        <label>
          Nome de usuário
          <input value={user?.username ?? ''} disabled />
          <span className="muted small">É o seu login — não dá para trocar.</span>
        </label>
        {erro && <div className="error">{erro}</div>}
        {msg && <div className="success">{msg}</div>}
        <button className="btn-secondary" type="submit" disabled={busy || !mudou}>
          Salvar nome
        </button>
      </form>
    </section>
  );
}

const INVITE_ESTADO: Record<string, string> = {
  pendente: 'aguardando',
  expirado: 'expirado — a vaga já voltou',
};

/**
 * Convites do usuário. Cada pessoa pode trazer um número limitado de gente
 * (o admin master ajusta a cota); quem já entrou ocupa a vaga para sempre, e
 * revogar ou deixar vencer um convite não usado devolve a vaga.
 */
function InvitesCard() {
  const [dados, setDados] = useState<InvitesResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const [copiado, setCopiado] = useState<number | null>(null);

  useEffect(() => {
    api.get<InvitesResponse>('/api/invites').then(setDados).catch((e) => setErro((e as Error).message));
  }, []);

  async function gerar() {
    setBusy(true);
    setErro('');
    try {
      setDados(await api.post<InvitesResponse>('/api/invites'));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revogar(id: number, expirado: boolean) {
    const aviso = expirado
      ? 'Remover este convite da lista?'
      : 'Revogar este convite? Quem receber o link não vai mais conseguir usá-lo.';
    if (!confirm(aviso)) return;
    setBusy(true);
    setErro('');
    try {
      setDados(await api.del<InvitesResponse>(`/api/invites/${id}`));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** O link já vem com o código: quem recebe só preenche nome e senha. */
  function linkDe(code: string) {
    return `${window.location.origin}/?convite=${code}`;
  }

  async function copiar(inv: { id: number; code: string }) {
    try {
      await navigator.clipboard.writeText(linkDe(inv.code));
      setCopiado(inv.id);
      setTimeout(() => setCopiado(null), 1800);
    } catch {
      // clipboard bloqueado (contexto inseguro): o código fica visível na tela
      setErro('Não consegui copiar — selecione o código na mão.');
    }
  }

  if (!dados) {
    return (
      <section className="card">
        <h3>Convites</h3>
        {erro ? <div className="error">{erro}</div> : <p className="muted small">Carregando…</p>}
      </section>
    );
  }

  return (
    <section className="card">
      <div className="card-title-row">
        <h3>Convites</h3>
        <span className={`badge ${dados.restantes > 0 ? 'ok' : ''}`}>
          {dados.usadas} de {dados.quota} usados
        </span>
      </div>
      <p className="muted small">
        Cada convite vale para uma pessoa e expira em {dados.ttlDays} dias. Convite aceito ocupa a
        vaga para sempre; revogar um que ninguém usou devolve a vaga.
      </p>

      <button className="btn-secondary" onClick={gerar} disabled={busy || dados.restantes === 0}>
        {dados.restantes > 0 ? '✉️ Gerar convite' : 'Sem convites disponíveis'}
      </button>

      {erro && <div className="error">{erro}</div>}

      {dados.invites.length > 0 && (
        <ul className="invite-list">
          {dados.invites.map((inv) => (
            <li key={inv.id} className={`invite-row is-${inv.estado}`}>
              <div className="invite-main">
                <code className="invite-code">{inv.code}</code>
                <span className="muted small">
                  {inv.estado === 'aceito' ? `aceito por ${inv.invitee_name}` : INVITE_ESTADO[inv.estado]}
                </span>
              </div>
              {inv.estado !== 'aceito' && (
                <div className="invite-actions">
                  {inv.estado === 'pendente' && (
                    <button className="link-btn" onClick={() => copiar(inv)}>
                      {copiado === inv.id ? '✓ copiado' : 'copiar link'}
                    </button>
                  )}
                  <button
                    className="link-btn danger"
                    onClick={() => revogar(inv.id, inv.estado === 'expirado')}
                    disabled={busy}
                  >
                    {inv.estado === 'expirado' ? 'remover' : 'revogar'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Porta de entrada da administração — só aparece para o admin master. */
function AdminCard() {
  const { user } = useAuth();
  if (!user?.is_admin) return null;

  return (
    <section className="card">
      <div className="card-title-row">
        <h3>Administração</h3>
        <span className="badge ok">admin master</span>
      </div>
      <p className="muted small">
        Cota de convites, redefinição de senha e exclusão de contas de todos os usuários.
      </p>
      <Link className="btn-secondary" to="/usuarios">
        👥 Gerenciar usuários
      </Link>
    </section>
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
