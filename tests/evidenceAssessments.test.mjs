import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile,readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('private assessment dependencies and correction propagation',async t=>{
  const db=await PGlite.create(); t.after(()=>db.close())
  const read=p=>readFile(new URL(p,import.meta.url),'utf8')
  await db.exec(await read('./changeQueueFixture.sql'))
  for(const suffix of ['evidence_pipeline_reliability','evidence_change_queue_v1','evidence_assessment_dependencies_v1']){
    const files=await readdir(new URL('../supabase/migrations/',import.meta.url));
    const file=files.filter(p=>p.endsWith('_'+suffix+'.sql')); assert.equal(file.length,1)
    await db.exec(await read('../supabase/migrations/'+file[0]))
  }
  const rpc=(name)=>(action,input={})=>db.query(`select public.${name}($1,$2::jsonb) r`,[action,JSON.stringify(input)]).then(r=>r.rows[0].r)
  const intake=rpc('mip_pipeline_v1'),queue=rpc('mip_evidence_changes_v1'),assess=rpc('mip_assessments_v1')
  const scalar=async(sql,args=[])=>(Object.values((await db.query(sql,args)).rows[0]))[0]
  const add=async(url,summary='A report.',published_at='2019-01-01T00:00:00Z')=>{
    await intake('enqueue',{run_id:'assessment-tests',article:{url,title:'Test retained evidence',outlet:'Test',summary,published_at}})
    const j=await intake('claim'); return intake('finish',{job_id:j.id,lease_token:j.lease_token})
  }
  const article=await add('https://example.org/report')
  const event=await scalar("insert into public.nodes(type,label) values('event','Test event') returning id")
  const candidate=await intake('candidate',{capture_id:article.capture_id,candidate_key:'test',candidate_kind:'claim',
    statement:'A report.',source_field:'summary',span_start:0,span_end:9,excerpt:'A report.',event_node_id:event,
    extractor_version:'fixture-1',remaining_uncertainty:'Synthetic regression fixture.'})
  const payload=async(version='v1',parents=[])=>({candidate_id:candidate,algorithm_key:'fixture',algorithm_version:version,
    outcome:'insufficient_evidence',rationale:'Synthetic test; no substantive judgment.',remaining_uncertainty:'Fixture only.',parents,
    context_positions:(await assess('context',{candidate_id:candidate,parents})).context_positions})
  let first,child,grandchild,original,correction;
  await t.test('exact context, private status, idempotent append and conflicting retry',async()=>{
    original=await payload(); first=await assess('append',original)
    assert.equal(await assess('append',original),first)
    await assert.rejects(assess('append',{...original,rationale:'Changed'}),/conflict/)
    const r=await assess('read',{assessment_id:first}); assert.equal(r.stale,false)
    assert.equal(r.release_state,'private'); assert.equal(r.publicly_eligible,false)
    assert.ok(r.context_positions.every(x=>typeof x==='string'))
    for(const position of r.context_positions){
      const input=await assess('input',{position}); assert.equal(input.position,position)
      assert.ok(input.capture || input.record_version)
    }
    await assert.rejects(assess('input',{position:'999999999'}),/unknown input/)
    await assert.rejects(assess('append',{...original,algorithm_version:'other',release_state:'public'}),/unsupported/)
  })
  await t.test('derived dependencies inherit raw watches without adding independent evidence',async()=>{
    child=await assess('append',await payload('child',[first]))
    grandchild=await assess('append',await payload('grandchild',[child]))
    const a=await assess('read',{assessment_id:first}),b=await assess('read',{assessment_id:grandchild})
    assert.deepEqual(b.watch_keys,a.watch_keys); assert.deepEqual(b.context_positions,a.context_positions)
    assert.deepEqual(new Set(b.ancestor_ids),new Set([first,child]))
    assert.equal('confidence' in b,false)
  })
  await t.test('old queue notices do not invalidate assessments that saw them',async()=>{
    let j;
    while((j=await queue('claim',{route:'dependency_lookup'}))){
      const r=await assess('process_dependency',{job_id:j.id,lease_token:j.lease_token});assert.equal(r.coverage,'complete')
      assert.deepEqual(await assess('process_dependency',{job_id:j.id,lease_token:j.lease_token}),r)
    }
    assert.equal(await scalar('select count(*)::int from evidence_pipeline.assessment_invalidations'),0)
    assert.equal((await assess('read',{assessment_id:first})).stale,false)
  })
  await t.test('late historical correction makes entire derived chain stale before worker runs',async()=>{
    correction=await add('https://example.org/report','A corrected report.','2010-01-01T00:00:00Z')
    for(const id of [first,child,grandchild]) assert.equal((await assess('read',{assessment_id:id})).stale,true)
    assert.equal(await scalar('select count(*)::int from evidence_pipeline.assessment_invalidations'),0)
    await assert.rejects(assess('append',{...original,algorithm_version:'stale-input'}),/context changed/)
    assert.equal(await assess('append',original),first)
    await assert.rejects(payload('bad-parent',[child]),/stale/)
  })
  await t.test('dependency pages retain progress, fence stale tokens, and complete only after full fanout',async()=>{
    const j=await queue('claim',{route:'dependency_lookup'})
    await assert.rejects(assess('process_dependency',{job_id:j.id,lease_token:'00000000-0000-0000-0000-000000000000'}),/lease/)
    const p={job_id:j.id,lease_token:j.lease_token,limit:1}
    assert.equal((await assess('process_dependency',p)).coverage,'partial')
    assert.equal(await scalar('select state from evidence_pipeline.change_jobs where id=$1',[j.id]),'processing')
    assert.equal((await assess('process_dependency',p)).coverage,'partial')
    assert.equal((await assess('process_dependency',p)).coverage,'complete')
    assert.equal(await scalar('select count(*)::int from evidence_pipeline.assessment_invalidations'),3)
    assert.equal(await scalar('select pages from evidence_pipeline.dependency_runs where job_id=$1',[j.id]),3)
    const done=await assess('process_dependency',p); assert.equal(done.coverage,'complete')
    const search=await queue('claim',{route:'new_candidate_search'})
    await assert.rejects(assess('process_dependency',{job_id:search.id,lease_token:search.lease_token}),/dependency job/)
  })
  await t.test('explicit supersession preserves prior results and invalidates derived users',async()=>{
    const a=await assess('append',await payload('current'))
    const b=await assess('append',await payload('current-child',[a]))
    const c=await assess('append',{...await payload('current-next'),predecessor_id:a})
    assert.deepEqual((await assess('read',{assessment_id:a})).superseded_by,[c])
    const readB=await assess('read',{assessment_id:b}); assert.equal(readB.stale,true)
    assert.ok(readB.stale_causes.some(x=>x.superseding_assessment_id===c))
    await assert.rejects(payload('bad',[a]),/superseded/)
    await assess('reconcile',{limit:2})
    let page={after:'0',limit:2},r;
    do {r=await assess('reconcile',page);page.after=r.next_after}while(r.has_more)
    assert.equal(await scalar('select count(*)::int from evidence_pipeline.assessment_invalidations where superseding_assessment_id=$1',[c]),1)
    await assert.rejects(assess('append',{...await payload('cycle',[c]),predecessor_id:c}),/own dependency/)
  })
  await t.test('algorithm disagreement remains separate and no automatic publication is possible',async()=>{
    const p=await payload('disagreement')
    const a=await assess('append',{...p,outcome:'supported'}),b=await assess('append',{...p,algorithm_key:'second-fixture',outcome:'contested'})
    assert.notEqual(a,b)
    assert.equal((await assess('read',{assessment_id:a})).outcome,'supported')
    assert.equal((await assess('read',{assessment_id:b})).outcome,'contested')
    assert.equal(await scalar('select count(*)::int from evidence_pipeline.assessments where release_state<>\'private\''),0)
  })
  await t.test('historical queries never pass off current freshness as historical knowledge',async()=>{
    assert.equal(await assess('read',{assessment_id:first,as_of:'2000-01-01T00:00:00Z'}),null)
    await assert.rejects(assess('read',{assessment_id:first,as_of:'2100-01-01T00:00:00Z'}),/historical freshness/)
  })
  await t.test('graph identity edits are watched and failed changes leave no false staleness',async()=>{
    const id=await assess('append',await payload('graph-edit'))
    await db.exec('begin')
    await db.query("update public.nodes set label='rolled back' where id=$1",[event]);await db.exec('rollback')
    assert.equal((await assess('read',{assessment_id:id})).stale,false)
    await db.query("update public.nodes set label='new identity context' where id=$1",[event])
    assert.equal((await assess('read',{assessment_id:id})).stale,true)
  })
  await t.test('unknown dependencies, incomplete source history and unsupported fields are rejected',async()=>{
    await assert.rejects(assess('context',{candidate_id:candidate,parents:['00000000-0000-0000-0000-000000000000']}),/unknown parent/)
    await assert.rejects(assess('context',{candidate_id:candidate,extra_positions:['999999999']}),/unknown extra/)
    await assert.rejects(assess('append',{...await payload('bad-outcome'),outcome:'approved'}),/check constraint/)
    await assert.rejects(db.exec('delete from evidence_pipeline.assessments'),/append-only|foreign key/)
    await assert.rejects(db.exec('update evidence_pipeline.assessment_invalidations set recorded_at=now()'),/append-only/)
  })
  await t.test('reconciliation bounds fanout and resumes an unfinished assessment',async()=>{
    await db.query(`select evidence_pipeline.append_version('graph_node',$1,'update',jsonb_build_object('fixture',x),'assessment-fanout-test') from generate_series(1,105)x`,[event])
    let r,after='0',total=0,pages=0;
    do {
      r=await assess('reconcile',{after,limit:100}); assert.ok(r.recorded<=100)
      if(pages===0){assert.equal(r.has_more,true);assert.equal(r.next_after,'0')}
      total+=r.recorded; after=r.next_after; pages++; assert.ok(pages<50)
    }while(r.has_more)
    assert.ok(total>=105); assert.ok(pages>1)
    assert.equal((await assess('reconcile')).recorded,0)
  })
  await t.test('browser denial and actual server invoker access',async()=>{
    for(const role of ['anon','authenticated']){
      await db.exec(`set role ${role}`)
      await assert.rejects(assess('read',{assessment_id:first}),/permission denied/)
      await assert.rejects(db.exec('select * from evidence_pipeline.assessments'),/permission denied/)
      await db.exec('reset role')
    }
    await db.exec('set role service_role')
    const id=await assess('append',await payload('service'))
    assert.equal((await assess('read',{assessment_id:id})).stale,false)
    await db.exec('reset role')
  })
  await t.test('deployment rollback canary runs unchanged',async()=>{await db.exec(await read('../supabase/tests/evidence_assessments_smoke.sql'))})
})
