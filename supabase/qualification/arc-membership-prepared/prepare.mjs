// Consistent, private, read-only preparation. No native admission or score writes.
import pg from 'pg'
import {createHash} from 'node:crypto'
import {
  ARC_MEMBERSHIP_SCORER_RULE_VERSION, scoreArcMembership,
  runArcMembershipRegressionSuite, buildArcMembershipAuditSample,
} from '../../../verifier/recovered-functions/2026-09-05/yhbwnrtlqbjtcrrlpbge/arc-membership-run/lib.js'

export const INPUT_VERSION = 'arc-membership-consumed-input-v1'
export const RECOVERED_SCORER_BLOB = '08ce23092cfbbe8dcb7eb7c26cf6e3943e177531'
export const DEFAULT_LIMITS = Object.freeze({
  candidates: 32, members: 4096, entities: 32768, page: 128,
  rowBytes: 65536, totalBytes: 4194304,
})
const HARD_LIMITS = Object.freeze({
  candidates: 64, members: 8192, entities: 65536, page: 512,
  rowBytes: 262144, totalBytes: 8388608,
})
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const HASH = /^[0-9a-f]{64}$/
const STATES = new Set(['pending','rejected','invalidated'])
const fail = code => { throw new Error('arc_prepared_' + code) }
const isId = x => typeof x === 'string' && UUID.test(x)
const keys = (row, names) => {
  if (!row || typeof row !== 'object' || Array.isArray(row)
    || Object.keys(row).sort().join('|') !== names.split('|').sort().join('|')) fail('shape')
}
const timestamp = (value, nullable=true) => {
  if (value === null && nullable) return
  if (typeof value !== 'string' || value.length > 80 || !Number.isFinite(Date.parse(value))) fail('timestamp')
}
const nullableText = value => {
  if (value !== null && typeof value !== 'string') fail('text')
}
const compare = (a,b) => a < b ? -1 : a > b ? 1 : 0
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  return value
}
const digest = value => createHash('sha256').update(JSON.stringify(canonical(value)), 'utf8').digest('hex')

function configuration({requests, limits={}, sourceKind, expectedInputHash=null, audit={}}) {
  if (sourceKind !== 'historical_public') fail('native_source_admission_unqualified')
  if (!limits || typeof limits!=='object' || Array.isArray(limits)) fail('limit')
  if (Object.keys(limits).some(key => !Object.hasOwn(DEFAULT_LIMITS,key))) fail('limit')
  const bound = {...DEFAULT_LIMITS,...limits}
  for (const key of Object.keys(bound))
    if (!Number.isSafeInteger(bound[key]) || bound[key]<1 || bound[key]>HARD_LIMITS[key]) fail('limit')
  if (!Array.isArray(requests) || !requests.length || requests.length>bound.candidates) fail('requests')
  const seen = new Set()
  const wanted = requests.map(row => {
    keys(row,'candidate_id|candidate_updated_at|article_id|arc_id')
    if (![row.candidate_id,row.article_id,row.arc_id].every(isId) || seen.has(row.candidate_id)) fail('requests')
    timestamp(row.candidate_updated_at,false)
    seen.add(row.candidate_id)
    return {...row}
  }).sort((a,b)=>compare(a.candidate_id,b.candidate_id))
  if (expectedInputHash !== null && (typeof expectedInputHash !== 'string' || !HASH.test(expectedInputHash))) fail('expected_hash')
  if (!audit || typeof audit !== 'object' || Array.isArray(audit)
    || Object.keys(audit).some(key=>!['lowConfidence','highSampleSize','seed'].includes(key))) fail('audit')
  const options = {
    lowConfidence: audit.lowConfidence ?? 0.70,
    highSampleSize: audit.highSampleSize ?? 30,
    seed: audit.seed ?? 'arc-membership-audit:' + ARC_MEMBERSHIP_SCORER_RULE_VERSION,
  }
  if (!Number.isFinite(options.lowConfidence) || options.lowConfidence<0 || options.lowConfidence>1
    || !Number.isSafeInteger(options.highSampleSize) || options.highSampleSize<0 || options.highSampleSize>64
    || typeof options.seed !== 'string' || !/^[a-zA-Z0-9:._-]{1,128}$/.test(options.seed)) fail('audit')
  return {wanted,bound,expectedInputHash,options}
}

