/**
 * Modo offline.
 *
 * Bater o ponto é a única coisa que não pode esperar conexão: se o app abrir
 * sem rede (ou o servidor não responder), o registro vai para uma fila no
 * localStorage e sobe assim que a conexão voltar. Para o dia continuar
 * aparecendo na tela, guardamos também o último retrato de `/api/punches/today`
 * e do usuário logado.
 *
 * Nada aqui recalcula saldo — o servidor continua sendo a fonte de verdade;
 * offline a gente só mostra o que dá para calcular a partir dos pontos do dia.
 */
import { api, ApiError, DaySummary, Punch, Settings, TodayResponse, User } from './api';
import { dataNoFuso } from './util';

const K_FILA = 'tt:outbox';
const K_HOJE = 'tt:today';
const K_USER = 'tt:user';
const K_SETTINGS = 'tt:settings';

/** Ponto registrado localmente, ainda não confirmado pelo servidor. */
export type PontoPendente = {
  clientId: string;
  userId: number;
  ts: string;
  note?: string | null;
  /** Ponto que o usuário mandou gravar mesmo com o aviso de intervalo curto. */
  force?: boolean;
};

function ler<T>(key: string): T | null {
  try {
    const s = localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}

function gravar(key: string, valor: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(valor));
  } catch {
    // storage cheio ou bloqueado (aba privada): sem fila offline, mas o app segue
  }
}

// ─── Assinantes (a UI redesenha quando a fila ou o estado da rede muda) ──────
const ouvintes = new Set<() => void>();
export function subscribe(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}
function avisar() {
  ouvintes.forEach((fn) => fn());
}

/** Falha de rede (fetch rejeitado) e não resposta de erro do servidor. */
export function isNetworkError(e: unknown): boolean {
  return !(e instanceof ApiError);
}

// ─── Retratos do último estado online ───────────────────────────────────────
export const cacheUser = (u: User | null) => (u ? gravar(K_USER, u) : localStorage.removeItem(K_USER));
export const getCachedUser = () => ler<User>(K_USER);
export const cacheSettings = (s: Settings) => gravar(K_SETTINGS, s);
export const getCachedSettings = () => ler<Settings>(K_SETTINGS);
export const cacheToday = (d: TodayResponse) => gravar(K_HOJE, d);

/**
 * Último retrato do dia. Se ele for de ontem (app aberto offline no dia
 * seguinte), devolve um dia zerado com o previsto vindo da jornada em cache —
 * o saldo total fica congelado no valor da última sincronização.
 */
export function getCachedToday(): TodayResponse | null {
  const snap = ler<TodayResponse>(K_HOJE);
  if (!snap) return null;
  const hoje = dataNoFuso(new Date().toISOString(), snap.timezone);
  if (snap.today.date === hoje) return snap;

  const weekday = new Date(`${hoje}T12:00:00Z`).getUTCDay();
  const cfg = getCachedSettings()?.schedule?.[String(weekday)];
  const previsto = cfg?.expected ?? 0;
  const dia: DaySummary = {
    ...snap.today,
    date: hoje,
    weekday,
    punches: [],
    workedMinutes: 0,
    breakMinutes: 0,
    expectedMinutes: previsto,
    remainingMinutes: previsto,
    balance: 0,
    rawBalance: 0,
    counted: true,
    open: true,
    state: 'off',
    override: null,
  };
  return { ...snap, today: dia, now: new Date().toISOString() };
}

// ─── Fila ───────────────────────────────────────────────────────────────────
export function getFila(userId?: number): PontoPendente[] {
  const fila = ler<PontoPendente[]>(K_FILA) || [];
  return userId == null ? fila : fila.filter((p) => p.userId === userId);
}

function setFila(fila: PontoPendente[]) {
  gravar(K_FILA, fila);
  avisar();
}

