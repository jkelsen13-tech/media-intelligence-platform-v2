import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { createElement } from 'react'
import TestRenderer, { act } from 'react-test-renderer'

const require = createRequire(import.meta.url)
const esbuild = createRequire(require.resolve('vite/package.json'))('esbuild')
const out = new URL('./.compiled/markets-context-integration-App.mjs', import.meta.url)
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
      if (name.startsWith('usePrivate')) return { contents: 'export const usePrivateInvestigationWorkspace=()=>globalThis.__marketsPrivateOwner' }
      const stub = `import { createElement } from 'react'; const probe=(name)=>(props)=>createElement('probe-'+name, props, props.children); export default probe('${name}');`
      if (name === 'InvestigationWorkspace') return { contents: `import {createElement} from 'react'; export default (p)=>createElement('probe-InvestigationWorkspace',p,p.searchSlot,p.leftNav,p.details,p.children); export const WorkspaceNavButton=(p)=>createElement('button',p,p.item.label); export const WorkspaceSearch=(p)=>createElement('probe-WorkspaceSearch',p); export const WorkspaceAccountButton=(p)=>createElement('probe-Account',p); export const WorkspaceInfoButton=(p)=>createElement('probe-Info',p);` }
      if (name === 'PrivateInvestigationWorkspace') return { contents: stub + ` export const PrivateInvestigationInspector=probe('PrivateInvestigationInspector');` }
      return { contents: stub }
    })
    build.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }))
  } }],
})

const { marketsSourceFixture, marketFixtureId: id } = await import('./fixtures/marketsSourceFixture.mjs')
const instant = '2024-04-08T14:00:00.000001123-04:00'
const rangeEnd = '2024-04-09T14:00:00.000001456-04:00'
const range = `${instant}..${rangeEnd}`
const fixture = marketsSourceFixture()
fixture.validAt = instant
for (const record of fixture.reporting) record.evidence.at = instant
const nodes = [
  { id: id(900), type: 'event', label: 'Synthetic direct event', occurred_at: '2024-04-07T23:59:59.999999777Z' },
  { id: id(901), type: 'event', label: 'Synthetic connected event', occurred_at: '2024-04-07T23:59:59.999999888Z' },
  { id: id(990), type: 'event', label: 'Exact public handoff event', occurred_at: '2023-12-01T03:00:00.987654321+03:00' },
]
globalThis.__marketsPrivateOwner = { status: 'unauthenticated', state: { panels: {}, bundle: null } }
globalThis.__navigationBackend = { investigations: {}, publicData: {
  marketSourceSnapshot: fixture,
  loadGraph: async () => ({ nodes, edges: [], source: 'supabase' }),
  loadCorpusMeta: async () => null, loadGraphCoverage: async () => null, loadNodeLocations: async () => [], loadTopics: async () => null,
  loadInvestigationSurface: async () => null, curated: { loadPhase3BetaFlag: async () => false }, resolveEligibleArticleForNews: async () => null,
} }
const listeners = new Map()
const location = { hash: '', pathname: '/', search: '' }
globalThis.window = { location, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  addEventListener: (type, callback) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(callback) },
  removeEventListener: (type, callback) => listeners.get(type)?.delete(callback),
  history: { replaceState(_state, _title, url) { location.hash = url.slice(url.indexOf('#')) } },
}
globalThis.document = { activeElement: null }
const assetLink = time => `#/event/${id(1)}/markets?subject_type=equity&source=${id(301)}&time=${encodeURIComponent(time)}`
const flush = async () => { await Promise.resolve(); await Promise.resolve() }
let renderer, App, importSerial = 0, props = {}
const probe = name => renderer.root.findByType('probe-' + name)
const ic = () => probe('InvestigationWorkspace').props.investigationContext
const renderedText = node => typeof node === 'string' ? node : (node.children ?? []).map(renderedText).join(' ')
const button = label => renderer.root.findAllByType('button').find(node => node.children.join('') === label)
const record = index => renderer.root.findAllByProps({ className: 'market-reporting-record' })[index]
const click = async node => act(async () => { node.props.onClick(); await flush() })
const view = async key => act(async () => { probe('InvestigationWorkspace').props.onChangeView(key); await flush() })
const hash = async value => act(async () => { location.hash = value; for (const listener of listeners.get('hashchange') ?? []) listener(); await flush() })
const mount = async (link = assetLink(range), overrides = {}) => {
  location.hash = link; props = overrides
  // Fresh module evaluation exercises production INITIAL_DEEP_LINK bootstrap,
  // independent of the cached-remount hash hydration used by the older test.
  App = (await import(`${out.href}?cold=${++importSerial}`)).default
  await act(async () => { renderer = TestRenderer.create(createElement(App, props)); await flush() })
}
const unmount = async () => { if (renderer) { await act(async () => renderer.unmount()); renderer = null } }
test.afterEach(async () => { await unmount(); globalThis.__marketsPrivateOwner = { status: 'unauthenticated', state: { panels: {}, bundle: null } } })
const assertAsset = () => {
  assert.equal(ic().canonical_subject_id, id(1)); assert.equal(ic().canonical_subject_type, 'equity')
  assert.equal(ic().as_of_time, instant); assert.deepEqual(ic().selected_time_range, { from: instant, to: rangeEnd })
  assert.equal(ic().parent_event_id, null); assert.equal(ic().temporal_assessment_reference, null)
  assert.match(location.hash, new RegExp('source=' + id(301)))
}

