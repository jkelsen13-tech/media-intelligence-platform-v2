import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CLUSTER_FIXTURE_ORIGIN, CLUSTER_SCENES, PROJECTION_FIXTURE_COLUMNS,
  QUALIFICATION_SUBJECT, clusteringCoordinates, makeClusteringContractRows,
  installClusteringFixture, installClusteringGraphFixture, clusteringGraphContractRows,
  CLUSTER_GRAPH_NODE_COLUMNS, CLUSTER_GRAPH_EDGE_COLUMNS, qualificationCoordinates,
} from '../verifier/worldViewProjectionFixture.mjs'

function template(){
  const row=Object.fromEntries(PROJECTION_FIXTURE_COLUMNS.map(key=>[key,null]))
  return {...row,projection_contract_version:'v1',mip_object_id:'original-object',
    subject_graph_node_id:QUALIFICATION_SUBJECT,revision_id:'original-revision',
    revision_ordinal:3,precision_class:'city',object_type:'event',spatial_role:'event',
    geometry_status:'coarsened_to_precision_class',release_state:'released',
    review_state:'reviewed',valid_from_utc:'2026-01-01T00:00:00Z',
    valid_to_utc:'2026-01-02T00:00:00Z',
    display_geometry:{type:'Point',coordinates:[-81.7,41.4]},evidence_refs:['original-ref']}
}
function harness({origin=CLUSTER_FIXTURE_ORIGIN,status=200,rows=[template()],method='GET',select=PROJECTION_FIXTURE_COLUMNS.join(',')}={}){
  let handler,fulfilled=0,fetched=0
  const params=new URLSearchParams({select,order:'revision_id.asc',limit:'1000'})
  const url='https://qikvmopbtijoebdqosyq.supabase.co/rest/v1/spatial_projection_v1?'+params
  return {
    page:{url:()=>origin+'/media-intelligence-platform-v2/#/world',route:async(predicate,fn)=>{
      assert.equal(predicate(new URL(url)),true)
      assert.equal(predicate(new URL('https://another.supabase.co/rest/v1/spatial_projection_v1')),false)
      handler=fn
    }},
    run:()=>handler({request:()=>({method:()=>method,url:()=>url}),
      fetch:async()=>{fetched++;return {status:()=>status,json:async()=>rows}},
      fulfill:async({json})=>{fulfilled++;assert.ok(Array.isArray(json))}}),
    counts:()=>({fulfilled,fetched}),
  }
}
test('historical dense is one row with 500 locations; sparse includes far hemisphere',()=>{
  assert.equal(qualificationCoordinates('dense').length,500)
  assert.equal(qualificationCoordinates('sparse').length,5)
})
test('six geography scenes have stable overlap anchors and wrapped dateline coordinates',()=>{
  for(const scene of CLUSTER_SCENES){
    const dense=clusteringCoordinates(scene.name)
    assert.equal(dense.length,48)
    assert.deepEqual(dense,clusteringCoordinates(scene.name))
    for(const coordinate of dense){assert.ok(coordinate[0]>=-180&&coordinate[0]<180);assert.ok(Math.abs(coordinate[1])<=90)}
    assert.ok(dense.slice(0,8).every(coordinate=>JSON.stringify(coordinate)===JSON.stringify(dense[0])))
    const sparse=clusteringCoordinates(scene.name,{dense:false,count:12})
    assert.equal(new Set(sparse.map(JSON.stringify)).size,12)
  }
  assert.throws(()=>clusteringCoordinates('unsupported'))
  assert.throws(()=>clusteringCoordinates('Canada',{count:1000}))
})
test('independent fixture rows preserve declared contract and template immutability',()=>{
  const source=template(),before=structuredClone(source)
  const rows=makeClusteringContractRows(source,'US-local')
  assert.deepEqual(source,before)
  assert.equal(new Set(rows.map(row=>row.mip_object_id)).size,48)
  assert.equal(new Set(rows.map(row=>row.revision_id)).size,48)
  for(const row of rows){
    assert.deepEqual(Object.keys(row),Object.keys(source))
    for(const key of ['precision_class','geometry_status','review_state','release_state','valid_from_utc','valid_to_utc'])
      assert.equal(row[key],source[key])
    assert.match(row.display_hint,/^Synthetic clustering fixture row /)
    assert.deepEqual(row.evidence_refs,[])
    assert.equal(row.source_native_time,null)
  }
  rows[0].display_geometry.coordinates[0]=0
  assert.notEqual(rows[1].display_geometry.coordinates[0],0,'row geometry arrays are detached')
})
test('isolated rows require explicit authorization and loopback origin before GET',async()=>{
  const implicit=harness()
  await assert.rejects(installClusteringFixture(implicit.page,'Canada'),/explicit isolated/)
  const production=harness({origin:'https://jkelsen13-tech.github.io'})
  await installClusteringFixture(production.page,'Canada',{isolatedContractRows:true})
  await assert.rejects(production.run(),/production origin/)
  assert.deepEqual(production.counts(),{fulfilled:0,fetched:0})
})
test('401, empty and changed-column actual reads cannot become fixture successes',async()=>{
  for(const settings of [{status:401},{rows:[]},{select:'*'},{method:'POST'}]){
    const fixture=harness(settings)
    await installClusteringFixture(fixture.page,'Canada',{isolatedContractRows:true})
    await assert.rejects(fixture.run())
    assert.equal(fixture.counts().fulfilled,0)
  }
})
test('qualified GET receipt separates original returned rows from synthetic identities',async()=>{
  const fixture=harness()
  const result=await installClusteringFixture(fixture.page,'Canada',{isolatedContractRows:true})
  await fixture.run()
  assert.deepEqual(fixture.counts(),{fulfilled:1,fetched:1})
  assert.equal(result.receipt.originalReaderRows,1)
  assert.equal(result.receipt.syntheticContractRows,48)
  assert.equal(result.receipt.displayLocations,48)
  assert.equal(result.receipt.evidenceLayer,'isolated-contract-fixture')
  const rows=result.getRows();rows[0].display_geometry.coordinates[0]=0
  assert.notEqual(result.getRows()[0].display_geometry.coordinates[0],0,'receipt snapshots cannot mutate fulfilled rows')
})

