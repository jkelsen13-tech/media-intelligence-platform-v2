import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { PGlite } from '@electric-sql/pglite'
import { applyFoundation } from '../scripts/mipConsolidationRestore.mjs'
import { loadArticleDetail as historicalArticleDetail } from './fixtures/legacyReaderBeforeVersions-2026-10-02.mjs'

// Historical predecessor qualification. Current atomic handler is qualified in legacyAtomicCompletion.test.mjs.
const current = await readFile(new URL('../supabase/functions/backfill-legacy/index.ts', import.meta.url), 'utf8')
const predecessor = await readFile(new URL('./fixtures/legacyExtractBatchBeforeAtomic-2026-10-02.ts', import.meta.url), 'utf8')
const start = current.indexOf('async function extractBatch('), end = current.indexOf('// Review-gated candidate pass.',start)
const source = current.slice(0,start) + predecessor + current.slice(end)
const compiled = await build({ stdin: { contents: source + '\nexport { extractBatch };\n', resolveDir: new URL('../supabase/functions/backfill-legacy/', import.meta.url).pathname, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'no-live-sdk', setup(b) { b.onResolve({ filter: /^https:/ }, () => ({ path: 'sdk', namespace: 'local' })); b.onLoad({ filter: /.*/, namespace: 'local' }, () => ({ contents: 'export const createClient=()=>{throw Error("live function entrypoint forbidden")}', loader: 'js' })) } }],
})
const previousDeno = globalThis.Deno
globalThis.Deno = { env: { get: () => undefined }, serve() {} }
const { extractBatch } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)
test.after(() => { if (previousDeno === undefined) delete globalThis.Deno; else globalThis.Deno = previousDeno })
const SENTINEL = 'Read-only reference import: public source metadata only. No original body text, embeddings, entities, claims, or relationship data were copied.'
const id = '10000000-0000-4000-8000-000000000001'
const counterpart = '10000000-0000-4000-8000-000000000002'
const original = 'a vessel <b>arrived</b> at the fictional harbor.'
const quote = 'a vessel <b>arrived</b>'
const receipts = []
const identifier = value => { assert.match(value, /^[a-z_][a-z0-9_]*$/i); return `"${value}"` }

