import test from 'node:test'
import assert from 'node:assert/strict'
import { FIELD_ALLOWLIST, CUSTODY_VERSION, SOURCE_REF, DESTINATION_REF, sealParentManifest, executeParentCustody, reconstructParentSnapshots, validateParentManifest } from '../scripts/mipNieParentCustody.mjs'
import { fingerprintPayload, parseJsonLossless, serializeStagingJson } from '../scripts/mipLegacyGraphStaging.mjs'

const IDs = ['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002']
const hash = fingerprintPayload
function fixture(n = 2) {
  const events = Array.from({length:n}, (_,i) => Object.fromEntries(FIELD_ALLOWLIST.events.map(k => [k, k === 'id' ? `10000000-0000-0000-0000-${String(i+1).padStart(12,'0')}` : null])))
  const articles = Array.from({length:n}, (_,i) => Object.fromEntries(FIELD_ALLOWLIST.articles.map(k => [k, k === 'id' ? `20000000-0000-0000-0000-${String(i+1).padStart(12,'0')}` : null])))
  events[0].canonical_title = 'न्यूज़ 📰'
  articles[0].body_text = 'café 🗞'
  articles[0].claims = parseJsonLossless('{"confidence":0.123456789012345678901234567890}')
  articles[0].embedding = '[0.12345678901234567890,-2.5]'
  articles[0].source_status = 'published'
  const rows = {events,articles}
  const manifest = sealParentManifest({
    version:CUSTODY_VERSION,source_project_ref:SOURCE_REF,destination_project_ref:DESTINATION_REF,
    destination_schema:'legacy_graph_staging', snapshot_kind:'current_at_fence',snapshot_id:'synthetic-snapshot-1',retained_versions:[],
    closure:{membership_count:n,membership_keys_sha256:hash(events.map((e,i)=>[e.id,articles[i].id]))},
    fence:{method:'repeatable_read_read_only_pinned',captured_at:'2026-09-23T11:00:00Z'},
    schema_sha256:'a'.repeat(64),max_bytes:128*1024*1024,run_prefix:'n2.synthetic.1',
    tables:Object.fromEntries(Object.entries(rows).map(([table, values])=>[table,{
      fields:FIELD_ALLOWLIST[table], rows:values.map(row=>({id:row.id,sha256:hash(row)})),
      rows_sha256:hash(values.map(row=>({id:row.id,sha256:hash(row)}))),
      keys_sha256:hash(values.map(row=>row.id)),
    }]))
  })
  return {rows,manifest}
}
function harness({rows,manifest}, options = {}) {
  const calls = [], jobs = new Map(), staged = new Map()
  const source = {withSnapshot: async fn => fn({
    readClosure:async()=>({membership_count:manifest.closure.membership_count,
      membership_keys_sha256:manifest.closure.membership_keys_sha256,
      event_keys_sha256:manifest.tables.events.keys_sha256,
      article_keys_sha256:manifest.tables.articles.keys_sha256}),
    fence:{...manifest.fence,read_only:true,isolation:'repeatable read',pinned:true,
      transaction_id:'synthetic-tx-1',snapshot_id:manifest.snapshot_id,schema_sha256:manifest.schema_sha256},
    readPage: async q => {
      calls.push(['read',q.source_table,q.ids.length])
      if (options.changed && q.source_table === 'articles') return q.ids.map(id=>serializeStagingJson({...rows.articles.find(r=>r.id===id),title:'changed'}))
      return q.ids.map(id=>serializeStagingJson(rows[q.source_table].find(r=>r.id===id)))
    },
  })}
  const destination = {
    withPageTransaction:async fn=>{
      calls.push(['transaction_begin'])
      const beforeJobs=structuredClone(jobs), beforeStaged=structuredClone(staged)
      try {
        const result=await fn(destination)
        calls.push(['transaction_commit'])
        if(options.breakAfterCommit) throw Object.assign(Error('ack lost SECRET_PRIVATE_URL'),{afterCommit:true})
        return result
      } catch(error) {
        if(!error.afterCommit) {
          jobs.clear();for(const [k,v] of beforeJobs) jobs.set(k,v)
          staged.clear();for(const [k,v] of beforeStaged) staged.set(k,v)
          calls.push(['transaction_rollback'])
        }
        throw error
      }
    },
    rpc:async (action,input) => {
      calls.push([action,input])
      if (options.breakAt === action) throw Object.assign(Error('synthetic SECRET_PRIVATE_URL'),{code:'SECRET_PRIVATE_URL'})
      if (action==='enqueue') {
        let job=jobs.get(input.run_id)
        if (job && hash(input.records.map(r=>({id:r.source_id,sha256:r.payload_sha256}))) !== job.pageHash) throw Error('run_id page conflict')
        if (!job) {job={id:`00000000-0000-0000-0000-${String(jobs.size+1).padStart(12,'0')}`,run_id:input.run_id,records:input.records,pageHash:hash(input.records.map(r=>({id:r.source_id,sha256:r.payload_sha256}))),page_sha256:hash(input.records),source_project_ref:SOURCE_REF,source_table:input.records[0].source_table,completed:false};jobs.set(input.run_id,job)}
        if (job.completed) return {job_id:job.id,run_id:job.run_id,already_completed:true,results:job.results}
        return {job_id:job.id,run_id:job.run_id,queued:true}
      }
      if (action==='claim') {
        const job=jobs.get(input.run_id);return {...job,lease_token:'synthetic-lease'}
      }
      if (action==='finish') {
        const job=[...jobs.values()].find(j=>j.id===input.job_id&&!j.completed)
        if (!job) throw Error('no exact job')
        job.results=job.records.map(r=>{
          const key=`${r.source_table}:${r.source_id}`
          const prior=staged.get(key)
          if (!prior) staged.set(key,{source_project_ref:SOURCE_REF,source_table:r.source_table,source_id:r.source_id,
            payload_sha256:r.payload_sha256,payload_json:r.payload_json,review_state:'pending',
            versions:[{source_project_ref:SOURCE_REF,source_table:r.source_table,source_id:r.source_id,
              origin:'staged_original',payload_sha256:r.payload_sha256,payload_json:r.payload_json}]})
          return {source_id:r.source_id,payload_sha256:prior?.payload_sha256??r.payload_sha256,
            review_state:prior && prior.payload_sha256!==r.payload_sha256?'quarantined':'pending',
            conflict_id:prior && prior.payload_sha256!==r.payload_sha256?'synthetic-conflict':null}
        })
        job.completed=true
        return {job_id:job.id,run_id:job.run_id,state:'completed',results:job.results}
      }
      throw Error('unallowed action')
    },
    finishParentJob:async input=>{
      calls.push(['finishParentJob',input])
      return destination.rpc('finish',input)
    },
    readStaged:async q=>{
      calls.push(['readback',q])
      if(options.breakAt==='readback') throw Error('private readback unavailable')
      return q.ids.map(id=>staged.get(`${q.source_table}:${id}`))
    }
  }
  return {source,destination,calls,jobs,staged}
}
test('exact native fields, numeric precision, Unicode, nulls, vector text and version readback',async()=>{
  const f=fixture(), h=harness(f)
  const r=await executeParentCustody({manifest:f.manifest,...h,authorization:{mode:'synthetic_test_only',synthetic_test_only:true,manifest_sha256:f.manifest.sha256}})
  assert.equal(r.state,'readback_verified');assert.equal(r.rows,4)
  assert.equal(h.staged.get(`articles:${f.rows.articles[0].id}`).payload_json.includes('0.12345678901234567890123456789'),true)
  assert.equal(parseJsonLossless(h.staged.get(`articles:${f.rows.articles[0].id}`).payload_json).body_text,'café 🗞')
  assert.deepEqual(h.calls.filter(c=>c[0]==='claim').map(c=>Object.keys(c[1])),[['run_id'],['run_id']])
  assert.equal(h.calls.some(c=>['publish','fail'].includes(c[0])),false)
  const recovery=await reconstructParentSnapshots({manifest:f.manifest,destination:h.destination})
  assert.equal(recovery.state,'reconstructed_current_snapshots')
  assert.equal(recovery.snapshots.length,4)
  assert.equal(parseJsonLossless(recovery.snapshots.find(s=>s.source_table==='articles').payload_json).claims.confidence.toString(),'0.12345678901234567890123456789')
})
test('source hash drift refuses every destination write',async()=>{
  const f=fixture(),h=harness(f,{changed:true})
  const r=await executeParentCustody({manifest:f.manifest,...h,authorization:{mode:'synthetic_test_only',synthetic_test_only:true,manifest_sha256:f.manifest.sha256}})
  assert.equal(r.state,'not_started');assert.equal(r.code,'source_row_hash_changed')
  assert.equal(h.calls.some(c=>c[0]==='enqueue'),false)
})
test('manifest mutation and real mode without terms fail closed',async()=>{
  const f=fixture(),h=harness(f)
  const bad={...f.manifest,run_prefix:'changed'}
  assert.throws(()=>validateParentManifest(bad),/manifest_invalid/)
  await assert.rejects(executeParentCustody({manifest:f.manifest,...h}),/real_transfer_not_authorized/)
})
test('duplicate delivery resumes completed exact jobs without claim',async()=>{
  const f=fixture(),h=harness(f)
  assert.equal((await executeParentCustody({manifest:f.manifest,...h,authorization:{mode:'synthetic_test_only',synthetic_test_only:true,manifest_sha256:f.manifest.sha256}})).state,'readback_verified')
  h.calls.length=0
  assert.equal((await executeParentCustody({manifest:f.manifest,...h,authorization:{mode:'synthetic_test_only',synthetic_test_only:true,manifest_sha256:f.manifest.sha256}})).state,'readback_verified')
  assert.equal(h.calls.some(c=>c[0]==='claim'),false)
})
test('lost acknowledgement leaves incomplete then exact retry reads committed state',async()=>{
  const f=fixture(),h=harness(f,{breakAfterCommit:true})
  let r=await executeParentCustody({manifest:f.manifest,...h,authorization:{mode:'synthetic_test_only',synthetic_test_only:true,manifest_sha256:f.manifest.sha256}})
  assert.equal(r.state,'incomplete');assert.equal(r.verified_pages.length,0)
  const resume=harness(f)
  resume.jobs.clear()
  for (const [k,v] of h.jobs) resume.jobs.set(k,v)
  for (const [k,v] of h.staged) resume.staged.set(k,v)
  const second=await executeParentCustody({manifest:f.manifest,...resume,authorization:{mode:'synthetic_test_only',synthetic_test_only:true,manifest_sha256:f.manifest.sha256}})
  assert.equal(second.state,'readback_verified')
  assert.equal(resume.calls.filter(c=>c[0]==='claim').length,1)
})
test('bounded deterministic pages and incomplete partial transfer',async()=>{
  const f=fixture(101),h=harness(f,{breakAt:'readback'})
  const r=await executeParentCustody({manifest:f.manifest,...h,authorization:{mode:'synthetic_test_only',synthetic_test_only:true,manifest_sha256:f.manifest.sha256}})
  assert.equal(r.state,'incomplete')
  assert.deepEqual(h.calls.filter(c=>c[0]==='read').map(c=>c[2]),[100,1,100,1])
  assert.equal(h.calls.filter(c=>c[0]==='enqueue').length,1)
})

