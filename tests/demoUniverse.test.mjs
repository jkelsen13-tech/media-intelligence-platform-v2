import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createDemoUniverse, demoLens, graphForLens, searchDemoUniverse, switchDemoLens, parseDemoRoute, serializeDemoRoute, validatePrivateRelation } from '../scripts/demoCorpus.mjs'
import { createDemoSession, authorizeDemoMutation } from '../scripts/demoSession.mjs'
import { demoBrandAsset } from '../scripts/demoBrandAsset.mjs'

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url)))
const records = [...read('../verifier/demo-corpus-20260916/retained-source-receipts.json'), ...read('../verifier/demo-corpus-20260916/expanded-source-receipts.json')]
const universe = createDemoUniverse(records, { requireComplete: true })

test('sealed-investigation regression: every lens references a single 93-record universe', () => {
  assert.equal(universe.sources.length, 93)
  assert.deepEqual(universe.investigations.map(view => view.sources.length), [30, 30, 33])
  assert.equal(demoLens(universe).sources, universe.sources)
  for (const view of universe.investigations) for (const source of view.sources) {
    assert.equal(source, universe.sources.find(item => item.capture_id === source.capture_id))
    const original = records.find(item => item.capture_id === source.capture_id)
    for (const key of ['article_id', 'capture_id', 'candidate_id', 'content_hash', 'span_start', 'span_end', 'origin_id', 'dependency_id', 'rights', 'reader_state', 'capture_state', 'candidate_state']) assert.equal(source[key], original[key])
    assert.equal(source.publication_allowed, false)
    assert.equal(source.public_node_id, null)
  }
})

test('union and repeated filters do not duplicate captures or infer substantive relationships', () => {
  const captures = graph => graph.nodes.filter(node => node.capture_id)
  assert.equal(captures(graphForLens(universe)).length, 93)
  assert.equal(captures(graphForLens(universe, ['iran', 'iran'])).length, 30)
  assert.equal(captures(graphForLens(universe, ['iran', 'epstein'])).length, 60)
  assert.equal(new Set(graphForLens(universe).nodes.map(node => node.id)).size, 95)
  assert.equal(graphForLens(universe).edges.every(edge => edge.substantive === false), true)
  assert.deepEqual(universe.sharedActors, [])
  assert.deepEqual(universe.relationships, [])
  assert.throws(() => graphForLens(universe, ['forged']))
})

test('co-occurrence and shared declared origin do not become actor identity or relationship', () => {
  const origin = universe.sources.find(source => universe.sources.filter(other => other.origin_id === source.origin_id).length > 1).origin_id
  assert.ok(universe.sources.filter(source => source.origin_id === origin).length > 1)
  assert.equal(graphForLens(universe).edges.filter(edge => edge.relationshipClass !== 'declared_provenance').length, 0)
  const real = { namespace: 'person', id: 'shared', label: 'Same actor' }
  for (const type of ['attribution', 'source_statement', 'research_membership']) {
    assert.throws(() => validatePrivateRelation({ type, from: real, to: real, publication_allowed: false }, [real]), /evidence unavailable/)
  }
  assert.throws(() => validatePrivateRelation({ type: 'attribution', from: { namespace: 'person', id: 'forged' }, to: real, publication_allowed: false }, [real]), /Unresolved/)
})

test('exactly two evidenced shared provenance identities support cross-investigation traversal', () => {
  assert.deepEqual(universe.sharedProvenance.map(origin => [origin.label, origin.captures.length, origin.memberships]), [
    ['doj-executive', 8, ['epstein', 'project2025']], ['us-whitehouse', 9, ['iran', 'project2025']],
  ])
  const graph = graphForLens(universe)
  assert.equal(graph.edges.length, 17)
  for (const edge of graph.edges) {
    assert.equal(edge.relationshipClass, 'declared_provenance')
    assert.equal(edge.substantive, false)
    assert.equal(edge.corroborative, false)
    assert.equal(edge.publication_allowed, false)
    assert.equal(edge.evidenceRoots.length, 1)
    assert.ok(records.some(record => record.capture_id === edge.evidenceRoots[0].capture_id && record.content_hash === edge.evidenceRoots[0].content_hash))
  }
  const forged = records.map(record => ({ ...record, origin_id: 'doj-executive', content_hash: 'f'.repeat(64) }))
  assert.deepEqual(createDemoUniverse(forged).sharedProvenance, [])
  assert.deepEqual(graphForLens(createDemoUniverse(forged)).edges, [])
})

test('global search includes membership and resolves a capture outside the current lens', () => {
  const target = demoLens(universe, 'epstein').sources[0]
  const results = searchDemoUniverse(universe, target.capture_id)
  assert.equal(results.length, 1)
  assert.equal(results[0].source, target)
  assert.deepEqual(results[0].memberships, ['epstein'])
  assert.equal(searchDemoUniverse(universe, '').length, 93)
})

