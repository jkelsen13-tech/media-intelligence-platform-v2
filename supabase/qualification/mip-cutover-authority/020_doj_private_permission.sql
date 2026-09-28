-- Opt-in candidate; hosted installation requires qualification and existing C3.
-- DOJ policy applicability and the owner's private processing authority are distinct.
begin;
create table mip_identity.doj_policy_versions(
 revision uuid primary key,
 source_project text not null check(length(btrim(source_project))>0 and source_project not in ('cc-definition-batch-v1','efta-bounded-demo-v1')),
 source_id uuid not null check(source_id='1b4c6203-f6dc-4be7-a61e-5ee1c2e2866d'),
 feed_url text not null check(feed_url='https://www.justice.gov/news/rss?type=press_release&m=1'),
 policy_url text not null check(policy_url='https://www.justice.gov/legalpolicies'),
 policy_version text not null check(length(btrim(policy_version))>0),
 policy_document_hash text not null check(policy_document_hash ~ '^[0-9a-f]{64}$'),
 policy_clause_hash text not null check(policy_clause_hash ~ '^[0-9a-f]{64}$'),
 policy_record_ref text not null check(length(btrim(policy_record_ref))>0),
 policy_observed_at timestamptz not null check(isfinite(policy_observed_at)),
 owner_record_ref text not null check(length(btrim(owner_record_ref))>0),
 owner_instruction_hash text not null check(owner_instruction_hash ~ '^[0-9a-f]{64}$'),
 owner_principal_ref text not null check(length(btrim(owner_principal_ref))>0),
 audience text not null check(audience='isolated_internal_review'),
 operations text[] not null check(operations=array['retention','analysis','excerpt_display']),
 fields text[] not null check(fields=array['source_identity','original_url','title','published_at','short_feed_summary','native_capture_bytes_hash']),
 effective_at timestamptz not null check(isfinite(effective_at)),
 expires_at timestamptz not null check(isfinite(expires_at) and expires_at>effective_at),
 owner_field_signature text check(owner_field_signature is null),
 unique(source_project,revision)
);
create table mip_identity.doj_policy_heads(
 source_project text primary key,revision uuid not null,active boolean not null,
 foreign key(source_project,revision) references mip_identity.doj_policy_versions(source_project,revision)
);
create table mip_identity.doj_material_bindings(
 revision uuid primary key,policy_revision uuid not null references mip_identity.doj_policy_versions,
 article_id uuid not null,capture_id uuid not null,observation_id uuid not null,
 article_version text not null check(article_version ~ '^[0-9a-f]{64}$'),
 capture_hash text not null check(capture_hash ~ '^[0-9a-f]{64}$'),
 source_receipt_ref text not null check(length(btrim(source_receipt_ref))>0),
 source_receipt_hash text not null check(source_receipt_hash ~ '^[0-9a-f]{64}$'),
 selection_record_ref text not null check(length(btrim(selection_record_ref))>0),
 selection_record_hash text not null check(selection_record_hash ~ '^[0-9a-f]{64}$'),
 applicability text not null check(applicability in ('verified_first_party_unmarked_doj_text','unresolved','excluded')),
 unique(policy_revision,article_id,article_version)
);
create trigger doj_policy_retirement before insert or update or delete on mip_identity.doj_policy_heads
 for each row execute function mip_identity.guard_revision_reuse();
do $tables$
declare t text;
begin
 foreach t in array array['doj_policy_versions','doj_policy_heads','doj_material_bindings'] loop
  execute format('alter table mip_identity.%I owner to mip_cutover_schema_owner_v1',t);
  execute format('alter table mip_identity.%I enable row level security',t);
  execute format('alter table mip_identity.%I force row level security',t);
  execute format('revoke all on mip_identity.%I from public,anon,authenticated,service_role,mip_comparison_worker_v1,mip_comparison_producer_v1,mip_projection_publisher_v1,qik_ingest_runtime,qik_ingest_fn_owner',t);
  execute format('grant select on mip_identity.%I to mip_publication_owner_v2',t);
  execute format('create policy doj_reader on mip_identity.%I for select to mip_publication_owner_v2 using(true)',t);
  execute format('grant select,insert on mip_identity.%I to mip_cutover_authority_admin_v1',t);
  execute format('create policy doj_admin_read on mip_identity.%I for select to mip_cutover_authority_admin_v1 using(true)',t);
  execute format('create policy doj_admin_insert on mip_identity.%I for insert to mip_cutover_authority_admin_v1 with check(true)',t);
  execute format('create trigger doj_fence before insert or update or delete or truncate on mip_identity.%I for each statement execute function mip_cutover_authority.fence_publication_write()',t);
  execute format('create trigger doj_no_truncate before truncate on mip_identity.%I for each statement execute function comparison_qualification.reject_rewrite()',t);
  if t<>'doj_policy_heads' then
   execute format('create trigger doj_immutable before update or delete on mip_identity.%I for each row execute function comparison_qualification.reject_rewrite()',t);
  end if;
 end loop;
