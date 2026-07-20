// Utilidades de cálculo de tempo trabalhado / banco de horas.
// Punches são eventos {ts (ISO UTC), kind}. A partir deles reconstruímos o
// tempo efetivamente trabalhado (fora dos intervalos) por dia.

/** Retorna a data local 'YYYY-MM-DD' de um instante ISO num dado fuso. */
export function localDateKey(iso, timezone) {
  const d = new Date(iso);
  // en-CA formata como YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Dia da semana (0=domingo … 6=sábado) de uma data 'YYYY-MM-DD'. */
export function weekdayOf(dateKey) {
  // meia-noite UTC do dia — só usamos o índice do dia da semana
  return new Date(dateKey + 'T00:00:00Z').getUTCDay();
}

/**
 * Percorre os punches (ordenados) de um dia e devolve tempo trabalhado e de
 * intervalo em minutos. Se a sessão estiver aberta, conta até `nowIso`.
 * Estados: off → working → onbreak.
 */
export function computeDay(punches, nowIso = null) {
  const sorted = [...punches].sort((a, b) => a.ts.localeCompare(b.ts));
  let workedMs = 0;
  let breakMs = 0;
  let state = 'off';
  let last = null;

  for (const p of sorted) {
    const t = Date.parse(p.ts);
    if (state === 'working' && last != null) workedMs += t - last;
    if (state === 'onbreak' && last != null) breakMs += t - last;

    switch (p.kind) {
      case 'clock_in':    state = 'working'; break;
      case 'clock_out':   state = 'off'; break;
      case 'break_start': if (state === 'working') state = 'onbreak'; break;
      case 'break_end':   if (state === 'onbreak') state = 'working'; break;
    }
    last = t;
  }

  // sessão aberta: conta até agora
  if (state !== 'off' && nowIso && last != null) {
    const now = Date.parse(nowIso);
    if (now > last) {
      if (state === 'working') workedMs += now - last;
      else if (state === 'onbreak') breakMs += now - last;
    }
  }

  return {
    workedMinutes: Math.round(workedMs / 60000),
    breakMinutes: Math.round(breakMs / 60000),
    open: state !== 'off',
    state, // off | working | onbreak
  };
}

/**
 * Saldo do dia aplicando tolerância. Se |worked - expected| <= tolerance, o
 * saldo efetivo é 0 (não penaliza pequenas diferenças).
 */
export function dayBalance(workedMinutes, expectedMinutes, toleranceMinutes) {
  const raw = workedMinutes - expectedMinutes;
  const effective = Math.abs(raw) <= toleranceMinutes ? 0 : raw;
  return { raw, effective };
}

/** Formata minutos (com sinal opcional) como "1h30" / "-0h45". */
export function fmtMinutes(min, signed = false) {
  const sign = min < 0 ? '-' : signed ? '+' : '';
  const a = Math.abs(min);
  const h = Math.floor(a / 60);
  const m = a % 60;
  return `${sign}${h}h${String(m).padStart(2, '0')}`;
}
