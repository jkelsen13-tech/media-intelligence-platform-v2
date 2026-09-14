// Synthetic UI only. No backend, credentials, source text or production route.
import React from 'react'
import {createRoot} from 'react-dom/client'
import Ledger from '../../src/components/HypothesisGenerationLedger.jsx'
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const row=(n,state,extra={})=>({generation_id:id(n),request_id:id(n+10),workspace_version_id:id(3),
 observation_id:id(4),predecessor_id:null,input_hash:'a'.repeat(64),method_revision:id(5),
 implementation:'synthetic-method',state,recorded_at:'2026-09-13T12:00:00.123456Z',
 lease_expired:state==='processing',retained_for_reconciliation:true,block_reason:null,
 completed_revision_id:null,recovery_prior_generation_id:null,recovery_generation_id:null,...extra})
const data={contract_version:'mip_hypothesis_generation_backlog_v2',investigation_id:id(1),
 entries:[row(21,'processing',{recovery_generation_id:id(22)}),row(22,'pending',{recovery_prior_generation_id:id(21)}),row(23,'failed')],
 coverage:'retained_generation_jobs',current_authority_qualified:false,automatic_retry:false,force_cancellation:false,publication_allowed:false}
window.synthetic={calls:0,recoveries:[],mode:'ready'}
const client={generationBacklog:async()=>{window.synthetic.calls++;if(window.synthetic.mode==='denied')return{error:{code:'access_denied'}}
 return{data:structuredClone(data)}}}
const root=createRoot(document.getElementById('root'))
window.renderSynthetic=(scope='synthetic-reviewer')=>root.render(<main className="piw"><Ledger client={client}
 investigationId={id(1)} userScopeKey={scope} onRecover={id=>window.synthetic.recoveries.push(id)}/></main>)
window.renderSynthetic()
