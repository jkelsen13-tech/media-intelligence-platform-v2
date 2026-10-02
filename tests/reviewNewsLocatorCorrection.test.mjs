import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import TestRenderer, { act } from 'react-test-renderer'
import { createNewsBackend } from '../src/lib/newsBackend.js'

const output = new URL('./.compiled/review-news-locator.mjs', import.meta.url)
await mkdir(new URL('./.compiled/', import.meta.url), { recursive: true })
await build({ entryPoints: [fileURLToPath(new URL('../src/views/NewsView.jsx', import.meta.url))], outfile: fileURLToPath(output), bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'import.meta.env': '{}' } })
const { default: NewsView } = await import(output.href)
const label = 'Recorded source locator (not a link)'
const recordedLocators = detail => detail.findAllByType('p').filter(node => node.children.some(child => typeof child === 'string' && child.includes(`${label}:`)))
const unsafe = [
  ['javascript', 'javascript:globalThis.LOCATOR_EXECUTED=true'],
  ['data', 'data:text/html,<script>globalThis.LOCATOR_EXECUTED=true</script>'],
  ['HTML-looking', '<img src="locator-fixture" onerror="globalThis.LOCATOR_EXECUTED=true">'],
]
// Serialize the mounted host tree through React DOM as an escaping control.
const hostElement = node => typeof node === 'string' ? node : React.createElement(node.type, node.props, ...(node.children ?? []).map(hostElement))
async function mounted(path, url, inspect) {
  const article = { id: 'locator-article', title: 'Synthetic recorded source', outlet: 'Fixture Publisher', url, summary: 'Synthetic summary.', published_at: '2026-10-01T12:00:00Z', claims: [], citations: [], evidenceRecords: [] }
  const backend = { ...createNewsBackend(null), loadArticles: async () => ({ articles: path === 'expanded list detail' ? [article] : [], total: path === 'expanded list detail' ? 1 : 0 }), loadArticleDetail: async () => article }
  let renderer
  await act(async () => { renderer = TestRenderer.create(React.createElement(NewsView, { backend, variant: 'drawer', focusArticleId: path === 'off-page focused detail' ? article.id : undefined })) })
  try {
    if (path === 'expanded list detail') {
      const title = renderer.root.findAllByType('h3').find(node => node.children.includes(article.title))
      let card = title
      while (card && card.type !== 'button') card = card.parent
      assert.ok(card)
      await act(async () => card.props.onClick())
    }
    const detail = renderer.root.findByProps({ className: 'news-detail' })
    await inspect(renderer, detail)
  } finally { await act(async () => renderer.unmount()) }
}
for (const path of ['expanded list detail', 'off-page focused detail']) {
  for (const [kind, locator] of unsafe) test(`${path}: ${kind} locator remains inspectable inert text`, async () => {
    await mounted(path, locator, (renderer, detail) => {
      const records = recordedLocators(detail)
      assert.equal(records.length, 1, 'focused original-source slot preserves a labelled rejected locator')
      const record = records[0]
      assert.equal(record.type, 'p')
      assert.ok(record.children.some(child => typeof child === 'string' && child.includes(`${label}:`)), 'the locator has a visible label')
      assert.equal(record.findByType('span').children.join(''), locator)
      assert.equal(record.findAllByType('a').length, 0)
      assert.equal(record.findAll(node => node.props.onClick || node.props.dangerouslySetInnerHTML).length, 0)
      assert.ok(renderer.root.findAllByType('a').every(node => /^https?:\/\//.test(node.props.href ?? '')))
      assert.equal(renderer.root.findAll(node => node.type === 'script' || (node.type === 'img' && node.props.src === 'locator-fixture')).length, 0)
      const markup = renderToStaticMarkup(hostElement(renderer.toJSON()))
      assert.ok(markup.includes(locator.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;')), 'React escapes the exact stored locator')
      assert.equal(globalThis.LOCATOR_EXECUTED, undefined)
    })
  })
  test(`${path}: safe HTTPS original source remains a normal external link`, async () => {
    const locator = 'https://publisher.example.invalid/article?record=1&section=2'
    await mounted(path, locator, (_renderer, detail) => {
      const link = detail.findByProps({ className: 'news-read-link' })
      assert.equal(link.props.href, locator)
      assert.equal(link.props.target, '_blank')
      assert.equal(link.props.rel, 'noreferrer')
      assert.match(link.children.join(''), /Read original at Fixture Publisher/)
      assert.equal(recordedLocators(detail).length, 0)
    })
  })
  test(`${path}: absent locator adds no invented recorded locator`, async () => {
    for (const locator of [null, undefined, '']) await mounted(path, locator, (_renderer, detail) => {
      assert.equal(recordedLocators(detail).length, 0)
      assert.equal(detail.findAllByProps({ className: 'news-read-link' }).length, 0)
    })
  })
}
