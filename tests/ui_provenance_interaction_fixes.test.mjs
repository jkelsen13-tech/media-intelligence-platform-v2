import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const globe = readFileSync(new URL('../src/graph/GeographyGlobe.jsx', import.meta.url), 'utf8')
const modePanel = readFileSync(new URL('../src/graph/GraphModePanel.jsx', import.meta.url), 'utf8')
const arcEvidence = readFileSync(new URL('../src/components/ArcEvidencePanel.jsx', import.meta.url), 'utf8')
const arcs = readFileSync(new URL('../src/views/ArcsView.jsx', import.meta.url), 'utf8')
const news = readFileSync(new URL('../src/views/NewsView.jsx', import.meta.url), 'utf8')
const supabaseReadPath = readFileSync(new URL('../src/lib/supabase.js', import.meta.url), 'utf8')

test('interactive globe uses local public-data geography and preserves source-backed marker semantics', () => {
  assert.match(globe, /world-atlas\/countries-110m\.json/)
  assert.match(globe, /topojson-client/)
  assert.match(globe, /geoDistance/)
  assert.match(globe, /onPointerDown=/)
  assert.match(globe, /onPointerMove=/)
  assert.match(globe, /onKeyDown={onKeyDown}/)
  assert.match(globe, /Marker size represents only the number of confirmed location mentions/)
  assert.match(globe, /role="button"/)
  assert.match(modePanel, /Public-domain Natural Earth land and country boundaries/)
})

test('relationship canvas exposes the bounded geography overlay and ignores null edge-clear callbacks', () => {
  assert.match(app, /graph-geography-overlay/)
  assert.match(app, /graphLocationSummary\.confirmedMappable/)
  assert.match(app, /if \(!selection\?\.edge\)/)
  assert.match(app, /setEdgeEvidence\(null\)/)
})

test('Arc Overview contains status context while Evidence remains an attached source inventory', () => {
  assert.match(arcEvidence, /export function ArcOverviewStatus/)
  assert.match(arcEvidence, /Evidence only: attached publisher records/)
  assert.match(arcs, /<ArcOverviewStatus arc={selected} detail={detail} arcArticles={arcArticles} \/>/)
  assert.match(arcs, /<ArcEvidencePanel arcArticles={arcArticles} onOpenArticle={onOpenArticle} \/>/)
  assert.doesNotMatch(arcs, /Sources: \{outlets\.join/)
})

test('News makes publisher records and extraction gaps visible without fabricating claim-level metadata', () => {
  assert.match(news, /Publisher source record/)
  assert.match(news, /Publisher source URL recorded/)
  assert.match(news, /No author byline is stored\. This is a metadata gap/)
  assert.match(news, /No structured substantive claims have been extracted yet/)
  assert.match(news, /No structured framing markers have been extracted yet/)
  assert.match(news, /No additional structured citation records have been extracted/)
  assert.match(news, /byline not recorded/)
})

test('News reads existing reviewed claim and linked-evidence records without relabeling them as extracted citations', () => {
  assert.match(supabaseReadPath, /from\('article_claims'\)/)
  assert.match(supabaseReadPath, /from\('claim_evidence_links'\)/)
  assert.match(supabaseReadPath, /provenance: 'reviewed_claim_record'/)
  assert.match(news, /Linked evidence records/)
  assert.match(news, /Open linked evidence record/)
})
