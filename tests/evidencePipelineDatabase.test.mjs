import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Isolated Postgres engine: no remote project, network calls or production data.
const fixture = `
create role anon; create role authenticated; create role service_role bypassrls;
create schema spatial;
create table public.articles (
  id uuid primary key default gen_random_uuid(), feed text not null, outlet text not null, title text not null, url text not null unique,
  summary text, body_text text, published_at timestamptz, fetched_at timestamptz not null default now(),
  ingestion_run_id text, reader_state text not null default 'pending_review' check(reader_state in ('eligible','pending_review','withheld')),
  source_status text not null default 'active' check(source_status in ('active','corrected','withdrawn')), claims jsonb default '[]'
);
create table public.nodes (id uuid primary key default gen_random_uuid(), type text not null, label text, metadata jsonb default '{}');
create table public.geographic_places (id uuid primary key default gen_random_uuid(), canonical_name text);
create table public.pipeline_config (key text primary key, value jsonb);
create table spatial.assertions (id uuid primary key default gen_random_uuid(), graph_node_id uuid references public.nodes(id));
create table spatial.assertion_revisions (id uuid primary key default gen_random_uuid(), spatial_assertion_id uuid references spatial.assertions(id), canonical_place_id uuid references public.geographic_places(id));
create view public.spatial_projection_v1 as select r.id revision_id,r.canonical_place_id,a.graph_node_id subject_graph_node_id
  from spatial.assertion_revisions r join spatial.assertions a on a.id=r.spatial_assertion_id;
grant usage on schema public to anon, authenticated, service_role;
grant select on public.nodes,public.geographic_places,public.spatial_projection_v1 to service_role;
alter table public.articles enable row level security;
grant select on public.articles to anon,authenticated;
create policy reader_eligibility on public.articles for select to anon,authenticated using(reader_state='eligible' and source_status='active');
`

