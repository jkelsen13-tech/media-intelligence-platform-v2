import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { createElement } from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { createClient } from '@supabase/supabase-js'
import { createPublicDataBackend } from '../src/lib/publicDataBackend.js'
import { temporalAssessmentConfigKey } from '../src/lib/temporalAssessment.js'

const require = createRequire(import.meta.url)
const esbuild = createRequire(require.resolve('vite/package.json'))('esbuild')
const out = new URL('./.compiled/markets-App.mjs', import.meta.url)
mkdirSync(new URL('./.compiled', import.meta.url), { recursive: true })
// Render the production App and its actual state/navigation helpers. The
// expensive surface renderers and network composition root are inert probes.
await esbuild.build({
  absWorkingDir: new URL('..', import.meta.url).pathname,
  entryPoints: ['src/App.jsx'], outfile: out.pathname, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic',
  external: ['react', 'react/jsx-runtime'], define: { 'import.meta.env': '{"DEV":false,"BASE_URL":"/"}' },
  plugins: [{ name: 'controlled-surfaces', setup(build) {
    build.onResolve({ filter: /\/(views|panels|graph|components)\// }, args => {
      if (args.path.endsWith('.js') || /MarketsView(?:\.jsx)?$/.test(args.path)) return undefined
      return { path: args.path, namespace: 'probe' }
    })
    build.onResolve({ filter: /\/(mipBackend|auth|usePrivateInvestigationWorkspace)(\.js)?$/ }, args => ({ path: args.path, namespace: 'probe' }))
    build.onLoad({ filter: /.*/, namespace: 'probe' }, args => {
      const name = args.path.split('/').at(-1).replace(/\.jsx$/, '')
      if (name.startsWith('mipBackend')) return { contents: 'export const mipBackend = globalThis.__navigationBackend' }
      if (name.startsWith('supabase')) return { contents: 'export const supabase = null' }
      if (name.startsWith('auth')) return { contents: 'export const useAuthSession=()=>({user:null,loading:false}); export const loadAccountUiFlag=async()=>false' }
      if (name.startsWith('usePrivate')) return { contents: 'export const usePrivateInvestigationWorkspace=()=>({status:"unauthenticated",state:{panels:{},bundle:null}})' }
      const stub = `import { createElement } from 'react'; const probe=(name)=>(props)=>createElement('probe-'+name, props, props.children); export default probe('${name}');`
      if (name === 'InvestigationWorkspace') return { contents: `import {createElement} from 'react'; export default (p)=>createElement('probe-InvestigationWorkspace',p,p.searchSlot,p.leftNav,p.details,p.children); export const WorkspaceNavButton=(p)=>createElement('button',p,p.item.label); export const WorkspaceSearch=(p)=>createElement('probe-WorkspaceSearch',p); export const WorkspaceAccountButton=(p)=>createElement('probe-Account',p); export const WorkspaceInfoButton=(p)=>createElement('probe-Info',p);` }
      if (name === 'PrivateInvestigationWorkspace') return { contents: stub + ` export const PrivateInvestigationInspector=probe('PrivateInvestigationInspector');` }
      return { contents: stub }
    })
    build.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }))
  } }],
})

