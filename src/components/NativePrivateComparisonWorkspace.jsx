import {useEffect,useRef,useState} from 'react';
import {getSession,onAuthChange} from '../lib/auth.js';
import {readViteSupabaseUrl,readViteSupabaseAnonKey} from '../lib/supabaseOrigin.js';
import {createNativePrivateRead} from '../lib/nativePrivateComparisonRead.js';

const EMPTY=Object.freeze({scope:'',binding_id:'',manifest_hash:''});
const COPY={
 checking_session:'Checking your existing account session.',
 selection_required:'Enter the exact private scope, binding, and manifest hash, then load explicitly.',
 authentication_required:'Sign in through the existing account controls to request private records. Signing in does not grant admission.',
 invalid_selection:'All three exact values are required: lowercase scope UUID, binding UUID, and 64-character hexadecimal manifest hash.',
 loading:'Loading the selected private record…',
 service_unavailable:'Private display is unavailable. No record or entity absence can be inferred. The private runtime and admission must be configured before this source candidate can return records.',
 invalid_response:'The returned private record failed its display contract. No record is displayed.',
};
export function NativePrivateDisplay({workspace}){
 const {comparison:c,arc:a,timeline:t}=workspace;
 return <div data-native-private-display="true">
  <p><strong>PRIVATE · pending_private</strong> · Publication and attachment are not allowed.</p>
  <section aria-label="Private comparison">
   <h3>Private comparison: {c.event.canonical_title}</h3>
   <p>Comparison event {c.event.id} · {c.event.comparison_validation_state}. These private identifiers do not open public records.</p>
   {c.claims.map(claim=><article key={claim.claim_key}>
    <h4>{claim.canonical_text}</h4>
    <p>{claim.thin_extraction?'Thin extraction; title or summary grain.':'Retained claim text.'} Rule: {claim.rule_version}</p>
    {c.evidence.filter(e=>e.claim_key===claim.claim_key).map((e,i)=>{
     const source=c.sources.find(s=>s.article_id===e.article_id);
     return <figure key={i}>
      <blockquote style={{whiteSpace:'pre-wrap'}}>{e.excerpt}</blockquote>
      <figcaption>
       <p>{source.publisher??'Publisher not recorded'} · {source.publisher_url}</p>
       <p>Private article {e.article_id} · capture {e.capture_id} · {e.source_field} code points [{e.span_start}, {e.span_end})</p>
       <p>Content hash {e.content_hash} · field hash {e.field_hash} · extractor {e.extractor_version} · review {e.review_revision} · {e.candidate_review_state}</p>
       <p>Publication ({source.publication.kind}): {source.publication.at??'not recorded'} · {source.publication.source_field}</p>
      </figcaption>
     </figure>;
    })}
   </article>)}
   <h4>Reviewed explanations</h4>
   {c.explanations.map((x,i)=><article key={i}>
    <p>{x.assertion_type} · {x.provenance_class} · {x.state} · {x.review_status} · {x.reviewed_at??'review date not recorded'}</p>
    <blockquote style={{whiteSpace:'pre-wrap'}}>{x.supporting_passage}</blockquote>
    <p>Rule {x.rule_version} · remaining uncertainty: {x.remaining_uncertainty??'not recorded'}</p>
    <p>Falsification condition: {x.falsification_condition}</p>
   </article>)}
   <h4>Evidence links and corrections</h4>
   {c.evidence_links.map(x=><p key={x.id}>{x.claim_key}: {x.evidence_url} · {x.evidence_type??'type not recorded'} · private source {x.linked_from_article_id}</p>)}
   {c.corrections.map(x=><p key={x.id}>{x.claim_key}: {x.correction_text} · {x.occurred_at??'date not recorded'} · private source {x.correcting_article_id}</p>)}
  </section>
  <section aria-label="Private arc projection">
   <h3>Private arc projection</h3>
   <p>Private projection {a.projection_id} · private arc {a.arc_id} · {a.identity_kind}</p>
   <h4>{a.node.label??'Label not recorded'}</h4><p>{a.node.description}</p><p>{a.node.summary}</p>
   <p>{a.event.title??'Event title not recorded'} · {a.event.category} · {a.event.description}</p>
   <p>Review {a.review.review_id}, version {a.review.version}: {a.review.disposition}. {a.review.reason}</p>
   {a.edge?<p>Private proposed edge {a.edge.source_id} → {a.edge.target_projection_id}: {a.edge.label} · {a.edge.type} · {a.edge.weight}. {a.edge.counterfactual_test}</p>:<p>No proposed edge is included in this returned projection.</p>}
   <h4>Returned milestone outcomes</h4>
   {a.milestone_outcomes.map(x=><p key={x.milestone_id}>{x.milestone_id}: {x.outcome}</p>)}
  </section>
  <section aria-label="Private news record timeline">
   <h3>PRIVATE News record timeline</h3>
   <p>{t.identity_kind} · private article {t.article_id} · projection {t.projection_id}</p>
   <h4>{t.title??'Headline not recorded'}</h4><p>{t.description}</p>
   <p>{t.outlet} · {t.url}</p>
   <p>Publisher publication date: {t.publication??'not recorded'} ({t.date_kind})</p>
   <p>Event occurrence: unverified; time unknown. {t.event_occurrence.reason}</p>
   <p>Retained date proxy ({c.retained_event_date_proxy.kind}; {c.retained_event_date_proxy.basis}): {c.retained_event_date_proxy.start??'not recorded'} – {c.retained_event_date_proxy.end??'not recorded'}. This does not verify occurrence.</p>
   <p>Observation ({c.observation.kind}): {c.observation.at??'not recorded'}</p>
  </section>
 </div>;
}
// Mounted only inside the existing private workspace; no route/provider is created.
export default function NativePrivateComparisonWorkspace(){
 const [draft,setDraft]=useState({...EMPTY}),[state,setState]=useState({status:'checking_session',workspace:null});
 const controller=useRef(null);
 useEffect(()=>{
  const reader=createNativePrivateRead({getSession,onAuthChange,url:readViteSupabaseUrl(),anonKey:readViteSupabaseAnonKey()});
  controller.current=reader;const unsubscribe=reader.subscribe(setState);
  return()=>{controller.current=null;unsubscribe();reader.dispose()};
 },[]);
 function change(key,value){
  controller.current?.invalidate();
  setDraft(previous=>({...previous,[key]:value}));
 }
 return <section className="piw-card" aria-label="Private native comparison" data-native-private-workspace="true">
  <h2>Private native comparison</h2>
  <p>Explicit private binding selection. No values are inferred from public article, event, arc, or investigation IDs. This source candidate does not establish a deployed service.</p>
  <form onSubmit={event=>{event.preventDefault();void controller.current?.load(draft)}} autoComplete="off">
   {[['scope','Private scope UUID',36],['binding_id','Private binding UUID',36],['manifest_hash','Exact manifest hash',64]].map(([key,label,length])=><label key={key} className="piw-field">
    {label}<input type="text" value={draft[key]} maxLength={length} spellCheck={false} autoComplete="off" onChange={event=>change(key,event.target.value)}/>
   </label>)}
   <button type="submit" className="piw-btn" disabled={state.status==='checking_session'||state.status==='loading'}>Load selected private record</button>
   <button type="button" className="piw-btn" onClick={()=>{controller.current?.invalidate();setDraft({...EMPTY})}}>Clear private selection</button>
  </form>
  <p role="status">{COPY[state.status]??''}</p>
  {state.status==='ready'&&state.workspace?<NativePrivateDisplay workspace={state.workspace}/>:null}
 </section>;
}