test('database queue, exact evidence and append-only history contracts', async t => {
  const db = await PGlite.create()
  t.after(() => db.close())
  await db.exec(fixture)
  const migration = await readFile(new URL('../supabase/migrations/20260905082406_evidence_pipeline_reliability.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  const rpc = async (action, input={}) => (await db.query('select public.mip_pipeline_v1($1,$2::jsonb) result', [action,JSON.stringify(input)])).rows[0].result
  const scalar = async (sql, params=[]) => Object.values((await db.query(sql,params)).rows[0])[0]
  const a = { url:'https://Example.org/story?utm_source=test&edition=us#section',title:'Original report',outlet:'Example',summary:'A 🚢 arrived in Cleveland.' }
  let jobId, complete, event, place, revision
  await t.test('tracking variants reuse one job; meaningful query parameters remain distinct', async () => {
    jobId=await rpc('enqueue',{run_id:'run1',article:a})
    assert.equal(await rpc('enqueue',{run_id:'run2',article:{...a,url:'https://example.org/story?edition=us'}}),jobId)
    assert.equal(await scalar('select count(*)::integer from evidence_pipeline.import_receipts'),2)
    assert.notEqual(await rpc('enqueue',{run_id:'run1',article:{...a,url:'https://example.org/story?edition=uk'}}),jobId)
  })
  await t.test('claimed jobs are exclusive; lease mismatch cannot commit; completion is atomic', async () => {
    const first=await rpc('claim'), second=await rpc('claim')
    assert.equal(first.id,jobId)
    assert.notEqual(first.id,second.id)
    assert.equal(await rpc('claim'),null)
    await assert.rejects(rpc('finish',{job_id:first.id,lease_token:second.lease_token}),/lease/)
    complete=await rpc('finish',{job_id:first.id,lease_token:first.lease_token})
    assert.equal(complete.outcome,'inserted')
    await rpc('finish',{job_id:second.id,lease_token:second.lease_token})
    await assert.rejects(rpc('finish',{job_id:first.id,lease_token:first.lease_token}),/lease/)
    assert.equal(await scalar('select count(*)::integer from evidence_pipeline.article_captures'),2)
  })
  await t.test('a publisher correction keeps old article and eligibility unchanged', async () => {
    await db.query("update public.articles set reader_state='eligible' where id=$1",[complete.article_id])
    await rpc('enqueue',{run_id:'correction',article:{...a,title:'Corrected report'}})
    const job=await rpc('claim')
    const result=await rpc('finish',{job_id:job.id,lease_token:job.lease_token})
    assert.equal(result.outcome,'revision_pending')
    assert.equal(result.article_id,complete.article_id)
    assert.equal(await scalar('select title from public.articles where id=$1',[result.article_id]),'Original report')
    assert.equal(await scalar('select count(*)::integer from public.articles'),2)
  })
  await t.test('source spans use code points; invented quotes and invalid links are rejected', async () => {
    event=await scalar("insert into public.nodes(type,label) values('event','Arrival') returning id")
    place=await scalar("insert into public.geographic_places(canonical_name) values('Cleveland') returning id")
    const assertion=await scalar('insert into spatial.assertions(graph_node_id) values($1) returning id',[event])
    revision=await scalar('insert into spatial.assertion_revisions(spatial_assertion_id,canonical_place_id) values($1,$2) returning id',[assertion,place])
    const candidate={capture_id:complete.capture_id,candidate_key:'arrival',candidate_kind:'claim',statement:'A vessel arrived.',source_field:'summary',span_start:0,span_end:25,excerpt:a.summary,event_node_id:event,extractor_version:'test-v1',remaining_uncertainty:'A source statement; not independently corroborated.'}
    assert.equal(Array.from(a.summary).length,25)
    const id=await rpc('candidate',candidate)
    assert.equal(await rpc('candidate',candidate),id)
    await assert.rejects(rpc('candidate',{...candidate,statement:'Another interpretation'}),/idempotency conflict/)
    await assert.rejects(rpc('candidate',{...candidate,excerpt:'Invented quotation'}),/span/)
    await assert.rejects(rpc('candidate',{...candidate,candidate_key:'bad',span_end:26}),/span/)
    await rpc('candidate',{...candidate,candidate_key:'geo',candidate_kind:'geography',place_id:place,spatial_revision_id:revision})
    await assert.rejects(rpc('candidate',{...candidate,candidate_key:'geo-bad',candidate_kind:'geography',place_id:'00000000-0000-0000-0000-000000000001',spatial_revision_id:revision}),/must match/)
    await rpc('candidate',{...candidate,candidate_key:'timeline',candidate_kind:'timeline'})
    const actor=await scalar("insert into public.nodes(type,label) values('actor','Vessel') returning id")
    await rpc('candidate',{...candidate,candidate_key:'relationship',candidate_kind:'graph_relationship',related_node_id:actor})
    const rows=await rpc('evidence',{event_node_id:event})
    assert.equal(rows.length,4)
    assert.ok(rows.every(row=>row.review_state==='pending' && row.source_url && row.content_hash))
    assert.equal((await rpc('evidence',{event_node_id:event,after_time:rows.at(-1).created_at,after_id:rows.at(-1).id})).length,0)
  })
  await t.test('transient failures back off and exhausted leases become dead letters', async () => {
    await rpc('enqueue',{run_id:'retry',article:{...a,url:'https://example.org/retry'}})
    let job=await rpc('claim')
    assert.equal(await rpc('fail',{job_id:job.id,lease_token:job.lease_token,code:'http_503',retryable:true}),'retry_wait')
    assert.equal(await rpc('claim'),null)
    for(let attempt=2;attempt<=5;attempt++) {
      await db.query("update evidence_pipeline.import_jobs set available_at=clock_timestamp()-interval '1 second' where id=$1",[job.id])
      job=await rpc('claim')
      assert.equal(job.attempt_count,attempt)
      if(attempt<5) await rpc('fail',{job_id:job.id,lease_token:job.lease_token,code:'http_503',retryable:true})
    }
    await db.query("update evidence_pipeline.import_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1",[job.id])
    assert.equal(await rpc('claim'),null)
    assert.equal(await scalar('select state from evidence_pipeline.import_jobs where id=$1',[job.id]),'dead_letter')
    assert.equal(await rpc('enqueue',{run_id:'retry-again',article:{...a,url:'https://example.org/retry'}}),job.id)
    assert.equal(await rpc('claim'),null)
  })
  await t.test('event and assessment edits preserve every version including reversions', async () => {
    await db.query("update public.nodes set label='Revised arrival' where id=$1",[event])
    await db.query("update public.nodes set label='Arrival' where id=$1",[event])
    const h=await rpc('history',{record_kind:'graph_node',record_key:event})
    assert.deepEqual(h.map(x=>x.payload.label),['Arrival','Revised arrival','Arrival'])
    await db.exec("insert into public.pipeline_config values('temporal.assessment.test','{\"status\":\"insufficient_history\"}'); update public.pipeline_config set value='{\"status\":\"model_disagreement\"}' where key='temporal.assessment.test';")
    assert.equal((await rpc('history',{record_kind:'temporal_assessment',record_key:'temporal.assessment.test'})).length,2)
    await assert.rejects(db.exec("update public.pipeline_config set key='untracked' where key='temporal.assessment.test'"),/immutable/)
    await assert.rejects(db.exec('delete from evidence_pipeline.record_versions'),/append-only/)
    await assert.rejects(db.exec('truncate evidence_pipeline.record_versions'),/append-only|foreign key/)
    await assert.rejects(db.exec("update evidence_pipeline.evidence_candidates set statement='rewritten'"),/append-only/)
  })
  await t.test('browser roles cannot read private evidence or call worker; service worker can ingest', async () => {
    await db.exec('set role anon')
    await assert.rejects(rpc('claim'),/permission denied/)
    await assert.rejects(db.exec('select * from evidence_pipeline.record_versions'),/permission denied/)
    assert.equal(await scalar('select count(*)::integer from public.articles'),1)
    await db.exec('reset role; set role authenticated')
    await assert.rejects(rpc('history',{record_kind:'graph_node',record_key:event}),/permission denied/)
    await db.exec('reset role; set role service_role')
    await rpc('enqueue',{run_id:'service',article:{...a,url:'https://example.org/service'}})
    const job=await rpc('claim')
    const result=await rpc('finish',{job_id:job.id,lease_token:job.lease_token})
    assert.equal(result.outcome,'inserted')
    await rpc('candidate',{capture_id:result.capture_id,candidate_key:'service-geo',candidate_kind:'geography',statement:'Arrival in Cleveland',
      source_field:'summary',span_start:0,span_end:25,excerpt:a.summary,event_node_id:event,place_id:place,spatial_revision_id:revision,extractor_version:'test-v1',remaining_uncertainty:'Test candidate only'})
    await assert.rejects(db.exec('select * from spatial.assertions'),/permission denied/)
    await assert.rejects(db.query("update public.articles set reader_state='eligible' where id=$1",[result.article_id]),/permission denied/)
    await assert.rejects(db.exec("insert into public.articles(feed,outlet,title,url,reader_state) values('x','x','x','https://example.org/forbidden','eligible')"),/permission denied/)
    await db.exec('reset role')
  })
})
