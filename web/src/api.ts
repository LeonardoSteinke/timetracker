// Cliente HTTP fino. Cookies (sessão) vão junto via credentials: 'include'.

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
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
    throw new ApiError(data?.error || `erro ${res.status}`, res.status);
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

export type PunchKind = 'clock_in' | 'clock_out' | 'break_start' | 'break_end';
/** `time` ('HH:MM' no fuso do usuário) só vem no endpoint /api/reports/day. */
export type Punch = { id: number; ts: string; kind: PunchKind; note?: string | null; time?: string };

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
  open: boolean;
  state: 'off' | 'working' | 'onbreak';
  override: DayOverride | null;
  punches: Punch[];
};

export type DayResponse = { day: DaySummary; timezone: string; today: string };

export type TodayResponse = {
  today: DaySummary;
  totalBalance: number;
  now: string;
  timezone: string;
};

export type DayConfig = { expected: number; break: number };
export type Settings = {
  tolerance_minutes: number;
  timezone: string;
  week_start: 0 | 1;
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