test('nanosecond offset asset/source range traverses analytical views and connected-event return without identity coercion', async () => {
  await mount(); assertAsset()
  const connected = record(1), pathBefore = renderedText(connected)
  assert.match(pathBefore, /supply/); assert.ok(pathBefore.includes(id(1)) && pathBefore.includes(id(901)))
  assert.equal(connected.findByType('a').props.href, 'https://example.test/synthetic-market-source-1')
  for (const key of ['timeline', 'graph', 'world', 'markets']) {
    await view(key); assertAsset()
    if (key !== 'markets') {
      assert.match(renderedText(renderer.root), /no supported asset join/)
      assert.equal(nodes.some(node => node.id === id(1)), false)
    }
    if (key === 'timeline') assert.equal(probe('TimelineView').props.investigationContext.canonical_subject_type, 'equity')
    if (key === 'world') {
      assert.equal(probe('WorldView').props.investigationContext.as_of_time, instant)
      assert.equal(probe('WorldView').props.selected, null)
    }
  }
  await click(record(1).findAllByType('button').find(node => node.children.join('') === 'Explore this recorded event'))
  assert.equal(ic().canonical_subject_id, id(901)); assert.equal(ic().canonical_subject_type, 'event')
  assert.equal(ic().as_of_time, nodes[1].occurred_at)
  assert.doesNotMatch(location.hash, /source=/)
  assert.equal(probe('ArticlePanel').props.node.id, id(901))
  for (const key of ['timeline', 'world', 'graph']) { await view(key); assert.equal(ic().canonical_subject_id, id(901)) }
  await click(button('Return to market asset')); assertAsset()
  assert.equal(renderedText(record(1)), pathBefore)
  assert.match(renderedText(renderer.root.findByProps({ className: 'market-price' })), /Prices unavailable/)
  const reloadLink = location.hash
  await unmount(); await mount(reloadLink); assertAsset()
  assert.equal(renderedText(record(1)), pathBefore)
})

test('a one-nanosecond inspection change withholds another clock’s source and reporting while retaining the typed asset', async () => {
  await mount(assetLink(instant))
  assert.equal(renderer.root.findAllByProps({ className: 'market-reporting-record' }).length, 3)
  const adjacent = '2024-04-08T14:00:00.000001124-04:00'
  await hash(assetLink(adjacent))
  assert.equal(ic().canonical_subject_id, id(1)); assert.equal(ic().canonical_subject_type, 'equity')
  assert.equal(ic().as_of_time, adjacent)
  assert.equal(renderer.root.findAllByProps({ className: 'market-reporting-record' }).length, 0)
  assert.doesNotMatch(location.hash, /source=/)
  assert.equal(probe('InvestigationContextBar').props.selectionFallbacks[0]?.kind, 'source')
  assert.match(renderedText(renderer.root.findByProps({ className: 'market-price' })), /Prices unavailable/)
  for (const key of ['graph', 'timeline', 'world']) { await view(key); assert.equal(ic().as_of_time, adjacent); assert.equal(ic().canonical_subject_type, 'equity') }
})

test('Markets return is cleared on account change and private public handoff uses only the exact public subject', async () => {
  const userA = { user: { id: id(1000) }, loading: false }, userB = { user: { id: id(1001) }, loading: false }
  const bundle = { investigation_id: id(1100), version: { id: id(1101), revision: 1 } }
  globalThis.__marketsPrivateOwner = { status: 'ready', state: { panels: { canonicalSubject: { id: id(990) }, question: 'Synthetic saved question' }, bundle } }
  await mount(assetLink(range), { authSessionOverride: userA })
  await click(button('Open news timeline')); assert.ok(button('Return to market asset'))
  props = { authSessionOverride: userB }
  await act(async () => { renderer.update(createElement(App, props)); await flush() })
  assert.equal(button('Return to market asset'), undefined)
  await view('investigations'); await view('graph')
  assert.equal(ic().canonical_subject_id, id(990)); assert.equal(ic().canonical_subject_type, 'event')
  assert.equal(ic().as_of_time, nodes[2].occurred_at)
  assert.deepEqual(ic().selected_time_range, { from: nodes[2].occurred_at, to: null })
  assert.doesNotMatch(location.hash, /source=|1100|1101|Synthetic/)
  assert.equal(button('Return to market asset'), undefined)
  assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Saved investigation context' }).length, 1)
  await view('world'); assert.equal(ic().canonical_subject_id, id(990))
  globalThis.__marketsPrivateOwner = { ...globalThis.__marketsPrivateOwner, state: { ...globalThis.__marketsPrivateOwner.state,
    bundle: { ...bundle, version: { id: id(1102), revision: 2 } } } }
  await act(async () => { renderer.update(createElement(App, props)); await flush() })
  assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Saved investigation context' }).length, 0)
  globalThis.__marketsPrivateOwner = { ...globalThis.__marketsPrivateOwner, state: { ...globalThis.__marketsPrivateOwner.state,
    panels: { ...globalThis.__marketsPrivateOwner.state.panels, canonicalSubject: { id: id(1999) } } } }
  await view('investigations'); await view('world')
  assert.equal(ic().canonical_subject_id, null); assert.equal(ic().as_of_time, null); assert.equal(ic().selected_time_range, null)
  assert.equal(probe('WorldView').props.selected, null)
  assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Saved investigation context' }).length, 0)
  assert.doesNotMatch(location.hash, /source=|1999|1100|1101|1102/)
})
