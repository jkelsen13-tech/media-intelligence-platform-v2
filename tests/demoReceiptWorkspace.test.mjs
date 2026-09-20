import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import TestRenderer, { act } from 'react-test-renderer'
import retained from '../verifier/demo-corpus-20260916/retained-source-receipts.json' with { type: 'json' }
import expanded from '../verifier/demo-corpus-20260916/expanded-source-receipts.json' with { type: 'json' }
import owner from './fixtures/demoOwnerContract.json' with { type: 'json' }
import { createDemoUniverse, demoLens } from '../scripts/demoCorpus.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = fileURLToPath(new URL('./.compiled/DemoReceiptWorkspace.mjs', import.meta.url))
mkdirSync(new URL('./.compiled', import.meta.url), { recursive: true })
const require = createRequire(import.meta.url)
const esbuild = createRequire(require.resolve('vite/package.json'))('esbuild')
await esbuild.build({ absWorkingDir: root, entryPoints: ['scripts/demoReceiptWorkspace.jsx'], outfile: output,
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', external: ['react', 'react/jsx-runtime'],
  plugins: [{ name: 'skip-css', setup(build) { build.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' })) } }],
})
const ui = await import(pathToFileURL(output))
const universe = createDemoUniverse([...retained, ...expanded], { requireComplete: true })
const props = { universe, investigation: demoLens(universe), selected: null, onSelect: () => {} }
const render = (component, extra = {}) => renderToStaticMarkup(createElement(component, { ...props, ...extra }))

test('22 capability families display every independent owner stage and native section label', () => {
  assert.equal(ui.CAPABILITY_FAMILIES.length, 22)
  const html = render(ui.ReceiptWorkspace)
  for (const stage of Object.keys(owner.required_families)) assert.ok(html.includes(`data-stage="${stage}"`), stage)
  for (const label of ['Overview', 'What Changed', 'Hypotheses', 'Commitments', 'Evidence Gaps', 'Source History', 'Source Links', 'Evidence Checks', 'Search Coverage']) assert.ok(html.includes(label), label)
  assert.match(html, /93 origin declarations \/ 32 origin groups/)
  assert.match(html, /93 dependency declarations \/ 80 dependency groups/)
  assert.match(html, /Saved-version navigation is unavailable/)
  assert.doesNotMatch(html, /first saved version|Latest at last read/)
})

test('native-semantic sections are navigable and unavailable review controls cannot mutate', () => {
  let view
  act(() => { view = TestRenderer.create(createElement(ui.ReceiptWorkspace, props)) })
  for (const [id, label] of ui.RECEIPT_TABS) {
    const button = view.root.findAllByType('button').find(button => button.children.includes(label))
    act(() => button.props.onClick())
    assert.equal(view.root.findAllByType('section').some(section => section.props['aria-label'] === label), true, id)
    assert.equal(button.props['aria-current'], 'page')
  }
  for (const label of ['Previous saved version', 'Current saved version', 'Review baseline', 'Mark reviewed']) {
    assert.equal(view.root.findAllByType('button').find(button => button.children.includes(label)).props.disabled, true)
  }
  act(() => view.unmount())
})

test('candidate comparison covers all 93 without presenting a synopsis as a claim', () => {
  const html = render(ui.ReceiptComparison)
  assert.equal((html.match(/data-candidate-id=/g) ?? []).length, 93)
  assert.match(html, /Shared \/ unique \/ presence \/ absence: unknown/)
  assert.match(html, /Native event membership and exact claim text are unavailable/)
  for (const source of universe.sources) {
    assert.ok(html.includes(source.candidate_id))
    assert.ok(html.includes(source.capture_id))
    assert.equal(html.includes(source.statement), false)
  }
  assert.match(html, /Publication timestamp/)
  assert.match(html, /Framing \/ attribution \/ exact scope/)
})

test('outlet filter preserves candidate selection identity', () => {
  let chosen = null, view
  act(() => { view = TestRenderer.create(createElement(ui.ReceiptComparison, { ...props, onSelect: source => { chosen = source } })) })
  const target = universe.sources[0]
  act(() => view.root.findByType('select').props.onChange({ target: { value: target.outlet } }))
  const article = view.root.findAllByType('article').find(item => item.props['data-candidate-id'] === target.candidate_id)
  act(() => article.findAllByType('button')[0].props.onClick())
  assert.equal(chosen, target)
  act(() => view.unmount())
})

test('timeline uses 92 native date values and keeps month-only source outside precise chronology', () => {
  const html = render(ui.ReceiptTimeline)
  assert.equal((html.match(/<time /g) ?? []).length, 92)
  assert.match(html, /Precise date unavailable/)
  assert.match(html, /retained value <!-- -->2023-04|retained value 2023-04/)
  assert.match(html, /no day invented/)
  assert.doesNotMatch(html, /dateTime="2023-04-01/)
})

test('source identity and search coverage preserve exact receipt metadata and bounded wording', () => {
  const source = universe.sources[0], row = universe.propagation.sourceReceipts.find(row => row.capture_id === source.capture_id)
  const html = render(ui.ReceiptIdentity, { source, row })
  for (const field of ['capture_id', 'article_id', 'candidate_id', 'content_hash', 'origin_id', 'dependency_id']) assert.ok(html.includes(source[field]), field)
  assert.match(html, /Exact retained body unavailable/)
  assert.match(html, /no canonical link/)
  const search = render(ui.ReceiptSearchCoverage, { query: 'not-found-987654321' })
  assert.match(search, /0 metadata matches/)
  for (const field of owner.required_search_fields) assert.ok(search.includes(field), field)
  assert.match(search, /no claim of real-world absence/)
})

test('entry mounts reconciled adapters and keeps native graph connected-first and selection in routes', () => {
  const entry = readFileSync(new URL('../scripts/demo-corpus-preview.jsx', import.meta.url), 'utf8')
  assert.match(entry, /<ReceiptWorkspace/)
  assert.match(entry, /<ReceiptComparison/)
  assert.match(entry, /<ReceiptTimeline/)
  assert.doesNotMatch(entry, /function ComparisonView|function InvestigationContext|function PublicationTimeline|accounting\.independent_origins/)
  assert.match(entry, /connectedIds\.has\(node\.id\)/)
  assert.match(entry, /Show isolated receipt nodes/)
  assert.match(entry, /route\.surface, source\.capture_id/)
  const adapter = readFileSync(new URL('../scripts/demoReceiptWorkspace.jsx', import.meta.url), 'utf8')
  assert.match(adapter, /InvestigationPanelPresentation/)
  assert.match(adapter, /RemainingUncertaintyBlock/)
  assert.match(adapter, /InvestigationVersionNavigation bundle=\{null\}/)
})
