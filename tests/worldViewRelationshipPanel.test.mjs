import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { projectRelationshipDisplay } from '../src/lib/worldViewRelationshipLayout.js'

test('relationship disclosure retains direction, all authorized pages, provenance and exact node actions', async t => {
  const server = await createServer({
    configFile: false, plugins: [react()],
    server: { middlewareMode: true }, appType: 'custom',
  })
  t.after(() => server.close())
  const { default: Panel } = await server.ssrLoadModule('/src/components/WorldViewRelationshipPanel.jsx')
  const nodes = [
    { id: 'a', label: 'Source A' }, { id: 'b', label: 'Target B' },
    { id: 'selected', label: 'Selected source' },
  ]
  const records = Array.from({ length: 45 }, (_, i) => ({
    id: 'edge-' + i, source: i === 44 ? 'selected' : 'a', target: 'b',
    type: 'sequence', label: 'sequence: after', claimed_by: 'source_document',
    metadata: { evidence: ['evidence-' + i], recorded_at: '2020-01-01T00:00:00Z' },
  }))
  const selectedKeys = new Set(['selected'])
  const summary = projectRelationshipDisplay(records, [], { selectedKeys })
  let selectedNode = null
  let renderer
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(Panel, {
      edges: records, nodes, selectedKeys, displaySummary: summary,
      onSelectNode: node => { selectedNode = node },
    }))
  })
  t.after(() => renderer.unmount())
  assert.equal(renderer.root.findByProps({ 'aria-label': 'Documented relationships' }).type, 'details')
  const rows = () => renderer.root.findAll(node => node.type === 'li' && node.props['data-edge-id'] != null)
  assert.equal(rows().length, 20)
  assert.equal(rows()[0].props['data-edge-id'], 'edge-44')
  assert.match(JSON.stringify(renderer.toJSON()), /Selected source → Target B/)
  assert.match(JSON.stringify(renderer.toJSON()), /sequence: after/)
  assert.match(JSON.stringify(renderer.toJSON()), /evidence-44/)
  assert.match(JSON.stringify(renderer.toJSON()), /does not supply relationship valid-time bounds/)
  assert.match(JSON.stringify(renderer.toJSON()), /All 45 supplied records remain inspectable/)
  const actions = renderer.root.findAll(node => node.type === 'button' && node.props['aria-label'] === 'Inspect Source: Selected source')
  await act(async () => actions[0].props.onClick())
  assert.equal(selectedNode, nodes[2], 'selection must receive the exact authorized graph node')
  const seen = new Set(rows().map(row => row.props['data-edge-id']))
  for (let page = 0; page < 2; page++) {
    const next = renderer.root.findAll(node => node.type === 'button' && node.children.includes('Next'))[0]
    assert.equal(next.props.disabled, false)
    await act(async () => next.props.onClick())
    rows().forEach(row => seen.add(row.props['data-edge-id']))
  }
  assert.equal(seen.size, 45)
  assert.equal(rows().length, 5)
  const lastNext = renderer.root.findAll(node => node.type === 'button' && node.children.includes('Next'))[0]
  assert.equal(lastNext.props.disabled, true)

  await act(async () => renderer.update(React.createElement(Panel, {
    edges: [], nodes, edgesUnavailable: 'reader unavailable',
  })))
  assert.match(JSON.stringify(renderer.toJSON()), /Relationship records are unavailable in the current authorized read/)
  assert.equal(renderer.root.findAll(node => node.type === 'li').length, 0)
  assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /No relationship records were returned/)
  await act(async () => renderer.update(React.createElement(Panel, { edges: [], nodes })))
  assert.match(JSON.stringify(renderer.toJSON()), /No relationship records were returned by the current authorized graph read/)
})
