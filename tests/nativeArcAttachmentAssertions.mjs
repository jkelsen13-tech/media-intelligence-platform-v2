// Integrated by the real disposable native C9 PG fixture. No mock source or SQL runner.
// The fixture supplies existing actual SCRAM clients and creates each reviewed
// input through native capture/scalar/canonical/cohort/score/review APIs.
import assert from 'node:assert/strict'
const invoke=async(client,sql,args)=>(await client.query(sql,args)).rows[0].result
const readSQL='select mip_arc_native.read_private_attachment($1,$2) result'
const prepareSQL='select mip_arc_native.prepare_private_attachment($1,$2,$3,$4,$5) result'
const attachSQL='select mip_arc_native.attach_private_membership($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result'
const revokeSQL='select mip_arc_native.revoke_private_attachment($1,$2,$3,$4,$5,$6) result'
const flags=['public_attachment','publication_allowed','auto_approval_enabled','production_qualified']
const originKeys=['scope','attachment_id','article_id','arc_id','generation_id','review_id','input_hash','output_hash','manifest_hash',
 'version','predecessor','arc_revision','state','dependency_head_ids','current_arc_revision','current_set_digest',
 'current_head_ids','current_article_ids','current_member_ids','public_member_ids','membership_kind','record_kind',...flags].sort()
const arcKeys=['scope','arc_id','arc_revision','head_ids','article_ids','public_member_ids','member_ids','set_digest',
 'membership_kind','record_kind',...flags].sort()
const prepareKeys=['scope','generation_id','candidate_id','article_id','arc_id','review_id','input_hash','output_hash','manifest_hash',
 'dependency_head_ids','private_arc_revision','private_set_digest','approval_allowed','publication_allowed','attached',
 'expected_predecessor','version','membership_kind','record_kind','public_attachment','auto_approval_enabled','production_qualified'].sort()
const arrays=new Set(['dependency_head_ids','current_head_ids','current_article_ids','current_member_ids','public_member_ids',
 'head_ids','article_ids','member_ids'])
function envelope(value,keys,sentinel){
 assert.deepEqual(Object.keys(value).sort(),keys)
 for(const key of flags)assert.equal(value[key],false)
 assert.equal(value.membership_kind,'reviewed_private_membership_v1')
 assert.equal(value.record_kind,'news_record')
 assert.equal(JSON.stringify(value).includes(sentinel),false)
 for(const [key,item] of Object.entries(value)){
  if(arrays.has(key)){
   assert.ok(Array.isArray(item));assert.ok(item.length<=32)
   for(const id of item)assert.match(id,/^[0-9a-f-]{36}$/)
   assert.deepEqual(item,[...new Set(item)].sort())
  }else assert.ok(item===null||typeof item!=='object')
 }
}
async function refused(promise){
 await assert.rejects(promise,error=>/^[A-Z0-9]{5}$/.test(error?.code??''))
}
const inputArgs=(scope,input)=>[scope,input.generation_id,input.input_hash,input.output_hash,input.review_id]
const writeArgs=(scope,id,p)=>[scope,id,p.generation_id,p.input_hash,p.output_hash,p.review_id,
 p.version,p.expected_predecessor,p.private_arc_revision,p.private_set_digest]
