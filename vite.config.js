import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Mini Game Scorer',
        short_name: 'Scorer',
        description: 'Youth baseball mini-game scorer',
        theme_color: '#0d1b2e',
        background_color: '#0d1b2e',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /\/config\.json$/,
            handler: 'NetworkFirst',
            options: { cacheName: 'config-cache' },
          },
        ],
      },
    }),
  ],
})
