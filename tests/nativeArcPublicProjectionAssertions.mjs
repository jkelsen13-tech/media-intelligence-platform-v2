// Actual PostgreSQL assertions; imported by the owned full-backend fixture.
// This file creates no server, database, mocked validator or replacement source.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
const call=async(c,q,args)=>(await c.query(q,args)).rows[0].result
const receiptKeys=['contract','projection_id','generation_id','dependency_hash','display_hash','state','approval_allowed','publication_allowed','attached'].sort()
const q='mip_arc_projection_private.'
export async function assertNativeArcPrivateProjection(fx){
 const {db,reviewer,gateway,outsider,worker,scope:s,first,sentinel,id,contextNodeId,contextMilestoneId}=fx
 if(fx.syntheticFixture!==true||typeof id!=='function'||!contextNodeId||!contextMilestoneId)throw Error('arc_projection_fixture_guard')
 let stage=0
 const check=async fn=>{
  stage++
  try{await fn()}catch(error){
   const code=/^[A-Z0-9]{5}$/.test(error?.code??'')?error.code:'none'
   const position=/^[0-9]{1,8}$/.test(String(error?.internalPosition??error?.position??''))?String(error.internalPosition??error.position):'none'
   const frames=String(error?.stack??'').split('\n').slice(1).flatMap(line=>{
    const m=line.match(/nativeArcPublicProjectionAssertions\.mjs:(\d{1,6}):(\d{1,6})/);return m?[m[0]]:[]
   }).slice(0,3)
   throw Error('arc_private_projection_check_'+stage+'_sqlstate_'+code+'_position_'+position+'_frames_'+frames.join(','))
  }
 }
 const contract=JSON.parse(await readFile(new URL('../supabase/qualification/arc-public-projection/private_contract.json',import.meta.url),'utf8'))
 const sql=await readFile(new URL('../supabase/qualification/arc-public-projection/001_native_private_projection.sql',import.meta.url),'utf8')
 const finalStart=sql.indexOf('do $private_projection_final$'),finalEnd=sql.indexOf('end $private_projection_final$;',finalStart)
 if(finalStart<0||finalEnd<0)throw Error('arc_projection_final_source_missing')
 const finalAssertion=sql.slice(finalStart,finalEnd+'end $private_projection_final$;'.length)
 const reviewerName=(await reviewer.query('select session_user::text name')).rows[0].name
 const quote=s=>'"'+s.replaceAll('"','""')+'"'
 // The installed-disabled closure forbids worker activation edges. This real
 // fixture deliberately activated exactly these two logins for runtime tests.
 const workerLogins=[(await gateway.query('select session_user::text name')).rows[0].name,
  (await worker.query('select session_user::text name')).rows[0].name].sort()
 assert.equal(new Set(workerLogins).size,2)
 const workerEdges=async()=>(await db.query(
  "select parent.rolname parent,member.rolname member,member.rolcanlogin login,grantor.rolname grantor,a.admin_option admin,a.inherit_option inherit,a.set_option set from pg_auth_members a join pg_roles parent on parent.oid=a.roleid join pg_roles member on member.oid=a.member join pg_roles grantor on grantor.oid=a.grantor where parent.rolname='mip_arc_native_worker' or member.rolname='mip_arc_native_worker' order by parent.rolname,member.rolname,grantor.rolname"
 )).rows
 const withInstalledBoundary=async(mutate=null,expected=null)=>{
  const before=await workerEdges()
  assert.equal(before.length,2)
  assert.deepEqual(before.map(x=>x.member).sort(),workerLogins)
  assert.ok(before.every(x=>x.parent==='mip_arc_native_worker'&&x.login===true&&x.admin===false))
  let failure
  const cleanup=[]
  await db.query('begin')
  try{
   for(const login of workerLogins)await db.query('revoke mip_arc_native_worker from '+quote(login))
   assert.deepEqual(await workerEdges(),[])
   // Every negative must establish the same positive boundary first; another
   // failing guard must never stand in for the intended drift detector.
   await db.query(finalAssertion)
   if(mutate){
    await mutate()
    await assert.rejects(db.query(finalAssertion),e=>e.code==='P0001'&&e.message===expected)
   }
  }catch(error){failure=error}
  finally{
   try{await db.query('rollback')}catch{cleanup.push('worker_edge_rollback')}
   try{assert.deepEqual(await workerEdges(),before)}catch{cleanup.push('worker_edge_restore')}
   if(failure||cleanup.length)throw new AggregateError([...(failure?[failure]:[]),...cleanup.map(x=>Error('arc_projection_'+x))],'arc_projection_fixture_boundary_cleanup')
  }
 }

 const saved=(await db.query('select manifest from mip_arc_native.generations where scope=$1 and id=$2',[s,first.generation_id])).rows[0].manifest
 const article=saved.article,arc=saved.arc.id
 const meta=(await db.query("select c.id,c.job_id,c.article_id,c.content_hash,case when not(c.payload?'body_text') then 'missing' when c.payload->'body_text'='null'::jsonb then 'null' else jsonb_typeof(c.payload->'body_text') end kind,encode(sha256(convert_to(jsonb_build_object('present',c.payload?'body_text','value',c.payload->'body_text')::text,'UTF8')),'hex') body_hash,encode(sha256(convert_to(jsonb_build_object('present',c.payload?'url','value',c.payload->'url')::text,'UTF8')),'hex') url_hash,octet_length(c.payload->>'body_text') body_bytes,encode(sha256(convert_to(c.payload->>'body_text','UTF8')),'hex') span_hash from evidence_pipeline.article_captures c where c.article_id=$1 order by c.captured_at desc,c.id desc limit 1",[article])).rows[0]
 assert.ok(meta.body_bytes>0)
 const binding=id(2000),citation=id(2001),context=id(2002),projection=id(2003),review=id(2004)
 let receipt
 const prepare=(pid=projection,cid=citation,contextId=context)=>call(reviewer,'select '+q+'prepare($1,$2,$3,$4,$5,$6,$7,$8,$9) result',
 [s,pid,first.generation_id,first.input_hash,first.output_hash,first.review_id,binding,cid,contextId])
 const read=(r=receipt,rid=review,client=gateway)=>call(client,'select '+q+'read_current($1,$2,$3,$4,$5) result',
 [s,r.projection_id,r.dependency_hash,r.display_hash,rid])
 const reviewProjection=(r,rid,version=1,previous=null,state='accepted_private',reason='reviewed_private_display')=>
 reviewer.query('select '+q+'review($1,$2,$3,$4,$5,$6,$7,$8,$9)',
 [s,rid,r.projection_id,r.dependency_hash,r.display_hash,version,previous,state,reason])
 // In a source-mutation test, one original superuser fixture connection owns
 // the transaction, switches session identity to the actual reviewer, invokes
 // the real wrapper, then resets and rolls back. No committed source drift is
 // hidden from later tests. No application caller can perform this switch.
 const rollbackSource=async(mutation,{restored=false}={})=>{
  let failure
  await db.query('begin')
  try{
   const before=restored?await call(db,'select '+q+'current_context($1) result',[arc]):null
   await mutation()
   if(restored){
    const after=await call(db,'select '+q+'current_context($1) result',[arc])
    assert.ok(Number(after.selected_relation_change_count)>Number(before.selected_relation_change_count))
    const {selected_relation_change_count:beforeCount,...beforeFields}=before
    const {selected_relation_change_count:afterCount,...afterFields}=after
    assert.deepEqual(afterFields,beforeFields)
   }
   await db.query('set local session authorization '+quote(reviewerName))
   if(restored)await call(db,'select mip_arc_native.read_current_score($1,$2,$3,$4,$5) result',
    [s,first.generation_id,first.input_hash,first.output_hash,first.review_id])
   await assert.rejects(read(receipt,review,db),e=>e.code==='P0001')
  }catch(e){failure=e}
  finally{
   const cleanup=[]
   try{await db.query('rollback')}catch{cleanup.push('rollback')}
   try{await db.query('reset session authorization')}catch{cleanup.push('identity_reset')}
   if(failure||cleanup.length)throw new AggregateError([...(failure?[failure]:[]),...cleanup.map(x=>Error('arc_projection_'+x))],'arc_projection_mutation_cleanup')
  }
 }
 await check(async()=>{
  await reviewer.query('select '+q+'review_source($1,$2,$3,$4,$5,$6,$7,$8,$9)',
   [s,binding,meta.article_id,meta.id,meta.job_id,meta.content_hash,meta.kind,meta.body_hash,meta.url_hash])
  await assert.rejects(reviewer.query('select '+q+'review_citations($1,$2,$3,1,null,\'reviewed_complete\',\'[]\'::jsonb)',[s,citation,binding]),e=>e.code==='P0001')
  await reviewer.query('select '+q+'set_source_access($1,$2,true)',[s,binding])
  await reviewer.query('select '+q+'review_citations($1,$2,$3,1,null,\'reviewed_complete\',\'[]\'::jsonb)',[s,citation,binding])
  const observed=await call(reviewer,'select '+q+'inspect_context($1,$2) result',[s,arc])
  assert.equal(observed.context.root_node_id,contextNodeId)
  assert.equal(observed.context.milestones.some(m=>m.id===contextMilestoneId),true)
  await reviewer.query('select '+q+'review_context($1,$2,$3,1,null,\'reviewed\',$4)',[s,context,arc,observed.context_hash])
  receipt=await prepare()
  assert.deepEqual(Object.keys(receipt).sort(),receiptKeys)
  assert.deepEqual(Object.keys(receipt).sort(),[...contract.returned_fields.receipt].sort())
  assert.equal(receipt.publication_allowed,false);assert.equal(receipt.approval_allowed,false);assert.equal(receipt.attached,false)
  assert.deepEqual(await prepare(),receipt)
  await reviewProjection(receipt,review)
  const result=await read()
  assert.deepEqual(Object.keys(result).sort(),[...contract.returned_fields.current].sort())
  for(const key of ['review','display'])assert.deepEqual(Object.keys(result[key]).sort(),[...contract.returned_fields[key]].sort())
  for(const key of ['node','source','event'])assert.deepEqual(Object.keys(result.display[key]).sort(),[...contract.returned_fields[key]].sort())
  if(result.display.edge!==null)assert.deepEqual(Object.keys(result.display.edge).sort(),[...contract.returned_fields.edge].sort())
  for(const item of result.display.milestone_outcomes)assert.deepEqual(Object.keys(item).sort(),[...contract.returned_fields.milestone_outcome].sort())
  assert.equal(result.review.disposition,'accepted_private')
  assert.equal(result.display.event.confidence,'corroborated')
  assert.deepEqual(result.display.vector,{state:'absent',centroid_updated:false})
  assert.equal(result.display.publication_allowed,false)
  assert.equal(result.display.source.url.startsWith('https://synthetic.invalid/'),true)
  assert.equal(JSON.stringify(result).includes(sentinel),false)
 })
 await check(async()=>{
  for(const client of [outsider,worker]){
   await assert.rejects(read(receipt,review,client),e=>['42501','P0001'].includes(e.code))
   await assert.rejects(client.query('select display_payload from '+q+'projections'),e=>e.code==='42501')
  }
  await assert.rejects(gateway.query('select '+q+'review_source($1,$2,$3,$4,$5,$6,$7,$8,$9)',
   [s,id(2005),meta.article_id,meta.id,meta.job_id,meta.content_hash,meta.kind,meta.body_hash,meta.url_hash]),e=>e.code==='P0001')
  await assert.rejects(prepare(projection,id(2090)),e=>e.code==='P0001')
  await assert.rejects(reviewer.query('select '+q+'review_source($1,$2,$3,$4,$5,$6,$7,$8,$9)',
   [s,binding,meta.article_id,meta.id,meta.job_id,meta.content_hash,meta.kind,'0'.repeat(64),meta.url_hash]),e=>e.code==='P0001')
 })
 await check(async()=>{
  await rollbackSource(()=>db.query("update public.story_arcs set category='economic_policy' where id=$1",[arc]))
  await rollbackSource(()=>db.query("update public.articles set reader_state=case when reader_state='withheld' then 'pending_review' else 'withheld' end where id=$1",[article]))
  await rollbackSource(async()=>{
   const original=(await db.query('select reader_state,source_status from public.articles where id=$1',[article])).rows[0]
   await db.query("update public.articles set reader_state=case when reader_state='withheld' then 'pending_review' else 'withheld' end where id=$1",[article])
   await db.query('update public.articles set reader_state=$2,source_status=$3 where id=$1',[article,original.reader_state,original.source_status])
   assert.deepEqual((await db.query('select reader_state,source_status from public.articles where id=$1',[article])).rows[0],original)
  },{restored:true})
  await rollbackSource(async()=>{
   const original=(await db.query('select reader_state,source_status from public.articles where id=$1',[article])).rows[0]
   await db.query("update public.articles set source_status=case when source_status='corrected' then 'active' else 'corrected' end where id=$1",[article])
   await db.query('update public.articles set reader_state=$2,source_status=$3 where id=$1',[article,original.reader_state,original.source_status])
   assert.deepEqual((await db.query('select reader_state,source_status from public.articles where id=$1',[article])).rows[0],original)
  },{restored:true})
  await rollbackSource(async()=>{
   const original=(await db.query('select type from public.nodes where id=$1',[contextNodeId])).rows[0].type
   await db.query("update public.nodes set type=case when type='event' then 'institution' else 'event' end where id=$1",[contextNodeId])
   await db.query('update public.nodes set type=$2 where id=$1',[contextNodeId,original])
   assert.equal((await db.query('select type from public.nodes where id=$1',[contextNodeId])).rows[0].type,original)
  },{restored:true})
  await rollbackSource(async()=>{
   const original=(await db.query('select milestone_key,status from public.arc_milestones where id=$1 and arc_id=$2',[contextMilestoneId,arc])).rows[0]
   await db.query("update public.arc_milestones set status=case when status='confirmed' then 'pending' else 'confirmed' end where id=$1",[contextMilestoneId])
   await db.query('update public.arc_milestones set milestone_key=$2,status=$3 where id=$1',[contextMilestoneId,original.milestone_key,original.status])
   assert.deepEqual((await db.query('select milestone_key,status from public.arc_milestones where id=$1',[contextMilestoneId])).rows[0],original)
  },{restored:true})
  // Exact current source remains usable after each rolled-back mutation.
  assert.equal((await read()).receipt.display_hash,receipt.display_hash)
 })
 await check(async()=>{
  await withInstalledBoundary()
  for(const table of contract.durable_tables){
   const columns=(await db.query("select attname from pg_attribute where attrelid=$1::regclass and attnum>0 and not attisdropped order by attnum",[table.table])).rows.map(x=>x.attname)
   assert.deepEqual(columns,table.fields)
  }
  await withInstalledBoundary(
   ()=>db.query('grant execute on function '+q+'read_current(uuid,uuid,text,text,uuid) to public'),
   'arc_projection_function_acl')
  for(const trigger of ['collector_articles_lock','collector_articles_change','no_collector_articles_truncate']){
   await withInstalledBoundary(
    ()=>db.query('alter table public.articles disable trigger '+quote(trigger)),
    'arc_projection_article_recorder_boundary')
  }
  for(const name of ['source_bindings','citation_reviews','context_reviews','projections','reviews']){
   await assert.rejects(db.query('update '+q+name+' set scope=scope where false'),e=>e.code==='P0001')
   await assert.rejects(db.query('delete from '+q+name+' where false'),e=>e.code==='P0001')
  }
  for(const name of ['source_bindings','source_access','citation_reviews','reviews']){
   const rows=(await db.query('select coalesce(jsonb_agg(to_jsonb(r)),\'[]\') value from '+q+name+' r')).rows[0].value
   assert.equal(JSON.stringify(rows).includes(sentinel),false)
  }
  const data=(await db.query('select dependency_manifest,display_payload from '+q+'projections where scope=$1 and id=$2',[s,projection])).rows[0]
  assert.equal(JSON.stringify(data).includes(sentinel),false)
  assert.equal((await db.query("select position($2 in payload->>'body_text')>0 intact from evidence_pipeline.article_captures where id=$1",[meta.id,sentinel])).rows[0].intact,true)
  assert.equal((await db.query('select arc_id from public.articles where id=$1',[article])).rows[0].arc_id,null)
  assert.equal((await db.query('select state from public.arc_membership_candidates where id=$1',[saved.candidate])).rows[0].state,'pending')
 })
 await check(async()=>{
  // A new reviewed complete citation set invalidates the prior projection,
  // even if no scoring/entity admission changed.
  const items=[{start:0,end:meta.body_bytes,span_hash:meta.span_hash,cited_type:'agency_release'}]
  for(const invalid of [[{...items[0],start:null}],[{...items[0],span_hash:'0'.repeat(64)}],[{...items[0],extra:sentinel}]]){
   await assert.rejects(reviewer.query('select '+q+'review_citations($1,$2,$3,2,$4,\'reviewed_complete\',$5::jsonb)',
    [s,id(2006),binding,citation,JSON.stringify(invalid)]),e=>e.code==='P0001')
  }
  await reviewer.query('select '+q+'review_citations($1,$2,$3,2,$4,\'reviewed_complete\',$5::jsonb)',
   [s,id(2006),binding,citation,JSON.stringify(items)])
  await assert.rejects(read(),e=>e.code==='P0001')
  const next=await prepare(id(2007),id(2006))
  await reviewProjection(next,id(2008))
  assert.equal((await read(next,id(2008))).display.event.confidence,'confirmed')
  await reviewer.query('select '+q+'set_source_access($1,$2,false)',[s,binding])
  await assert.rejects(read(next,id(2008)),e=>e.code==='P0001')
  await reviewer.query('select '+q+'set_source_access($1,$2,true)',[s,binding])
  // Re-enabling access does not resurrect an old access revision.
  await assert.rejects(read(next,id(2008)),e=>e.code==='P0001')
  const latest=await prepare(id(2009),id(2006))
  await reviewProjection(latest,id(2010))
  await reviewProjection(latest,id(2011),2,id(2010),'revoked','revocation')
  await assert.rejects(read(latest,id(2010)),e=>e.code==='P0001')
  await assert.rejects(read(latest,id(2011)),e=>e.code==='P0001')
 })
 return {contract:'native-private-projection-synthetic-v1',checks:stage,publication_allowed:false,attachment_performed:false}
}
