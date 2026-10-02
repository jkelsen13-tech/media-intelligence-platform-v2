import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { createElement } from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { comparisonBackendFixture, comparisonRow } from './comparisonBackendFixture.mjs'
mkdirSync(new URL('./.compiled/', import.meta.url), { recursive: true })
async function compile(name) {
  const output = new URL(`./.compiled/security-${name}.mjs`, import.meta.url)
  await build({ entryPoints: [fileURLToPath(new URL(`../src/views/${name}.jsx`, import.meta.url))], outfile: fileURLToPath(output),
    bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'import.meta.env': '{}' } })
  return (await import(output.href)).default
}
const Comparison = await compile('SourceComparisonView')
const Phase3 = await compile('Phase3View')

test('source comparison renders unsafe supplied locators without executable links', async () => {
  const fixture = comparisonBackendFixture({ tables: { comparison_public: [comparisonRow()] } })
  const projection = structuredClone(await fixture.backend.loadSourceComparisonView())
  const claim = projection.events[0].claims[0]
  claim.surfaces[0].url = 'javascript:alert(1)'
  claim.evidenceLinks[0].evidence_url = 'https://user:pass@example.invalid/'
  claim.evidenceLinks.push({ id: 'safe-control', evidence_url: 'https://example.invalid/control', evidence_type: 'primary_document' })
  const backend = { loadSourceComparisonView: async () => projection }
  let renderer
  await act(async () => { renderer = TestRenderer.create(createElement(Comparison, { backend })) })
  const links = renderer.root.findAllByType('a')
  assert.ok(links.length, 'safe control source links still render')
  assert.ok(links.every((link) => /^https?:\/\//.test(link.props.href) && !link.props.href.includes('user:pass')))
  assert.match(JSON.stringify(renderer.toJSON()), /not opened as a link/)
  await act(async () => renderer.unmount())
})

test('legal evidence keeps hostile source URLs as text and retains the safe control link', async () => {
  const backend = { loadPhase3BetaView: async () => ({ enabled: true, policies: [], cases: [{ id: 'case', title: 'Case',
    tracks: [{ track: 'supporting', rows: [
      { id: 'unsafe', description: 'Unsafe locator', source_url: 'javascript:alert(1)' },
      { id: 'safe', description: 'Safe locator', source_url: 'https://example.invalid/source' },
    ] }],
  }] }) }
  let renderer
  await act(async () => { renderer = TestRenderer.create(createElement(Phase3, { backend })) })
  assert.deepEqual(renderer.root.findAllByType('a').map((link) => link.props.href), ['https://example.invalid/source'])
  assert.match(JSON.stringify(renderer.toJSON()), /not opened as a link/)
  await act(async () => renderer.unmount())
})
