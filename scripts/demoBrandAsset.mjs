import { readFileSync } from 'node:fs'

// The native shell requests this one asset. Keep publicDir disabled and bundle
// only the required logo, never the rest of the production public directory.
const fileName = 'assets/mip-mobius-logo.png'
const logo = () => readFileSync(new URL('../public/assets/mip-mobius-logo.png', import.meta.url))

export function demoBrandAsset() {
  return {
    name: 'demo-native-brand-asset',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName, source: logo() })
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0] !== `/${fileName}` || !['GET', 'HEAD'].includes(request.method)) return next()
        response.setHeader('Content-Type', 'image/png')
        response.end(request.method === 'HEAD' ? undefined : logo())
      })
    },
  }
}
