import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { createClient } from '@supabase/supabase-js'
import { applyFoundation } from '../scripts/mipConsolidationRestore.mjs'
import { createPublicDataBackend } from '../src/lib/publicDataBackend.js'

export const ARTICLE_READER_COLUMNS = Object.freeze(['id','feed','outlet','title','url','summary','body_text','published_at','fetched_at','reader_state','source_status','arc_id','author_id','monoculture','unattributed'])
const proposalFile = new URL('../supabase/source-proposals/article_reader_column_privileges_v1.sql', import.meta.url)
const rollbackFile = new URL('../supabase/source-proposals/article_reader_column_privileges_v1.rollback.sql', import.meta.url)
const identifier = value => { assert.match(value, /^[a-z_][a-z0-9_]*$/i); return `"${value}"` }
const RAW = 'SYNTHETIC_UNADMITTED_RAW_EXTRACTION'
// Installed SDK transport executes SELECT under actual restored SQL/RLS roles.
// This bounded request translator is not deployed PostgREST or JWT qualification.
function isolatedTransport(db, executed, requests) {
  let tail = Promise.resolve()
  const transaction = (role, work) => {
    const result = tail.then(async () => {
      await db.exec(`begin; set local role ${identifier(role)}`)
      try {
        const value = await work()
        await db.exec('commit')
        return value
      } catch (error) { await db.exec('rollback'); throw error }
    })
    tail = result.catch(() => {})
    return result
  }
  const query = async (role, sql, params = []) => {
    executed.push({ role, sql, params })
    return db.query(sql, params)
  }
  const forRole = role => async (input, init) => {
    const request = new Request(input, init), url = new URL(request.url)
    requests.push({ role, method: request.method, path: url.pathname, search: url.search, schema: request.headers.get('accept-profile') ?? 'public' })
    const headers = { 'content-type': 'application/json' }
    try {
      return await transaction(role, async () => {
        if (request.method === 'POST') {
          assert.equal(url.pathname, '/rest/v1/rpc/mip_pipeline_v1')
          const body = await request.json()
          const result = await query(role, 'select public.mip_pipeline_v1($1,$2::jsonb) result', [body.p_action, JSON.stringify(body.p_input ?? {})])
          return new Response(JSON.stringify(result.rows[0].result), { headers })
        }
        assert.ok(['GET', 'HEAD'].includes(request.method))
        const table = url.pathname.split('/').at(-1)
        const schema = request.headers.get('accept-profile') ?? 'public'
        const relation = `${identifier(schema)}.${identifier(table)}`
        const columns = (url.searchParams.get('select') ?? '*').split(',').map(x => x.trim())
        const selection = columns.map(x => x === '*' ? '*' : identifier(x)).join(',')
        const params = [], filters = []
        for (const [key, value] of url.searchParams) {
          if (['select', 'order', 'offset', 'limit'].includes(key)) continue
          if (key === 'or') {
            const terms = value.slice(1, -1).split(',').map(term => {
              const match = /^([a-z_][a-z0-9_]*)\.ilike\.(.*)$/s.exec(term)
              assert.ok(match, 'bounded fixture only supports News ilike OR')
              params.push(match[2]); return `${identifier(match[1])} ilike $${params.length}`
            })
            filters.push(`(${terms.join(' or ')})`); continue
          }
          const field = identifier(key)
          if (value === 'not.is.null') { filters.push(`${field} is not null`); continue }
          if (value.startsWith('in.')) {
            const values = value.slice(4, -1).split(',').map(x => x.replace(/^"|"$/g, ''))
            const placeholders = values.map(x => { params.push(x); return `$${params.length}` })
            filters.push(`${field} in (${placeholders.join(',')})`); continue
          }
          const match = /^(eq|gt|gte|lte)\.(.*)$/s.exec(value)
          assert.ok(match, `unsupported test transport filter ${value}`)
          params.push(match[2]); filters.push(`${field} ${{ eq: '=', gt: '>', gte: '>=', lte: '<=' }[match[1]]} $${params.length}`)
        }
        const where = filters.length ? ` where ${filters.join(' and ')}` : ''
        const total = Number((await query(role, `select count(*)::int n from ${relation}${where}`, params)).rows[0].n)
        const ordering = (url.searchParams.get('order') ?? '').split(',').filter(Boolean).map(x => {
          const [field, direction = 'asc', nulls] = x.split('.')
          assert.ok(['asc', 'desc'].includes(direction))
          assert.ok(!nulls || ['nullsfirst', 'nullslast'].includes(nulls))
          return `${identifier(field)} ${direction}${nulls ? ` nulls ${nulls === 'nullsfirst' ? 'first' : 'last'}` : ''}`
        })
        const offset = Number(url.searchParams.get('offset') ?? 0), limit = Math.min(1000, Number(url.searchParams.get('limit') ?? 1000))
        assert.ok(Number.isInteger(offset) && offset >= 0 && Number.isInteger(limit) && limit >= 1)
        const { rows } = await query(role, `select ${selection} from ${relation}${where}${ordering.length ? ` order by ${ordering.join(',')}` : ''} limit ${limit} offset ${offset}`, params)
        headers['content-range'] = `${offset}-${offset + Math.max(0, rows.length - 1)}/${total}`
        const single = request.headers.get('accept')?.includes('vnd.pgrst.object')
        if (single && rows.length !== 1) return new Response(JSON.stringify({ code: 'PGRST116', message: 'No row', details: `The result contains ${rows.length} rows` }), { status: 406, headers })
        return new Response(request.method === 'HEAD' ? null : JSON.stringify(single ? rows[0] : rows), { headers })
      })
    } catch (error) {
      return new Response(JSON.stringify({ code: error.code ?? 'fixture_transport_error', message: error.message }), { status: error.code === '42501' ? 403 : 400, headers })
    }
  }
  return { forRole, transaction, query }
}


