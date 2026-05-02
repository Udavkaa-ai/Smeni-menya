import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Сменимся',
        short_name: 'Сменимся',
        description: 'График дежурств для двоих',
        theme_color: '#4CAF50',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
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
