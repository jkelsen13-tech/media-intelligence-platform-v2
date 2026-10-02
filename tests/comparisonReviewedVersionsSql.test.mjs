import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { createReviewedVersionFixture } from './reviewedPublicVersionFixture.mjs'
import { createPublicDataBackend } from '../src/lib/publicDataBackend.js'
import { newsNavigationFromComparisonSurface } from '../src/lib/sourceComparisonReadPath.js'
import { COMPARISON_VERSION_SQL, COMPARISON_VERSION_ROLLBACK, comparisonVersionCatalogQuery,
  installComparisonReviewedVersionFixture } from '../scripts/comparisonReviewedVersionPackage.mjs'

const catalog = async db => {
  await db.exec('set search_path=pg_catalog')
  return (await db.query(await comparisonVersionCatalogQuery())).rows[0].jsonb_build_object
}
const read = async db => (await db.query('select * from public.comparison_public')).rows
async function fixture() {
  const f = await createReviewedVersionFixture()
  const { db, scalar, second, claim_id, article_claim_id } = f
  const second_claim_id = await scalar(`insert into public.article_claims(article_id,claim_id,surface_text,char_start,char_end,
    evidence_source_field,evidence_excerpt,auditability_state)
    select $1,claim_id,surface_text,char_start,char_end,evidence_source_field,evidence_excerpt,auditability_state
    from public.article_claims where id=$2 returning id`, [second.article_id,article_claim_id])
  await db.query('update public.article_claims set loaded_language=$1 where id=$2', [JSON.stringify([{ term: 'reports', category: 'synthetic-fixture' }]),article_claim_id])
  const v1 = await f.bindArticle(f.first)
  const v2 = await f.bindArticle(second, { claims: [second_claim_id] })
  const surface = await scalar('select surface_text from public.article_claims where id=$1', [article_claim_id])
  const explanation_id = await scalar(`insert into public.explanations(assertion_id,assertion_type,version,rule_version,provenance_class,
    supporting_passage,review_status,state,falsification_condition,reviewed_at,remaining_uncertainty)
    values($1,'claim_grouping',1,'sc-v2-event-projection|synthetic','human_reviewed',$2,'published','ok',
    'Contrary retained source disproves grouping','2026-10-01T10:00:00.123457Z','Synthetic qualification only.') returning id`,
  ['sc:claim_grouping:'+f.event_id+':0:'+f.first.article_id,`Surface claim "${surface}" grouped under canonical "${surface}" SYNTHETIC-BOUND-EXPLANATION`])
  const link_id = await scalar(`insert into public.claim_evidence_links(claim_id,linked_from_article_id,evidence_url,evidence_type)
    values($1,$2,'https://example.invalid/synthetic-document','primary_document') returning id`, [claim_id,f.first.article_id])
  const correction_id = await scalar(`insert into public.claim_corrections(claim_id,correcting_article_id,corrected_article_id,correction_text,occurred_at)
    values($1,$2,$3,'Synthetic recorded correction','2026-10-01T10:00:00.123458Z') returning id`, [claim_id,f.first.article_id,second.article_id])
  const bindMember = (v, review='synthetic-comparison-member') => scalar('select mip_private.bind_comparison_member($1,$2,$3)', [v,f.event_id,review])
  const bindSurface = (v, ac, { review='synthetic-comparison-surface', explanation=null, links=[], corrections=[] }={}) =>
    scalar('select mip_private.bind_comparison_surface($1,$2,$3,$4,$5::uuid[],$6::uuid[])', [v,ac,review,explanation,links,corrections])
  return { ...f,v1,v2,second_claim_id,explanation_id,link_id,correction_id,bindMember,bindSurface }
}

