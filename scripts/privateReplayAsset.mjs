import { existsSync, readFileSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
export const privateReplayHeaders = [
  { key:'Cache-Control', value:'private, no-store, max-age=0' },
  { key:'X-Robots-Tag', value:'noindex, nofollow, noarchive' },
  { key:'Content-Security-Policy', value:"default-src 'none'; frame-ancestors 'none'" },
]
// Only the explicit demo build can copy this untracked file. Production has no hook.
export function privateReplayAsset() {
  let root, out
  return { name:'private-replay-artifact', configResolved(config) { root=config.root; out=resolve(root,config.build.outDir) },
    configurePreviewServer(server) { server.middlewares.use((req,res,next)=>{if(req.url?.startsWith('/private/'))for(const h of privateReplayHeaders)res.setHeader(h.key,h.value);next()}) },
    configureServer(server) { server.middlewares.use('/private/native-replay.json',(req,res) => { const path=resolve(root,'.private-demo/native-replay.json'); for(const h of privateReplayHeaders) res.setHeader(h.key,h.value); if(!existsSync(path)){res.statusCode=404;res.end();return} res.setHeader('Content-Type','application/json');res.end(readFileSync(path)) }) },
    closeBundle() {
      const path=resolve(root,'.private-demo/native-replay.json')
      if(existsSync(path)&&process.env.VERCEL_ENV==='production')throw new Error('Private replay artifacts are forbidden in Production builds.')
      if(existsSync(path)) { mkdirSync(resolve(out,'private'),{recursive:true});copyFileSync(path,resolve(out,'private/native-replay.json')) }
      // Output-local host configuration travels with the protected Preview artifact.
      writeFileSync(resolve(out,'vercel.json'),JSON.stringify({headers:[{source:'/private/(.*)',headers:privateReplayHeaders},{source:'/(.*)',headers:[{key:'Cache-Control',value:'private, no-store, max-age=0'},{key:'Content-Security-Policy',value:"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"}]}]},null,2))
    },
  }
}