// Every SELECT projects an explicit allowlist. SQL measures UTF-8 JSON bytes
// before returning a row; an oversize row returns only its size and NULL.
// No body_text, URL, generation_evidence, excerpt or JSON payload is fetched.
const SPECS = Object.freeze({
  candidates: {
    from:'public.arc_membership_candidates',
    columns:'id::text as id, article_id::text as article_id, arc_id::text as arc_id, state, updated_at::text as updated_at',
    where:'id = any($1::uuid[])', order:['id'],
  },
  arcs: {
    from:'public.story_arcs',
    columns:'id::text as id, title, summary, started_at::text as started_at, last_update_at::text as last_update_at',
    where:'id = any($1::uuid[])', order:['id'],
  },
  articles: {
    from:'public.articles',
    columns:'id::text as id, title, summary, published_at::text as published_at, outlet, arc_id::text as arc_id',
    where:'id = any($1::uuid[])', order:['id'],
  },
  members: {
    from:'public.articles',
    columns:'id::text as id, title, summary, published_at::text as published_at, outlet, arc_id::text as arc_id',
    where:'arc_id = any($1::uuid[])', order:['arc_id','id'],
  },
  entities: {
    from:'public.article_entities',
    columns:'article_id::text as article_id, entity_id::text as entity_id, confidence::text as confidence',
    where:'article_id = any($1::uuid[])', order:['article_id','entity_id'],
  },
})
function pageSql(name) {
  const spec = SPECS[name]
  const limitParameter = spec.order.length+2
  const bytesParameter = spec.order.length+3
  // Explicit C collation makes cursor order independent of database locale.
  const ordered = spec.order.map(key=>'r.'+key+' collate "C"').join(',')
  const cursors = spec.order.map((_,i)=>'$'+(i+2)+'::text collate "C"').join(',')
  return '/* arc-prepared:'+name+' */ with selected as (select '+spec.columns+' from '+spec.from+
    ' where '+spec.where+'), bounded as (select row_to_json(r)::jsonb as data from selected r where $2::text is null or ('+
    ordered+') > ('+cursors+') order by '+ordered+' limit $'+limitParameter+
    '), measured as (select data,octet_length(data::text)::integer as row_bytes from bounded) '+
    'select row_bytes,case when row_bytes <= $'+bytesParameter+' then data else null end as data from measured order by '+
    spec.order.map(key=>"(measured.data->>'"+key+"') collate \"C\"").join(',')
}
async function pages(db,name,ids,budget,cap) {
  const result=[], seen=new Set(), spec=SPECS[name]
  let cursor=spec.order.map(()=>null)
  for (;;) {
    const response = await db.query(pageSql(name),[ids,...cursor,budget.bound.page,budget.bound.rowBytes])
    if (!Array.isArray(response.rows) || response.rows.length>budget.bound.page) fail('page')
    for (const envelope of response.rows) {
      keys(envelope,'row_bytes|data')
      if (!Number.isSafeInteger(envelope.row_bytes) || envelope.row_bytes<1
        || envelope.row_bytes>budget.bound.rowBytes || !envelope.data) fail('row_overflow')
      budget.bytes+=envelope.row_bytes
      if (budget.bytes>budget.bound.totalBytes) fail('byte_overflow')
      const row=envelope.data
      const key=spec.order.map(k=>row[k]).join('|')
      if (spec.order.some(k=>!isId(row[k])) || seen.has(key)
        || (result.length && compare(key,spec.order.map(k=>result[result.length-1][k]).join('|'))<=0)) fail('duplicate_or_order')
      seen.add(key);result.push(row)
      if (result.length>cap) fail('row_count_overflow')
    }
    if (response.rows.length<budget.bound.page) return result
    cursor=spec.order.map(key=>result[result.length-1][key])
  }
}
async function singleton(db,name,sql,budget) {
  const result=await db.query('/* arc-prepared:'+name+' */ '+sql)
  if (!Array.isArray(result.rows) || result.rows.length>1) fail('configuration_rows')
  if (!result.rows.length) return null
  const bytes=Buffer.byteLength(JSON.stringify(result.rows[0]),'utf8')
  budget.bytes+=bytes
  if (bytes>budget.bound.rowBytes || budget.bytes>budget.bound.totalBytes) fail('byte_overflow')
  return result.rows[0]
}
function article(row) {
  keys(row,'id|title|summary|published_at|outlet|arc_id')
  if (!isId(row.id) || (row.arc_id!==null&&!isId(row.arc_id))) fail('article')
  for (const key of ['title','summary','outlet']) nullableText(row[key])
  timestamp(row.published_at)
}
function exactSet(rows,ids) {
  if (rows.length!==ids.length || rows.some(row=>!ids.includes(row.id))) fail('missing_or_foreign')
}
function finiteConfidence(value) {
  if (typeof value!=='string' || !value.trim() || !Number.isFinite(Number(value))
    || Number(value)<0 || Number(value)>1) fail('confidence')
  return Number(value)
}
async function readAndScore(db,config) {
  const {wanted,bound,options,expectedInputHash}=config
  const budget={bound,bytes:0}
  const candidates=await pages(db,'candidates',wanted.map(x=>x.candidate_id),budget,bound.candidates)
  exactSet(candidates,wanted.map(x=>x.candidate_id))
  const byRequest=new Map(wanted.map(x=>[x.candidate_id,x]))
  for (const row of candidates) {
    keys(row,'id|article_id|arc_id|state|updated_at')
    const expected=byRequest.get(row.id)
    if (!isId(row.article_id)||!isId(row.arc_id)||!STATES.has(row.state)
      || row.article_id!==expected.article_id || row.arc_id!==expected.arc_id
      || row.updated_at!==expected.candidate_updated_at) fail('stale_or_foreign_candidate')
    timestamp(row.updated_at,false)
  }
  const arcIds=[...new Set(candidates.map(x=>x.arc_id))].sort()
  const candidateArticleIds=[...new Set(candidates.map(x=>x.article_id))].sort()
  const arcs=await pages(db,'arcs',arcIds,budget,bound.candidates)
  exactSet(arcs,arcIds)
  for (const row of arcs) {
    keys(row,'id|title|summary|started_at|last_update_at')
    nullableText(row.title);nullableText(row.summary)
    timestamp(row.started_at);timestamp(row.last_update_at)
  }
  const articles=await pages(db,'articles',candidateArticleIds,budget,bound.candidates)
  exactSet(articles,candidateArticleIds);articles.forEach(article)
  const members=await pages(db,'members',arcIds,budget,bound.members)
  for (const row of members) {
    article(row)
    if (!arcIds.includes(row.arc_id)) fail('foreign_member')
  }
  const articleMap=new Map(articles.map(row=>[row.id,row]))
  for (const row of members) {
    if (articleMap.has(row.id) && digest(articleMap.get(row.id))!==digest(row)) fail('inconsistent_article')
    articleMap.set(row.id,row)
  }
  const articleIds=[...articleMap.keys()].sort()
  const entities=[]
  // Complete keyset paging inside each bounded ID chunk, not one truncated
  // PostgREST read per chunk. All chunks share the same PostgreSQL snapshot.
  for (let offset=0;offset<articleIds.length;offset+=100) {
    const chunk=articleIds.slice(offset,offset+100)
    const rows=await pages(db,'entities',chunk,budget,bound.entities-entities.length)
    for (const row of rows) {
      keys(row,'article_id|entity_id|confidence')
      if (!chunk.includes(row.article_id)||!isId(row.entity_id)) fail('foreign_entity')
      finiteConfidence(row.confidence)
    }
    entities.push(...rows)
  }
  const floorRow=await singleton(db,'floor',
    "select case when jsonb_typeof(value::jsonb) in ('number','string') and octet_length(value::text)<=256 then value #>> '{}' else null end as value from public.pipeline_config where key='entity_resolve_min_confidence' limit 2",budget)
  if (floorRow) keys(floorRow,'value')
  const floor=floorRow ? finiteConfidence(floorRow.value) : 0.70
  const gateRow=await singleton(db,'release',
    "select fixture_passed,auto_approval_enabled,case when auto_approval_threshold is null then null when octet_length(auto_approval_threshold::text)<=256 then auto_approval_threshold::text else 'invalid' end as auto_approval_threshold from public.arc_membership_release_policy where model_version='"+
    ARC_MEMBERSHIP_SCORER_RULE_VERSION+"' limit 2",budget)
  if (gateRow) {
    keys(gateRow,'fixture_passed|auto_approval_enabled|auto_approval_threshold')
    if (typeof gateRow.fixture_passed!=='boolean'||typeof gateRow.auto_approval_enabled!=='boolean') fail('release_policy')
    if (gateRow.auto_approval_threshold!==null) finiteConfidence(gateRow.auto_approval_threshold)
  }
  const gate={
    fixture_passed:gateRow?.fixture_passed??false,
    auto_approval_enabled:gateRow?.auto_approval_enabled??false,
    auto_approval_threshold:gateRow?.auto_approval_threshold===null || !gateRow
      ? null : Number(gateRow.auto_approval_threshold),
  }
  // Raw rows occur once in the transient envelope; member groups use references.
  // Configuration presence is bound, distinguishing absence from an explicit default.
  const envelope={
    version:INPUT_VERSION,source_kind:'historical_public',scorer:ARC_MEMBERSHIP_SCORER_RULE_VERSION,
    scorer_blob:RECOVERED_SCORER_BLOB,candidates,arcs,
    articles:[...articleMap.values()].sort((a,b)=>compare(a.id,b.id)),
    members:members.map(row=>({article_id:row.id,arc_id:row.arc_id})),
    entities,floor:{present:floorRow!==null,value:floor},
    release:{present:gateRow!==null,...gate},audit:options,
  }
  const inputHash=digest(envelope)
  if (expectedInputHash!==null && inputHash!==expectedInputHash) fail('stale_source')
  const arcMap=new Map(arcs.map(row=>[row.id,row]))
  const byArticle=new Map()
  for (const relation of entities) {
    if (Number(relation.confidence)<floor) continue
    const list=byArticle.get(relation.article_id)??[]
    list.push({id:relation.entity_id,confidence:Number(relation.confidence)})
    byArticle.set(relation.article_id,list)
  }
  const scores=candidates.map(candidate=>{
    const group=members.filter(row=>row.arc_id===candidate.arc_id && row.id!==candidate.article_id)
    const arcEntities=[...new Map(group.flatMap(row=>byArticle.get(row.id)??[]).map(entity=>[entity.id,entity])).values()]
    return {
      ...scoreArcMembership(articleMap.get(candidate.article_id),arcMap.get(candidate.arc_id),
        group,byArticle.get(candidate.article_id)??[],arcEntities,gate),
      candidate_id:candidate.id,candidate_updated_at:candidate.updated_at,
    }
  })
  const auditPlan=buildArcMembershipAuditSample(scores,options)
  return {
    contract:INPUT_VERSION,input_sha256:inputHash,
    source_kind:'historical_public',consistent_snapshot:true,durable:false,
    native_lineage_qualified:false,approval_allowed:false,publication_allowed:false,
    scores_persisted:false,scorer_version:ARC_MEMBERSHIP_SCORER_RULE_VERSION,
    scorer_blob:RECOVERED_SCORER_BLOB,
    counts:{candidates:candidates.length,arcs:arcs.length,articles:articleMap.size,members:members.length,entity_relations:entities.length},
    scores,audit:{population:auditPlan.population,sample:auditPlan.sample.map(row=>({
      candidate_id:row.candidate_id,audit_stratum:row.audit_stratum,
    }))},
  }
}

