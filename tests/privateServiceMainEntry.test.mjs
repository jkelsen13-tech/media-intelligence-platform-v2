import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const esbuild=createRequire(require.resolve('vite/package.json'))('esbuild')
const origin='https://qikvmopbtijoebdqosyq.supabase.co'
const h=origin+'/functions/v1/synthetic-hypothesis',m=origin+'/functions/v1/synthetic-markets'
const policy={hypothesisEndpoint:[h],privateMarketsEndpoint:[m]}
const closed={hypothesisEndpoint:null,privateMarketsEndpoint:null}
let sequence=0
async function boot(env,approved,poisonIncludes=false){
 const key='__mip_entry_test_'+(++sequence)
 // Actual main.jsx and resolver. Only React/DOM/App/theme/CSS are inert adapters.
 // Approved destinations are injected only into this in-memory test build.
 const plugins=[{name:'normal-entry-isolation',setup(build){
  build.onResolve({filter:/^(react|react-dom\/client)$|^\.\/App$|themeFlag$|privateServiceEndpointPolicy\.js$/},args=>{
   if(args.path.endsWith('privateServiceEndpointPolicy.js')&&approved===undefined)return
   return {path:args.path,namespace:'entry-test'}
  })
  build.onLoad({filter:/.*/,namespace:'entry-test'},args=>{
   if(args.path==='react')return{contents:"export default {StrictMode:'strict',createElement:(type,props,...children)=>({type,props,children})}"}
   if(args.path==='react-dom/client')return{contents:'export default {createRoot:()=>({render:tree=>{globalThis['+JSON.stringify(key)+']=tree.children[0].props}})}'}
   if(args.path==='./App')return{contents:'export default function App(){}'}
   if(args.path.endsWith('themeFlag'))return{contents:'export const applyThemeFlag=()=>Promise.resolve()'}
   return{contents:'export const PRIVATE_SERVICE_ENDPOINT_POLICY='+JSON.stringify(approved)}
  })
 }}]
 const result=await esbuild.build({entryPoints:['src/main.jsx'],bundle:true,write:false,format:'esm',
  platform:'node',jsx:'transform',loader:{'.css':'empty'},define:{'import.meta.env':JSON.stringify(env)},plugins})
 const oldDocument=globalThis.document
 const originalIncludes=Object.getOwnPropertyDescriptor(Array.prototype,'includes')
 try{
  globalThis.document={getElementById:id=>{assert.equal(id,'root');return {}}}
  // Poison inside the bundled main module, after build/import setup. Restore
  // before assertions so Node/esbuild infrastructure never runs under this patch.
  const poison=poisonIncludes?"Object.defineProperty(Array.prototype,'includes',{configurable:true,writable:true,value:()=>true});\n":""
  await import('data:text/javascript;base64,'+Buffer.from(poison+result.outputFiles[0].text+'\n// '+key).toString('base64'))
  await Promise.resolve()
  return globalThis[key]
 }finally{Object.defineProperty(Array.prototype,'includes',originalIncludes);globalThis.document=oldDocument;delete globalThis[key]}
}
test('normal main entry supplies null endpoints when absent or not production approved',async()=>{
 assert.deepEqual(await boot({}),closed)
 assert.deepEqual(await boot({VITE_HYPOTHESIS_ENDPOINT:h,VITE_PRIVATE_MARKETS_ENDPOINT:m}),closed)
})
test('normal main entry passes only exact approved settings, with invalid service independently closed',async()=>{
 assert.deepEqual(await boot({VITE_HYPOTHESIS_ENDPOINT:h,VITE_PRIVATE_MARKETS_ENDPOINT:m},policy),
  {hypothesisEndpoint:h,privateMarketsEndpoint:m})
 assert.deepEqual(await boot({VITE_HYPOTHESIS_ENDPOINT:h+'?x=1',VITE_PRIVATE_MARKETS_ENDPOINT:m},policy),
  {hypothesisEndpoint:null,privateMarketsEndpoint:m})
})

test('normal production entry remains closed under runtime includes poisoning',async()=>{
 assert.deepEqual(await boot({VITE_HYPOTHESIS_ENDPOINT:h,VITE_PRIVATE_MARKETS_ENDPOINT:m},undefined,true),closed)
})
test('normal entry rejects bare URL delimiters even in synthetic approved policy',async()=>{
 for(const suffix of ['?','#']){
  const hRaw=h+suffix,mRaw=m+suffix
  assert.deepEqual(await boot({VITE_HYPOTHESIS_ENDPOINT:hRaw,VITE_PRIVATE_MARKETS_ENDPOINT:mRaw},
   {hypothesisEndpoint:[hRaw],privateMarketsEndpoint:[mRaw]}),closed)
 }
})
