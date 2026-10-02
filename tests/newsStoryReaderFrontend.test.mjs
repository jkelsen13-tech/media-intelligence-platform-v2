import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { createClient } from '@supabase/supabase-js'
import { createNewsBackend } from '../src/lib/newsBackend.js'
import { normalizePublicStoryContext } from '../src/lib/storyFollowingClient.js'
import { ownerNewsContext, EPOCH, HOUR, fixtureUuid } from './fixtures/newsStoryFixtures.mjs'

const output = new URL('./.compiled/news-story-reader-view.mjs', import.meta.url)
await mkdir(new URL('./.compiled/', import.meta.url), { recursive: true })
await build({ entryPoints: [fileURLToPath(new URL('../src/views/NewsView.jsx', import.meta.url))], outfile: fileURLToPath(output), bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'import.meta.env': '{}' } })
const { default: NewsView } = await import(output.href)
const serialized = renderer => JSON.stringify(renderer.toJSON())
const context = (specs, options) => normalizePublicStoryContext(ownerNewsContext(specs, options))
function fixture(raw) {
  const calls = []; let token = 'public-reader-A'
  const client = createClient('https://synthetic-news.invalid', 'fixture-key', { accessToken: async () => token,
    global: { fetch: async (input, init) => {
      const request = new Request(input, init); calls.push(request)
      const rpc = new URL(request.url).pathname.split('/').at(-1)
      assert.equal(rpc, 'read_reviewed_public_story_context_v1')
      return new Response(JSON.stringify(raw), { headers: { 'content-type': 'application/json' } })
    } },
  })
  return { backend: { ...createNewsBackend(null), loadStoryStateContext: createNewsBackend(client).loadStoryStateContext }, calls,
    setToken: value => token = value }
}
const mount = async props => { let renderer; await act(async () => { renderer = TestRenderer.create(React.createElement(NewsView, { variant: 'drawer', clockNow: EPOCH + HOUR, ...props })) }); return renderer }

test('actual SDK and mounted Story reader preserve reviewed source versions and state reason', async () => {
  const raw = ownerNewsContext(), f = fixture(raw)
  const renderer = await mount({ backend: f.backend, focusStoryId: raw.story.story_id, publicVersionId: raw.story.public_version_id })
  try {
    for (const copy of [/Breaking/, /Retained source summary/, /Material change effective time/, /State policy/]) assert.match(serialized(renderer), copy)
    assert.match(serialized(renderer), /Story Following|Sign in to follow/)
    assert.equal(f.calls.length, 1)
    assert.equal(f.calls[0].headers.get('authorization'), 'Bearer public-reader-A')
    const input = await f.calls[0].json()
    assert.equal(input.p_story_id, raw.story.story_id); assert.equal(input.p_public_version_id, raw.story.public_version_id)
    assert.ok(renderer.root.findAllByType('time').every(n => typeof n.props.dateTime === 'string'))
  } finally { await act(async () => renderer.unmount()) }
})

test('permitted report is visibly pending with separate report, fetch and retention clocks', async () => {
  const raw = ownerNewsContext([{ at: 0 }], { report: true }), f = fixture(raw)
  const renderer = await mount({ backend: f.backend, focusStoryId: raw.story.story_id, publicVersionId: raw.story.public_version_id })
  try {
    const text = serialized(renderer)
    assert.match(text, /BREAKING • SOURCE REPORT|Pending MIP verification|has not been independently established/)
    assert.match(text, /Exact source-version fetch time.*unavailable|Article original fetched time|Capture retained time/)
    assert.doesNotMatch(text, /Reviewed exact claim/)
    const state = renderer.root.findByProps({ 'aria-label': 'Story material-change state' })
    assert.match(JSON.stringify(state.toJSON?.() ?? state.children.map(n => typeof n === 'string' ? n : n.children)), /Story state unavailable/)
  } finally { await act(async () => renderer.unmount()) }
})

test('malformed, private, wrong-version and unavailable public context never render its source fields', async () => {
  const edits = [ raw => raw.story.review_state = 'pending', raw => raw.story.members[0].visibility_state = 'private',
    raw => raw.story.public_version_id = fixtureUuid(999), raw => raw.evidence_versions[0].capture_hash = 'wrong',
    raw => raw.material_changes[0].review_refs = [] ]
  for (const edit of edits) {
    const raw = ownerNewsContext(); const requested = raw.story.public_version_id; edit(raw)
    const f = fixture(raw), renderer = await mount({ backend: f.backend, focusStoryId: raw.story.story_id, publicVersionId: requested })
    try { assert.match(serialized(renderer), /exact story version is unavailable/); assert.doesNotMatch(serialized(renderer), /Retained source headline|Retained source summary/) }
    finally { await act(async () => renderer.unmount()) }
  }
})