function novoId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Enfileira um ponto e devolve o registro pendente para exibição imediata. */
export function enfileirar(userId: number, ts: string, note?: string | null, force = false): PontoPendente {
  const p: PontoPendente = { clientId: novoId(), userId, ts, note: note ?? null, force };
  setFila([...getFila(), p]);
  return p;
}

export function descartar(clientId: string) {
  setFila(getFila().filter((p) => p.clientId !== clientId));
}

/**
 * Sobe a fila em ordem. Falha de rede ou sessão expirada interrompem sem perder
 * nada (tenta de novo depois); erro de validação descarta o ponto, senão a fila
 * trava para sempre num registro que o servidor nunca vai aceitar.
 */
let enviando = false;
export async function enviarFila(userId: number): Promise<void> {
  if (enviando || !navigator.onLine) return;
  enviando = true;
  try {
    for (const p of getFila(userId)) {
      try {
        // `force`: o aviso de intervalo curto já foi respondido na tela, aqui
        // não dá para perguntar de novo — e sem isso o ponto seria descartado.
        await api.post('/api/punches', {
          clientId: p.clientId,
          ts: p.ts,
          note: p.note || undefined,
          force: p.force || undefined,
        });
      } catch (e) {
        if (isNetworkError(e)) return;
        if (e instanceof ApiError && (e.status === 401 || e.status >= 500)) return;
      }
      descartar(p.clientId);
    }
  } finally {
    enviando = false;
    avisar();
  }
}

// ─── Junção fila + retrato ──────────────────────────────────────────────────
/**
 * Mistura os pontos pendentes no dia vindo do servidor. O tipo de cada ponto é
 * recalculado pela ordem (entrada/saída alternando), a mesma regra da
 * `normalizeDay` no servidor — assim um ponto retroativo no meio do dia inverte
 * os seguintes na tela igual inverteria no banco.
 */
export function juntarPendentes(snap: TodayResponse, pendentes: PontoPendente[]): TodayResponse {
  const doDia = pendentes.filter((p) => dataNoFuso(p.ts, snap.timezone) === snap.today.date);
  if (doDia.length === 0) return snap;

  const punches = [
    ...snap.today.punches,
    ...doDia.map((p, i) => ({
      id: -(i + 1),
      ts: p.ts,
      kind: 'clock_in' as const,
      note: p.note,
      pending: true,
      clientId: p.clientId,
    })),
  ]
    .sort((a, b) => a.ts.localeCompare(b.ts))
    .map((p, i): Punch => ({ ...p, kind: i % 2 === 0 ? 'clock_in' : 'clock_out' }));

  return { ...snap, today: { ...snap.today, punches } };
}

// ─── Sincronização automática ───────────────────────────────────────────────
/**
 * Tenta esvaziar a fila ao voltar a rede, ao reabrir o app e de tempos em
 * tempos. `onSynced` só dispara quando algo saiu da fila, para a tela recarregar
 * os números do servidor.
 */
export function startSync(userId: number, onSynced: () => void): () => void {
  let ultimo = getFila(userId).length;

  const rodar = async () => {
    if (getFila(userId).length === 0) return;
    await enviarFila(userId);
    const agora = getFila(userId).length;
    if (agora !== ultimo) {
      ultimo = agora;
      onSynced();
    }
  };

  const aoVoltar = () => {
    if (document.visibilityState === 'visible') rodar();
  };

  rodar();
  window.addEventListener('online', rodar);
  document.addEventListener('visibilitychange', aoVoltar);
  const timer = window.setInterval(rodar, 60_000);

  return () => {
    window.removeEventListener('online', rodar);
    document.removeEventListener('visibilitychange', aoVoltar);
    window.clearInterval(timer);
  };
}

/** Estado de rede reativo, para os avisos na tela. */
export function subscribeOnline(fn: () => void): () => void {
  window.addEventListener('online', fn);
  window.addEventListener('offline', fn);
  return () => {
    window.removeEventListener('online', fn);
    window.removeEventListener('offline', fn);
  };
}
