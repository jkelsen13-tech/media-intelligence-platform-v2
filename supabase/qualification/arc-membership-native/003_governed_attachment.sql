-- Private reviewed membership. Does not invoke public approval/projector or
-- mutate articles.arc_id, candidate state, release policies, nodes or edges.
-- Requires coordinated native001/002 attachment shared validation core.
begin;
set local lock_timeout='5s';
create role mip_arc_attachment_owner nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant mip_arc_attachment_owner to current_user with set true;
grant usage,create on schema mip_arc_native to mip_arc_attachment_owner;
grant execute on function mip_arc_native.prepare_attachment_input(uuid,uuid,text,text,uuid),
 mip_arc_native.validate_attachment_set(uuid,uuid,uuid[]) to mip_arc_attachment_owner;
grant mip_arc_native_owner to current_user with set true;
set role mip_arc_native_owner;
create function mip_arc_native.attachment_context(p_scope uuid,p_review boolean) returns void
language plpgsql security definer set search_path='' as $context$
begin
 perform mip_arc_native.context(p_scope,p_review);
 -- Acquire write fences before the existing source reader takes SHARE.
 perform 1 from mip_identity.collector_fence where id for update;
 if not found then raise exception 'arc_attachment_fence_missing';end if;
 perform 1 from mip_cutover_authority.publication_fence where id for update;
 if not found then raise exception 'arc_attachment_fence_missing';end if;
end $context$;
revoke all on function mip_arc_native.attachment_context(uuid,boolean) from public;
grant execute on function mip_arc_native.attachment_context(uuid,boolean) to mip_arc_attachment_owner;
reset role;
revoke mip_arc_native_owner from current_user;
set role mip_arc_attachment_owner;
create table mip_arc_native.attachment_revisions(
 scope uuid not null,id uuid not null,article_id uuid not null,arc_id uuid not null,
 generation_id uuid not null,review_id uuid not null,input_hash text not null,output_hash text not null,manifest_hash text not null,
 version integer not null check(version>0),predecessor uuid,arc_revision bigint not null check(arc_revision>0),
 state text not null check(state in('attached_private','revoked')),
 reason text not null check(reason in('reviewed_private_membership','private_membership_revoked')),
 dependency_head_ids uuid[] not null check(cardinality(dependency_head_ids)<=31),
 prior_set_digest text not null,principal name not null default session_user,
 primary key(scope,id),unique(scope,article_id,version),unique(scope,arc_id,arc_revision),
 foreign key(scope,predecessor) references mip_arc_native.attachment_revisions(scope,id),
 check(input_hash~'^[0-9a-f]{64}$' and output_hash~'^[0-9a-f]{64}$' and manifest_hash~'^[0-9a-f]{64}$' and prior_set_digest~'^[0-9a-f]{64}$'),
 check((state='attached_private' and reason='reviewed_private_membership')or(state='revoked' and reason='private_membership_revoked')));
create table mip_arc_native.attachment_article_heads(
 scope uuid not null,article_id uuid not null,revision uuid not null,primary key(scope,article_id),
 foreign key(scope,revision) references mip_arc_native.attachment_revisions(scope,id));
create table mip_arc_native.attachment_arc_clocks(
 scope uuid not null,arc_id uuid not null,revision bigint not null check(revision>0),primary key(scope,arc_id));
create index attachment_revisions_arc on mip_arc_native.attachment_revisions(scope,arc_id,id);
create function mip_arc_native.attachment_immutable() returns trigger language plpgsql set search_path='' as $immutable$
begin raise exception 'arc_attachment_immutable';end $immutable$;
do $tables$
declare n text;
begin
 foreach n in array array['attachment_revisions','attachment_article_heads','attachment_arc_clocks'] loop
  execute format('alter table mip_arc_native.%I enable row level security',n);
  execute format('alter table mip_arc_native.%I force row level security',n);
  execute format('create policy attachment_owner_only on mip_arc_native.%I to mip_arc_attachment_owner using(true) with check(true)',n);
  execute format('revoke all on mip_arc_native.%I from public,mip_mentions_gateway,mip_mentions_admin,mip_arc_native_worker',n);
 end loop;
end $tables$;
create trigger immutable_rows before update or delete on mip_arc_native.attachment_revisions
 for each statement execute function mip_arc_native.attachment_immutable();
create trigger immutable_table before truncate on mip_arc_native.attachment_revisions
 for each statement execute function mip_arc_native.attachment_immutable();
create function mip_arc_native.attachment_hash(p_value jsonb) returns text
language sql immutable set search_path='' as $hash$ select encode(sha256(convert_to(p_value::text,'UTF8')),'hex') $hash$;
create function mip_arc_native.attachment_flags(p_value jsonb) returns jsonb
language sql immutable set search_path='' as $flags$
 select p_value||jsonb_build_object('membership_kind','reviewed_private_membership_v1','record_kind','news_record',
 'public_attachment',false,'publication_allowed',false,'auto_approval_enabled',false,'production_qualified',false)
