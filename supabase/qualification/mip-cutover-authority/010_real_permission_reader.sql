-- Opt-in permission component. No production migration; no real text stored here.
begin;
create table mip_identity.real_permission_captures(
 batch_id text primary key,runtime text not null,material_ref text not null,source_version text not null,
 content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'),byte_count integer not null check(byte_count>0),
 source_url text not null,selection_method text not null,observed_at timestamptz not null,
 capture_receipt_hash text not null,admission_record_hash text not null,
 check(source_url='https://creativecommons.org/licenses/by/4.0/legalcode.en'),
 check(material_ref='https://creativecommons.org/licenses/by/4.0/legalcode.en#section-1-definitions'),
 check(source_version='4.0-English-Section-1'),check(selection_method='heading-range-dom-text-v1')
);
create table mip_identity.real_permission_documents(
 batch_id text not null references mip_identity.real_permission_captures,
 kind text not null check(kind in ('policies','terms','cc0')),
 url text not null,document_hash text not null check(document_hash ~ '^[0-9a-f]{64}$'),
 clause_hash text not null check(clause_hash ~ '^[0-9a-f]{64}$'),observed_at timestamptz not null,
 effective_date_observed text,primary key(batch_id,kind),
 check((kind='policies' and url='https://creativecommons.org/policies/') or
 (kind='terms' and url='https://creativecommons.org/terms/') or
 (kind='cc0' and url='https://creativecommons.org/publicdomain/zero/1.0/legalcode.en'))
);
create table mip_identity.real_admission_versions(
 revision uuid primary key,batch_id text not null references mip_identity.real_permission_captures,
 record_ref text not null,record_hash text not null,owner_designation text not null,
 operations text[] not null,audience text not null,privacy_selection text not null,
 simulated boolean not null
);
create table mip_identity.real_admission_heads(
 batch_id text primary key references mip_identity.real_permission_captures,
 revision uuid not null references mip_identity.real_admission_versions,active boolean not null
);
create table mip_identity.real_batch_states(
 batch_id text primary key references mip_identity.real_permission_captures,closed boolean not null,
 evidence_binding text not null check(evidence_binding in ('bound','missing','conflicting','unbound'))
);
create trigger real_admission_fence before insert or update or delete on mip_identity.real_admission_heads
 for each statement execute function mip_cutover_authority.fence_publication_write();
create trigger real_admission_retirement before insert or update or delete on mip_identity.real_admission_heads
 for each row execute function mip_identity.guard_revision_reuse();
create trigger real_batch_fence before insert or update or delete on mip_identity.real_batch_states
 for each statement execute function mip_cutover_authority.fence_publication_write();

