import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Modo "movil": HTTPS en la red local (la cámara del celular exige contexto seguro)
  // y el backend detrás del proxy de Vite, así el celular solo necesita llegar a este puerto.
  const movil = mode === 'movil';
  const backend = env.BACKEND_URL || 'http://localhost:3000';

  return {
    plugins: [
      vue(),
      tailwindcss(),
      ...(movil ? [basicSsl()] : []),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'Kardex — Estudio Contable',
          short_name: 'Kardex',
          description: 'Inventario y kardex para estudios contables',
          lang: 'es-PE',
          start_url: '/',
          display: 'standalone',
          orientation: 'any',
          theme_color: '#0f766e',
          background_color: '#f8fafc',
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // Solo se guarda en caché la aplicación (HTML/JS/CSS/íconos). Los datos de la API
          // NUNCA se cachean: son privados por usuario y deben estar siempre actualizados.
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          // config.js cambia por entorno: nunca se guarda en la caché del service worker
          globIgnores: ['config.js'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//],
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      port: 5173,
      host: movil ? true : 'localhost',
      proxy: {
        '/api': { target: backend, changeOrigin: true },
        '/socket.io': { target: backend, ws: true, changeOrigin: true },
      },
    },
  };
});
