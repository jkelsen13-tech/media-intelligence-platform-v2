-- Immutable native/private -> accepted comparison binding. No public release.
begin;
set local lock_timeout='5s';
grant mip_arc_native_owner,mip_publication_owner_v2 to current_user with set true;
create schema mip_native_comparison authorization mip_arc_native_owner;
revoke all on schema mip_native_comparison from public,anon,authenticated,service_role;
grant usage on schema mip_native_comparison to mip_publication_owner_v2,mip_mentions_gateway;
grant create on schema mip_native_comparison to mip_publication_owner_v2;
set role mip_publication_owner_v2;
-- Acquire identity authority before native policy/scope and collector fences.
create function mip_native_comparison.authorize_session(sid uuid,runtime_name text) returns void
language plpgsql security definer set search_path='' as $authorize$
begin
 if sid is null or runtime_name is null or octet_length(runtime_name) not between 1 and 128 then
  raise exception 'native_comparison_authority';end if;
 perform mip_identity.authorize(sid,runtime_name,'mip_projection_publisher_v1');
end $authorize$;
-- This helper uses the unchanged existing publication owner's authority.
-- Nothing from the accepted reader except the explicit metadata below escapes.
create function mip_native_comparison.comparison_metadata(sid uuid,runtime_name text,release_id uuid,event_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $comparison$
declare accepted jsonb;ev jsonb;src jsonb;evi jsonb;sources jsonb:='[]';evidence jsonb:='[]';
 result jsonb;source_ids uuid[];evidence_ids uuid[];source_count integer;bytes bigint;
 generation_id uuid;review_revision uuid;one_source uuid;one_capture uuid;one_candidate uuid;event_count integer;
begin
 perform mip_native_comparison.authorize_session(sid,runtime_name);
 if release_id is null or event_id is null then raise exception 'native_comparison_shape';end if;
 -- The existing reader supplies its own current validation and broker checks.
 -- Preflight actual selected generation/review/output before its materialization.
 select r.generation_id,r.revision,
  octet_length(g.input_payload::text)+octet_length(o.output_payload::text)+
  octet_length(r.evidence::text)+octet_length(r.explanations::text)+octet_length(r.relationship_context::text)
 into generation_id,review_revision,bytes
 from mip_identity.private_releases pr
 join mip_identity.publication_reviews r on r.revision=pr.review_revision
 join mip_comparison_kernel_v1.generations g on g.id=r.generation_id
 join mip_comparison_kernel_v1.outputs o on o.generation_id=g.id
 where pr.request_id=release_id and pr.runtime=runtime_name;
 if not found or bytes is null or bytes>131072 then raise exception 'native_comparison_input_bound';end if;
 accepted:=mip_identity.read_isolated_comparison(sid,runtime_name,release_id);
 if octet_length(accepted::text)>262144
 or accepted->>'contract_version' is distinct from 'accepted-comparison-private-v2'
 or accepted->>'audience' is distinct from 'isolated_internal_review'
 or (accepted->>'generation_id')::uuid is distinct from generation_id
 or (accepted->>'review_revision')::uuid is distinct from review_revision
 or jsonb_typeof(accepted->'events') is distinct from 'array'
 or jsonb_array_length(accepted->'events') not between 1 and 32
 then raise exception 'native_comparison_reader_shape';end if;
 select count(*) into event_count from jsonb_array_elements(accepted->'events') x
 where (x.value#>>'{event,id}')::uuid=event_id;
 if event_count<>1 then raise exception 'native_comparison_event';end if;
 select x.value into strict ev from jsonb_array_elements(accepted->'events') x
 where (x.value#>>'{event,id}')::uuid=event_id;
 if jsonb_typeof(ev->'sources') is distinct from 'array' or jsonb_array_length(ev->'sources') not between 2 and 32
 or jsonb_typeof(ev->'evidence') is distinct from 'array' or jsonb_array_length(ev->'evidence') not between 1 and 128
 then raise exception 'native_comparison_event_bound';end if;
 for src in select x.value from jsonb_array_elements(ev->'sources') x order by x.value->>'article_id' loop
  one_source:=(src->>'article_id')::uuid;one_capture:=(src->>'capture_id')::uuid;
  if one_source is null or one_capture is null or src->>'content_hash' is null
   or src->>'content_hash'!~'^[0-9a-f]{64}$' or jsonb_typeof(src->'membership') is distinct from 'object' then raise exception 'native_comparison_source_shape';end if;
  sources:=sources||jsonb_build_array(jsonb_build_object('article_id',one_source,'capture_id',one_capture,
   'content_hash',src->>'content_hash','membership_hash',encode(sha256(convert_to((src->'membership')::text,'UTF8')),'hex')));
 end loop;
 select array_agg((x.value->>'article_id')::uuid order by x.value->>'article_id'),count(distinct x.value->>'article_id')
 into source_ids,source_count from jsonb_array_elements(sources)x;
 if source_count<>jsonb_array_length(sources) then raise exception 'native_comparison_source_duplicate';end if;
 for evi in select x.value from jsonb_array_elements(ev->'evidence')x
 order by x.value->>'article_id',x.value->>'candidate_id',x.value->>'claim_key' loop
  one_source:=(evi->>'article_id')::uuid;one_capture:=(evi->>'capture_id')::uuid;one_candidate:=(evi->>'candidate_id')::uuid;
  if one_source is null or one_capture is null or one_candidate is null
  or evi->>'span_units' is distinct from 'unicode_code_points'
  or evi->>'source_field' not in('title','summary','body_text')
  or evi->>'source_field' is null or evi->>'field_hash' is null or evi->>'field_hash'!~'^[0-9a-f]{64}$'
  or evi->>'content_hash' is null or evi->>'content_hash'!~'^[0-9a-f]{64}$'
  or evi->>'claim_key' is null or octet_length(evi->>'claim_key') not between 1 and 512
  or evi->>'span_start' is null or evi->>'span_start'!~'^[0-9]{1,6}$'
  or evi->>'span_end' is null or evi->>'span_end'!~'^[0-9]{1,6}$'
  or (evi->>'span_end')::integer<=(evi->>'span_start')::integer
  or not exists(select 1 from jsonb_array_elements(sources)x where
   (x.value->>'article_id')::uuid=one_source and (x.value->>'capture_id')::uuid=one_capture
   and x.value->>'content_hash'=evi->>'content_hash')
  then raise exception 'native_comparison_evidence_shape';end if;
  evidence:=evidence||jsonb_build_array(jsonb_build_object('article_id',one_source,'capture_id',one_capture,
   'candidate_id',one_candidate,'content_hash',evi->>'content_hash','source_field',evi->>'source_field',
   'field_hash',evi->>'field_hash','span_start',(evi->>'span_start')::integer,'span_end',(evi->>'span_end')::integer,
   'span_units','unicode_code_points','claim_key_hash',encode(sha256(convert_to(evi->>'claim_key','UTF8')),'hex')));
 end loop;
 select array_agg(distinct (x.value->>'article_id')::uuid order by (x.value->>'article_id')::uuid)
 into evidence_ids from jsonb_array_elements(evidence)x;
 if evidence_ids is distinct from source_ids then raise exception 'native_comparison_evidence_incomplete';end if;
 if (select count(*) from (select distinct value from jsonb_array_elements(evidence))x)<>jsonb_array_length(evidence)
 then raise exception 'native_comparison_evidence_duplicate';end if;
 result:=jsonb_build_object('generation_id',generation_id,'review_revision',review_revision,
  'policy_revision',(accepted->>'policy_revision')::uuid,'release_request',release_id,'event_id',event_id,
  'runtime_hash',encode(sha256(convert_to(runtime_name,'UTF8')),'hex'),
  'input_hash',accepted->>'input_hash','output_hash',accepted->>'output_hash',
  'approved_payload_hash',accepted->>'approved_payload_hash','sources',sources,'evidence',evidence);
 if exists(select 1 from jsonb_each_text(result) j where j.key in('input_hash','output_hash','approved_payload_hash')
 and(j.value is null or j.value!~'^[0-9a-f]{64}$')) or octet_length(result::text)>98304
 then raise exception 'native_comparison_metadata_bound';end if;
 perform mip_native_comparison.authorize_session(sid,runtime_name);
 return result;
end $comparison$;
reset role;
revoke create on schema mip_native_comparison from mip_publication_owner_v2;
set role mip_arc_native_owner;
create table mip_native_comparison.bindings(
 scope uuid not null,id uuid not null,manifest jsonb not null,
 manifest_hash text not null check(manifest_hash=encode(sha256(convert_to(manifest::text,'UTF8')),'hex')),
 principal name not null default session_user,primary key(scope,id),
 check(jsonb_typeof(manifest)='object' and octet_length(manifest::text)<=114688));
create table mip_native_comparison.revocations(
 scope uuid not null,binding_id uuid not null,principal name not null default session_user,
 primary key(scope,binding_id),foreign key(scope,binding_id) references mip_native_comparison.bindings(scope,id));
create function mip_native_comparison.collect(s uuid,pid uuid,dh text,ph text,rid uuid,sid uuid,rt text,rel uuid,ev uuid) returns jsonb
language plpgsql set search_path='' as $collect$
declare native_read jsonb;projection mip_arc_projection_private.projections;saved mip_arc_native.generations;
 comparison jsonb;refs jsonb;articles uuid[];expected uuid[];manifest jsonb;actual_count integer;
begin
 perform mip_native_comparison.authorize_session(sid,rt);
 perform mip_arc_projection_private.enter_scope(s,false);
 native_read:=mip_arc_projection_private.read_current(s,pid,dh,ph,rid);
 if native_read#>>'{review,disposition}' is distinct from 'accepted_private'
 then raise exception 'native_comparison_native_review';end if;
 select p.* into strict projection from mip_arc_projection_private.projections p where p.scope=s and p.id=pid;
 select g.* into strict saved from mip_arc_native.generations g where g.scope=s and g.id=projection.generation;
 -- Reserve existing private projection's 2MiB and this bridge's additional2MiB.
 if (saved.manifest->>'max_total_bytes')::bigint>4194304
 or (saved.manifest->>'max_hash_work_bytes')::bigint>125829120 then raise exception 'native_comparison_operation_bound';end if;
 select array_agg(distinct x order by x) into expected from(
  select (saved.manifest->>'article')::uuid x
  union all select value::uuid from jsonb_array_elements_text(saved.manifest->'members'))q;
 select jsonb_agg(jsonb_build_object('article_id',er.article,'capture_id',er.capture,'content_hash',er.content_hash,
  'job_id',sb.job) order by er.article),array_agg(er.article order by er.article),count(*)
 into refs,articles,actual_count
 from mip_arc_native.extraction_reviews er
 join lateral(select distinct b.job from mip_arc_native.scalar_bindings b
  where b.scope=s and b.article=er.article and b.capture=er.capture and b.content_hash=er.content_hash
  and b.id in(select value::uuid from jsonb_array_elements_text(saved.manifest->'scalar_binding_ids')))sb on true
 where er.scope=s and er.id in(select value::uuid from jsonb_array_elements_text(saved.manifest->'extraction_review_ids'));
 if actual_count not between 2 and 32 or articles is distinct from expected
 then raise exception 'native_comparison_native_cohort';end if;
 comparison:=mip_native_comparison.comparison_metadata(sid,rt,rel,ev);
 if (select jsonb_agg(x.value-'job_id' order by x.value->>'article_id') from jsonb_array_elements(refs)x)
 is distinct from(select jsonb_agg(x.value-'membership_hash' order by x.value->>'article_id')
 from jsonb_array_elements(comparison->'sources')x) then raise exception 'native_comparison_cohort_mismatch';end if;
 manifest:=jsonb_build_object('contract','native-comparison-binding-v1','codec','postgres17-jsonb-text-utf8-v1',
 'native',jsonb_build_object('projection_id',pid,'generation_id',projection.generation,'projection_review_id',rid,
 'dependency_hash',dh,'display_hash',ph,'input_hash',projection.input_hash,'output_hash',projection.output_hash,
 'score_review_id',projection.score_review,'cohort_id',(saved.manifest->>'cohort')::uuid,'sources',refs),
 'comparison',comparison,'publication_allowed',false,'attachment_allowed',false);
 if octet_length(manifest::text)>114688 then raise exception 'native_comparison_metadata_bound';end if;
 perform mip_native_comparison.authorize_session(sid,rt);
 return manifest;
end $collect$;
create function mip_native_comparison.receipt(row_value mip_native_comparison.bindings) returns jsonb
language sql immutable set search_path='' as $receipt$
 select jsonb_build_object('contract','native-comparison-binding-receipt-v1','scope',row_value.scope,
 'binding_id',row_value.id,'manifest_hash',row_value.manifest_hash,
 'native_generation_id',row_value.manifest#>'{native,generation_id}',
 'comparison_generation_id',row_value.manifest#>'{comparison,generation_id}',
 'state','bound_private','publication_allowed',false,'attachment_allowed',false)
$receipt$;
create function mip_native_comparison.admit(s uuid,i uuid,pid uuid,dh text,ph text,rid uuid,sid uuid,rt text,rel uuid,ev uuid) returns jsonb
language plpgsql security definer set search_path='' as $admit$
declare manifest_value jsonb;stored mip_native_comparison.bindings;
begin
 perform mip_native_comparison.authorize_session(sid,rt);
 perform mip_arc_projection_private.enter_scope(s,true);
 if i is null or s is null then raise exception 'native_comparison_shape';end if;
 manifest_value:=mip_native_comparison.collect(s,pid,dh,ph,rid,sid,rt,rel,ev);
 if exists(select 1 from mip_native_comparison.revocations r where r.scope=s and r.binding_id=i)
 then raise exception 'native_comparison_revoked';end if;
 insert into mip_native_comparison.bindings(scope,id,manifest,manifest_hash)
 values(s,i,manifest_value,encode(sha256(convert_to(manifest_value::text,'UTF8')),'hex')) on conflict do nothing;
 select b.* into strict stored from mip_native_comparison.bindings b where b.scope=s and b.id=i;
 if stored.manifest is distinct from manifest_value or stored.principal is distinct from session_user
 then raise exception 'native_comparison_retry_conflict';end if;
 perform mip_native_comparison.authorize_session(sid,rt);
 return mip_native_comparison.receipt(stored);
exception when others then raise exception 'native_comparison_admission_failed' using errcode='P0001',detail='',hint='';
end $admit$;
create function mip_native_comparison.read_current(s uuid,i uuid,h text,sid uuid,rt text) returns jsonb
language plpgsql security definer set search_path='' as $read$
declare stored mip_native_comparison.bindings;manifest_value jsonb;
begin
 perform mip_native_comparison.authorize_session(sid,rt);
 perform mip_arc_projection_private.enter_scope(s,false);
 select b.* into strict stored from mip_native_comparison.bindings b where b.scope=s and b.id=i;
 if stored.manifest_hash is distinct from h or exists(select 1 from mip_native_comparison.revocations r where r.scope=s and r.binding_id=i)
 then raise exception 'native_comparison_stale';end if;
 manifest_value:=mip_native_comparison.collect(s,(stored.manifest#>>'{native,projection_id}')::uuid,
 stored.manifest#>>'{native,dependency_hash}',stored.manifest#>>'{native,display_hash}',
 (stored.manifest#>>'{native,projection_review_id}')::uuid,sid,rt,
 (stored.manifest#>>'{comparison,release_request}')::uuid,(stored.manifest#>>'{comparison,event_id}')::uuid);
 if manifest_value is distinct from stored.manifest then raise exception 'native_comparison_stale';end if;
 perform mip_native_comparison.authorize_session(sid,rt);
 return mip_native_comparison.receipt(stored);
exception when others then raise exception 'native_comparison_read_failed' using errcode='P0001',detail='',hint='';
end $read$;
create function mip_native_comparison.revoke_binding(s uuid,i uuid) returns void
language plpgsql security definer set search_path='' as $revoke$
begin
 perform mip_arc_projection_private.enter_scope(s,true);
 insert into mip_native_comparison.revocations(scope,binding_id) values(s,i) on conflict do nothing;
exception when others then raise exception 'native_comparison_revocation_failed' using errcode='P0001',detail='',hint='';
end $revoke$;

do $storage$
declare table_name text;
begin
 foreach table_name in array array['bindings','revocations'] loop
  execute format('alter table mip_native_comparison.%I enable row level security',table_name);
  execute format('alter table mip_native_comparison.%I force row level security',table_name);
  execute format('create policy owner_only on mip_native_comparison.%I to mip_arc_native_owner using(true) with check(true)',table_name);
  execute format('create trigger immutable_rows before update or delete on mip_native_comparison.%I for each row execute function mip_arc_native.immutable()',table_name);
  execute format('create trigger immutable_table before truncate on mip_native_comparison.%I for each statement execute function mip_arc_native.immutable()',table_name);
 end loop;
end $storage$;
reset role;
-- Remove only ACLs on this newly created schema's objects, including provider defaults.
do $new_acl$
declare object_row record;grant_row record;
begin
 for object_row in select p.oid,p.oid::regprocedure sig,p.proowner own from pg_proc p
 where p.pronamespace='mip_native_comparison'::regnamespace loop
  execute format('set local role %I',object_row.own::regrole);
  execute format('revoke all on function %s from public',object_row.sig);
  for grant_row in select distinct x.grantee from pg_proc p cross join lateral aclexplode(p.proacl) x
   where p.oid=object_row.oid and x.grantee<>0 and x.grantee<>object_row.own loop
   execute format('revoke all on function %s from %I',object_row.sig,grant_row.grantee::regrole);end loop;
  reset role;
 end loop;
 for object_row in select c.oid,c.oid::regclass sig,c.relowner own from pg_class c
 where c.relnamespace='mip_native_comparison'::regnamespace and c.relkind='r' loop
  execute format('set local role %I',object_row.own::regrole);
  execute format('revoke all on table %s from public',object_row.sig);
  for grant_row in select distinct x.grantee from pg_class c cross join lateral aclexplode(c.relacl)x
   where c.oid=object_row.oid and x.grantee<>0 and x.grantee<>object_row.own loop
   execute format('revoke all on table %s from %I',object_row.sig,grant_row.grantee::regrole);end loop;
  reset role;
 end loop;
end $new_acl$;
set role mip_publication_owner_v2;
grant execute on function mip_native_comparison.authorize_session(uuid,text),
 mip_native_comparison.comparison_metadata(uuid,text,uuid,uuid) to mip_arc_native_owner;
reset role;
set role mip_arc_native_owner;
grant execute on function mip_native_comparison.admit(uuid,uuid,uuid,text,text,uuid,uuid,text,uuid,uuid),
 mip_native_comparison.read_current(uuid,uuid,text,uuid,text),
 mip_native_comparison.revoke_binding(uuid,uuid) to mip_mentions_gateway;
reset role;
revoke mip_arc_native_owner,mip_publication_owner_v2 from current_user;

-- Unchanged complete prior private/native boundary precedes the additive boundary.
do $native_comparison_final$
begin
begin

declare spec record;obj record;role_row record;principal text;expected_owner oid;allowed oid[];function_oid oid;
 table_names text[]:=array['scalar_bindings','scalar_access','extraction_reviews','selection_policies','cohorts','generations','cohort_revocations','source_revisions','private_scores','private_reviews','attachment_revisions','attachment_article_heads','attachment_arc_clocks'];
 principals text[]:=array['mip_mentions_owner','mip_mentions_gateway','mip_mentions_admin','mip_mentions_native_validator',
 'mip_arc_qik_source_owner','mip_canonical_writer','mip_arc_native_owner','mip_arc_native_worker','mip_arc_attachment_owner','anon','authenticated','service_role'];
begin
 -- Complete final closure, also replayed after the installer's real role-edge cleanup.
 if(select count(*) from pg_roles where rolname=any(principals[1:9]))<>9
 then raise exception 'arc_attachment_role_presence';end if;
 for role_row in select * from pg_roles where rolname=any(principals[1:9]) loop
  if role_row.rolcanlogin or role_row.rolsuper or role_row.rolcreatedb or role_row.rolcreaterole or role_row.rolreplication or role_row.rolbypassrls
   or role_row.rolinherit is distinct from(role_row.rolname in('mip_mentions_owner','mip_mentions_gateway','mip_mentions_admin'))
   or exists(select 1 from pg_auth_members where member=role_row.oid
    or(roleid=role_row.oid and(role_row.rolname not in('mip_mentions_gateway','mip_mentions_admin')
      or not exists(select 1 from pg_roles login_role where login_role.oid=pg_auth_members.member and login_role.rolcanlogin))))
  then raise exception 'arc_attachment_role_boundary';end if;
 end loop;
 if not exists(select 1 from pg_namespace where nspname='mip_arc_native' and nspowner='mip_arc_native_owner'::regrole)
 then raise exception 'arc_attachment_schema_boundary';end if;
 foreach principal in array principals loop
  if has_schema_privilege(principal,'mip_arc_native','USAGE') is distinct from
    (principal=any(array['mip_arc_native_owner','mip_mentions_owner','mip_arc_native_worker','mip_mentions_gateway','mip_mentions_admin','mip_arc_attachment_owner']))
   or has_schema_privilege(principal,'mip_arc_native','CREATE') is distinct from(principal='mip_arc_native_owner')
  then raise exception 'arc_attachment_schema_boundary';end if;
 end loop;
 if exists(select 1 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
  where n.nspname='mip_arc_native' and(a.grantee=0 or(a.grantee<>n.nspowner and a.is_grantable) or
   (a.grantee<>n.nspowner and(a.privilege_type<>'USAGE' or a.grantee not in
    ('mip_mentions_owner'::regrole,'mip_arc_native_worker'::regrole,'mip_mentions_gateway'::regrole,'mip_mentions_admin'::regrole,'mip_arc_attachment_owner'::regrole)))))
 then raise exception 'arc_attachment_schema_acl';end if;
 if(select count(*) from pg_proc where pronamespace='mip_arc_native'::regnamespace)<>39
 then raise exception 'arc_attachment_function_presence';end if;
 for spec in select * from(values
 ('mip_arc_native.context(uuid,boolean,boolean)','mip_mentions_owner',true,array['search_path=""']::text[],array['mip_arc_native_owner']::text[]),
 ('mip_arc_native.immutable()','mip_arc_native_owner',false,array['search_path=""']::text[],array[]::text[]),
 ('mip_arc_native.fences()','mip_arc_native_owner',false,array['search_path=""']::text[],array[]::text[]),
 ('mip_arc_native.require_current_capture(uuid,uuid)','mip_arc_native_owner',false,array['search_path=""']::text[],array[]::text[]),
 ('mip_arc_native.scalar_value(mip_arc_native.scalar_bindings,boolean)','mip_arc_native_owner',false,array['search_path=""']::text[],array[]::text[]),
 ('mip_arc_native.review_scalar(uuid,uuid,uuid,uuid,uuid,text,text,text,text)','mip_arc_native_owner',true,array['search_path=""']::text[],array['mip_mentions_gateway']::text[]),
 ('mip_arc_native.set_scalar_access(uuid,uuid,boolean)','mip_arc_native_owner',true,array['search_path=""']::text[],array['mip_mentions_admin']::text[]),
 ('mip_arc_native.review_selection_policy(uuid,uuid,integer,uuid,numeric,boolean,integer,integer,integer,bigint)','mip_arc_native_owner',true,array['search_path=""']::text[],array['mip_mentions_gateway']::text[]),
 ('mip_arc_native.review_extraction(uuid,uuid,uuid,uuid,text,integer,uuid,text,text,text)','mip_arc_native_owner',true,array['search_path=""']::text[],array['mip_mentions_gateway']::text[]),
 ('mip_arc_native.membership_now(uuid,uuid,uuid)','mip_arc_native_owner',false,array['search_path=""']::text[],array[]::text[]),
 ('mip_arc_native.resolve_union(uuid,uuid[],uuid[],mip_arc_native.selection_policies)','mip_arc_native_owner',false,array['search_path=""','timezone=UTC','datestyle=ISO,YMD']::text[],array[]::text[]),
 ('mip_arc_native.expand_cached(uuid,mip_arc_native.cohorts,uuid,jsonb,jsonb)','mip_arc_native_owner',false,array['search_path=""','timezone=UTC','datestyle=ISO,YMD']::text[],array[]::text[]),
 ('mip_arc_native.expand_batch(uuid,uuid,mip_arc_native.cohorts,uuid)','mip_arc_native_owner',false,array['search_path=""','timezone=UTC','datestyle=ISO,YMD']::text[],array[]::text[]),
 ('mip_arc_native.expand(uuid,mip_arc_native.cohorts,uuid)','mip_arc_native_owner',false,array['search_path=""']::text[],array[]::text[]),
 ('mip_arc_native.review_cohort(uuid,uuid,uuid,text,uuid,uuid,uuid[],uuid[],uuid[],uuid)','mip_arc_native_owner',true,array['search_path=""']::text[],array['mip_mentions_gateway']::text[]),
 ('mip_arc_native.revoke_cohort(uuid,uuid,uuid)','mip_arc_native_owner',true,array['search_path=""']::text[],array['mip_mentions_gateway']::text[]),
 ('mip_arc_native.snapshot(uuid,uuid,uuid)','mip_arc_native_owner',true,array['search_path=""']::text[],array['mip_arc_native_worker']::text[]),
 ('mip_arc_native.read_scoring_input(uuid,uuid,text)','mip_arc_native_owner',true,array['search_path=""']::text[],array['mip_arc_native_worker']::text[]),
 ('mip_arc_native.record_source_revision()','mip_arc_native_owner',true,array['search_path=""','timezone=UTC','datestyle=ISO,YMD']::text[],array[]::text[]),
 ('mip_arc_native.assert_source_authority()','mip_arc_native_owner',false,array['search_path=""']::text[],array[]::text[]),
 ('mip_arc_native.exact_keys(jsonb,text[])','mip_arc_native_owner',false,array['search_path=""']::text[],array[]::text[]),
 ('mip_arc_native.validate_score(jsonb,mip_arc_native.generations)','mip_arc_native_owner',false,array['search_path=""']::text[],array[]::text[]),
 ('mip_arc_native.complete_score(uuid,uuid,text,jsonb)','mip_arc_native_owner',true,array['search_path=""']::text[],array['mip_arc_native_worker']::text[]),
 ('mip_arc_native.review_score(uuid,uuid,uuid,text,text,integer,uuid,text,text)','mip_arc_native_owner',true,array['search_path=""']::text[],array['mip_mentions_gateway']::text[]),
 ('mip_arc_native.read_current_score(uuid,uuid,text,text,uuid)','mip_arc_native_owner',true,array['search_path=""']::text[],array['mip_arc_native_worker','mip_mentions_gateway']::text[]),
 ('mip_arc_native.assert_attachment_score(uuid,jsonb)','mip_arc_native_owner',false,array['search_path=""']::text[],array[]::text[]),
 ('mip_arc_native.prepare_attachment_input(uuid,uuid,text,text,uuid)','mip_arc_native_owner',true,array['search_path=""']::text[],array['mip_arc_attachment_owner']::text[]),
 ('mip_arc_native.validate_attachment_set(uuid,uuid,uuid[])','mip_arc_native_owner',true,array['search_path=""']::text[],array['mip_arc_attachment_owner']::text[]),
 ('mip_arc_native.attachment_context(uuid,boolean)','mip_arc_native_owner',true,array['search_path=""']::text[],array['mip_arc_attachment_owner']::text[]),
 ('mip_arc_native.attachment_immutable()','mip_arc_attachment_owner',false,array['search_path=""']::text[],array[]::text[]),
 ('mip_arc_native.attachment_hash(jsonb)','mip_arc_attachment_owner',false,array['search_path=""']::text[],array[]::text[]),
 ('mip_arc_native.attachment_flags(jsonb)','mip_arc_attachment_owner',false,array['search_path=""']::text[],array[]::text[]),
 ('mip_arc_native.attachment_members(uuid,uuid,uuid)','mip_arc_attachment_owner',true,array['search_path=""']::text[],array['mip_arc_native_owner']::text[]),
 ('mip_arc_native.attachment_origin_record(uuid,uuid)','mip_arc_attachment_owner',true,array['search_path=""']::text[],array['mip_arc_native_owner']::text[]),
 ('mip_arc_native.prepare_private_attachment(uuid,uuid,text,text,uuid)','mip_arc_attachment_owner',true,array['search_path=""']::text[],array['mip_mentions_gateway']::text[]),
 ('mip_arc_native.read_private_arc_membership(uuid,uuid,bigint,text)','mip_arc_attachment_owner',true,array['search_path=""']::text[],array['mip_mentions_gateway']::text[]),
 ('mip_arc_native.read_private_attachment(uuid,uuid)','mip_arc_attachment_owner',true,array['search_path=""']::text[],array['mip_mentions_gateway']::text[]),
 ('mip_arc_native.attach_private_membership(uuid,uuid,uuid,text,text,uuid,integer,uuid,bigint,text)','mip_arc_attachment_owner',true,array['search_path=""']::text[],array['mip_mentions_gateway']::text[]),
 ('mip_arc_native.revoke_private_attachment(uuid,uuid,uuid,integer,bigint,text)','mip_arc_attachment_owner',true,array['search_path=""']::text[],array['mip_mentions_gateway']::text[])
 )v(signature,owner_name,security_definer,config,grantees) loop
  function_oid:=to_regprocedure(spec.signature);
  if function_oid is null then raise exception 'arc_attachment_function_presence';end if;
  select * into strict obj from pg_proc where oid=function_oid;
  expected_owner:=spec.owner_name::regrole;
  select array[expected_owner]||coalesce(array_agg(x::regrole::oid),'{}'::oid[]) into allowed from unnest(spec.grantees)x;
  if obj.proowner<>expected_owner or obj.prosecdef is distinct from spec.security_definer
   or (select array_agg(lower(split_part(setting,'=',1))||'='||
     (case when lower(split_part(setting,'=',1))='datestyle' then replace(substr(setting,strpos(setting,'=')+1),' ','')
      else substr(setting,strpos(setting,'=')+1) end) order by ordinal)
    from unnest(obj.proconfig) with ordinality configuration(setting,ordinal)) is distinct from spec.config or obj.prokind<>'f'
   or exists(select 1 from aclexplode(coalesce(obj.proacl,acldefault('f',obj.proowner)))a
    where a.privilege_type<>'EXECUTE' or not(a.grantee=any(allowed)) or(a.grantee<>obj.proowner and a.is_grantable))
  then raise exception 'arc_attachment_function_boundary';end if;
  foreach principal in array principals loop
   if has_function_privilege(principal,obj.oid,'EXECUTE') is distinct from(principal::regrole::oid=any(allowed))
   then raise exception 'arc_attachment_effective_function_boundary';end if;
  end loop;
 end loop;
 if(select count(*) from pg_class where relnamespace='mip_arc_native'::regnamespace and relkind in('r','p','v','m','f'))<>13
 then raise exception 'arc_attachment_storage_presence';end if;
 foreach principal in array table_names loop
  select * into obj from pg_class where relnamespace='mip_arc_native'::regnamespace and relname=principal and relkind='r';
  if not found then raise exception 'arc_attachment_storage_presence';end if;
  expected_owner:=(case when principal like 'attachment_%' then 'mip_arc_attachment_owner' else 'mip_arc_native_owner' end)::regrole;
  if obj.relowner<>expected_owner or not obj.relrowsecurity or not obj.relforcerowsecurity
   or exists(select 1 from aclexplode(coalesce(obj.relacl,acldefault('r',obj.relowner)))a where a.grantee<>expected_owner)
   or exists(select 1 from pg_attribute at cross join lateral aclexplode(at.attacl)a
    where at.attrelid=obj.oid and a.grantee<>expected_owner)
   or(select count(*) from pg_policy where polrelid=obj.oid)<>1
   or not exists(select 1 from pg_policy where polrelid=obj.oid and polpermissive and polcmd='*' and polroles=array[expected_owner]
    and polname=(case when principal like 'attachment_%' then 'attachment_owner_only' else 'owner_only' end)
    and pg_get_expr(polqual,polrelid)='true' and pg_get_expr(polwithcheck,polrelid)='true')
  then raise exception 'arc_attachment_storage_boundary';end if;
  for role_row in select * from pg_roles where rolname=any(principals) and oid<>expected_owner loop
   if has_table_privilege(role_row.oid,obj.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or has_any_column_privilege(role_row.oid,obj.oid,'SELECT,INSERT,UPDATE,REFERENCES')
   then raise exception 'arc_attachment_effective_storage_boundary';end if;
  end loop;
 end loop;
 if(select count(*) from pg_class where relnamespace='mip_arc_native'::regnamespace and relkind='S')<>1
  or not exists(select 1 from pg_class where relnamespace='mip_arc_native'::regnamespace and relname='source_revisions_sequence_seq'
   and relkind='S' and relowner='mip_arc_native_owner'::regrole)
  or exists(select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('S',c.relowner)))a
   where c.relnamespace='mip_arc_native'::regnamespace and c.relkind='S' and a.grantee<>c.relowner)
 then raise exception 'arc_attachment_sequence_boundary';end if;
 select * into strict obj from pg_proc where oid='mip_mentions.canonical_prelock_articles(uuid,uuid[],uuid[])'::regprocedure;
 if obj.proowner<>'mip_mentions_owner'::regrole or not obj.prosecdef or obj.proconfig is distinct from array['search_path=""']
  or exists(select 1 from aclexplode(coalesce(obj.proacl,acldefault('f',obj.proowner)))a
   where a.grantee not in('mip_mentions_owner'::regrole,'mip_arc_native_owner'::regrole) or(a.grantee<>obj.proowner and a.is_grantable))
  or not has_function_privilege('mip_arc_native_owner',obj.oid,'EXECUTE')
 then raise exception 'arc_attachment_prelock_boundary';end if;
 -- This unchanged source-defined authority check verifies exact source SELECT
 -- columns, RLS policies, native recorder and collector trigger contracts.
 perform mip_arc_native.assert_source_authority();
 if has_schema_privilege('mip_arc_native_owner','public','CREATE')
  or has_schema_privilege('mip_arc_native_owner','mip_mentions','CREATE')
 then raise exception 'arc_attachment_source_schema_boundary';end if;
 foreach principal in array array['public.articles','public.story_arcs','public.arc_membership_candidates','public.arc_membership_release_policy',
  'evidence_pipeline.article_captures','evidence_pipeline.import_jobs','mip_identity.source_changes',
  'mip_identity.collector_fence','mip_cutover_authority.publication_fence'] loop
  if has_table_privilege('mip_arc_attachment_owner',principal,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   or has_any_column_privilege('mip_arc_attachment_owner',principal,'SELECT,INSERT,UPDATE,REFERENCES')
  then raise exception 'arc_attachment_source_boundary';end if;
 end loop;
 if(select count(*) from pg_trigger where tgrelid='mip_arc_native.attachment_revisions'::regclass and not tgisinternal)<>2
  or not exists(select 1 from pg_trigger where tgrelid='mip_arc_native.attachment_revisions'::regclass
   and tgname='immutable_rows' and tgfoid='mip_arc_native.attachment_immutable()'::regprocedure and tgtype=26 and tgenabled='O' and tgqual is null)
  or not exists(select 1 from pg_trigger where tgrelid='mip_arc_native.attachment_revisions'::regclass
   and tgname='immutable_table' and tgfoid='mip_arc_native.attachment_immutable()'::regprocedure and tgtype=34 and tgenabled='O' and tgqual is null)
 then raise exception 'arc_attachment_immutable_boundary';end if;
end;
declare spec record;obj record;principal text;function_oid oid;allowed oid[];rel regclass;reject_oid oid;
 owner_oid oid:='mip_arc_native_owner'::regrole;
 principals text[]:=array['mip_mentions_owner','mip_mentions_gateway','mip_mentions_admin','mip_mentions_native_validator',
 'mip_arc_qik_source_owner','mip_canonical_writer','mip_arc_native_owner','mip_arc_native_worker','mip_arc_attachment_owner','anon','authenticated','service_role'];
begin
 -- The selected atomic compiler maps the historical qualification namespace
 -- to the existing protected hosted kernel. Resolve its exact trigger function
 -- through public catalog OIDs; no runtime schema/EXEC grant is needed.
 select p.oid into strict reject_oid from pg_catalog.pg_proc p
 join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 where n.nspname='mip_comparison_kernel_v1' and p.proname='reject_rewrite'
 and p.pronargs=0 and p.prokind='f' and p.prorettype='pg_catalog.trigger'::regtype;
 if not exists(select 1 from pg_namespace where nspname='mip_arc_projection_private' and nspowner=owner_oid)
 then raise exception 'arc_projection_schema_boundary';end if;
 if exists(select 1 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner)))a
 where n.nspname='mip_arc_projection_private' and(a.grantee=0 or(a.grantee<>owner_oid and
 (a.grantee<>'mip_mentions_gateway'::regrole or a.privilege_type<>'USAGE' or a.is_grantable))))
 then raise exception 'arc_projection_schema_acl';end if;
 foreach principal in array principals loop
  if has_schema_privilege(principal,'mip_arc_projection_private','USAGE') is distinct from(principal in('mip_arc_native_owner','mip_mentions_gateway'))
  or has_schema_privilege(principal,'mip_arc_projection_private','CREATE') is distinct from(principal='mip_arc_native_owner')
  then raise exception 'arc_projection_schema_boundary';end if;
 end loop;
 if(select count(*) from pg_proc where pronamespace='mip_arc_projection_private'::regnamespace)<>17
 then raise exception 'arc_projection_function_presence';end if;
 for spec in select * from(values
('mip_arc_projection_private.enter_scope(uuid,boolean)',false,'v',array['search_path=""']::text[],false),
('mip_arc_projection_private.hash_json(jsonb)',false,'i',array['search_path=""']::text[],false),
('mip_arc_projection_private.receipt(mip_arc_projection_private.projections)',false,'i',array['search_path=""']::text[],false),
('mip_arc_projection_private.source_value(mip_arc_projection_private.source_bindings,boolean)',false,'v',array['search_path=""','timezone=UTC']::text[],false),
('mip_arc_projection_private.review_source(uuid,uuid,uuid,uuid,uuid,text,text,text,text)',true,'v',array['search_path=""']::text[],true),
('mip_arc_projection_private.set_source_access(uuid,uuid,boolean)',true,'v',array['search_path=""']::text[],true),
('mip_arc_projection_private.check_citations(jsonb,jsonb)',false,'v',array['search_path=""']::text[],false),
('mip_arc_projection_private.review_citations(uuid,uuid,uuid,integer,uuid,text,jsonb)',true,'v',array['search_path=""']::text[],true),
('mip_arc_projection_private.current_context(uuid)',false,'v',array['search_path=""']::text[],false),
('mip_arc_projection_private.review_context(uuid,uuid,uuid,integer,uuid,text,text)',true,'v',array['search_path=""']::text[],true),
('mip_arc_projection_private.milestone_outcome(text,text)',false,'i',array['search_path=pg_catalog']::text[],false),
('mip_arc_projection_private.expand(mip_arc_projection_private.projections)',false,'v',array['search_path=""','timezone=UTC','datestyle=ISO,YMD']::text[],false),
('mip_arc_projection_private.prepare(uuid,uuid,uuid,text,text,uuid,uuid,uuid,uuid)',true,'v',array['search_path=""']::text[],true),
('mip_arc_projection_private.require_current(uuid,uuid,text,text)',false,'v',array['search_path=""']::text[],false),
('mip_arc_projection_private.review(uuid,uuid,uuid,text,text,integer,uuid,text,text)',true,'v',array['search_path=""']::text[],true),
('mip_arc_projection_private.read_current(uuid,uuid,text,text,uuid)',true,'v',array['search_path=""']::text[],true),
('mip_arc_projection_private.inspect_context(uuid,uuid)',true,'v',array['search_path=""']::text[],true)
 )v(signature,definer,volatility,config,gateway) loop
  function_oid:=to_regprocedure(spec.signature);
  select * into obj from pg_proc where oid=function_oid;
  if function_oid is null or obj.proowner<>owner_oid or obj.prosecdef is distinct from spec.definer
  or obj.provolatile::text<>spec.volatility or obj.prokind<>'f'
  or (select array_agg(lower(split_part(x,'=',1))||'='||case when lower(split_part(x,'=',1))='datestyle'
    then replace(substring(x from position('=' in x)+1),' ','') else substring(x from position('=' in x)+1) end order by ord)
    from unnest(obj.proconfig) with ordinality q(x,ord)) is distinct from
   (select array_agg(lower(split_part(x,'=',1))||'='||substring(x from position('=' in x)+1) order by ord)
    from unnest(spec.config) with ordinality q(x,ord))
  then raise exception 'arc_projection_function_boundary';end if;
  allowed:=array[owner_oid];
  if spec.gateway then allowed:=allowed||'mip_mentions_gateway'::regrole::oid;end if;
  if exists(select 1 from aclexplode(coalesce(obj.proacl,acldefault('f',obj.proowner)))a
   where not(a.grantee=any(allowed)) or a.privilege_type<>'EXECUTE' or(a.grantee<>owner_oid and a.is_grantable))
  then raise exception 'arc_projection_function_acl';end if;
  foreach principal in array principals loop
   if has_function_privilege(principal,function_oid,'EXECUTE') is distinct from(principal='mip_arc_native_owner' or(spec.gateway and principal='mip_mentions_gateway'))
   then raise exception 'arc_projection_function_effective';end if;
  end loop;
 end loop;
 if(select count(*) from pg_class where relnamespace='mip_arc_projection_private'::regnamespace and relkind='r')<>6
 or exists(select 1 from pg_class where relnamespace='mip_arc_projection_private'::regnamespace and relkind not in('r','i'))
 then raise exception 'arc_projection_table_presence';end if;
 for spec in select * from(values
('source_bindings',array['scope','id','article','capture','job','content_hash','body_kind','body_hash','url_hash','principal']::text[]),
('source_access',array['scope','binding','version','allowed']::text[]),
('citation_reviews',array['scope','id','binding','version','predecessor','state','items','principal']::text[]),
('context_reviews',array['scope','id','arc','version','predecessor','state','selected_context','context_hash','principal']::text[]),
('projections',array['scope','id','generation','input_hash','output_hash','score_review','binding','access_version','citation_review','context_review','dependency_manifest','dependency_hash','display_payload','display_hash','principal']::text[]),
('reviews',array['scope','id','projection','version','predecessor','dependency_hash','display_hash','disposition','reason','principal']::text[])
 )v(table_name,columns) loop
  rel:=to_regclass('mip_arc_projection_private.'||spec.table_name);
  select * into obj from pg_class where oid=rel;
  if obj.relowner<>owner_oid or not obj.relrowsecurity or not obj.relforcerowsecurity
  or(select array_agg(attname::text order by attnum) from pg_attribute where attrelid=rel and attnum>0 and not attisdropped) is distinct from spec.columns
  or(select count(*) from pg_policy where polrelid=rel)<>1
  or not exists(select 1 from pg_policy where polrelid=rel and polname='owner_only' and polpermissive
   and polcmd='*' and polroles=array[owner_oid] and pg_get_expr(polqual,polrelid)='true' and pg_get_expr(polwithcheck,polrelid)='true')
  then raise exception 'arc_projection_table_boundary';end if;
  if exists(select 1 from aclexplode(coalesce(obj.relacl,acldefault('r',obj.relowner)))a where a.grantee<>owner_oid)
  or exists(select 1 from pg_attribute a cross join lateral aclexplode(a.attacl)x where a.attrelid=rel and x.grantee<>owner_oid)
  then raise exception 'arc_projection_table_acl';end if;
  foreach principal in array principals loop
   if principal<>'mip_arc_native_owner' and(has_table_privilege(principal,rel,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   or has_any_column_privilege(principal,rel,'SELECT,INSERT,UPDATE,REFERENCES'))
   then raise exception 'arc_projection_table_effective';end if;
  end loop;
  if spec.table_name<>'source_access' and(
   (select count(*) from pg_trigger where tgrelid=rel and not tgisinternal)<>2
   or not exists(select 1 from pg_trigger where tgrelid=rel and tgname='immutable_rows'
    and tgfoid='mip_arc_native.immutable()'::regprocedure and tgtype=26 and tgenabled='O' and tgqual is null and tgattr=''::int2vector)
   or not exists(select 1 from pg_trigger where tgrelid=rel and tgname='immutable_table'
    and tgfoid='mip_arc_native.immutable()'::regprocedure and tgtype=34 and tgenabled='O' and tgqual is null and tgattr=''::int2vector))
  then raise exception 'arc_projection_immutable_boundary';end if;
 end loop;
 -- Actual complete survivor installation, not mere installer-function presence.
 foreach rel in array array['public.events'::regclass,'public.articles'::regclass,'public.event_articles'::regclass,
 'public.pipeline_config'::regclass,'public.claims'::regclass,'public.article_claims'::regclass,
 'public.claim_evidence_links'::regclass,'public.claim_corrections'::regclass,'public.explanations'::regclass,
 'public.story_arcs'::regclass,'public.nodes'::regclass,'public.edges'::regclass,'public.arc_events'::regclass,
 'public.arc_milestones'::regclass,'public.arc_membership_candidates'::regclass] loop
  if(select count(*) from pg_trigger where tgrelid=rel and tgname='survivor_mutation_lock'
   and tgfoid='mip_identity.collector_lock()'::regprocedure and tgtype=62 and tgenabled='O'
   and tgqual is null and tgattr=''::int2vector and tgargs=''::bytea and not tgisinternal)<>1
  then raise exception 'arc_projection_source_fence';end if;
  if rel<>all(array['public.events'::regclass,'public.articles'::regclass,'public.event_articles'::regclass,'public.pipeline_config'::regclass]) then
   if(select count(*) from pg_trigger where tgrelid=rel and tgname='survivor_retention'
    and tgfoid='mip_identity.collector_change()'::regprocedure and tgtype=29 and tgenabled='O'
    and tgqual is null and tgattr=''::int2vector and encode(tgargs,'hex')='696400' and not tgisinternal)<>1
   or(select count(*) from pg_trigger where tgrelid=rel and tgname='survivor_no_truncate'
    and tgfoid=reject_oid and tgtype=34 and tgenabled='O'
    and tgqual is null and tgattr=''::int2vector and tgargs=''::bytea and not tgisinternal)<>1
   then raise exception 'arc_projection_source_fence';end if;
  end if;
 end loop;
 -- The selected context count also relies on the original006 article recorder.
 -- Survivor installation adds a lock on articles but intentionally does not add
 -- its retention/no-truncate pair for this pre-existing collector relation.
 if(select count(*) from pg_trigger where tgrelid='public.articles'::regclass
  and tgname='collector_articles_lock' and tgfoid='mip_identity.collector_lock()'::regprocedure
  and tgtype=62 and tgenabled='O' and tgqual is null and tgattr=''::int2vector
  and tgargs=''::bytea and not tgisinternal)<>1
 or(select count(*) from pg_trigger where tgrelid='public.articles'::regclass
  and tgname='collector_articles_change' and tgfoid='mip_identity.collector_change()'::regprocedure
  and tgtype=29 and tgenabled='O' and tgqual is null and tgattr=''::int2vector
  and encode(tgargs,'hex')='696400' and not tgisinternal)<>1
 or(select count(*) from pg_trigger where tgrelid='public.articles'::regclass
  and tgname='no_collector_articles_truncate' and tgfoid=reject_oid
  and tgtype=34 and tgenabled='O' and tgqual is null and tgattr=''::int2vector
  and tgargs=''::bytea and not tgisinternal)<>1
 then raise exception 'arc_projection_article_recorder_boundary';end if;
 if not exists(select 1 from pg_trigger where tgrelid='mip_identity.source_changes'::regclass
  and tgname='immutable' and tgfoid=reject_oid
  and tgtype=27 and tgenabled='O' and tgqual is null and tgattr=''::int2vector and not tgisinternal)
 or not exists(select 1 from pg_trigger where tgrelid='mip_identity.source_changes'::regclass
  and tgname='no_truncate' and tgfoid=reject_oid
  and tgtype=34 and tgenabled='O' and tgqual is null and tgattr=''::int2vector and not tgisinternal)
 then raise exception 'arc_projection_change_cursor_boundary';end if;
 perform mip_arc_native.assert_source_authority();
end;
end;

declare object_row record;spec record;grant_row record;role_name text;function_id oid;expected_owner oid;allowed oid[];
 native_owner oid:='mip_arc_native_owner'::regrole;publication_owner oid:='mip_publication_owner_v2'::regrole;
 gateway oid:='mip_mentions_gateway'::regrole;relation_id regclass;
 principals text[]:=array['mip_arc_native_owner','mip_publication_owner_v2','mip_mentions_gateway','mip_mentions_admin',
 'mip_mentions_owner','mip_mentions_native_validator','mip_arc_native_worker','mip_arc_attachment_owner',
 'mip_arc_qik_source_owner','mip_canonical_writer','mip_projection_publisher_v1','mip_comparison_worker_v1',
 'mip_comparison_producer_v1','anon','authenticated','service_role'];
begin
 if exists(select 1 from pg_auth_members m where m.roleid in(native_owner,publication_owner) or m.member in(native_owner,publication_owner))
 then raise exception 'native_comparison_owner_membership';end if;
 if not exists(select 1 from pg_namespace n where n.nspname='mip_native_comparison' and n.nspowner=native_owner)
 or exists(select 1 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner)))a
 where n.nspname='mip_native_comparison' and (a.grantee=0 or a.grantee<>all(array[native_owner,publication_owner,gateway])
 or(a.grantee<>native_owner and(a.privilege_type<>'USAGE' or a.is_grantable))))
 then raise exception 'native_comparison_schema_boundary';end if;
 foreach role_name in array principals loop
  if has_schema_privilege(role_name,'mip_native_comparison','USAGE') is distinct from(role_name::regrole::oid=any(array[native_owner,publication_owner,gateway]))
  or has_schema_privilege(role_name,'mip_native_comparison','CREATE') is distinct from(role_name::regrole::oid=native_owner)
  then raise exception 'native_comparison_schema_boundary';end if;
 end loop;
 if(select count(*) from pg_proc p where p.pronamespace='mip_native_comparison'::regnamespace)<>7
 then raise exception 'native_comparison_function_inventory';end if;
 for spec in select * from(values
 ('mip_native_comparison.authorize_session(uuid,text)',true,'mip_publication_owner_v2',false,'v'),
 ('mip_native_comparison.comparison_metadata(uuid,text,uuid,uuid)',true,'mip_publication_owner_v2',false,'v'),
 ('mip_native_comparison.collect(uuid,uuid,text,text,uuid,uuid,text,uuid,uuid)',false,'mip_arc_native_owner',false,'v'),
 ('mip_native_comparison.receipt(mip_native_comparison.bindings)',false,'mip_arc_native_owner',false,'i'),
 ('mip_native_comparison.admit(uuid,uuid,uuid,text,text,uuid,uuid,text,uuid,uuid)',true,'mip_arc_native_owner',true,'v'),
 ('mip_native_comparison.read_current(uuid,uuid,text,uuid,text)',true,'mip_arc_native_owner',true,'v'),
 ('mip_native_comparison.revoke_binding(uuid,uuid)',true,'mip_arc_native_owner',true,'v')
 )v(signature,definer,owner_name,gateway_allowed,volatility) loop
  function_id:=to_regprocedure(spec.signature);expected_owner:=spec.owner_name::regrole;
  select p.* into object_row from pg_proc p where p.oid=function_id;
  if not found or object_row.proowner<>expected_owner or object_row.prosecdef is distinct from spec.definer
   or object_row.provolatile::text<>spec.volatility or object_row.prokind<>'f'
   or object_row.proconfig is distinct from array['search_path=""']
  then raise exception 'native_comparison_function_boundary';end if;
  allowed:=array[native_owner,expected_owner];
  if spec.gateway_allowed then allowed:=allowed||gateway;end if;
  if exists(select 1 from aclexplode(coalesce(object_row.proacl,acldefault('f',object_row.proowner)))a
   where a.grantee=0 or not(a.grantee=any(allowed)) or a.privilege_type<>'EXECUTE'
   or(a.grantee<>object_row.proowner and a.is_grantable)) then raise exception 'native_comparison_function_acl';end if;
  foreach role_name in array principals loop
   if has_function_privilege(role_name,function_id,'EXECUTE') is distinct from(role_name::regrole::oid=any(allowed))
   then raise exception 'native_comparison_function_effective';end if;
  end loop;
 end loop;
 if(select count(*) from pg_class c where c.relnamespace='mip_native_comparison'::regnamespace and c.relkind='r')<>2
 or exists(select 1 from pg_class c where c.relnamespace='mip_native_comparison'::regnamespace and c.relkind not in('r','i'))
 then raise exception 'native_comparison_storage_inventory';end if;
 for spec in select * from(values
 ('bindings',array['scope','id','manifest','manifest_hash','principal']::text[]),
 ('revocations',array['scope','binding_id','principal']::text[])
 )v(table_name,columns) loop
  relation_id:=to_regclass('mip_native_comparison.'||spec.table_name);
  select c.* into object_row from pg_class c where c.oid=relation_id;
  if not found or object_row.relowner<>native_owner or not object_row.relrowsecurity or not object_row.relforcerowsecurity
  or(select array_agg(a.attname::text order by a.attnum) from pg_attribute a where a.attrelid=relation_id and a.attnum>0 and not a.attisdropped) is distinct from spec.columns
  or exists(select 1 from aclexplode(coalesce(object_row.relacl,acldefault('r',object_row.relowner)))a where a.grantee<>native_owner)
  or exists(select 1 from pg_attribute a cross join lateral aclexplode(a.attacl)x where a.attrelid=relation_id and x.grantee<>native_owner)
  or(select count(*) from pg_policy p where p.polrelid=relation_id)<>1
  or not exists(select 1 from pg_policy p where p.polrelid=relation_id and p.polname='owner_only' and p.polpermissive and p.polcmd='*'
   and p.polroles=array[native_owner] and pg_get_expr(p.polqual,p.polrelid)='true' and pg_get_expr(p.polwithcheck,p.polrelid)='true')
  then raise exception 'native_comparison_storage_boundary';end if;
  foreach role_name in array principals loop
   if role_name::regrole::oid<>native_owner and(has_table_privilege(role_name,relation_id,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or has_any_column_privilege(role_name,relation_id,'SELECT,INSERT,UPDATE,REFERENCES'))
   then raise exception 'native_comparison_storage_effective';end if;
  end loop;
  if(select count(*) from pg_trigger t where t.tgrelid=relation_id and not t.tgisinternal)<>2
   or not exists(select 1 from pg_trigger t where t.tgrelid=relation_id and t.tgname='immutable_rows'
    and t.tgfoid='mip_arc_native.immutable()'::regprocedure and t.tgtype=27 and t.tgenabled='O' and t.tgqual is null and t.tgattr=''::int2vector)
   or not exists(select 1 from pg_trigger t where t.tgrelid=relation_id and t.tgname='immutable_table'
    and t.tgfoid='mip_arc_native.immutable()'::regprocedure and t.tgtype=34 and t.tgenabled='O' and t.tgqual is null and t.tgattr=''::int2vector)
  then raise exception 'native_comparison_immutable_boundary';end if;
 end loop;
 -- No widening of either protected existing comparison function.
 for spec in select * from(values
 ('mip_identity.read_isolated_comparison(uuid,text,uuid)','mip_publication_owner_v2',
 array['mip_publication_owner_v2','mip_projection_publisher_v1']::text[]),
 ('mip_identity.authorize(uuid,text,text)','mip_identity_owner_v2',
 array['mip_collector_owner_v2','mip_comparison_producer_owner_v1','mip_comparison_worker_owner_v1','mip_efta_owner_v1','mip_identity_owner_v2','mip_publication_owner_v2']::text[])
 )v(signature,owner_name,allowed_names) loop
  function_id:=to_regprocedure(spec.signature);
  select p.* into strict object_row from pg_proc p where p.oid=function_id;
  select array_agg(x::regrole::oid) into allowed from unnest(spec.allowed_names)x;
  if object_row.proowner<>spec.owner_name::regrole or not object_row.prosecdef or object_row.proconfig is distinct from array['search_path=""']
   or exists(select 1 from aclexplode(coalesce(object_row.proacl,acldefault('f',object_row.proowner)))a
   where a.grantee=0 or not(a.grantee=any(allowed)) or(a.grantee<>object_row.proowner and a.is_grantable))
  then raise exception 'native_comparison_existing_boundary';end if;
  foreach role_name in array principals loop
   if has_function_privilege(role_name,function_id,'EXECUTE') is distinct from(role_name::regrole::oid=any(allowed))
   then raise exception 'native_comparison_existing_effective';end if;
  end loop;
 end loop;
 perform mip_arc_native.assert_source_authority();
end;
end $native_comparison_final$;
commit;