test('native staging RPC preserves exact source-qualified versions and private/public boundaries',async t=>{
  const {PGlite}=await import('@electric-sql/pglite')
  const {applyFoundation}=await import('../scripts/mipConsolidationRestore.mjs')
  const db=await PGlite.create();t.after(()=>db.close())
  await applyFoundation(db)
  const {readFile}=await import('node:fs/promises')
  await db.exec(await readFile(new URL('../supabase/qualification/nie-parent-custody/001_scoped_finish.sql',import.meta.url),'utf8'))
  const f=fixture()
  const h=harness(f)
  const baseline=Object.fromEntries(await Promise.all(['events','articles','comparison_public','nodes'].map(async table=>
    [table,Number((await db.query(`select count(*)::int n from public.${table}`)).rows[0].n)])))
  const native={
    synthetic:true,
    withPageTransaction:async fn=>{
      await db.exec('begin')
      try {await db.exec('set local role service_role');const result=await fn(native);await db.exec('commit');return result}
      catch(error){await db.exec('rollback');throw error}
    },
    rpc:async(action,input)=>{
      assert.ok(['enqueue','claim','finish'].includes(action))
      const result=(await db.query('select public.mip_legacy_graph_v1($1,$2::jsonb) result',
        [action,serializeStagingJson(input)])).rows[0].result
      return result
    },
    finishParentJob:async({job_id,lease_token,run_id,page_sha256})=>
      (await db.query('select legacy_graph_staging.finish_nie_parent_job($1::uuid,$2::uuid,$3::text,$4::text) result',
        [job_id,lease_token,run_id,page_sha256])).rows[0].result,
    readStaged:async({source_project_ref,source_table,ids})=>{
      const rows=(await db.query(`select s.source_project_ref,s.source_table,s.source_id::text source_id,
        s.payload::text payload_json,s.payload_sha256,s.review_state,
        coalesce((select jsonb_agg(jsonb_build_object(
          'source_project_ref',v.source_project_ref,'source_table',v.source_table,
          'source_id',v.source_id,'origin',v.origin,'payload_sha256',v.payload_sha256,
          'payload_json',v.payload::text) order by v.ordinal)
          from legacy_graph_staging.payload_versions v where v.staged_record_id=s.id),'[]'::jsonb) versions
        from legacy_graph_staging.staged_records s where s.source_project_ref=$1 and s.source_table=$2
          and s.source_id=any($3::uuid[]) order by s.source_id`,
        [source_project_ref,source_table,ids])).rows
      return rows
    }
  }
  const sentinelId='90000000-0000-0000-0000-000000000001'
  const sentinelRecord={source_project_ref:SOURCE_REF,source_table:'citations',source_id:sentinelId,
    object_family:'graph_citation',payload:{id:sentinelId,article_id:f.rows.articles[0].id}}
  await native.rpc('enqueue',{run_id:'n2.synthetic.unrelated',records:[sentinelRecord],mappings:[]})
  const sentinelClaim=await native.rpc('claim',{run_id:'n2.synthetic.unrelated'})
  await native.rpc('finish',{job_id:sentinelClaim.id,lease_token:sentinelClaim.lease_token})
  const unrelatedBefore=(await db.query(`select review_state,decision from legacy_graph_staging.staged_records
    where source_project_ref=$1 and source_table='citations' and source_id=$2`,[SOURCE_REF,sentinelId])).rows[0]
  assert.equal(unrelatedBefore.review_state,'quarantined')
  const endpointBefore=(await db.query(`select resolved,resolution from legacy_graph_staging.endpoint_checks
    where source_project_ref=$1 and source_table='citations' and source_id=$2`,[SOURCE_REF,sentinelId])).rows
  const conflictsBefore=Number((await db.query(`select count(*)::int n from legacy_graph_staging.record_conflicts
    where source_project_ref=$1 and source_table='citations' and source_id=$2`,[SOURCE_REF,sentinelId])).rows[0].n)
  let result=await executeParentCustody({manifest:f.manifest,source:h.source,destination:native,
    authorization:{mode:'synthetic_test_only',synthetic_test_only:true,manifest_sha256:f.manifest.sha256}})
  assert.equal(result.state,'readback_verified')
  assert.equal(result.rows,4)
  assert.deepEqual((await db.query(`select review_state,decision from legacy_graph_staging.staged_records
    where source_project_ref=$1 and source_table='citations' and source_id=$2`,[SOURCE_REF,sentinelId])).rows[0],unrelatedBefore)
  assert.deepEqual((await db.query(`select resolved,resolution from legacy_graph_staging.endpoint_checks
    where source_project_ref=$1 and source_table='citations' and source_id=$2`,[SOURCE_REF,sentinelId])).rows,endpointBefore)
  assert.equal(Number((await db.query(`select count(*)::int n from legacy_graph_staging.record_conflicts
    where source_project_ref=$1 and source_table='citations' and source_id=$2`,[SOURCE_REF,sentinelId])).rows[0].n),conflictsBefore)
  const recovery=await reconstructParentSnapshots({manifest:f.manifest,destination:native})
  assert.equal(recovery.snapshots.length,4)
  assert.equal(parseJsonLossless(recovery.snapshots.find(s=>s.source_table==='articles').payload_json).body_text,'café 🗞')
  const jobs=(await db.query("select run_id,source_project_ref,source_table,state,page_size from legacy_graph_staging.import_jobs where source_table in ('events','articles') order by run_id")).rows
  assert.equal(jobs.length,2)
  assert.ok(jobs.every(j=>j.source_project_ref===SOURCE_REF&&j.state==='completed'&&j.page_size===2))
  for (const table of ['events','articles']) {
    assert.equal(Number((await db.query('select count(*)::int n from legacy_graph_staging.staged_records where source_project_ref=$1 and source_table=$2',[SOURCE_REF,table])).rows[0].n),2)
  }
  assert.equal(Number((await db.query("select count(*)::int n from legacy_graph_staging.payload_versions where source_table in ('events','articles')")).rows[0].n),4)
  result=await executeParentCustody({manifest:f.manifest,source:h.source,destination:native,
    authorization:{mode:'synthetic_test_only',synthetic_test_only:true,manifest_sha256:f.manifest.sha256}})
  assert.equal(result.state,'readback_verified')
  assert.equal(Number((await db.query("select count(*)::int n from legacy_graph_staging.payload_versions where source_table in ('events','articles')")).rows[0].n),4)
  for(const [table,count] of Object.entries(baseline))
    assert.equal(Number((await db.query(`select count(*)::int n from public.${table}`)).rows[0].n),count)
  const changed={...f.rows.articles[0],title:'Synthetic conflicting title'}
  const divergent={
    source_project_ref:SOURCE_REF,source_table:'articles',source_id:changed.id,
    object_family:'article',payload:changed,payload_sha256:hash(changed)
  }
  const queued=await native.rpc('enqueue',{run_id:'n2.synthetic.conflict',records:[divergent],mappings:[]})
  const claimed=await native.rpc('claim',{run_id:'n2.synthetic.conflict'})
  assert.equal(claimed.id,queued.job_id)
  const conflict=await native.rpc('finish',{job_id:claimed.id,lease_token:claimed.lease_token})
  assert.equal(conflict.results[0].review_state,'quarantined')
  assert.equal(Number((await db.query("select count(*)::int n from legacy_graph_staging.record_conflicts where source_table='articles'")).rows[0].n),1)
  assert.equal(Number((await db.query("select count(*)::int n from legacy_graph_staging.payload_versions where source_table in ('events','articles')")).rows[0].n),5)
  result=await executeParentCustody({manifest:f.manifest,source:h.source,destination:native,
    authorization:{mode:'synthetic_test_only',synthetic_test_only:true,manifest_sha256:f.manifest.sha256}})
  assert.equal(result.state,'incomplete')
  assert.equal(result.code,'destination_conflict')
  const rollbackId='80000000-0000-0000-0000-000000000001'
  const malformed={source_project_ref:SOURCE_REF,source_table:'events',source_id:rollbackId,
    object_family:'source_comparison_event',payload:{id:rollbackId},
    payload_json:serializeStagingJson({id:rollbackId}),payload_sha256:hash({id:rollbackId}),
    source_imported_at:null,recovery_status:null}
  await assert.rejects(native.withPageTransaction(async tx=>{
    await tx.rpc('enqueue',{run_id:'n2.synthetic.rollback',records:[malformed],mappings:[]})
    const lease=await tx.rpc('claim',{run_id:'n2.synthetic.rollback'})
    return tx.finishParentJob({job_id:lease.id,lease_token:lease.lease_token,
      run_id:lease.run_id,page_sha256:lease.page_sha256})
  }),/outside exact custody contract/)
  assert.equal(Number((await db.query("select count(*)::int n from legacy_graph_staging.import_jobs where run_id='n2.synthetic.rollback'")).rows[0].n),0)
  assert.equal(Number((await db.query('select count(*)::int n from legacy_graph_staging.staged_records where source_id=$1',[rollbackId])).rows[0].n),0)
  for(const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`)
    try {
      await assert.rejects(db.query('select * from legacy_graph_staging.staged_records'),/permission denied/)
      await assert.rejects(db.query('select public.mip_legacy_graph_v1($1,$2::jsonb)', ['claim','{}']),/permission denied/)
      await assert.rejects(db.query('select legacy_graph_staging.finish_nie_parent_job($1::uuid,$2::uuid,$3::text,$4::text)',
        ['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','denied','a'.repeat(64)]),/permission denied/)
    } finally {await db.exec('reset role')}
  }
})

test('private connector errors are redacted and closure drift prevents writes',async()=>{
  const f=fixture(), h=harness(f,{breakAt:'enqueue'})
  const r=await executeParentCustody({manifest:f.manifest,...h,
    authorization:{mode:'synthetic_test_only',synthetic_test_only:true,manifest_sha256:f.manifest.sha256}})
  assert.equal(r.state,'incomplete')
  assert.equal(r.code,'destination_or_readback_failed')
  assert.equal(JSON.stringify(r).includes('SECRET_PRIVATE_URL'),false)
  const shifted=harness(f)
  shifted.source.withSnapshot=async fn=>fn({
    fence:{...f.manifest.fence,read_only:true,isolation:'repeatable read',pinned:true,
      transaction_id:'synthetic-tx-2',snapshot_id:f.manifest.snapshot_id,schema_sha256:f.manifest.schema_sha256},
    readClosure:async()=>({...f.manifest.closure,membership_count:f.manifest.closure.membership_count+1,
      event_keys_sha256:f.manifest.tables.events.keys_sha256,
      article_keys_sha256:f.manifest.tables.articles.keys_sha256}),
    readPage:async()=>{throw Error('should not read')}
  })
  const changed=await executeParentCustody({manifest:f.manifest,...shifted,
    authorization:{mode:'synthetic_test_only',synthetic_test_only:true,manifest_sha256:f.manifest.sha256}})
  assert.equal(changed.state,'not_started')
  assert.equal(changed.code,'source_closure_changed')
  assert.equal(shifted.calls.length,0)
})
