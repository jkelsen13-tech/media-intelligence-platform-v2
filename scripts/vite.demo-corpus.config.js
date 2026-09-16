import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// Explicit separate build target. Never imported by the production entry.
export default defineConfig({ plugins: [react()], server: { host: '127.0.0.1', port: 4179 }, build: { outDir: 'demo-preview-dist', rollupOptions: { input: 'scripts/demo-corpus-preview.html' } } })
