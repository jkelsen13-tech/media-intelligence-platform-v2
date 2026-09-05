import { PGlite } from '@electric-sql/pglite';
import { applyFoundation } from './mipConsolidationRestore.mjs';
const db = await PGlite.create();
await applyFoundation(db);
const rpcRaw = async (action, input) => (await db.query('select public.mip_legacy_graph_v1($1,$2::jsonb) result',[action,input])).rows[0].result;
const rpc = (action,input={}) => rpcRaw(action,JSON.stringify(input));
const observations = {};
observations.precisionCollision = (await db.query(`select
  '{"n":9007199254740992}'::jsonb = '{"n":9007199254740993}'::jsonb as payloads_equal,
  legacy_graph_staging.fingerprint_payload('{"n":9007199254740992}') =
  legacy_graph_staging.fingerprint_payload('{"n":9007199254740993}') as fingerprints_equal`)).rows[0];
const makeInput = (run,value) => JSON.stringify({
 run_id:run,records:[{source_project_ref:'yhbwnrtlqbjtcrrlpbge',source_table:'nodes',
 source_id:'99999999-0000-4000-8000-000000000001',
 payload:{id:'99999999-0000-4000-8000-000000000001',label:'Precision fixture',type:'event',metadata:{n:'RAW_NUMBER'}}}]
}).replace('"RAW_NUMBER"',value);
for (const [run,value] of [['precision-a','9007199254740992'],['precision-b','9007199254740993']]) {
 await rpcRaw('enqueue',makeInput(run,value));
 const claimed=await rpc('claim',{run_id:run});
 observations[run]=await rpc('finish',{job_id:claimed.id,lease_token:claimed.lease_token});
}
observations.stored=(await db.query(`select payload#>>'{metadata,n}' as exact_stored_number,
 (select count(*)::int from legacy_graph_staging.payload_versions) as versions,
 (select count(*)::int from legacy_graph_staging.record_conflicts) as conflicts
 from legacy_graph_staging.staged_records`)).rows;
console.log(JSON.stringify(observations,null,2));
await db.close();
