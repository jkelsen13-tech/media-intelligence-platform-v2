import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const graphView = readFileSync(new URL('../src/graph/GraphView.jsx', import.meta.url), 'utf8')

test('focused Graph exposes an explicit isolated-node reader state', () => {
  assert.match(graphView, /const isolatedFocusNode = useMemo/)
  assert.match(graphView, /No documented relationships are recorded for this node\./)
  assert.match(graphView, /Attached articles and node-level source records remain available without inferring a connection\./)
  assert.match(graphView, /Open node evidence/)
})

test('isolated-node detection checks existing edge endpoints rather than creating relationships', () => {
  assert.match(graphView, /edges\.some\(\(edge\) => edge\.source === nodeKey \|\| edge\.target === nodeKey\)/)
  assert.doesNotMatch(graphView, /isolatedFocusNode[\s\S]{0,600}(?:edges\.push|addEdge|createEdge)/)
})
