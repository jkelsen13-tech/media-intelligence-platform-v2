import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {assertAuthoritativeReviewShape} from '../supabase/qualification/mip-cutover-authority/eftaReviewContract.mjs'

// These are static final-contract guards. The PostgreSQL 17 qualification harness supplies
// executable migration, RLS, role, race, and replay coverage; these tests do not replace it.
const sql = await readFile(new URL('../supabase/qualification/mip-cutover-authority/011_efta_governed_review.sql', import.meta.url), 'utf8')
const compact = sql.replace(/\s+/g, ' ')

test('final EFTA entry points use narrow roles and current signatures', () => {
 assert.match(compact,/grant execute on function mip_identity\.efta_resolve_identity\(uuid,text,uuid,uuid,text,text,uuid,text,uuid\), mip_identity\.efta_decide\(uuid,uuid,text,uuid,jsonb,uuid,text,uuid\) to mip_efta_reviewer_v1/)
 assert.match(compact,/grant execute on function mip_identity\.efta_admit\(uuid,uuid,uuid,text,uuid\) to mip_efta_admitter_v1/)
 assert.match(compact,/grant execute on function mip_identity\.efta_private_read\(uuid,uuid,text,uuid\) to mip_efta_private_reader_v1/)
 assert.match(compact,/revoke usage on schema mip_identity from mip_factual_reviewer_v3/)
})

test('all six EFTA definers have empty search_path and EFTA owner',()=>{
 for(const name of ['efta_current_binding','efta_require_identity','efta_resolve_identity','efta_decide','efta_admit','efta_private_read'])
  assert.match(compact,new RegExp(`create (?:or replace )?function mip_identity\\.${name}\\([^;]+?security definer set search_path=''`,'i'))
 assert.match(compact,/where n\.nspname='mip_identity' and p\.proname in \('efta_current_binding','efta_require_identity','efta_resolve_identity','efta_decide','efta_admit','efta_private_read'\)/)
 assert.match(compact,/alter function '\|\|f\|\|' owner to mip_efta_owner_v1/)
 assert.match(compact,/alter default privileges for role mip_efta_owner_v1 revoke execute on functions from public,anon,authenticated,service_role/)
})

test('authority heads are relationally bound to exact version identity',()=>{
 assert.match(compact,/foreign key\(subject_id,database_principal,revision\) references mip_identity\.efta_authority_assignment_versions\(subject_id,database_principal,revision\)/)
 assert.match(compact,/foreign key\(institution_id,revision\) references mip_identity\.efta_institution_versions\(institution_id,revision\)/)
 assert.match(compact,/foreign key\(candidate_id,operation,domain,revision\) references mip_identity\.efta_operation_evidence_versions\(candidate_id,operation,domain,revision\)/)
})

test('operation reader rejects cross-cell version substitution',()=>{
 assert.match(compact,/v\.candidate_id is distinct from candidate or v\.operation is distinct from p_scope->>'operation' or v\.domain is distinct from p_scope->>'domain' or v\.audience is distinct from p_scope->>'audience' or v\.capture_id::text is distinct from b->>'capture_id'/)
 assert.match(compact,/foreach op in array array\['retention','analysis','excerpt_display'\]/)
 assert.match(compact,/foreach domain in array array\['rights','privacy'\]/)
})

test('head rotation is owner-gated and denied to runtime roles',()=>{
 assert.match(compact,/revoke all on mip_identity\.%I from public,anon,authenticated,service_role,mip_factual_reviewer_v3,mip_projection_publisher_v1,mip_efta_reviewer_v1,mip_efta_admitter_v1,mip_efta_private_reader_v1/)
 assert.doesNotMatch(compact,/grant update on mip_identity\.efta_(?:authority_assignment_heads|institution_heads|operation_evidence_heads) to mip_efta_/)
 assert.match(compact,/create trigger publication_fence before insert or update or delete on mip_identity\.%I for each statement execute function mip_cutover_authority\.fence_publication_write\(\)/)
})

test('authoritative decisions reject caller entity and reads derive canonical entity',()=>{
 assert.match(compact,/p_review \? 'geography' or p_review \? 'place_id' or p_review \? 'entity'/)
 assert.match(compact,/'entity',jsonb_build_object\('kind','institution','namespace','mip:institution', 'id',v\.institution_id::text,'label',v\.normalized_label,'resolution_ref',v\.revision::text\)/)
 assert.match(compact,/'review',\(d\.review-'entity'\)\|\|jsonb_build_object\('entity',identity->'entity'\)/)
})

test('authoritative review shape accepts omitted entity and rejects caller identity material',()=>{
 const review={identity_resolution_id:'11111111-1111-4111-8111-111111111111'}
 assert.equal(assertAuthoritativeReviewShape(review),true)
 assert.throws(()=>assertAuthoritativeReviewShape({...review,entity:{kind:'institution',id:'attacker'}}),/free_text_authority_entity/)
})

test('exact replay revalidates source, operation and identity and rejects replaced history',()=>{
 assert.match(compact,/if exists\(select 1 from mip_identity\.efta_decisions where predecessor=prior\.id\) then raise exception 'efta_decision_replaced'/)
 assert.match(compact,/b:=mip_identity\.efta_current_binding\(prior\.candidate_id\); operations:=mip_identity\.operation_closure\(prior\.candidate_id,b\)/)
 assert.match(compact,/operations->>'closure_hash' is distinct from prior\.operation_receipt_hash/)
 assert.match(compact,/identity:=mip_identity\.efta_require_identity\(prior\.identity_resolution_id,b\)/)
 assert.match(compact,/if exists\(select 1 from mip_identity\.efta_identity_resolutions where predecessor=prior\.id\) then raise exception 'efta_identity_replaced'/)
})

test('free-text authority and public release remain denied',()=>{
 assert.match(compact,/p_review \?\| array\['reviewer','rights_ref','privacy_ref','owner_authorization_ref'\]/)
 assert.doesNotMatch(compact,/grant execute on function mip_identity\.release_public\(\) to mip_efta_/)
})
