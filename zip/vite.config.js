import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
  },
<<<<<<< HEAD
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          if (id.includes('pouchdb')) {
            return 'db-vendor';
          }

          if (id.includes('jspdf')) {
            return 'jspdf-vendor';
          }

          if (id.includes('html2canvas')) {
            return 'html2canvas-vendor';
          }

          if (id.includes('dompurify') || id.includes('purify')) {
            return 'sanitize-vendor';
          }

          if (id.includes('workbox') || id.includes('vite-plugin-pwa')) {
            return 'pwa-vendor';
          }

          return 'vendor';
        },
      },
    },
  },
=======
>>>>>>> 26f2355402417aafd15fbceedae628b2eedadbff
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'The Boscos POS',
        short_name: 'BoscosPOS',
        description: 'Point of Sale system for The Boscos',
        theme_color: '#4CAF50',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: './android-chrome-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: './android-chrome-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: './android-chrome-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      }
    })
  ],
});