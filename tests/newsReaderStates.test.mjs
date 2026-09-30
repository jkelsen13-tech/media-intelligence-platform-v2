import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { createNewsBackend } from '../src/lib/newsBackend.js'
const output = new URL('./.compiled/news-reader-states.mjs', import.meta.url)
await mkdir(new URL('./.compiled/', import.meta.url), { recursive: true })
await build({ entryPoints: [fileURLToPath(new URL('../src/views/NewsView.jsx', import.meta.url))],
  outfile: fileURLToPath(output), bundle: true, platform: 'node', format: 'esm', packages: 'external',
  jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'import.meta.env': '{}' } })
const { default: NewsView } = await import(output.href)
const article = { id: 'fixture-1', title: 'Synthetic news story', summary: 'Fixture summary',
  outlet: 'Fixture publisher', published_at: '2026-09-01T12:00:00Z', url: 'https://example.invalid/story' }
const backend = loadArticles => ({ ...createNewsBackend(null), loadArticles })
const render = async b => { let r; await act(async () => { r = TestRenderer.create(React.createElement(NewsView, { backend: b, variant: 'drawer' })) }); return r }
const button = (r, text) => r.root.findAllByType('button').find(n => JSON.stringify(n.children.map(c => typeof c === 'string' ? c : '')).includes(text))
const list = r => r.root.findByProps({ 'aria-label': 'News stories' })
const text = r => JSON.stringify(r.toJSON())

test('pending feed, failure and retry are separate and do not present stale cards as current', async () => {
  const pending = []; const b = backend(() => new Promise((resolve, reject) => pending.push({ resolve, reject })))
  const r = await render(b)
  try {
    assert.equal(list(r).props.hidden, true); assert.match(text(r), /Loading news/)
    await act(async () => pending[0].reject(new Error('raw transport detail')))
    assert.match(text(r), /News could not be loaded/); assert.doesNotMatch(text(r), /raw transport detail/)
    await act(async () => button(r, 'Try again').props.onClick())
    assert.equal(pending.length, 2)
    await act(async () => pending[1].resolve({ articles: [article], total: 1 }))
    assert.equal(list(r).props.hidden, false); assert.match(text(r), /Synthetic news story/)
    const trigger = r.root.findByProps({ className: 'news-card-trigger' })
    assert.equal(trigger.props['aria-expanded'], false)
    assert.match(trigger.props['aria-label'], /Show evidence/)
  } finally { await act(async () => r.unmount()) }
})

test('malformed reader input has a retry state while denied data stays unavailable', async () => {
  const r = await render(backend(async () => ({ articles: [{}], total: 1 })))
  try { assert.match(text(r), /News could not be loaded/); assert.equal(list(r).props.hidden, true) }
  finally { await act(async () => r.unmount()) }
  const denied = await render(backend(async () => ({ articles: [], total: 0, articlesUnavailable: 'permission_denied' })))
  try { assert.match(text(denied), /permission denied/); assert.equal(list(denied).props.hidden, true) }
  finally { await act(async () => denied.unmount()) }
})

test('pagination progress prevents duplicate requests and a failure preserves valid first-page cards', async () => {
  let calls = 0, rejectMore
  const b = backend(() => ++calls === 1 ? Promise.resolve({ articles: [article], total: 2 })
    : new Promise((_, reject) => { rejectMore = reject }))
  const r = await render(b)
  try {
    await act(async () => { button(r, 'Load more').props.onClick(); button(r, 'Load more').props.onClick() })
    assert.equal(calls, 2); assert.equal(r.root.findByProps({ className: 'news-load-more' }).props.disabled, true)
    await act(async () => rejectMore(new Error('pagination failure')))
    assert.match(text(r), /More stories could not be loaded/)
    assert.equal(list(r).props.hidden, false)
    assert.equal(r.root.findByProps({ className: 'news-load-more' }).props.disabled, false)
  } finally { await act(async () => r.unmount()) }
})

test('mobile discovery dialog exposes modal semantics and Escape closes it', async () => {
  const r = await render(backend(async () => ({ articles: [], total: 0 })))
  try {
    await act(async () => r.root.findByProps({ className: 'news-filters-btn' }).props.onClick())
    const dialog = r.root.findByProps({ role: 'dialog', 'aria-label': 'Discovery filters' })
    assert.equal(dialog.props['aria-modal'], true)
    await act(async () => dialog.props.onKeyDown({ key: 'Escape' }))
    assert.equal(r.root.findAllByProps({ role: 'dialog' }).length, 0)
  } finally { await act(async () => r.unmount()) }
})
