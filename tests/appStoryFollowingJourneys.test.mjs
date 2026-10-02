import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { createElement } from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { createClient } from '@supabase/supabase-js'
import { createInvestigationApiHandler, createInvestigationApiTransport } from '../supabase/functions/investigation-api/handler.mjs'
import { createInvestigationBackend } from '../src/lib/investigationBackend.js'
import { createReviewedPublicVersionBackend } from '../src/lib/reviewedPublicVersionBackend.js'
import { normalizePublicStoryContext } from '../src/lib/storyFollowingClient.js'
import { appStoryFollowingJourneyFixture } from './fixtures/appStoryFollowingJourney.mjs'

const require = createRequire(import.meta.url)
const esbuild = createRequire(require.resolve('vite/package.json'))('esbuild')
const out = new URL('./.compiled/App-story-following-journeys.mjs', import.meta.url)
mkdirSync(new URL('./.compiled', import.meta.url), { recursive: true })
await esbuild.build({ absWorkingDir: new URL('..', import.meta.url).pathname, entryPoints: ['src/App.jsx'], outfile: out.pathname,
  bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', external: ['react','react/jsx-runtime'],
  define: { 'import.meta.env': '{"DEV":false,"BASE_URL":"/"}' }, plugins: [{ name: 'controlled-App-surfaces', setup(b) {
    const real = new Set(['NewsView','NewsStoryReader','StoryFollowingControls','StoryFollowingPanel','AccountPanel'])
    b.onResolve({ filter: /\/(views|panels|graph|components)\// }, args => {
      if (args.path.endsWith('.js') || real.has(args.path.split('/').at(-1).replace(/\.jsx$/, ''))) return
      return { path: args.path, namespace: 'probe' }
    })
    b.onResolve({ filter: /\/(mipBackend|usePrivateInvestigationWorkspace)(\.js)?$/ }, args => ({ path: args.path, namespace: 'probe' }))
    b.onResolve({ filter: /\/supabase(\.js)?$/ }, args => {
      if (/\/(auth\.js|App\.jsx)$/.test(args.importer)) return { path: args.path, namespace: 'probe' }
    })
    b.onLoad({ filter: /.*/, namespace: 'probe' }, args => {
      const name = args.path.split('/').at(-1).replace(/\.jsx$/, '')
      if (name.startsWith('mipBackend')) return { contents: 'export const mipBackend=globalThis.__appJourneyBackend' }
      if (name.startsWith('supabase')) return { contents: 'export const supabase=globalThis.__appJourneyAuthClient' }
      if (name.startsWith('usePrivate')) return { contents: 'export const usePrivateInvestigationWorkspace=()=>({status:"unauthenticated",state:{panels:{},bundle:null}})' }
      const stub = `import {createElement} from 'react'; const probe=n=>p=>createElement('probe-'+n,p,p.children); export default probe('${name}');`
      if (name === 'InvestigationWorkspace') return { contents: `import {createElement} from 'react'; export default p=>createElement('probe-InvestigationWorkspace',p,p.searchSlot,p.accountSlot,p.leftNav,p.details,p.children); export const WorkspaceNavButton=p=>createElement('button',p,p.item.label); export const WorkspaceSearch=p=>createElement('probe-WorkspaceSearch',p); export const WorkspaceAccountButton=p=>createElement('probe-Account',p); export const WorkspaceInfoButton=p=>createElement('probe-Info',p);` }
      if (name === 'PrivateInvestigationWorkspace') return { contents: stub + `export const PrivateInvestigationInspector=probe('PrivateInvestigationInspector');` }
      return { contents: stub }
    })
    b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }))
  } }] })

const text = n => n == null ? '' : Array.isArray(n) ? n.map(text).join('') : typeof n === 'object' ? text(n.children ?? n.props?.children) : String(n)
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const settle = async () => { for (let i=0;i<4;i++) await tick() }