// A fresh Client owns the session. Never accept a pool.query transport or an
// already-open transaction. ClientClass is solely the explicit unit-test seam;
// production calls omit it. Mocked clients do not establish PostgreSQL evidence.
export async function prepareArcMembership({
  connection,requests,limits,sourceKind,expectedInputHash=null,audit,
}, {ClientClass=pg.Client}={}) {
  const config=configuration({requests,limits,sourceKind,expectedInputHash,audit})
  if (!connection || typeof connection!=='object' || Array.isArray(connection)
    || typeof connection.connectionString!=='string'
    || Object.keys(connection).some(key=>!['connectionString','ssl','connectionTimeoutMillis'].includes(key)))
    fail('connection_required')
  let target
  try { target=new URL(connection.connectionString) } catch { fail('connection_required') }
  if (!['postgres:','postgresql:'].includes(target.protocol) || !target.hostname || !target.pathname
    || target.pathname==='/' || target.hash || target.search) fail('connection_required')
  if (!runArcMembershipRegressionSuite().passed) fail('scorer_fixture')
  let db,connected=false,begun=false,committed=false,result,error
  try {
    db=new ClientClass({...connection,connectionTimeoutMillis:5000,query_timeout:10000,
      application_name:'mip-arc-prepared-readonly'})
    await db.connect();connected=true
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true
    await db.query("SET LOCAL statement_timeout='5000ms'")
    await db.query("SET LOCAL idle_in_transaction_session_timeout='15000ms'")
    await db.query("SET LOCAL timezone='UTC'")
    await db.query("SET LOCAL datestyle='ISO, YMD'")
    const identity=await db.query("/* arc-prepared:snapshot */ select current_setting('transaction_isolation') as isolation,current_setting('transaction_read_only') as read_only")
    if (identity.rows?.length!==1 || identity.rows[0].isolation!=='repeatable read'
      || identity.rows[0].read_only!=='on') fail('snapshot')
    result=await readAndScore(db,config)
    await db.query('COMMIT');committed=true
  } catch (caught) {
    error=new Error(/^arc_prepared_[a-z_]+$/.test(caught?.message??'')?caught.message:'arc_prepared_read_failed')
  } finally {
    if (begun&&!committed) try { await db.query('ROLLBACK') } catch { error=new Error('arc_prepared_rollback_failed') }
    // Close even when connect rejects; no original driver error escapes.
    if (db) try { await db.end() } catch { error=new Error('arc_prepared_close_failed') }
  }
  if (error) throw error
  if (!connected||!committed) fail('not_committed')
  return result
}

// There is no qik guarded approval contract accepting INPUT_VERSION. Legacy
// approval checks a candidate revision, not all consumed source revisions.
// Never translate this new digest into its legacy fingerprint column.
export function persistOrApprovePreparedArc() {
  fail('guarded_persistence_and_approval_unqualified')
}