export async function articleCatalog(db, source) {
  const query = source.split('-- BEGIN BASELINE QUERY')[1].split('-- END BASELINE QUERY')[0].replace(' into actual', '')
  await db.exec('begin; set local search_path=pg_catalog')
  try { const value=Object.values((await db.query(query)).rows[0])[0]; await db.exec('commit'); return value }
  catch(error) { await db.exec('rollback'); throw error }
}
export async function applyArticlePrivilegeProposal(db, source, catalog) {
  await db.query("select set_config('mip.article_reader_acl_expected_catalog',$1,false)", [catalog == null ? '' : JSON.stringify(catalog)])
  try { await db.exec(source) } catch (error) { await db.exec('rollback'); throw error }
}
const preservedAclQuery = `select 'table' scope,'' column_name,pg_get_userbyid(x.grantor) grantor,pg_get_userbyid(x.grantee) grantee,x.privilege_type,x.is_grantable
  from pg_class c cross join lateral aclexplode(c.relacl) x where c.oid='public.articles'::regclass
    and not(x.grantee in (select oid from pg_roles where rolname in ('anon','authenticated')) and x.privilege_type='SELECT')
  union all select 'column',a.attname,pg_get_userbyid(x.grantor),pg_get_userbyid(x.grantee),x.privilege_type,x.is_grantable
  from pg_attribute a cross join lateral aclexplode(a.attacl) x where a.attrelid='public.articles'::regclass and a.attnum>0 and not a.attisdropped
    and not(x.grantee in (select oid from pg_roles where rolname in ('anon','authenticated')) and x.privilege_type='SELECT') order by 1,2,3,4,5,6`