test('union deep links round trip and selection survives compatible lenses only', () => {
  const capture = universe.sources[0].capture_id
  const route = { topic: 'iran', surface: 'graph', capture }
  const union = switchDemoLens(route, 'all', universe)
  assert.equal(union.capture, capture)
  assert.deepEqual(parseDemoRoute(serializeDemoRoute(union, universe.sources), universe.sources), union)
  assert.equal(switchDemoLens(union, 'iran', universe).capture, capture)
  assert.equal(switchDemoLens(union, 'epstein', universe).capture, null)
  assert.equal(parseDemoRoute('#/demo/all/evidence/00000000-0000-4000-8000-000000000000', universe.sources).capture, null)
})

test('demo session, forged authority and absent sessions cannot authorize mutation', () => {
  assert.throws(() => createDemoUniverse([{ ...records[0], publication_allowed: true }]), /Publication forbidden/)
  assert.equal(createDemoSession().backendAuthority, false)
  for (const session of [createDemoSession(), { backendAuthority: true, role: 'admin' }, null]) {
    for (const operation of ['publish', 'admit', 'approve', 'insert', 'delete']) assert.equal(authorizeDemoMutation(session, operation).allowed, false)
  }
})

test('only the bounded demo branch is explicitly excluded from Git deployment', () => {
  const config = read('../vercel.json')
  assert.equal(config.$schema, 'https://openapi.vercel.sh/vercel.json')
  assert.deepEqual(config.git.deploymentEnabled, { 'codex/mip-september-22-demo-20260918': false })
})

test('isolated demo emits only the exact native logo without enabling publicDir', () => {
  const emitted = []
  demoBrandAsset().generateBundle.call({ emitFile: asset => emitted.push(asset) })
  assert.equal(emitted.length, 1)
  assert.equal(emitted[0].type, 'asset')
  assert.equal(emitted[0].fileName, 'assets/mip-mobius-logo.png')
  assert.deepEqual(emitted[0].source, readFileSync(new URL('../public/assets/mip-mobius-logo.png', import.meta.url)))
  assert.equal(emitted[0].source.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  const config = readFileSync(new URL('../scripts/vite.demo-corpus.config.js', import.meta.url), 'utf8')
  assert.match(config, /publicDir: false/)
  assert.match(config, /plugins: \[demoNoExternalFonts, demoBrandAsset\(\), privateReplayAsset\(\), react\(\)\]/)
})

test('demo development logo middleware serves only the required asset', () => {
  let middleware
  demoBrandAsset().configureServer({ middlewares: { use: handler => { middleware = handler } } })
  let contentType, body, nextCalls = 0
  const response = { setHeader: (name, value) => { contentType = [name, value] }, end: value => { body = value } }
  middleware({ url: '/assets/mip-mobius-logo.png', method: 'GET' }, response, () => nextCalls++)
  assert.deepEqual(contentType, ['Content-Type', 'image/png'])
  assert.ok(body.length > 0)
  middleware({ url: '/assets/other.png', method: 'GET' }, response, () => nextCalls++)
  assert.equal(nextCalls, 1)
})

test('demo account seam presents preview labels without implying authentication', () => {
  const session = createDemoSession()
  assert.equal(session.presentationLabel, 'Private preview')
  assert.equal(session.displayName, 'Demo reviewer')
  assert.equal(session.backendAuthority, false)
  assert.equal(session.authentication, 'hosting_boundary_required')
  const entry = readFileSync(new URL('../scripts/demo-corpus-preview.jsx', import.meta.url), 'utf8')
  assert.match(entry, /label: 'Access context', value: session.presentationLabel/)
  assert.match(entry, /WorkspaceAccountButton enabled label=\{session.displayName\} title=\{`\$\{session.presentationLabel\} · \$\{session.displayName\}`\}/)
  assert.doesNotMatch(entry, /label: 'Authentication', value: 'Not recorded'/)
  assert.doesNotMatch(entry, /Account \/ Sign in|@supabase|authSession/)
  const shell = readFileSync(new URL('../src/components/InvestigationWorkspace.jsx', import.meta.url), 'utf8')
  assert.match(shell, /label = 'Account', title = 'Account \/ Sign in'/)
  assert.match(shell, /aria-label=\{label\} title=\{title\}/)
})

test('native graph leaves Cytoscape wheel sensitivity at its warning-free default', () => {
  const graph = readFileSync(new URL('../src/graph/GraphView.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(graph, /wheelSensitivity\s*:/)
  assert.match(graph, /addEventListener\('wheel', onWheel/)
})
