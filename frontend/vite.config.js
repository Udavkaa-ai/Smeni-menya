import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// A unique tag baked into the bundle on every build. Used by main.jsx to
// detect stale client caches — when this changes, all clients self-wipe
// on next page load.
//   - Railway/CI sets VITE_BUILD_ID automatically per build (or you can
//     override). Local dev gets a fresh timestamp on each `vite` start.
const APP_DATA_VERSION =
  process.env.VITE_BUILD_ID ||
  process.env.RAILWAY_DEPLOYMENT_ID ||
  process.env.RAILWAY_GIT_COMMIT_SHA ||
  new Date().toISOString();

export default defineConfig({
  define: {
    __APP_DATA_VERSION__: JSON.stringify(APP_DATA_VERSION),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Сменимся',
        short_name: 'Сменимся',
        description: 'График дежурств для Светы и Марии',
        theme_color: '#B19CE9',
        background_color: '#F5F1FB',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'ru',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectRegister: 'auto',
      devOptions: { enabled: false }
    })
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/ws': { target: 'ws://localhost:8080', ws: true }
    }
  }
});
