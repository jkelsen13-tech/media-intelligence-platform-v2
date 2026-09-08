import test from 'node:test'
import assert from 'node:assert/strict'
import { serializeDeepLink, hydrateDeepLink, parseDeepLink, applySelectionAgainstCatalog } from '../src/lib/deepLinks.js'
import { emptyInvestigationContext } from '../src/lib/investigationContext.js'

test('scrubbed instant and date-only or precise ranges survive independent share/reload',()=>{
  for (const range of [{from:'2024-04-08',to:null},{from:'2024-04-08T17:59:00Z',to:'2024-04-08T20:29:00Z'}]) {
    const ic={...emptyInvestigationContext('world'),canonical_subject_type:'event',canonical_subject_id:'event-1',
      selected_time_range:range,as_of_time:'2026-09-03T01:51:20.000Z'}
    const url=serializeDeepLink(ic)
    assert.match(url,/at=/)
    const restored=hydrateDeepLink(url).investigationContext
    assert.equal(restored.as_of_time,ic.as_of_time)
    assert.deepEqual(restored.selected_time_range,range)
    assert.equal(restored.canonical_subject_id,ic.canonical_subject_id)
  }
})

test('legacy time links keep their meaning and stale inspection parameters cannot override context',()=>{
  const old='#/event/event-1/world?time=2024-04-08..'
  const ic=hydrateDeepLink(old).investigationContext
  assert.equal(ic.as_of_time,'2024-04-08')
  assert.doesNotMatch(serializeDeepLink(ic,{at:'2030-01-01T00:00:00Z'}),/at=/)
  const precise=hydrateDeepLink('#/event/event-1/world?time=2024-04-08T17:59:00Z').investigationContext
  assert.equal(precise.as_of_time,'2024-04-08T17:59:00Z')
  assert.doesNotMatch(serializeDeepLink(precise),/at=/)
})

test('duplicate, malformed and offset-free inspection instants cannot silently override scoped time',()=>{
  for (const tail of ['at=bad','at=2024-04-08','at=2024-04-08T19:00:00','at=2030-01-01T00:00:00Z&at=2040-01-01T00:00:00Z']) {
    const restored=hydrateDeepLink('#/event/event-1/world?time=2024-04-08..&'+tail).investigationContext
    assert.equal(restored.as_of_time,'2024-04-08')
  }
  const applied=applySelectionAgainstCatalog({at:'bad'}, {},'event-1')
  assert.equal(applied.selection.at,undefined); assert.equal(applied.fallbacks[0].kind,'at')
  assert.equal(parseDeepLink('#/event/event-1/world?at=bad&at=worse').selection.at,undefined)
})
