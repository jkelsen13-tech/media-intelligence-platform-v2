// Existing collector/native queue/CAS composed through independently authenticated
// PostgreSQL connections. No Edge, PostgREST, cron, RSS, or provider call.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {runQikIngestCollector} from '../qik-ingest/collector.mjs'
import {createPipelineRpc} from '../qik-ingest/nativeHandoff.mjs'
import {bindExactCaptureBytes} from '../content-addressed-storage/bindExactCaptureBytes.mjs'
import {decodeCanonical} from '../content-addressed-storage/store.mjs'
import {createAuthenticatedCasCall} from './authenticatedPgDriver.mjs'
import {authorizeSyntheticCapture} from './authenticatedBootstrap.mjs'

export function createCollectorRpc(client) {
  const calls = {
    plan: ['select public.mip_qik_ingest_plan($1) result',a=>[a.token]],
    begin_run: ['select public.mip_qik_ingest_begin_run($1,$2,$3::timestamptz) result',a=>[a.token,a.run_id,a.now]],
    retain_item: ['select public.mip_qik_ingest_retain_item($1,$2,$3::uuid,$4::jsonb) result',a=>[a.token,a.run_id,a.source_id,JSON.stringify(a.item)]],
    record_source_run: ['select public.mip_qik_ingest_record_source_run($1,$2,$3::uuid,$4,$5,$6,$7,$8::timestamptz) result',a=>[a.token,a.run_id,a.source_id,a.state,a.fetched,a.new_items,a.error_note,a.now]],
    finish_run: ['select public.mip_qik_ingest_finish_run($1,$2,$3,$4::jsonb,$5::timestamptz) result',a=>[a.token,a.run_id,a.state,JSON.stringify(a.counters),a.now]],
  }
  return async (name,args) => {
    if (!Object.hasOwn(calls,name)) throw Error('cnc_collector_call_denied')
    const [sql,params]=calls[name]
    return (await client.query(sql,params(args))).rows[0]?.result ?? null
  }
}

