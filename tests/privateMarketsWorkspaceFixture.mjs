import {privateMarketResult,marketTestId as id} from './privateMarketsTransportFixture.mjs'
import {FIXTURE_BUNDLES,FIXTURE_USER,readInvestigationWorkspacePreview} from '../src/lib/investigationWorkspaceFixtures.js'
export const marketsOrigin='https://markets-synthetic.invalid',marketsEndpoint=marketsOrigin+'/private-markets'
export const marketsAt='2026-06-01T00:00:00.123456Z'
export const marketScope={investigation:FIXTURE_BUNDLES.comparable.investigation_id,workspace:FIXTURE_BUNDLES.comparable.version.id,
 observation:FIXTURE_BUNDLES.comparable.observation.id,event:FIXTURE_BUNDLES.comparable.version.state.canonical_subject.id}
export const marketsAuth=(token='synthetic-markets-current')=>({loading:false,user:FIXTURE_USER,
 session:{user:FIXTURE_USER,access_token:token,expires_at:Math.floor(Date.now()/1000)+3600}})
export function marketsPreview(){
 const p=readInvestigationWorkspacePreview('?privateInvestigationFixture=populated',{DEV:true}),original=p.client
 p.client={...original,read:async(...args)=>{const r=await original.read(...args);if(!r.data)return r
  const data=structuredClone(r.data);data.version.state.time_range.from=marketsAt;return {...r,data}}}
 return p
}
export function marketsResult({asset_id=null,event_id=marketScope.event,at=marketsAt}={}){
 const base=privateMarketResult(),first=base.paths[0]
 first.name='Synthetic equity instrument';first.identity_companion.name='Synthetic issuer'
 first.event_id=marketScope.event;first.hops[0].subject.name=first.name
 first.hops[0].object={id:marketScope.event,version_id:id(11),type:'event',name:'Synthetic retained event'}
 first.hops[0].support.excerpt='A 😀 B';first.hops[0].published_at='2026-01-01'
 const crypto=structuredClone(first)
 Object.assign(crypto,{asset_id:id(30),asset_version_id:id(31),asset_kind:'cryptoasset',name:'Synthetic cryptoasset',
 identity_companion:{id:id(32),version_id:id(33),type:'network',name:'Synthetic network'},asset_identifier:'synthetic-chain:asset-30',
 aliases_version_id:id(31),aliases:[{symbol:'SYN-C',namespace:'synthetic-chain',valid_from:'2026-01-01',valid_to:null}]})
 Object.assign(crypto.hops[0],{edge_id:id(34),edge_version_id:id(35),candidate_id:id(36),assessment_id:id(37),
 subject:{id:id(30),version_id:id(31),type:'cryptoasset',name:crypto.name},subject_version_id:id(31)})
 const indirect=structuredClone(first),one=indirect.hops[0],two=structuredClone(one)
 Object.assign(one,{edge_id:id(50),edge_version_id:id(51),candidate_id:id(52),assessment_id:id(53),relationship:'ownership',
 object:{id:id(54),version_id:id(55),type:'institution',name:'Synthetic intermediary'},object_version_id:id(55)})
 Object.assign(two,{edge_id:id(56),edge_version_id:id(57),candidate_id:id(58),assessment_id:id(59),relationship:'regulation',
 subject:structuredClone(one.object),subject_version_id:id(55)})
 indirect.hops.push(two);indirect.relation='connected_development'
 const secondEvent=structuredClone(first)
 secondEvent.event_id=id(40);Object.assign(secondEvent.hops[0],{edge_id:id(41),edge_version_id:id(42),candidate_id:id(43),assessment_id:id(44),
 object:{id:id(40),version_id:id(45),type:'event',name:'Second synthetic event'},object_version_id:id(45)})
 return {...base,investigation_id:marketScope.investigation,workspace_version_id:marketScope.workspace,observation_id:marketScope.observation,
 asset_id,event_id,at,paths:[first,crypto,indirect,secondEvent].filter(p=>(asset_id===null||p.asset_id===asset_id)&&(event_id===null||p.event_id===event_id))}
}
