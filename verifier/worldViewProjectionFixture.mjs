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
  const coordinates=qualificationCoordinates(kind), receipt={kind,coordinateCount:coordinates.length,readerRequests:0,matchedRows:0,selectionRows:[]}
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
      // Detached existing-row scalars qualify explicit selection. No added
      // reader column, source payload, geometry or provider request.
      receipt.selectionRows.push(Object.freeze(Object.fromEntries(
        ['subject_graph_node_id','spatial_role','parent_event_id','valid_from_utc','valid_to_utc','revision_id']
          .map(key=>[key,row[key]??null]))))
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


// Wave 2 uses separate source-row and display-location counts. A MultiPoint
// of 500 coordinates is ONE source row, never 500 events or entities.
export const CLUSTER_FIXTURE_ORIGIN='http://127.0.0.1:4173'
export const CLUSTER_SCENES=Object.freeze([
  {name:'US-local',center:[-81.7,41.4]},
  {name:'US-coastal',center:[-74,40.7]},
  {name:'Canada',center:[-123.1,49.3]},
  {name:'Mexico',center:[-99.1,19.4]},
  {name:'high-latitude',center:[-114.4,62.5]},
  {name:'dateline',center:[179.9998,51]},
].map(scene=>Object.freeze({...scene,center:Object.freeze(scene.center)})))
export const PROJECTION_FIXTURE_COLUMNS=Object.freeze([...columns])
const fixtureIdentity=index=>'00000000-0000-4000-8000-'+String(index+1).padStart(12,'0')
const wrapLongitude=value=>((value+180)%360+360)%360-180
export function clusteringCoordinates(sceneName,{dense=true,count=48}={}){
  const scene=CLUSTER_SCENES.find(value=>value.name===sceneName)
  assert.ok(scene,'known deterministic fixture geography')
  assert.ok(Number.isInteger(count)&&count>0&&count<1000,'bounded fixture row count')
  const [lon,lat]=scene.center
  return Array.from({length:count},(_,i)=>{
    // Shared anchors deliberately exercise distinct rows at identical positions.
    const dx=dense?(i<8?0:(i%8)*0.05):((i%4)-1.5)*0.25
    const dy=dense?(i<8?0:Math.floor(i/8)*0.05):(Math.floor(i/4)-1)*0.2
    return [wrapLongitude(lon+dx),lat+dy]
  })
}
export function makeClusteringContractRows(template,sceneName,options={}){
  assert.ok(template&&columns.every(column=>Object.hasOwn(template,column)),'template has every actual reader column')
  const coordinates=clusteringCoordinates(sceneName,options)
  return coordinates.map((coordinate,index)=>{
    const row={...template}
    row.mip_object_id=fixtureIdentity(index)
    row.subject_graph_node_id=fixtureIdentity(index)
    row.revision_id=fixtureIdentity(index+1000)
    row.revision_ordinal=1
    row.superseded_by_revision_id=null
    row.subject_snapshot_hash=null
    row.canonical_place_id=null
    row.place_snapshot_hash=null
    row.source_native_time=null
    row.evidence_refs=[]
    row.display_hint='Synthetic clustering fixture row '+String(index+1)
    row.display_geometry={type:'Point',coordinates:[...coordinate]}
    // All remaining precision/privacy/release/time fields retain the received
    // contract. These are isolated test rows, not newly observed source facts.
    assert.deepEqual(Object.keys(row),Object.keys(template),'no additional view columns')
    return row
  })
}
function assertFixtureReader(request,url){
  assert.equal(request.method(),'GET','fixture only intercepts existing public GET')
  assert.deepEqual(url.searchParams.get('select')?.split(',').map(value=>value.trim()),columns)
  assert.equal(url.searchParams.get('order'),'revision_id.asc')
  assert.equal(url.searchParams.get('limit'),'1000')
  assert.equal(url.searchParams.has('revision_id'),false,'single bounded fixture page')
}
// Strictly opt-in, disposable, display-only contract fixture. Fetch the actual
// reader first: an unavailable/unauthorized read must stay a failed qualification.
export async function installClusteringFixture(page,sceneName,{isolatedContractRows=false,dense=true,count=48}={}){
  assert.equal(isolatedContractRows,true,'independent synthetic rows require explicit isolated fixture authorization')
  assert.ok(CLUSTER_SCENES.some(scene=>scene.name===sceneName))
  const receipt={synthetic:true,evidenceLayer:'isolated-contract-fixture',scene:sceneName,
    originalReaderRows:0,syntheticContractRows:0,displayLocations:0,readerRequests:0,
    qualification:'not-read',selectionRows:[]}
  let lastRows=[]
  await page.route(url=>url.origin==='https://qikvmopbtijoebdqosyq.supabase.co'
    &&url.pathname==='/rest/v1/spatial_projection_v1',async intercepted=>{
    const request=intercepted.request(),url=new URL(request.url())
    assert.equal(new URL(page.url()).origin,CLUSTER_FIXTURE_ORIGIN,'never intercept production origin')
    assertFixtureReader(request,url)
    const response=await intercepted.fetch()
    assert.equal(response.status(),200,'real reader must authorize GET before isolated fixture fulfillment')
    const originals=await response.json()
    assert.ok(Array.isArray(originals),'actual reader returns rows')
    const template=originals.find(row=>row.subject_graph_node_id===QUALIFICATION_SUBJECT)
    assert.ok(template,'actual qualification source row exists')
    lastRows=makeClusteringContractRows(template,sceneName,{dense,count})
    receipt.readerRequests++
    receipt.originalReaderRows=originals.length
    receipt.syntheticContractRows=lastRows.length
    receipt.displayLocations=lastRows.length
    receipt.qualification='real-public-GET-200-then-isolated-synthetic-display'
    receipt.selectionRows=lastRows.map(row=>Object.fromEntries(
      ['mip_object_id','subject_graph_node_id','revision_id','spatial_role','object_type','valid_from_utc','valid_to_utc','precision_class','geometry_status','display_hint']
        .map(key=>[key,row[key]??null])))
    await intercepted.fulfill({response,json:lastRows})
  })
  // Detached in-memory snapshots are for source binding assertions, not logs.
  return {receipt,getRows:()=>structuredClone(lastRows)}
}


