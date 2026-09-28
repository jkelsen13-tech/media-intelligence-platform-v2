// Source-authored helper: actual selected PostgreSQL fixture only. NOT RUN here.
import assert from 'node:assert/strict';

const receiptKeys=['contract','scope','binding_id','manifest_hash','native_generation_id','comparison_generation_id','state','publication_allowed','attachment_allowed'].sort();
const queryAdmit='select mip_native_comparison.admit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result';
const queryRead='select mip_native_comparison.read_current($1,$2,$3,$4,$5) result';
const value=async(client,sql,args)=>(await client.query(sql,args)).rows[0].result;
const failure=error=>{
 const code=/^[A-Z0-9]{5}$/.test(error?.code??'')?error.code:'NONE';
 const frames=String(error?.stack??'').split('\n').slice(1).flatMap(line=>{
  const m=line.match(/(?:nativeComparisonBindingAssertions\.mjs|nativeArcCohortPostgres17\.test\.mjs):(\d{1,6}):(\d{1,6})/);
  return m?[m[0]]:[];
 }).slice(0,4);
 return {code,frames};
};
const denied=async promise=>assert.rejects(promise,e=>e?.code==='42501'||e?.code==='P0001');
export async function assertNativeComparisonBinding(fx){
 if(fx.syntheticFixture!==true)throw Error('native_comparison_real_fixture_required');
 const {db,reviewer,sameReviewer,gateway,outsider,worker,scope,native,comparison,otherComparison,
  nativeSources,bindingIds,sentinels,finalAssertion,
  withRevokedComparisonSession,withRevokedNativeAccess,withInvalidatedComparison,withFinalBoundary}=fx;
 for(const client of [db,reviewer,sameReviewer,gateway,outsider,worker])if(typeof client?.query!=='function')throw Error('native_comparison_real_clients_required');
 for(const callback of [withRevokedComparisonSession,withRevokedNativeAccess,withInvalidatedComparison,withFinalBoundary])
  if(typeof callback!=='function')throw Error('native_comparison_real_mutation_required');
 if(!Array.isArray(nativeSources)||nativeSources.length<2||!Array.isArray(bindingIds)||bindingIds.length!==2
 ||!Array.isArray(sentinels)||!sentinels.length||typeof finalAssertion!=='string'||!otherComparison)
  throw Error('native_comparison_fixture_shape');
 let checks=0;let receipt;
 const args=(id=bindingIds[0],comp=comparison)=>[scope,id,native.projection_id,native.dependency_hash,native.display_hash,
  native.review_id,comp.session,comp.runtime,comp.release_request,comp.event_id];
 const readArgs=()=>[scope,bindingIds[0],receipt.manifest_hash,comparison.session,comparison.runtime];
 const read=(client=reviewer)=>value(client,queryRead,readArgs());
 const check=async(label,body)=>{checks++;try{await body()}catch(error){
  const diag=failure(error);throw Error('native_comparison_check_'+checks+'_'+label+'_sqlstate_'+diag.code+'_frames_'+diag.frames.join(','));
 }};
 await check('dual_authority_and_actual_binding',async()=>{
  for(const client of [outsider,worker,gateway])await denied(value(client,queryAdmit,args()));
  receipt=await value(reviewer,queryAdmit,args());
  assert.deepEqual(Object.keys(receipt).sort(),receiptKeys);
  assert.equal(receipt.native_generation_id,native.generation_id);
  assert.equal(receipt.comparison_generation_id,comparison.generation_id);
  assert.notEqual(receipt.native_generation_id,receipt.comparison_generation_id);
  assert.equal(receipt.state,'bound_private');assert.equal(receipt.publication_allowed,false);assert.equal(receipt.attachment_allowed,false);
  assert.deepEqual(await read(),receipt);
  // Read authority requires both a current native member and a valid broker session.
  assert.deepEqual(await read(gateway),receipt);
  for(const client of [outsider,worker])await denied(read(client));
  await denied(value(reviewer,queryRead,[scope,bindingIds[0],receipt.manifest_hash,fx.id(7999),comparison.runtime]));
  await denied(value(reviewer,queryRead,[scope,bindingIds[0],receipt.manifest_hash,comparison.session,'unbound-synthetic-runtime']));
 });
 await check('exact_retry_and_real_event_mismatch',async()=>{
  assert.deepEqual(await value(sameReviewer,queryAdmit,args()),receipt);
  assert.deepEqual(await Promise.all([value(reviewer,queryAdmit,args()),value(sameReviewer,queryAdmit,args())]),[receipt,receipt]);
  // otherComparison must itself be an actual accepted reader result for a
  // different source set, not a random generation ID or mocked validator.
  await denied(value(reviewer,queryAdmit,args(bindingIds[1],otherComparison)));
  await denied(value(reviewer,queryAdmit,args(bindingIds[0],otherComparison)));
  assert.equal((await db.query('select count(*)::int n from mip_native_comparison.bindings where scope=$1',[scope])).rows[0].n,1);
  assert.deepEqual(await read(),receipt);
 });
 await check('metadata_only_original_identity',async()=>{
  const stored=(await db.query('select manifest,manifest_hash from mip_native_comparison.bindings where scope=$1 and id=$2',[scope,bindingIds[0]])).rows[0];
  assert.equal(stored.manifest_hash,receipt.manifest_hash);
  assert.deepEqual(Object.keys(stored.manifest).sort(),['contract','codec','native','comparison','publication_allowed','attachment_allowed'].sort());
  assert.deepEqual(Object.keys(stored.manifest.native).sort(),['projection_id','generation_id','projection_review_id','dependency_hash','display_hash','input_hash','output_hash','score_review_id','cohort_id','sources'].sort());
  assert.deepEqual(Object.keys(stored.manifest.comparison).sort(),['generation_id','review_revision','policy_revision','release_request','event_id','runtime_hash','input_hash','output_hash','approved_payload_hash','sources','evidence'].sort());
  assert.deepEqual(stored.manifest.native.sources,[...nativeSources].sort((a,b)=>a.article_id.localeCompare(b.article_id)));
  for(const source of stored.manifest.native.sources)assert.deepEqual(Object.keys(source).sort(),['article_id','capture_id','content_hash','job_id'].sort());
  for(const source of stored.manifest.comparison.sources)assert.deepEqual(Object.keys(source).sort(),['article_id','capture_id','content_hash','membership_hash'].sort());
  for(const evidence of stored.manifest.comparison.evidence){
   assert.deepEqual(Object.keys(evidence).sort(),['article_id','capture_id','candidate_id','content_hash','source_field','field_hash','span_start','span_end','span_units','claim_key_hash'].sort());
   assert.equal(evidence.span_units,'unicode_code_points');
  }
  for(const text of sentinels){assert.equal(JSON.stringify(stored).includes(text),false);assert.equal(JSON.stringify(receipt).includes(text),false)}
  assert.equal(JSON.stringify(stored).includes(comparison.session),false);
  assert.equal(JSON.stringify(stored).includes(comparison.runtime),false);
  for(const source of nativeSources){
   assert.equal((await db.query('select content_hash from evidence_pipeline.article_captures where id=$1',[source.capture_id])).rows[0].content_hash,source.content_hash);
  }
 });
 await check('current_both_sides_refuse_real_revocation',async()=>{
  for(const mutate of [withRevokedComparisonSession,withRevokedNativeAccess,withInvalidatedComparison]){
   assert.deepEqual(await read(),receipt);
   // Callback performs actual SQL mutation in an owned rollback transaction,
   // then provides a real connection with the intended reviewer session_user.
   await mutate(async client=>{await denied(read(client));await denied(value(client,queryAdmit,args()));});
   assert.deepEqual(await read(),receipt);
  }
 });
 await check('direct_wrapper_and_final_acl_boundary',async()=>{
  for(const client of [gateway,outsider,worker]){
   await denied(client.query('select * from mip_native_comparison.bindings'));
   await denied(client.query('select mip_native_comparison.authorize_session($1,$2)',[comparison.session,comparison.runtime]));
   await denied(client.query('select mip_native_comparison.comparison_metadata($1,$2,$3,$4)',[comparison.session,comparison.runtime,comparison.release_request,comparison.event_id]));
  }
  // Reuse the main fixture's exact worker-edge rollback cleanup. Production
  // closure is never weakened to accommodate activated synthetic logins.
  await withFinalBoundary(async client=>{
   await client.query(finalAssertion);
   await client.query('savepoint binding_acl_probe');
   try{
    await client.query('grant execute on function mip_native_comparison.collect(uuid,uuid,text,text,uuid,uuid,text,uuid,uuid) to public');
    await assert.rejects(client.query(finalAssertion),e=>e.code==='P0001'&&e.message==='native_comparison_function_acl');
   }finally{await client.query('rollback to savepoint binding_acl_probe')}
   await client.query(finalAssertion);
  });
 });
 await check('append_only_local_revocation_no_publication',async()=>{
  await denied(gateway.query('select mip_native_comparison.revoke_binding($1,$2)',[scope,bindingIds[0]]));
  await reviewer.query('select mip_native_comparison.revoke_binding($1,$2)',[scope,bindingIds[0]]);
  await denied(read());await denied(value(reviewer,queryAdmit,args()));
  await reviewer.query('select mip_native_comparison.revoke_binding($1,$2)',[scope,bindingIds[0]]);
  assert.equal((await db.query('select count(*)::int n from mip_native_comparison.revocations where scope=$1 and binding_id=$2',[scope,bindingIds[0]])).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from mip_native_comparison.bindings where scope=$1 and id=$2',[scope,bindingIds[0]])).rows[0].n,1);
  await assert.rejects(db.query('update mip_native_comparison.bindings set manifest=manifest where scope=$1 and id=$2',[scope,bindingIds[0]]),e=>e.code==='P0001');
 });
 return {checks,publication_allowed:false,attachment_allowed:false};
}