const nodes = [
  { id: 'event-a', type: 'event', label: 'Event A', occurred_at: '2024-04-08T17:59:00Z' },
  { id: 'event-b', type: 'event', label: 'Event B', arc_id: 'arc-origin' },
  { id: 'entity-a', type: 'actor', label: 'Entity A' },
  { id: 'policy-b', type: 'policy', label: 'Policy B' },
]
let articlePending = []
globalThis.__navigationBackend = {
  investigations: {},
  publicData: {
    loadGraph: async () => ({ nodes, edges: [{ id: 'edge-a', source: 'event-a', target: 'entity-a', reliability: 3 }], source: 'fixture' }),
    loadCorpusMeta: async () => null, loadGraphCoverage: async () => null, loadNodeLocations: async () => [], loadTopics: async () => null,
    loadInvestigationSurface: async () => null, curated: { loadPhase3BetaFlag: async () => false },
    resolveEligibleArticleForNews: target => new Promise((resolve, reject) => articlePending.push({ target, resolve, reject })),
  },
}
const listeners = new Map()
const location = { hash: '#/event/00000000-0000-4000-8000-000000000001/markets?subject_type=equity&time=2024-04-08T18%3A00%3A00.000001Z', pathname: '/', search: '' }
globalThis.window = {
  location, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  addEventListener: (type, callback) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(callback) },
  removeEventListener: (type, callback) => listeners.get(type)?.delete(callback),
  history: { replaceState(_state, _title, url) { location.hash = url.slice(url.indexOf('#')) } },
}
globalThis.document = { activeElement: null }
const { marketsSourceFixture, marketFixtureId } = await import('./fixtures/marketsSourceFixture.mjs')
globalThis.__navigationBackend.publicData.marketSourceSnapshot = marketsSourceFixture()
const { default: App, marketContextWithoutInventedAssessment } = await import(out.href)
const flush = async () => { await Promise.resolve(); await Promise.resolve() }
let renderer
const probe = name => renderer.root.findByType('probe-' + name)
const ic = () => probe('InvestigationWorkspace').props.investigationContext
const selectView = key => probe('InvestigationWorkspace').props.onChangeView(key)
const mount = async () => {
  articlePending = []
  await act(async () => { renderer = TestRenderer.create(createElement(App)); await flush() })
}
const hash = async value => {
  await act(async () => { location.hash = value; for (const fn of listeners.get('hashchange') ?? []) fn(); await flush() })
}
const unmount = async () => { if (renderer) { await act(async () => renderer.unmount()); renderer = null } }
test.afterEach(unmount)


const market = () => renderer.root.findByProps({ className: 'markets-view' })
const button = label => renderer.root.findAllByType('button').find(n => n.children.join('') === label)
const visibleText = node => typeof node === 'string' ? node : (node.children ?? []).map(visibleText).join(' ')

test('dedicated native Markets route renders a selected typed asset with reporting and unavailable prices', async () => {
  await mount()
  assert.equal(market().props['data-markets-source-status'], 'available')
  assert.match(visibleText(market()), /Synthetic Northstar/)
  assert.equal(ic().canonical_subject_type, 'equity')
  assert.equal(ic().temporal_assessment_reference, null)
  assert.ok(button('Open news timeline'))
})

test('Markets navigation roundtrip retains exact typed asset, recorded time and return path', async () => {
  await mount()
  const original = { ...ic() }
  await act(async () => { button('Open news timeline').props.onClick(); await flush() })
  assert.equal(ic().active_view, 'timeline')
  assert.equal(ic().canonical_subject_id, original.canonical_subject_id)
  assert.equal(ic().as_of_time, original.as_of_time)
  await act(async () => { selectView('graph'); await flush() })
  assert.equal(ic().canonical_subject_type, 'equity')
  await act(async () => { selectView('markets'); await flush() })
  assert.equal(ic().canonical_subject_id, original.canonical_subject_id)
  assert.ok(button('Explore this recorded event'))
  await act(async () => { button('Explore this recorded event').props.onClick(); await flush() })
  assert.equal(ic().canonical_subject_type, 'event')
  assert.equal(ic().canonical_subject_id, marketFixtureId(900))
  const back = button('Return to market asset')
  assert.ok(back)
  await act(async () => { back.props.onClick(); await flush() })
  assert.equal(ic().canonical_subject_type, 'equity')
  assert.equal(ic().canonical_subject_id, original.canonical_subject_id)
  assert.equal(ic().as_of_time, original.as_of_time)
  assert.equal(ic().active_view, 'markets')
})

test('typing and kind filtering preview choices without committing an investigation', async () => {
  await mount()
  const original = { ...ic() }
  const input = renderer.root.findByProps({ placeholder: 'Search supported mapped assets' })
  await act(async () => { input.props.onChange({ target: { value: 'SAME' } }); await flush() })
  assert.deepEqual(ic(), original)
  const crypto = renderer.root.findAllByType('button').find(n => visibleText(n).includes('Synthetic major coin'))
  assert.ok(crypto)
  await act(async () => { crypto.props.onClick(); await flush() })
  assert.equal(ic().canonical_subject_id, marketFixtureId(3))
  assert.equal(ic().canonical_subject_type, 'cryptoasset')
  assert.match(location.hash, /subject_type=cryptoasset/)
  assert.equal(ic().temporal_assessment_reference, null)
})