test('immutable Source Comparison binds existing owners, exact reviewed captures and installed SDK', async t => {
  const f=await fixture();const {db,scalar,v1,v2,bindMember,bindSurface}=f;t.after(()=>db.close())
  const sql=await readFile(COMPARISON_VERSION_SQL,'utf8')
  await t.test('missing, drifted or occupied full catalogs abort atomically',async()=>{
    await assert.rejects(db.exec(sql),/baseline missing or drifted/);await db.exec('rollback')
    const original=await catalog(db)
    await db.query("select set_config('mip.comparison_expected_catalog',$1,false)",[JSON.stringify(original)])
    await db.exec("comment on view public.comparison_public is 'synthetic catalog drift'")
    await assert.rejects(db.exec(sql),/baseline missing or drifted/);await db.exec('rollback')
    await db.exec('comment on view public.comparison_public is null')
    assert.equal(await scalar("select to_regclass('mip_private.comparison_reviewed_members')"),null)
  })
  await installComparisonReviewedVersionFixture(db)
  await t.test('source review alone publishes neither member nor surface',async()=>{
    assert.deepEqual(await read(db),[])
    await bindMember(v1);assert.deepEqual(await read(db),[])
    await bindMember(v2)
    assert.equal((await read(db))[0].claims.length,0)
    assert.equal((await read(db))[0].articles.every(a=>a.has_extracted_claim===false),true)
    await bindSurface(v1,f.article_claim_id,{explanation:f.explanation_id,links:[f.link_id],corrections:[f.correction_id]})
    await bindSurface(v2,f.second_claim_id)
  })
  await t.test('exact reviewed snapshots preserve the six-column contract and installed SDK reader semantics',async()=>{
    const rows=await read(db);assert.equal(rows.length,1)
    assert.deepEqual(Object.keys(rows[0]),['event_key','canonical_title','occurred_at_start','occurred_at_end','articles','claims'])
    const claim=rows[0].claims[0];assert.equal(claim.surfaces.length,2)
    const surface=claim.surfaces.find(s=>s.public_version_id===v1)
    assert.equal(surface.capture_id,f.first.capture_id);assert.equal(surface.capture_hash,f.first.capture_hash)
    assert.equal(surface.span_start,2);assert.equal(surface.span_end,2+Array.from(surface.surface_text).length)
    assert.equal(surface.loaded_language[0].term,'reports')
    assert.match(surface.explanation.supporting_passage,/SYNTHETIC-BOUND-EXPLANATION/)
    assert.equal(claim.evidence_links[0].public_version_id,v1);assert.equal(claim.corrections[0].public_version_id,v1)
    const calls=[]
    const client=createClient('https://synthetic-comparison-sql.invalid','synthetic-publishable',{
      accessToken:async()=> 'synthetic-reader-current-session',global:{fetch:async(url,init)=>{
        const request=new Request(url,init);calls.push({url:request.url,authorization:request.headers.get('authorization')})
        const params=new URL(request.url).searchParams
        assert.equal(params.get('select'),'event_key,canonical_title,occurred_at_start,occurred_at_end,articles,claims')
        assert.match(request.url,/\/rest\/v1\/comparison_public\?/)
        await db.exec('begin;set local role authenticated')
        try{return new Response(JSON.stringify((await db.query(`select * from public.comparison_public order by event_key offset $1 limit $2`,
          [Number(params.get('offset')??0),Number(params.get('limit')??100)])).rows),{headers:{'content-type':'application/json'}})}
        finally{await db.exec('rollback')}
      }}})
    const result=await createPublicDataBackend(client).loadSourceComparisonView()
    assert.equal(result.loadError,undefined,JSON.stringify({result,calls}))
    assert.equal(result.events.length,1);const model=result.events[0].claims[0]
    assert.equal(model.classification,'shared');assert.equal(model.evidenceStrength,'E1');assert.equal(model.corrections.length,1)
    const modelSurface=model.surfaces.find(s=>s.sourceVersion.publicVersionId===v1)
    assert.equal(modelSurface.sourceVersion.articleId,f.first.article_id)
    assert.equal(modelSurface.sourceVersion.captureHash,f.first.capture_hash)
    assert.equal(newsNavigationFromComparisonSurface(modelSurface).sourceVersion.publicVersionId,v1)
    assert.notEqual(modelSurface.articleId,f.first.article_id,'opaque presentation key remains separate from native identity')
    assert.equal(calls.length,1);assert.equal(calls[0].authorization,'Bearer synthetic-reader-current-session')
    assert.doesNotMatch(JSON.stringify(result),/archived_sources|falsification_condition|membership_confidence|extraction_confidence/)
  })
  await t.test('pending newer captures retain the exact old reviewed version and source clocks',async()=>{
    const before=await read(db)
    const pending=await f.ingest({...f.article,summary:'An unreviewed replacement source capture.'},'synthetic-comparison-pending')
    assert.notEqual(pending.capture_id,f.first.capture_id)
    assert.deepEqual(await read(db),before)
    assert.equal((await read(db))[0].articles.find(a=>a.public_version_id===v1).published_at,'2026-10-01T10:00:00.123456+00:00')
  })
  await t.test('exact retries are immutable and foreign owner annotations cannot be rebound',async()=>{
    const before=await read(db)
    await bindMember(v1)
    await bindSurface(v1,f.article_claim_id,{explanation:f.explanation_id,links:[f.link_id],corrections:[f.correction_id]})
    assert.deepEqual(await read(db),before)
    await assert.rejects(bindMember(v1,'conflicting-decision'),/idempotency conflict/)
    await assert.rejects(bindSurface(v1,f.article_claim_id),/idempotency conflict/)
    await assert.rejects(bindSurface(v2,f.second_claim_id,{links:[f.link_id]}),/source\/claim owner mismatch/)
    await db.exec('begin')
    await db.query("update public.explanations set assertion_id='sc:claim_grouping:00000000-0000-4000-8000-000000000001:0:'||$1 where id=$2",[f.first.article_id,f.explanation_id])
    await assert.rejects(bindSurface(v1,f.article_claim_id,{explanation:f.explanation_id}),/event-specific grounded explanation/)
    await db.exec('rollback')
  })
  await t.test('latest reviewed decisions cannot fall back to old member or another version surface',async()=>{
    await db.exec('begin')
    const replacement=await f.bindArticle(f.first,{review:'synthetic-next-admission',predecessor:v1,reason:'Synthetic explicit re-review of retained capture.'})
    assert.notEqual(replacement,v1);assert.deepEqual(await read(db),[])
    await bindMember(replacement,'synthetic-next-member')
    const rows=await read(db);assert.equal(rows[0].claims[0].surfaces.length,1)
    assert.equal(rows[0].articles.find(a=>a.article_id===f.first.article_id).has_extracted_claim,false)
    await assert.rejects(bindSurface(v1,f.article_claim_id),/exact latest reviewed proposition/)
    await db.exec('rollback')
  })
  await t.test('Source Report members retain unknown coverage and never proposition support',async()=>{
    await db.exec('begin')
    const report=await f.bindArticle(f.second,{kind:'source_report',claims:[],review:'synthetic-report-admission',predecessor:v2,reason:'Synthetic report-only correction.'})
    await bindMember(report,'synthetic-report-member')
    const rows=await read(db);assert.equal(rows[0].claims[0].surfaces.length,1)
    assert.equal(rows[0].articles.find(a=>a.public_version_id===report).has_extracted_claim,false)
    await assert.rejects(bindSurface(report,f.second_claim_id),/reviewed proposition evidence/)
    await db.exec('rollback')
  })
  await t.test('withdrawals, retained hash mismatch, source metadata and nested spans close exact members',async()=>{
    const changes=[
      ["update public.articles set source_status='withdrawn' where id=$1",f.first.article_id],
      ["update public.articles set outlet='Unreviewed publisher' where id=$1",f.first.article_id],
      ["update public.article_claims set char_start=3 where id=$1",f.article_claim_id],
      ["update public.events set comparison_validation_state='pending_review' where id=$1",f.event_id],
      ['delete from public.event_articles where event_id=$1',f.event_id],
    ]
    for(const [sql,id] of changes){await db.exec('begin');await db.query(sql,[id]);assert.deepEqual(await read(db),[],sql);await db.exec('rollback')}
    // A disposable administrator simulates at-rest corruption after proving
    // the native append-only trigger ordinarily rejects capture rewrites.
    await assert.rejects(db.query("update evidence_pipeline.article_captures set content_hash=repeat('0',64) where id=$1",[f.first.capture_id]),/append-only/)
    for(const mutation of ["content_hash=repeat('0',64)","payload=jsonb_set(payload,'{summary}','\"tampered retained bytes\"')"]){
      await db.exec('begin;alter table evidence_pipeline.article_captures disable trigger user')
      await db.query('update evidence_pipeline.article_captures set '+mutation+' where id=$1',[f.first.capture_id])
      assert.deepEqual(await read(db),[]);await db.exec('rollback')
    }
  })
  await t.test('annotation, correction and explanation mutation closes the bound surface without substituting current bytes',async()=>{
    const changes=[
      ["update public.explanations set supporting_passage=supporting_passage||' UNREVIEWED' where id=$1",f.explanation_id],
      ["update public.explanations set review_status='draft' where id=$1",f.explanation_id],
      ["update public.claim_evidence_links set evidence_url='https://example.invalid/unreviewed' where id=$1",f.link_id],
      ["update public.claim_corrections set correction_text='UNREVIEWED' where id=$1",f.correction_id],
      ["update public.article_claims set loaded_language='[]' where id=$1",f.article_claim_id],
    ]
    for(const [sql,id] of changes){
      await db.exec('begin');await db.query(sql,[id]);const rows=await read(db)
      assert.equal(rows[0].claims[0].surfaces.length,1,sql)
      assert.equal(rows[0].claims[0].evidence_links.length,0);assert.equal(rows[0].claims[0].corrections.length,0)
      assert.doesNotMatch(JSON.stringify(rows),/UNREVIEWED/);await db.exec('rollback')
    }
  })
  await t.test('readers and ingestion service have no binding, private ledger or base-owner access',async()=>{
    for(const role of ['anon','authenticated','service_role']){
      for(const sql of ['select * from mip_private.comparison_reviewed_members',
        `select mip_private.bind_comparison_member('${v1}','${f.event_id}','forged')`]){
        await db.exec('begin;set local role '+role);await assert.rejects(db.exec(sql),/permission denied/);await db.exec('rollback')
      }
    }
    for(const role of ['anon','authenticated']){
      await db.exec('begin;set local role '+role);assert.equal((await read(db)).length,1)
      await assert.rejects(db.exec('select * from public.explanations'),/permission denied/);await db.exec('rollback')
    }
    await assert.rejects(db.exec("update mip_private.comparison_reviewed_members set review_ref='rewrite'"),/append-only/)
    await assert.rejects(db.exec('truncate mip_private.comparison_reviewed_surfaces'),/append-only/)
  })
  await t.test('retained binding history refuses destructive rollback',async()=>{
    const installed=await catalog(db)
    const original=await scalar('select original_catalog from mip_private.comparison_install_snapshot')
    await db.query("select set_config('mip.comparison_original_catalog',$1,false)",[JSON.stringify(original)])
    await db.query("select set_config('mip.comparison_rollback_expected_catalog',$1,false)",[JSON.stringify(installed)])
    await assert.rejects(db.exec(await readFile(COMPARISON_VERSION_ROLLBACK,'utf8')),/history exists/);await db.exec('rollback')
    assert.equal((await read(db)).length,1)
  })
})

