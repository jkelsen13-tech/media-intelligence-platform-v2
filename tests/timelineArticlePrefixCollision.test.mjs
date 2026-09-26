import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/lib/supabase.js', import.meta.url), 'utf8')
const grouped = readFileSync(new URL('../src/lib/arcGroupedTimeline.js', import.meta.url), 'utf8')
const view = readFileSync(new URL('../src/views/GroupedTimelineView.jsx', import.meta.url), 'utf8')
const cross = new Function(source.slice(source.indexOf('export function buildTimelineCrossLinks'), source.indexOf('// Doc 05 pair 3 (News')).replace('export function', 'function') + '; return buildTimelineCrossLinks')()
const canonicalizeTimelineEvents = new Function(readFileSync(new URL('../src/lib/timelineDedup.js', import.meta.url), 'utf8').replaceAll('export function', 'function') + '; return canonicalizeTimelineEvents')()
const news = new Function('supabase', 'canonicalizeTimelineEvents', source.slice(source.indexOf('export async function loadArticleTimelineKey'), source.indexOf('// Opaque comparison keys')).replace('export async function', 'async function') + '; return loadArticleTimelineKey')(null, canonicalizeTimelineEvents)
const groupedMaps = new Function('articlesRes', grouped.slice(grouped.indexOf('  const articleIdBySuffix = new Map()'), grouped.indexOf('  // Package 1 arc-grouped addition: per-event outlet index')) + '; return {articleIdBySuffix, articleArcBySuffix, outletByArticleId}')
const focusLine = view.split('\n').find(line => line.includes('const match =') && line.includes('pendingFocus'))
const focus = new Function('evt', 'pendingFocus', focusLine.trim() + '; return match(evt)')
const A = '1234abcd-0000-4000-8000-000000000001'
const B = '1234abcd-0000-4000-8000-000000000002'
const node = {id: 'event', slug: 'art-story-1234abcd', type: 'event'}
const articles = [{id: A, arc_id: 'arc-a', outlet: 'A'}, {id: B, arc_id: 'arc-b', outlet: 'B'}]

test('flat and grouped refuse colliding visible article prefixes in either order', () => {
  for (const rows of [articles, [...articles].reverse()]) {
    assert.equal(cross([node], new Map(), rows, []).articleIdBySuffix.size, 0)
    const result = groupedMaps({data: rows})
    assert.equal(result.articleIdBySuffix.size, 0)
    assert.equal(result.articleArcBySuffix.size, 0)
    assert.deepEqual(result.outletByArticleId, new Map(rows.map(a => [a.id, a.outlet])))
    assert.deepEqual(rows.map(a => a.id).sort(), [A, B])
  }
})
test('unique prefixes preserve article links and arcs', () => {
  assert.equal(cross([node], new Map(), [articles[0]], []).articleIdBySuffix.get('1234abcd'), A)
  const result = groupedMaps({data: [articles[0]]})
  assert.equal(result.articleIdBySuffix.get('1234abcd'), A)
  assert.equal(result.articleArcBySuffix.get('1234abcd'), 'arc-a')
})
function client(prefixRows, prefixError = null, nodes = [node], fallback = articles[0], nodeError = null, memberships = [{event_node_id:node.id, article_id:A}], membershipError = null) {
  const calls = []
  return {calls, from(table) {
    const call = {table, ops: []}; calls.push(call)
    const q = {}
    for (const method of ['select', 'gte', 'lte', 'eq', 'like', 'limit', 'in']) q[method] = (...args) => {call.ops.push([method, ...args]); return q}
    q.maybeSingle = () => Promise.resolve({data: fallback, error: null})
    q.then = (ok, bad) => Promise.resolve(table === 'graph_event_article_memberships' ? {data:memberships, error:membershipError} : table === 'articles' ? {data: prefixRows, error: prefixError} : {data: nodes, error: nodeError}).then(ok, bad)
    return q
  }}
}
test('News refuses collision, zero rows, wrong full ID, and unreadable prefixes without fallback', async () => {
  for (const [rows, error] of [[[articles[0], articles[1]], null], [[], null], [[articles[1]], null], [null, {code:'42501'}]]) {
    const db = client(rows, error)
    assert.equal(await news(A, {supabaseClient: db}), null)
    assert.deepEqual(db.calls.map(c => c.table), ['articles'])
  }
})
test('unique News prefix returns exact event ID with validated bounded UUID range', async () => {
  const db = client([articles[0]])
  assert.equal(await news(A, {supabaseClient: db}), 'event')
  assert.deepEqual(db.calls[0].ops, [
    ['select', 'id'], ['gte', 'id', '1234abcd-0000-0000-0000-000000000000'],
    ['lte', 'id', '1234abcd-ffff-ffff-ffff-ffffffffffff'], ['limit', 2],
  ])
})
test('invalid UUID never becomes a query and absent clients remain unavailable', async () => {
  const db = client([articles[0]])
  for (const id of ['1234abcd', A + ',id.gt.0', 'not-a-uuid']) assert.equal(await news(id, {supabaseClient: db}), null)
  assert.equal(db.calls.length, 0)
  assert.equal(await news(A, {supabaseClient: null}), null)
})
test('unique no-node path preserves existing full-ID fallback without inventing an arc', async () => {
  assert.equal(await news(A, {supabaseClient: client([articles[0]], null, [])}), 'article-' + A)
  assert.equal(await news(A, {supabaseClient: client([articles[0]], null, [], {id:A, arc_id:null})}), null)
})
test('grouped completion accepts actual exact keys and legacy suffix, never a missing key', () => {
  assert.equal(focus({id:'article-' + A, slug:'article-' + A}, 'article-' + A), true)
  assert.equal(focus(node, '1234abcd'), true)
  assert.equal(focus({id:'article-' + A, slug:'article-' + A}, 'article-' + B), false)
})

