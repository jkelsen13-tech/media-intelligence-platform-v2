import {validateHypothesisAssessment,assessmentInstant} from './hypothesisAssessment.js'
// Presentation over a currently permission-checked history view, never a rights decision.
const labels={question:'Question',hypothesis_relationship:'Relationship among explanations',
 comparison:'Saved comparison',state:'Comparison state',favored_ids:'Better-supported explanation IDs',
 rationale:'Rationale',main_limitation:'Main limitation',confidence:'Confidence in this assessment',
 likelihood:'Likelihood',definition:'Definition',evidence_ids:'Linked evidence IDs',hypothesis_id:'Explanation ID',
 inference:'Inferential connection',limitation:'Inferential limitation',relation:'Evidence relation',
 relevance:'Diagnostic relevance',quality:'Evidence quality',documented_claim:'Documented scope',
 input_position:'Retained input position',material_version:'Material version',material_hash:'Material hash',
 source_span:'Exact retained span',source_field:'Source field',start:'Start (code points)',end:'End (code points)',
 excerpt_sha256:'Excerpt hash',origin_group:'Source-origin group',acquired_at:'MIP obtained',
 published_at:'Source published',event_time:'Reported event time',knowledge_cutoff:'Evidence included through',
 method_version:'Assessment method',model_version:'Model version',review_state:'Saved review state',
 release_state:'Saved release state',assumptions:'Assumptions',gaps:'Remaining gaps',
 change_tests:'What would change this assessment',reassessment_causes:'Saved consideration of change causes',
 cause_id:'Retained cause ID',reason:'Recorded reason',kind:'Estimate type',label:'Recorded rating',method_ref:'Rating method'}
export const comparisonFieldLabel=key=>labels[key]??key.replaceAll('_',' ')
const equal=(a,b)=>{
 if(a===b)return true
 if(a===null||b===null||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false
 if(Array.isArray(a))return a.length===b.length&&a.every((v,i)=>equal(v,b[i]))
 const keys=Object.keys(a)
 return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k]))
}
const fields=(a,b,keys)=>keys.flatMap(key=>{
 const before=Object.hasOwn(a,key),after=Object.hasOwn(b,key)
 return before===after&&equal(a[key],b[key])?[]:[{key,label:comparisonFieldLabel(key),
  before:before?a[key]:null,after:after?b[key]:null,beforePresent:before,afterPresent:after}]
})
const keys=(a,b)=>[...new Set([...Object.keys(a),...Object.keys(b)])].filter(k=>k!=='id')
function entities(before,after,title){
 const a=new Map(before.map(v=>[v.id,v])),b=new Map(after.map(v=>[v.id,v]))
 return [...new Set([...a.keys(),...b.keys()])].flatMap(id=>{
  const old=a.get(id),next=b.get(id),changes=fields(old??{},next??{},keys(old??{},next??{}))
  return changes.length?[{title:title+' · '+id,status:!old?'included':!next?'omitted':'changed',changes}]:[]
 })
}
export function compareHypothesisRevisions(view,revisionId){
 const unavailable={status:'unavailable',reason:'Both linked revisions need current permission and a consistent saved history.'}
 if(!view||!Array.isArray(view.entries)||!Array.isArray(view.causes))return unavailable
 const matches=view.entries.filter(e=>e?.revision_id===revisionId)
 if(matches.length!==1)return unavailable
 const next=matches[0],previous=view.entries.find(e=>e?.revision===next.revision-1)
 if(next.status!=='available'||!validateHypothesisAssessment(next.assessment).valid||
  next.assessment.id!==next.revision_id||next.assessment.revision!==next.revision||next.assessment.completed_at!==next.completed_at)return unavailable
 if(next.revision===1)return{status:'initial'}
 if(!previous||previous.status!=='available'||!validateHypothesisAssessment(previous.assessment).valid||
  previous.assessment.id!==previous.revision_id||previous.assessment.revision!==previous.revision||previous.assessment.completed_at!==previous.completed_at||
  previous.assessment.question_id!==next.assessment.question_id||next.assessment.predecessor_id!==previous.revision_id||
  assessmentInstant(previous.assessment.completed_at)>assessmentInstant(next.assessment.completed_at)||
  view.entries.filter(e=>e?.revision===previous.revision).length!==1)return unavailable
 const pair=new Set([previous.revision_id,next.revision_id])
 if(view.causes.some(c=>pair.has(c.revision_id)&&c.kind==='permission_changed'&&c.state==='pending_explicit_reconciliation'))return unavailable
 const a=previous.assessment,b=next.assessment,groups=[]
 const add=(title,changes)=>{if(changes.length)groups.push({title,status:'changed',changes})}
 add('Assessment and comparison',fields(a,b,['question','hypothesis_relationship']).concat(fields(a.comparison,b.comparison,keys(a.comparison,b.comparison))))
 add('Method and saved state',fields(a,b,['method_version','model_version','review_state','release_state']))
 add('Evidence boundary',fields(a,b,['knowledge_cutoff']))
 groups.push(...entities(a.hypotheses,b.hypotheses,'Explanation'),...entities(a.evidence,b.evidence,'Retained evidence'),...entities(a.arguments,b.arguments,'Argument'))
 add('Assumptions, gaps and reconsideration',fields(a,b,['assumptions','gaps','change_tests','reassessment_causes']))
 // An array reorder is recorded separately; it is not new independent corroboration.
 for(const [key,title]of [['hypotheses','Explanation order'],['evidence','Evidence order'],['arguments','Argument order']]){
  const old=a[key].map(x=>x.id),next=b[key].map(x=>x.id)
  if(old.length===next.length&&old.every(id=>next.includes(id)))add(title,fields({order:old},{order:next},['order']))
 }
 return{status:'available',previous:{id:a.id,revision:a.revision,completedAt:a.completed_at},
  next:{id:b.id,revision:b.revision,completedAt:b.completed_at},trigger:b.revision_trigger,effect:b.revision_effect,
  reason:b.revision_reason,groups,pending:view.causes.filter(c=>pair.has(c.revision_id)&&c.state==='pending_explicit_reconciliation').length,
  publicationAllowed:false,isReassessment:false}
}