test('story/version switching immediately hides old source data and discards late replies', async () => {
  const a = context(), rawB = ownerNewsContext(); rawB.story.story_id = fixtureUuid(3); rawB.material_changes.forEach(c => c.story_id = fixtureUuid(3))
  rawB.story.members[0].title = 'Only story B'
  const b = normalizePublicStoryContext(rawB)
  const pending = []
  const backend = { ...createNewsBackend(null), loadStoryStateContext: id => new Promise(resolve => pending.push({ id, resolve })) }
  const renderer = await mount({ backend, focusStoryId: a.story.story_id, publicVersionId: a.story.public_version_id })
  try {
    await act(async () => { renderer.update(React.createElement(NewsView, { backend, variant: 'drawer', clockNow: EPOCH + HOUR, focusStoryId: b.story.story_id, publicVersionId: b.story.public_version_id })) })
    await act(async () => pending.find(p => p.id === b.story.story_id).resolve({ data: b, error: null }))
    await act(async () => pending.find(p => p.id === a.story.story_id).resolve({ data: a, error: null }))
    assert.match(serialized(renderer), /Only story B/); assert.doesNotMatch(serialized(renderer), /Retained source headline/)
  } finally { await act(async () => renderer.unmount()) }
})

test('native Home shows admitted Breaking stories and attributed report urgency with exact Story route actions', async () => {
  const previousWindow = globalThis.window
  globalThis.window = { localStorage: { getItem: () => null, setItem() {} } }
  const established = context(), report = normalizePublicStoryContext(ownerNewsContext([{ at: 0 }], { report: true }))
  const rawReport = ownerNewsContext([{ at: 0 }], { report: true }); rawReport.story.story_id = fixtureUuid(3); rawReport.material_changes.forEach(c => c.story_id = fixtureUuid(3))
  const distinctReport = normalizePublicStoryContext(rawReport)
  const calls = [], opened = []
  const contexts = new Map([[established.story.story_id, established], [distinctReport.story.story_id, distinctReport]])
  const backend = { ...createNewsBackend(null),
    loadStoryDirectory: async () => ({ status: 'available', stories: [established.story, distinctReport.story], has_more: true }),
    loadStoryStateContext: async (id, options) => { calls.push({ id, options }); return { data: contexts.get(id), error: null } },
  }
  const renderer = await mount({ backend, variant: 'page', onOpenStory: value => opened.push(value) })
  try {
    assert.match(serialized(renderer), /Home \/ Breaking|BREAKING • SOURCE REPORT|Pending MIP verification|at most 30 reviewed stories/)
    assert.equal(calls.length, 2)
    assert.ok(calls.every(call => call.options.publicVersionId === contexts.get(call.id).story.public_version_id))
    const links = renderer.root.findAllByType('button').filter(button => button.children.includes('Read story →'))
    assert.equal(links.length, 2)
    await act(async () => links[0].props.onClick())
    assert.deepEqual(opened, [{ storyId: established.story.story_id, publicVersionId: established.story.public_version_id }])
    const following = renderer.root.findAllByType('button').find(button => button.children.includes('Following'))
    await act(async () => following.props.onClick())
    assert.match(serialized(renderer), /Sign in to see the stories you follow/)
    assert.equal(calls.length, 2)
  } finally { await act(async () => renderer.unmount()); globalThis.window = previousWindow }
})

test('feed opens only explicitly reviewed persistent story membership, never a page group identity', async () => {
  const story = context().story, opened = [], id = story.subject_id
  const source = story.members[0]
  const article = { id, title: source.title, summary: source.summary, outlet: source.source_outlet, url: source.source_url }
  const backend = { ...createNewsBackend(null), loadArticles: async () => ({ articles: [article], total: 1 }),
    loadArticleDetail: async () => ({ ...article, claims: [], evidenceRecords: [], citations: [] }),
    loadArticleStory: async () => ({ status: 'available', version: story }),
  }
  const renderer = await mount({ backend, onOpenStory: value => opened.push(value) })
  try {
    const title = renderer.root.findAllByType('h3').find(n => n.children.includes(article.title)); let button = title
    while (button.type !== 'button') button = button.parent
    await act(async () => button.props.onClick())
    const route = renderer.root.findAllByType('button').find(n => n.children.includes('Read story →'))
    assert.ok(route)
    await act(async () => route.props.onClick())
    assert.deepEqual(opened, [{ storyId: story.story_id, publicVersionId: story.public_version_id }])
  } finally { await act(async () => renderer.unmount()) }
})

