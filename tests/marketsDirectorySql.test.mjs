import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {createClient} from '@supabase/supabase-js'
import {applyFoundation} from '../scripts/mipConsolidationRestore.mjs'
import {installReviewedPublicVersionFixture} from '../scripts/reviewedPublicVersionPackage.mjs'
import {installMarketsDirectoryFixture,marketsCatalogQuery,MARKETS_DIRECTORY_SQL,MARKETS_ROLLBACK_SQL} from '../scripts/marketsDirectoryPackage.mjs'
import {createMarketsBackend} from '../src/lib/marketsBackend.js'
import {createMarketSourceLookup} from '../src/lib/marketSourceLookup.js'
import {validateMarketsPublicDirectory} from '../supabase/functions/_shared/marketsDirectoryContract.mjs'
import {marketFixtureId as id} from './fixtures/marketsSourceFixture.mjs'
const at='2024-04-08T18:00:00.000001123Z',start='2020-01-01T00:00:00Z'
const scalar=async(db,sql,args=[])=>(Object.values((await db.query(sql,args)).rows[0]))[0]
async function foundation() {
  const db=await PGlite.create()
  await applyFoundation(db)
  for(const name of ['20260906042413_evidence_change_queue_v1.sql','20260906051224_evidence_assessment_dependencies_v1.sql'])
    await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'))
  await installReviewedPublicVersionFixture(db)
  return db
}
async function source(db,n,kind='reviewed_proposition') {
  const article=id(400+n),capture=id(300+n),excerpt=`Synthetic source ${n} reports a qualified identity and event.`,url=`https://example.test/synthetic-${n}`
  await db.query("insert into articles(id,feed,outlet,title,url,summary,published_at,reader_state) values($1,'fixture',$2,$3,$4,$3,'2024-04-08','eligible')",[article,'Synthetic publisher '+n,excerpt,url])
  const payload={url,outlet:'Synthetic publisher '+n,title:excerpt,summary:excerpt,published_at:'2024-04-08T00:00:00Z',body_text:'PRIVATE-COMPLETE-BODY'}
  const job=await scalar(db,"insert into evidence_pipeline.import_jobs(canonical_url,input_hash,payload,first_run_id) values($1,'fixture',$2,'synthetic-markets') returning id",[url,JSON.stringify(payload)])
  const hash=await scalar(db,"select encode(sha256(convert_to($1::jsonb::text,'UTF8')),'hex')",[JSON.stringify(payload)])
  await db.query('insert into evidence_pipeline.article_captures(id,article_id,job_id,content_hash,payload) values($1,$2,$3,$4,$5)',[capture,article,job,hash,JSON.stringify(payload)])
  let claim=null
  if(kind==='reviewed_proposition'){
    await db.query("insert into event_articles(event_id,article_id,membership_method) values($1,$2,'synthetic')",[id(900),article])
    claim=await scalar(db,"insert into claims(event_id,canonical_text,rule_version) values($1,$2,'sc-v2-event-projection') returning id",[id(900),excerpt])
    claim=await scalar(db,"insert into article_claims(claim_id,article_id,surface_text,auditability_state,evidence_source_field,evidence_excerpt,char_start,char_end) values($1,$2,$3,'verified_retained_source','summary',$3,0,$4) returning id",[claim,article,excerpt,Array.from(excerpt).length])
  }
  return {article,capture,hash,excerpt,claim,kind}
}
async function bind(db,s){
  s.publicVersionId=await scalar(db,'select mip_private.bind_reviewed_public_article_version($1,$2,$3,$4,$5,$6,$7,$8::uuid[])',
    [s.article,s.capture,s.hash,s.kind,'synthetic-source-review-'+s.article,'synthetic-policy-v1','Synthetic fixture; no real finding.',s.claim?[s.claim]:[]])
  return s
}
async function append(db,kind,anchor,payload,sources=[]){return scalar(db,'select mip_private.append_market_revision($1,$2,$3,$4,$5,$6)',
  [kind,anchor,JSON.stringify(payload),'synthetic-market-review','synthetic-method-v1',JSON.stringify(sources)])}
async function right(db,s){
  s.rightsVersionId=await append(db,'source_rights',s.publicVersionId,{publicVersionId:s.publicVersionId,captureId:s.capture,payloadHash:s.hash,
    displayExcerpt:true,attribution:'Synthetic fixture source, not admitted evidence.',termsUrl:'https://example.test/terms',checkedAt:'2026-10-02T07:00:00Z',validUntil:null,reviewRef:'synthetic-rights-review'})
  return {publicVersionId:s.publicVersionId,captureId:s.capture,payloadHash:s.hash,rightsVersionId:s.rightsVersionId,field:'summary',start:0,end:Array.from(s.excerpt).length,excerpt:s.excerpt}
}

