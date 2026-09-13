-- Opt-in ISOLATED extension over 007. Not a production migration.
-- Reference cache, not a new policy authority. No actual source grants are seeded.
-- Only the explicitly synthetic adapter is presently bound; real records fail closed.
begin;
create table mip_identity.operation_evidence_versions(
 revision uuid primary key, scope jsonb not null,
 authority_adapter text not null,
 source_ref text not null, source_version text not null, source_hash text not null,
 evidence_ref text not null, approval_owner_ref text not null, approval_record_ref text not null,
 approval_status text not null check(approval_status in ('recorded','proposed','missing','conflicting')),
 disposition text not null check(disposition in ('allow','deny','unknown','conflicting','withdrawn')),
 effective_at timestamptz not null check(isfinite(effective_at)),
 expires_at timestamptz not null check(isfinite(expires_at) and expires_at>effective_at),
 conditions jsonb not null check(jsonb_typeof(conditions)='array'),
 synthetic boolean not null,
 unique(scope,revision),
 check(jsonb_typeof(scope)='object' and scope ?& array['source_project','material_ref','material_version','operation','audience','domain']),
 check(scope->>'operation' in ('ingestion','retention','analysis','excerpt_display','full_content_display','redistribution','external_model_disclosure')),
 check(scope->>'domain' in ('rights','privacy')),
 check(length(scope->>'source_project')>0 and length(scope->>'material_ref')>0 and length(scope->>'material_version')>0 and length(scope->>'audience')>0)
);
create table mip_identity.operation_evidence_heads(
 scope jsonb primary key, revision uuid not null, active boolean not null,
 foreign key(scope,revision) references mip_identity.operation_evidence_versions(scope,revision)
);
create table mip_identity.review_operation_bindings(
 review_revision uuid primary key references mip_identity.publication_reviews,
 decision_revisions uuid[] not null
);
create trigger operation_fence before insert or update or delete or truncate on mip_identity.operation_evidence_heads
 for each statement execute function mip_cutover_authority.fence_publication_write();
create trigger operation_retirement before insert or update or delete on mip_identity.operation_evidence_heads
 for each row execute function mip_identity.guard_revision_reuse();
create trigger operation_no_truncate before truncate on mip_identity.operation_evidence_heads
 for each statement execute function comparison_qualification.reject_rewrite();