test('empty Source Comparison package restores exact original definition, ACL, options and catalog',async t=>{
  const f=await createReviewedVersionFixture();const {db}=f;t.after(()=>db.close())
  const original=await installComparisonReviewedVersionFixture(db),installed=await catalog(db)
  await assert.rejects(db.exec(await readFile(COMPARISON_VERSION_ROLLBACK,'utf8')),/exact original and installed/);await db.exec('rollback')
  await db.query("select set_config('mip.comparison_original_catalog',$1,false)",[JSON.stringify(original)])
  await db.query("select set_config('mip.comparison_rollback_expected_catalog',$1,false)",[JSON.stringify(installed)])
  await db.exec("comment on function public.read_reviewed_comparison_v1() is 'synthetic unapproved drift'")
  await assert.rejects(db.exec(await readFile(COMPARISON_VERSION_ROLLBACK,'utf8')),/rollback catalog drift/);await db.exec('rollback')
  await db.exec('comment on function public.read_reviewed_comparison_v1() is null')
  await db.exec(await readFile(COMPARISON_VERSION_ROLLBACK,'utf8'))
  assert.deepEqual(await catalog(db),original)
  for(const role of ['anon','authenticated']){
    await db.exec('begin;set local role '+role);await assert.rejects(read(db),/permission denied/);await db.exec('rollback')
  }
})

