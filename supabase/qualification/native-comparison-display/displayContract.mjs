// Explicit private DTO. No public UUID translation, durable cache, or source-body fields.
export const DISPLAY_SCHEMA=Object.freeze({
  "contract": "text",
  "scope": "uuid",
  "binding_id": "uuid",
  "manifest_hash": "hash",
  "identity": {
    "native_generation_id": "uuid",
    "projection_id": "uuid",
    "projection_review_id": "uuid",
    "comparison_generation_id": "uuid",
    "comparison_event_id": "uuid",
    "comparison_review_revision": "uuid",
    "comparison_policy_revision": "uuid",
    "release_request": "uuid"
  },
  "private_projection": {
    "review": {
      "review_id": "uuid",
      "version": "number",
      "disposition": "text",
      "reason": "text"
    },
    "display": {
      "contract": "text",
      "projection_id": "uuid",
      "candidate_id": "uuid",
      "article_id": "uuid",
      "arc_id": "uuid",
      "node": {
        "label": "text?",
        "type": "text",
        "description": "text",
        "summary": "text",
        "confidence": "number",
        "occurred_at": "text?"
      },
      "source": {
        "outlet": "text",
        "headline": "text?",
        "url": "url",
        "published_at": "text?"
      },
      "event": {
        "title": "text?",
        "category": "text",
        "confidence": "text",
        "occurred_at": "text?",
        "description": "text"
      },
      "edge": {
        "$nullable": {
          "source_id": "uuid",
          "target_projection_id": "uuid",
          "type": "text",
          "weight": "text",
          "label": "text",
          "signal_source": "text",
          "doc_strength": "text",
          "claimed_by": "text",
          "reliability": "number",
          "counterfactual_test": "text"
        }
      },
      "milestone_outcomes": [
        {
          "milestone_id": "uuid",
          "outcome": "text"
        },
        64
      ],
      "vector": {
        "state": "text",
        "centroid_updated": "boolean"
      },
      "state": "text",
      "approval_allowed": "boolean",
      "publication_allowed": "boolean",
      "attached": "boolean"
    }
  },
  "comparison": {
    "event": {
      "id": "uuid",
      "canonical_title": "text",
      "status": "text",
      "comparison_validation_state": "text"
    },
    "sources": [
      {
        "article_id": "uuid",
        "capture_id": "uuid",
        "content_hash": "hash",
        "publisher_url": "url",
        "publisher": "text?",
        "publication": {
          "kind": "text",
          "at": "text?",
          "source_field": "text"
        }
      },
      32
    ],
    "claims": [
      {
        "event_id": "uuid",
        "claim_key": "text",
        "canonical_text": "text",
        "thin_extraction": "boolean",
        "status": "text",
        "rule_version": "text"
      },
      128
    ],
    "evidence": [
      {
        "article_id": "uuid",
        "claim_key": "text",
        "capture_id": "uuid",
        "content_hash": "hash",
        "candidate_id": "uuid",
        "source_field": "text",
        "span_start": "number",
        "span_end": "number",
        "span_units": "text",
        "excerpt": "passage",
        "field_hash": "hash",
        "extractor_version": "text",
        "candidate_review_state": "text",
        "review_revision": "uuid"
      },
      128
    ],
    "occurrence": {
      "kind": "text",
      "state": "text",
      "start": "text?",
      "end": "text?",
      "precision": "text",
      "reason": "text"
    },
    "retained_event_date_proxy": {
      "kind": "text",
      "basis": "text",
      "occurrence_verified": "boolean",
      "start": "text?",
      "end": "text?",
      "source_fields": [
        "text",
        2
      ],
      "precision": "text"
    },
    "observation": {
      "kind": "text",
      "at": "text?"
    },
    "explanations": [
      {
        "assertion_id": "text",
        "assertion_type": "text",
        "supporting_passage": "passage",
        "rule_version": "text",
        "provenance_class": "text",
        "state": "text",
        "review_status": "text",
        "reviewed_at": "text?",
        "remaining_uncertainty": "text?",
        "falsification_condition": "text"
      },
      128
    ],
    "evidence_links": [
      {
        "id": "uuid",
        "claim_key": "text",
        "linked_from_article_id": "uuid",
        "evidence_url": "url",
        "evidence_type": "text?"
      },
      128
    ],
    "corrections": [
      {
        "id": "uuid",
        "claim_key": "text",
        "correcting_article_id": "uuid",
        "correction_text": "text",
        "occurred_at": "text?"
      },
      128
    ]
  },
  "publication_allowed": "boolean",
  "attachment_allowed": "boolean"
});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH=/^[0-9a-f]{64}$/;
const refuse=()=>{throw Error('native_comparison_display_refused')};
const plain=v=>v!==null&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype;
function check(v,s,depth=0){
 if(depth>12)refuse();
 if(Array.isArray(s)){
  if(!Array.isArray(v)||v.length>s[1])refuse();
  return Object.freeze(v.map(x=>check(x,s[0],depth+1)));
 }
 if(plain(s)){
  if(Object.hasOwn(s,'$nullable'))return v===null?null:check(v,s.$nullable,depth+1);
  if(!plain(v)||Object.keys(v).length!==Object.keys(s).length||Object.keys(v).some(k=>!Object.hasOwn(s,k)))refuse();
  return Object.freeze(Object.fromEntries(Object.entries(s).map(([k,t])=>[k,check(v[k],t,depth+1)])));
 }
 let kind=s;
 if(kind.endsWith('?')){if(v===null)return null;kind=kind.slice(0,-1)}
 if(kind==='boolean'){if(typeof v!=='boolean')refuse();return v}
 if(kind==='number'){if(typeof v!=='number'||!Number.isFinite(v)||!Number.isSafeInteger(v))refuse();return v}
 if(typeof v!=='string'||Buffer.byteLength(v)>(kind==='passage'?65536:kind==='url'?2048:16384))refuse();
 if(kind==='uuid'&&!UUID.test(v)||kind==='hash'&&!HASH.test(v))refuse();
 if(kind==='url'){let u;try{u=new URL(v)}catch{refuse()}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)refuse()}
 return v;
}
export function validateDisplay(value,expected){
 if(Buffer.byteLength(JSON.stringify(value))>524288)refuse();
 const out=check(value,DISPLAY_SCHEMA);
 if(out.contract!=='native-comparison-display-private-v1'||out.scope!==expected.scope
 ||out.binding_id!==expected.binding_id||out.manifest_hash!==expected.manifest_hash
 ||out.publication_allowed!==false||out.attachment_allowed!==false)refuse();
 const p=out.private_projection,cmp=out.comparison,id=out.identity;
 if(p.review.disposition!=='accepted_private'||p.review.review_id!==id.projection_review_id
 ||p.display.projection_id!==id.projection_id||p.display.contract!=='native-private-arc-display-v1'
 ||p.display.state!=='pending_private'||p.display.approval_allowed!==false||p.display.publication_allowed!==false||p.display.attached!==false
 ||p.display.vector.state!=='absent'||p.display.vector.centroid_updated!==false
 ||cmp.event.id!==id.comparison_event_id||cmp.event.comparison_validation_state!=='approved'
 ||cmp.occurrence.state!=='unverified'||cmp.occurrence.start!==null||cmp.occurrence.end!==null
 ||cmp.occurrence.precision!=='unknown'||cmp.retained_event_date_proxy.occurrence_verified!==false
 ||cmp.sources.length<2||cmp.claims.length<1||cmp.evidence.length<1||cmp.explanations.length<1)refuse();
 const sources=new Map(cmp.sources.map(x=>[x.article_id,x]));
 const claims=new Set(cmp.claims.map(x=>x.claim_key));
 if(sources.size!==cmp.sources.length||claims.size!==cmp.claims.length||!sources.has(p.display.article_id))refuse();
 for(const c of cmp.claims)if(c.event_id!==cmp.event.id||c.status!=='active')refuse();
 for(const e of cmp.evidence){
  const source=sources.get(e.article_id);
  if(!source||!claims.has(e.claim_key)||e.capture_id!==source.capture_id||e.content_hash!==source.content_hash
  ||e.review_revision!==id.comparison_review_revision||e.span_units!=='unicode_code_points'
  ||!['title','summary','body_text'].includes(e.source_field)||e.span_start<0||e.span_end<=e.span_start||Array.from(e.excerpt).length!==e.span_end-e.span_start)refuse();
 }
 for(const x of cmp.evidence_links)if(!claims.has(x.claim_key)||!sources.has(x.linked_from_article_id))refuse();
 for(const x of cmp.corrections)if(!claims.has(x.claim_key)||!sources.has(x.correcting_article_id))refuse();
 return out;
}
// One server-returned record powers three private surfaces. The original
// publication date is a News-record date, never an inferred event occurrence.
export function buildPrivateWorkspace(value,expected){
 const checked=validateDisplay(value,expected),p=checked.private_projection.display;
 return Object.freeze({
  contract:'native-private-workspace-v1',
  selection:Object.freeze({scope:checked.scope,binding_id:checked.binding_id,manifest_hash:checked.manifest_hash}),
  comparison:checked.comparison,
  arc:Object.freeze({identity_kind:'private_projection',projection_id:p.projection_id,arc_id:p.arc_id,
   article_id:p.article_id,node:p.node,event:p.event,edge:p.edge,milestone_outcomes:p.milestone_outcomes,
   review:checked.private_projection.review,publication_allowed:false}),
  timeline:Object.freeze({identity_kind:'private_news_record',projection_id:p.projection_id,article_id:p.article_id,
   title:p.source.headline,description:p.node.description,outlet:p.source.outlet,url:p.source.url,
   publication:p.source.published_at,date_kind:'publisher_publication',event_occurrence:checked.comparison.occurrence,
   publication_allowed:false}),
  publication_allowed:false,attachment_allowed:false,
 });
}
