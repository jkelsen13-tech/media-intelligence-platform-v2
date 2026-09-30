// Explicit fictional mechanism computation, NEVER a qualified analytical method.
export function syntheticEvaluation(g) {
 const count=g.spans.reduce((n,s)=>n+Array.from(s.excerpt).length,0)
 return {comparison:{state:'insufficient_to_rank',favored_ids:[],
   rationale:'Synthetic mechanism inspected '+count+' retained code points; this is not semantic qualification.',
   main_limitation:'Synthetic fixture has no qualified estimation method.'},
  evidence_claims:g.spans.map(s=>({id:s.id,documented_claim:'Synthetic retained record; no factual allegation established.'})),
  arguments:g.spans.length?[{id:'synthetic-argument',hypothesis_id:g.hypotheses[0].id,relation:'compatible',
   evidence_ids:g.spans.map(s=>s.id),inference:'Synthetic '+count+' code-point computation remains compatible with alternatives.',
   limitation:'Synthetic mechanism only.'}]:[],
  assumptions:['Synthetic mechanism only.'],gaps:['No qualified semantic method.'],change_tests:['A separately authorized evaluated method.'],
  revision_reason:'Synthetic retained-input computation.',revision_trigger:g.context.head?'methodology':'initial',
  revision_effect:g.context.head?'unchanged':'initial',
  ...(g.context.head?{reassessment_causes:g.context.backlog.causes.filter(c=>c.state==='pending_explicit_reconciliation').map(c=>({cause_id:c.cause_id,reason:'Synthetic explicit consideration, not semantic qualification.'}))}:{})}
}
