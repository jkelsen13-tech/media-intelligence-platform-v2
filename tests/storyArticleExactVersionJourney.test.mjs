import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { storyArticleVersionJourneyFixture, compileStoryArticleApp } from './fixtures/storyArticleVersionJourney.mjs'

const out = new URL('./.compiled/App-story-article-exact-version.mjs', import.meta.url)
await compileStoryArticleApp(out.pathname)
const text = n => n == null ? '' : Array.isArray(n) ? n.map(text).join('') : typeof n === 'object' ? text(n.children ?? n.props?.children) : String(n)
const settle = async () => { for (let i = 0; i < 6; i++) await act(async () => new Promise(resolve => setImmediate(resolve))) }

test('restored SQL → installed SDK → actual mounted App/Story button/News detail preserves historical member ownership', async t => {
  const f = await storyArticleVersionJourneyFixture(); t.after(() => f.db.close())
  const location = { hash: `#/story/${f.v1.story_id}?version=${f.v1.public_version_id}`, pathname: '/', search: '' }, listeners = new Map()
  globalThis.window = { location, localStorage: { getItem: () => null, setItem() {} }, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener: (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn) },
    removeEventListener: (name, fn) => listeners.get(name)?.delete(fn), history: { replaceState(_s, _t, url) { location.hash = url.slice(url.indexOf('#')) } } }
  globalThis.document = { activeElement: null }
  globalThis.__storyArticleBackend = f.backend
  const { default: App } = await import(out.href)
  let tree
  const props = (actor = f.viewer, ready = true) => ({ authSessionOverride: { user: { id: actor }, loading: !ready } })
  const shown = () => text(tree.toJSON())
  const news = () => tree.root.find(n => typeof n.type === 'function' && n.type.name === 'NewsView')
  const selected = () => tree.root.findAllByProps({ 'aria-label': 'Selected reviewed source' })[0]
  const button = label => tree.root.findAllByType('button').find(n => text(n.props.children) === label)
  const click = async label => { const b = button(label); assert.ok(b, label); await act(async () => b.props.onClick()); await settle() }
  const navigate = async story => { await act(async () => { location.hash = `#/story/${story.story_id}?version=${story.public_version_id}`; for (const fn of listeners.get('hashchange') ?? []) fn() }); await settle() }
  const mount = async () => { f.setActor(f.viewer); f.alterArticle(null); f.followingFailure('service_unavailable'); await act(async () => { tree = TestRenderer.create(React.createElement(App, props())) }); await settle() }
  const unmount = async () => { f.held()?.release(); if (tree) await act(async () => tree.unmount()); tree = null }
  const exactCalls = () => f.calls.filter(c => c.name === 'read_reviewed_public_article_v1')
  const initialNews = f.backend.publicData.news
  t.afterEach(async () => { await unmount(); await f.db.exec('rollback'); f.backend.publicData.news = initialNews; f.alterArticle(null) })
  t.after(unmount)

  await t.test('two capture versions reproduce current fallback before repair and preserve selected historical evidence after repair', async () => {
    await f.db.exec('begin'); await mount()
    const before = exactCalls().length
    assert.equal((await f.backend.publicData.news.loadArticleDetail(f.first.article_id)).public_version_id, f.secondArticleVersion)
    assert.equal(f.v1.members[0].public_version_id, f.firstVersion)
    assert.notEqual(f.correction.capture_id, f.first.capture_id)
    await click('Open article evidence')
    assert.equal(exactCalls().length, before + 1)
    assert.deepEqual(exactCalls().at(-1).input, { p_article_id: f.first.article_id, p_public_version_id: f.firstVersion })
    assert.equal(news().props.storyArticleSelection.member.capture_id, f.first.capture_id)
    assert.equal(news().props.storyArticleSelection.member.capture_hash, f.first.capture_hash)
    const detail = text(selected())
    assert.match(detail, new RegExp(f.firstVersion)); assert.match(detail, new RegExp(f.first.capture_id)); assert.match(detail, new RegExp(f.first.capture_hash))
    assert.match(detail, /earlier reviewed decision remains authorized|A source reports a vessel arrival/)
    assert.doesNotMatch(detail, /NEWER_REPORT_|CURRENT_ANALYTICAL_HEAD_TOKEN|CURRENT_OUTLET_REGION_TOKEN/)
    assert.doesNotMatch(detail, /monoculture|byline not recorded/)
    assert.match(detail, /Analytical links for this exact source version are unavailable/)
    assert.equal(f.ancillary.length, 0)
    const retained = news().props.storyArticleSelection
    await click('Investigate in graph'); await click('Fixture News')
    assert.equal(location.hash, `#/story/${f.v1.story_id}?version=${f.v1.public_version_id}`)
    assert.deepEqual(news().props.storyArticleSelection, retained)
    assert.match(text(selected()), new RegExp(f.first.capture_id))
    assert.equal(exactCalls().at(-1).input.p_public_version_id, f.firstVersion)
    assert.equal(f.ancillary.length, 0)
    await unmount(); await f.db.exec('rollback')
  })
  await t.test('withdrawn selected proposition closes cached Story and detail without readable newer-report fallback', async () => {
    await f.db.exec('begin'); await mount()
    await f.db.query('update public.article_claims set is_current=false where id=$1', [f.article_claim_id])
    assert.equal(await f.readArticle(f.first.article_id, f.firstVersion), null)
    assert.equal((await f.readArticle(f.first.article_id)).public_version_id, f.secondArticleVersion)
    const before = f.calls.length
    await click('Open article evidence')
    assert.match(shown(), /selected reviewed source version is unavailable|exact story version is unavailable/)
    assert.doesNotMatch(shown(), /NEWER_REPORT_|A source reports a vessel arrival|earlier reviewed decision remains authorized/)
    assert.ok(f.calls.slice(before).every(c => c.name !== 'news_reviewed_articles_public'))
    assert.equal(exactCalls().at(-1).input.p_public_version_id, f.firstVersion)
    assert.equal(f.ancillary.length, 0)
    await unmount(); await f.db.exec('rollback')
  })
  await t.test('historical captions and badges never inherit a newer proposition byline, classification or current outlet region', async () => {
    await f.db.exec('begin')
    const author = await f.scalar("insert into public.authors(name,normalized_name) values('NEWER_REPORT_AUTHOR_TOKEN','synthetic newer report author') returning id")
    await f.db.query('update public.articles set author_id=$1,unattributed=true,monoculture=true where id=$2', [author, f.first.article_id])
    const v3 = await f.bindArticle(f.first, { review: 'synthetic-newer-byline-review', predecessor: f.secondArticleVersion, reason: 'Synthetic proposition review with independently captured display metadata.' })
    assert.equal((await f.readArticle(f.first.article_id)).display_metadata.author_name, 'NEWER_REPORT_AUTHOR_TOKEN')
    await mount(); await click('Open article evidence')
    assert.equal(exactCalls().at(-1).input.p_public_version_id, f.firstVersion)
    assert.notEqual(v3, f.firstVersion)
    assert.doesNotMatch(text(selected()), /NEWER_REPORT_|monoculture|byline not recorded|CURRENT_OUTLET_REGION_TOKEN/)
    assert.match(text(selected()), /No author byline is stored|Region not recorded/)
    assert.equal(f.ancillary.length, 0)
    await unmount(); await f.db.exec('rollback')
  })
  await t.test('selecting evidence from a head route pins the displayed Story decision before a newer collection is admitted', async () => {
    await f.db.exec('begin'); await mount()
    const beforeId = await f.bindStory([f.firstVersion], { review: 'synthetic-story-head-v3', predecessor: f.v2.public_version_id, reason: 'Synthetic reviewed collection of retained historical evidence.' })
    const head = await f.readStory(f.v1.story_id, beforeId)
    await act(async () => { location.hash = `#/story/${head.story_id}`; for (const fn of listeners.get('hashchange') ?? []) fn() }); await settle()
    assert.equal(news().props.publicVersionId, null)
    await click('Open article evidence')
    assert.equal(news().props.publicVersionId, beforeId)
    assert.equal(news().props.storyArticleSelection.storyVersionId, beforeId)
    const nextId = await f.bindStory([f.firstVersion, f.secondVersion], { review: 'synthetic-story-head-v4', predecessor: beforeId, reason: 'Synthetic later collection keeps the older member and adds a report.' })
    assert.equal((await f.readStory(head.story_id)).public_version_id, nextId)
    await click('Fixture Graph'); await click('Fixture News')
    assert.equal(location.hash, `#/story/${head.story_id}?version=${beforeId}`)
    assert.equal(news().props.publicVersionId, beforeId)
    assert.equal(news().props.storyArticleSelection.storyVersionId, beforeId)
    assert.match(text(selected()), new RegExp(f.first.capture_id))
    assert.doesNotMatch(shown(), new RegExp(nextId))
    assert.equal(f.calls.filter(c => c.name === 'read_reviewed_public_story_context_v1').at(-1).input.p_public_version_id, beforeId)
    await unmount(); await f.db.exec('rollback')
  })
  await t.test('mixed capture, evidence and immutable caption fields are refused despite a retained decision ID', async () => {
    const edits = [d => { d.title = 'MIXED_HEAD_TITLE_TOKEN' }, d => { d.summary = 'MIXED_HEAD_SUMMARY_TOKEN' },
      d => { d.source_url = 'https://example.invalid/mixed-head' }, d => { d.source_outlet = 'MIXED_HEAD_OUTLET_TOKEN' },
      d => { d.display_metadata.author_name = 'MIXED_HEAD_AUTHOR_TOKEN' }, d => { d.review_ref = 'mixed-head-review' },
      d => { d.capture_hash = '0'.repeat(64); d.evidence.forEach(e => { e.capture_hash = d.capture_hash }) },
      d => { d.evidence[0].canonical_text = 'MIXED_HEAD_CLAIM_TOKEN' }]
    for (const edit of edits) {
      await mount(); f.alterArticle(d => { edit(d); return d }); await click('Open article evidence')
      assert.match(shown(), /selected reviewed source version is unavailable|exact story version is unavailable/)
      assert.doesNotMatch(shown(), /MIXED_HEAD_|NEWER_REPORT_/)
      await unmount()
    }
  })
  await t.test('account readiness and delayed account response cannot restore an earlier detail binding', async () => {
    await mount(); await click('Open article evidence'); assert.ok(selected())
    f.holdNextArticle()
    await act(async () => tree.update(React.createElement(App, props(f.viewer, false)))); await settle()
    assert.doesNotMatch(text(selected()), /Recorded vessel source report|A source reports a vessel arrival|Exact capture digest/)
    await act(async () => tree.update(React.createElement(App, props(f.viewer)))); await settle(); assert.ok(f.held())
    f.held().data.is_current_source_version = true; f.held().data.superseded_by_public_version_id = null
    f.setActor(f.secondUser)
    await act(async () => tree.update(React.createElement(App, props(f.secondUser)))); await settle()
    assert.match(text(selected()), new RegExp(f.first.capture_id))
    assert.equal(exactCalls().at(-1).actor, `Bearer ${f.secondUser}`)
    f.held().release(); await settle()
    assert.equal(news().props.readerActorId, f.secondUser)
    assert.match(text(selected()), new RegExp(f.firstVersion))
    assert.match(text(selected()), /earlier reviewed decision remains authorized/)
    assert.doesNotMatch(text(selected()), /selected current reviewed decision/)
    await unmount()
  })
  await t.test('replacing the bound News client clears old detail and prevents delayed old-backend captions', async () => {
    await mount(); f.holdNextArticle(); await click('Open article evidence'); assert.ok(f.held())
    f.held().data.title = 'STALE_BACKEND_TITLE_TOKEN'
    const original = f.backend.publicData.news
    f.backend.publicData.news = { ...original }
    await act(async () => tree.update(React.createElement(App, props()))); await settle()
    assert.match(text(selected()), new RegExp(f.first.capture_id))
    f.held().release(); await settle()
    assert.doesNotMatch(shown(), /STALE_BACKEND_TITLE_TOKEN/)
    assert.match(text(selected()), /earlier reviewed decision remains authorized/)
    await unmount(); f.backend.publicData.news = original
  })
  await t.test('Story switch and denied exact context reload discard held old article details', async () => {
    await f.db.exec('begin'); await mount(); f.holdNextArticle(); await click('Open article evidence'); assert.ok(f.held())
    await navigate(f.v2)
    assert.equal(news().props.storyArticleSelection, null)
    assert.equal(selected(), undefined)
    f.held().release(); await settle()
    assert.equal(selected(), undefined); assert.doesNotMatch(shown(), /A source reports a vessel arrival|earlier reviewed decision remains authorized/)
    await navigate(f.v1); f.holdNextArticle(); await click('Open article evidence'); assert.ok(f.held())
    await f.db.query('update public.article_claims set is_current=false where id=$1', [f.article_claim_id])
    f.followingFailure('access_denied'); await click('Reload story Following')
    assert.match(shown(), /exact story version is unavailable/)
    assert.equal(selected(), undefined)
    f.held().release(); await settle()
    assert.doesNotMatch(shown(), /A source reports a vessel arrival|Exact capture digest|earlier reviewed decision remains authorized/)
    assert.equal(selected(), undefined)
    await unmount(); await f.db.exec('rollback')
  })
})