$flags$;
-- Protected metadata enumerator. Validation is deliberately centralized in the
-- native shared batch, not recursive per-origin expansion here.
create function mip_arc_native.attachment_members(p_scope uuid,p_arc uuid,p_candidate uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $members$
declare ids uuid[];articles uuid[];v bigint;payload jsonb;
begin
 if p_scope is null or p_arc is null then raise exception 'arc_attachment_scope_required';end if;
 select coalesce(array_agg(q.id order by q.id),'{}'::uuid[]),coalesce(array_agg(q.article_id order by q.article_id),'{}'::uuid[])
 into ids,articles from(
  select x.id,x.article_id from mip_arc_native.attachment_revisions x
  join mip_arc_native.attachment_article_heads h on h.scope=x.scope and h.revision=x.id and h.article_id=x.article_id
  where x.scope=p_scope and x.arc_id=p_arc and x.state='attached_private' and x.article_id is distinct from p_candidate
  order by x.id limit 33)q;
 if cardinality(ids)>32 then raise exception 'arc_attachment_member_budget';end if;
 select revision into v from mip_arc_native.attachment_arc_clocks where scope=p_scope and arc_id=p_arc;
 v:=coalesce(v,0);
 payload:=jsonb_build_object('contract','private_arc_members_v1','scope',p_scope,'arc_id',p_arc,
  'arc_revision',v,'head_ids',ids,'article_ids',articles);
 return jsonb_build_object('arc_revision',v,'head_ids',ids,'article_ids',articles,'set_digest',mip_arc_native.attachment_hash(payload));
end $members$;
create function mip_arc_native.attachment_origin_record(p_scope uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $origin$
declare saved mip_arc_native.attachment_revisions;dep uuid;
begin
 select x.* into saved from mip_arc_native.attachment_revisions x
 join mip_arc_native.attachment_article_heads h on h.scope=x.scope and h.revision=x.id and h.article_id=x.article_id
 where x.scope=p_scope and x.id=p_id and x.state='attached_private';
 if not found then raise exception 'arc_attachment_origin_stale';end if;
 foreach dep in array saved.dependency_head_ids loop
  if not exists(select 1 from mip_arc_native.attachment_revisions x join mip_arc_native.attachment_article_heads h
   on h.scope=x.scope and h.revision=x.id and h.article_id=x.article_id
   where x.scope=p_scope and x.id=dep and x.arc_id=saved.arc_id and x.arc_revision<saved.arc_revision and x.state='attached_private')
  then raise exception 'arc_attachment_dependency_stale';end if;
 end loop;
 return jsonb_build_object('scope',saved.scope,'attachment_id',saved.id,'article_id',saved.article_id,'arc_id',saved.arc_id,
  'generation_id',saved.generation_id,'review_id',saved.review_id,'input_hash',saved.input_hash,'output_hash',saved.output_hash,
  'manifest_hash',saved.manifest_hash,'version',saved.version,'predecessor',saved.predecessor,'arc_revision',saved.arc_revision,
  'state',saved.state,'principal',saved.principal,'dependency_head_ids',saved.dependency_head_ids);
end $origin$;
create function mip_arc_native.prepare_private_attachment(p_scope uuid,p_generation uuid,p_input text,p_output text,p_review uuid) returns jsonb
language plpgsql security definer set search_path='' as $prepare$
declare evidence jsonb;prior mip_arc_native.attachment_revisions;members jsonb;
begin
 perform mip_arc_native.attachment_context(p_scope,true);
 evidence:=mip_arc_native.prepare_attachment_input(p_scope,p_generation,p_input,p_output,p_review);
 select x.* into prior from mip_arc_native.attachment_revisions x join mip_arc_native.attachment_article_heads h
  on h.scope=x.scope and h.revision=x.id and h.article_id=x.article_id
  where h.scope=p_scope and h.article_id=(evidence->>'article_id')::uuid;
 if prior.state='attached_private' and prior.arc_id is distinct from(evidence->>'arc_id')::uuid
 then raise exception 'arc_attachment_reparent_refused';end if;
 members:=mip_arc_native.attachment_members(p_scope,(evidence->>'arc_id')::uuid,(evidence->>'article_id')::uuid);
 if(evidence->>'private_arc_revision',evidence->>'private_set_digest',evidence->'dependency_head_ids')
 is distinct from(members->>'arc_revision',members->>'set_digest',members->'head_ids')
 then raise exception 'arc_attachment_prepared_set_stale';end if;
 return mip_arc_native.attachment_flags(evidence||jsonb_build_object('expected_predecessor',prior.id,'version',coalesce(prior.version,0)+1));
end $prepare$;
create function mip_arc_native.read_private_arc_membership(p_scope uuid,p_arc uuid,p_revision bigint,p_digest text) returns jsonb
language plpgsql security definer set search_path='' as $arc$
declare members jsonb;ids uuid[];validated jsonb;
begin
 perform mip_arc_native.attachment_context(p_scope,false);
 members:=mip_arc_native.attachment_members(p_scope,p_arc);
 if p_revision is null or p_digest is null or(p_revision,p_digest)
 is distinct from((members->>'arc_revision')::bigint,members->>'set_digest')
 then raise exception 'arc_attachment_arc_head_stale';end if;
 select coalesce(array_agg(value::uuid order by value::uuid),'{}'::uuid[]) into ids from jsonb_array_elements_text(members->'head_ids');
 if cardinality(ids)=0 then raise exception 'arc_attachment_current_unavailable';end if;
 validated:=mip_arc_native.validate_attachment_set(p_scope,p_arc,ids);
 if(validated->'head_ids',validated->'article_ids',validated->>'arc_revision',validated->>'set_digest')
 is distinct from(members->'head_ids',members->'article_ids',members->>'arc_revision',members->>'set_digest')
 then raise exception 'arc_attachment_validated_set_mismatch';end if;
 return mip_arc_native.attachment_flags(validated);
end $arc$;
create function mip_arc_native.read_private_attachment(p_scope uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $read$
declare origin jsonb;members jsonb;current_set jsonb;
begin
 perform mip_arc_native.attachment_context(p_scope,false);
 origin:=mip_arc_native.attachment_origin_record(p_scope,p_id);
 members:=mip_arc_native.attachment_members(p_scope,(origin->>'arc_id')::uuid);
 current_set:=mip_arc_native.read_private_arc_membership(p_scope,(origin->>'arc_id')::uuid,
  (members->>'arc_revision')::bigint,members->>'set_digest');
 return mip_arc_native.attachment_flags((origin-'principal')||jsonb_build_object(
  'current_arc_revision',current_set->'arc_revision','current_set_digest',current_set->'set_digest',
  'current_head_ids',current_set->'head_ids','current_article_ids',current_set->'article_ids',
  'current_member_ids',current_set->'member_ids','public_member_ids',current_set->'public_member_ids'));
end $read$;
create function mip_arc_native.attach_private_membership(p_scope uuid,p_id uuid,p_generation uuid,p_input text,p_output text,p_review uuid,
 p_version integer,p_previous uuid,p_arc_revision bigint,p_set_digest text) returns jsonb
language plpgsql security definer set search_path='' as $attach$
declare saved mip_arc_native.attachment_revisions;prepared jsonb;deps uuid[];arc_id_value uuid;article_id_value uuid;
begin
 perform mip_arc_native.attachment_context(p_scope,true);
 if p_id is null or p_version is null or p_arc_revision is null or p_set_digest is null then raise exception 'arc_attachment_request_invalid';end if;
 select * into saved from mip_arc_native.attachment_revisions where scope=p_scope and id=p_id;
 if found then
  if(saved.generation_id,saved.input_hash,saved.output_hash,saved.review_id,saved.version,saved.predecessor,
   saved.arc_revision,saved.prior_set_digest,saved.state,saved.principal)
  is distinct from(p_generation,p_input,p_output,p_review,p_version,p_previous,p_arc_revision+1,p_set_digest,'attached_private',session_user)
  then raise exception 'arc_attachment_retry_conflict';end if;
  return mip_arc_native.read_private_attachment(p_scope,p_id);
 end if;
 prepared:=mip_arc_native.prepare_private_attachment(p_scope,p_generation,p_input,p_output,p_review);
 if(p_version,p_previous,p_arc_revision,p_set_digest) is distinct from((prepared->>'version')::integer,
  (prepared->>'expected_predecessor')::uuid,(prepared->>'private_arc_revision')::bigint,prepared->>'private_set_digest')
 then raise exception 'arc_attachment_predecessor';end if;
 arc_id_value:=(prepared->>'arc_id')::uuid;article_id_value:=(prepared->>'article_id')::uuid;
 select coalesce(array_agg(value::uuid order by value::uuid),'{}'::uuid[]) into deps from jsonb_array_elements_text(prepared->'dependency_head_ids');
 if cardinality(deps)>31 then raise exception 'arc_attachment_member_budget';end if;
 insert into mip_arc_native.attachment_revisions values(p_scope,p_id,article_id_value,arc_id_value,
  p_generation,p_review,p_input,p_output,prepared->>'manifest_hash',p_version,p_previous,p_arc_revision+1,
  'attached_private','reviewed_private_membership',deps,p_set_digest,session_user);
 insert into mip_arc_native.attachment_article_heads values(p_scope,article_id_value,p_id)
 on conflict(scope,article_id) do update set revision=excluded.revision;
 insert into mip_arc_native.attachment_arc_clocks values(p_scope,arc_id_value,p_arc_revision+1)
 on conflict(scope,arc_id) do update set revision=excluded.revision;
 -- Post-state validates the entire set, not just the newly attached row.
 return mip_arc_native.read_private_attachment(p_scope,p_id);
end $attach$;
create function mip_arc_native.revoke_private_attachment(p_scope uuid,p_id uuid,p_prior uuid,p_version integer,
 p_arc_revision bigint,p_set_digest text) returns jsonb
language plpgsql security definer set search_path='' as $revoke$
declare saved mip_arc_native.attachment_revisions;old mip_arc_native.attachment_revisions;members jsonb;
begin
 perform mip_arc_native.attachment_context(p_scope,true);
 if p_id is null or p_prior is null or p_version is null or p_arc_revision is null or p_set_digest is null
 then raise exception 'arc_attachment_request_invalid';end if;
 select * into old from mip_arc_native.attachment_revisions where scope=p_scope and id=p_id;
 if found then
  if(old.predecessor,old.version,old.arc_revision,old.prior_set_digest,old.state,old.principal)
   is distinct from(p_prior,p_version,p_arc_revision+1,p_set_digest,'revoked',session_user)
   or not exists(select 1 from mip_arc_native.attachment_article_heads where scope=p_scope and article_id=old.article_id and revision=p_id)
  then raise exception 'arc_attachment_retry_conflict';end if;
 else
  select x.* into saved from mip_arc_native.attachment_revisions x
  join mip_arc_native.attachment_article_heads h on h.scope=x.scope and h.revision=x.id and h.article_id=x.article_id
  where x.scope=p_scope and x.id=p_prior and x.state='attached_private';
  if not found or p_version<>saved.version+1 then raise exception 'arc_attachment_predecessor';end if;
  members:=mip_arc_native.attachment_members(p_scope,saved.arc_id);
  if(p_arc_revision,p_set_digest) is distinct from((members->>'arc_revision')::bigint,members->>'set_digest')
  then raise exception 'arc_attachment_arc_head_stale';end if;
  -- Revocation preserves binding without requiring stale bytes to be readable.
  -- Dependants remain recorded and fail current validation until explicitly repaired.
  insert into mip_arc_native.attachment_revisions values(p_scope,p_id,saved.article_id,saved.arc_id,
   saved.generation_id,saved.review_id,saved.input_hash,saved.output_hash,saved.manifest_hash,p_version,p_prior,p_arc_revision+1,
   'revoked','private_membership_revoked',saved.dependency_head_ids,p_set_digest,session_user);
  update mip_arc_native.attachment_article_heads set revision=p_id where scope=p_scope and article_id=saved.article_id;
  update mip_arc_native.attachment_arc_clocks set revision=p_arc_revision+1 where scope=p_scope and arc_id=saved.arc_id;
 end if;
 return mip_arc_native.attachment_flags(jsonb_build_object('scope',p_scope,'attachment_id',p_id,'predecessor',p_prior,
  'version',p_version,'arc_revision',p_arc_revision+1,'state','revoked'));
end $revoke$;
revoke all on function mip_arc_native.attachment_immutable(),mip_arc_native.attachment_hash(jsonb),mip_arc_native.attachment_flags(jsonb),
 mip_arc_native.attachment_members(uuid,uuid,uuid),mip_arc_native.attachment_origin_record(uuid,uuid),
 mip_arc_native.prepare_private_attachment(uuid,uuid,text,text,uuid),mip_arc_native.read_private_attachment(uuid,uuid),
 mip_arc_native.read_private_arc_membership(uuid,uuid,bigint,text),
 mip_arc_native.attach_private_membership(uuid,uuid,uuid,text,text,uuid,integer,uuid,bigint,text),
 mip_arc_native.revoke_private_attachment(uuid,uuid,uuid,integer,bigint,text) from public;
grant execute on function mip_arc_native.attachment_members(uuid,uuid,uuid),mip_arc_native.attachment_origin_record(uuid,uuid) to mip_arc_native_owner;
grant execute on function mip_arc_native.prepare_private_attachment(uuid,uuid,text,text,uuid),mip_arc_native.read_private_attachment(uuid,uuid),
 mip_arc_native.read_private_arc_membership(uuid,uuid,bigint,text),
 mip_arc_native.attach_private_membership(uuid,uuid,uuid,text,text,uuid,integer,uuid,bigint,text),
 mip_arc_native.revoke_private_attachment(uuid,uuid,uuid,integer,bigint,text) to mip_mentions_gateway;
reset role;
revoke create on schema mip_arc_native from mip_arc_attachment_owner;
revoke mip_arc_attachment_owner from current_user;
do $boundary$
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
end $boundary$;
commit;