test('actual Markets SQL extends native history and shared admission, feeds installed SDK, and defaults closed',async t=>{
  const db=await foundation();t.after(()=>db.close())
  const sql=await readFile(MARKETS_DIRECTORY_SQL,'utf8')
  await t.test('missing or drifted full catalog authority aborts installation atomically',async()=>{
    await assert.rejects(db.exec(sql),/baseline missing or drifted/);await db.exec('rollback')
    await db.query("select set_config('mip.markets_expected_catalog','{}',false)")
    await assert.rejects(db.exec(sql),/baseline missing or drifted/);await db.exec('rollback')
    assert.equal(await scalar(db,"select to_regprocedure('public.read_markets_source_directory_v1(text)')"),null)
  })
  await installMarketsDirectoryFixture(db)
  await t.test('empty directory, date-only clocks and nanosecond aliases qualify deterministically',async()=>{
    assert.equal((await scalar(db,'select public.read_markets_source_directory_v1($1)',[at])).reason,'no_admitted_assets')
    assert.equal((await scalar(db,"select public.read_markets_source_directory_v1('2024-04-08')")).reason,'inspection_time_unavailable')
    const instant=await scalar(db,'select mip_private.market_instant_ns($1)',[at])
    assert.equal(BigInt(instant.split('.')[0]),1712599200000001123n)
    assert.equal(await scalar(db,"select mip_private.market_instant_ns('2024-04-08T14:00:00.000001123-04:00')"),instant)
  })
  await db.query("insert into events(id,canonical_title,status,comparison_validation_state) values($1,'Synthetic event','active','approved')",[id(900)])
  await db.query("insert into nodes(id,type,label) values($1,'event','Synthetic event')",[id(900)])
  const identitySource=await source(db,1),pathSource=await source(db,2)
  await bind(db,identitySource);await bind(db,pathSource)
  const identityBinding=await right(db,identitySource),pathBinding=await right(db,pathSource)
  const simple=(identityType,name,extra={})=>({identityType,name,validFrom:start,validTo:null,...extra})
  await append(db,'market_identity',id(90),simple('issuer','Synthetic issuer'),[identityBinding])
  await append(db,'market_identity',id(91),simple('share_class','Synthetic class A',{issuerId:id(90)}),[identityBinding])
  await append(db,'market_identity',id(92),simple('share_class','Synthetic class B',{issuerId:id(90)}),[identityBinding])
  const listingVersion=await append(db,'market_identity',id(1),simple('listing','Synthetic listing',{issuerId:id(90),shareClassId:id(91),exchangeMic:'TST1',
    aliases:[{symbol:'SAME',namespace:'TST1',publicVersionId:identitySource.publicVersionId,validFrom:start,validTo:null}]}),[identityBinding])
  await append(db,'market_identity',id(2),simple('listing','Synthetic class B listing',{issuerId:id(90),shareClassId:id(92),exchangeMic:'TST2',
    aliases:[{symbol:'SAME',namespace:'TST2',publicVersionId:identitySource.publicVersionId,validFrom:start,validTo:null}]}),[identityBinding])
  await append(db,'market_identity',id(93),simple('network','Synthetic network'),[identityBinding])
  await append(db,'market_identity',id(3),simple('cryptoasset','Synthetic native coin',{networkId:id(93),assetIdentifier:'native:synthetic',assetIdentifierKind:'native',
    aliases:[{symbol:'SAME',namespace:'synthetic-network',publicVersionId:identitySource.publicVersionId,validFrom:start,validTo:null}]}),[identityBinding])
  await append(db,'market_identity',id(94),simple('network','Synthetic token network'),[identityBinding])
  await append(db,'market_identity',id(4),simple('cryptoasset','Synthetic same-symbol token',{networkId:id(94),assetIdentifier:'contract:synthetic',assetIdentifierKind:'contract',
    aliases:[{symbol:'SAME',namespace:'synthetic-token-network',publicVersionId:identitySource.publicVersionId,validFrom:start,validTo:null}]}),[identityBinding])
  await append(db,'market_identity',id(95),simple('trading_pair','Synthetic pair',{baseAssetId:id(3),quoteAssetId:id(4),venue:'synthetic-venue'}),[identityBinding])
  const candidate=await scalar(db,"insert into evidence_pipeline.evidence_candidates(capture_id,candidate_key,candidate_kind,statement,source_field,span_start,span_end,excerpt,event_node_id,extractor_version,remaining_uncertainty) values($1,'market','claim',$2,'summary',0,$3,$2,$4,'synthetic-v1','Synthetic fixture.') returning id",[pathSource.capture,pathSource.excerpt,Array.from(pathSource.excerpt).length,id(900)])
  const context=await scalar(db,"select public.mip_assessments_v1('context',$1)",[JSON.stringify({candidate_id:candidate})])
  const assessment=await scalar(db,"select public.mip_assessments_v1('append',$1)",[JSON.stringify({candidate_id:candidate,algorithm_key:'synthetic-markets',algorithm_version:'synthetic-v1',outcome:'supported',
    rationale:'Synthetic qualification only.',remaining_uncertainty:'Synthetic fixture.',context_positions:context.context_positions})])
  const support={captureId:pathSource.capture,field:'summary',start:0,end:Array.from(pathSource.excerpt).length,excerpt:pathSource.excerpt}
  const path={evidence:{at,asset:{id:id(1),recordVersionId:listingVersion},eventId:id(900),hops:[{from:id(1),to:id(900),relationship:'direct_reporting',assessmentId:assessment}],
    assessments:[{id:assessment,candidateId:candidate,from:id(1),to:id(900),relationship:'direct_reporting',algorithmVersion:'synthetic-v1',uncertainty:'Synthetic fixture.',
      validFrom:start,validTo:null,supports:[support],privateRationale:'DO-NOT-EXPOSE'}],captures:[{id:pathSource.capture,publicVersionId:pathSource.publicVersionId,payloadHash:pathSource.hash,rootId:id(500),body:'DO-NOT-EXPOSE'}]}}
  const pathVersion=await append(db,'market_evidence_path',id(2200),path,[pathBinding])
  let snapshot
  await t.test('a visible source report and caller flags cannot qualify a market identity',async()=>{
    const report=await bind(db,await source(db,3,'source_report')),binding=await right(db,report)
    const version=await append(db,'market_identity',id(99),simple('listing','Source-report-only asset',{issuerId:id(90),shareClassId:id(91),exchangeMic:'TST9',
      publiclyEligible:true,releaseState:'public',aliases:[{symbol:'GUESS',namespace:'TST9',publicVersionId:report.publicVersionId,validFrom:start,validTo:null}]}),[binding])
    assert.equal(await scalar(db,'select mip_private.public_article_version_is_visible($1)',[report.publicVersionId]),true)
    assert.equal(await scalar(db,'select count(*)::int from mip_private.public_market_source_bindings where record_version_id=$1',[version]),0)
    assert.equal((await scalar(db,'select public.read_markets_source_directory_v1($1)',[at])).assets.some(asset=>asset.id===id(99)),false)
  })
  await t.test('distinct actual identities and exact path/source/right revisions reach the installed SDK without complete bodies',async()=>{
    snapshot=await scalar(db,'select public.read_markets_source_directory_v1($1)',[at])
    assert.equal(snapshot.status,'available',snapshot.reason);assert.equal(snapshot.assets.length,4);assert.equal(snapshot.reporting.length,1)
    assert.equal(validateMarketsPublicDirectory(snapshot).status,'available',validateMarketsPublicDirectory(snapshot).reason)
    assert.equal(snapshot.identities.filter(row=>row.identityType==='trading_pair').length,1)
    assert.doesNotMatch(JSON.stringify(snapshot),/DO-NOT-EXPOSE|PRIVATE-COMPLETE-BODY|privateRationale/)
    const calls=[]
    const client=createClient('https://synthetic-sql-market.invalid','synthetic-publishable',{accessToken:async()=> 'synthetic-auth',global:{fetch:async(url,init)=>{
      const request=new Request(url,init),body=await request.json();calls.push({url:request.url,body})
      await db.exec('begin;set local role authenticated')
      try{return new Response(JSON.stringify(await scalar(db,'select public.read_markets_source_directory_v1($1)',[body.p_at])),{headers:{'content-type':'application/json'}})}finally{await db.exec('rollback')}
    }}})
    const result=await createMarketsBackend(client).loadDirectory({at});assert.equal(result.status,'available',result.reason)
    assert.equal(calls.length,1);assert.equal(createMarketSourceLookup(result.snapshot).search('SAME').results.length,4)
    assert.equal(createMarketSourceLookup(result.snapshot).lookup({id:id(1)}).model.reporting.sections[0].records.length,1)
    assert.equal(await scalar(db,'select release_state from evidence_pipeline.assessments where id=$1',[assessment]),'private')
  })
  await t.test('readers and ingestion service cannot qualify mappings, revoke reviews or access private ledgers',async()=>{
    for(const role of ['anon','authenticated','service_role']){
      await db.exec('begin;set local role '+role)
      await assert.rejects(db.query('select * from mip_private.market_revision_qualifications'),/permission denied/);await db.exec('rollback')
      await db.exec('begin;set local role '+role)
      await assert.rejects(db.query("select mip_private.append_market_revision('market_identity',$1,'{}','forged','forged','[]')",[id(9999)]),/permission denied|review owner/);await db.exec('rollback')
    }
    assert.equal(await scalar(db,"select count(*)::int from pg_policy where polrelid='mip_private.market_revision_sources'::regclass"),0)
    await assert.rejects(db.query('update mip_private.market_revision_qualifications set method_version=$1 where record_version_id=$2',['forged',pathVersion]),/append-only/)
  })
  await t.test('exact inspection changes preserve identities and withhold another instant’s paths',async()=>{
    const adjacent=await scalar(db,'select public.read_markets_source_directory_v1($1)',['2024-04-08T18:00:00.000001124Z'])
    assert.equal(adjacent.assets.length,4);assert.equal(adjacent.reporting.length,0);assert.equal(adjacent.validAt,'2024-04-08T18:00:00.000001124Z')
  })
  await t.test('a reviewed replacement with an unsupported or disconnected path cannot publish a relationship',async()=>{
    assert.equal(await scalar(db,'select mip_private.market_path_is_supported($1,$2,1,null,null)',[id(1),id(900)]),false)
    for(const change of [p=>p.evidence.hops[0].relationship='causation',p=>p.evidence.hops[0].from=id(9999),p=>delete p.evidence.assessments[0].validTo]){
      const replacement=structuredClone(path);change(replacement)
      await db.exec('begin');await append(db,'market_evidence_path',id(2200),replacement,[pathBinding])
      assert.equal((await scalar(db,'select public.read_markets_source_directory_v1($1)',[at])).reporting.length,0)
      await db.exec('rollback')
    }
  })
  await t.test('rights revocation and source correction immediately withdraw paths without hiding the unaffected directory',async()=>{
    await db.exec('begin')
    await db.query("update public.articles set summary='Synthetic revised source' where id=$1",[pathSource.article])
    assert.equal((await scalar(db,'select evidence_pipeline.read_assessment($1,null)',[assessment])).stale,true)
    assert.equal((await scalar(db,'select public.read_markets_source_directory_v1($1)',[at])).reporting.length,0)
    await db.exec('rollback')
    assert.equal((await scalar(db,'select public.read_markets_source_directory_v1($1)',[at])).reporting.length,1)
    await db.query("insert into mip_private.market_revision_revocations(record_version_id,review_ref,reason) values($1,'synthetic-revocation','Synthetic rights withdrawn')",[pathSource.rightsVersionId])
    const revoked=await scalar(db,'select public.read_markets_source_directory_v1($1)',[at]);assert.equal(revoked.assets.length,4);assert.equal(revoked.reporting.length,0)
    await db.query("update public.articles set summary='Synthetic corrected source' where id=$1",[pathSource.article])
    assert.equal(await scalar(db,'select mip_private.public_article_version_is_visible($1)',[pathSource.publicVersionId]),false)
    assert.equal((await scalar(db,'select public.read_markets_source_directory_v1($1)',[at])).assets.length,4)
    await assert.rejects(db.exec(await readFile(MARKETS_ROLLBACK_SQL,'utf8')),/preservation plan/);await db.exec('rollback')
  })
})

test('empty Markets installation rollback restores the exact pre-install catalog',async t=>{
  const db=await foundation();t.after(()=>db.close())
  const baseline=await installMarketsDirectoryFixture(db)
  await db.exec(await readFile(MARKETS_ROLLBACK_SQL,'utf8'))
  await db.exec('set search_path=pg_catalog')
  assert.deepEqual(await scalar(db,await marketsCatalogQuery()),baseline)
  await db.exec("create function public.read_markets_source_directory_v1(p_sentinel integer) returns jsonb language sql as $$select jsonb_build_object('sentinel',p_sentinel)$$")
  const sentinel=await scalar(db,"select jsonb_build_object('definition',pg_get_functiondef(oid),'acl',proacl::text) from pg_proc where oid='public.read_markets_source_directory_v1(integer)'::regprocedure")
  await assert.rejects(installMarketsDirectoryFixture(db),/names occupied/);await db.exec('rollback')
  assert.deepEqual(await scalar(db,"select jsonb_build_object('definition',pg_get_functiondef(oid),'acl',proacl::text) from pg_proc where oid='public.read_markets_source_directory_v1(integer)'::regprocedure"),sentinel)
})
