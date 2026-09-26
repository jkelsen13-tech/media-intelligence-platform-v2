import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { canonicalizeTimelineEvents, remapTimelineEdges } from '../src/lib/timelineDedup.js'
import { buildMirrorArcMap } from '../src/lib/arcGroupedTimeline.js'

const mirrorCases = JSON.parse(readFileSync(new URL('./golden/fixtures/actors.json', import.meta.url), 'utf8')).mirrorCases

function assertIndependent(input) {
  const result = canonicalizeTimelineEvents(input)
  assert.deepEqual(new Set(result.events.map(node => node.id)), new Set(input.map(node => node.id)))
  assert.equal(result.events.length, input.length)
  assert.equal(result.suppressed, 0)
  for (const node of input) assert.equal(result.canonicalOf.get(node.id), node.id)
  const edges = [{ id: 'edge', source: input[0].id, target: input[1].id, type: 'sequence' }]
  assert.deepEqual(remapTimelineEdges(edges, result.canonicalOf), edges)
}

test('missing slugs retain distinct event identities and edge endpoints', () => {
  assertIndependent([{ id: 'one', slug: null }, { id: 'two' }, { id: 'three', slug: '' }])
})

test('arbitrary shared suffixes are not evt/art identity evidence', () => {
  assertIndependent([{ id: 'one', slug: 'record-one-1234abcd' }, { id: 'two', slug: 'record-two-1234abcd' }])
  assertIndependent([{ id: 'one', slug: 'evt-not-a-hash' }, { id: 'two', slug: 'art-not-a-hash' }])
})

test('two unpaired evt nodes or two unpaired art nodes both remain visible', () => {
  for (const kind of ['evt', 'art']) {
    assertIndependent([{ id: 'one', slug: kind + '-one-1234abcd' }, { id: 'two', slug: kind + '-two-1234abcd' }])
  }
})

test('ambiguous mirror suffixes do not select a canonical event arbitrarily', () => {
  assertIndependent([
    { id: 'one', slug: 'evt-one-1234abcd' },
    { id: 'two', slug: 'evt-two-1234abcd' },
    { id: 'three', slug: 'art-one-1234abcd' },
  ])
})

test('existing Golden evt/art pair keeps the established canonical event', () => {
  for (const fixture of mirrorCases) {
    const result = canonicalizeTimelineEvents(fixture.events)
    assert.equal(result.events.length, fixture.expectKept)
    assert.equal(result.suppressed, fixture.expectSuppressed)
    assert.equal(result.events.find(node => node.slug.startsWith('evt-')).slug, fixture.expectCanonicalSlug)
    const mirror = fixture.events.find(node => node.slug === 'art-trump-vows-action-08736d53')
    const canonical = result.events.find(node => node.slug === fixture.expectCanonicalSlug)
    assert.equal(result.canonicalOf.get(mirror.id), canonical.id)
  }
})

test('a proven pair still remaps its mirror edges without altering edge semantics', () => {
  const input = [{ id: 'event', slug: 'evt-1234abcd' }, { id: 'mirror', slug: 'art-1234abcd' }]
  const result = canonicalizeTimelineEvents(input)
  assert.deepEqual(remapTimelineEdges([{ id: 'edge', source: 'mirror', target: 'other', type: 'causal', doc_strength: 2 }], result.canonicalOf),
    [{ id: 'edge', source: 'event', target: 'other', type: 'causal', doc_strength: 2 }])
})

test('retained suffix peers cannot donate arc membership to another event', () => {
  for (const input of [
    [{ id: 'one', slug: null, arc_id: null }, { id: 'two', slug: null, arc_id: 'unrelated-arc' }],
    [{ id: 'one', slug: 'evt-one-1234abcd', arc_id: null }, { id: 'two', slug: 'evt-two-1234abcd', arc_id: 'unrelated-arc' }],
    [{ id: 'one', slug: 'evt-one-1234abcd', arc_id: null }, { id: 'two', slug: 'evt-two-1234abcd', arc_id: null }, { id: 'three', slug: 'art-one-1234abcd', arc_id: 'unrelated-arc' }],
  ]) {
    assert.deepEqual(buildMirrorArcMap(input, input), new Map())
  }
})

test('existing unique suppressed mirror can still supply an arc fallback', () => {
  const input = [
    { id: 'event', slug: 'evt-1234abcd', arc_id: null },
    { id: 'mirror', slug: 'art-1234abcd', arc_id: 'retained-arc' },
    { id: 'other', slug: 'evt-5678abcd', arc_id: 'own-arc' },
  ]
  const { events } = canonicalizeTimelineEvents(input)
  assert.deepEqual(buildMirrorArcMap(input, events), new Map([['event', 'retained-arc']]))
  assert.deepEqual(buildMirrorArcMap(input, input), new Map(), 'a caller retaining both identities grants no mirror fallback')
})

test('opposite-prefix suffix collision with different full stems preserves both identities and edges', () => {
  assertIndependent([
    { id: 'one', slug: 'evt-alpha-1234abcd' },
    { id: 'two', slug: 'art-beta-1234abcd' },
  ])
})

test('different full stems cannot suppress an identity or donate its arc', () => {
  const input = [
    { id: 'one', slug: 'evt-alpha-1234abcd', arc_id: null },
    { id: 'two', slug: 'art-beta-1234abcd', arc_id: 'unrelated-arc' },
  ]
  const { events } = canonicalizeTimelineEvents(input)
  assert.deepEqual(buildMirrorArcMap(input, events), new Map())
})
