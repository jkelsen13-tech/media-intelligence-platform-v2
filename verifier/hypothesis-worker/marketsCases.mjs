// Hosted disposable PostgreSQL only. No real assets/materials or production authority.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {hold,blocked,q} from './fixture.mjs'
export async function marketsCases(t,f){
 // Strengthen the intentionally small existing fixture with catalog-relevant graph constraints.
 // The survivor currently has no edges_type_check; do not pretend the old migration is its schema.
 await f.admin("alter table public.nodes add constraint nodes_type_check check(type in('event','actor','institution','document','anomaly','policy','topic'));"+
  "alter table public.edges add column source_id uuid not null references public.nodes(id),add column target_id uuid not null references public.nodes(id),add column type text not null,add column metadata jsonb not null default '{}';"+
  "alter table public.edges add check(source_id<>target_id);create index market_fixture_edge_source on public.edges(source_id);create index market_fixture_edge_target on public.edges(target_id);"+
  "alter table public.edges alter column payload set default '{}';"+
  "create table if not exists public.citations(id uuid primary key,article_id uuid references public.articles(id),resolved_node_id uuid references public.nodes(id));"+
  "create table if not exists public.cross_surface_candidates(id uuid primary key,candidate_type text,review_state text);"+
  "grant select on public.nodes,public.edges to anon,authenticated;alter table public.nodes enable row level security;alter table public.edges enable row level security;"+
  "create policy market_fixture_legacy_nodes on public.nodes for select to anon,authenticated using(true);create policy market_fixture_legacy_edges on public.edges for select to anon,authenticated using(true);")
 for(const name of ['001_typed_retained_records.sql','002_authorized_reader.sql'])
  await f.admin(await readFile(new URL('../../supabase/qualification/markets-evidence/'+name,import.meta.url),'utf8'))
 const baseCounts=await f.admin('select published_node_count||\':\'||documented_relationship_count from public.graph_coverage_public')
 const original=await f.investigation()
 const nodes={equity:randomUUID(),crypto:randomUUID(),issuer:randomUUID(),supplier:randomUUID(),network:randomUUID(),event:randomUUID()}
 const alias=(symbol,namespace)=>[{symbol,namespace,valid_from:'2026-01-01T00:00:00Z',valid_to:null}]
 const latest=(kind,id)=>f.admin('select id from evidence_pipeline.record_versions where record_kind='+q(kind)+' and record_key='+q(id)+' order by ordinal desc limit 1')
 for(const name of ['issuer','supplier','network','event','equity','crypto']){const id=nodes[name]
  const type={equity:'equity',crypto:'cryptoasset',issuer:'actor',supplier:'institution',network:'network',event:'event'}[name]
  const metadata=name==='equity'?{issuer_id:nodes.issuer,issuer_version_id:await latest('graph_node',nodes.issuer),valid_from:'2026-01-01',valid_to:null,aliases:alias('SYN','TEST:VENUE')}:
   name==='crypto'?{network_id:nodes.network,network_version_id:await latest('graph_node',nodes.network),valid_from:'2026-01-01',valid_to:null,asset_identifier:'synthetic-token',aliases:alias('SYN','TEST:NETWORK')}:{}
  await f.admin('insert into public.nodes(id,type,label,metadata,private_candidate) values('+[id,type,'Synthetic private '+name,metadata,true].map(q).join(',')+')')
 }

 const candidates=[]
 for(const [from,to,kind] of [['equity','issuer','ownership'],['issuer','supplier','supply'],['supplier','event','direct_reporting'],['equity','event','direct_reporting'],['crypto','network','protocol_dependency'],['network','event','operation']]){
  const edge=randomUUID(),cid=randomUUID()
  await f.admin('insert into public.edges(id,source_id,target_id,type,private_candidate) values('+[edge,nodes[from],nodes[to],kind,true].map(q).join(',')+')')
  const versions=await Promise.all([latest('graph_node',nodes[from]),latest('graph_node',nodes[to]),latest('graph_edge',edge)])
  await f.admin('insert into evidence_pipeline.evidence_candidates(id,capture_id,candidate_key,candidate_kind,statement,source_field,span_start,span_end,excerpt,extractor_version,remaining_uncertainty,typed_edge_id,subject_version_id,object_version_id,edge_version_id,identity_version_id,relationship_kind,valid_from) values('+
   [cid,original.entry.capture.id,cid,'typed_graph_relationship','Synthetic typed evidence','summary',0,21,'A 😀 B meeting record.','synthetic-markets-v1','Synthetic mechanism only.',edge,...versions,from==='equity'?await latest('graph_node',nodes.issuer):from==='crypto'?await latest('graph_node',nodes.network):null,kind,'2026-01-01'].map(q).join(',')+')')
  const context=JSON.parse(await f.admin('select evidence_pipeline.assessment_context('+q(cid)+')'))
  const input={candidate_id:cid,algorithm_key:'synthetic-market',algorithm_version:'v1',outcome:'supported',rationale:'Synthetic mechanism.',remaining_uncertainty:'Not real-world evidence.',context_positions:context.context_positions}
  await f.pub('mip_assessments_v1','append',input);candidates.push({cid,edge,versions,input})
 }
 const observed=await f.pub('mip_investigation_briefings_v1','observe',{observation_id:randomUUID(),candidate_ids:candidates.map(x=>x.cid)})
 const version=randomUUID()
 const state={question:'Synthetic market evidence',scope_note:'Synthetic only',canonical_subject:null,time_range:{from:null,to:null,meaning:'Not established.'},unresolved_questions:[],hypotheses:[],commitments:[],coverage:[]}
 await f.pub('mip_investigation_workspace_v1','put',{investigation_id:original.iid,version_id:version,previous_version_id:original.vid,observation_id:observed.id,state,change_reason:'Synthetic typed qualification.'})
 const binding=JSON.parse(await f.admin('select mip_hypothesis.observation_binding('+[original.user,original.iid,version].map(q).join(',')+')'))
 for(const input of binding.observation.snapshot.inputs){
  const kind=input.capture?'capture':'record_version',rec=input[kind]
  for(const operation of ['retention','analysis','excerpt_display'])for(const domain of ['rights','privacy']){
   const scope={source_project:original.source,material_ref:kind+':'+rec.id,material_version:rec.source_version_hash,source_version:rec.id,audience:'isolated_internal_review',operation,domain}
   if(await f.admin('select count(*) from mip_identity.operation_evidence_heads where scope='+q(scope))!=='0')continue
   const revision=randomUUID()
   await f.admin('insert into mip_identity.operation_evidence_versions values('+[revision,scope,'synthetic-fixture-v1','synthetic-policy','v1',f.sha('policy'),'synthetic-evidence','synthetic-owner','synthetic-approval','recorded','allow','2000-01-01','2999-01-01',[],true].map(q).join(',')+');insert into mip_identity.operation_evidence_heads values('+[scope,revision,true].map(q).join(',')+')')
  }
 }
 const sql=(over={})=>'select mip_markets.read_private('+[over.user??original.user,over.iid??original.iid,over.version??version,over.source??original.source,
  Object.hasOwn(over,'asset')?over.asset:nodes.equity,Object.hasOwn(over,'event')?over.event:nodes.event,over.at??'2026-06-01'].map(q).join(',')+');'
 const read=async over=>JSON.parse(await f.admin('set session authorization mip_hypothesis_gateway;'+sql(over)))
 const restoreAuthority=()=>f.admin("do $$declare h mip_identity.operation_evidence_heads;r uuid;begin for h in select * from mip_identity.operation_evidence_heads where not active and scope->>'material_ref'='"+original.permissionScope.material_ref+"' loop r:=gen_random_uuid();insert into mip_identity.operation_evidence_versions select (jsonb_populate_record(null::mip_identity.operation_evidence_versions,to_jsonb(v)||jsonb_build_object('revision',r))).* from mip_identity.operation_evidence_versions v where v.revision=h.revision;update mip_identity.operation_evidence_heads set revision=r,active=true where scope=h.scope;end loop;end $$")
 await t.test('shared canonical equity crypto and indirect paths discover in both directions',async()=>{
  const equity=await read(),crypto=await read({asset:nodes.crypto}),reverse=await read({asset:null})
  assert.equal(equity.paths.length,2);assert.ok(equity.paths.some(p=>p.hops.length===3));assert.ok(equity.paths.some(p=>p.relation==='direct_reporting'))
  assert.equal(crypto.paths[0].asset_kind,'cryptoasset');assert.equal(crypto.paths[0].hops.length,2)
  assert.deepEqual(new Set(reverse.paths.map(p=>p.asset_id)),new Set([nodes.equity,nodes.crypto]))
  assert.equal(equity.publication_allowed,false);assert.equal(equity.historical_time_qualified,false)
  assert.equal(equity.paths[0].hops[0].support.excerpt,'A 😀 B meeting record.')
 })
 await t.test('private graph bytes and counts do not leak through permissive raw reads or known definer aggregate',async()=>{
  for(const role of ['anon','authenticated']){
   assert.equal(await f.admin('set session authorization '+role+';select count(*) from public.nodes where private_candidate'),'0')
   assert.equal(await f.admin('set session authorization '+role+';select count(*) from public.edges where private_candidate'),'0')
   assert.equal(await f.admin('set session authorization '+role+';select published_node_count||\':\'||documented_relationship_count from public.graph_coverage_public'),baseCounts)
   await assert.rejects(()=>f.admin('set session authorization '+role+';'+sql()))
  }
  await assert.rejects(()=>f.admin('update public.nodes set private_candidate=false where id='+q(nodes.equity)),/mip_market_no_public_promotion/)
  await assert.rejects(()=>f.admin('insert into public.edges(id,source_id,target_id,type) values('+[randomUUID(),nodes.equity,nodes.event,'arbitrary'].map(q).join(',')+')'),/mip_market_private_endpoint/)
 })
 await t.test('source user workspace and unobserved version cannot substitute authority',async()=>{
  for(const over of [{user:randomUUID()},{iid:randomUUID()},{version:original.vid},{source:'not-authorized'}])await assert.rejects(()=>read(over))
  assert.equal((await read({at:'2025-01-01'})).paths.length,0)
 })
 await t.test('exact candidate binding rejects changed endpoints and Unicode text',async()=>{
  const originalCandidate=candidates[0],row=JSON.parse(await f.admin('select to_jsonb(c) from evidence_pipeline.evidence_candidates c where id='+q(originalCandidate.cid)))
  for(const override of [{edge_version_id:candidates[1].versions[2]},{subject_version_id:candidates[1].versions[0]},{excerpt:'wrong retained text'}]){
   const changed={...row,...override,id:randomUUID(),candidate_key:randomUUID()}
   await assert.rejects(()=>f.admin('insert into evidence_pipeline.evidence_candidates select (jsonb_populate_record(null::evidence_pipeline.evidence_candidates,'+q(changed)+')).*'))
  }
 })
 await t.test('permission revocation before reader denies; fresh authority revision restores fixture access',async()=>{
  const held=await hold(f.db,original.revokeSql);const pending=read();pending.catch(()=>{})
  try{await blocked(f,held.pid);await held.finish(true);await assert.rejects(pending,/mip_market_operation_denied/)}
  catch(e){throw e}
  await restoreAuthority()
 })
 await t.test('source update holds the reader fence and rollback preserves exact retained records',async()=>{
  const first=candidates[0],before=await f.admin('select count(*) from evidence_pipeline.record_versions where record_kind=\'graph_node\' and record_key='+q(nodes.supplier))
  const held=await hold(f.db,'update public.nodes set label=\'Synthetic corrected supplier\' where id='+q(nodes.supplier))
  const pending=read();pending.catch(()=>{})
  await blocked(f,held.pid);await held.finish(false)
  assert.equal((await pending).paths.length,2)
  assert.equal(await f.admin('select count(*) from evidence_pipeline.record_versions where record_kind=\'graph_node\' and record_key='+q(nodes.supplier)),before)
 })
 await t.test('reader holds authority through transaction; revocation waits',async()=>{
  const held=await hold(f.db,sql(),'mip_hypothesis_gateway'),pending=f.admin(original.revokeSql);pending.catch(()=>{})
  await blocked(f,held.pid);await held.finish(true);await pending
  await assert.rejects(()=>read(),/mip_market_operation_denied/)
 })
 await t.test('committed source correction immediately invalidates the dependent indirect path',async()=>{
  await restoreAuthority()
  const oldVersion=await latest('graph_node',nodes.supplier)
  await f.admin('update public.nodes set label=\'Synthetic corrected supplier\' where id='+q(nodes.supplier))
  await assert.rejects(()=>read(),/mip_market_assessment_unavailable/)
  assert.equal(await f.admin('select count(*) from evidence_pipeline.record_versions where id='+q(oldVersion)),'1')
  assert.notEqual(await latest('graph_node',nodes.supplier),oldVersion)
 })
}
