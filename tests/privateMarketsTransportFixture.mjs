export const marketTestId=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const id=marketTestId
export const privateMarketInput=()=>({investigation_id:id(1),workspace_version_id:id(2),asset_id:id(3),event_id:id(4),at:'2026-06-01T00:00:00.123456Z'})
export function privateMarketResult(){
 const input=privateMarketInput(),hash='a'.repeat(64)
 return {contract_version:'mip_markets_private_qualification_v1',...input,at:'2026-06-01T00:00:00.123456+00:00',observation_id:id(5),publication_allowed:false,historical_time_qualified:false,source_root_lineage_qualified:false,coverage:'bounded_explicit_typed_paths_only',broader_context:[],
 paths:[{asset_id:id(3),asset_version_id:id(6),asset_kind:'equity',name:'Synthetic only',identity_companion:{id:id(7),version_id:id(8),type:'actor',name:'Synthetic issuer'},asset_identifier:null,valid_from:'2026-01-01',valid_to:null,aliases_version_id:id(6),aliases:[{symbol:'SYN',namespace:'TEST',valid_from:'2026-01-01',valid_to:null}],event_id:id(4),relation:'direct_reporting',
 hops:[{edge_id:id(9),edge_version_id:id(10),subject:{id:id(3),version_id:id(6),type:'equity',name:'Synthetic only'},object:{id:id(4),version_id:id(11),type:'event',name:'Synthetic event'},subject_version_id:id(6),object_version_id:id(11),candidate_id:id(12),assessment_id:id(13),relationship:'direct_reporting',valid_from:'2026-01-01T00:00:00+00:00',valid_to:null,uncertainty:'Synthetic only',capture_id:id(14),article_id:id(15),captured_at:'2026-01-01T00:00:00+00:00',published_at:null,source_url:'https://example.invalid/synthetic',capture_payload_hash:hash,
 support:{excerpt:'A 😀 B',material_hash:hash,material_version:id(14),input_position:'1',source_field:'summary',start:0,end:5}}]}]}
}
