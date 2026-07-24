// Assinatura de Web Push do aparelho.
//
// A assinatura é por aparelho (e por origem): o endereço gerado aqui é enviado
// ao servidor, que o usa para entregar os avisos mesmo com o app fechado. Quais
// avisos chegam é preferência do usuário e vive em /api/settings.
//
// Requisitos: HTTPS com certificado válido (sem isso o navegador nem registra o
// service worker) e, no iPhone, o app instalado na tela de início.

import { api } from './api';

type PushConfig = { enabled: boolean; publicKey: string | null };

export type PushEstado = {
  /** O navegador tem service worker + push? */
  suportado: boolean;
  /** O servidor tem chaves VAPID configuradas? */
  disponivel: boolean;
  permissao: NotificationPermission;
  /** Este aparelho está assinado. */
  ativo: boolean;
};

export function suportado(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

let configCache: Promise<PushConfig> | null = null;
function config(): Promise<PushConfig> {
  if (!configCache) {
    configCache = api
      .get<PushConfig>('/api/push/config')
      .catch(() => ({ enabled: false, publicKey: null }));
  }
  return configCache;
}

/**
 * O registro do service worker. `navigator.serviceWorker.ready` fica pendente
 * para sempre quando não há service worker nenhum (o `vite dev` não gera um),
 * então a espera tem prazo.
 */
async function registro(): Promise<ServiceWorkerRegistration> {
  const prazo = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('service worker indisponível')), 10_000)
  );
  return Promise.race([navigator.serviceWorker.ready, prazo]);
}

/** A chave VAPID trafega em base64url; o `subscribe` quer os bytes crus. */
function chaveEmBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function estado(): Promise<PushEstado> {
  if (!suportado()) {
    return { suportado: false, disponivel: false, permissao: 'default', ativo: false };
  }
  const { enabled } = await config();
  let ativo = false;
  try {
    const reg = await registro();
    ativo = !!(await reg.pushManager.getSubscription());
  } catch {
    // sem service worker registrado ainda — só não está ativo
  }
  return { suportado: true, disponivel: enabled, permissao: Notification.permission, ativo };
}

/**
 * Ativa os avisos neste aparelho. Precisa ser chamada a partir de um gesto do
 * usuário (o clique no botão) — é exigência do iOS para o pedido de permissão.
 */
export async function assinar(): Promise<void> {
  if (!suportado()) throw new Error('Este navegador não suporta notificações.');

  const { enabled, publicKey } = await config();
  if (!enabled || !publicKey) throw new Error('O servidor está sem notificações configuradas.');

  const permissao = await Notification.requestPermission();
  if (permissao !== 'granted') {
    throw new Error('Permissão negada. Libere as notificações do TimeTracker nos ajustes do sistema.');
  }

  const reg = await registro();
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({
      // Obrigatório: todo push tem que virar uma notificação visível.
      userVisibleOnly: true,
      applicationServerKey: chaveEmBytes(publicKey),
    }));

  await api.post('/api/push/subscribe', sub.toJSON());
}

export async function cancelar(): Promise<void> {
  // Sem permissão concedida não existe assinatura para desfazer — e é o que
  // evita o logout esperar por um service worker que não existe (desktop).
  if (!suportado() || Notification.permission !== 'granted') return;
  const reg = await registro();
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  // Primeiro o servidor: se o aparelho cancelar e o POST falhar, ficaria uma
  // assinatura órfã recebendo avisos até o serviço de push devolver 410.
  await api.post('/api/push/unsubscribe', { endpoint: sub.endpoint });
  await sub.unsubscribe();
}

/**
 * Reenvia a assinatura deste aparelho ao servidor. O navegador pode trocar o
 * endereço por conta própria (`pushsubscriptionchange`), e o registro no
 * servidor some junto com o usuário — reenviar ao abrir o app corrige os dois
 * casos sem nada extra no service worker.
 */
export async function sincronizar(): Promise<void> {
  if (!suportado() || Notification.permission !== 'granted') return;
  try {
    const { enabled } = await config();
    if (!enabled) return;
    const reg = await registro();
    const sub = await reg.pushManager.getSubscription();
    if (sub) await api.post('/api/push/subscribe', sub.toJSON());
  } catch {
    // offline ou sem service worker: tenta de novo na próxima abertura
  }
}

export async function enviarTeste(): Promise<void> {
  await api.post('/api/push/test');
}
