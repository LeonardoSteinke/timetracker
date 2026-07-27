// Agendador dos avisos push. Roda a cada minuto e pergunta ao mesmo resumo do
// dia que alimenta a tela "Hoje" (`rangeSummaries`) se algum gatilho acabou de
// acontecer — nada de regra de cálculo duplicada aqui.
//
// Não há fila de agendamentos: o estado é recalculado do zero a cada tick, então
// editar um ponto, mudar a jornada ou marcar um feriado já se refletem no
// próximo minuto sem nada para reagendar. O que evita repetir o mesmo aviso é a
// tabela `notifications_sent`.

import db from './db.js';
import { pushHabilitado, enviar } from './push.js';
import { getSettings, rangeSummaries } from './summary.js';
import { localDateKey, localTimeKey, fmtMinutes } from './time.js';

/**
 * Acima disso quem está fora não está no almoço — foi embora. Mesmo teto que o
 * cronômetro de intervalo usa na tela (web/src/pages/Dashboard.tsx).
 */
const TETO_INTERVALO_MIN = 120;

const jaAvisado = db.prepare('SELECT 1 FROM notifications_sent WHERE user_id = ? AND kind = ? AND key = ?');
const marcarAvisado = db.prepare('INSERT OR IGNORE INTO notifications_sent (user_id, kind, key) VALUES (?,?,?)');

/** Avisos pendentes deste usuário agora — lista vazia é o caso normal. */
function gatilhos(userId, nowIso) {
  const settings = getSettings(userId);
  const hoje = localDateKey(nowIso, settings.timezone);
  const [dia] = rangeSummaries(userId, hoje, hoje, settings, nowIso);
  const avisos = [];

  // ── Fim de jornada ────────────────────────────────────────────────────────
  // Só faz sentido com a sessão aberta: quem já bateu a saída não precisa ser
  // lembrado de bater a saída. Feriado/férias zeram o previsto e não disparam.
  if (settings.notify_end_of_day && dia.expectedMinutes > 0 && dia.open) {
    const lead = settings.notify_end_lead_minutes || 0;
    const falta = dia.expectedMinutes - dia.workedMinutes;
    if (falta <= lead) {
      const saida = localTimeKey(new Date(Date.parse(nowIso) + falta * 60000).toISOString(), settings.timezone);
      avisos.push({
        kind: 'end_of_day',
        key: hoje,
        title: falta > 0 ? `Faltam ${falta} min` : 'Jornada cumprida',
        body:
          falta > 0
            ? `A jornada de ${fmtMinutes(dia.expectedMinutes)} fecha às ${saida}.`
            : `Você já cumpriu ${fmtMinutes(dia.expectedMinutes)} hoje — pode bater a saída.`,
      });
    }
  }

  // ── Intervalo mínimo cumprido ─────────────────────────────────────────────
  // Cada saída (índice ímpar por posição) abre um intervalo que fecha na
  // entrada seguinte, ou segue em andamento até agora se for a última. Olhamos
  // todos os intervalos do dia, não só o em andamento: quem volta bem na hora
  // do mínimo já fecha a sessão antes do próximo tick de 1 min ver o intervalo
  // ainda aberto, e sem isso o aviso nunca dispara pra quem não se atrasa.
  const minimo = settings.min_break_minutes;
  const punchesOrdenados = [...dia.punches].sort((a, b) => a.ts.localeCompare(b.ts));
  if (settings.notify_break_done && minimo > 0 && dia.expectedMinutes > 0 && dia.workedMinutes < dia.expectedMinutes) {
    for (let i = 1; i < punchesOrdenados.length; i += 2) {
      const saida = punchesOrdenados[i];
      const entrada = punchesOrdenados[i + 1]; // ausente = intervalo ainda em andamento
      const fimGap = entrada ? Date.parse(entrada.ts) : Date.parse(nowIso);
      const fora = Math.floor((fimGap - Date.parse(saida.ts)) / 60000);
      if (fora >= minimo && fora <= TETO_INTERVALO_MIN) {
        avisos.push({
          kind: 'break_done',
          key: saida.ts,
          title: `Intervalo de ${minimo} min cumprido`,
          body: entrada
            ? `Intervalo de ${fora} min registrado — dentro do mínimo, sem aviso de intervalo curto.`
            : 'Pode voltar — a entrada agora não gera aviso de intervalo curto.',
        });
      }
    }
  }

  return avisos;
}

async function tick() {
  if (!pushHabilitado()) return;

  const usuarios = db.prepare('SELECT DISTINCT user_id FROM push_subscriptions').all();
  if (usuarios.length === 0) return;

  const nowIso = new Date().toISOString();
  for (const { user_id: uid } of usuarios) {
    try {
      for (const aviso of gatilhos(uid, nowIso)) {
        if (jaAvisado.get(uid, aviso.kind, aviso.key)) continue;
        // Marca antes de enviar: o gatilho aconteceu uma vez só, e uma falha de
        // entrega não pode virar uma tentativa por minuto até o fim do dia.
        marcarAvisado.run(uid, aviso.kind, aviso.key);

        const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(uid);
        for (const sub of subs) {
          const { morta } = await enviar(sub, {
            title: aviso.title,
            body: aviso.body,
            tag: aviso.kind,
          });
          if (morta) db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
        }
      }
    } catch (e) {
      // Um usuário com dado estranho não pode derrubar o aviso dos outros.
      console.error('[notify] erro no usuário', uid, '—', e.message);
    }
  }

  db.prepare("DELETE FROM notifications_sent WHERE sent_at < datetime('now','-30 days')").run();
}

/** Liga o agendador, alinhado ao minuto cheio (o gatilho é sempre 'HH:MM'). */
export function startNotifier() {
  if (!pushHabilitado()) {
    console.log('[notify] push desativado — sem chaves VAPID');
    return;
  }
  const rodar = () => tick().catch((e) => console.error('[notify] tick falhou:', e.message));
  setTimeout(() => {
    rodar();
    setInterval(rodar, 60_000);
  }, 60_000 - (Date.now() % 60_000));
}