test('asset source and precise range survive route reload, view switches and related-event return', async () => {
  const time = '2024-04-08T18:00:00.000001Z..2024-04-09T18:00:00.000001Z'
  await mount()
  await hash(`#/event/${marketFixtureId(1)}/markets?subject_type=equity&source=${marketFixtureId(300)}&time=${encodeURIComponent(time)}`)
  const original = { ...ic() }
  assert.equal(original.selected_time_range.to, '2024-04-09T18:00:00.000001Z')
  assert.match(location.hash, new RegExp('source=' + marketFixtureId(300)))
  await act(async () => { renderer.root.findByProps({ placeholder: 'Search supported mapped assets' }).props.onChange({ target: { value: 'SAME' } }); await flush() })
  const sameAsset = renderer.root.findAllByType('button').find(n => visibleText(n).includes('Synthetic Northstar — Class A'))
  await act(async () => { sameAsset.props.onClick(); await flush() })
  assert.deepEqual(ic().selected_time_range, original.selected_time_range)
  assert.match(location.hash, new RegExp('source=' + marketFixtureId(300)))
  for (const view of ['timeline', 'graph', 'world', 'markets']) {
    await act(async () => { selectView(view); await flush() })
    assert.equal(ic().canonical_subject_type, 'equity')
    assert.deepEqual(ic().selected_time_range, original.selected_time_range)
    assert.match(location.hash, new RegExp('source=' + marketFixtureId(300)))
  }
  await act(async () => { button('Explore this recorded event').props.onClick(); await flush() })
  await act(async () => { button('Return to market asset').props.onClick(); await flush() })
  assert.deepEqual(ic().selected_time_range, original.selected_time_range)
  assert.equal(ic().as_of_time, original.as_of_time)
  assert.match(location.hash, new RegExp('source=' + marketFixtureId(300)))
  const reloadHash = location.hash
  await unmount(); await mount(); await hash(reloadHash)
  // A real page reload re-evaluates App's module-level initial link; this
  // cached module harness exercises the matching hash hydration path.
  assert.equal(ic().canonical_subject_id, original.canonical_subject_id)
  assert.deepEqual(ic().selected_time_range, original.selected_time_range)
  assert.match(location.hash, new RegExp('source=' + marketFixtureId(300)))
})

test('asset context removes only the default event assessment and preserves supplied asset references', () => {
  const base = { canonical_subject_type: 'equity', canonical_subject_id: marketFixtureId(1) }
  const explicit = { ...base, temporal_assessment_reference: 'asset-bound:retained-assessment' }
  assert.equal(marketContextWithoutInventedAssessment(explicit), explicit)
  assert.equal(marketContextWithoutInventedAssessment({ ...base, temporal_assessment_reference: null }).temporal_assessment_reference, null)
  const automatic = { ...base, temporal_assessment_reference: 'temporal:event:' + marketFixtureId(1) }
  // Use the actual existing event-key constructor rather than matching text.
  automatic.temporal_assessment_reference = temporalAssessmentConfigKey(base.canonical_subject_id)
  assert.equal(marketContextWithoutInventedAssessment(automatic).temporal_assessment_reference, null)
  assert.equal(marketContextWithoutInventedAssessment({ ...explicit, canonical_subject_type: 'event' }).temporal_assessment_reference, explicit.temporal_assessment_reference)
})


