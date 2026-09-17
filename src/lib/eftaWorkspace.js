// Pure presentation adapter. Only the authorized native reader may supply this contract.
export function eftaWorkspace(payload) {
 if (payload?.contract !== 'efta-private-review-v1' || payload.state!=='private_review' ||
 payload.public_release!==false || !payload.receipt_id || !payload.payload_hash ||
 !Array.isArray(payload.sources) || payload.world_view?.state!=='absent') throw Error('efta_reader_contract');
 const seen=new Set(),entities=new Map(),events=new Map(),sources=[],claims=[],edges=[];
 for(const s of payload.sources) {
  const e=s.review?.entity,t=s.review?.event_time;
  if (!s.review?.identity_resolution_id || !s.decision_id || !s.candidate_id || seen.has(s.candidate_id) || !s.capture_id || !s.article_id ||
      !s.remaining_uncertainty || !s.content_hash || !s.excerpt || !s.source_field || !s.review?.uncertainty ||
      e?.kind!=='institution' || !e.namespace || !e.id || !e.resolution_ref || !t?.date ||
      !t.evidence_basis || t.precision!=='day' || s.review.publication_allowed!==false) throw Error('efta_reader_binding');
  seen.add(s.candidate_id);
  const entityId=e.namespace+':'+e.id,eventId='efta:event:'+s.dependency_id,sourceId='efta:capture:'+s.capture_id,claimId='efta:claim:'+s.candidate_id;
  if(entities.has(entityId) && JSON.stringify(entities.get(entityId).identity)!==JSON.stringify(e)) throw Error('efta_identity_conflict');
  entities.set(entityId,{id:entityId,type:'institution',label:e.label,identity:e});
  if(events.has(eventId) && events.get(eventId).date!==t.date) throw Error('efta_event_time_conflict');
  events.set(eventId,{id:eventId,type:'event',label:s.dependency_id,date:t.date,basis:t.evidence_basis,uncertainty:t.uncertainty});
  sources.push({...s,id:sourceId,event_id:eventId,claim_id:claimId,entity_id:entityId});
  claims.push({id:claimId,type:'attributed_statement',text:s.statement,semantic_kind:s.semantic_kind,source_id:sourceId,event_id:eventId,entity_id:entityId,uncertainty:s.remaining_uncertainty});
  edges.push({from:claimId,to:entityId,type:'attributed_to'},{from:claimId,to:sourceId,type:'exact_evidence'},{from:sourceId,to:eventId,type:'documents'});
 }
 return {receipt_id:payload.receipt_id,payload_hash:payload.payload_hash,sources,claims,
 graph:{nodes:[...entities.values(),...events.values(),...claims,...sources.map(s=>({id:s.id,type:'retained_source',label:s.url}))],edges},
 timeline:[...events.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id)),
 arc:{id:'efta:arc:disclosure-accounting',type:'reviewed_research_collection',members:[...events.keys()]},
 comparison:{state:'unavailable',reason:'Approved comparison gates remain unsatisfied. The January 30 DOJ pair shares one origin and is not independent corroboration.'},
 world_view:{state:'absent',reason:'No reviewed geography'}};
}
