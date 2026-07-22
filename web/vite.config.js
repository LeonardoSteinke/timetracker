var _a;
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
/**
 * Identidade do build. Vai embutida no bundle (`__BUILD_ID__`) e também num
 * `version.json` servido pelo backend em /api/version — o app compara os dois
 * e, se divergirem, limpa o cache do service worker e recarrega (ver
 * `src/version.ts`). Sem isso, o PWA instalado no iOS pode servir um bundle
 * antigo indefinidamente.
 */
// `globalThis.process` em vez de `process`: evita depender de @types/node aqui.
var env = (_a = globalThis.process) === null || _a === void 0 ? void 0 : _a.env;
var BUILD_ID = (env === null || env === void 0 ? void 0 : env.BUILD_ID) || new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
/** Emite `dist/version.json` com o mesmo id embutido no bundle. */
function versionFile() {
    return {
        name: 'timetracker-version-file',
        apply: 'build',
        generateBundle: function () {
            this.emitFile({
                type: 'asset',
                fileName: 'version.json',
                source: JSON.stringify({ build: BUILD_ID }),
            });
        },
    };
}
export default defineConfig({
    define: {
        __BUILD_ID__: JSON.stringify(BUILD_ID),
    },
    plugins: [
        react(),
        versionFile(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['apple-touch-icon.png', 'favicon-32.png'],
            manifest: {
                name: 'TimeTracker — Banco de Horas',
                short_name: 'TimeTracker',
                description: 'Registro de ponto e banco de horas',
                theme_color: '#4f46e5',
                background_color: '#4f46e5',
                display: 'standalone',
                orientation: 'portrait',
                start_url: '/',
                scope: '/',
                icons: [
                    { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
                    { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
                    { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                ],
            },
            workbox: {
                // O SW novo assume o controle imediatamente, sem esperar as abas fecharem.
                skipWaiting: true,
                clientsClaim: true,
                cleanupOutdatedCaches: true,
                navigateFallbackDenylist: [/^\/api/],
                // version.json nunca pode vir do precache — é o sinal de "há build novo".
                globIgnores: ['**/version.json'],
                runtimeCaching: [
                    {
                        urlPattern: function (_a) {
                            var url = _a.url;
                            return url.pathname.startsWith('/api/');
                        },
                        handler: 'NetworkOnly',
                    },
                ],
            },
        }),
    ],
    server: {
        host: true,
        proxy: {
            '/api': 'http://localhost:3000',
        },
    },
});