create function mip_identity.operation_check(p_scope jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v mip_identity.operation_evidence_versions; h mip_identity.operation_evidence_heads; reason text;
begin
 perform 1 from mip_cutover_authority.publication_fence where id for share;
 select * into h from mip_identity.operation_evidence_heads where scope=p_scope;
 if not found then return jsonb_build_object('allowed',false,'reason','missing_operation_evidence','scope',p_scope);end if;
 select * into strict v from mip_identity.operation_evidence_versions where revision=h.revision;
 if not h.active then reason:='revoked_operation_evidence';
 elsif v.approval_status<>'recorded' then reason:='approval_'||v.approval_status;
 elsif v.disposition<>'allow' then reason:='permission_'||v.disposition;
 elsif v.effective_at>clock_timestamp() then reason:='permission_not_effective';
 elsif v.expires_at<=clock_timestamp() then reason:='permission_expired';
 elsif nullif(btrim(v.source_ref),'') is null or nullif(btrim(v.source_version),'') is null
 or v.source_hash !~ '^[0-9a-f]{64}$' or nullif(btrim(v.evidence_ref),'') is null
 or nullif(btrim(v.approval_owner_ref),'') is null or nullif(btrim(v.approval_record_ref),'') is null
 then reason:='unsupported_evidence_reference';
 elsif exists(select 1 from jsonb_array_elements(v.conditions) c
 where jsonb_typeof(c)<>'object' or c->>'status' is distinct from 'verified'
 or nullif(btrim(c->>'evidence_ref'),'') is null)
 then reason:='unfulfilled_permission_condition';
 -- Strings, URLs and a database row cannot authenticate an actual permission.
 -- Binding an authoritative record reader is still required before non-synthetic use.
 elsif not v.synthetic or v.authority_adapter<>'synthetic-fixture-v1' then reason:='authoritative_adapter_unbound';
 else reason:='synthetic_mechanism_only';end if;
 return jsonb_build_object('allowed',reason='synthetic_mechanism_only','reason',reason,
 'scope',p_scope,'revision',v.revision,'synthetic',v.synthetic,'source_ref',v.source_ref,
 'source_version',v.source_version,'evidence_ref',v.evidence_ref,'approval_record_ref',v.approval_record_ref);
end $$;

alter function mip_identity.validate_review(uuid) rename to validate_review_predicates_v1;
create function mip_identity.validate_review(p_revision uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare payload jsonb;g comparison_qualification.generations; member jsonb;op text;domain text;
 scope jsonb;checked jsonb;revisions uuid[]:='{}';prior uuid[];
begin
 -- Preserve all stricter 007 evidence/privacy/correction/source and topology checks.
 payload:=mip_identity.validate_review_predicates_v1(p_revision);
 select gen.* into strict g from comparison_qualification.generations gen
 join mip_identity.publication_reviews r on r.generation_id=gen.id where r.revision=p_revision;
 for member in select distinct m.value->'article' from jsonb_array_elements(g.input_payload->'eventInputs') e
 cross join lateral jsonb_array_elements(e.value->'members') m loop
 foreach op in array array['retention','analysis','excerpt_display'] loop
 foreach domain in array array['rights','privacy'] loop
 scope:=jsonb_build_object('source_project',g.source_project,'material_ref','article:'||(member->>'id'),
 'material_version',comparison_qualification.argument_digest(member),'operation',op,'audience','isolated_internal_review','domain',domain);
 checked:=mip_identity.operation_check(scope);
 if checked->'allowed' is distinct from 'true'::jsonb then
 raise exception 'mip_operation_denied_%',checked->>'reason' using detail=checked::text;end if;
 revisions:=array_append(revisions,(checked->>'revision')::uuid);
 end loop;end loop;end loop;
 if cardinality(revisions)=0 then raise exception 'mip_operation_denied_missing_material_closure';end if;
 select array_agg(distinct r order by r) into revisions from unnest(revisions) r;
 select decision_revisions into prior from mip_identity.review_operation_bindings where review_revision=p_revision;
 if found and prior is distinct from revisions then raise exception 'mip_operation_fresh_review_required';end if;
 insert into mip_identity.review_operation_bindings values(p_revision,revisions) on conflict do nothing;
 return payload;
end $$;

do $permissions$
declare t text;f text;
begin
 foreach t in array array['operation_evidence_versions','operation_evidence_heads','review_operation_bindings'] loop
 execute format('alter table mip_identity.%I owner to mip_cutover_schema_owner_v1',t);
 execute format('alter table mip_identity.%I enable row level security',t);
 execute format('alter table mip_identity.%I force row level security',t);
 execute format('revoke all on mip_identity.%I from public,anon,authenticated,service_role,mip_comparison_worker_v1,mip_comparison_producer_v1,mip_projection_publisher_v1',t);
 execute format('grant select on mip_identity.%I to mip_publication_owner_v2',t);
 execute format('create policy operation_reader on mip_identity.%I to mip_publication_owner_v2 using(true) with check(true)',t);
 if t<>'operation_evidence_heads' then
 execute format('create trigger immutable before update or delete on mip_identity.%I for each row execute function comparison_qualification.reject_rewrite()',t);
 execute format('create trigger no_truncate before truncate on mip_identity.%I for each statement execute function comparison_qualification.reject_rewrite()',t);
 end if;
 end loop;
 foreach f in array array['operation_check(jsonb)','validate_review(uuid)','validate_review_predicates_v1(uuid)'] loop
 execute 'alter function mip_identity.'||f||' owner to mip_publication_owner_v2';
 execute 'revoke all on function mip_identity.'||f||' from public,anon,authenticated,service_role,mip_comparison_worker_v1,mip_comparison_producer_v1,mip_projection_publisher_v1';
 end loop;
end $permissions$;
grant insert on mip_identity.review_operation_bindings to mip_publication_owner_v2;
commit;