test('production App/account/Story/Following journeys preserve display ownership across route and auth events', async t => {
  const f = await appStoryFollowingJourneyFixture(); t.after(() => f.db.close())
  let actor = f.viewer, session = null, initialSession, held = null, holdAction = null, holdPublicVersion = null
  let signOutCalls = 0, tree, v2, v3
  const authListeners = new Set(), browserCalls = [], serverCalls = [], storage = new Map(), listeners = new Map()
  const makeSession = (id, expiry = Date.now()/1000+3600) => ({ user: { id, email: id===f.viewer?'account-a@example.invalid':'account-b@example.invalid' }, expires_at: expiry })
  const emit = (id, expiry) => { actor=id; session=id ? makeSession(id,expiry) : null; for (const fn of authListeners) fn(id?'SIGNED_IN':'SIGNED_OUT',session) }
  globalThis.__appJourneyAuthClient = {
    auth: {
      getSession: () => new Promise(resolve => { initialSession=resolve }),
      onAuthStateChange: fn => { authListeners.add(fn); return { data: { subscription: { unsubscribe: () => authListeners.delete(fn) } } } },
      signOut: async () => { signOutCalls++; emit(null); return { error:null } },
      signInWithOtp: () => { throw new Error('No hosted sign-in or account creation is permitted') },
    },
    from: table => ({ select() { return this }, eq(key,value) { this.value=value; return this }, async maybeSingle() {
      assert.ok(['pipeline_config','mip_profiles'].includes(table))
      return { data: table==='pipeline_config' ? { value:true } : { id:this.value,display_name:this.value===f.viewer?'Account A':'Account B' },error:null }
    } }),
  }
  const response = data => new Response(JSON.stringify(data), { headers:{'content-type':'application/json'} })
  const transport = createInvestigationApiTransport({ url:'https://qikvmopbtijoebdqosyq.supabase.co', anonKey:'sb_publishable_fixture',serviceKey:'sb_secret_fixture',fetchImpl:async (url,init) => {
    const request=new Request(url,init), path=new URL(url).pathname
    if (path==='/auth/v1/user') {
      const id=request.headers.get('authorization')?.slice(7)
      return id ? response({ id }) : new Response('{}',{status:401})
    }
    assert.equal(path,'/rest/v1/rpc/mip_public_story_following_v1')
    assert.equal(request.headers.has('authorization'),false)
    const body=await request.json(); serverCalls.push(body)
    try { return response(await f.following(body.p_action,body.p_input)) }
    catch(e) { return new Response(JSON.stringify({code:e.code,message:'private SQL error withheld'}),{status:400,headers:{'content-type':'application/json'}}) }
  } })
  const gateway=createInvestigationApiHandler(transport)
  const client=createClient('https://qikvmopbtijoebdqosyq.supabase.co','sb_publishable_fixture',{
    accessToken:async()=>actor, global:{fetch:async(url,init)=>{
      const request=new Request(url,init), path=new URL(url).pathname, body=await request.clone().json()
      browserCalls.push({path,body,actor:request.headers.get('authorization')?.slice(7),expected:request.headers.get('x-mip-expected-user')})
      let result
      if(path.startsWith('/rest/v1/rpc/')) result=response(await f.publicRpc(path.split('/').at(-1),body))
      else {
        assert.equal(path,'/functions/v1/investigation-api/story-following')
        result=await gateway(request); assert.equal(result.headers.get('cache-control'),'private, no-store')
      }
      if((holdAction && holdAction===body.action) || (holdPublicVersion && holdPublicVersion===body.p_public_version_id)) {
        holdAction=null; holdPublicVersion=null
        await new Promise(resolve=>{ held=()=>{held=null;resolve()} })
      }
      return result
    }},
  })
  const following=createInvestigationBackend(client).storyFollowing, reviewed=createReviewedPublicVersionBackend(client)
  const emptyMap=async()=>new Map()
  const news={loadStoryStateContext:following.loadStoryContext,loadStoryDirectory:reviewed.loadStoryDirectory,
    loadArticles:async()=>({articles:[],total:0}),loadOutletDirectory:async()=>[],loadFilteredSourceMetricRows:async()=>[],
    loadArticleCitationMap:emptyMap,loadEventGrouping:emptyMap,loadOutletRegions:emptyMap,loadCorpusMeta:async()=>null,loadNewSinceCount:async()=>0}
  const nodes=[{id:'event-a',type:'event',label:'Investigation A'}, {id:'entity-a',type:'actor',label:'Inspector A'},
    {id:f.graph_node_id,type:'event',label:'Synthetic canonical vessel subject'}]
  globalThis.__appJourneyBackend={investigations:{storyFollowing:following},publicData:{news,
    loadGraph:async()=>({nodes,edges:[{id:'edge-a',source:'event-a',target:'entity-a',reliability:3}],source:'fixture'}),
    loadCorpusMeta:async()=>null,loadGraphCoverage:async()=>null,loadNodeLocations:async()=>[],loadTopics:async()=>null,
    loadInvestigationSurface:async()=>null,curated:{loadPhase3BetaFlag:async()=>false}}}
  const retainedRange='2026-09-30T12:00:00.123456Z..2026-10-01T12:00:00.123456Z'
  const location={hash:`#/event/event-a/graph?entity=entity-a&time=${encodeURIComponent(retainedRange)}`,pathname:'/',search:'',href:'https://example.invalid/'}
  const localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}
  globalThis.window={location,localStorage,matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),
    addEventListener:(type,fn)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn)},
    removeEventListener:(type,fn)=>listeners.get(type)?.delete(fn),history:{replaceState(_state,_title,url){location.hash=url.includes('#')?url.slice(url.indexOf('#')):''}}}
  globalThis.document={activeElement:null}
  const {default:App}=await import(out.href)
  const probe=name=>tree.root.findByType('probe-'+name), ic=()=>probe('InvestigationWorkspace').props.investigationContext
  const shown=()=>text(tree.toJSON()), button=label=>tree.root.findAllByType('button').find(b=>text(b.props.children)===label)
  const click=async label=>{const b=button(label);assert.ok(b,label);await act(async()=>{await b.props.onClick();await settle()})}
  const hash=async value=>{await act(async()=>{location.hash=value;for(const fn of listeners.get('hashchange')??[])fn();await settle()})}
  const view=async key=>{await act(async()=>{probe('InvestigationWorkspace').props.onChangeView(key);await settle()})}
  const storyRoute=v=>`#/story/${v.story_id}?version=${v.public_version_id}`
  const waitHeld=async()=>{for(let i=0;i<20&&!held;i++)await act(async()=>tick());assert.ok(held,'controlled response reached hold')}
  t.after(async()=>{held?.();if(tree)await act(async()=>tree.unmount());assert.equal(authListeners.size,0)})
  await act(async()=>{tree=TestRenderer.create(createElement(App));await settle()})

  await t.test('auth event wins slow initial session; historical Story displays reviewed source and preserves Inspector/time',async()=>{
    await act(async()=>{emit(f.viewer);initialSession({data:{session:makeSession(f.secondUser)},error:null});await settle()})
    assert.equal(probe('ArticlePanel').props.node.id,'entity-a')
    const prior={...ic()}
    assert.equal(prior.as_of_time,'2026-09-30T12:00:00.123456Z')
    assert.deepEqual(prior.selected_time_range,{from:'2026-09-30T12:00:00.123456Z',to:'2026-10-01T12:00:00.123456Z'})
    await hash(storyRoute(f.v1))
    assert.match(shown(),/Recorded vessel source report/);assert.match(shown(),/not following/)
    assert.equal(ic().canonical_subject_id,prior.canonical_subject_id)
    assert.equal(ic().as_of_time,prior.as_of_time)
    assert.equal(browserCalls.filter(c=>c.body.action==='read').at(-1).expected,f.viewer)
    await click('Follow story')
    assert.equal((await f.following('read',{user_id:f.viewer,story_id:f.v1.story_id})).subscription.acknowledged_public_version_id,f.v1.public_version_id)
  })
  await t.test('historical acknowledgement is bound to displayed version while head has later material change',async()=>{
    v2=await f.append([f.firstVersion,f.secondVersion],f.v1);await f.declare(v2,f.v1,f.secondVersion)
    const third=await f.ingest({...f.article,url:'https://example.invalid/third',title:'Synthetic third source',outlet:'Synthetic source C'})
    await f.db.query("update public.articles set reader_state='eligible' where id=$1",[third.article_id])
    await f.db.query("insert into public.citations(article_id,cited_entity,cited_type,documentation_strength,resolved_node_id) values($1,'Synthetic vessel','event',1,$2)",[third.article_id,f.graph_node_id])
    const thirdVersion=await f.bindArticle(third,{kind:'source_report',claims:[]})
    v3=await f.append([f.firstVersion,f.secondVersion,thirdVersion],v2);await f.declare(v3,v2,thirdVersion)
    await hash(storyRoute(v2));assert.match(shown(),/2 unread material updates/)
    assert.ok(normalizePublicStoryContext((await following.loadStoryContext(v2.story_id,{publicVersionId:v2.public_version_id})).data))
    await click('Acknowledge displayed story version')
    assert.equal(browserCalls.filter(c=>c.body.action==='acknowledge').at(-1).body.input.public_version_id,v2.public_version_id)
    assert.equal((await f.following('read',{user_id:f.viewer,story_id:v2.story_id})).subscription.acknowledged_public_version_id,v2.public_version_id)
    assert.match(shown(),/1 unread material update/);assert.equal(location.hash,storyRoute(v2))
  })
  await t.test('World and Inspector return retain exact Story version and independent canonical context',async()=>{
    const prior={id:ic().canonical_subject_id,at:ic().as_of_time,range:ic().selected_time_range}
    await view('world');assert.equal(probe('WorldView').props.investigationContext.canonical_subject_id,prior.id)
    await view('news');assert.equal(location.hash,storyRoute(v2));assert.match(shown(),new RegExp(v2.public_version_id))
    await view('graph');assert.equal(probe('ArticlePanel').props.node.id,'entity-a')
    await act(async()=>{probe('ArticlePanel').props.onClose();await settle()})
    assert.equal(tree.root.findAllByType('probe-ArticlePanel').length,0)
    await view('news');assert.equal(location.hash,storyRoute(v2))
    await view('graph');assert.equal(tree.root.findAllByType('probe-ArticlePanel').length,0)
    await view('news');assert.equal(location.hash,storyRoute(v2))
    await click('Back to news');assert.doesNotMatch(location.hash,/\/story\//)
    assert.deepEqual({id:ic().canonical_subject_id,at:ic().as_of_time,range:ic().selected_time_range},prior)
    await click('Following');assert.match(shown(),/1 unread material update/)
    const open=tree.root.findAllByType('button').find(b=>text(b.props.children).startsWith('Open '));assert.ok(open)
    await act(async()=>{open.props.onClick();await settle()});assert.equal(location.hash,storyRoute(v3))
    assert.match(shown(),new RegExp(v3.public_version_id))
  })
  await t.test('native Following list drops an old actor response after App account changes',async()=>{
    await click('Back to news')
    holdAction='list';let pending
    act(()=>{pending=button('Reload followed stories').props.onClick()});await waitHeld()
    act(()=>emit(f.secondUser))
    assert.doesNotMatch(shown(),/1 unread material update|Recorded vessel source report/,'previous account payload is withheld on the account-change render')
    await act(async()=>settle())
    assert.match(shown(),/No followed stories for this account/)
    await act(async()=>{held();await pending;await settle()})
    assert.match(shown(),/No followed stories for this account/)
    assert.doesNotMatch(shown(),/1 unread material update|Recorded vessel source report/)
    await act(async()=>{emit(f.viewer);await settle()})
    assert.match(shown(),/1 unread material update/)
    const open=tree.root.findAllByType('button').find(b=>text(b.props.children).startsWith('Open '))
    await act(async()=>{open.props.onClick();await settle()});assert.equal(location.hash,storyRoute(v3))
  })
  await t.test('late mutation cannot paint account A into B; actual account sheet logout clears private state',async()=>{
    holdAction='unsubscribe';let pending
    act(()=>{pending=button('Unfollow story').props.onClick()});await waitHeld()
    act(()=>emit(f.secondUser))
    assert.doesNotMatch(shown(),/1 unread|Following this story/,'old actor state is withheld before the new private read completes')
    await act(async()=>settle())
    assert.match(shown(),/not following/);assert.doesNotMatch(shown(),/1 unread|Following this story/)
    await act(async()=>{held();await pending;await settle()});assert.match(shown(),/not following/)
    await act(async()=>{probe('Account').props.onClick();await settle();initialSession({data:{session},error:null});await settle()})
    assert.match(shown(),/Account B/);await click('Log out');assert.equal(signOutCalls,1)
    assert.match(shown(),/Sign in to follow/);assert.doesNotMatch(shown(),/unread material update|Account B/)
    const dialog=tree.root.findByProps({role:'dialog','aria-label':'Account'})
    await act(async()=>{dialog.findByProps({'aria-label':'Close'}).props.onClick();await settle()})
  })
  await t.test('late personal read is dropped through logout and same-account re-entry; expiry removes actions',async()=>{
    await act(async()=>{emit(f.viewer);await settle()});await click('Follow story')
    holdAction='read';let pending;act(()=>{pending=button('Reload story Following').props.onClick()});await waitHeld()
    await act(async()=>{emit(null);await settle()});assert.match(shown(),/Sign in to follow/)
    const saved=(await f.following('read',{user_id:f.viewer,story_id:v3.story_id})).subscription
    await f.following('unsubscribe',{user_id:f.viewer,story_id:v3.story_id,event_id:globalThis.crypto.randomUUID(),previous_event_id:saved.current_event_id})
    await act(async()=>{emit(f.viewer);await settle()})
    assert.match(shown(),/You unfollowed this story/)
    await act(async()=>{held();await pending;await settle()});assert.match(shown(),/You unfollowed this story/)
    assert.doesNotMatch(shown(),/Following this story/)
    await click('Follow story')
    await act(async()=>{emit(f.viewer,Date.now()/1000+0.06);await new Promise(resolve=>setTimeout(resolve,90));await settle()})
    assert.match(shown(),/Sign in to follow/);assert.equal(button('Unfollow story'),undefined)
  })
  await t.test('stale public-version response cannot replace selected historical Story or its acknowledge target',async()=>{
    await act(async()=>{emit(f.viewer);await settle()})
    holdPublicVersion=f.v1.public_version_id
    await hash(storyRoute(f.v1));await waitHeld()
    assert.equal(button('Acknowledge displayed story version'),undefined)
    await hash(storyRoute(v2));assert.match(shown(),new RegExp(v2.public_version_id))
    await act(async()=>{held();await settle()});assert.match(shown(),new RegExp(v2.public_version_id))
    const before=serverCalls.length;actor=f.secondUser
    await click('Unfollow story');assert.equal(serverCalls.length,before);assert.match(shown(),/session has ended/)
    assert.match(shown(),/Recorded vessel source report/,'an authentication refusal clears personal state, while the admitted public version remains readable')
    await act(async()=>{emit(f.viewer);await settle()});await click('Reload story Following')
    const foreign='00000000-0000-4000-8000-000000009999'
    await hash(`#/story/${v2.story_id}?version=${foreign}`)
    assert.doesNotMatch(shown(),/Recorded vessel source report|Acknowledge displayed/)
    await hash(storyRoute(v2));await click('Investigate in graph')
    assert.equal(ic().canonical_subject_id,f.graph_node_id);assert.equal(probe('ArticlePanel').props.node.id,f.graph_node_id)
    await view('news');assert.equal(location.hash,storyRoute(v2))
    for(const value of storage.values())assert.doesNotMatch(value,new RegExp(`${f.viewer}|${f.secondUser}|${v2.story_id}|${v2.public_version_id}`))
  })
  await t.test('private head revocation cannot block an independently authorized historical public Story',async()=>{
    const headOnlySource=v3.members.at(-1).article_id
    try {
      await f.db.query("update public.articles set source_status='withdrawn' where id=$1",[headOnlySource])
      await click('Reload story Following')
      assert.doesNotMatch(shown(),/unread material update/)
      const admitted=await following.loadStoryContext(v2.story_id,{publicVersionId:v2.public_version_id})
      assert.equal(admitted.error,null,'historical exact members still pass the canonical public predicate')
      if(button('Reload reviewed story'))await click('Reload reviewed story')
      assert.match(shown(),/Recorded vessel source report/,'a private revoked preference does not override independently authorized public history')
      assert.match(shown(),/revoked/);assert.equal(button('Acknowledge displayed story version'),undefined)
    } finally {
      await f.db.query("update public.articles set source_status='active' where id=$1",[headOnlySource])
      await hash(`#/story/${v2.story_id}?version=00000000-0000-4000-8000-000000009999`)
      await hash(storyRoute(v2));assert.match(shown(),/revoked/)
      await click('Follow story')
    }
  })
  await t.test('confirmed withdrawal clears private updates and the withdrawn displayed source from the reader',async()=>{
    assert.match(shown(),/Recorded vessel source report/)
    await f.db.query("update public.articles set source_status='withdrawn' where id=$1",[f.first.article_id])
    await click('Reload story Following')
    assert.doesNotMatch(shown(),/Recorded vessel source report|A source reports a vessel arrival|Acknowledge displayed|unread material update/)
    assert.match(shown(),/unavailable|revoked/)
  })
})
