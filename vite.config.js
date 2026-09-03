import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/media-intelligence-platform-v2/',
  build: {
    rollupOptions: {
      output: {
        // Keep MapLibre + deck.gl + luma.gl in one chunk so the WebGL
        // adapter is not split across circular re-exports.
        manualChunks(id) {
          if (
            id.includes('maplibre-gl') ||
            id.includes('@deck.gl') ||
            id.includes('@luma.gl') ||
            id.includes('@math.gl') ||
            id.includes('@loaders.gl') ||
            id.includes('@probe.gl')
          ) {
            return 'map-stack'
          }
          return undefined
        },
      },
    },
  },
})
