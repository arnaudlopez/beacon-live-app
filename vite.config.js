import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'Beacon Live — Télémétrie Maritime',
        short_name: 'BeaconLive',
        description: 'Tableau de bord maritime en temps réel pour Ajaccio. Vent, houle, température.',
        theme_color: '#0a1628',
        background_color: '#0a1628',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  server: {
    allowedHosts: true,
    proxy: {
      '/api/infoclimat': {
        target: 'https://www.infoclimat.fr/opendata',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/infoclimat/, '')
      }
    }
  }
})
