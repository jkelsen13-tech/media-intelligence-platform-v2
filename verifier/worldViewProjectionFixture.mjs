// Synthetic display-only geometry, fulfilled only in a disposable browser.
// Existing reader columns, row identity, dates, privacy and release fields stay
// intact. No fixture is sent to a backend or claimed as observed geography.
import assert from 'node:assert/strict'
export const QUALIFICATION_SUBJECT='acc55cb2-5ac2-4aed-be36-3f576d2bc443'
const columns='projection_contract_version,mip_object_id,object_type,subject_graph_node_id,subject_snapshot_hash,revision_id,revision_ordinal,superseded_by_revision_id,spatial_role,relationship_qualifier,canonical_place_id,place_snapshot_hash,precision_class,valid_time_precision,source_native_time,valid_from_utc,valid_to_utc,revision_known_at_utc,review_effective_at_utc,release_effective_at_utc,review_state,release_state,uncertainty_class,uncertainty_note,confidence,confidence_status,display_hint,display_geometry,geometry_status,evidence_refs'.split(',')
export function qualificationCoordinates(kind){
  const center=[-81.7,41.4]
  if(kind==='dense')return Array.from({length:500},(_,i)=>[center[0]+(i%20)*0.0001,center[1]+Math.floor(i/20)*0.0001])
  assert.equal(kind,'sparse')
  return [center,[-81.4,41.4],[-82,41.4],[-81.7,41.6],[98.3,-41.4]]
}
export async function installProjectionFixture(page,kind){
  const coordinates=qualificationCoordinates(kind), receipt={kind,coordinateCount:coordinates.length,readerRequests:0,matchedRows:0}
  const serialized=JSON.stringify(coordinates)
  await page.route(url=>url.origin==='https://qikvmopbtijoebdqosyq.supabase.co'&&url.pathname==='/rest/v1/spatial_projection_v1',async route=>{
    const request=route.request(),url=new URL(request.url())
    assert.equal(request.method(),'GET','fixture only replaces the existing public reader')
    assert.deepEqual(url.searchParams.get('select').split(',').map(v=>v.trim()),columns,'exact projection reader columns')
    assert.equal(url.searchParams.get('order'),'revision_id.asc')
    assert.equal(url.searchParams.get('limit'),'1000')
    const response=await route.fetch();assert.equal(response.status(),200)
    const rows=await response.json();assert.ok(Array.isArray(rows))
    receipt.readerRequests++
    const fixtureRows=rows.map(row=>{
      if(row.subject_graph_node_id!==QUALIFICATION_SUBJECT)return row
      receipt.matchedRows++
      const result={...row,display_geometry:{type:'MultiPoint',coordinates:JSON.parse(serialized)}}
      assert.deepEqual(Object.keys(result),Object.keys(row),'no invented reader columns')
      for(const key of columns.filter(key=>key!=='display_geometry'))assert.deepEqual(result[key],row[key])
      return result
    })
    assert.equal(JSON.stringify(coordinates),serialized,'fixture coordinate immutability')
    await route.fulfill({response,json:fixtureRows})
  })
  return receipt
}
