import { PGlite } from '@electric-sql/pglite';
import { applyFoundation, restoreEclipseInvestigation } from './mipConsolidationRestore.mjs';
import { applyStagingPage, fingerprintPayload, executeDryRun } from './mipLegacyGraphStaging.mjs';
const db = await PGlite.create();
await applyFoundation(db);
const rpc = async (action,input={}) => (await db.query('select public.mip_legacy_graph_v1($1,$2::jsonb) result',[action,JSON.stringify(input)])).rows[0].result;
const pipeline = async (action,input={}) => (await db.query('select public.mip_pipeline_v1($1,$2::jsonb) result',[action,JSON.stringify(input)])).rows[0].result;
await restoreEclipseInvestigation(db,pipeline);
const ref = 'yhbwnrtlqbjtcrrlpbge';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const rec = (table,n,payload) => ({source_project_ref:ref,source_table:table,source_id:id(n),payload:{id:id(n),...payload}});
const out = {};
const pub = (await db.query('select to_jsonb(n) payload from public.nodes n limit 1')).rows[0].payload;
out.exactPublicNode = (await applyStagingPage(db,{run_id:'probe-exact',records:[{source_project_ref:ref,source_table:'nodes',source_id:pub.id,payload:pub}]})).results[0].decision;
out.numericHashes = [];
for (const n of [0.5,1e-7,1e21]) {
 const payload={score:n};
 out.numericHashes.push({value:n,match:fingerprintPayload(payload)===(await rpc('fingerprint',{payload})).sha256});
}
try { await applyStagingPage(db,{run_id:'probe-small-number',records:[rec('nodes',1,{label:'Small score',type:'event',metadata:{score:1e-7}})]}); out.smallNumberImport='accepted'; }
catch(e){out.smallNumberImport=e.message;}
const orphan=rec('edges',2,{type:'actor'});
const applied=await applyStagingPage(db,{run_id:'probe-orphan',records:[orphan]});
out.orphanReported=applied.results[0];
out.orphanStored=(await db.query('select decision,review_state from legacy_graph_staging.staged_records where source_id=$1',[orphan.source_id])).rows[0];
out.dependencyOrders=[];
for (const reversed of [false,true]) {
 const base = reversed?20:10;
 const arc=rec('story_arcs',base,{title:'Arc with unavailable root',root_node_id:id(999)});
 const link=rec('arc_events',base+1,{arc_id:arc.source_id,node_id:pub.id});
 await applyStagingPage(db,{run_id:`probe-order-${reversed}`,records:reversed?[link,arc]:[arc,link]});
 out.dependencyOrders.push({reversed,rows:(await db.query('select source_table,decision,review_state from legacy_graph_staging.staged_records where source_id=any($1::uuid[]) order by source_table',[[arc.source_id,link.source_id]])).rows});
}
const source=rec('nodes',30,{label:'Mapped node',type:'event'});
const mapping={source_project_ref:ref,source_table:'nodes',source_id:source.source_id,target_id:id(31)};
const planned=executeDryRun({source_records:[source],destination_records:[],mappings:[mapping]});
out.mappingPlanned={decision:planned.planned[0].decision,target:planned.planned[0].proposed_target_id};
await applyStagingPage(db,{run_id:'probe-planned-mapping',records:planned.planned});
out.mappingApplied=(await db.query('select decision,proposed_target_id from legacy_graph_staging.staged_records where source_id=$1',[source.source_id])).rows[0];
await db.query('insert into public.nodes select (jsonb_populate_record(null::public.nodes,$1::jsonb)).*',[JSON.stringify({...pub,id:id(41),slug:'review-second-node'})]);
await db.query('insert into public.edges(id,source_id,target_id,type) values($1,$2,$3,$4)',[id(40),pub.id,id(41),'actor']);
const exactEdge=(await db.query('select to_jsonb(e) payload from public.edges e where id=$1',[id(40)])).rows[0].payload;
const edgeRecord={source_project_ref:ref,source_table:'edges',source_id:exactEdge.id,payload:exactEdge};
out.exactPublicEdge=(await applyStagingPage(db,{run_id:'probe-exact-edge',records:[edgeRecord]})).results[0].decision;
out.edgeOriginalPayloadPreserved=(await db.query('select payload = $1::jsonb preserved from legacy_graph_staging.staged_records where source_id=$2',[JSON.stringify(exactEdge),exactEdge.id])).rows[0].preserved;
console.log(JSON.stringify(out,null,2));
await db.close();