async function snapshot(client){
 // Synthetic metadata only. Prove this path does not mutate public assignment,
 // source identity, candidate state, arc state or release policy.
 return (await client.query(`select jsonb_build_object(
 'articles',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'arc_id',arc_id) order by id),'[]') from public.articles),
 'candidates',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'state',state,'updated_at',updated_at) order by id),'[]') from public.arc_membership_candidates),
 'arcs',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from public.story_arcs a),
 'release',(select coalesce(jsonb_agg(to_jsonb(p) order by model_version),'[]') from public.arc_membership_release_policy p)) result`)).rows[0].result
}
// Required fx fields: db, reviewer, sameReviewer (separate same LOGIN), gateway, outsider, worker, scope, sentinel,
// ids[>=4] (fixed synthetic UUIDs), first (real reviewed generation metadata),
// makeNextReviewedInput({privateHeadIds}) (real next candidate through all APIs),
// withRevokedScalarAccess(asyncBody) (actual set_scalar_access false/restored),
// withIdentityMutation(asyncBody) (committed synthetic canonical identity change, restored exactly in finally).
// Parent fixture owns database/environment guards, dependency installation,
// sanitized diagnostic rendering and exhaustive role/schema cleanup.
export async function assertNativeArcAttachments(fx){
 const {db,reviewer,gateway,outsider,worker,scope,sentinel,ids,first}=fx
 assert.equal(fx.syntheticFixture,true)
 assert.ok(Array.isArray(ids)&&ids.length>=4)
 const before=await snapshot(db)
 const firstPrepared=await invoke(reviewer,prepareSQL,inputArgs(scope,first))
 envelope(firstPrepared,prepareKeys,sentinel)
 assert.deepEqual(firstPrepared.dependency_head_ids,[])
 for(const client of [outsider,worker]){
  await refused(invoke(client,prepareSQL,inputArgs(scope,first)))
  await refused(invoke(client,readSQL,[scope,ids[0]]))
 }
 await refused(invoke(gateway,attachSQL,writeArgs(scope,ids[0],firstPrepared)))
 assert.equal((await fx.sameReviewer.query('select session_user p')).rows[0].p,
  (await reviewer.query('select session_user p')).rows[0].p)
 await reviewer.query('begin')
 let one,pending,settled=false
 try{
  one=await invoke(reviewer,attachSQL,writeArgs(scope,ids[0],firstPrepared))
  pending=invoke(fx.sameReviewer,attachSQL,writeArgs(scope,ids[0],firstPrepared))
   .then(value=>{settled=true;return value},error=>{settled=true;throw error})
  pending.catch(()=>{})
  let blocked=false
  for(let attempt=0;attempt<100;attempt++){
   blocked=(await db.query("select wait_event_type='Lock' b from pg_stat_activity where pid=$1",[fx.sameReviewer.processID])).rows[0]?.b
   if(blocked)break
   assert.equal(settled,false);await new Promise(resolve=>setTimeout(resolve,10))
  }
  assert.equal(blocked,true);assert.equal(settled,false)
  await reviewer.query('commit')
  assert.deepEqual(await pending,one)
 }finally{
  await reviewer.query('rollback')
  if(pending)await pending.catch(()=>{})
  await fx.sameReviewer.query('rollback')
 }
 envelope(one,originKeys,sentinel)
 assert.equal(one.state,'attached_private')
 assert.equal(one.attachment_id,ids[0])
 assert.deepEqual(one.current_head_ids,[ids[0]])
 assert.deepEqual(await invoke(reviewer,attachSQL,writeArgs(scope,ids[0],firstPrepared)),one)
 const wrong=writeArgs(scope,ids[0],firstPrepared);wrong[4]='0'.repeat(64)
 await refused(invoke(reviewer,attachSQL,wrong))
 assert.deepEqual(await snapshot(db),before)
 const twoInput=await fx.makeNextReviewedInput({privateHeadIds:[ids[0]]})
 const beforeSecond=await snapshot(db)
 const secondPrepared=await invoke(reviewer,prepareSQL,inputArgs(scope,twoInput))
 envelope(secondPrepared,prepareKeys,sentinel)
 assert.deepEqual(secondPrepared.dependency_head_ids,[ids[0]])
 const two=await invoke(reviewer,attachSQL,writeArgs(scope,ids[1],secondPrepared))
 envelope(two,originKeys,sentinel)
 const heads=[ids[0],ids[1]].sort()
 assert.deepEqual(two.current_head_ids,heads)
 assert.ok(two.current_member_ids.includes(one.article_id)&&two.current_member_ids.includes(two.article_id))
 // Earlier attachment remains valid after a later addition. Its original
 // private dependencies remain unchanged; no fresh-source substitution occurs.
 const oneLater=await invoke(gateway,readSQL,[scope,ids[0]])
 envelope(oneLater,originKeys,sentinel)
 assert.deepEqual(oneLater.current_head_ids,heads)
 const arc=await invoke(gateway,'select mip_arc_native.read_private_arc_membership($1,$2,$3,$4) result',
  [scope,one.arc_id,oneLater.current_arc_revision,oneLater.current_set_digest])
 envelope(arc,arcKeys,sentinel)
 assert.deepEqual(arc.member_ids,oneLater.current_member_ids)
 await refused(invoke(gateway,'select mip_arc_native.read_private_arc_membership($1,$2,$3,$4) result',
  [scope,one.arc_id,one.current_arc_revision,one.current_set_digest]))
 // Ordinary current-score input is stale because the complete private cohort
 // changed. The bound-origin reader is the only successor path.
 await refused(invoke(gateway,'select mip_arc_native.read_current_score($1,$2,$3,$4,$5) result',inputArgs(scope,first)))
 await fx.withRevokedScalarAccess(async()=>{
  await refused(invoke(gateway,readSQL,[scope,ids[0]]))
  await refused(invoke(gateway,readSQL,[scope,ids[1]]))
 })
 await fx.withIdentityMutation(async()=>{
  await refused(invoke(gateway,readSQL,[scope,ids[0]]))
 })
 envelope(await invoke(gateway,readSQL,[scope,ids[1]]),originKeys,sentinel)
 // Revoking an original dependency does not silently drop its dependent.
 const rev=await invoke(reviewer,revokeSQL,[scope,ids[2],ids[0],2,two.current_arc_revision,two.current_set_digest])
 assert.equal(rev.state,'revoked')
 await refused(invoke(gateway,readSQL,[scope,ids[0]]))
 await refused(invoke(gateway,readSQL,[scope,ids[1]]))
 // Exact revocation retry does not require stale evidence to become readable.
 assert.deepEqual(await invoke(reviewer,revokeSQL,[scope,ids[2],ids[0],2,two.current_arc_revision,two.current_set_digest]),rev)
 // Revoke remaining stale dependent using protected metadata enumeration only
 // through fixture owner context, never adding a caller grant.
 await db.query('set role mip_arc_native_owner')
 let state
 try{state=await invoke(db,'select mip_arc_native.attachment_members($1,$2,null) result',[scope,one.arc_id])}
 finally{await db.query('reset role')}
 await invoke(reviewer,revokeSQL,[scope,ids[3],ids[1],2,state.arc_revision,state.set_digest])
 for(const client of [gateway,worker,outsider]){
  for(const sql of ['select * from mip_arc_native.attachment_revisions',
   'select mip_arc_native.attachment_members($1,$2,null)',
   'select mip_arc_native.attachment_origin_record($1,$2)'])
   await refused(client.query(sql,sql.includes('attachment_members')?[scope,one.arc_id]:sql.includes('origin_record')?[scope,ids[0]]:[]))
 }
 const attrs=(await db.query("select rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls from pg_roles where rolname='mip_arc_attachment_owner'")).rows[0]
 assert.ok(attrs);for(const value of Object.values(attrs))assert.equal(value,false)
 assert.equal((await db.query("select count(*)::int n from pg_auth_members where roleid='mip_arc_attachment_owner'::regrole or member='mip_arc_attachment_owner'::regrole")).rows[0].n,0)
 assert.equal((await db.query("select count(*)::int n from pg_class where relnamespace='mip_arc_native'::regnamespace and relname in('attachment_revisions','attachment_article_heads','attachment_arc_clocks') and relowner='mip_arc_attachment_owner'::regrole and relrowsecurity and relforcerowsecurity")).rows[0].n,3)
 for(const relation of ['public.articles','public.story_arcs','public.arc_membership_candidates','public.arc_membership_release_policy','evidence_pipeline.article_captures']){
  assert.equal((await db.query("select has_any_column_privilege('mip_arc_attachment_owner',$1,'SELECT,INSERT,UPDATE,REFERENCES') allowed",[relation])).rows[0].allowed,false)
 }
 assert.deepEqual(await snapshot(db),beforeSecond)
 const retained=(await db.query('select coalesce(jsonb_agg(to_jsonb(x)),\'[]\') value from mip_arc_native.attachment_revisions x')).rows[0].value
 assert.equal(JSON.stringify(retained).includes(sentinel),false)
 const columns=['scope','id','article_id','arc_id','generation_id','review_id','input_hash','output_hash','manifest_hash','version',
 'predecessor','arc_revision','state','reason','dependency_head_ids','prior_set_digest','principal'].sort()
 for(const row of retained){
  assert.deepEqual(Object.keys(row).sort(),columns)
  assert.ok(['reviewed_private_membership','private_membership_revoked'].includes(row.reason))
  for(const [key,value] of Object.entries(row))if(key!=='dependency_head_ids')assert.ok(value===null||typeof value!=='object')
 }
 return {attachmentIds:ids.slice(0,4),publicMutation:false,publicationAllowed:false}
}
