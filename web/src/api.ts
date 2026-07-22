// Cliente HTTP fino. Cookies (sessão) vão junto via credentials: 'include'.

export class ApiError extends Error {
  status: number;
  /** Código do erro quando o servidor manda um (ex.: 'short_break'). */
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
    throw new ApiError(data?.error || `erro ${res.status}`, res.status, data?.code);
  }
  return data as T;
}

export const api = {
  get: <T>(u: string) => req<T>('GET', u),
  post: <T>(u: string, b?: unknown) => req<T>('POST', u, b),
  put: <T>(u: string, b?: unknown) => req<T>('PUT', u, b),
  patch: <T>(u: string, b?: unknown) => req<T>('PATCH', u, b),
  del: <T>(u: string) => req<T>('DELETE', u),
};

// ─── Tipos compartilhados com o backend ──────────────────────────────────────
export type User = { id: number; name: string; username: string; is_admin: number };

/** Entrada e saída se alternam pela ordem do dia — o servidor é quem decide. */
export type PunchKind = 'clock_in' | 'clock_out';
/**
 * `time` ('HH:MM' no fuso do usuário) só vem no endpoint /api/reports/day.
 * `pending` marca o ponto que ainda está na fila offline (id local, negativo).
 */
export type Punch = {
  id: number;
  ts: string;
  kind: PunchKind;
  note?: string | null;
  time?: string;
  pending?: boolean;
  clientId?: string;
};

export type OverrideKind = 'holiday' | 'vacation' | 'sick' | 'dayoff' | 'custom';
export type DayOverride = {
  date: string;
  kind: OverrideKind;
  expected: number | null;
  note: string | null;
};

export type DaySummary = {
  date: string;
  weekday: number;
  workedMinutes: number;
  breakMinutes: number;
  expectedMinutes: number;
  remainingMinutes: number;
  balance: number;
  rawBalance: number;
  /** false = fora da janela ativa (antes do 1º ponto ou no futuro): não gera saldo. */
  counted: boolean;
  open: boolean;
  state: 'off' | 'working';
  override: DayOverride | null;
  punches: Punch[];
};

export type DayResponse = { day: DaySummary; timezone: string; today: string };

export type TodayResponse = {
  today: DaySummary;
  totalBalance: number;
  now: string;
  timezone: string;
  /** Intervalo mínimo configurado (minutos); 0 = sem checagem. */
  minBreakMinutes: number;
};

export type DayConfig = { expected: number; break: number };
export type Settings = {
  tolerance_minutes: number;
  timezone: string;
  week_start: 0 | 1;
  /** Intervalo mínimo entre uma saída e a entrada seguinte; 0 = sem checagem. */
  min_break_minutes: number;
  schedule: Record<string, DayConfig>;
};

export type WeekReport = {
  start: string;
  end: string;
  days: DaySummary[];
  totals: { worked: number; expected: number; balance: number };
  weekStart: 0 | 1;
};

export type RangeReport = {
  from: string;
  to: string;
  days: DaySummary[];
  totals: { worked: number; expected: number; balance: number };
};
