import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { mapLibreNoticeAssets } from './verifier/mapLibreNoticeAssets.mjs'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// Package boundaries only: application files such as worldViewCesium*.js
// must remain in the ordinary application graph and lazy adapter chunk.
function isCesiumVendorModule(id) {
  return /(?:^|\/)node_modules\/(?:cesium|@cesium\/[^/]+)(?:\/|$)/.test(id.replaceAll('\\', '/'))
}

// Record the final emitted module/dependency graph using public Rollup output
// metadata. This build-only artifact is never imported by the application.
function worldViewBundleGraphPlugin() {
  let base = '/'
  return {
    name: 'mip-world-view-bundle-graph',
    apply: 'build',
    configResolved(config) { base = config.base },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const chunks = Object.values(bundle).filter(output => output.type === 'chunk').map(output => ({
          fileName: output.fileName,
          isEntry: output.isEntry,
          imports: [...output.imports],
          dynamicImports: [...output.dynamicImports],
          containsCesiumVendor: Object.keys(output.modules).some(isCesiumVendorModule),
          containsGlobeAdapter: Object.keys(output.modules).some(id =>
            /(?:^|\/)src\/lib\/worldViewCesiumEllipsoidRendererAdapter\.js(?:\?|$)/.test(id.replaceAll('\\', '/'))),
          moduleCount: Object.keys(output.modules).length,
        }))
        this.emitFile({
          type: 'asset',
          fileName: 'world-view-bundle-graph.json',
          source: JSON.stringify({ version: 1, base, chunks }, null, 2) + '\n',
        })
      },
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    worldViewBundleGraphPlugin(),
    {
      name: 'mip-maplibre-license-notices',
      generateBundle() {
        for (const asset of mapLibreNoticeAssets()) this.emitFile(asset)
      },
    },
    // Copy CesiumJS static assets (Workers + Assets) into the build output
    // so they are served under the GitHub Pages base path.
    // Literal directories also support Chokidar 4, which removed glob
    // watching and the vulnerable braces dependency. The copier preserves
    // each directory name and all nested files under cesium/.
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/cesium/Build/Cesium/Workers',
          dest: 'cesium',
        },
        {
          src: 'node_modules/cesium/Build/Cesium/ThirdParty',
          dest: 'cesium',
        },
        {
          src: 'node_modules/cesium/Build/Cesium/Assets',
          dest: 'cesium',
        },
        {
          src: 'node_modules/cesium/Build/Cesium/Widgets',
          dest: 'cesium',
        },
      ],
    }),
  ],
  base: '/media-intelligence-platform-v2/',
  build: {
    // Preserve Vite 5's transform targets across the toolchain upgrade.
    target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'],
    rollupOptions: {
      output: {
        // Keep shared support dependencies automatic so an eager map import
        // cannot pull the entire lazy Cesium manual chunk into the shell.
        onlyExplicitManualChunks: true,
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
          if (isCesiumVendorModule(id)) {
            return 'cesium-globe'
          }
          return undefined
        },
      },
    },
  },
})
