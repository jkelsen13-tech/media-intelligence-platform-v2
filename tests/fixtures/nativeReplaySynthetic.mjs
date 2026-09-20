import { createHash } from 'node:crypto'
export function syntheticReplayInput(count=93) {
  return { records:Array.from({length:count},(_,i)=>{
    const text=i===count-1?'Tiny.':`Ada Lovelace and Grace Hopper reviewed the synthetic research document at Example Council. Critics say Ada Lovelace could revise the synthetic research document with Grace Hopper.`
    const field=`😀 ${text} PRIVATE OUTSIDE BOUNDED SPAN`
    return {article_id:`synthetic-article-${i}`,capture_id:`synthetic-capture-${i}`,candidate_id:`synthetic-candidate-${i}`,title:`Synthetic document ${i}`,outlet:i===count-1?'Synthetic thin outlet':`Synthetic outlet ${i%4}`,url:`https://example.test/${i}`,topic:['iran','epstein','project2025'][i%3],content_hash:createHash('sha256').update(JSON.stringify({body_text:field,capture_version:1})).digest('hex'),span_start:2,span_end:2+Array.from(text).length,field_name:'body_text',field_version:'synthetic-v1',exact_excerpt:text,captured_field_text:field,rights_mode:'bounded_exact_excerpt',candidate_state:'pending',publication_allowed:false,public_admission:false}
  })}
}
