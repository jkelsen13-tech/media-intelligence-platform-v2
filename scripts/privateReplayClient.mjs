export const PRIVATE_REPLAY_PATH='/private/native-replay.json'
export function replaySearchHint(replay) {
  return replay ? 'Local receipt metadata search only; bounded retained excerpts are available in Evidence and Source Comparison, but are not searched here.' : 'Local metadata search; exact retained text is unavailable'
}
export async function loadPrivateReplay(sources, fetcher=fetch) {
  try {
    const response=await fetcher(PRIVATE_REPLAY_PATH,{cache:'no-store',credentials:'same-origin',redirect:'error'})
    if(!response.ok) return null
    const r=await response.json()
    if(r.contract!=='private-native-offline-replay-v1'||r.publication_allowed!==false||r.public_admission!==false||r.review_state!=='pending'||r.candidates?.length!==sources.length) return null
    const known=new Map(sources.map(s=>[s.capture_id,s]))
    for(const c of r.candidates) { const s=known.get(c.capture_id); if(!s||s.article_id!==c.article_id||s.candidate_id!==c.candidate_id||s.content_hash!==c.content_hash||s.span_start!==c.span_start||s.span_end!==c.span_end||c.publication_allowed!==false||c.review_state!=='pending')return null;known.delete(c.capture_id) }
    if(known.size!==0)return null
    // Date precision is frozen receipt metadata, not a derivation from the excerpt.
    return {...r,candidates:r.candidates.map(c=>({...c,publication_precision:c.publication_precision??sources.find(s=>s.capture_id===c.capture_id)?.publication_precision??null}))}
  } catch { return null }
}
export function replayGraph(replay,sources) {
  const byCapture=new Map(sources.map(s=>[s.capture_id,s]))
  const nodes=sources.map(s=>({id:s.preview_id,label:s.title,type:'document',capture_id:s.capture_id}))
  const edges=[]
  for(const c of replay.clusters) {
    const members=c.capture_ids.filter(id=>byCapture.has(id))
    if(members.length<2)continue
    nodes.push({id:c.id,label:`Pending ${c.method==='native_lexical_claim_group'?'lexical':'entity-overlap'} candidate cluster`,type:'document',metadata:{demo_semantics:'candidate_cluster_not_accepted_event'}})
    for(const id of members)edges.push({id:`${c.id}:${id}`,source:byCapture.get(id).preview_id,target:c.id,type:'analytical_candidate',label:'pending candidate membership',substantive:false,corroborative:false,publication_allowed:false})
  }
  for(const d of replay.dependencies)if(d.capture_ids.every(id=>byCapture.has(id)))edges.push({id:d.id,source:byCapture.get(d.capture_ids[0]).preview_id,target:byCapture.get(d.capture_ids[1]).preview_id,type:'analytical_candidate',label:'pending dependency evidence',substantive:false,corroborative:false,publication_allowed:false})
  return {nodes,edges}
}
