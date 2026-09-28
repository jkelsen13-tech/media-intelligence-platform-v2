// GNU time process metrics are observations, never route qualification.
export function parseCapacityResource(stderr){
 const fail=()=>{throw Error('capacity_measurement_invalid')}
 if(typeof stderr!=='string'||Buffer.byteLength(stderr)>65536)fail()
 const lines=stderr.split(/\r?\n/).filter(s=>s.startsWith('CAPACITY_RESOURCE'))
 if(lines.length!==1)fail()
 const m=/^CAPACITY_RESOURCE (\d+(?:\.\d+)?) (\d+(?:\.\d+)?) (\d+) (\d+(?:\.\d+)?)$/.exec(lines[0])
 if(!m)fail()
 const metric={user_cpu_ms:Number(m[1])*1000,system_cpu_ms:Number(m[2])*1000,
  peak_rss_bytes:Number(m[3])*1024,wall_ms:Number(m[4])*1000}
 if(!Object.values(metric).every(Number.isFinite)||!Number.isSafeInteger(metric.peak_rss_bytes)||
  metric.peak_rss_bytes<=0||metric.wall_ms<=0)fail()
 return {...metric,source:'GNU time wait4; Linux KiB RSS',
  scope:'whole fresh Deno process including startup,imports,stdin,connect,invocation,close',
  edge_threshold_exceeded:metric.user_cpu_ms+metric.system_cpu_ms>=2000||metric.peak_rss_bytes>=256*1024*1024}
}


const failureStages=new Set([
 'bootstrap','input','imports','metadata_input','metadata_plan','metadata_engine',
 'metadata_admission','metadata_checkpoint','metadata_result','metadata_inventory','metadata_receipt',
 'postgres_input','postgres_connect','postgres_identity','postgres_adapter','postgres_prefix',
 'postgres_prefix_result','postgres_resume','postgres_result','postgres_receipt','postgres_close',
 'metadata_generate','metadata_child','metadata_assert','body_insert','body_acquire','body_seal',
 'body_manifest','body_readback_before','body_refusal_child','body_refusal_assert','body_transfer_child',
 'body_transfer_assert','body_retry_child','body_retry_assert','body_readback_after','body_checkpoint',
 'body_cleanup','session_cleanup','unknown'
])
const failureCodes=new Set([
 'probe_failure','assertion_failed','child_exit','child_killed','child_receipt','measurement_invalid',
 'measurement_unavailable','frozen_inventory_changed','snapshot_not_frozen','admission_mismatch',
 'route_capacity_mismatch','manifest_closure_incomplete','transfer_timed_out','adapter_operation_failed',
 'route_unqualified','capacity_unqualified','original_export_unavailable','original_export_changed',
 'object_capture_unqualified','field_contract','identity_contract','closure_contract','unit_mapping',
 'unit_conflict','checkpoint_prefix','canonical_conflict','cancelled','checkpoint_binding_changed',
 'checkpoint_not_exact_prefix','checkpoint_shape','checkpoint_outcome_unresolved','unit_commit_unresolved',
 'invocation_budget','record_set_changed','record_lineage_changed','record_byte_count','record_json_invalid',
 'record_field_drift','record_hash_changed','article_identity_changed','unknown'
])
export const capacityFailureStage=value=>failureStages.has(value)?value:'unknown'
export const capacityFailureCode=value=>failureCodes.has(value)?value:'unknown'