end $tables$;
grant usage on schema mip_identity to mip_cutover_authority_admin_v1;
grant update(revision,active) on mip_identity.doj_policy_heads to mip_cutover_authority_admin_v1;
create policy doj_admin_update on mip_identity.doj_policy_heads for update to mip_cutover_authority_admin_v1 using(true) with check(true);
-- Existing authority administrator only. No login, membership, or runtime grant.
grant select,insert on mip_identity.operation_evidence_versions,mip_identity.operation_evidence_heads to mip_cutover_authority_admin_v1;
grant update(revision,active) on mip_identity.operation_evidence_heads to mip_cutover_authority_admin_v1;
create policy doj_admin_evidence_read on mip_identity.operation_evidence_versions for select to mip_cutover_authority_admin_v1
 using(authority_adapter='doj-private-policy-v1' and not synthetic and exists(select 1 from mip_identity.doj_policy_versions p where p.source_project=scope->>'source_project'));
create policy doj_admin_evidence_insert on mip_identity.operation_evidence_versions for insert to mip_cutover_authority_admin_v1
 with check(authority_adapter='doj-private-policy-v1' and not synthetic and exists(select 1 from mip_identity.doj_policy_versions p where p.source_project=scope->>'source_project'));
create policy doj_admin_heads_read on mip_identity.operation_evidence_heads for select to mip_cutover_authority_admin_v1
 using(exists(select 1 from mip_identity.doj_policy_versions p where p.source_project=scope->>'source_project'));
create policy doj_admin_heads_insert on mip_identity.operation_evidence_heads for insert to mip_cutover_authority_admin_v1
 with check(exists(select 1 from mip_identity.operation_evidence_versions v where v.scope=operation_evidence_heads.scope and v.revision=operation_evidence_heads.revision and v.authority_adapter='doj-private-policy-v1' and not v.synthetic));
create policy doj_admin_heads_update on mip_identity.operation_evidence_heads for update to mip_cutover_authority_admin_v1
 using(exists(select 1 from mip_identity.doj_policy_versions p where p.source_project=scope->>'source_project'))
 with check(exists(select 1 from mip_identity.operation_evidence_versions v where v.scope=operation_evidence_heads.scope and v.revision=operation_evidence_heads.revision and v.authority_adapter='doj-private-policy-v1' and not v.synthetic));

-- Existing 010/030/035 function-owner authority resolves one bound observation.
-- No new native grant, arbitrary material query, or retained payload copy.
create function qik_ingest.check_doj_material(p_observation uuid,p_capture uuid,p_article uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'capture_hash',c.content_hash,
  'receipt_hash',encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex'),
  'current',not exists(select 1 from evidence_pipeline.article_captures later where later.article_id=c.article_id and (later.captured_at,later.id)>(c.captured_at,c.id)),
  'verified',o.source_id='1b4c6203-f6dc-4be7-a61e-5ee1c2e2866d'::uuid
   and s.feed_url='https://www.justice.gov/news/rss?type=press_release&m=1'
   and o.url ~ '^https://(www\.)?justice\.gov/' and o.body_text is null
   and j.state='completed' and j.article_id=p_article and r.original_url=o.url
   and j.payload=c.payload and j.input_hash=c.content_hash
   and c.content_hash=encode(sha256(convert_to(c.payload::text,'UTF8')),'hex')
   and c.payload=jsonb_build_object('url',evidence_pipeline.canonical_url(o.url),'title',btrim(o.title),'outlet',btrim(o.outlet),
    'summary',nullif(o.summary,''),'body_text',null,'published_at',o.published_at))
 from qik_ingest.observed_items o join public.ingest_sources s on s.id=o.source_id
 join evidence_pipeline.import_jobs j on j.id=o.native_job_id
 join evidence_pipeline.import_receipts r on r.job_id=j.id and r.run_id=o.run_id
 join evidence_pipeline.article_captures c on c.job_id=j.id and c.article_id=j.article_id
 where o.id=p_observation and c.id=p_capture and c.article_id=p_article;
