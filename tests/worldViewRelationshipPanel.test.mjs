import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { createServer } from 'vite'
import { projectRelationshipDisplay } from '../src/lib/worldViewRelationshipLayout.js'

function renderedText(node) {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(renderedText).join('')
  return renderedText(node.children)
}

test('relationship disclosure retains direction, all authorized pages, provenance and exact node actions', async t => {
  const server = await createServer({
    configFile: false,
    esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: 'custom',
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
  assert.match(renderedText(renderer.toJSON()), /Selected source → Target B/)
  assert.match(renderedText(renderer.toJSON()), /sequence: after/)
  assert.match(renderedText(renderer.toJSON()), /evidence-44/)
  assert.match(renderedText(renderer.toJSON()), /does not supply relationship valid-time bounds/)
  assert.match(renderedText(renderer.toJSON()), /All 45 supplied records remain inspectable/)
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
  assert.match(renderedText(renderer.toJSON()), /Relationship records are unavailable in the current authorized read/)
  assert.equal(renderer.root.findAll(node => node.type === 'li').length, 0)
  assert.doesNotMatch(renderedText(renderer.toJSON()), /No relationship records were returned/)
  await act(async () => renderer.update(React.createElement(Panel, { edges: [], nodes })))
  assert.match(renderedText(renderer.toJSON()), /No relationship records were returned by the current authorized graph read/)
})

test('map counts and visibility require the exact current ordered edge snapshot', async t => {
  const server = await createServer({
    configFile: false,
    esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: 'custom',
  })
  t.after(() => server.close())
  const { default: Panel } = await server.ssrLoadModule('/src/components/WorldViewRelationshipPanel.jsx')
  const nodes = [{ id: 'a', label: 'Source A' }, { id: 'b', label: 'Target B' }]
  const markers = [
    { id: 'marker-a', row: { subject_graph_node_id: 'a' }, x: 20, y: 30, visible: true },
    { id: 'marker-b', row: { subject_graph_node_id: 'b' }, x: 80, y: 70, visible: true },
  ]
  const original = [
    { id: 'edge-one', source: 'a', target: 'b', type: 'sequence', label: 'Recorded sequence', claimed_by: 'source_document', metadata: { evidence: ['old-evidence'] } },
    { id: 'edge-two', source: 'b', target: 'a', type: 'actor', claimed_by: 'MIP_inferred', metadata: { evidence: ['old-hypothesis'] } },
  ]
  const stale = projectRelationshipDisplay(original, markers)
  assert.equal(stale.displayed, 1)
  assert.equal(stale.counts.hypothesis, 1)
  // Same IDs and count, but fresh original objects and current provenance.
  const current = original.map((edge, index) => ({
    ...edge, claimed_by: 'source_document',
    metadata: { evidence: ['current-evidence-' + index] },
  }))
  const currentSummary = projectRelationshipDisplay(current, markers)
  let renderer
  const update = async (edges, displaySummary) => {
    await act(async () => {
      const props = React.createElement(Panel, { edges, nodes, displaySummary })
      if (renderer) renderer.update(props)
      else renderer = TestRenderer.create(props)
    })
  }
  t.after(() => renderer?.unmount())
  const rows = () => renderer.root.findAll(node => node.type === 'li' && node.props['data-edge-id'] != null)
  const assertUnavailable = () => {
    const text = renderedText(renderer.toJSON())
    assert.match(text, /Map line visibility is unavailable for the current relationship records/)
    assert.doesNotMatch(text, /\d+ of \d+ records drawn/)
    assert.doesNotMatch(text, /\d+ map lines/)
    assert.doesNotMatch(text, /\d+ stored hypotheses are not drawn/)
    for (const row of rows()) assert.match(renderedText(row), /Map line visibility is unavailable\./)
  }

  await update(current, stale)
  assertUnavailable()
  assert.equal(rows().length, 2)
  assert.match(renderedText(renderer.toJSON()), /Source A → Target B/)
  assert.match(renderedText(renderer.toJSON()), /Target B → Source A/)
  assert.match(renderedText(renderer.toJSON()), /sequence/)
  assert.match(renderedText(renderer.toJSON()), /current-evidence-0/)
  assert.doesNotMatch(renderedText(renderer.toJSON()), /old-evidence/)
  assert.match(renderedText(renderer.toJSON()), /does not supply relationship valid-time bounds/)

  await update(current, currentSummary)
  assert.match(renderedText(renderer.toJSON()), /2 of 2 records drawn/)
  assert.match(renderedText(renderer.toJSON()), /2 map lines/)
  assert.doesNotMatch(renderedText(renderer.toJSON()), /Map line visibility is unavailable/)
  for (const row of rows()) assert.match(renderedText(row), /Shown on the map\./)

  const reordered = [...current].reverse()
  await update(reordered, currentSummary)
  assertUnavailable()
  assert.deepEqual(rows().map(row => row.props['data-edge-id']), ['edge-two', 'edge-one'])

  await update(current, {
    ...currentSummary,
    dispositions: currentSummary.dispositions.map((entry, index) => ({ ...entry, edgeIndex: 1 - index })),
  })
  assertUnavailable()
  await update(current, { ...currentSummary, dispositions: currentSummary.dispositions.slice(0, 1) })
  assertUnavailable()

  // A changed record beyond the first page invalidates aggregate counts even
  // when every currently visible row still matches the previous publication.
  const many = Array.from({ length: 25 }, (_, index) => ({
    id: 'many-' + index, source: 'a', target: 'b', type: 'sequence',
    claimed_by: index === 24 ? 'MIP_inferred' : 'source_document',
  }))
  const oldManySummary = projectRelationshipDisplay(many, markers)
  const refreshedMany = [...many]
  refreshedMany[24] = { ...many[24], claimed_by: 'source_document' }
  await update(refreshedMany, oldManySummary)
  assertUnavailable()
  assert.equal(rows().length, 20)
  assert.equal(rows()[0].props['data-edge-id'], 'many-0')
  const next = renderer.root.findAll(node => node.type === 'button' && node.children.includes('Next'))[0]
  await act(async () => next.props.onClick())
  assert.equal(rows().length, 5)
  assert.equal(rows().at(-1).props['data-edge-id'], 'many-24')
  assertUnavailable()
  await update(refreshedMany, projectRelationshipDisplay(refreshedMany, markers))
  assert.match(renderedText(renderer.toJSON()), /25 of 25 records drawn/)
  assert.match(renderedText(renderer.toJSON()), /25 map lines/)
  assert.doesNotMatch(renderedText(renderer.toJSON()), /Map line visibility is unavailable/)

  const groupedMarkers = markers.map(marker => ({ ...marker, displayGroupId: 'dense-display-group' }))
  const groupedSummary = projectRelationshipDisplay(refreshedMany, groupedMarkers)
  assert.equal(groupedSummary.counts.groupedEndpoints, 25)
  await update(refreshedMany, groupedSummary)
  assert.match(renderedText(renderer.toJSON()), /0 of 25 records drawn/)
  assert.match(renderedText(renderer.toJSON()), /25 with both endpoints within the same display group/)
  assert.doesNotMatch(renderedText(renderer.toJSON()), /Shown on the map/)
  for (const row of rows()) {
    assert.match(renderedText(row), /Both endpoints are within the same display group; original record remains inspectable\./)
    assert.match(renderedText(row), /Source A → Target B/)
    assert.match(renderedText(row), /sequence/)
  }
  assert.match(renderedText(renderer.toJSON()), /All 25 supplied records remain inspectable/)

  const replacementRecords = refreshedMany.map(edge => ({
    ...edge, metadata: { evidence: ['fresh-grouped-evidence-' + edge.id] },
  }))
  await update(replacementRecords, groupedSummary)
  assertUnavailable()
  assert.doesNotMatch(renderedText(renderer.toJSON()), /25 with both endpoints within the same display group/)
  assert.equal(rows().length, 20)
  assert.match(renderedText(renderer.toJSON()), /fresh-grouped-evidence-many-0/)
  await update(replacementRecords, projectRelationshipDisplay(replacementRecords, groupedMarkers))
  assert.match(renderedText(renderer.toJSON()), /0 of 25 records drawn/)
  assert.match(renderedText(renderer.toJSON()), /25 with both endpoints within the same display group/)
  assert.match(renderedText(renderer.toJSON()), /fresh-grouped-evidence-many-0/)

  const separatedMarkers = markers.map((marker, index) => ({ ...marker, displayGroupId: 'display-group-' + index }))
  await update(replacementRecords, projectRelationshipDisplay(replacementRecords, separatedMarkers))
  assert.match(renderedText(renderer.toJSON()), /25 of 25 records drawn/)
  assert.doesNotMatch(renderedText(renderer.toJSON()), /Both endpoints are within the same display group/)
  for (const row of rows()) assert.match(renderedText(row), /Shown on the map\./)
})