async function fixture({ readerState = 'eligible', body = original, race = false, failWrite = false, denyAllWrites = false } = {}) {
  const db = await PGlite.create(), calls = []
  await applyFoundation(db)
  await db.exec(`alter table articles add column if not exists entities_extracted_at timestamptz, add column if not exists image_url text, add column if not exists image_alt text, add column if not exists arc_assign_attempted_at timestamptz, add column if not exists source_status_changed_at timestamptz, add column if not exists source_status_note text;
    create table public.article_entities(article_id uuid, entity_id uuid);
    create table public.fixture_propagations(article_id uuid);
    create function public.fixture_source_change_clause() returns trigger language plpgsql as $$begin
      if new.source_status is not distinct from old.source_status or new.source_status not in ('corrected','withdrawn') then return new; end if;
      insert into public.fixture_propagations values(new.id); return new;
    end$$;
    create trigger zz_factual_source_change before update on articles for each row execute function public.fixture_source_change_clause();`)
  // Explicit synthetic approval and mutation-capable fixture role, not live authority.
  await db.query("insert into articles(id,feed,outlet,title,url,summary,body_text,reader_state) values($1,'fixture','Publisher A','Alice Smith announced the fictional harbor update.','https://publisher.invalid/one',$2,$3,$4),($5,'fixture','Publisher B','counterpart','https://publisher.invalid/two','counterpart','counterpart','eligible')", [id, original, body, readerState, counterpart])
  await db.query('update articles set entities_extracted_at=now() where id=$1', [counterpart])
  const event = (await db.query("insert into events(canonical_title,status,comparison_validation_state) values('synthetic admitted comparison','active','approved') returning id")).rows[0].id
  await db.query("insert into event_articles(event_id,article_id,membership_method) values($1,$2,'synthetic_fixture'),($1,$3,'synthetic_fixture')", [event, id, counterpart])
  const claim = (await db.query("insert into claims(event_id,canonical_text,rule_version) values($1,'synthetic vessel arrival','sc-v2-event-projection') returning id", [event])).rows[0].id
  await db.query("insert into article_claims(claim_id,article_id,surface_text,auditability_state,evidence_source_field,evidence_excerpt) values($1,$2,$3,'verified_retained_source','summary',$3)", [claim, id, quote])
  await db.query("insert into citations(article_id,cited_entity,cited_type,documentation_strength) values($1,'Existing public citation','agency_release',1)", [id])
  let patchCount = 0
  const fetch = async (input, init) => {
    const request = new Request(input, init), url = new URL(request.url), table = url.pathname.split('/').at(-1), params = url.searchParams
    const payload = ['PATCH', 'POST'].includes(request.method) ? await request.json() : null
    calls.push({ method: request.method, table, filters: Object.fromEntries(params), payload })
    const headers = { 'content-type': 'application/json' }
    try {
      assert.ok(['articles','citations','article_entities','news_detail_public','authors_public'].includes(table), `unexpected fixture table ${table}`)
      if (table === 'articles' && request.method === 'PATCH') {
        patchCount++
        if (race && patchCount === 1) await db.query("update articles set reader_state='eligible' where id=$1", [id])
        if (failWrite && patchCount === 1) return new Response(JSON.stringify({ code: 'fixture_write_error', message: 'synthetic write failure' }), { status: 400, headers })
      }
      const values = [], filters = []
      for (const [field, value] of params) {
        if (['select','order','offset','limit'].includes(field)) continue
        if (field === 'or') { assert.equal(value, '(reader_state.neq.eligible,source_status.neq.active)'); filters.push("(reader_state <> 'eligible' or source_status <> 'active')"); continue }
        if (value === 'is.null') { filters.push(`${identifier(field)} is null`); continue }
        assert.ok(value.startsWith('eq.'), `unsupported fixture filter ${field}=${value}`)
        values.push(value.slice(3)); filters.push(`${identifier(field)}=$${values.length}`)
      }
      const where = filters.length ? ` where ${filters.join(' and ')}` : ''
      const selected = params.get('select')?.split(',').map(identifier).join(',') ?? '*'
      let rows
      if (request.method === 'GET') {
        const order = (params.get('order') ?? '').split(',').filter(Boolean).map(value => { const [field,dir='asc'] = value.split('.'); assert.ok(['asc','desc'].includes(dir)); return `${identifier(field)} ${dir}` }).join(',')
        const limit = Number(params.get('limit') ?? 1000); assert.ok(Number.isInteger(limit) && limit > 0)
        rows = (await db.query(`select ${selected} from public.${identifier(table)}${where}${order ? ' order by '+order : ''} limit ${limit}`, values)).rows
      } else if (request.method === 'PATCH') {
        const set = Object.entries(payload).map(([field,value]) => { values.push(value); return `${identifier(field)}=$${values.length}` }).join(',')
        const sql = `update public.${identifier(table)} set ${set}${where} returning ${selected}`
        if (denyAllWrites) {
          await db.exec('begin; set local role service_role')
          try { rows = (await db.query(sql, values)).rows } finally { await db.exec('rollback') }
        } else rows = (await db.query(sql, values)).rows
      } else if (request.method === 'DELETE') rows = (await db.query(`delete from public.${identifier(table)}${where} returning *`, values)).rows
      else if (request.method === 'POST') {
        const fields = Object.keys(payload), placeholders = fields.map((_,i) => '$'+(i+1)).join(',')
        rows = (await db.query(`insert into public.${identifier(table)}(${fields.map(identifier).join(',')}) values(${placeholders}) returning *`, Object.values(payload))).rows
      } else throw Error('unexpected fixture method')
      headers['content-range'] = `0-${Math.max(0,rows.length-1)}/${rows.length}`
      const single = request.headers.get('accept')?.includes('vnd.pgrst.object')
      if (single && rows.length !== 1) return new Response(JSON.stringify({ code:'PGRST116',details:`The result contains ${rows.length} rows`,message:'No row' }), { status:406,headers })
      return new Response(JSON.stringify(single ? rows[0] : rows), { headers })
    } catch (error) { return new Response(JSON.stringify({ code:error.code ?? 'fixture_error',message:error.message }), { status:400,headers }) }
  }
  const client = createClient('https://legacy-source.example.invalid', 'sb_publishable_fixture', { accessToken: async () => 'fixture-mutation-role', global:{fetch}, realtime:{transport:class{constructor(){throw Error('unexpected websocket')}}} })
  return { db, client, calls, backend:{loadArticleDetail:id=>historicalArticleDetail(id,{supabaseClient:client})}, close:()=>db.close() }
}
const nativeArticle = async f => (await f.db.query('select * from articles where id=$1',[id])).rows[0]
const run = async f => {
  const report={entitiesResolved:0,citations:0,extracted:0,errors:[]}
  report.resolverInvocations=0
  const more=await extractBatch(f.client,{resolve:async()=>{report.resolverInvocations++;return null}},new Set(),{},report)
  return {more,report}
}

