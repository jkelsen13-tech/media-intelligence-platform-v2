import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {PGlite} from '@electric-sql/pglite'
import {hypothesisFixture} from './hypothesisAssessmentFixture.mjs'
import {createHypothesisStore} from '../supabase/qualification/hypothesis-assessments/store.mjs'
const user='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002'
const investigation='20000000-0000-4000-8000-000000000001',foreign='20000000-0000-4000-8000-000000000002'
test('isolated durable hypothesis revisions and gateway boundary',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'mip-hypothesis-synthetic-'))
 let db=await PGlite.create(dir)
 t.after(async()=>{await db.close();await rm(dir,{recursive:true,force:true})})
 await db.exec(`create schema evidence_pipeline;
 create table evidence_pipeline.investigation_memberships(investigation_id uuid,user_id uuid,access_role text,primary key(investigation_id,user_id));
 alter table evidence_pipeline.investigation_memberships enable row level security;
 create role synthetic_hypothesis_worker nologin;
 insert into evidence_pipeline.investigation_memberships values('${investigation}','${user}','reviewer'),('${investigation}','${other}','viewer');`)
 await db.exec(await readFile(new URL('../supabase/qualification/hypothesis-assessments/001_revision_store.sql',import.meta.url),'utf8'))
 const store=createHypothesisStore((...args)=>db.query(...args))
 const request=(requestId='30000000-0000-4000-8000-000000000001')=>{
  const assessment=hypothesisFixture()
  assessment.question_id=investigation
  return {verifiedUserId:user,investigationId:investigation,requestId,predecessorId:null,assessment}
 }
 let first,payload=request()
 await t.test('server-assigned immutable revision, exact retry and changed-argument conflict',async()=>{
  await db.exec('set role mip_hypothesis_gateway')
  first=await store.append(payload)
  assert.equal(first.revision,1);assert.notEqual(first.id,payload.assessment.id)
  assert.ok(Date.parse(first.completed_at)>Date.parse(payload.assessment.completed_at))
  assert.deepEqual(await store.append(payload),first)
  await assert.rejects(store.append({...payload,assessment:{...payload.assessment,revision_reason:'different'}}),/retry conflict/)
  await assert.rejects(db.query('select * from mip_hypothesis.revisions'),/permission denied/)
  await db.exec('reset role')
 })
 await t.test('worker cannot read, write or elevate to the owner',async()=>{
  await db.exec('set role synthetic_hypothesis_worker')
  await assert.rejects(store.history({verifiedUserId:user,investigationId:investigation}),/permission denied/)
  await assert.rejects(store.append(payload),/permission denied/)
  // Membership, not a claimed user UUID, decides gateway authorization.
  await db.exec('reset role')
  assert.equal((await db.query("select pg_has_role('synthetic_hypothesis_worker','mip_hypothesis_owner','MEMBER') as allowed")).rows[0].allowed,false)
 })
 await t.test('cross-investigation and viewer append fail while authorized viewer history succeeds',async()=>{
  await db.exec('set role mip_hypothesis_gateway')
  await assert.rejects(store.history({verifiedUserId:user,investigationId:foreign}),/read denied/)
  await assert.rejects(store.append({...payload,verifiedUserId:other}),/append denied/)
  assert.equal((await store.history({verifiedUserId:other,investigationId:investigation})).length,1)
  await db.exec('reset role')
 })
 await t.test('revoked membership blocks receipt retry rather than preserving authority',async()=>{
  await db.query("update evidence_pipeline.investigation_memberships set access_role='revoked' where user_id=$1",[user])
  await db.exec('set role mip_hypothesis_gateway')
  await assert.rejects(store.append(payload),/append denied/)
  await assert.rejects(store.history({verifiedUserId:user,investigationId:investigation}),/read denied/)
  await db.exec('reset role')
  await db.query("update evidence_pipeline.investigation_memberships set access_role='reviewer' where user_id=$1",[user])
 })
 await t.test('replacement compare-and-set preserves old assessment and rejects stale competing completion',async()=>{
  const next=request('30000000-0000-4000-8000-000000000002')
  next.predecessorId=first.id
  Object.assign(next.assessment,{id:'pending-next',revision:2,predecessor_id:first.id,revision_trigger:'correction',revision_effect:'less_certain'})
  await db.exec('set role mip_hypothesis_gateway')
  const second=await store.append(next)
  assert.equal(second.predecessor_id,first.id);assert.equal(second.revision,2)
  await assert.rejects(store.append({...next,requestId:'30000000-0000-4000-8000-000000000003'}),/predecessor changed/)
  const history=await store.history({verifiedUserId:user,investigationId:investigation})
  assert.deepEqual(history[0],first);assert.equal(history[1].revision_effect,'less_certain')
  await db.exec('reset role')
 })
 await t.test('mutation and rollback cannot rewrite or falsely complete a revision',async()=>{
  await assert.rejects(db.exec('update mip_hypothesis.revisions set revision=99'),/append-only/)
  await assert.rejects(db.exec('delete from mip_hypothesis.revisions'),/append-only/)
  await assert.rejects(db.exec('truncate mip_hypothesis.revisions'),/append-only/)
  await db.exec('begin')
  await assert.rejects(store.append(payload.assessment),/unsupported_contract/)
  await db.exec('rollback')
  assert.equal((await db.query('select count(*)::int n from mip_hypothesis.revisions')).rows[0].n,2)
 })
 await t.test('retained revisions and exact original retry survive durable database close/reopen',async()=>{
  await db.close();db=await PGlite.create(dir)
  await db.exec('set role mip_hypothesis_gateway')
  const history=await store.history({verifiedUserId:user,investigationId:investigation})
  assert.equal(history.length,2);assert.deepEqual(history[0],first)
  assert.deepEqual(await store.append(payload),first)
  await db.exec('reset role')
 })
})
