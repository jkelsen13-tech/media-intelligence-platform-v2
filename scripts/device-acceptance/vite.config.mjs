import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {fileURLToPath} from 'node:url'
import {realpathSync} from 'node:fs'
import {viteStaticCopy} from 'vite-plugin-static-copy'
const root=fileURLToPath(new URL('../../',import.meta.url))
const fixture=fileURLToPath(new URL('./fixture.mjs',import.meta.url))
export default defineConfig({root,envDir:fileURLToPath(new URL('./no-environment-files/',import.meta.url)),base:'/media-intelligence-platform-v2/',
  define:{'import.meta.env.VITE_SUPABASE_URL':'undefined','import.meta.env.VITE_SUPABASE_ANON_KEY':'undefined'},
  plugins:[{name:'explicit-device-acceptance-backend-only',enforce:'pre',resolveId(id){if(/(?:^|\/)mipBackend(?:\.js)?$/.test(id))return fixture},
    transformIndexHtml:{order:'pre',handler(html){return html.replace('src="/src/main.jsx"','src="/scripts/device-acceptance/app-entry.jsx"')}}},react(),
    viteStaticCopy({targets:['Workers','ThirdParty','Assets','Widgets'].map(name=>({src:`node_modules/cesium/Build/Cesium/${name}/**/*`,dest:`cesium/${name}`}))})],
  server:{host:'127.0.0.1',port:0,strictPort:true,fs:{allow:[root,realpathSync(new URL('../../node_modules/',import.meta.url))]}},build:{write:false}
})
