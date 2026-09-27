// UNAPPROVED — SOURCE CANDIDATE ONLY — NOT AUTHORIZED FOR EXECUTION OR TRANSMISSION
// TESTS AUTHORED — NOT RUN.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash,randomUUID} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import {processGenerationClaim} from '../supabase/functions/source-comparison-generation-candidate/workerV2.js'
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8')
const hash=s=>createHash('sha256').update(s).digest('hex')
const impl='synthetic-native-minimization-v2',sentinel='UNSELECTED_NATIVE_PAYLOAD_SENTINEL_72da3860'
const sentence='Officials reportedly approved the council funding proposal on Tuesday.',version='native-capture-lineage-v2'
async function fixture(t){
 const db=await PGlite.create();t.after(()=>db.close())
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;')
 await db.exec(await read('supabase/qualification/comparison-generations/contract.sql'))
 await db.exec(await read('supabase/qualification/comparison-generations/source-fixture.sql'))
 await db.exec("create schema evidence_pipeline;create table evidence_pipeline.article_captures(id uuid primary key,article_id uuid not null,content_hash text not null,payload jsonb not null,captured_at timestamptz not null,review_state text not null);create table evidence_pipeline.evidence_candidates(id uuid primary key,capture_id uuid not null,candidate_kind text not null,source_field text not null,span_start int not null,span_end int not null,excerpt text not null,extractor_version text not null,review_state text not null,predecessor_candidate_id uuid);")
 await db.query('update public.articles set title=$1,summary=$1,body_text=null',[sentence])
 await db.query("insert into evidence_pipeline.article_captures select a.id,a.id,encode(sha256(convert_to(p.v::text,'UTF8')),'hex'),p.v,'2026-01-01','pending' from public.articles a cross join lateral(select jsonb_build_object('title',a.title,'summary',a.summary,'url','https://synthetic.invalid/source','outlet',a.outlet,'published_at',null,'body_text',$1::text,'unselected_debug',$1::text) v) p",[sentinel])
 await db.query("insert into evidence_pipeline.evidence_candidates select id,id,'claim','summary',0,length($1),$1,'synthetic-extractor-v1','pending',null from evidence_pipeline.article_captures",[sentence])
 await db.exec(await read('supabase/qualification/comparison-generations/source-snapshot.sql'))
 const snapshot=()=>db.query('select comparison_qualification.source_snapshot($1::jsonb,$2) v',[JSON.stringify({entries:[]}),impl]).then(r=>r.rows[0].v)
 const native=()=>db.query('select to_jsonb(c) v from evidence_pipeline.article_captures c order by id').then(r=>r.rows.map(x=>x.v))
 const input=await snapshot(),id=(await db.query("select comparison_qualification.enqueue('synthetic-only',$1::jsonb,$2,clock_timestamp()) id",[JSON.stringify(input),impl])).rows[0].id
 const claim=(await db.query('select comparison_qualification.claim() v')).rows[0].v,calls=[]
 const rpc=async(name,args)=>{calls.push([name,structuredClone(args)])
  if(name==='worker_complete')return(await db.query('select comparison_qualification.complete($1,$2,$3,$4,$5::jsonb) v',[args.p_generation,args.p_token,args.p_input_hash,args.p_implementation,JSON.stringify(args.p_output)])).rows[0].v
  if(name==='worker_fail')return(await db.query('select comparison_qualification.fail($1,$2,$3,$4) v',[args.p_generation,args.p_token,args.p_input_hash,args.p_implementation])).rows[0].v
  throw Error('unexpected RPC')}
 const options={rpc,requestId:()=>randomUUID(),session:'synthetic',runtime:'synthetic',implementation:impl,sha256:hash}
 assert.equal((await processGenerationClaim(options,claim)).state,'completed')
 const output=(await db.query('select output_payload v from comparison_qualification.outputs where generation_id=$1',[id])).rows[0].v
 const evidence=output.projection.article_claims.map(surface=>{
  const cap=input.eventInputs.flatMap(e=>e.members).find(m=>m.article.id===surface.article_id).retained_capture,k=cap.candidates.find(k=>k.excerpt===surface.surface_text);assert.ok(k)
  return {article_id:surface.article_id,claim_key:surface.claim_key,candidate_id:k.candidate_id,capture_id:cap.capture_id,content_hash:cap.content_hash,field:k.source_field,span_start:k.span_start,span_end:k.span_end,excerpt:k.excerpt,field_hash:k.field_hash,auditability_state:'verified_retained_source'}})
 const check=(i=input,o=output,e=evidence)=>db.query('select comparison_qualification.check_native_review_lineage($1::jsonb,$2::jsonb,$3::jsonb)',[JSON.stringify(i),JSON.stringify(o),JSON.stringify(e)])
 return {db,id,input,claim,output,evidence,check,snapshot,native,options,calls}
}
test('v2 metadata-only snapshots preserve authoritative bytes and statement consistency',async t=>{
 const f=await fixture(t);assert.equal(f.input.native_lineage_version,version);await f.check()
 assert.equal((await f.db.query('select comparison_qualification.source_snapshot($1::jsonb,$2)=comparison_qualification.source_snapshot($1::jsonb,$2) same',[JSON.stringify({entries:[]}),impl])).rows[0].same,true)
 assert.ok(JSON.stringify(await f.native()).includes(sentinel))
 for(const value of [f.input,f.output,f.calls.filter(([n])=>n==='worker_complete')])assert.ok(!JSON.stringify(value).includes(sentinel))
 for(const e of f.input.eventInputs)for(const m of e.members){const c=m.retained_capture
  assert.deepEqual(Object.keys(c).sort(),['article_id','candidates','capture_id','content_hash','contract_version','review_state','source_metadata'].sort())
  assert.deepEqual(Object.keys(c.source_metadata).sort(),['outlet','published_at','source_feed','source_key','url'].sort())
  for(const k of c.candidates){assert.equal(k.field_hash,hash(sentence));assert.equal(k.excerpt,sentence)
   assert.deepEqual(Object.keys(k).sort(),['candidate_id','capture_id','candidate_kind','source_field','span_start','span_end','excerpt','field_hash','predecessor_candidate_id','extractor_version','review_state'].sort())}}
 assert.equal((await f.db.query("select count(*)::int n from evidence_pipeline.evidence_candidates where review_state<>'pending'")).rows[0].n,0)
})
test('exact same completion arguments survive ambiguous delivery',async t=>{
 const f=await fixture(t),calls=[],rpc=async(n,a)=>{calls.push([n,structuredClone(a)]);if(calls.length===1)throw Error('lost acknowledgement');return 'completed'}
 const result=await processGenerationClaim({...f.options,rpc},f.claim)
 assert.equal(result.state,'completion_unconfirmed');assert.equal(await result.retry(),'completed');assert.deepEqual(calls[0],calls[1]);assert.equal(calls[0][0],'worker_complete')
 assert.equal(calls[0][1].p_input_hash,f.claim.input_hash);assert.equal(calls[0][1].p_token,f.claim.lease_token);assert.ok(!JSON.stringify(calls).includes(sentinel))
})
test('unknown nested fields and object-valued scalar metadata cannot enter completion',async t=>{
 const f=await fixture(t)
 for(const mutate of [i=>i.eventInputs[0].members[0].retained_capture.payload={body_text:sentinel},i=>i.eventInputs[0].members[0].retained_capture.source_metadata.unselected=sentinel,i=>i.eventInputs[0].members[0].retained_capture.candidates[0].unselected=sentinel,i=>i.eventInputs[0].members[0].retained_capture.source_metadata.url={payload:sentinel},i=>i.snapshot_metadata.scope={payload:sentinel}]){
  const i=structuredClone(f.input);mutate(i);const input_text=JSON.stringify(i),calls=[]
  await processGenerationClaim({...f.options,rpc:async(n,a)=>{calls.push([n,a]);return 'failed'}},{...f.claim,input_text,input_hash:hash(input_text)})
  assert.deepEqual(calls.map(c=>c[0]),['worker_fail'])}
})
test('review refuses substituted identities, field/span/hash and promoted pending lineage',async t=>{
 const f=await fixture(t)
 for(const patch of [{candidate_id:randomUUID()},{capture_id:randomUUID()},{article_id:randomUUID()},{content_hash:'0'.repeat(64)},{field:'title'},{span_start:1},{span_end:sentence.length-1},{excerpt:'substitute'},{field_hash:'0'.repeat(64)}]){
  const e=structuredClone(f.evidence);Object.assign(e[0],patch);await assert.rejects(f.check(f.input,f.output,e))}
 const missing=structuredClone(f.input);missing.eventInputs[0].members[0].retained_capture=null;await assert.rejects(f.check(missing))
 const promoted=structuredClone(f.output);promoted.lineage_review_state='accepted';await assert.rejects(f.check(f.input,promoted))
})
test('supersession changes current snapshot without rewriting the retained generation',async t=>{
 const f=await fixture(t),before=JSON.stringify(f.input),old=f.input.eventInputs[0].members[0].retained_capture.candidates[0],successor=randomUUID()
 await f.db.query("insert into evidence_pipeline.evidence_candidates select $1::uuid,capture_id,candidate_kind,source_field,span_start,span_end,excerpt,extractor_version||':next',review_state,id from evidence_pipeline.evidence_candidates where id=$2",[successor,old.candidate_id])
 await assert.rejects(f.check());const next=await f.snapshot();assert.deepEqual(next.eventInputs[0].members[0].retained_capture.candidates.map(k=>k.candidate_id),[successor]);assert.equal(JSON.stringify(f.input),before)
 assert.equal((await f.db.query('select input_payload v from comparison_qualification.generations where id=$1',[f.id])).rows[0].v.native_lineage_version,version)
})
test('missing, corrupted and inaccessible evidence fails closed',async t=>{
 const f=await fixture(t)
 await f.db.exec('begin;delete from evidence_pipeline.evidence_candidates');await assert.rejects(f.check());await f.db.exec('rollback')
 await f.db.exec("begin;update evidence_pipeline.article_captures set content_hash=repeat('0',64)");await assert.rejects(f.check());await f.db.exec('rollback')
 for(const role of ['anon','authenticated','service_role']){await f.db.exec('set role '+role);await assert.rejects(f.check(),/permission denied/);await f.db.exec('reset role')}
})
test('v2 and original legacy projections match and legacy retries keep original payload bytes',async t=>{
 const f=await fixture(t)
 const legacy=(await f.db.query('select comparison_qualification.source_snapshot_legacy($1::jsonb,$2) v',[JSON.stringify({entries:[]}),impl])).rows[0].v
 assert.ok(JSON.stringify(legacy).includes(sentinel));const input_text=JSON.stringify(legacy),calls=[]
 const result=await processGenerationClaim({...f.options,rpc:async(n,a)=>{calls.push([n,structuredClone(a)]);if(calls.length===1)throw Error('ambiguous legacy commit');return 'completed'}},{...f.claim,input_text,input_hash:hash(input_text)})
 assert.equal(result.state,'completion_unconfirmed');assert.equal(await result.retry(),'completed');assert.deepEqual(calls[0],calls[1]);assert.deepEqual(calls[0][1].p_output.projection,f.output.projection)
 assert.ok(JSON.stringify(calls[0][1].p_output.retained_lineage).includes(sentinel))
})
