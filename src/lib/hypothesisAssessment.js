// Shared saved-assessment contract. Validates recorded structure, never supplies policy or scores.
import { retainedDateDisplay } from './investigationEvidenceTrail.js'
export const HYPOTHESIS_CONTRACT = 'mip_hypothesis_assessment_v1'
export const COMPARISON_COPY = Object.freeze({
  better_supported: 'One explanation is better supported by the reviewed evidence.',
  difficult_to_distinguish: 'The reviewed evidence does not clearly distinguish these explanations.',
  insufficient_to_rank: 'There is insufficient evidence to rank these explanations.',
})
const text = x => typeof x === 'string' && x.trim().length > 0
const list = x => Array.isArray(x)
const unique = xs => new Set(xs).size === xs.length
export function assessmentInstant(value) {
  if (!text(value) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value) ||
      !retainedDateDisplay(value).dateTime) return null
  const [seconds,fraction=''] = value.slice(0,-1).split('.')
  return BigInt(Date.parse(seconds+'Z'))*1000n + BigInt(fraction.padEnd(6,'0'))
}
function rating(value) {
  if (!value || !text(value.reason)) return false
  if (value.kind === 'not_estimated') return Object.keys(value).every(k=>['kind','reason'].includes(k))
  // Recorded qualitative judgments are not calibrated probabilities or approved numeric rubrics.
  return value.kind === 'qualitative' && text(value.label) && text(value.method_ref) &&
    Object.keys(value).every(k=>['kind','reason','label','method_ref'].includes(k))
}
export function validateHypothesisAssessment(r) {
  const fail = reason => ({valid:false,reason})
  if (!r || r.contract_version !== HYPOTHESIS_CONTRACT) return fail('unsupported_contract')
  if (!['id','question_id','question','method_version','model_version','revision_reason'].every(k=>text(r[k])))
    return fail('missing_identity_or_method')
  if (!Number.isSafeInteger(r.revision) || r.revision<1 || r.release_state!=='private' ||
      !['unreviewed','reviewed','review_required'].includes(r.review_state)) return fail('invalid_revision_or_review')
  if ((r.revision===1 && r.predecessor_id!==null) || (r.revision>1 && !text(r.predecessor_id)) ||
      r.predecessor_id===r.id) return fail('invalid_predecessor')
  const cutoff=assessmentInstant(r.knowledge_cutoff), completed=assessmentInstant(r.completed_at)
  if (cutoff===null || completed===null || cutoff>completed) return fail('invalid_assessment_times')
  if (!list(r.hypotheses) || r.hypotheses.length<2 || !unique(r.hypotheses.map(h=>h?.id)) ||
      r.hypotheses.some(h=>!text(h?.id)||!text(h.definition)||!rating(h.likelihood)||!rating(h.confidence)))
    return fail('invalid_hypotheses_or_ratings')
  if (!['overlapping','mutually_exclusive','not_established'].includes(r.hypothesis_relationship))
    return fail('missing_hypothesis_relationship')
  const ids=new Set(r.hypotheses.map(h=>h.id)), c=r.comparison
  if (!c || !Object.hasOwn(COMPARISON_COPY,c.state) || !text(c.rationale) || !text(c.main_limitation) ||
      !rating(c.confidence) || !list(c.favored_ids) || !unique(c.favored_ids) ||
      c.favored_ids.some(id=>!ids.has(id)) ||
      (c.state==='better_supported' ? c.favored_ids.length<1 || c.favored_ids.length>=ids.size : c.favored_ids.length!==0))
    return fail('invalid_comparison')
  if (!list(r.evidence) || !unique(r.evidence.map(e=>e?.id))) return fail('ambiguous_evidence')
  for (const e of r.evidence) {
    const acquired=assessmentInstant(e?.acquired_at)
    if (!text(e?.id)||!text(e.material_version)||!text(e.documented_claim)||
        typeof e.input_position!=='string'||! /^[1-9][0-9]*$/.test(e.input_position) ||
        acquired===null || acquired>cutoff || !rating(e.quality) ||
        !(e.origin_group===null || text(e.origin_group))) return fail('invalid_or_future_evidence')
  }
  const evidenceIds=new Set(r.evidence.map(e=>e.id))
  if (!list(r.arguments) || !unique(r.arguments.map(a=>a?.id)) ||
      r.arguments.some(a=>!text(a?.id)||!ids.has(a.hypothesis_id)||!text(a.inference)||!text(a.limitation)||
        !['reports_allegation','supports','weakens','compatible','context'].includes(a.relation)||
        !list(a.evidence_ids)||!a.evidence_ids.length||!unique(a.evidence_ids)||
        a.evidence_ids.some(id=>!evidenceIds.has(id))||!rating(a.relevance))) return fail('invalid_argument_links')
  if (!['assumptions','gaps','change_tests'].every(k=>list(r[k]) && r[k].every(text))) return fail('missing_reasoning_sections')
  if (!['initial','new_evidence','correction','withdrawal','contradiction','shared_origin','methodology'].includes(r.revision_trigger) ||
      !['initial','changed','unchanged','less_certain'].includes(r.revision_effect) ||
      (r.revision===1 ? r.revision_trigger!=='initial'||r.revision_effect!=='initial' : r.revision_trigger==='initial'||r.revision_effect==='initial'))
    return fail('invalid_revision_cause')
  return {valid:true,reason:null}
}
export function ratingCopy(r) {
  return r?.kind==='qualitative' ? r.label : 'Not enough basis to estimate'
}
// Selection from an already authorized retained response, never from current mutable evidence.
export function selectHypothesisVersion(records,{questionId,mode,asOf}={}) {
  if (!list(records) || !['as_known_then','reconstructed_now'].includes(mode))
    return {record:null,reason:'invalid_history_request'}
  const scoped=records.filter(r=>r?.question_id===questionId)
  if (scoped.some(r=>!validateHypothesisAssessment(r).valid) || !unique(scoped.map(r=>r.id)) ||
      !unique(scoped.map(r=>r.revision))) return {record:null,reason:'ambiguous_history'}
  scoped.sort((a,b)=>a.revision-b.revision)
  if (scoped.some((r,i)=>r.revision!==i+1 || (i>0 && (r.predecessor_id!==scoped[i-1].id ||
      assessmentInstant(r.completed_at)<assessmentInstant(scoped[i-1].completed_at)))))
    return {record:null,reason:'incomplete_or_inconsistent_history'}
  const boundary=mode==='as_known_then'?assessmentInstant(asOf):null
  if (mode==='as_known_then' && boundary===null) return {record:null,reason:'invalid_history_time'}
  const eligible=scoped.filter(r=>boundary===null || assessmentInstant(r.completed_at)<=boundary)
  eligible.sort((a,b)=>a.revision-b.revision)
  return {record:eligible.at(-1)??null,reason:eligible.length?null:'no_completed_assessment',mode}
}
