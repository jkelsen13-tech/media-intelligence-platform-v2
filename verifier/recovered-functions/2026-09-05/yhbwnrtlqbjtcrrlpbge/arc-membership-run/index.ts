import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  ARC_MEMBERSHIP_SCORER_RULE_VERSION,
  buildArcMembershipAuditSample,
  runArcMembershipRegressionSuite,
  scoreArcMembership,
} from './lib.js'
import { authorizeArcMembershipRunner, sha256Hex } from './auth.js'

const JSON_HEADERS = { 'content-type': 'application/json' }
const CHUNK = 100

function json(status: number, body: unknown) { return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS }) }
function fingerprintFor(candidate: any, article: any, arc: any, members: any[], candidateEntities: any[], arcEntities: any[]) {
  return JSON.stringify({
    candidate_id: candidate.id,
    article: { id: article.id, title: article.title ?? null, summary: article.summary ?? null, url: article.url ?? null, published_at: article.published_at ?? null },
    arc: { id: arc.id, title: arc.title, summary: arc.summary ?? null, last_update_at: arc.last_update_at ?? null },
    members: members.map((member) => ({ id: member.id, title: member.title ?? null, url: member.url ?? null, published_at: member.published_at ?? null })).sort((a, b) => String(a.id).localeCompare(String(b.id))),
    candidate_entities: candidateEntities.map((entity) => entity.id).sort(),
    arc_entities: arcEntities.map((entity) => entity.id).sort(),
  })
}
async function selectInChunks(supabase: any, table: string, fields: string, column: string, ids: string[]) {
  const out: any[] = []
  for (let offset = 0; offset < ids.length; offset += CHUNK) {
    const { data, error } = await supabase.from(table).select(fields).in(column, ids.slice(offset, offset + CHUNK))
    if (error) return { data: null, error }
    out.push(...(data ?? []))
  }
  return { data: out, error: null }
}
async function buildInputs(supabase: any, limit: number) {
  const { data: candidates, error: candidateError } = await supabase
    .from('arc_membership_candidates')
    .select('id,article_id,arc_id,state,updated_at,generation_method,generation_evidence')
    .in('state', ['pending', 'rejected', 'invalidated'])
    .order('updated_at', { ascending: true })
    .limit(limit)
  if (candidateError) return { error: candidateError, inputs: [] }
  const candidateRows = candidates ?? []
  const articleIds = [...new Set(candidateRows.map((candidate: any) => candidate.article_id))]
  const arcIds = [...new Set(candidateRows.map((candidate: any) => candidate.arc_id))]
  const [articlesRes, arcsRes, membersRes] = await Promise.all([
    selectInChunks(supabase, 'articles', 'id,title,summary,body_text,url,published_at,outlet,arc_id', 'id', articleIds),
    selectInChunks(supabase, 'story_arcs', 'id,title,summary,started_at,last_update_at,category', 'id', arcIds),
    selectInChunks(supabase, 'articles', 'id,title,summary,body_text,url,published_at,outlet,arc_id', 'arc_id', arcIds),
  ])
  const firstError = [articlesRes, arcsRes, membersRes].find((result: any) => result.error)?.error
  if (firstError) return { error: firstError, inputs: [] }
  const allArticleIds = [...new Set([...(articlesRes.data ?? []).map((article: any) => article.id), ...(membersRes.data ?? []).map((article: any) => article.id)])]
  const entitiesRes = await selectInChunks(supabase, 'article_entities', 'article_id,entity_id,confidence', 'article_id', allArticleIds)
  if (entitiesRes.error) return { error: entitiesRes.error, inputs: [] }
  const configuredFloorRes = await supabase.from('pipeline_config').select('value').eq('key', 'entity_resolve_min_confidence').maybeSingle()
  if (configuredFloorRes.error) return { error: configuredFloorRes.error, inputs: [] }
  const entityFloor = Number(configuredFloorRes.data?.value ?? 0.70)
  const articleById = new Map((articlesRes.data ?? []).map((article: any) => [article.id, article]))
  const arcById = new Map((arcsRes.data ?? []).map((arc: any) => [arc.id, arc]))
  const membersByArc = new Map<string, any[]>()
  for (const member of membersRes.data ?? []) {
    const list = membersByArc.get(member.arc_id) ?? []
    list.push(member)
    membersByArc.set(member.arc_id, list)
  }
  const entitiesByArticle = new Map<string, any[]>()
  for (const relation of entitiesRes.data ?? []) {
    if (Number(relation.confidence) < entityFloor) continue
    const list = entitiesByArticle.get(relation.article_id) ?? []
    list.push({ id: relation.entity_id, confidence: Number(relation.confidence) })
    entitiesByArticle.set(relation.article_id, list)
  }
  const inputs = candidateRows.map((candidate: any) => {
    const article = articleById.get(candidate.article_id)
    const arc = arcById.get(candidate.arc_id)
    const members = (membersByArc.get(candidate.arc_id) ?? []).filter((member) => member.id !== candidate.article_id)
    const candidateEntities = entitiesByArticle.get(candidate.article_id) ?? []
    const arcEntities = [...new Map(members.flatMap((member) => entitiesByArticle.get(member.id) ?? []).map((entity) => [entity.id, entity])).values()]
    return { candidate, article, arc, members, candidateEntities, arcEntities }
  }).filter((input: any) => input.article && input.arc)
  return { error: null, inputs }
}
async function releaseGate(supabase: any) {
  const { data, error } = await supabase.from('arc_membership_release_policy')
    .select('fixture_passed,auto_approval_enabled,auto_approval_threshold')
    .eq('model_version', ARC_MEMBERSHIP_SCORER_RULE_VERSION).maybeSingle()
  if (error) return { error, gate: null }
  return { error: null, gate: { fixture_passed: !!data?.fixture_passed, auto_approval_enabled: !!data?.auto_approval_enabled, auto_approval_threshold: data?.auto_approval_threshold ?? null } }
}
async function writeScores(supabase: any, inputs: any[], dryRun: boolean, options: any) {
  const suite = runArcMembershipRegressionSuite()
  if (!suite.passed) return { error: 'arc membership regression suite failed; no candidate score may be persisted or approved' }
  const policy = await releaseGate(supabase)
  if (policy.error) return { error: policy.error.message }
  const scored = [] as any[]
  for (const input of inputs) {
    const fingerprint = fingerprintFor(input.candidate, input.article, input.arc, input.members, input.candidateEntities, input.arcEntities)
    const fingerprintHash = await sha256Hex(fingerprint)
    const score = scoreArcMembership(input.article, input.arc, input.members, input.candidateEntities, input.arcEntities, policy.gate ?? {})
    scored.push({ ...score, candidate_id: input.candidate.id, membership_fingerprint: fingerprint, membership_fingerprint_hash: fingerprintHash, input })
  }
  const auditPlan = buildArcMembershipAuditSample(scored, {
    lowConfidence: Number(options.low_confidence_cutoff ?? 0.70),
    highSampleSize: Number(options.high_confidence_sample_size ?? 30),
    seed: String(options.audit_seed ?? `arc-membership-audit:${ARC_MEMBERSHIP_SCORER_RULE_VERSION}`),
  })
  const summary = {
    dry_run: dryRun,
    model_version: ARC_MEMBERSHIP_SCORER_RULE_VERSION,
    regression_fixtures: suite.fixtures.map((fixture) => ({ fixture: fixture.fixture, passed: fixture.passed, cluster_confidence: fixture.result.cluster_confidence })),
    candidates_scored: scored.length,
    rejected_candidates: scored.filter((score) => score.decision === 'rejected').length,
    candidate_clusters: scored.filter((score) => score.decision === 'candidate').length,
    audit_population: auditPlan.population,
    audit_sample_size: auditPlan.sample.length,
    audit_seed: auditPlan.seed,
    release_gate: policy.gate,
    auto_approval_candidates: scored.filter((score) => score.eligible_for_auto_approval).length,
  }
  if (dryRun) return { data: { ...summary, scores: scored } }
  for (const score of scored) {
    const { data: updatedCandidate, error: updateError } = await supabase.from('arc_membership_candidates')
      .update({ state: score.decision === 'rejected' ? 'rejected' : 'pending', membership_fingerprint: score.membership_fingerprint, membership_fingerprint_hash: score.membership_fingerprint_hash, invalidated_at: null })
      .eq('id', score.candidate_id).select('updated_at').single()
    if (updateError) return { error: `candidate score-state update failed: ${updateError.message}` }
    score.candidate_updated_at = updatedCandidate.updated_at
  }
  const scoreRows = scored.map((score) => ({
    candidate_id: score.candidate_id,
    model_version: score.model_version,
    membership_fingerprint: score.membership_fingerprint,
    membership_fingerprint_hash: score.membership_fingerprint_hash,
    candidate_updated_at: score.candidate_updated_at,
    cluster_confidence: score.cluster_confidence,
    decision: score.decision,
    hard_rejections: score.hard_rejections,
    signal_breakdown: score.signals,
    evidence: score.evidence,
    release_gate: score.release_gate,
  }))
  for (let offset = 0; offset < scoreRows.length; offset += CHUNK) {
    const { error } = await supabase.from('arc_membership_scores').upsert(scoreRows.slice(offset, offset + CHUNK), { onConflict: 'model_version,candidate_id,membership_fingerprint_hash,candidate_updated_at', ignoreDuplicates: true })
    if (error) return { error: `score persistence failed: ${error.message}` }
  }
  const { data: storedScores, error: storedError } = await selectInChunks(supabase, 'arc_membership_scores', 'id,candidate_id,membership_fingerprint_hash,candidate_updated_at', 'candidate_id', scoreRows.map((row) => row.candidate_id))
  if (storedError) return { error: `score readback failed: ${storedError.message}` }
  const scoreKey = (row: any) => `${row.candidate_id}|${row.membership_fingerprint_hash}|${new Date(row.candidate_updated_at).getTime()}`
  const scoreIdByKey = new Map((storedScores ?? []).filter((row: any) => scoreRows.some((candidate) => scoreKey(candidate) === scoreKey(row))).map((row: any) => [scoreKey(row), row.id]))
  const auditRows = auditPlan.sample.map((score) => ({
    score_id: scoreIdByKey.get(scoreKey(score)),
    candidate_id: score.candidate_id,
    model_version: score.model_version,
    cluster_confidence: score.cluster_confidence,
    audit_stratum: score.audit_stratum,
    sample_seed: auditPlan.seed,
  })).filter((row) => row.score_id)
  for (let offset = 0; offset < auditRows.length; offset += CHUNK) {
    const { error } = await supabase.from('arc_membership_audits').upsert(auditRows.slice(offset, offset + CHUNK), { onConflict: 'score_id', ignoreDuplicates: true })
    if (error) return { error: `audit queue persistence failed: ${error.message}` }
  }
  const approvable = scored.filter((score) => score.eligible_for_auto_approval)
  const approvals: any[] = []
  for (const score of approvable) {
    const { data, error } = await supabase.rpc('mip_approve_arc_membership_candidate', { p_candidate_id: score.candidate_id })
    if (error) return { error: `guarded approval failed: ${error.message}` }
    approvals.push(data)
  }
  return { data: { ...summary, scores_persisted: scoreRows.length, audits_queued: auditRows.length, events_auto_approved: approvals.length } }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' })
  const url = Deno.env.get('SUPABASE_URL'); const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return json(500, { error: 'Missing target service configuration' })
  const supabase = createClient(url, serviceKey)
  if (!await authorizeArcMembershipRunner(req, supabase, serviceKey)) return json(401, { error: 'unauthorized' })
  let body: any = {}; try { body = (await req.json()) || {} } catch { /* empty body */ }
  // An authenticated no-op proves the credential contract without reading
  // candidate inputs, running the scorer, or mutating any Arc state.
  if (body?.mode === 'auth_check') return json(200, { ok: true, mode: 'auth_check' })
  const prepared = await buildInputs(supabase, Math.min(Math.max(1, Number(body.limit ?? 1000)), 5000))
  if (prepared.error) return json(500, { error: `arc membership input read failed: ${prepared.error.message}` })
  const result = await writeScores(supabase, prepared.inputs, !!body.dry_run, body)
  return result.error ? json(500, { error: result.error }) : json(200, result.data)
})
