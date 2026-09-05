import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Isolated layout harness only. Not part of the production Pages build.
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    host: '127.0.0.1',
    port: 5174,
  },
})