test('occupied same-name overload is refused and its exact definition/ACL survives',async t=>{
  const f=await createReviewedVersionFixture();const {db}=f;t.after(()=>db.close())
  for(const name of ['mip_private.bind_comparison_member','public.read_reviewed_comparison_v1']){
    await db.exec(`create function ${name}(text) returns text language sql as $$select 'SENTINEL-'||$1$$;
      revoke all on function ${name}(text) from public;grant execute on function ${name}(text) to authenticated`)
    const original=await catalog(db)
    await assert.rejects(installComparisonReviewedVersionFixture(db),/names occupied/);await db.exec('rollback')
    assert.deepEqual(await catalog(db),original)
    assert.equal(await f.scalar(`select ${name}('EXACT')`),'SENTINEL-EXACT')
    await db.exec(`drop function ${name}(text)`)
  }
})

test('inherited default ACLs cannot expose newly created private comparison bindings',async t=>{
  const f=await createReviewedVersionFixture();const {db}=f;t.after(()=>db.close())
  await db.exec(`create role synthetic_comparison_reader;grant synthetic_comparison_reader to authenticated;
    alter default privileges in schema mip_private grant select on tables to synthetic_comparison_reader`)
  const original=await catalog(db)
  await assert.rejects(installComparisonReviewedVersionFixture(db),/private ACL inherited or default-granted/)
  await db.exec('rollback')
  assert.deepEqual(await catalog(db),original)
  assert.equal(await f.scalar("select to_regclass('mip_private.comparison_reviewed_members')"),null)
})
