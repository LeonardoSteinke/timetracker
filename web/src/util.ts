import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';
dayjs.locale('pt-br');

export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const OVERRIDE_LABEL: Record<string, string> = {
  holiday: 'Feriado',
  vacation: 'Férias',
  sick: 'Atestado',
  dayoff: 'Folga',
  custom: 'Especial',
};
export const WEEKDAYS_LONG = [
  'Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado',
];

/** Minutos → "1h30" (ou "0h00"). */
export function fmtMin(min: number): string {
  const a = Math.abs(Math.round(min));
  const h = Math.floor(a / 60);
  const m = a % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
}

/** Saldo com sinal: "+1h30" / "−0h45". */
export function fmtSigned(min: number): string {
  const r = Math.round(min);
  if (r === 0) return '0h00';
  return (r > 0 ? '+' : '−') + fmtMin(r);
}

/** Duração em segundos → "1:30:05" (para cronômetro ao vivo). */
export function fmtClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function fmtHora(iso: string): string {
  return dayjs(iso).format('HH:mm');
}

/** "HH:MM" do instante no fuso do usuário (para preencher `input type=time`). */
export function horaNoFuso(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

export function fmtDataCurta(dateKey: string): string {
  return dayjs(dateKey).format('DD/MM');
}

export function fmtDataLonga(dateKey: string): string {
  return dayjs(dateKey).format('DD [de] MMMM');
}

export { dayjs };