export const CLUSTER_GRAPH_NODE_COLUMNS=Object.freeze('id,slug,label,type,description,confidence,summary,occurred_at,arc_id,metadata'.split(','))
export const CLUSTER_GRAPH_EDGE_COLUMNS=Object.freeze('id,source_id,target_id,type,weight,label,similarity,signal_source,doc_strength,claimed_by,stance,disputed_by,alternative_causes,counterfactual_test,reliability,metadata'.split(','))
export function clusteringGraphContractRows({evidenceColumns=true}={}){
  const nodes=Array.from({length:48},(_,index)=>{
    const row=Object.fromEntries(CLUSTER_GRAPH_NODE_COLUMNS.map(key=>[key,null]))
    return {...row,id:fixtureIdentity(index),slug:'synthetic-clustering-fixture-'+(index+1),
      label:'Synthetic clustering fixture row '+(index+1),type:'event',metadata:{synthetic_fixture:true}}
  })
  const edgeColumns=evidenceColumns?CLUSTER_GRAPH_EDGE_COLUMNS:CLUSTER_GRAPH_EDGE_COLUMNS.slice(0,7)
  const edges=Array.from({length:88},(_,index)=>{
    const row=Object.fromEntries(edgeColumns.map(key=>[key,null]))
    const target=fixtureIdentity(12+index%36),selected=fixtureIdentity(1),reverse=index%10===0
    row.id=fixtureIdentity(index+2000)
    row.source_id=reverse?target:selected
    row.target_id=reverse?selected:target
    row.type='association'
    row.label='Synthetic documented fixture relationship '+(index+1)
    if(evidenceColumns){
      row.signal_source='isolated_synthetic_contract_fixture'
      row.claimed_by=index>=84?'MIP_inferred':null
      row.metadata={synthetic_fixture:true,evidence_refs:['synthetic-fixture-evidence-'+(index+1)]}
    }
    return row
  })
  return {nodes,edges}
}
// Exact existing graph GETs only. Unavailable full-evidence requests continue
// unchanged so the production reader's BASE fallback remains authoritative.
// A BASE200 can qualify direction/type but cannot qualify absent evidence.
export async function installClusteringGraphFixture(page,{isolatedContractRows=false}={}){
  assert.equal(isolatedContractRows,true,'synthetic graph rows require explicit isolated authorization')
  const receipt={synthetic:true,evidenceLayer:'isolated-contract-fixture',nodeRequests:0,edgeRequests:0,
    nodeStatus:null,edgeStatus:null,nodesFulfilled:0,edgesFulfilled:0,evidenceColumns:false,readerFailures:[]}
  let fulfilledNodes=[],fulfilledEdges=[]
  await page.route(url=>url.origin==='https://qikvmopbtijoebdqosyq.supabase.co'
    &&['/rest/v1/nodes','/rest/v1/edges'].includes(url.pathname),async intercepted=>{
    const request=intercepted.request(),url=new URL(request.url()),nodeReader=url.pathname.endsWith('/nodes')
    assert.equal(new URL(page.url()).origin,CLUSTER_FIXTURE_ORIGIN,'graph fixture never intercepts production origin')
    assert.equal(request.method(),'GET','graph fixture never mutates the backend')
    const selected=url.searchParams.get('select')?.split(',').map(value=>value.trim())
    const full=nodeReader?CLUSTER_GRAPH_NODE_COLUMNS:CLUSTER_GRAPH_EDGE_COLUMNS
    const base=CLUSTER_GRAPH_EDGE_COLUMNS.slice(0,7)
    assert.ok(JSON.stringify(selected)===JSON.stringify(full)||!nodeReader&&JSON.stringify(selected)===JSON.stringify(base),'exact existing graph reader columns only')
    assert.equal(url.searchParams.get('order'),'id.asc')
    assert.equal(url.searchParams.get('limit'),'1000')
    assert.equal(url.searchParams.has('id'),false,'isolated graph fits one bounded page')
    const response=await intercepted.fetch(),status=response.status()
    if(nodeReader){receipt.nodeRequests++;receipt.nodeStatus=status}
    else{receipt.edgeRequests++;receipt.edgeStatus=status}
    if(status!==200){
      receipt.readerFailures.push({reader:nodeReader?'nodes':'edges',status,evidenceColumns:!nodeReader&&selected.includes('metadata')})
      // Preserve the exact failed response; never turn401/404 into successful
      // fixture access or trigger another privilege/provider path.
      await intercepted.fulfill({response})
      return
    }
    const originals=await response.json();assert.ok(Array.isArray(originals),'authorized graph reader returns an array')
    const rows=clusteringGraphContractRows({evidenceColumns:selected.includes('metadata')})
    if(nodeReader){fulfilledNodes=rows.nodes;receipt.nodesFulfilled=fulfilledNodes.length;await intercepted.fulfill({response,json:fulfilledNodes})}
    else{fulfilledEdges=rows.edges;receipt.edgesFulfilled=fulfilledEdges.length;receipt.evidenceColumns=selected.includes('metadata');await intercepted.fulfill({response,json:fulfilledEdges})}
  })
  return {receipt,getNodes:()=>structuredClone(fulfilledNodes),getEdges:()=>structuredClone(fulfilledEdges)}
}