alter function mip_identity.operation_check(jsonb) rename to operation_check_synthetic_v1;
create function mip_identity.operation_check(p_scope jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c mip_identity.real_permission_captures;a mip_identity.real_admission_versions;
 h mip_identity.real_admission_heads;b mip_identity.real_batch_states;reason text:='real_evidence_bound';
begin
 if p_scope->>'source_project' is distinct from 'cc-definition-batch-v1' then
 return mip_identity.operation_check_synthetic_v1(p_scope);end if;
 perform 1 from mip_cutover_authority.publication_fence where id for share;
 select * into c from mip_identity.real_permission_captures where batch_id='cc-definition-batch-v1';
 select * into b from mip_identity.real_batch_states where batch_id=c.batch_id;
 select * into h from mip_identity.real_admission_heads where batch_id=c.batch_id;
 select * into a from mip_identity.real_admission_versions where revision=h.revision and batch_id=c.batch_id;
 if c.batch_id is null or b.batch_id is null then reason:='missing_capture_binding';
 elsif b.closed then reason:='qualification_batch_closed';
 elsif p_scope->>'material_ref' is distinct from c.material_ref or p_scope->>'material_version' is distinct from c.content_hash
 or p_scope->>'source_version' is distinct from c.source_version then reason:='material_version_mismatch';
 elsif b.evidence_binding<>'bound' then reason:='evidence_'||b.evidence_binding;
 elsif (select count(*) from mip_identity.real_permission_documents where batch_id=c.batch_id)<>3 then reason:='missing_primary_evidence';
 elsif a.revision is null or h.active is distinct from true then reason:='internal_admission_inactive';
 elsif a.simulated or a.record_hash is distinct from c.admission_record_hash
 or a.record_ref is distinct from 'cc-by-4-en-legalcode-text-only-admission-v1'
 or a.owner_designation is distinct from 'MIP platform owner' then reason:='internal_authorization_unbound';
 elsif a.privacy_selection is distinct from 'Section 1: Definitions, text only' then reason:='privacy_admission_missing';
 elsif p_scope->>'domain' is null or p_scope->>'domain' not in ('rights','privacy') or not(p_scope ? 'domain') then reason:='domain_denied';
 elsif p_scope->>'audience' is distinct from a.audience or a.audience<>'isolated_internal_review' then reason:='audience_denied';
 elsif not coalesce((p_scope->>'operation')=any(a.operations),false)
 or p_scope->>'operation' not in ('ingestion','retention','analysis','excerpt_display') then reason:='operation_denied';
 end if;
 return jsonb_build_object('allowed',reason='real_evidence_bound','reason',reason,
 'synthetic',false,'batch_id',c.batch_id,'material_hash',c.content_hash,
 'admission_revision',a.revision,'rights_basis','primary_CC0_legal_code_dedication');
end $$;
create function mip_identity.check_admitted_material(p_session uuid,p_runtime text,p_scope jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c mip_identity.real_permission_captures;result jsonb;
begin
 perform mip_identity.authorize(p_session,p_runtime,'mip_comparison_worker_v1');
 perform 1 from mip_cutover_authority.publication_fence where id for share;
 select * into c from mip_identity.real_permission_captures where batch_id=p_scope->>'source_project';
 if c.runtime is distinct from p_runtime then raise exception 'mip_permission_runtime_denied';end if;
 perform comparison_qualification.require_source_scope(p_runtime,c.batch_id);
 result:=mip_identity.operation_check(p_scope);
 perform mip_identity.authorize(p_session,p_runtime,'mip_comparison_worker_v1');
 return result;
end $$;
do $permissions$
declare t text;f text;
begin
 foreach t in array array['real_permission_captures','real_permission_documents','real_admission_versions','real_admission_heads','real_batch_states'] loop
 execute format('alter table mip_identity.%I owner to mip_cutover_schema_owner_v1',t);
 execute format('alter table mip_identity.%I enable row level security',t);
 execute format('alter table mip_identity.%I force row level security',t);
 execute format('revoke all on mip_identity.%I from public,anon,authenticated,service_role,mip_comparison_worker_v1,mip_comparison_producer_v1,mip_projection_publisher_v1',t);
 execute format('grant select on mip_identity.%I to mip_publication_owner_v2',t);
 execute format('create policy real_permission_reader on mip_identity.%I for select to mip_publication_owner_v2 using(true)',t);
 execute format('create trigger no_truncate before truncate on mip_identity.%I for each statement execute function comparison_qualification.reject_rewrite()',t);
 if t not in ('real_admission_heads','real_batch_states') then
 execute format('create trigger immutable before update or delete on mip_identity.%I for each row execute function comparison_qualification.reject_rewrite()',t);
 end if;
 end loop;
 foreach f in array array['operation_check(jsonb)','check_admitted_material(uuid,text,jsonb)'] loop
 execute 'alter function mip_identity.'||f||' owner to mip_publication_owner_v2';
 execute 'revoke all on function mip_identity.'||f||' from public,anon,authenticated,service_role';
 end loop;
end $permissions$;
grant execute on function mip_identity.check_admitted_material(uuid,text,jsonb) to mip_comparison_worker_v1;
commit;
