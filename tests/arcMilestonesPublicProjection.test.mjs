import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const supabaseSource = await readFile(new URL('../src/lib/supabase.js', import.meta.url), 'utf8')
const groupedSource = await readFile(new URL('../src/lib/arcGroupedTimeline.js', import.meta.url), 'utf8')
const arcsLoader = supabaseSource.slice(
  supabaseSource.indexOf('export async function loadArcs'),
  supabaseSource.indexOf('// Milestones + consequence events for one arc.'),
)
const arcDetailLoader = supabaseSource.slice(
  supabaseSource.indexOf('export async function loadArcDetail'),
  supabaseSource.indexOf('// Doc 05 pairs 1–3 support:'),
)

test('public Story Arc loaders use only arc_milestones_public for milestone data', () => {
  assert.match(arcsLoader, /'arc_milestones_public'/)
  assert.doesNotMatch(arcsLoader, /'arc_milestones'/)
  assert.match(arcDetailLoader, /from\('arc_milestones_public'\)/)
  assert.doesNotMatch(arcDetailLoader, /from\('arc_milestones'\)/)
})

test('public Arc status loaders retain the documented 14-day default without reading pipeline_config', () => {
  assert.match(arcsLoader, /PUBLIC_DORMANT_ARC_DAYS/)
  assert.doesNotMatch(arcsLoader, /from\('pipeline_config'\)/)
  const groupedLoader = groupedSource.slice(
    groupedSource.indexOf('export async function loadArcGroupedTimeline'),
    groupedSource.length,
  )
  assert.match(groupedLoader, /'arc_milestones_public'/)
  assert.match(groupedLoader, /PUBLIC_DORMANT_ARC_DAYS/)
  assert.doesNotMatch(groupedLoader, /from\('pipeline_config'\)/)
})
