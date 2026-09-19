import { defineConfig } from 'vite'
import { existsSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { demoBrandAsset } from './demoBrandAsset.mjs'
// Explicit separate build target. Never imported by the production entry.
const localPhosphor = fileURLToPath(new URL('../vendor-phosphor/package/dist/index.es.js', import.meta.url))
const demoNoExternalFonts = {
  name: 'demo-no-external-fonts',
  enforce: 'pre',
  transform(code, id) {
    if (!id.replaceAll('\\', '/').endsWith('/src/styles/tokens.css')) return null
    return { code: code.replace(/^@import url\([^\n]+\);\r?\n/m, ''), map: null }
  },
}
export default defineConfig({
  // The private preview is a separate artifact. Do not copy production public
  // assets or expose deployment credentials through Vite's environment loader.
  publicDir: false,
  envPrefix: 'DEMO_PUBLIC_UNUSED_',
  plugins: [demoNoExternalFonts, demoBrandAsset(), react()],
  resolve: { alias: existsSync(localPhosphor) ? { '@phosphor-icons/react': localPhosphor } : {} },
  server: { host: '127.0.0.1', port: 4179 },
  build: { outDir: 'demo-preview-dist', rollupOptions: { input: 'scripts/demo-corpus-preview.html' } },
})