test('graph contract fixture preserves exact selected columns, directed identities and raw evidence',()=>{
  const full=clusteringGraphContractRows()
  assert.equal(full.nodes.length,48)
  assert.equal(full.edges.length,88)
  assert.equal(full.edges.filter(edge=>edge.claimed_by==='MIP_inferred').length,4)
  const nodeIds=new Set(full.nodes.map(node=>node.id))
  for(const node of full.nodes){assert.deepEqual(Object.keys(node),CLUSTER_GRAPH_NODE_COLUMNS);assert.equal(node.metadata.synthetic_fixture,true)}
  for(const edge of full.edges){
    assert.deepEqual(Object.keys(edge),CLUSTER_GRAPH_EDGE_COLUMNS)
    assert.ok(nodeIds.has(edge.source_id)&&nodeIds.has(edge.target_id))
    assert.equal(edge.type,'association')
    assert.ok(edge.metadata.evidence_refs[0].startsWith('synthetic-fixture-evidence-'))
  }
  assert.notEqual(full.edges[0].source_id,full.edges[1].source_id,'explicit opposite directions are retained')
  for(const edge of clusteringGraphContractRows({evidenceColumns:false}).edges){
    assert.deepEqual(Object.keys(edge),CLUSTER_GRAPH_EDGE_COLUMNS.slice(0,7),'BASE reader cannot gain invented evidence fields')
    assert.equal(Object.hasOwn(edge,'metadata'),false)
  }
})
function graphHarness({reader='edges',status=200,origin=CLUSTER_FIXTURE_ORIGIN}={}){
  let handler,syntheticFulfilled=0,failedPasses=0
  const select=(reader==='nodes'?CLUSTER_GRAPH_NODE_COLUMNS:CLUSTER_GRAPH_EDGE_COLUMNS).join(',')
  const params=new URLSearchParams({select,order:'id.asc',limit:'1000'})
  const url='https://qikvmopbtijoebdqosyq.supabase.co/rest/v1/'+reader+'?'+params
  return {
    page:{url:()=>origin+'/media-intelligence-platform-v2/#/world',route:async(predicate,fn)=>{
      assert.equal(predicate(new URL(url)),true);handler=fn
    }},
    run:()=>handler({request:()=>({method:()=> 'GET',url:()=>url}),
      fetch:async()=>({status:()=>status,json:async()=>[]}),
      fulfill:async({json})=>{if(json)syntheticFulfilled++;else failedPasses++}}),
    counts:()=>({syntheticFulfilled,failedPasses}),
  }
}
test('graph fixture never turns unauthorized/missing evidence into synthetic success',async()=>{
  for(const status of [401,404]){
    const harness=graphHarness({status})
    const fixture=await installClusteringGraphFixture(harness.page,{isolatedContractRows:true})
    await harness.run()
    assert.deepEqual(harness.counts(),{syntheticFulfilled:0,failedPasses:1})
    assert.equal(fixture.receipt.edgesFulfilled,0)
    assert.equal(fixture.receipt.readerFailures[0].status,status)
  }
  const production=graphHarness({origin:'https://jkelsen13-tech.github.io'})
  await installClusteringGraphFixture(production.page,{isolatedContractRows:true})
  await assert.rejects(production.run(),/production origin/)
  assert.deepEqual(production.counts(),{syntheticFulfilled:0,failedPasses:0})
})
test('existing authorized empty graph arrays qualify isolated exact-column rows',async()=>{
  for(const reader of ['nodes','edges']){
    const harness=graphHarness({reader})
    const fixture=await installClusteringGraphFixture(harness.page,{isolatedContractRows:true})
    await harness.run()
    assert.equal(harness.counts().syntheticFulfilled,1)
    if(reader==='nodes')assert.equal(fixture.getNodes().length,48)
    else{assert.equal(fixture.getEdges().length,88);assert.equal(fixture.receipt.evidenceColumns,true)}
  }
})
