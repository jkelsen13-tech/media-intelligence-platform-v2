-- Read-only operational ledger for the isolated generation data plane. No lease/token/source text.
set role mip_hypothesis_owner;
create function mip_hypothesis.generation_backlog(p_user uuid,p_investigation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare entries jsonb;
begin
 -- Current private investigation membership, independently of any worker lease.
 perform mip_hypothesis.read_bound_history(p_user,p_investigation);
 select coalesce(jsonb_agg(jsonb_build_object('generation_id',g.id,'request_id',g.request_id,'workspace_version_id',g.workspace_version_id,
  'observation_id',g.observation_id,'predecessor_id',g.predecessor_id,'input_hash',g.input_hash,
  'method_revision',g.method_revision,'implementation',g.implementation,'state',j.state,'recorded_at',to_char(g.recorded_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'lease_expired',j.state='processing' and j.lease_expires_at<=clock_timestamp(),
  'retained_for_reconciliation',j.state in('processing','failed') or b.generation_id is not null,
  'block_reason',b.reason,'completed_revision_id',o.assessment_revision_id)
  order by g.recorded_at,g.id),'[]'::jsonb) into entries
 from mip_hypothesis.generations g join mip_hypothesis.generation_jobs j on j.generation_id=g.id
 left join mip_hypothesis.generation_blocks b on b.generation_id=g.id
 left join mip_hypothesis.generation_outputs o on o.generation_id=g.id
 where g.investigation_id=p_investigation;
 return jsonb_build_object('contract_version','mip_hypothesis_generation_backlog_v1','investigation_id',p_investigation,
  'entries',entries,'coverage','retained_generation_jobs','current_authority_qualified',false,
  'automatic_retry',false,'force_cancellation',false,'publication_allowed',false);
end $$;
revoke all on function mip_hypothesis.generation_backlog(uuid,uuid) from public;
grant execute on function mip_hypothesis.generation_backlog(uuid,uuid) to mip_hypothesis_gateway;
reset role;
