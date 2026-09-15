// Synthetic provider ordering only. No provider network, real session or production credentials.
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdirSync,readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createElement} from 'react'
import TestRenderer,{act} from 'react-test-renderer'
import {useHypothesisSessionClient} from '../src/lib/useHypothesisSessionClient.js'
const root=fileURLToPath(new URL('../',import.meta.url)),directory=root+'tests/.compiled'
mkdirSync(directory,{recursive:true})
const require=createRequire(import.meta.url),esbuild=createRequire(require.resolve('vite/package.json'))('esbuild')
const stub=`export const supabase={auth:{
 getSession:()=>globalThis.__mipSyntheticAuthProvider.getSession(),
 onAuthStateChange:callback=>({data:{subscription:{unsubscribe:globalThis.__mipSyntheticAuthProvider.subscribe(s=>callback('SYNTHETIC',s))}}})
}}`
const plugins=[{name:'synthetic-auth-provider',setup(build){
 build.onResolve({filter:/^\.\/supabase\.js$/},()=>({path:'synthetic-provider',namespace:'fixture'}))
 build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:stub,loader:'js'}))
}}]
const options={absWorkingDir:root,bundle:true,format:'esm',platform:'node',external:['react'],plugins}
// Exact prior hook from candidate7c6ce6a, retained only as a negative counterexample.
const priorHook="export function useAuthSession() {\n  const [session, setSession] = useState(null)\n  const [loading, setLoading] = useState(true)\n  useEffect(() => {\n    let active = true\n    getSession().then((s) => {\n      if (!active) return\n      setSession(s)\n      setLoading(false)\n    })\n    const unsub = onAuthChange((s) => setSession(s))\n    return () => {\n      active = false\n      unsub()\n    }\n  }, [])\n  return { session, user: session?.user ?? null, loading }\n}\n\n"
const source=readFileSync(root+'src/lib/auth.js','utf8')
const start=source.indexOf('export function useAuthSession()'),end=source.indexOf('/** Own profile',start)
assert.ok(start>=0&&end>start)
await esbuild.build({...options,entryPoints:['src/lib/auth.js'],outfile:directory+'/AuthCurrent.mjs'})
await esbuild.build({...options,stdin:{contents:source.slice(0,start)+priorHook+source.slice(end),
 resolveDir:root+'src/lib',sourcefile:'synthetic-auth-baseline.js',loader:'js'},outfile:directory+'/AuthPrior.mjs'})
const current=(await import(pathToFileURL(directory+'/AuthCurrent.mjs'))).useAuthSession
const prior=(await import(pathToFileURL(directory+'/AuthPrior.mjs'))).useAuthSession
const session=id=>({user:{id},access_token:'synthetic-'+id,expires_at:Math.floor(Date.now()/1000)+3600})
function provider(initialEvent){
 let resolve,reject,callback,unsubscribed=0
 const pending=new Promise((a,b)=>{resolve=a;reject=b})
 globalThis.__mipSyntheticAuthProvider={getSession:()=>pending,subscribe:cb=>{
  callback=cb;if(initialEvent!==undefined)cb(initialEvent);return()=>{unsubscribed++}
 }}
 return{resolve:s=>resolve({data:{session:s}}),reject,emit:s=>callback(s),unsubscribed:()=>unsubscribed}
}
let state,client,renders
function Harness({hook,connected=false}){
 state=hook();renders++
 const bound=useHypothesisSessionClient({endpoint:connected?'https://synthetic.invalid/hypothesis':null,auth:state,active:connected})
 client=bound
 return null
}
async function mount(hook=current,connected=false){let tree;renders=0;await act(async()=>{tree=TestRenderer.create(createElement(Harness,{hook,connected}))});return tree}
test('preserved prior hook counterexample: stale lookup restores account after logout',async()=>{
 const p=provider();let tree
 try{tree=await mount(prior);await act(async()=>p.emit(null));assert.equal(state.session,null)
  await act(async()=>p.resolve(session('old')));assert.equal(state.user.id,'old')
 }finally{act(()=>tree?.unmount())}
})
test('newer logout wins over old initial lookup and loading settles on the event',async()=>{
 const p=provider();let tree
 try{tree=await mount();assert.equal(state.loading,true)
  await act(async()=>p.emit(null));assert.equal(state.loading,false);assert.equal(state.user,null)
  await act(async()=>p.resolve(session('old')));assert.equal(state.user,null);assert.equal(state.loading,false)
 }finally{act(()=>tree?.unmount())}
})
test('account change survives old initial lookup and later events remain current',async()=>{
 const p=provider();let tree
 try{tree=await mount();await act(async()=>p.emit(session('new')))
  await act(async()=>p.resolve(session('old')));assert.equal(state.user.id,'new')
  await act(async()=>p.emit(session('newer')));assert.equal(state.user.id,'newer')
  await act(async()=>p.emit(null));assert.equal(state.user,null)
 }finally{act(()=>tree?.unmount())}
})
test('initial lookup still loads when no provider event has occurred',async()=>{
 const p=provider();let tree
 try{tree=await mount();await act(async()=>p.resolve(session('initial')))
  assert.equal(state.user.id,'initial');assert.equal(state.loading,false)
 }finally{act(()=>tree?.unmount())}
})
test('failed lookup settles closed without overwriting a later provider event',async()=>{
 for(const event of [false,true]){
  const p=provider();let tree
  try{tree=await mount();if(event)await act(async()=>p.emit(session('new')))
   await act(async()=>p.reject(Error('synthetic lookup failure')))
   assert.equal(state.user?.id??null,event?'new':null);assert.equal(state.loading,false)
  }finally{act(()=>tree?.unmount())}
 }
})
test('synchronous subscription event outranks initial lookup',async()=>{
 const p=provider(session('event'));let tree
 try{tree=await mount();assert.equal(state.user.id,'event');assert.equal(state.loading,false)
  await act(async()=>p.resolve(session('old')));assert.equal(state.user.id,'event')
 }finally{act(()=>tree?.unmount())}
})
test('unmount unsubscribes and late lookup/provider callbacks cannot update the hook',async()=>{
 const p=provider();const tree=await mount()
 act(()=>tree.unmount());const count=renders
 await act(async()=>{p.emit(session('late'));p.resolve(session('older'))})
 assert.equal(p.unsubscribed(),1);assert.equal(renders,count);assert.equal(state.user,null)
})
test('real session seam stays retired after logout even when initial lookup later returns credentials',async()=>{
 const p=provider(),original=globalThis.fetch;let tree,calls=0
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({data:{synthetic:true}}),{headers:{'content-type':'application/json'}})}
 try{
  tree=await mount(current,true)
  await act(async()=>p.emit(session('current')));const old=client;assert.ok(old)
  await old.history('synthetic-investigation');assert.equal(calls,1)
  await act(async()=>p.emit(null));assert.equal(client,null)
  await act(async()=>p.resolve(session('current')));assert.equal(client,null);assert.equal(state.user,null)
  assert.equal((await old.history('synthetic-investigation')).error.code,'authentication_required');assert.equal(calls,1)
 }finally{act(()=>tree?.unmount());globalThis.fetch=original}
})
