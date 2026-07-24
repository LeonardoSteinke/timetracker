// Envio de Web Push (VAPID). O servidor só assina e entrega a mensagem ao
// serviço de push do fabricante (Apple/Google) — quem exibe a notificação é o
// service worker do PWA, mesmo com o app fechado.
//
// Requisitos do lado do navegador: a página tem que ser servida por HTTPS com
// certificado válido, e no iOS o app precisa estar instalado na tela de início.

import webpush from 'web-push';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const KEYS_FILE = path.join(DATA_DIR, 'vapid.json');

/**
 * Par de chaves VAPID: identidade permanente deste servidor perante o serviço
 * de push. Trocar as chaves invalida todas as assinaturas já feitas, então elas
 * são geradas uma vez e guardadas junto do banco — sobrevivem a rebuild da
 * imagem e entram no mesmo backup. O `.env` tem prioridade, para quem preferir
 * gerenciar o segredo por lá.
 */
function carregarChaves() {
  const doEnv = {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
  };
  if (doEnv.publicKey && doEnv.privateKey) return doEnv;

  try {
    const salvo = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
    if (salvo.publicKey && salvo.privateKey) return salvo;
  } catch {
    // primeiro boot (ou arquivo corrompido): gera abaixo
  }

  const novas = webpush.generateVAPIDKeys();
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(KEYS_FILE, JSON.stringify(novas, null, 2), { mode: 0o600 });
    return novas;
  } catch (e) {
    // Sem onde persistir, chaves novas a cada boot só gerariam assinaturas
    // mortas — melhor desligar o recurso e dizer o porquê.
    console.error('[push] não foi possível gravar', KEYS_FILE, '—', e.message);
    return null;
  }
}

const chaves = carregarChaves();

/**
 * Contato do dono do servidor, exigido pelo padrão VAPID. Não é decorativo: o
 * serviço de push da Apple recusa o JWT com 403 BadJwtToken se o `sub` não for
 * um mailto de domínio real (ou uma URL https). O Firebase aceita qualquer
 * coisa, então sem isso o push funciona no Android e falha no iPhone.
 */
const SUBJECT = process.env.VAPID_SUBJECT || '';

if (chaves) {
  if (!SUBJECT) {
    console.warn('[push] VAPID_SUBJECT não definido — o push vai falhar no iPhone. Defina no .env: mailto:voce@seudominio.com');
  }
  webpush.setVapidDetails(SUBJECT || 'mailto:admin@example.com', chaves.publicKey, chaves.privateKey);
}

export function pushHabilitado() {
  return !!chaves;
}

export function chavePublica() {
  return chaves?.publicKey || null;
}

/**
 * Entrega uma notificação a um aparelho. Devolve `{ ok }` e, quando o serviço
 * de push diz que a assinatura morreu (404/410 — app desinstalado, permissão
 * revogada), `{ morta: true }` para o chamador poder apagá-la.
 */
export async function enviar(sub, payload) {
  if (!chaves) return { ok: false, morta: false };
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
    return { ok: true, morta: false };
  } catch (e) {
    const status = e.statusCode || 0;
    if (status !== 404 && status !== 410) {
      console.error('[push] falha ao enviar:', status, e.body || e.message);
    }
    return { ok: false, morta: status === 404 || status === 410 };
  }
}