test('switching from an already rendered Story withholds its title while the next exact version loads', async () => {
  const a = context(), nextId = fixtureUuid(8), pending = []
  const backend = { ...createNewsBackend(null), loadStoryStateContext: id => id === a.story.story_id
    ? Promise.resolve({ data: a, error: null }) : new Promise(resolve => pending.push(resolve)) }
  const renderer = await mount({ backend, focusStoryId: a.story.story_id, publicVersionId: a.story.public_version_id })
  try {
    assert.match(serialized(renderer), /Retained source headline/)
    await act(async () => renderer.update(React.createElement(NewsView, { backend, variant: 'drawer', clockNow: EPOCH + HOUR,
      focusStoryId: nextId, publicVersionId: a.story.public_version_id })))
    assert.doesNotMatch(serialized(renderer), /Retained source headline|Retained source summary/)
    assert.match(serialized(renderer), /Loading reviewed story/)
    await act(async () => pending[0]({ data: a, error: null }))
    assert.match(serialized(renderer), /exact story version is unavailable/)
    assert.doesNotMatch(serialized(renderer), /Retained source headline/)
  } finally { await act(async () => renderer.unmount()) }
})

test('source-report admission stays visibly attributed and pending in ordinary feed and both article detail paths', async () => {
  const { newsBackendFixture, reviewedNewsArticleFixture } = await import('./newsBackendFixture.mjs')
  const article = { id: fixtureUuid(1), title: 'Source-only development', outlet: 'Synthetic publisher', url: 'https://example.invalid/source-only',
    summary: 'Publisher reports a development.', published_at: '2026-10-01T00:00:00Z', fetched_at: '2026-10-01T01:00:00Z' }
  const row = reviewedNewsArticleFixture(article)
  row.public_version.admission_kind = 'source_report'; row.public_version.evidence = []
  for (const focused of [false, true]) {
    const f = newsBackendFixture({ tables: { news_reviewed_articles_public: [row] } })
    const backend = focused ? { ...f.backend, loadArticles: async () => ({ articles: [], total: 0 }) } : f.backend
    const renderer = await mount({ backend, focusArticleId: focused ? article.id : undefined })
    try {
      if (!focused) {
        assert.match(serialized(renderer), /SOURCE REPORT|Pending MIP verification/)
        const title = renderer.root.findAllByType('h3').find(n => n.children.includes(article.title)); let button = title
        while (button.type !== 'button') button = button.parent
        await act(async () => button.props.onClick())
      }
      const copy = serialized(renderer)
      assert.match(copy, /has not been independently established/)
      assert.match(copy, /Exact source-version fetch time.*unavailable/)
      assert.match(copy, /Remaining uncertainty.*Synthetic qualification/)
      assert.doesNotMatch(copy, /Synthetic reviewed fixture claim|BREAKING • SOURCE REPORT/)
    } finally { await act(async () => renderer.unmount()) }
  }
})

test('Story browsing does not reopen a prior investigation article and keeps raw identifiers in collapsed details', async () => {
  const c = context(), details = []
  const backend = { ...createNewsBackend(null), loadStoryStateContext: async () => ({ data: c, error: null }),
    loadArticleDetail: async id => { details.push(id); return null } }
  const renderer = await mount({ backend, focusStoryId: c.story.story_id, publicVersionId: c.story.public_version_id,
    focusArticleId: fixtureUuid(999), investigationContext: { canonical_subject_type: 'article', canonical_subject_id: fixtureUuid(998) } })
  try {
    assert.deepEqual(details, [])
    const disclosures = renderer.root.findAllByType('details').filter(item => item.props.className === 'news-version-details')
    assert.ok(disclosures.length >= 2)
    assert.ok(disclosures.every(item => item.props.open !== true))
    const rawIdentifier = renderer.root.findAllByType('code').find(item => item.children.includes(c.story.story_id))
    let parent = rawIdentifier.parent
    while (parent && parent.type !== 'details') parent = parent.parent
    assert.ok(parent)
  } finally { await act(async () => renderer.unmount()) }
})
