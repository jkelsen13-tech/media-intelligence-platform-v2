import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { createElement } from 'react'
import TestRenderer, { act } from 'react-test-renderer'

const require = createRequire(import.meta.url)
const esbuild = createRequire(require.resolve('vite/package.json'))('esbuild')
const out = new URL('./.compiled/convergence-App.mjs', import.meta.url)
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
const location = { hash: '#/event/event-a/graph?entity=entity-a', pathname: '/', search: '' }
globalThis.window = {
  location, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  addEventListener: (type, callback) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(callback) },
  removeEventListener: (type, callback) => listeners.get(type)?.delete(callback),
  history: { replaceState(_state, _title, url) { location.hash = url.slice(url.indexOf('#')) } },
}
globalThis.document = { activeElement: null }
const { default: App } = await import(out.href)
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

test('Explore selection clears the previous entity instead of restoring an unrelated inspector', async () => {
  await mount()
  assert.equal(probe('ArticlePanel').props.node.id, 'entity-a')
  await act(async () => { probe('WorkspaceSearch').props.onOpenExplore(); await flush() })
  const drawer = renderer.root.findAllByType('probe-NewsView').find(node => node.props.variant === 'drawer')
  await act(async () => { drawer.props.onOpenNode('event-b'); await flush() })
  assert.equal(ic().canonical_subject_id, 'event-b')
  assert.equal(probe('ArticlePanel').props.node.id, 'event-b')
  assert.doesNotMatch(location.hash, /entity-a/)
  await unmount()
})

test('external deep links replace inspector and location context while preserving the named subject', async () => {
  await mount()
  await hash('#/event/event-b/graph')
  assert.equal(ic().canonical_subject_id, 'event-b')
  assert.equal(probe('ArticlePanel').props.node.id, 'event-b')
  assert.doesNotMatch(location.hash, /entity-a/)
  await hash('#/event/event-b/graph?entity=entity-a')
  assert.equal(probe('ArticlePanel').props.node.id, 'event-b')
  assert.equal(probe('InvestigationContextBar').props.selectionFallbacks[0]?.kind, 'entity')
  await unmount()
})

test('Timeline arc scope stays named without being misrepresented as a parent event', async () => {
  await mount()
  await act(async () => { selectView('news'); await flush() })
  await act(async () => { probe('NewsView').props.onOpenTimeline({ eventKey: 'event-b', arcId: 'arc-origin' }); await flush() })
  assert.equal(ic().canonical_subject_id, 'event-b')
  assert.equal(ic().parent_event_id, null)
  assert.equal(probe('TimelineView').props.focusArcKey, 'arc-origin')
  await unmount()
})

test('later subject selection and view navigation cancel a pending article resolution', async () => {
  await mount()
  await act(async () => { selectView('arcs'); await flush() })
  await act(async () => { probe('ArcsView').props.onOpenArticle('article-slow'); await flush() })
  assert.equal(ic().canonical_subject_id, 'event-a')
  await act(async () => { probe('ArcsView').props.onOpenNode('event-b'); await flush() })
  await act(async () => { articlePending[0].resolve('article-slow'); await flush() })
  assert.equal(ic().canonical_subject_id, 'event-b')
  assert.equal(ic().active_view, 'graph')
  await act(async () => { selectView('arcs'); await flush(); probe('ArcsView').props.onOpenArticle('article-second'); await flush() })
  await act(async () => { selectView('world'); await flush() })
  await act(async () => { articlePending[1].resolve('article-second'); await flush() })
  assert.equal(ic().canonical_subject_id, 'event-b')
  assert.equal(ic().active_view, 'world')
  await unmount()
})

test('policy endpoint navigation updates canonical context with the policy inspector', async () => {
  await mount()
  await act(async () => { probe('ArticlePanel').props.onNavigate('policy-b'); await flush() })
  assert.equal(ic().canonical_subject_id, 'policy-b')
  assert.equal(probe('PolicyPanel').props.node.id, 'policy-b')
  assert.doesNotMatch(location.hash, /entity-a/)
  await unmount()
})

test('Timeline deep-link reload restores only the event’s retained Arc scope', async () => {
  await mount()
  await hash('#/event/event-b/timeline?arc=arc-origin')
  assert.equal(ic().canonical_subject_id, 'event-b')
  assert.equal(ic().selected_arc_or_stage_id, 'arc-origin')
  assert.equal(probe('TimelineView').props.focusArcKey, 'arc-origin')
  await hash('#/event/event-b/timeline?arc=arc-foreign')
  assert.equal(ic().canonical_subject_id, 'event-b')
  assert.equal(ic().selected_arc_or_stage_id, null)
  assert.equal(probe('TimelineView').props.focusArcKey, null)
  assert.equal(probe('InvestigationContextBar').props.selectionFallbacks[0]?.kind, 'arc')
  await unmount()
})

test('direct Graph subject picks clear a previous Timeline target across the return cycle', async () => {
  await mount()
  await act(async () => { selectView('news'); await flush() })
  await act(async () => { probe('NewsView').props.onOpenTimeline('event-b'); await flush() })
  assert.equal(probe('TimelineView').props.focusEventKey, 'event-b')
  await act(async () => { selectView('graph'); await flush() })
  await act(async () => { probe('GraphView').props.onSelect(nodes[0]); await flush() })
  await act(async () => { selectView('timeline'); await flush() })
  assert.equal(ic().canonical_subject_id, 'event-a')
  assert.equal(probe('TimelineView').props.focusEventKey, null)
  await unmount()
})

test('same-subject source-to-Timeline navigation preserves a scrubbed inspection instant', async () => {
  await mount()
  await act(async () => { selectView('world'); await flush() })
  await act(async () => { probe('WorldView').props.onInvestigationAsOfTime('2026-09-03T01:51:20.123456Z'); await flush() })
  await act(async () => { selectView('compare'); await flush() })
  await act(async () => { probe('SourceComparisonView').props.onOpenTimeline('event-a'); await flush() })
  assert.equal(ic().canonical_subject_id, 'event-a')
  assert.equal(ic().as_of_time, '2026-09-03T01:51:20.123456Z')
  await unmount()
})

test('policy navigation leaves one primary inspector and restores the policy on return', async () => {
  await mount()
  await act(async () => { probe('ArticlePanel').props.onNavigate('policy-b'); await flush() })
  assert.equal(renderer.root.findAllByType('probe-ArticlePanel').length, 0)
  assert.equal(probe('PolicyPanel').props.node.id, 'policy-b')
  await act(async () => { selectView('timeline'); await flush() })
  await act(async () => { selectView('graph'); await flush() })
  assert.equal(renderer.root.findAllByType('probe-ArticlePanel').length, 0)
  assert.equal(probe('PolicyPanel').props.node.id, 'policy-b')
  await unmount()
})
