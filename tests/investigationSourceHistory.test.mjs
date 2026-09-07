import test from 'node:test'
import assert from 'node:assert/strict'
import { savedSourceHistory, compareRetainedCaptures } from '../src/lib/investigationSourceHistory.js'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { createElement } from 'react'
import TestRenderer, { act } from 'react-test-renderer'

const root = fileURLToPath(new URL('../', import.meta.url)), out = join(root, 'tests/.compiled/SourceHistory.mjs')
mkdirSync(join(root, 'tests/.compiled'), { recursive: true })
const require = createRequire(import.meta.url)
const esbuild = createRequire(require.resolve('vite/package.json'))('esbuild')
await esbuild.build({ absWorkingDir: root, entryPoints: ['src/components/InvestigationSourceHistory.jsx'], outfile: out,
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', external: ['react', 'react/jsx-runtime'] })
const { default: History } = await import(pathToFileURL(out))
const p1 = '9007199254740993', p2 = '9007199254740994'
const capture = (position, article = 'source-a', payload = {}) => ({ position, capture: { id: `capture-${position}`, article_id: article,
  captured_at: '2026-09-06T12:00:00Z', payload: { title: 'Retained report', summary: '💡 Up to 17%.', url: 'https://example.org/report', ...payload } } })
const fixture = () => ({ version: { id: 'version-a' }, observation: { id: 'observation-a', snapshot: {
  inputs: [capture(p2, 'source-a', { summary: '💡 17%.', published_at: '2019-01-01Z' }), capture(p1)],
  selected_assessment_ids: ['left', 'both', 'neither'], assessments: [
    { id: 'left', context_positions: [p1], rationale: 'Original context', remaining_uncertainty: 'Unresolved.' },
    { id: 'both', context_positions: [p1, p2, p1], rationale: 'Both retained', remaining_uncertainty: 'Unresolved.' },
    { id: 'neither', context_positions: ['8'] }, { id: 'dependency-only', context_positions: [p1] },
  ],
} } })

test('groups only retained article identities, preserves bigint input order and excludes unsupported records', () => {
  const bundle = fixture(), inputs = bundle.observation.snapshot.inputs
  inputs.push(capture('9', 'source-b'), capture('10', 'source-b'), capture('11', null), { position: '12', record_version: { entity_id: 'source-a' } })
  const history = savedSourceHistory(bundle)
  assert.deepEqual(history.sources.map(row => row.captures.map(input => input.position)), [['9', '10'], [p1, p2]])
  assert.equal(history.excludedInputs, 2)
  assert.equal(compareRetainedCaptures(bundle, p1, '9'), null)
  assert.equal(compareRetainedCaptures(bundle, Number(p1), p2), null)
  assert.equal(compareRetainedCaptures(bundle, p1, p1), null)
  assert.deepEqual(inputs.slice(0, 2).map(row => row.position), [p2, p1]) // input is never sorted in place
})

test('exact raw comparison preserves qualifiers, whitespace, Unicode and missing versus empty fields', () => {
  const bundle = fixture(), inputs = bundle.observation.snapshot.inputs
  inputs[0].capture.payload.title = 'Retained report '
  inputs[0].capture.payload.body_text = ''
  inputs[1].capture.payload.outlet = 'e\u0301'
  inputs[0].capture.payload.outlet = 'é'
  const rows = compareRetainedCaptures(bundle, p1, p2).fields
  assert.deepEqual(rows.map(row => row.status), ['different', 'different', 'right_only', 'equal', 'different', 'right_only'])
  assert.equal(rows.find(row => row.field === 'summary').left, '💡 Up to 17%.')
  assert.equal(rows.find(row => row.field === 'body_text').right, '')
})

test('context membership is exact, deduplicated and limited to selected assessments', () => {
  const bundle = fixture()
  bundle.observation.snapshot.selected_assessment_ids.push('left', 'missing', 'unrecorded')
  bundle.observation.snapshot.assessments.push({ id: 'unrecorded' })
  const result = compareRetainedCaptures(bundle, p1, p2)
  assert.deepEqual(result.assessments.map(row => [row.assessment.id, row.usesLeft, row.usesRight]), [['left', true, false], ['both', true, true]])
  assert.equal(result.unrecordedContexts, 2)
})

test('historical and unavailable observations never substitute a current capture', () => {
  const current = fixture(), historical = structuredClone(current)
  historical.observation.snapshot.inputs = [capture(p1)]
  assert.equal(savedSourceHistory(historical).sources[0].captures.length, 1)
  assert.equal(compareRetainedCaptures(historical, p1, p2), null)
  assert.equal(savedSourceHistory(null).available, false)
  assert.equal(compareRetainedCaptures(null, p1, p2), null)
  assert.equal(savedSourceHistory(current).sources[0].captures.length, 2)
})

function toggle(node, open = true) { act(() => { const target = { open }; node.props.onToggle({ target, currentTarget: target }) }) }
test('disclosures select exact captures, defer long text, and handle same-capture choices', () => {
  const bundle = fixture()
  bundle.observation.snapshot.inputs[0].capture.payload.body_text = '💡'.repeat(1500)
  let tree
  act(() => { tree = TestRenderer.create(createElement(History, { bundle })) })
  assert.equal(tree.root.findAllByType('select').length, 0)
  toggle(tree.root.findByProps({ className: 'piw-source-history-item' }))
  assert.equal(tree.root.findAllByType('select').length, 2)
  assert.equal(tree.root.findAllByProps({ 'data-field-status': 'different' }).length, 1)
  const body = tree.root.findAllByProps({ className: 'piw-source-field' })[2]
  toggle(body)
  const expand = tree.root.findAllByType('button').find(node => JSON.stringify(node.props.children).includes('Show full retained text'))
  assert.ok(expand)
  act(() => expand.props.onClick())
  assert.ok(JSON.stringify(tree.toJSON()).includes('💡'.repeat(1500)))
  act(() => tree.root.findByProps({ 'aria-label': 'First capture' }).props.onChange({ target: { value: p2 } }))
  assert.ok(JSON.stringify(tree.toJSON()).includes('Choose two different captures'))
  act(() => tree.root.findByProps({ 'aria-label': 'First capture' }).props.onChange({ target: { value: p1 } }))
  assert.equal(tree.root.findAllByProps({ className: 'piw-source-field' }).length, 6)
  assert.ok(!JSON.stringify(tree.toJSON()).includes('💡'.repeat(1500)))
  act(() => tree.unmount())
})

test('new saved versions discard expanded capture comparisons and paginate sources', () => {
  const bundle = fixture()
  for (let i = 1; i <= 15; i++) bundle.observation.snapshot.inputs.push(capture(String(i), `extra-${i}`))
  let tree
  act(() => { tree = TestRenderer.create(createElement(History, { bundle })) })
  assert.equal(tree.root.findAllByProps({ className: 'piw-source-history-item' }).length, 10)
  const more = tree.root.findAllByType('button').find(node => JSON.stringify(node.props.children).includes('Show more sources'))
  act(() => more.props.onClick())
  assert.equal(tree.root.findAllByProps({ className: 'piw-source-history-item' }).length, 16)
  toggle(tree.root.findAllByProps({ className: 'piw-source-history-item' }).at(-1))
  assert.equal(tree.root.findAllByType('select').length, 2)
  const next = structuredClone(bundle); next.version.id = 'version-b'; next.observation.snapshot.inputs = [capture(p1)]
  act(() => tree.update(createElement(History, { bundle: next })))
  assert.equal(tree.root.findAllByType('select').length, 0)
  act(() => tree.unmount())
})
