/* Handlers de push do service worker.
 *
 * O service worker é gerado pelo Workbox (vite-plugin-pwa, estratégia
 * generateSW), que não sabe nada de push — este arquivo é anexado a ele via
 * `workbox.importScripts` no vite.config.ts. Fica em `public/` de propósito:
 * o nome não leva hash, então o Express o serve com `no-cache` e ele se atualiza
 * junto com o service worker.
 */

self.addEventListener('push', (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch {
    dados = { body: event.data ? event.data.text() : '' };
  }

  // Toda mensagem TEM que virar uma notificação visível: a assinatura é
  // `userVisibleOnly` e o iOS revoga a permissão de quem recebe push calado.
  event.waitUntil(
    self.registration.showNotification(dados.title || 'TimeTracker', {
      body: dados.body || '',
      icon: '/icon-192.png',
      badge: '/favicon-32.png',
      // Mesma tag substitui o aviso anterior em vez de empilhar outro igual.
      tag: dados.tag || 'timetracker',
      data: { url: dados.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || '/';

  // Se o app já está aberto, traz ele para a frente em vez de abrir outra janela.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
      for (const janela of janelas) {
        if (janela.url.includes(self.location.origin) && 'focus' in janela) return janela.focus();
      }
      return self.clients.openWindow(destino);
    })
  );
});