$$;
alter function qik_ingest.check_doj_material(uuid,uuid,uuid) owner to qik_ingest_fn_owner;
revoke all on function qik_ingest.check_doj_material(uuid,uuid,uuid) from public,anon,authenticated,service_role,qik_ingest_runtime,mip_cutover_authority_admin_v1,mip_comparison_worker_v1,mip_comparison_producer_v1,mip_projection_publisher_v1;
grant usage on schema qik_ingest to mip_publication_owner_v2;
grant execute on function qik_ingest.check_doj_material(uuid,uuid,uuid) to mip_publication_owner_v2;

alter function mip_identity.operation_check(jsonb) rename to operation_check_pre_doj_v1;
create function mip_identity.operation_check(p_scope jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare p mip_identity.doj_policy_versions;h mip_identity.doj_policy_heads;b mip_identity.doj_material_bindings;
 v mip_identity.operation_evidence_versions;oh mip_identity.operation_evidence_heads;proof jsonb;material_hash text;reason text;
begin
 perform 1 from mip_cutover_authority.publication_fence where id for share;
 select * into h from mip_identity.doj_policy_heads where source_project=p_scope->>'source_project';
 if not found then
  if exists(select 1 from mip_identity.doj_policy_versions where source_project=p_scope->>'source_project') then
   return jsonb_build_object('allowed',false,'reason','doj_policy_inactive','scope',p_scope);
  end if;
  return mip_identity.operation_check_pre_doj_v1(p_scope);
 end if;
 if jsonb_typeof(p_scope) is distinct from 'object' then
  return jsonb_build_object('allowed',false,'reason','doj_scope_shape','scope',p_scope);
 end if;
 if not(p_scope ?& array['source_project','material_ref','material_version','operation','audience','domain'])
 or exists(select 1 from jsonb_each(p_scope) e where e.key not in ('source_project','material_ref','material_version','operation','audience','domain') or jsonb_typeof(e.value)<>'string') then
  return jsonb_build_object('allowed',false,'reason','doj_scope_shape','scope',p_scope);
 end if;
 select * into strict p from mip_identity.doj_policy_versions where revision=h.revision and source_project=h.source_project;
 select * into oh from mip_identity.operation_evidence_heads where scope=p_scope;
 select * into v from mip_identity.operation_evidence_versions where revision=oh.revision and scope=p_scope;
 select * into b from mip_identity.doj_material_bindings where policy_revision=p.revision
  and 'article:'||article_id::text=p_scope->>'material_ref' and article_version=p_scope->>'material_version';
 if not h.active or p.effective_at>clock_timestamp() or p.expires_at<=clock_timestamp() then reason:='doj_policy_inactive';
 elsif p_scope->>'audience'<>p.audience or p_scope->>'domain' not in ('rights','privacy') or not(p_scope->>'operation'=any(p.operations)) then reason:='doj_scope_denied';
 elsif b.revision is null or b.applicability<>'verified_first_party_unmarked_doj_text' then reason:='doj_applicability_unverified';
 elsif v.revision is null or oh.active is distinct from true then reason:='doj_operation_missing_or_revoked';
 elsif v.synthetic or v.authority_adapter<>'doj-private-policy-v1' or v.approval_status<>'recorded' or v.disposition<>'allow' then reason:='doj_authority_unbound';
 elsif v.effective_at>clock_timestamp() or v.expires_at<=clock_timestamp() then reason:='doj_operation_expired';
 elsif v.source_ref<>p.feed_url or v.source_version<>b.capture_id::text or v.source_hash<>b.capture_hash
  or v.evidence_ref<>p.policy_record_ref or v.approval_owner_ref<>p.owner_principal_ref or v.approval_record_ref<>p.owner_record_ref
  or v.conditions<>jsonb_build_array(
   jsonb_build_object('status','verified','evidence_ref',p.policy_record_ref,'document_hash',p.policy_document_hash,'clause_hash',p.policy_clause_hash,'policy_revision',p.revision),
   jsonb_build_object('status','verified','evidence_ref',p.owner_record_ref,'instruction_hash',p.owner_instruction_hash),
   jsonb_build_object('status','verified','evidence_ref',b.selection_record_ref,'selection_hash',b.selection_record_hash,'receipt_hash',b.source_receipt_hash,'binding_revision',b.revision))
 then reason:='doj_record_binding_mismatch';
 else
  proof:=qik_ingest.check_doj_material(b.observation_id,b.capture_id,b.article_id);
  -- 008 hashes this exact article projection in the bound source snapshot.
  select comparison_qualification.argument_digest(to_jsonb(a)) into material_hash from public.articles a where a.id=b.article_id;
  if proof->'verified' is distinct from 'true'::jsonb or proof->'current' is distinct from 'true'::jsonb
   or proof->>'capture_hash' is distinct from b.capture_hash or proof->>'receipt_hash' is distinct from b.source_receipt_hash
   or material_hash is distinct from b.article_version then reason:='doj_material_stale_or_unavailable';
  else reason:='doj_private_policy_bound';end if;
 end if;
 return jsonb_build_object('allowed',reason='doj_private_policy_bound','reason',reason,'scope',p_scope,'revision',v.revision,'synthetic',false,
  'policy_revision',p.revision,'material_binding_revision',b.revision,'capture_hash',b.capture_hash,
  'rights_basis','DOJ_primary_policy_with_item_exception_review','privacy_basis','owner_authorized_private_processing',
  'approval_record_ref',p.owner_record_ref,'owner_field_signature',null,'public_release_allowed',false);
end $$;
alter function mip_identity.operation_check(jsonb) owner to mip_publication_owner_v2;
revoke all on function mip_identity.operation_check(jsonb),mip_identity.operation_check_pre_doj_v1(jsonb)
 from public,anon,authenticated,service_role,mip_comparison_worker_v1,mip_comparison_producer_v1,mip_projection_publisher_v1,mip_efta_owner_v1,qik_ingest_runtime,qik_ingest_fn_owner,mip_cutover_authority_admin_v1;
grant execute on function mip_identity.operation_check(jsonb) to mip_efta_owner_v1;

-- Final checks validate this unit after 019 and actual C3; they change no grants.
do $final_doj_permissions$
declare r record;t text;n integer;role_name text;rel regclass;
 denied text[]:=array['anon','authenticated','service_role','mip_comparison_worker_v1','mip_comparison_producer_v1','mip_projection_publisher_v1','qik_ingest_runtime','qik_ingest_fn_owner'];
begin
 foreach role_name in array array['mip_cutover_authority_admin_v1','mip_cutover_schema_owner_v1','mip_publication_owner_v2','qik_ingest_fn_owner'] loop
  if not exists(select 1 from pg_roles where rolname=role_name and not rolsuper and not rolbypassrls) then raise exception 'doj_role_boundary: %',role_name;end if;
 end loop;
 foreach role_name in array denied loop
  if pg_has_role(role_name,'mip_cutover_authority_admin_v1','MEMBER') then raise exception 'doj_admin_runtime_membership: %',role_name;end if;
 end loop;
 for r in select * from (values
  ('mip_identity.operation_check(jsonb)','mip_publication_owner_v2','v',array['mip_publication_owner_v2','mip_efta_owner_v1']),
  ('mip_identity.operation_check_pre_doj_v1(jsonb)','mip_publication_owner_v2','v',array['mip_publication_owner_v2']),
  ('qik_ingest.check_doj_material(uuid,uuid,uuid)','qik_ingest_fn_owner','s',array['qik_ingest_fn_owner','mip_publication_owner_v2'])
 ) x(signature,owner_name,volatility,allowed) loop
  if not exists(select 1 from pg_proc p where p.oid=to_regprocedure(r.signature) and p.proowner=r.owner_name::regrole and p.prosecdef and p.provolatile::text=r.volatility
   and exists(select 1 from unnest(p.proconfig) c where c in ('search_path=""','search_path='))) then raise exception 'doj_function_configuration: %',r.signature;end if;
  if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a left join pg_roles g on g.oid=a.grantee
   where p.oid=to_regprocedure(r.signature) and (a.grantee=0 or not(g.rolname=any(r.allowed)) or (a.is_grantable and a.grantee<>p.proowner))) then raise exception 'doj_function_acl: %',r.signature;end if;
  foreach role_name in array r.allowed loop
   if not has_function_privilege(role_name,r.signature,'EXECUTE') or not has_schema_privilege(role_name,split_part(r.signature,'.',1),'USAGE') then raise exception 'doj_function_required_path: %, %',r.signature,role_name;end if;
  end loop;
  foreach role_name in array denied||array['mip_cutover_authority_admin_v1'] loop
   if not(role_name=any(r.allowed)) and has_function_privilege(role_name,r.signature,'EXECUTE') then raise exception 'doj_function_denied_path: %, %',r.signature,role_name;end if;
  end loop;
 end loop;
 foreach t in array array['doj_policy_versions','doj_policy_heads','doj_material_bindings'] loop
  rel:=('mip_identity.'||t)::regclass;
  if not exists(select 1 from pg_class where oid=rel and relowner='mip_cutover_schema_owner_v1'::regrole and relrowsecurity and relforcerowsecurity) then raise exception 'doj_storage_configuration: %',t;end if;
  if exists(select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a left join pg_roles g on g.oid=a.grantee where c.oid=rel and a.grantee<>c.relowner and
   (a.grantee=0 or a.is_grantable or not((g.rolname='mip_publication_owner_v2' and a.privilege_type='SELECT') or (g.rolname='mip_cutover_authority_admin_v1' and a.privilege_type in ('SELECT','INSERT'))))) then raise exception 'doj_storage_acl: %',t;end if;
  if not has_table_privilege('mip_publication_owner_v2',rel,'SELECT') or not has_table_privilege('mip_cutover_authority_admin_v1',rel,'SELECT') or not has_table_privilege('mip_cutover_authority_admin_v1',rel,'INSERT') then raise exception 'doj_storage_required_path: %',t;end if;
  if exists(select 1 from pg_attribute c cross join lateral aclexplode(c.attacl) a where c.attrelid=rel and
   not(t='doj_policy_heads' and c.attname in ('revision','active') and a.grantee='mip_cutover_authority_admin_v1'::regrole and a.privilege_type='UPDATE' and not a.is_grantable)) then raise exception 'doj_column_acl: %',t;end if;
  select count(*) into n from pg_policy where polrelid=rel;
  if n<>(case when t='doj_policy_heads' then 4 else 3 end) or exists(select 1 from pg_policy where polrelid=rel and
   not(polpermissive and (
    (polname='doj_reader' and polcmd='r' and polroles=array['mip_publication_owner_v2'::regrole::oid] and pg_get_expr(polqual,polrelid)='true' and polwithcheck is null)
    or (polname='doj_admin_read' and polcmd='r' and polroles=array['mip_cutover_authority_admin_v1'::regrole::oid] and pg_get_expr(polqual,polrelid)='true' and polwithcheck is null)
    or (polname='doj_admin_insert' and polcmd='a' and polroles=array['mip_cutover_authority_admin_v1'::regrole::oid] and polqual is null and pg_get_expr(polwithcheck,polrelid)='true')
    or (t='doj_policy_heads' and polname='doj_admin_update' and polcmd='w' and polroles=array['mip_cutover_authority_admin_v1'::regrole::oid] and pg_get_expr(polqual,polrelid)='true' and pg_get_expr(polwithcheck,polrelid)='true')
   ))) then raise exception 'doj_storage_policy: %',t;end if;
  foreach role_name in array denied loop
   if has_table_privilege(role_name,rel,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege(role_name,rel,'SELECT,INSERT,UPDATE,REFERENCES') then raise exception 'doj_storage_denied_path: %, %',t,role_name;end if;
  end loop;
 end loop;
 foreach t in array array['revision','active'] loop
  if not has_column_privilege('mip_cutover_authority_admin_v1','mip_identity.doj_policy_heads',t,'UPDATE') or not has_column_privilege('mip_cutover_authority_admin_v1','mip_identity.operation_evidence_heads',t,'UPDATE') then raise exception 'doj_admin_head_update: %',t;end if;
 end loop;
 if has_table_privilege('mip_cutover_authority_admin_v1','mip_identity.doj_policy_heads','UPDATE,DELETE,TRUNCATE') or has_table_privilege('mip_cutover_authority_admin_v1','mip_identity.operation_evidence_heads','UPDATE,DELETE,TRUNCATE') then raise exception 'doj_admin_excess_head_privilege';end if;
 foreach t in array array['qik_ingest.observed_items','public.ingest_sources','evidence_pipeline.import_jobs','evidence_pipeline.import_receipts','evidence_pipeline.article_captures'] loop
  if not has_table_privilege('qik_ingest_fn_owner',t,'SELECT') then raise exception 'doj_existing_c3_dependency: %',t;end if;
 end loop;
 if not has_function_privilege('qik_ingest_fn_owner','evidence_pipeline.canonical_url(text)','EXECUTE') then raise exception 'doj_existing_canonical_dependency';end if;
end $final_doj_permissions$;
commit;