export async function runAuthenticatedQualification({admin,collector,native,cas,manifest,token}) {
  const {operationId,prefix,investigation,sourceId}=manifest
  const triggerRows=(await admin.query("select c.relname,t.tgname,p.proname,t.tgenabled from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid where n.nspname='evidence_pipeline' and c.relname in ('article_captures','record_versions','evidence_changes') and not t.tgisinternal and (t.tgtype & 4)=4 and (t.tgtype & 2)=0")).rows
  const expectedTriggers=new Set(['article_captures:mip_capture_change:capture_evidence_change','record_versions:mip_record_change:capture_evidence_change','evidence_changes:dispatch_evidence_change:dispatch_evidence_change'])
  assert.equal(triggerRows.length,3,'installed change trigger inventory')
  assert.ok(triggerRows.every(r=>expectedTriggers.has(r.relname+':'+r.tgname+':'+r.proname)&&r.tgenabled==='O'),'installed change trigger binding')
  const runIds=[1,2,3].map(n=>'qik-cnc-'+operationId+'-run'+n)
  const urls=[prefix+'water',prefix+'second']
  // Evidence preflight is scoped by exact operation identity, never a global
  // count taken while unrelated workers may be active.
  assert.equal((await admin.query('select 1 from public.articles where url=any($1::text[])',[urls])).rowCount,0)
  assert.equal((await admin.query('select 1 from evidence_pipeline.import_jobs where canonical_url=any($1::text[]) or first_run_id=any($2::text[])',[urls,runIds])).rowCount,0)
  assert.equal((await admin.query('select 1 from public.ingestion_runs where run_id=any($1::text[])',[runIds])).rowCount,0)
  const rpc=createCollectorRpc(collector),pipelineRpc=createPipelineRpc(native)
  const call=createAuthenticatedCasCall(cas)
  await assert.rejects(collector.query('select payload from evidence_pipeline.article_captures'),/permission denied/)
  await assert.rejects(cas.query('select * from mip_cas.principals'),/permission denied/)
  await assert.rejects(call('read',[randomUUID(),'missing','canonical']),/mip_cas_denied/)
  await assert.rejects(pipelineRpc('claim',{}),/unscoped_claim_forbidden/)

  await admin.query('begin')
  try {
    assert.equal((await admin.query('select collection_authorized from qik_ingest.collection_gate where id for update')).rows[0]?.collection_authorized,false)
    assert.equal((await admin.query('select 1 from public.ingest_sources where enabled and collection_enabled')).rowCount,0)
    await admin.query('update qik_ingest.collection_gate set collection_authorized=true where id')
    assert.equal((await admin.query('update public.ingest_sources set enabled=true,collection_enabled=true where id=$1::uuid and feed_url=$2',[sourceId,prefix+'feed.xml'])).rowCount,1)
    await admin.query('commit')
  } catch (error) { await admin.query('rollback'); throw error }

  const feed=changed=>'<rss version="2.0"><channel><title>Synthetic CNC</title>'
    +'<item><title>'+(changed?'Water revised':'Water')+'</title><link>'+urls[0]+'</link><description>The synthetic water report describes a planned inspection of the fictional reservoir.</description></item>'
    +'<item><title>Second</title><link>'+urls[1]+'</link><description>The synthetic second report describes a planned review of the fictional bridge.</description></item>'
    +'</channel></rss>'
  const results=[]
  for(let index=0;index<3;index++) {
    const result=await runQikIngestCollector({
      rpc,pipelineRpc,token,runId:runIds[index],
      fetchText:async url=>{assert.equal(url,prefix+'feed.xml');return feed(index===2)},
    })
    assert.equal(result.httpStatus,200)
    assert.equal(result.body.state,'completed')
    assert.equal(result.body.is_current,false)
    assert.equal(result.body.unresolved,0)
    assert.equal(result.body.failed_jobs,0)
    assert.equal(result.body.source_failures,0)
    assert.equal(result.body.inserted,index===0?2:0)
    assert.equal(result.body.duplicates,index===0?0:index===1?2:1)
    assert.equal(result.body.revisions,index===2?1:0)
    results.push({runId:runIds[index],inserted:result.body.inserted,duplicates:result.body.duplicates,revisions:result.body.revisions})
  }
  const articles=(await admin.query('select id::text,title,reader_state,ingestion_run_id from public.articles where url=any($1::text[]) order by url',[urls])).rows
  assert.equal(articles.length,2)
  assert.ok(articles.every(a=>a.reader_state==='pending_review' && a.ingestion_run_id===runIds[0]))
  assert.deepEqual(articles.map(a=>a.title).sort(),['Second','Water'])
  const jobs=(await admin.query('select id::text,state,outcome from evidence_pipeline.import_jobs where canonical_url=any($1::text[])',[urls])).rows
  assert.equal(jobs.length,3)
  assert.ok(jobs.every(j=>j.state==='completed'))
  assert.deepEqual(jobs.map(j=>j.outcome).sort(),['inserted','inserted','revision_pending'])
  const receipts=Number((await admin.query('select count(*) n from evidence_pipeline.import_receipts where run_id=any($1::text[])',[runIds])).rows[0].n)
  assert.equal(receipts,6)
  const captures=(await admin.query("select c.id::text,c.content_hash,convert_to(c.payload::text,'UTF8') bytes,c.payload->>'url' url,c.review_state from evidence_pipeline.article_captures c join evidence_pipeline.import_jobs j on j.id=c.job_id where j.canonical_url=any($1::text[]) order by c.id",[urls])).rows
  assert.equal(captures.length,3)
  assert.ok(captures.every(c=>c.review_state==='pending'))
  const history=Number((await admin.query("select count(*) n from evidence_pipeline.record_versions where record_kind='article' and record_key=any($1::text[]) and operation='insert'",[articles.map(a=>a.id)])).rows[0].n)
  assert.equal(history,2)
  const articleIdentities=Number((await admin.query('select count(*) n from evidence_pipeline.article_identities where article_id=any($1::uuid[])',[articles.map(a=>a.id)])).rows[0].n)
  const jobEvents=Number((await admin.query('select count(*) n from evidence_pipeline.job_events where job_id=any($1::uuid[])',[jobs.map(j=>j.id)])).rows[0].n)
  assert.equal(articleIdentities,2);assert.equal(jobEvents,6)
  const changes=(await admin.query("select c.position::text from evidence_pipeline.evidence_changes c where c.capture_id=any($1::uuid[]) or c.record_version_id in (select id from evidence_pipeline.record_versions where record_kind='article' and record_key=any($2::text[]))",[captures.map(c=>c.id),articles.map(a=>a.id)])).rows
  assert.equal(changes.length,5)
  const changeJobs=(await admin.query('select id::text,route,state,attempt_count from evidence_pipeline.change_jobs where change_position=any($1::bigint[])',[changes.map(c=>c.position)])).rows
  assert.equal(changeJobs.length,10)
  assert.ok(changeJobs.every(j=>j.state==='pending'&&j.attempt_count===0))
  assert.equal(changeJobs.filter(j=>j.route==='dependency_lookup').length,5)
  assert.equal(changeJobs.filter(j=>j.route==='new_candidate_search').length,5)
  const candidates=(await admin.query("select e.id::text,e.capture_id::text,e.review_state,e.source_field,e.excerpt,e.span_start,e.span_end,c.payload->>e.source_field as source_text from evidence_pipeline.evidence_candidates e join evidence_pipeline.article_captures c on c.id=e.capture_id where e.capture_id=any($1::uuid[])",[captures.map(c=>c.id)])).rows
  assert.equal(candidates.length,3)
  assert.ok(candidates.every(c=>c.review_state==='pending'&&c.source_field==='summary'&&Array.from(c.source_text).slice(c.span_start,c.span_end).join('')===c.excerpt))
  assert.equal(new Set(candidates.map(c=>c.capture_id)).size,3)
  const capture=captures.find(c=>c.url===urls[0])
  capture.bytes=Buffer.from(capture.bytes)
  const provenance={source_version:'capture:'+capture.id,acquired_at:new Date().toISOString(),rights_ref:'synthetic:'+operationId,privacy_ref:'synthetic:'+operationId}
  const updatedManifest=await authorizeSyntheticCapture(admin,manifest,capture,provenance)
  const logicalKey='pipeline:'+capture.id
  const bound=await bindExactCaptureBytes({call,investigation,logicalKey,payloadBytes:capture.bytes,contentHash:capture.content_hash,provenance})
  assert.equal(bound.committed,true)
  assert.equal(bound.hash,capture.content_hash)
  const hot=await call('read',[investigation,logicalKey,'canonical'])
  assert.deepEqual(decodeCanonical(hot),capture.bytes)
  await call('transition',[investigation,logicalKey,hot.version,'cold'])
  const cold=await call('read',[investigation,logicalKey,'canonical'])
  assert.equal(cold.state,'rehydration_required')
  const requestId=randomUUID()
  const rehydration=await call('rehydrate',[investigation,logicalKey,requestId,cold.version])
  await call('complete',[investigation,logicalKey,rehydration.job_id])
  assert.deepEqual(decodeCanonical(await call('read',[investigation,logicalKey,'canonical'])),capture.bytes)
  // Revoke only this source permission and prove current authorization is checked.
  await admin.query('begin')
  try {
    await admin.query('set local role mip_cas_owner')
    await admin.query('delete from mip_cas.source_permissions where investigation=$1::uuid and source_version=$2',[investigation,provenance.source_version])
    await admin.query('reset role')
    await admin.query('commit')
  } catch (error) { await admin.query('rollback').catch(()=>{}); throw error }
  await assert.rejects(call('read',[investigation,logicalKey,'canonical']),/mip_cas_source_rights_unverified/)
  return {
    operationId,manifest:updatedManifest,runs:results,
    evidenceIds:{articles:articles.map(a=>a.id),jobs:jobs.map(j=>j.id),captures:captures.map(c=>({id:c.id,hash:c.content_hash})),sourceId,runIds,candidateIds:candidates.map(c=>c.id),evidenceChangePositions:changes.map(c=>c.position),changeJobIds:changeJobs.map(j=>j.id)},
    residual:{articles:2,jobs:3,captures:3,articleIdentities:2,jobEvents:6,evidenceChanges:5,changeJobs:10,evidenceCandidates:3,articleInsertVersions:2,importReceipts:6,ingestionRuns:3,sourceRuns:3,disabledSyntheticSource:1},
    cas:{captureId:capture.id,hash:capture.content_hash,exactBytes:true,rehydrated:true,revocationDenied:true},
    scope:'authenticated PostgreSQL synthetic only; native login had service_role authority',
  }
}