test('collision refusal preserves full-ID reporting records and direct node arcs', () => {
  const records = new Function('articlesRes', grouped.slice(grouped.indexOf('  const articleRecords = articlesRes.data'), grouped.indexOf('  const grouped = buildArcSections(', grouped.indexOf('  const articleRecords = articlesRes.data'))) + '; return articleRecords')({data: articles})
  assert.deepEqual(records.map(row => [row.id, row.article_id, row.arc_id]), [
    ['article-' + A, A, 'arc-a'], ['article-' + B, B, 'arc-b'],
  ])
  const resolve = new Function(grouped.slice(grouped.indexOf('export function resolveEventArc'), grouped.indexOf('// Build the canonical-key')).replace('export function', 'function') + '; return resolveEventArc')()
  const maps = groupedMaps({data: articles})
  assert.deepEqual(resolve({...node, arc_id:'direct'}, new Map(), maps.articleArcBySuffix), {arcId:'direct', resolution:'direct'})
  assert.deepEqual(resolve(node, new Map(), maps.articleArcBySuffix), {arcId:null, resolution:null})
})

test('ambiguous nodes never return a suffix or arbitrary first event', async () => {
  const nodes = [
    {id:'alpha', type:'event', slug:'evt-alpha-1234abcd'},
    {id:'beta', type:'event', slug:'art-beta-1234abcd'},
  ]
  for (const candidates of [nodes, [...nodes].reverse()]) {
    const db = client([articles[0]], null, candidates)
    assert.equal(await news(A, {supabaseClient: db}), 'article-' + A)
    assert.deepEqual(db.calls[1].ops, [
      ['select', 'id, slug, type'], ['eq', 'type', 'event'],
      ['like', 'slug', '%1234abcd'], ['limit', 3],
    ])
    assert.equal(await news(A, {supabaseClient: client([articles[0]], null, candidates, {id:A, arc_id:null})}), null)
  }
})
test('unreadable event results never become an article fallback', async () => {
  for (const [nodes, error] of [[[node], {code:'42501'}], [null, null]]) {
    const db = client([articles[0]], null, nodes, articles[0], error)
    assert.equal(await news(A, {supabaseClient: db}), null)
    assert.equal(db.calls.length, 2)
  }
})
test('fallback requires the requested full article identity', async () => {
  assert.equal(await news(A, {supabaseClient: client([articles[0]], null, [], articles[1])}), null)
})

test('normal exact-body mirror pair retains canonical evt link without an arc', async () => {
  const pair = [{id:'evt-id', type:'event', slug:'evt-story-1234abcd'}, {id:'art-id', type:'event', slug:'art-story-1234abcd'}]
  for (const rows of [pair, [...pair].reverse()]) for (const member of pair) {
    const db = client([articles[0]], null, rows, {id:A, arc_id:null}, null, [{article_id:A, event_node_id:member.id}])
    assert.equal(await news(A, {supabaseClient:db}), 'evt-id')
    assert.deepEqual(db.calls[2].ops, [
      ['select', 'event_node_id, article_id'], ['eq', 'article_id', A],
      ['in', 'event_node_id', rows.map(row => row.id)], ['limit', 2],
    ])
    assert.equal(db.calls.length, 3, 'positive membership does not need fallback')
  }
})
test('singleton suffix hint requires positive full-ID membership even when prefix appears unique', async () => {
  for (const [members, error] of [
    [[], null], [null, {code:'42501'}], [null, {code:'42P01'}],
    [[{article_id:B, event_node_id:node.id}], null],
    [[{article_id:A, event_node_id:'unrelated'}], null],
  ]) {
    assert.equal(await news(A, {supabaseClient:client([articles[0]], null, [node], articles[0], null, members, error)}), 'article-' + A)
    assert.equal(await news(A, {supabaseClient:client([articles[0]], null, [node], {id:A, arc_id:null}, null, members, error)}), null)
  }
})
test('third candidate, mismatched pair, and malformed node cannot authorize a graph destination', async () => {
  const pair = [{id:'evt-id', type:'event', slug:'evt-story-1234abcd'}, {id:'art-id', type:'event', slug:'art-story-1234abcd'}]
  for (const rows of [
    [...pair, {...node, id:'third'}],
    [pair[0], {...pair[1], slug:'art-other-1234abcd'}],
    [{...node, type:'actor'}], [{...node, slug:'art-other-ffffffff'}], [{...node, id:''}],
  ]) {
    const db = client([articles[0]], null, rows)
    assert.equal(await news(A, {supabaseClient:db}), 'article-' + A)
    assert.ok(!db.calls.some(call => call.table === 'graph_event_article_memberships'))
  }
})
test('exact-body mirror pair without membership uses only full-ID fallback or null', async () => {
  const pair = [{id:'evt-id', type:'event', slug:'evt-story-1234abcd'}, {id:'art-id', type:'event', slug:'art-story-1234abcd'}]
  assert.equal(await news(A, {supabaseClient:client([articles[0]], null, pair, articles[0], null, [])}), 'article-' + A)
  assert.equal(await news(A, {supabaseClient:client([articles[0]], null, pair, {id:A, arc_id:null}, null, [])}), null)
})
