// Diagnostic reconciliation only. No database client, writes, retirement or permission authority.
export const DIGEST_METHOD = 'postgres-jsonb-utf8-sha256-sorted-row-sha256-v1';
const relations = ['ingest_sources', 'ingestion_runs', 'ingestion_source_runs'];
const hash = /^[a-f0-9]{64}$/;
const validCount = n => Number.isSafeInteger(n) && n >= 0;
export function reconcileCollectorRetention(evidence) {
  const denied = reason => ({status:'blocked', reason, retirementAuthorized:false});
  if (!evidence || evidence.method !== DIGEST_METHOD) return denied('unsupported_digest_method');
  if (!evidence.sourceProject || evidence.sourceProject !== evidence.archiveSourceProject)
    return denied('source_project_binding_missing_or_mismatched');
  if (!evidence.cutoff || !Number.isFinite(Date.parse(evidence.cutoff)) ||
      evidence.cutoff !== evidence.archiveCutoff) return denied('range_binding_missing_or_mismatched');
  if (!Array.isArray(evidence.source) || !Array.isArray(evidence.archive)) return denied('missing_observation');
  const checks=[];
  for (const relation of relations) {
    const scope=relation==='ingest_sources'?'current':'retained_time_range';
    const src=evidence.source.filter(r=>r.relation===relation && r.scope===scope);
    const dst=evidence.archive.filter(r=>r.source_relation===relation);
    if(src.length!==1 || dst.length!==1) return denied('missing_or_duplicate_relation:'+relation);
    const [s]=src,[a]=dst;
    if(!validCount(s.rows)||!validCount(a.versions)||!hash.test(s.payload_multiset_sha256??'')||
       !hash.test(a.payload_multiset_sha256??'')) return denied('invalid_count_or_digest:'+relation);
    checks.push({relation,rows:s.rows,match:s.rows===a.versions && s.payload_multiset_sha256===a.payload_multiset_sha256});
  }
  if(checks.some(c=>!c.match)) return {...denied('retained_range_mismatch'),checks};
  const deltas=[];
  for(const relation of relations.slice(1)) {
    const rows=evidence.source.filter(r=>r.relation===relation && r.scope==='after_retained_time_range');
    if(rows.length!==1 || !validCount(rows[0].rows) ||
       (rows[0].rows>0 && !hash.test(rows[0].payload_multiset_sha256??'')))
      return denied('missing_or_invalid_delta:'+relation);
    deltas.push({relation,rows:rows[0].rows});
  }
  // Matching retained rows never establish whole-backend completeness, rights or a final write fence.
  return {status:deltas.some(d=>d.rows>0)?'retained_range_matches_delta_pending':'retained_range_matches',
    checks,deltas,wholeBackendParity:false,retirementAuthorized:false};
}