test('historical legacy scan leaves already eligible active source bytes and public reviewed span untouched', async () => {
  const f=await fixture()
  try {
    const before=await nativeArticle(f), result=await run(f)
    assert.deepEqual(await nativeArticle(f),before)
    assert.equal(result.more,false)
    assert.ok(!f.calls.some(call=>call.method!=='GET'))
    const detail=await f.backend.loadArticleDetail(id)
    assert.equal(detail.summary,original);assert.equal(detail.claims[0].evidence_excerpt,quote)
    assert.equal((await f.db.query('select count(*)::int n from fixture_propagations')).rows[0].n,0)
    receipts.push({case:'already public',calls:f.calls,status:'PASS'})
  } finally {await f.close()}
})

test('historical legacy pending extraction remains possible without changing publication state', async () => {
  const f=await fixture({readerState:'pending_review'})
  try {
    const result=await run(f), after=await nativeArticle(f)
    assert.equal(result.report.errors.length,0);assert.equal(result.report.extracted,1)
    assert.ok(result.report.resolverInvocations>0, 'control must reach entity resolution')
    const sourceWrite=f.calls.findIndex(call=>call.table==='articles'&&call.method==='PATCH')
    const derivedWrite=f.calls.findIndex(call=>call.table!=='articles'&&call.method!=='GET')
    const completion=f.calls.findIndex(call=>call.table==='articles'&&call.method==='PATCH'&&call.payload.entities_extracted_at)
    assert.ok(sourceWrite<derivedWrite&&derivedWrite<completion, 'source acceptance precedes derived writes, completion follows them')
    assert.equal(after.summary,'a vessel arrived at the fictional harbor.');assert.equal(after.reader_state,'pending_review');assert.equal(after.source_status,'active')
    assert.equal((await f.backend.loadArticleDetail(id)).articleMissing,true)
    receipts.push({case:'pending still extracted',calls:f.calls,status:'PASS'})
  } finally {await f.close()}
})

for(const scenario of [{name:'normal',body:original},{name:'metadata sentinel',body:SENTINEL},{name:'error catch',body:original,failWrite:true}]) {
  test(`historical source update guards the selected-pending to eligible race: ${scenario.name}`,async()=>{
    const f=await fixture({readerState:'pending_review',race:true,...scenario})
    try {
      const before=await nativeArticle(f),result=await run(f),after=await nativeArticle(f)
      for(const field of ['title','summary','body_text','source_status','entities_extracted_at','claims']) assert.deepEqual(after[field],before[field],field)
      assert.equal(after.reader_state,'eligible')
      const writes=f.calls.filter(call=>call.table==='articles'&&call.method==='PATCH')
      assert.ok(writes.length>=1)
      assert.ok(writes.every(call=>call.filters.or==='(reader_state.neq.eligible,source_status.neq.active)'))
      assert.ok(!f.calls.some(call=>call.table!=='articles'&&call.method!=='GET'), 'zero RETURNING must have no derived mutation')
      assert.equal(result.report.resolverInvocations,0)
      assert.equal((await f.db.query('select count(*)::int n from fixture_propagations')).rows[0].n,0)
      receipts.push({case:scenario.name,calls:f.calls,report:result.report,status:'PASS',side_effects_before_atomic_write:f.calls.filter(call=>call.table!=='articles'&&call.method!=='GET')})
    } finally {await f.close()}
  })
}

test('source UPDATE denial prevents per-article derived writes',async()=>{
  const f=await fixture({readerState:'pending_review',denyAllWrites:true})
  try {
    const before=await nativeArticle(f),result=await run(f)
    assert.deepEqual(await nativeArticle(f),before)
    assert.equal(result.report.errors.length,1)
    assert.equal(result.report.extracted,0)
    assert.equal(result.report.resolverInvocations,0)
    assert.ok(!f.calls.some(call=>call.table!=='articles'&&call.method!=='GET'))
    receipts.push({case:'UPDATE denied',calls:f.calls,report:result.report,status:'PASS'})
  } finally {await f.close()}
})

test.after(async()=>{
  if(process.env.MIP_LEGACY_SOURCE_RECEIPT) await writeFile(process.env.MIP_LEGACY_SOURCE_RECEIPT,JSON.stringify({status:receipts.length===6?'PASS':'INCOMPLETE',cases:receipts,synthetic_fixture:true,live_operations:0,trigger_replay:'supplied unchanged-status early-return clause only; not full deployed function',mutation_authority:'explicit isolated postgres fixture; live legacy writer authority/activation unknown'},null,2)+'\n')
})
