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

/** Hora local 'HH:MM' de um instante ISO num dado fuso. */
export function localTimeKey(iso, timezone) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

/** Offset do fuso (ms) vigente no instante `utcMs`. */
function tzOffsetMs(utcMs, timezone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
      .formatToParts(new Date(utcMs))
      .map((p) => [p.type, p.value])
  );
  const hour = Number(parts.hour) % 24; // en-US pode devolver "24" para meia-noite
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, hour, +parts.minute, +parts.second);
  return asUtc - utcMs;
}

/**
 * Converte data + hora locais ('YYYY-MM-DD', 'HH:MM') num fuso para ISO UTC.
 * Duas passadas para acertar as bordas de horário de verão.
 */
export function isoFromLocal(dateKey, hhmm, timezone) {
  const [y, mo, d] = dateKey.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const naive = Date.UTC(y, mo - 1, d, h, mi, 0, 0);
  let ts = naive - tzOffsetMs(naive, timezone);
  ts = naive - tzOffsetMs(ts, timezone);
  return new Date(ts).toISOString();
}

/**
 * Zera segundos e milissegundos de um instante ISO.
 *
 * O ponto é sempre exibido como 'HH:MM'; se o instante guardado tiver segundos,
 * a conta não bate com o que está na tela — uma saída 12:58:33 seguida de uma
 * entrada 13:28:00 são 29 min de intervalo, mas a tela mostra "12:58 → 13:28".
 * Guardando tudo no minuto cheio, o que se vê é exatamente o que se calcula.
 */
export function truncMinute(iso) {
  const d = new Date(iso);
  d.setUTCSeconds(0, 0);
  return d.toISOString();
}

/**
 * Minutos do intervalo que o ponto em `ts` fecha ou abre, quando ele fica menor
 * que `minMinutes` (0 desliga a checagem) — senão `null`. Como os tipos vêm da
 * posição, um ponto em índice par é entrada (fecha o intervalo anterior) e em
 * índice ímpar é saída (abre o intervalo até a entrada seguinte).
 */
export function shortBreakAround(punches, ts, minMinutes) {
  if (!minMinutes) return null;
  const sorted = [...punches].sort((a, b) => a.ts.localeCompare(b.ts));
  const idx = sorted.findIndex((p) => p.ts === ts);
  if (idx < 0) return null;

  const vizinho = idx % 2 === 0 ? sorted[idx - 1] : sorted[idx + 1];
  if (!vizinho) return null;
  const gapMs = Math.abs(Date.parse(ts) - Date.parse(vizinho.ts));
  const min = Math.round(gapMs / 60000);
  return min < minMinutes ? min : null;
}

/** Dia da semana (0=domingo … 6=sábado) de uma data 'YYYY-MM-DD'. */
export function weekdayOf(dateKey) {
  // meia-noite UTC do dia — só usamos o índice do dia da semana
  return new Date(dateKey + 'T00:00:00Z').getUTCDay();
}

/**
 * Percorre os punches (ordenados) de um dia e devolve tempo trabalhado e de
 * intervalo em minutos. Os pontos alternam entrada/saída pela posição — par é
 * entrada, ímpar é saída — então trabalhado é a soma dos pares entrada→saída e
 * intervalo é cada buraco entre uma saída e a entrada seguinte. Se o último
 * ponto for uma entrada, a sessão está aberta e conta até `nowIso`.
 */
export function computeDay(punches, nowIso = null) {
  const sorted = [...punches].sort((a, b) => a.ts.localeCompare(b.ts));
  let workedMs = 0;
  let breakMs = 0;

  for (let i = 0; i < sorted.length; i += 2) {
    const entrada = Date.parse(sorted[i].ts);
    const saidaPunch = sorted[i + 1];
    // sessão aberta: até agora (ou nada, se for um dia passado deixado aberto)
    const saida = saidaPunch ? Date.parse(saidaPunch.ts) : nowIso ? Date.parse(nowIso) : entrada;
    if (saida > entrada) workedMs += saida - entrada;

    const proximaEntrada = sorted[i + 2];
    if (saidaPunch && proximaEntrada) {
      const gap = Date.parse(proximaEntrada.ts) - saida;
      if (gap > 0) breakMs += gap;
    }
  }

  const open = sorted.length % 2 === 1;
  return {
    workedMinutes: Math.round(workedMs / 60000),
    breakMinutes: Math.round(breakMs / 60000),
    open,
    state: open ? 'working' : 'off',
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