const settle = async () => { for (let n = 0; n < 6; n++) await act(async () => { await new Promise(resolve => setImmediate(resolve)); await flush() }) }
test('actual App uses the bound installed SDK reader; a missing endpoint finishes unavailable without synthetic assets', async () => {
  const publicData = globalThis.__navigationBackend.publicData, previous = publicData.marketSourceSnapshot, calls = []
  const client = createClient('https://market-route-fixture.invalid', 'synthetic-browser-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, init) => {
      const request = new Request(url, init); calls.push({ path: new URL(request.url).pathname, body: await request.json() })
      return new Response(JSON.stringify({ code: 'PGRST202', message: 'Synthetic missing RPC' }), { status: 404, headers: { 'content-type': 'application/json' } })
    } },
  })
  publicData.marketSourceSnapshot = null; publicData.markets = createPublicDataBackend(client).markets
  try {
    await act(async () => { renderer = TestRenderer.create(createElement(App, { marketSourceSnapshot: marketsSourceFixture() })); await flush() }); await settle()
    assert.equal(calls.length, 0)
    assert.equal(renderer.root.findAllByProps({ className: 'market-reporting-record' }).length, 3)
    await act(async () => { renderer.update(createElement(App)); await flush() }); await settle()
    assert.equal(calls.length, 1); assert.equal(calls[0].path, '/rest/v1/rpc/read_markets_source_directory_v1')
    assert.deepEqual(calls[0].body, { p_at: '2024-04-08T18:00:00.000001Z' })
    assert.equal(market().props['data-markets-source-status'], 'unavailable')
    assert.match(visibleText(market()), /Asset directory unavailable/)
    assert.equal(renderer.root.findAllByProps({ className: 'market-reporting-record' }).length, 0)
    assert.equal(ic().canonical_subject_type, 'equity')
  } finally { await unmount(); publicData.marketSourceSnapshot = previous; delete publicData.markets }
})

test('actual installed SDK source transfer binds reporting, rejects late account/clock responses and retains navigation hints while loading', async () => {
  const publicData = globalThis.__navigationBackend.publicData, previous = publicData.marketSourceSnapshot, pending = []
  let token = 'synthetic-account-a'
  const client = createClient('https://market-route-fixture.invalid', 'synthetic-browser-key', {
    accessToken: async () => token,
    global: { fetch: async (url, init) => {
      const request = new Request(url, init), body = await request.json()
      return new Promise(resolve => pending.push({ body, headers: request.headers, resolve }))
    } },
  })
  publicData.marketSourceSnapshot = null; publicData.markets = createPublicDataBackend(client).markets
  const response = data => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } })
  let props = { authSessionOverride: { user: { id: 'synthetic-account-a' }, loading: false } }
  try {
    articlePending = []
    await act(async () => { renderer = TestRenderer.create(createElement(App, props)); await flush() }); await settle()
    assert.equal(pending.length, 1); assert.match(visibleText(market()), /Loading market sources/)
    token = 'synthetic-account-b'; props = { authSessionOverride: { user: { id: 'synthetic-account-b' }, loading: false } }
    await act(async () => { renderer.update(createElement(App, props)); await flush() }); await settle()
    assert.equal(pending.length, 2)
    pending[0].resolve(response(marketsSourceFixture())); await settle()
    assert.equal(market().props['data-markets-source-status'], 'unavailable')
    assert.equal(renderer.root.findAllByProps({ className: 'market-reporting-record' }).length, 0)
    pending[1].resolve(response(marketsSourceFixture())); await settle()
    assert.equal(market().props['data-markets-source-status'], 'available')
    assert.equal(renderer.root.findAllByProps({ className: 'market-reporting-record' }).length, 3)
    assert.equal(pending[1].headers.get('authorization'), 'Bearer synthetic-account-b')
    const scoped = `#/event/${marketFixtureId(1)}/markets?subject_type=equity&source=${marketFixtureId(300)}&at=2024-04-08T18%3A00%3A00.000002Z&time=2024-04-08T18%3A00%3A00.000002Z`
    await hash(scoped); await settle()
    assert.equal(pending.length, 3); assert.equal(renderer.root.findAllByProps({ className: 'market-reporting-record' }).length, 0)
    assert.match(location.hash, /source=/)
    pending[2].resolve(response(marketsSourceFixture())); await settle()
    assert.equal(renderer.root.findAllByProps({ className: 'market-reporting-record' }).length, 0)
    assert.doesNotMatch(location.hash, /source=/)
    assert.equal(ic().as_of_time, '2024-04-08T18:00:00.000002Z')
    assert.match(visibleText(market()), /Prices unavailable/)
  } finally { await unmount(); publicData.marketSourceSnapshot = previous; delete publicData.markets }
})
