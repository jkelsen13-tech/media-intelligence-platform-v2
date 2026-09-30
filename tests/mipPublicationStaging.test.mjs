import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {fixture} from './isolatedCandidateFixture.mjs'
async function pub(t){
 const f=await fixture(t,{extension:true});const id=await f.capture();await f.worker()
 await f.db.exec(await readFile(new URL('../supabase/qualification/mip-cutover-authority/004_publication_staging.sql',import.meta.url),'utf8'))
 const add=async(key,children=[])=>{
  const v=(await f.db.query("insert into mip_cutover_authority.dependency_versions(dependency_key,source,children,record_hash,privacy_eligible,rights_eligible,retained_evidence,correction_current,explanation_eligible,publication_eligible,state,valid_until,predicate_version) values($1,'source',$2,repeat('a',64),true,true,true,true,true,true,'current','2999-01-01','synthetic-fixture-only') returning id",[key,children])).rows[0].id
  await f.db.query('insert into mip_cutover_authority.dependency_heads values($1,$2)',[key,v]);return v
 }
 const child=await add('child'),root=await add('root',['child'])
 const approved=(await f.db.query("insert into mip_cutover_authority.approved_payloads(source,generation_id,payload,payload_hash,dependency_versions,owner_approval_ref) values('source',$1,'{}',encode(sha256(convert_to('{}','UTF8')),'hex'),$2,'synthetic-owner-fixture-not-production') returning id",[id,[root,child]])).rows[0].id
 return {...f,approved,root,child,select:()=>f.db.query('select mip_cutover_authority.select_approved_payload($1)',[approved])}
}
test('publication selection binds immutable approved payload and all transitive versions',async t=>{
 const f=await pub(t);await f.select();await f.select()
 assert.equal((await f.db.query('select count(*)::int n from mip_cutover_authority.publication_selections')).rows[0].n,1)
 await assert.rejects(f.db.query("update mip_cutover_authority.approved_payloads set payload='{}'"),/immutable/)
 await f.db.query("delete from mip_cutover_authority.dependency_heads where dependency_key='child'")
 await assert.rejects(f.select(),/dependency_ineligible/)
})
for(const field of ['privacy_eligible','rights_eligible','retained_evidence','correction_current','explanation_eligible','publication_eligible'])test('publication rejects transitive '+field,async t=>{
 const f=await pub(t)
 // Append a new version; never edit retained evidence or approval history.
 const next=(await f.db.query("insert into mip_cutover_authority.dependency_versions(dependency_key,source,children,record_hash,privacy_eligible,rights_eligible,retained_evidence,correction_current,explanation_eligible,publication_eligible,state,valid_until,predicate_version) select dependency_key,source,children,record_hash,"+
 ['privacy_eligible','rights_eligible','retained_evidence','correction_current','explanation_eligible','publication_eligible'].map(x=>x===field?'false':x).join(',')+
 ",state,valid_until,predicate_version from mip_cutover_authority.dependency_versions where id=$1 returning id",[f.child])).rows[0].id
 await f.db.query("update mip_cutover_authority.dependency_heads set version_id=$1 where dependency_key='child'",[next])
 const replacement=(await f.db.query("insert into mip_cutover_authority.approved_payloads(source,generation_id,payload,payload_hash,dependency_versions,owner_approval_ref) select source,generation_id,payload,payload_hash,$1,owner_approval_ref from mip_cutover_authority.approved_payloads where id=$2 returning id",[[f.root,next],f.approved])).rows[0].id
 await assert.rejects(f.db.query('select mip_cutover_authority.select_approved_payload($1)',[replacement]),/dependency_ineligible/)
 assert.equal((await f.db.query('select count(*)::int n from mip_cutover_authority.publication_selections')).rows[0].n,0)
})
test('publication release and worker access remain disabled',async t=>{
 const f=await pub(t)
 await f.db.exec('set role mip_comparison_worker_v1')
 try{await assert.rejects(f.db.query('select mip_cutover_authority.select_approved_payload($1)',[f.approved]),/permission denied/)}
 finally{await f.db.exec('reset role')}
 await assert.rejects(f.db.query("select mip_cutover_authority.publisher_release(gen_random_uuid(),gen_random_uuid(),'runtime-a','source')"),/not_provisioned/)
})

for(const [label,state,until] of [['withdrawn','withdrawn','2999-01-01'],['revoked','revoked','2999-01-01'],['stale','current','2000-01-01']])test('publication denies '+label+' dependency even with matching version approval',async t=>{
 const f=await pub(t)
 const next=(await f.db.query("insert into mip_cutover_authority.dependency_versions(dependency_key,source,children,record_hash,privacy_eligible,rights_eligible,retained_evidence,correction_current,explanation_eligible,publication_eligible,state,valid_until,predicate_version) select dependency_key,source,children,record_hash,privacy_eligible,rights_eligible,retained_evidence,correction_current,explanation_eligible,publication_eligible,$2,$3,predicate_version from mip_cutover_authority.dependency_versions where id=$1 returning id",[f.child,state,until])).rows[0].id
 await f.db.query("update mip_cutover_authority.dependency_heads set version_id=$1 where dependency_key='child'",[next])
 const approved=(await f.db.query("insert into mip_cutover_authority.approved_payloads(source,generation_id,payload,payload_hash,dependency_versions,owner_approval_ref) select source,generation_id,payload,payload_hash,$1,owner_approval_ref from mip_cutover_authority.approved_payloads where id=$2 returning id",[[f.root,next],f.approved])).rows[0].id
 await assert.rejects(f.db.query('select mip_cutover_authority.select_approved_payload($1)',[approved]),/dependency_ineligible/)
})
