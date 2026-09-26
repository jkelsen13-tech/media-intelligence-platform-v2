import test from 'node:test'
import assert from 'node:assert/strict'
import { comparisonBackendFixture, comparisonRow } from './comparisonBackendFixture.mjs'

test('public accepted comparison never promotes legacy dates to verified occurrence or generation time', async () => {
 const row=comparisonRow()
 row.occurred_at_start='2026-08-03'
 row.occurred_at_end='2026-08-04'
 const f=comparisonBackendFixture({tables:{comparison_public:[row]}})
 const view=await f.backend.loadSourceComparisonView(),event=view.events[0]
 assert.equal(event.occurredAtStart,null)
 assert.equal(event.occurredAtEnd,null)
 assert.deepEqual(event.occurrence,{state:'unverified',start:null,end:null,precision:'unknown'})
 assert.deepEqual(event.retainedEventDateProxy,{
  kind:'unverified_event_date_proxy',basis:'publication_derived_or_unknown',
  occurrenceVerified:false,start:row.occurred_at_start,end:row.occurred_at_end,
  sourceFields:['comparison_public.occurred_at_start','comparison_public.occurred_at_end'],
  precision:'unknown'
 })
 assert.deepEqual(event.generationObservation,{state:'unavailable',at:null})
 assert.equal(event.claims[0].surfaces[0].publishedAt,row.articles[0].published_at)
 assert.equal(event.timing.find(x=>x.outlet===row.articles[0].outlet).firstPublishedAt,row.articles[0].published_at)
 assert.equal(view.sortBasis,'unverified_event_date_proxy')
})

test('proxy browsing order is explicit and deterministic; publication dates never fill undated occurrence', async () => {
 const early=comparisonRow(1),late=comparisonRow(2),undated=comparisonRow(3),tie=comparisonRow(4)
 early.occurred_at_start='2026-01-01';late.occurred_at_start='2026-09-01'
 undated.occurred_at_start=null;undated.occurred_at_end=null;tie.occurred_at_start=late.occurred_at_start
 // Publication order intentionally disagrees with legacy-date browsing order.
 early.articles.forEach(a=>{a.published_at='2026-12-01T12:00:00Z'})
 late.articles.forEach(a=>{a.published_at='2026-02-01T12:00:00Z'})
 const f=comparisonBackendFixture({tables:{comparison_public:[undated,tie,early,late]}})
 const view=await f.backend.loadSourceComparisonView()
 assert.deepEqual(view.events.map(e=>e.id),[late.event_key,tie.event_key,early.event_key,undated.event_key])
 assert.equal(view.events.at(-1).retainedEventDateProxy.start,null)
 assert.equal(view.events.at(-1).retainedEventDateProxy.end,null)
 assert.ok(view.events.every(e=>e.occurrence.start===null&&e.occurrence.end===null))
 assert.equal(view.sortBasis,'unverified_event_date_proxy')
 const empty=await comparisonBackendFixture({tables:{comparison_public:[]}}).backend.loadSourceComparisonView()
 assert.deepEqual(empty.events,[])
 assert.equal(empty.enabled,true)
})
