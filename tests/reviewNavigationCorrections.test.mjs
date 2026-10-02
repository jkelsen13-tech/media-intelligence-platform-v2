import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { createElement } from 'react'
import TestRenderer, { act } from 'react-test-renderer'

const require = createRequire(import.meta.url)
const esbuild = createRequire(require.resolve('vite/package.json'))('esbuild')
const out = new URL('./.compiled/review-navigation-App.mjs', import.meta.url)
mkdirSync(new URL('./.compiled', import.meta.url), { recursive: true })
// Render the production App and its actual state/navigation helpers. The
// expensive surface renderers and network composition root are inert probes.
await esbuild.build({
  absWorkingDir: new URL('..', import.meta.url).pathname,
  entryPoints: ['src/App.jsx'], outfile: out.pathname, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic',
  external: ['react', 'react/jsx-runtime'], define: { 'import.meta.env': '{"DEV":false,"BASE_URL":"/"}' },
  plugins: [{ name: 'controlled-surfaces', setup(build) {
    build.onResolve({ filter: /\/(views|panels|graph|components)\// }, args => {
      if (args.path.endsWith('.js')) return undefined
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
  { id: 'event-a', type: 'event', label: 'Event A', arc_id: 'arc-a', occurred_at: '2024-04-08T17:59:00Z' },
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
const location = { hash: '#/event/event-a/graph?entity=entity-a', pathname: '/', search: '' }
globalThis.window = {
  location, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  addEventListener: (type, callback) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(callback) },
  removeEventListener: (type, callback) => listeners.get(type)?.delete(callback),
  history: { replaceState(_state, _title, url) { location.hash = url.slice(url.indexOf('#')) } },
}
globalThis.document = { activeElement: null }
let importSerial = 0
const flush = async () => { await Promise.resolve(); await Promise.resolve() }
let renderer
const probe = name => renderer.root.findByType('probe-' + name)
const ic = () => probe('InvestigationWorkspace').props.investigationContext
const selectView = key => probe('InvestigationWorkspace').props.onChangeView(key)
const mount = async (initialHash = '#/event/event-a/graph?entity=entity-a') => {
  location.hash = initialHash
  articlePending = []
  const { default: App } = await import(out.href + '?mount=' + (++importSerial))
  await act(async () => { renderer = TestRenderer.create(createElement(App)); await flush() })
}
const hash = async value => {
  await act(async () => { location.hash = value; for (const fn of listeners.get('hashchange') ?? []) fn(); await flush() })
}
const unmount = async () => { if (renderer) { await act(async () => renderer.unmount()); renderer = null } }
test.afterEach(unmount)

const invalidTypeQueries = [
  ['malformed', 'subject_type=%20event'],
  ['duplicate', 'subject_type=event&subject_type=event'],
]
const assertUnknownType = () => {
  assert.equal(ic().canonical_subject_id, 'event-a')
  assert.equal(ic().canonical_subject_type, null)
  assert.deepEqual({
    arc: ic().selected_arc_or_stage_id,
    entityInspector: renderer.root.findAllByType('probe-ArticlePanel').some(node => node.props.node?.id === 'entity-a'),
  }, { arc: null, entityInspector: false }, 'unknown type cannot borrow event-joined arc or entity selection')
  assert.doesNotMatch(location.hash, /entity=entity-a|arc=arc-a/)
}
for (const [name, query] of invalidTypeQueries) {
  test(`${name} subject type cold hydration refuses event-shaped sub-selections`, async () => {
    await mount(`#/event/event-a/graph?${query}&entity=entity-a&arc=arc-a`)
    assertUnknownType()
    // Re-entering another view rebuilds the catalog against the committed null type.
    await act(async () => { selectView('timeline'); await flush(); selectView('graph'); await flush() })
    assertUnknownType()
  })
  test(`${name} subject type replaces the same selected event without borrowing its catalog`, async () => {
    await mount()
    assert.equal(probe('ArticlePanel').props.node.id, 'entity-a')
    await hash(`#/event/event-a/graph?${query}&entity=entity-a&arc=arc-a`)
    assertUnknownType()
  })
}
for (const query of ['', '&subject_type=event']) {
  test(`valid ${query ? 'explicit event' : 'legacy omitted type'} restores the actual event catalog`, async () => {
    await mount()
    await hash(`#/event/event-a/graph?entity=entity-a&arc=arc-a${query}`)
    assert.equal(ic().canonical_subject_type, 'event')
    assert.equal(ic().selected_arc_or_stage_id, 'arc-a')
    assert.equal(probe('ArticlePanel').props.node.id, 'entity-a')
  })
}
test('well-formed custom type metadata retains the existing route contract', async () => {
  await mount()
  await hash('#/event/event-a/graph?subject_type=custom_kind&arc=arc-a')
  assert.equal(ic().canonical_subject_type, 'custom_kind')
  assert.equal(ic().selected_arc_or_stage_id, 'arc-a')
})
const pendingArticle = async target => {
  await act(async () => { selectView('arcs'); await flush() })
  await act(async () => { probe('ArcsView').props.onOpenArticle(target); await flush() })
  return articlePending.at(-1)
}
for (const [name, route] of [['empty', ''], ['bare hash', '#'], ['slash', '#/'], ['unrecognized', '#/elsewhere'], ['malformed subject ID', '#/event/%zz/graph']]) {
  test(`${name} external hash supersedes pending article resolution and preserves current context`, async () => {
    await mount()
    const request = await pendingArticle('article-stale')
    const current = structuredClone(ic())
    await hash(route)
    assert.deepEqual(ic(), current, 'noncommitting hash preserves the current investigation')
    await act(async () => { request.resolve('article-stale'); await flush() })
    assert.deepEqual(ic(), current, 'late article cannot replace the surviving investigation')
    assert.equal(renderer.root.findAllByType('probe-ArcsView').length, 1)
  })
}
test('valid current-route restoration supersedes pending article while retaining exact recorded scope', async () => {
  await mount()
  const request = await pendingArticle('article-stale')
  const instant = '2026-09-03T01:51:20.123456789Z'
  await hash(`#/event/event-a/graph?entity=entity-a&arc=arc-a&at=${instant}&time=2026-09-03T01:51:20.123456788Z..2026-09-03T01:51:20.123456790Z`)
  const restored = structuredClone(ic())
  assert.equal(restored.canonical_subject_type, 'event')
  assert.equal(restored.as_of_time, instant)
  assert.equal(restored.selected_arc_or_stage_id, 'arc-a')
  assert.equal(restored.active_view, 'graph')
  assert.equal(probe('ArticlePanel').props.node.id, 'entity-a')
  assert.deepEqual(restored.selected_time_range, {
    from: '2026-09-03T01:51:20.123456788Z',
    to: '2026-09-03T01:51:20.123456790Z',
  })
  await act(async () => { request.resolve('article-stale'); await flush() })
  assert.deepEqual(ic(), restored)
})
test('latest explicit article navigation remains live after an external hash clear', async () => {
  await mount()
  const oldRequest = await pendingArticle('article-old')
  await hash('')
  await act(async () => { probe('ArcsView').props.onOpenArticle('article-latest'); await flush() })
  const latestRequest = articlePending.at(-1)
  assert.equal(latestRequest.target, 'article-latest')
  await act(async () => { latestRequest.resolve('article-latest'); await flush() })
  assert.equal(ic().canonical_subject_id, 'article-latest')
  assert.equal(ic().canonical_subject_type, 'article')
  assert.equal(ic().active_view, 'news')
  const latest = structuredClone(ic())
  await act(async () => { oldRequest.resolve('article-old'); await flush() })
  assert.deepEqual(ic(), latest)
})
