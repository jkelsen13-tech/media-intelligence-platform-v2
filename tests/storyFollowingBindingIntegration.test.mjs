import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { createClient } from '@supabase/supabase-js'
import { storyFollowingFixture } from './storyFollowingFixture.mjs'
import { createInvestigationApiHandler, createInvestigationApiTransport } from '../supabase/functions/investigation-api/handler.mjs'
import { createInvestigationBackend } from '../src/lib/investigationBackend.js'
import { createStoryFollowingBackend, normalizePublicStoryContext, isPublicStoryMaterialChange } from '../src/lib/storyFollowingClient.js'

const root = fileURLToPath(new URL('../', import.meta.url)), require = createRequire(import.meta.url)
const esbuild = createRequire(require.resolve('vite/package.json'))('esbuild')
await mkdir(root+'tests/.compiled', { recursive: true })
for (const name of ['StoryFollowingControls','StoryFollowingPanel']) await esbuild.build({ absWorkingDir: root,
  entryPoints: [`src/components/${name}.jsx`], outfile: `${root}tests/.compiled/${name}.mjs`, bundle: true,
  platform: 'node', format: 'esm', jsx: 'automatic', external: ['react','react/jsx-runtime','react-dom'],
  plugins: [{ name: 'css', setup(b) { b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' })) } }] })
const { default: Controls } = await import(pathToFileURL(root+'tests/.compiled/StoryFollowingControls.mjs'))
const { default: Panel } = await import(pathToFileURL(root+'tests/.compiled/StoryFollowingPanel.mjs'))
const text = n => n == null ? '' : Array.isArray(n) ? n.map(text).join('') : typeof n === 'object' ? text(n.children ?? n.props?.children) : String(n)
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

test('native public Story controls and Following list traverse actual SQL, verified gateway and installed SDK', async t => {
  const f = await storyFollowingFixture(); t.after(() => f.db.close())
  const { db, viewer, secondUser, v1 } = f
  let actor = viewer, expired = false, held = null, holdAction = null, switchAfterWrite = false, malformed = false
  const browserCalls = [], serverCalls = [], failures = [], opened = []
  const transport = createInvestigationApiTransport({ url: 'https://qikvmopbtijoebdqosyq.supabase.co',
    anonKey: 'sb_publishable_fixture', serviceKey: 'sb_secret_fixture', fetchImpl: async (url, options) => {
      const request = new Request(url, options), path = new URL(url).pathname
      const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
      if (path === '/auth/v1/user') {
        assert.equal(request.headers.get('apikey'), 'sb_publishable_fixture')
        return expired ? json({ code: 'expired' },401) : json({ id: request.headers.get('authorization').slice(7) })
      }
      assert.equal(path, '/rest/v1/rpc/mip_public_story_following_v1')
      assert.equal(request.headers.get('apikey'), 'sb_secret_fixture'); assert.equal(request.headers.has('authorization'),false)
      assert.equal(options.redirect,'error'); assert.ok(options.signal)
      const body = await request.json(); serverCalls.push(body)
      try { return json(await f.follow(body.p_action, body.p_input)) }
      catch (e) { return json({ code: e.code, message: 'SECRET must remain server-only' },400) }
    } })
  const handler = createInvestigationApiHandler(transport)
  const client = createClient('https://qikvmopbtijoebdqosyq.supabase.co', 'sb_publishable_fixture', {
    accessToken: async () => actor, realtime: { transport: class { constructor() { throw new Error('unexpected realtime') } } },
    global: { fetch: async (url, init) => {
      const request = new Request(url,init), body = await request.clone().json(); browserCalls.push({ request, body })
      if (new URL(request.url).pathname.startsWith('/rest/v1/rpc/')) {
        assert.equal(new URL(request.url).pathname,'/rest/v1/rpc/read_reviewed_public_story_context_v1')
        await db.exec('set role anon')
        try {
          const data = (await db.query('select public.read_reviewed_public_story_context_v1($1,$2) r',[body.p_story_id,body.p_public_version_id])).rows[0].r
          return new Response(JSON.stringify(data), { headers: { 'content-type':'application/json' } })
        } finally { await db.exec('reset role') }
      }
      assert.equal(new URL(request.url).pathname,'/functions/v1/investigation-api/story-following')
      const response = await handler(request)
      assert.equal(response.headers.get('cache-control'),'private, no-store')
      assert.match(response.headers.get('vary'),/Authorization/)
      assert.equal(response.headers.get('x-mip-backend'),'investigation-api-1')
      if (switchAfterWrite && body.action === 'unsubscribe') actor=secondUser
      if (holdAction === body.action) {
        holdAction=null
        await new Promise(resolve => { held=() => { held=null; resolve() } })
      }
      if (malformed && body.action === 'read' && response.ok) {
        const data = await response.json()
        if(malformed==='private_extra') data.data.private_note='SECRET other account note'
        else data.data.subject_id=randomUUID()
        return new Response(JSON.stringify(data), { headers: { 'content-type':'application/json' } })
      }
      return response
    } },
  })
  const backend = createInvestigationBackend(client).storyFollowing
  let story = v1, userId = viewer, sessionReady = true, tree, panel
  const props = () => ({ story,userId,sessionReady,backend,onAccessFailure: code => failures.push(code) })
  const update = async patch => { ({ story, userId, sessionReady } = { story,userId,sessionReady,...patch }); await act(async () => { tree.update(React.createElement(Controls,props())); await tick(); await tick() }) }
  const button = label => tree.root.findAllByType('button').find(b => text(b.props.children) === label)
  const click = async label => { const b=button(label); assert.ok(b,label); await act(async () => { await b.props.onClick(); await tick() }) }
  const displayed = () => text(tree.toJSON())
  const own = () => f.follow('read',{ user_id: viewer,story_id:v1.story_id })
  await act(async () => { tree=TestRenderer.create(React.createElement(Controls,props())); await tick(); await tick() })
  t.after(() => { tree?.unmount(); panel?.unmount() })
  let v2,v3

  await t.test('eligible public story reads automatically; explicit follow confirms actor-stamped receipt', async () => {
    assert.match(displayed(),/not following/); await click('Follow story')
    assert.match(displayed(),/Following this story/)
    assert.deepEqual(browserCalls.slice(-2).map(c=>c.body.action),['subscribe','read'])
    assert.equal(Object.hasOwn(browserCalls.at(-2).body.input,'user_id'),false)
    assert.equal((await own()).subscription.acknowledged_public_version_id,v1.public_version_id)
    assert.ok(serverCalls.every(c=>c.p_input.user_id===viewer))
  })
  await t.test('in-app unread updates consume admitted declarations; acknowledgement uses exact displayed older version', async () => {
    const second=await f.source('Second'); v2=await f.storyVersion([f.first,second],v1); await f.declare(v2,v1,second)
    const third=await f.source('Third'); v3=await f.storyVersion([f.first,second,third],v2); await f.declare(v3,v2,third)
    await update({story:v2}); assert.match(displayed(),/2 unread material updates/)
    await click('Acknowledge displayed story version')
    const request=browserCalls.filter(c=>c.body.action==='acknowledge').at(-1)
    assert.equal(request.body.input.public_version_id,v2.public_version_id)
    assert.equal((await own()).subscription.acknowledged_public_version_id,v2.public_version_id)
    assert.match(displayed(),/1 unread material update/)
    assert.ok(!browserCalls.some(c=>['revoke','declare_public_story_material_change'].includes(c.body.action)))
    const context=await backend.loadStoryContext(v1.story_id,{publicVersionId:v2.public_version_id})
    assert.equal(context.error,null); assert.equal(context.data.material_changes.length,1)
    assert.equal(context.data.evidence_versions[0].admission_kind,'source_report')
  })
  await t.test('native Following list uses account-only unread counts and opens the exact admitted head', async () => {
    await act(async () => { panel=TestRenderer.create(React.createElement(Panel,{ userId:viewer,sessionReady:true,backend,onOpenStory:(id,options)=>opened.push({id,...options}) })); await tick(); await tick() })
    assert.match(text(panel.toJSON()),/1 unread material update/)
    const open=panel.root.findAllByType('button').find(b=>text(b.props.children).startsWith('Open '))
    await act(async()=>open.props.onClick())
    assert.deepEqual(opened,[{id:v1.story_id,publicVersionId:v3.public_version_id}])
    await act(async()=>{ panel.update(React.createElement(Panel,{userId:secondUser,sessionReady:true,backend})); await tick(); await tick() })
    actor=secondUser
    await act(async()=>{ await panel.root.findAllByType('button').find(b=>text(b.props.children)==='Reload followed stories').props.onClick(); await tick() })
    assert.match(text(panel.toJSON()),/No followed stories for this account/); assert.doesNotMatch(text(panel.toJSON()),/1 unread/)
    panel.unmount(); panel=null; actor=viewer
  })
  await t.test('token B while React owns A is rejected before SQL mutation', async () => {
    const count=serverCalls.length; actor=secondUser
    await click('Unfollow story')
    assert.equal(serverCalls.length,count); assert.match(displayed(),/session has ended/)
    assert.equal((await own()).subscription.status,'active'); actor=viewer
    await click('Reload story Following')
  })
  await t.test('confirmation read detects a new actor after the old actor saved a receipt', async () => {
    switchAfterWrite=true; await click('Unfollow story'); switchAfterWrite=false
    assert.match(displayed(),/session has ended/); assert.doesNotMatch(displayed(),/You unfollowed/)
    actor=viewer; await click('Reload story Following'); await click('Follow story')
  })
  await t.test('CAS conflict clears personal payload and makes no automatic mutation retry', async () => {
    const saved=(await own()).subscription
    await f.follow('unsubscribe',{ user_id:viewer,story_id:v1.story_id,event_id:randomUUID(),previous_event_id:saved.current_event_id })
    const count=browserCalls.length; await click('Unfollow story')
    assert.equal(browserCalls.length,count+1); assert.match(displayed(),/Reload before/)
    assert.doesNotMatch(displayed(),/unread material update/)
    await click('Reload story Following'); await click('Follow story')
  })
  await t.test('late write after account switch cannot paint A data into B', async () => {
    holdAction='unsubscribe'; let pending
    act(()=>{ pending=button('Unfollow story').props.onClick() })
    for (let i=0;i<12&&!held;i++) await act(async()=>tick())
    assert.ok(held); actor=secondUser; await update({userId:secondUser})
    assert.doesNotMatch(displayed(),/Following this story|unread material update/)
    await act(async()=>{ held(); await pending; await tick() })
    assert.match(displayed(),/not following/)
    actor=viewer; await update({userId:viewer}); await click('Follow story')
  })
  await t.test('late read after logout and same-account re-entry cannot reintroduce private payload', async () => {
    holdAction='read'; let pending
    act(()=>{ pending=button('Reload story Following').props.onClick() })
    for (let i=0;i<12&&!held;i++) await act(async()=>tick())
    assert.ok(held); await update({userId:null,sessionReady:false})
    assert.match(displayed(),/Sign in/); assert.doesNotMatch(displayed(),/unread|source-report version/)
    await update({userId:viewer,sessionReady:true})
    await act(async()=>{ held(); await pending; await tick() })
    assert.match(displayed(),/Following this story/)
  })
  await t.test('foreign subject, expiry and private investigation object are withheld', async () => {
    malformed=true; await click('Reload story Following'); malformed=false
    assert.match(displayed(),/unavailable/); assert.doesNotMatch(displayed(),/SECRET|unread material/)
    malformed='private_extra'; await click('Reload story Following'); malformed=false
    assert.match(displayed(),/unavailable/); assert.doesNotMatch(displayed(),/SECRET|unread material/)
    await click('Reload story Following'); expired=true; await click('Reload story Following'); expired=false
    assert.match(displayed(),/session has ended/)
    const count=browserCalls.length; await update({story:{contract:'private-investigation-following-1',story_id:v1.story_id,publicly_eligible:false}})
    assert.match(displayed(),/reviewed story version is required/); assert.equal(browserCalls.length,count)
    await update({story:v2})
  })
  await t.test('withdrawal revokes in-app updates; restored source never resumes a saved follow automatically', async () => {
    await db.query("update public.articles set source_status='withdrawn' where id=$1",[v3.members.at(-1).article_id])
    await click('Reload story Following'); assert.match(displayed(),/unavailable.*revoked/)
    assert.doesNotMatch(displayed(),/source-report version|unread material update/)
    await db.query("update public.articles set source_status='active' where id=$1",[v3.members.at(-1).article_id])
    await click('Reload story Following'); assert.match(displayed(),/Following preference was revoked/)
    await click('Follow story'); assert.match(displayed(),/Following this story/)
  })
  await t.test('gateway rejects administrative actions, actor spoofing, missing expectation and oversized payloads', async () => {
    const req=(action,input,headers={})=>handler(new Request('https://qikvmopbtijoebdqosyq.supabase.co/functions/v1/investigation-api/story-following',{ method:'POST',headers:{authorization:`Bearer ${viewer}`,'x-mip-expected-user':viewer,'content-type':'application/json',...headers},body:JSON.stringify({action,input}) }))
    const count=serverCalls.length
    for(const action of ['revoke','register_material_change','set_access']) assert.equal((await req(action,{})).status,400)
    assert.equal((await req('read',{story_id:v1.story_id,user_id:secondUser})).status,400)
    assert.equal((await req('read',{story_id:v1.story_id},{'x-mip-expected-user':''})).status,401)
    assert.equal((await req('list',{extra:'x'.repeat(9000)})).status,400)
    assert.equal(serverCalls.length,count)
    assert.ok(failures.includes('authentication_required')); assert.ok(failures.includes('access_denied'))
  })
})

test('context/client deadlines, explicit clocks and parsed-output bounds fail closed', async () => {
  const user=randomUUID(),storyId=randomUUID(); let contextSignal,privateSignal
  const backend=createStoryFollowingBackend({ functions:{invoke:(_name,options)=>{privateSignal=options.signal;return new Promise(()=>{})}},
    rpc:()=>({abortSignal:signal=>{contextSignal=signal;return new Promise(()=>{})}}) },{requestTimeoutMs:5})
  assert.equal((await backend.loadStoryContext(storyId)).error.code,'service_unavailable'); assert.equal(contextSignal.aborted,true)
  assert.equal((await backend.read({story_id:storyId},{expectedUserId:user})).error.code,'service_unavailable'); assert.equal(privateSignal.aborted,true)
  assert.equal(normalizePublicStoryContext({ evidence_versions:Array(101).fill({}) }),null)
  const c={ material_change_id:randomUUID(),story_id:storyId,subject_type:'article',subject_id:randomUUID(),public_version_id:randomUUID(),previous_public_version_id:randomUUID(),
    sequence:'2',effective_at:'2026-10-02T00:00:00Z',declared_at:'2026-10-02T00:00:00Z',reason:'Declared.',policy_version:'v1',materiality_owner:'reviewed_publication_owner',
    kind:'update',importance:'material',novelty:'genuinely_new',event_state:'active',evidence_refs:[randomUUID()],review_refs:['review'] }
  assert.equal(isPublicStoryMaterialChange(c,c),true)
  for(const effective_at of ['2026-10-02T00:00:00','2026-02-30T00:00:00Z','2026-10-02','2026-10-02T00:00:00.1234567890Z']) assert.equal(isPublicStoryMaterialChange({...c,effective_at},c),false)
})
