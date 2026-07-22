/**
 * Guarda de versão do PWA.
 *
 * `__BUILD_ID__` é fixado no bundle em tempo de build; `/api/version` devolve o
 * id do build que está no servidor. Se divergirem, o app aberto é antigo (caso
 * clássico do PWA no iOS, que fica suspenso e serve o precache por dias): a
 * gente apaga os caches, tira o service worker do caminho e recarrega.
 */

const CHECK_MS = 15 * 60 * 1000;
// Marca a última tentativa de reload para não entrar em loop se algo falhar.
const RELOAD_KEY = 'tt:reloaded-at';
const RELOAD_COOLDOWN_MS = 60 * 1000;

async function forceReload() {
  const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
  if (Date.now() - last < RELOAD_COOLDOWN_MS) return;
  sessionStorage.setItem(RELOAD_KEY, String(Date.now()));

  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    // cache/SW indisponíveis (aba privada, etc.) — recarregar ainda ajuda
  }
  window.location.reload();
}

/** Consulta o servidor e recarrega se o build mudou. */
export async function checkVersion(): Promise<void> {
  if (import.meta.env.DEV) return; // em dev o servidor serve um dist qualquer
  try {
    const res = await fetch('/api/version', { cache: 'no-store', credentials: 'include' });
    if (!res.ok) return;
    const { build } = (await res.json()) as { build: string };
    // 'dev' = servidor sem version.json; não é motivo para recarregar
    if (build && build !== 'dev' && build !== __BUILD_ID__) await forceReload();
  } catch {
    // offline: tenta de novo na próxima checagem
  }
}

/** Checa na abertura, ao voltar para o app e a cada 15 min. */
export function startVersionWatch(): () => void {
  const onVisible = () => {
    if (document.visibilityState === 'visible') checkVersion();
  };
  checkVersion();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
  const timer = window.setInterval(checkVersion, CHECK_MS);
  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
    window.clearInterval(timer);
  };
}
