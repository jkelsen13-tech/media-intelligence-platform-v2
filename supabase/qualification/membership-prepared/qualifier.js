import { createHash } from 'node:crypto'
import { pagedSelect, MEMBERSHIP_SCORER_RULE_VERSION, runMembershipRegressionSuite, scoreEventMembership, buildMembershipAuditSample } from './lib.js'
import { membershipInputFingerprint } from './membershipFingerprint.js'
const PAGE_SIZE = 500
const CHUNK = 100
const digest = value => createHash('sha256').update(value).digest('hex')
async function selectInChunks(supabase, table, cols, column, ids) {
  const out = []
  for (let offset = 0; offset < ids.length; offset += CHUNK) {
    const { data, error } = await supabase.from(table).select(cols).in(column, ids.slice(offset, offset + CHUNK))
    if (error) return { data: null, error }
    out.push(...(data ?? []))
  }
  return { data: out, error: null }
}

async function buildMembershipInputs(supabase) {
  const [eventsRes, memberRes, outletsRes] = await Promise.all([
    pagedSelect(
      supabase,
      'events',
      'id,canonical_title,status,comparison_validation_state',
      ['id'],
      PAGE_SIZE,
      (q) => q.neq('status', 'timeline_only'),
    ),
    pagedSelect(supabase, 'event_articles', 'event_id,article_id', ['event_id', 'article_id'], PAGE_SIZE),
    pagedSelect(supabase, 'articles', 'id,outlet', ['id'], PAGE_SIZE),
  ])
  const firstError = [eventsRes, memberRes, outletsRes].find((result) => result.error)?.error
  if (firstError) return { error: firstError, inputs: [] }

  const eventById = new Map((eventsRes.data ?? []).map((event) => [event.id, event]))
  const outletByArticleId = new Map((outletsRes.data ?? []).map((article) => [article.id, article.outlet]))
  const memberIdsByEvent = new Map()
  for (const member of memberRes.data ?? []) {
    if (!eventById.has(member.event_id)) continue
    const ids = memberIdsByEvent.get(member.event_id) ?? []
    ids.push(member.article_id)
    memberIdsByEvent.set(member.event_id, ids)
  }
  const candidateEventIds = [...memberIdsByEvent.entries()]
    .filter(([, articleIds]) => new Set(articleIds.map((articleId) => outletByArticleId.get(articleId)).filter(Boolean)).size >= 2)
    .map(([eventId]) => eventId)
  const candidateArticleIds = [...new Set(candidateEventIds.flatMap((eventId) => memberIdsByEvent.get(eventId) ?? []))]
  const articlesRes = await selectInChunks(
    supabase,
    'articles',
    'id,outlet,title,url,summary,body_text,published_at,claims,embedding,unattributed,monoculture,is_digest',
    'id',
    candidateArticleIds,
  )
  if (articlesRes.error) return { error: articlesRes.error, inputs: [] }
  const articleById = new Map((articlesRes.data ?? []).map((article) => [article.id, article]))
  return {
    error: null,
    inputs: candidateEventIds.map((eventId) => ({
      event: eventById.get(eventId),
      members: (memberIdsByEvent.get(eventId) ?? []).map((articleId) => ({ article: articleById.get(articleId) })).filter((member) => member.article),
    })),
  }
}

async function membershipReleaseGate(supabase, fixturePassed) {
  const { data, error } = await supabase.from('source_comparison_membership_release_policy')
    .select('fixture_passed,auto_approval_enabled,auto_approval_threshold')
    .eq('model_version', MEMBERSHIP_SCORER_RULE_VERSION).maybeSingle()
  if (error) return { error, gate: null }
  return {
    error: null,
    gate: {
      fixturePassed: fixturePassed && !!data?.fixture_passed,
      autoApprovalEnabled: !!data?.auto_approval_enabled,
      autoApprovalThreshold: data?.auto_approval_threshold === null || data?.auto_approval_threshold === undefined
        ? null : Number(data.auto_approval_threshold),
    },
  }
}


export async function runQualification(supabase) {
  const fixtures = runMembershipRegressionSuite()
  if (!fixtures.passed) throw new Error('regression fixtures failed')
  const prepared = await buildMembershipInputs(supabase)
  if (prepared.error) throw new Error('input read failed')
  const policy = await membershipReleaseGate(supabase, fixtures.passed)
  if (policy.error) throw new Error('policy read failed')
  const started = performance.now()
  const scored = prepared.inputs.map(input => {
    const score = scoreEventMembership(input.event, input.members, policy.gate ?? {})
    const fingerprint = membershipInputFingerprint(input, score.release_gate)
    return {...score, membership_fingerprint: fingerprint, membership_fingerprint_hash: digest(fingerprint)}
  })
  const elapsed = performance.now() - started
  const audit = buildMembershipAuditSample(scored, {
    lowConfidence: 0.70, highSampleSize: 25,
    seed: 'membership-audit:' + MEMBERSHIP_SCORER_RULE_VERSION,
  })
  return {
    contract: 'mip-membership-readonly-qualification-v1',
    dry_run: true, persisted: false, acknowledged: false,
    model_version: MEMBERSHIP_SCORER_RULE_VERSION,
    candidates_scored: scored.length,
    memberships: prepared.inputs.reduce((n,input)=>n+input.members.length,0),
    maximum_members: Math.max(0,...prepared.inputs.map(input=>input.members.length)),
    directed_pairs: prepared.inputs.reduce((n,input)=>n+input.members.length*(input.members.length-1),0),
    rejected_candidates: scored.filter(score=>score.decision==='rejected').length,
    candidate_clusters: scored.filter(score=>score.decision==='candidate').length,
    auto_approval_candidates: scored.filter(score=>score.eligible_for_auto_approval).length,
    release_gate: policy.gate,
    audit_population: audit.population, audit_sample_size: audit.sample.length,
    ordered_score_sha256: digest(JSON.stringify(scored)),
    score_elapsed_ms: elapsed,
    observation_note: 'Paginated current reads; not an atomic retained snapshot or as-known-then reconstruction.',
  }
}

export function createQualificationHandler({supabase, serviceKey}) {
  const response=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}})
  return async req => {
    if(req.method!=='POST') return response(405,{error:'POST only'})
    if(!serviceKey) return response(500,{error:'configuration unavailable'})
    let authorized=req.headers.get('authorization')==='Bearer '+serviceKey
    if(!authorized) {
      const token=req.headers.get('x-source-comparison-scheduler-token')
      if(token) {
        try {
          const result=await supabase.rpc('mip_source_comparison_schedule_authorized',{p_token:token})
          authorized=!result.error && result.data===true
        } catch { authorized=false }
      }
    }
    if(!authorized) return response(401,{error:'unauthorized'})
    let body
    try { body=await req.json() } catch { return response(400,{error:'explicit dry run required'}) }
    if(!body || body.mode!=='membership_score' || body.dry_run!==true ||
       Object.keys(body).some(key=>!['mode','dry_run'].includes(key))) {
      return response(400,{error:'only explicit membership_score dry_run is supported'})
    }
    try { return response(200,await runQualification(supabase)) }
    catch { return response(500,{error:'qualification failed; no writes requested'}) }
  }
}