const nonReaderCatalog = catalog => ({...catalog, acl: undefined, columns: catalog.columns.map(col=>({...col,acl:undefined}))})
export async function runArticleReaderColumnBoundary({receiptPath}={}) {
  const db=await PGlite.create(), checks=[], executed=[], requests=[]
  const proposal=await readFile(proposalFile,'utf8'), rollback=await readFile(rollbackFile,'utf8')
  const check=async (name,work)=>{const detail=await work();checks.push({name,status:'PASS',detail:detail??null})}
  try {
    await applyFoundation(db)
    // Fixture schema is restored historical source, NOT a clone of live 30-column catalog.
    // Current metadata says raw claims is NOT NULL; enforce that prerequisite here.
    await db.exec('alter table public.articles alter column claims set not null')
    // Nonreader per-column INSERT rights are sentinel grants the proposal must preserve.
    await db.exec('grant insert(id) on public.articles to service_role')
    const transport=isolatedTransport(db,executed,requests)
    const clients=Object.fromEntries(['anon','authenticated','service_role'].map(role=>[role,createClient('https://article-column-boundary.example.invalid','sb_publishable_fixture',{
      accessToken:async()=>`fixture-${role}`,global:{fetch:transport.forRole(role)},realtime:{transport:class{constructor(){throw new Error('no fixture websocket')}}}
    })]))
    const readers=Object.fromEntries(['anon','authenticated'].map(role=>[role,createPublicDataBackend(clients[role])]))
    const a=(await db.query("insert into articles(feed,outlet,title,url,summary,body_text,published_at,fetched_at,reader_state,claims) values('synthetic','Synthetic First','Synthetic source','https://first.example.invalid/source','Exact retained statement.','Exact retained statement. BodyOnlyToken','2026-09-30T10:00:00Z','2026-09-30T10:05:00Z','eligible',$1::jsonb) returning id",[JSON.stringify([{text:RAW}])])).rows[0].id
    const b=(await db.query("insert into articles(feed,outlet,title,url,summary,reader_state) values('synthetic','Synthetic Second','Second source','https://second.example.invalid/source','Unverified surface','eligible') returning id")).rows[0].id
    for(const [state,status] of [['pending_review','active'],['withheld','active'],['eligible','withdrawn']])await db.query("insert into articles(feed,outlet,title,url,reader_state,source_status,claims) values('synthetic','Synthetic Hidden',$1,$2,$3,$4,$5::jsonb)",[state+status,`https://hidden.example.invalid/${state}-${status}`,state,status,JSON.stringify([{text:'HIDDEN_'+RAW}])])
    const event=(await db.query("insert into events(canonical_title,status,comparison_validation_state) values('Synthetic reviewed comparison','active','approved') returning id")).rows[0].id
    await db.query("insert into event_articles(event_id,article_id,membership_method) values($1,$2,'synthetic_admin_review'),($1,$3,'synthetic_admin_review')",[event,a,b])
    const claim=(await db.query("insert into claims(event_id,canonical_text,rule_version) values($1,'Exact retained statement.','sc-v2-event-projection') returning id",[event])).rows[0].id
    await db.query("insert into article_claims(claim_id,article_id,surface_text,auditability_state,evidence_source_field,evidence_excerpt) values($1,$2,'Exact retained statement.','verified_retained_source','summary','Exact retained statement.'),($1,$3,'Unverified surface','unverified_against_retained_source','summary','Unverified surface')",[claim,a,b])
    await db.query("insert into claim_evidence_links(claim_id,evidence_url,linked_from_article_id) values($1,'https://first.example.invalid/source',$2)",[claim,a])
    const baseline=await articleCatalog(db,proposal)
    await check('restored table grant exposes eligible raw extraction through installed SDK despite DTO omission',async()=>{
      for(const role of ['anon','authenticated']){
        const direct=await clients[role].from('articles').select('id,claims').eq('id',a).single()
        assert.equal(direct.error,null);assert.equal(direct.data.claims[0].text,RAW)
        const detail=await readers[role].news.loadArticleDetail(a)
        assert.deepEqual(detail.claims.map(x=>x.text),['Exact retained statement.']);assert.doesNotMatch(JSON.stringify(detail),new RegExp(RAW))
        assert.equal((await clients[role].from('articles').select('id')).data.length,2)
      }
      return {synthetic_raw_column_read:true,frontend_dto_private:true,live_row_read:false}
    })
    await check('column-only revoke cannot override a whole-table SELECT grant',async()=>{
      await db.exec('revoke select(claims) on public.articles from anon,authenticated')
      for(const role of ['anon','authenticated'])assert.equal((await clients[role].from('articles').select('claims').eq('id',a).single()).data.claims[0].text,RAW)
    })
    // A no-op column REVOKE does not alter this fixture ACL baseline.
    assert.deepEqual(await articleCatalog(db,proposal),baseline)
    await check('missing or stale exact metadata preflight aborts without ACL mutation',async()=>{
      await assert.rejects(applyArticlePrivilegeProposal(db,proposal,null),/requires exact reviewed/)
      assert.deepEqual(await articleCatalog(db,proposal),baseline)
      await db.exec('alter table public.articles add column unexpected_future_extraction jsonb')
      const changed=await articleCatalog(db,proposal)
      await assert.rejects(applyArticlePrivilegeProposal(db,proposal,baseline),/baseline drift/)
      assert.deepEqual(await articleCatalog(db,proposal),changed)
      await db.exec('alter table public.articles drop column unexpected_future_extraction')
      assert.deepEqual(await articleCatalog(db,proposal),baseline)
    })
    await check('widened inherited RLS and inherited broad SELECT fail closed even with fresh metadata',async()=>{
      await db.exec('create role inherited_reader; grant inherited_reader to anon; grant select on articles to inherited_reader; create policy unsafe_inherited_reader on articles for select to inherited_reader using(true)')
      const unsafe=await articleCatalog(db,proposal)
      await assert.rejects(applyArticlePrivilegeProposal(db,proposal,unsafe),/unsupported reader RLS policy/)
      assert.deepEqual(await articleCatalog(db,proposal),unsafe)
      await db.exec('drop policy unsafe_inherited_reader on articles')
      const inherited=await articleCatalog(db,proposal)
      await assert.rejects(applyArticlePrivilegeProposal(db,proposal,inherited),/table SELECT remains/)
      assert.deepEqual(await articleCatalog(db,proposal),inherited)
      await db.exec('revoke select on articles from inherited_reader; grant select(claims) on articles to inherited_reader')
      const inheritedColumn=await articleCatalog(db,proposal)
      await assert.rejects(applyArticlePrivilegeProposal(db,proposal,inheritedColumn),/effective column privilege mismatch/)
      assert.deepEqual(await articleCatalog(db,proposal),inheritedColumn)
      await db.exec('revoke select(claims) on articles from inherited_reader; revoke inherited_reader from anon; drop role inherited_reader')
    })
    await check('PUBLIC/raw-column/grant-option and unexpected field-type authorities require separate review',async()=>{
      for(const [change,undo,pattern] of [
        ['grant select on articles to public','revoke select on articles from public',/unexpected PUBLIC SELECT/],
        ['grant select(claims) on articles to anon','revoke select(claims) on articles from anon',/unexpected existing column SELECT/],
        ['alter table articles alter column claims drop not null','alter table articles alter column claims set not null',/claims catalog prerequisite missing/],
        ['grant select on articles to authenticated with grant option','revoke grant option for select on articles from authenticated',/unsupported SELECT grantor/],
        ["alter table articles alter column feed type varchar(200)",'alter table articles alter column feed type text',/unsupported column feed/]
      ]){
        await db.exec(change);const catalog=await articleCatalog(db,proposal)
        await assert.rejects(applyArticlePrivilegeProposal(db,proposal,catalog),pattern)
        assert.deepEqual(await articleCatalog(db,proposal),catalog);await db.exec(undo)
      }
    })
    const preApply=await articleCatalog(db,proposal), preservedAcl=(await db.query(preservedAclQuery)).rows
    await check('owner applies exact reviewed proposal preserving schema, RLS, projections and nonreader authority',async()=>{
      await applyArticlePrivilegeProposal(db,proposal,preApply)
      const after=await articleCatalog(db,proposal)
      assert.deepEqual(nonReaderCatalog(after),nonReaderCatalog(preApply))
      assert.deepEqual((await db.query(preservedAclQuery)).rows,preservedAcl)
      for(const role of ['anon','authenticated']){
        assert.equal((await db.query("select has_table_privilege($1,'articles','SELECT') allowed",[role])).rows[0].allowed,false)
        const cols=(await db.query("select attname,has_column_privilege($1,'articles',attname,'SELECT') allowed from pg_attribute where attrelid='articles'::regclass and attnum>0 and not attisdropped",[role])).rows
        for(const col of cols)assert.equal(col.allowed,ARTICLE_READER_COLUMNS.includes(col.attname))
      }
      assert.equal((await db.query("select has_column_privilege('service_role','articles','id','INSERT') allowed")).rows[0].allowed,true)
      return {granted_columns:ARTICLE_READER_COLUMNS,denied_columns:after.columns.map(c=>c.name).filter(c=>!ARTICLE_READER_COLUMNS.includes(c))}
    })
    await check('SDK raw/wildcard/mixed/filter/ordering attempts are SQL-denied for both reader roles',async()=>{
      for(const role of ['anon','authenticated']){
        for(const request of [clients[role].from('articles').select('claims'),clients[role].from('articles').select('*'),clients[role].from('articles').select('id,claims'),clients[role].from('articles').select('id').eq('claims','[]'),clients[role].from('articles').select('id').order('claims')]){
          const result=await request;assert.equal(result.error?.code,'42501');assert.equal(result.data,null)
        }
        for(const table of ['claims','article_claims'])assert.equal((await clients[role].from(table).select('id')).error?.code,'42501')
        assert.equal((await clients[role].schema('evidence_pipeline').from('article_captures').select('id')).error?.code,'42501')
        assert.equal((await clients[role].schema('mip_private').from('reader_claim_surfaces').select('id')).error?.code,'42501')
        assert.equal((await clients[role].rpc('mip_pipeline_v1',{p_action:'claim',p_input:{}})).error?.code,'42501')
        for(const sql of ["select claims->0->>'text' from articles","select row_to_json(a) from articles a","select to_jsonb(a) from articles a"]){
          await assert.rejects(transport.transaction(role,()=>transport.query(role,sql)),e=>e.code==='42501')
        }
      }
    })
    await check('ordinary SDK fields, News/search/metrics/counts and governed reviewed projections remain usable',async()=>{
      for(const role of ['anon','authenticated']){
        const direct=await clients[role].from('articles').select(ARTICLE_READER_COLUMNS.join(','));assert.equal(direct.error,null);assert.equal(direct.data.length,2)
        const news=readers[role].news,page=await news.loadArticles();assert.equal(page.total,2);assert.equal(page.articlesUnavailable,null)
        assert.equal((await news.loadArticles({q:'BodyOnlyToken'})).total,1)
        assert.equal((await news.loadFilteredSourceMetricRows({q:'BodyOnlyToken'})).length,1)
        assert.equal((await news.loadCorpusMeta()).count,2);assert.equal(await news.loadNewSinceCount('2026-09-30T10:04:00Z'),2)
        const detail=await news.loadArticleDetail(a);assert.deepEqual(detail.claims.map(c=>c.text),['Exact retained statement.'])
        assert.equal(detail.evidenceRecords[0].evidence_url,'https://first.example.invalid/source');assert.deepEqual((await news.loadArticleDetail(b)).claims,[])
        const comparison=await clients[role].from('comparison_public').select('event_key,articles,claims');assert.equal(comparison.error,null);assert.equal(comparison.data.length,1);assert.doesNotMatch(JSON.stringify(comparison.data),new RegExp(RAW+'|Unverified surface'))
        assert.equal((await clients[role].from('graph_coverage_public').select('*')).error,null)
      }
      assert.equal((await clients.service_role.from('articles').select('claims').eq('id',a).single()).data.claims[0].text,RAW)
      const native=async(action,input={})=>{
        const result=await clients.service_role.rpc('mip_pipeline_v1',{p_action:action,p_input:input})
        assert.equal(result.error,null);return result.data
      }
      const job=await native('enqueue',{run_id:'column-boundary-native-control',article:{url:'https://native.example.invalid/source',title:'Synthetic native pending source',outlet:'Synthetic Native',summary:'Retained pending source.'}})
      const reserved=await native('claim');assert.equal(reserved.id,job)
      const finished=await native('finish',{job_id:reserved.id,lease_token:reserved.lease_token})
      assert.equal(finished.outcome,'inserted');assert.ok(finished.capture_id)
      assert.equal((await db.query('select review_state from evidence_pipeline.article_captures where id=$1',[finished.capture_id])).rows[0].review_state,'pending')
      for(const role of ['anon','authenticated']){
        assert.equal((await readers[role].news.loadArticles()).total,2)
        assert.equal((await readers[role].news.loadArticleDetail(finished.article_id)).articleMissing,true)
      }

    })
    await check('fresh future columns receive no ordinary-reader access',async()=>{
      await db.exec('alter table articles add column future_private_extraction jsonb')
      for(const role of ['anon','authenticated'])assert.equal((await clients[role].from('articles').select('future_private_extraction')).error?.code,'42501')
      await db.exec('alter table articles drop column future_private_extraction')
    })
    await check('rollback requires fresh post-proposal metadata and deliberately restores original broad SELECT',async()=>{
      const restricted=await articleCatalog(db,proposal)
      await assert.rejects(applyArticlePrivilegeProposal(db,rollback,preApply),/baseline drift/)
      assert.deepEqual(await articleCatalog(db,proposal),restricted)
      await applyArticlePrivilegeProposal(db,rollback,restricted)
      assert.deepEqual(nonReaderCatalog(await articleCatalog(db,proposal)),nonReaderCatalog(preApply))
      assert.deepEqual((await db.query(preservedAclQuery)).rows,preservedAcl)
      for(const role of ['anon','authenticated'])assert.equal((await clients[role].from('articles').select('claims').eq('id',a).single()).data.claims[0].text,RAW)
      return {semantic_prior_select_restored:true,raw_boundary_reopened:true,rollback_is_separately_reviewed:true}
    })
    await check('reapplication requires a fresh baseline and returns to restricted privilege boundary',async()=>{
      await applyArticlePrivilegeProposal(db,proposal,await articleCatalog(db,proposal))
      for(const role of ['anon','authenticated'])assert.equal((await clients[role].from('articles').select('claims')).error?.code,'42501')
      const final=await articleCatalog(db,proposal)
      await assert.rejects(applyArticlePrivilegeProposal(db,proposal,final),/unsupported reader authority/)
      assert.deepEqual(await articleCatalog(db,proposal),final)
    })
    const files=[proposalFile,rollbackFile,new URL('../supabase/source-proposals/article_reader_column_privileges_v1.catalog.sql',import.meta.url),new URL(import.meta.url),new URL('../scripts/mipConsolidationRestore.mjs',import.meta.url)]
    const receipt={status:'PASS',live_operations:0,source_only_not_applied:true,limits:['Synthetic reviewed rows/admin admission; not live row/API content','Restored SQL plus bounded SDK-to-SQL transport; not deployed PostgREST/JWT/grantor replay','Historical synthetic 19-column schema, not live 30-column catalog','Separate fresh reviewed exact catalog and owner execution required before any deployment'],checks,baseline_catalog:baseline,final_catalog:await articleCatalog(db,proposal),requests,executed_sql:executed,artifacts:await Promise.all(files.map(async url=>({file:url.pathname,sha256:createHash('sha256').update(await readFile(url)).digest('hex')})))}
    if(receiptPath){await mkdir(dirname(receiptPath),{recursive:true});await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n')}
    return receipt
  } finally {await db.close()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const receipt=await runArticleReaderColumnBoundary({receiptPath:process.argv[2]});console.log(JSON.stringify({status:receipt.status,checks:receipt.checks,live_operations:receipt.live_operations},null,2))}
