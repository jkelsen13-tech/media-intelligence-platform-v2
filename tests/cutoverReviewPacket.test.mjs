import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync, readdirSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {
  DISCLOSED_PATHS,
  OPERATIONAL_BASELINE_COMMIT,
  PACKET_ID,
  assertPacketHygiene,
  buildManifest,
  sha256File
} from '../scripts/buildCutoverReviewPacket.mjs'

const repoRoot=fileURLToPath(new URL('..',import.meta.url))
const packet=join(repoRoot,'verifier/mip-production-cutover-review-v1')
const hex64=/^[0-9a-f]{64}$/
const sha1=/^[0-9a-f]{40}$/

test('review result is prepared only; PASS is not prepopulated',()=>{
  const result=JSON.parse(readFileSync(join(packet,'REVIEW_RESULT.json'),'utf8'))
  assert.equal(result.id,PACKET_ID)
  assert.equal(result.status,'PACKET_PREPARED_REVIEW_NOT_PERFORMED')
  assert.equal(result.outcome,null)
  assert.equal(result.pass,null)
  assert.equal(result.fail,null)
  assert.equal(result.owner_acceptance,null)
  assert.equal(result.independent_review.contacted,false)
  assert.equal(result.independent_review.result,null)
  assert.equal(result.production_cutover,'ON_HOLD')
  assert.equal(result.automatic_membership_approval,'disabled')
  assert.equal(result.publication,'disabled')
  assert.equal(result.operational_baseline_commit,OPERATIONAL_BASELINE_COMMIT)
  assert.match(JSON.stringify(result),/PACKET_PREPARED_REVIEW_NOT_PERFORMED/)
  assert.doesNotMatch(JSON.stringify(result),/"outcome"\s*:\s*"PASS"/)
  const acceptance=JSON.parse(readFileSync(join(packet,'OWNER_ACCEPTANCE.json'),'utf8'))
  assert.equal(acceptance.status,'NOT_SUBMITTED')
  assert.equal(acceptance.accepted,null)
  assert.equal(acceptance.production_cutover_authorized,false)
})

test('evaluation policy thresholds are null and not fitted',()=>{
  const policy=JSON.parse(readFileSync(join(packet,'evaluation-policy.json'),'utf8'))
  assert.equal(policy.status,'proposed_not_approved')
  assert.equal(policy.qualification,'not_assessed')
  for(const [name,value] of Object.entries(policy.measures.thresholds)){
    assert.equal(value,null,name)
  }
  assert.equal(policy.critical_error_rules.critical_error_threshold,null)
  assert.equal(policy.sample_requirements.minimum_cases,null)
  assert.ok(policy.reference_label_protocol.not_ground_truth.includes('implementation-agent labels'))
  assert.ok(policy.reference_label_protocol.not_ground_truth.includes('model agreement'))
})

test('disclosure manifest matches hashed files; hashes are 64 hex; packet is secret-free',()=>{
  const built=buildManifest({reviewPacketCommit:null})
  const committed=JSON.parse(readFileSync(join(packet,'disclosure-manifest.json'),'utf8'))
  assert.equal(committed.packet_id,PACKET_ID)
  assert.equal(committed.disclosure_status,'proposed_not_transmitted')
  assert.equal(committed.operational_baseline_commit,OPERATIONAL_BASELINE_COMMIT)
  assert.equal(committed.secret_free,true)
  if(committed.review_packet_commit!==null){
    assert.match(committed.review_packet_commit,sha1)
  }
  assert.deepEqual(
    committed.hashed_files.map(x=>({path:x.path,sha256:x.sha256})),
    built.hashed_files.map(x=>({path:x.path,sha256:x.sha256}))
  )
  for(const row of committed.hashed_files){
    assert.match(row.sha256,hex64,row.path)
    assert.equal(row.sha256,sha256File(row.path),row.path)
  }
  const hygiene=assertPacketHygiene()
  assert.deepEqual(hygiene,[])
  const inventory=JSON.parse(readFileSync(join(packet,'runtime-inventory.json'),'utf8'))
  for(const project of inventory.projects){
    for(const fn of project.edge_functions||[]){
      assert.match(fn.ezbr_sha256,hex64,project.ref+':'+fn.slug)
    }
  }
  const backfill=inventory.projects.find(p=>p.ref==='yhbwnrtlqbjtcrrlpbge')
    .edge_functions.find(f=>f.slug==='backfill-legacy')
  assert.equal(backfill.ezbr_sha256,'5cd76641e068fb512c9d0815f9d35325a9806be11593829df1daf62f87de8f68')
})

test('capability SQL stays out of migrations and default publication stays off',()=>{
  const capability=readFileSync(join(repoRoot,'supabase/qualification/comparison-generations/capability.sql'),'utf8')
  assert.match(capability,/publication_release_enabled boolean not null default false/)
  assert.match(capability,/membership_auto_approval_enabled boolean not null default false/)
  assert.match(capability,/mip_publication_disabled/)
  assert.match(capability,/mip_membership_auto_approval_disabled/)
  assert.match(capability,/diagnose_bound_call/)
  assert.doesNotMatch(capability,/grant execute[^\n]+publisher_release[^\n]+service_role/)
  const migrations=readdirSync(join(repoRoot,'supabase/migrations'))
  for(const name of migrations){
    const sql=readFileSync(join(repoRoot,'supabase/migrations',name),'utf8')
    assert.doesNotMatch(sql,/qual_comparison_worker/)
    assert.doesNotMatch(sql,/publisher_release_enabled/)
  }
  assert.ok(DISCLOSED_PATHS.includes('supabase/qualification/comparison-generations/capability.sql'))
})
