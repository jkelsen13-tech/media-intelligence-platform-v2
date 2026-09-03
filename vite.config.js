import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
  plugins: [
    react(),
    // Copy CesiumJS static assets (Workers + Assets) into the build output
    // so they are served under the GitHub Pages base path.
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/cesium/Build/Cesium/Workers/**/*',
          dest: 'cesium/Workers',
        },
        {
          src: 'node_modules/cesium/Build/Cesium/ThirdParty/**/*',
          dest: 'cesium/ThirdParty',
        },
        {
          src: 'node_modules/cesium/Build/Cesium/Assets/**/*',
          dest: 'cesium/Assets',
        },
        {
          src: 'node_modules/cesium/Build/Cesium/Widgets/**/*',
          dest: 'cesium/Widgets',
        },
      ],
    }),
  ],
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
          // Code-split Cesium into its own chunk to avoid bloating initial load.
          if (id.includes('cesium') || id.includes('Cesium')) {
            return 'cesium-globe'
          }
          return undefined
        },
      },
    },
  },
})
