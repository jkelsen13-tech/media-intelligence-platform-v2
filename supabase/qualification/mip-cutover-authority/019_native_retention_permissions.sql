-- UNAPPROVED SOURCE CANDIDATE. Final ordered-install assertions: NOT RUN.
-- Full prerequisites and installation sequence are in the successor qualification document.
-- Apply after all 001..018 authority layers, including optional journal 013..016.
-- No native table privileges or historical source records are changed here.
begin;
revoke all on function comparison_qualification.native_capture_lineage(uuid),
 comparison_qualification.native_capture_lineage_legacy(uuid),
 comparison_qualification.source_snapshot_legacy(jsonb,text),
 comparison_qualification.check_native_review_lineage(jsonb,jsonb,jsonb),
 comparison_qualification.check_native_lineage_output(jsonb,jsonb),
 comparison_qualification.source_snapshot(jsonb,text),comparison_qualification.capture_source(jsonb,text),
 mip_identity.collector_native_change(),mip_identity.capture_backlog()
 from public,anon,authenticated,service_role,mip_comparison_worker_v1,
 mip_comparison_producer_v1,mip_projection_publisher_v1;
grant execute on function comparison_qualification.source_snapshot_legacy(jsonb,text) to mip_publication_owner_v2;
grant execute on function comparison_qualification.source_snapshot(jsonb,text) to mip_comparison_producer_owner_v1,mip_publication_owner_v2;
grant execute on function comparison_qualification.check_native_review_lineage(jsonb,jsonb,jsonb) to mip_publication_owner_v2;
grant execute on function comparison_qualification.check_native_lineage_output(jsonb,jsonb) to mip_comparison_worker_owner_v1,mip_publication_owner_v2;

do $final_native_permissions$
declare r record;role_name text;owner_name text;sig text;rel regclass;n integer;
 isolated_roles text[]:=array['mip_cutover_schema_owner_v1','mip_kernel_owner_v2',
  'mip_collector_owner_v2','mip_publication_owner_v2','mip_comparison_worker_owner_v1',
  'mip_comparison_producer_owner_v1','mip_comparison_worker_v1',
  'mip_comparison_producer_v1','mip_projection_publisher_v1'];
 denied_roles text[]:=array['anon','authenticated','service_role',
  'mip_comparison_worker_v1','mip_comparison_producer_v1','mip_projection_publisher_v1'];
begin
 -- No membership edge may give these isolated roles inherited or SET ROLE authority.
 foreach role_name in array isolated_roles loop
  if not exists(select 1 from pg_roles where rolname=role_name and not
   (rolcanlogin or rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication))
  or exists(select 1 from pg_auth_members m join pg_roles p on p.oid=m.member where p.rolname=role_name) then
   raise exception 'mip_native_final_role_attributes_or_inheritance: %',role_name;
  end if;
 end loop;
 foreach role_name in array denied_roles loop
  foreach owner_name in array array['mip_cutover_schema_owner_v1','mip_kernel_owner_v2',
   'mip_collector_owner_v2','mip_publication_owner_v2','mip_comparison_worker_owner_v1','mip_comparison_producer_owner_v1'] loop
   if pg_has_role(role_name,owner_name,'MEMBER') then raise exception 'mip_native_final_owner_membership: %',role_name;end if;
  end loop;
 end loop;
 for r in select * from (values
  ('comparison_qualification.native_capture_lineage(uuid)','mip_kernel_owner_v2',array['mip_kernel_owner_v2']),
  ('comparison_qualification.native_capture_lineage_legacy(uuid)','mip_kernel_owner_v2',array['mip_kernel_owner_v2']),
  ('comparison_qualification.source_snapshot_legacy(jsonb,text)','mip_kernel_owner_v2',array['mip_kernel_owner_v2','mip_publication_owner_v2']),
  ('comparison_qualification.check_native_review_lineage(jsonb,jsonb,jsonb)','mip_kernel_owner_v2',array['mip_kernel_owner_v2','mip_publication_owner_v2']),
  ('comparison_qualification.check_native_lineage_output(jsonb,jsonb)','mip_kernel_owner_v2',array['mip_kernel_owner_v2','mip_comparison_worker_owner_v1','mip_publication_owner_v2']),
  ('comparison_qualification.source_snapshot(jsonb,text)','mip_kernel_owner_v2',array['mip_kernel_owner_v2','mip_comparison_producer_owner_v1','mip_publication_owner_v2']),
  ('comparison_qualification.capture_source(jsonb,text)','mip_kernel_owner_v2',array['mip_kernel_owner_v2']),
  ('mip_identity.collector_native_change()','mip_collector_owner_v2',array['mip_collector_owner_v2']),
  ('mip_identity.capture_backlog()','mip_collector_owner_v2',array['mip_collector_owner_v2']),
  ('mip_identity.read_isolated_comparison(uuid,text,uuid)','mip_publication_owner_v2',array['mip_publication_owner_v2','mip_projection_publisher_v1'])
 ) f(signature,expected_owner,allowed) loop
  if to_regprocedure(r.signature) is null or not exists(select 1 from pg_proc p join pg_roles o on o.oid=p.proowner
   where p.oid=to_regprocedure(r.signature) and o.rolname=r.expected_owner and p.prosecdef
    and exists(select 1 from unnest(p.proconfig) c where c in ('search_path=""','search_path='))) then
   raise exception 'mip_native_final_function_owner_or_configuration: %',r.signature;
  end if;
  if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   left join pg_roles g on g.oid=a.grantee where p.oid=to_regprocedure(r.signature)
   and (a.grantee=0 or not(g.rolname=any(r.allowed)) or (a.is_grantable and a.grantee<>p.proowner))) then
   raise exception 'mip_native_final_function_acl: %',r.signature;
  end if;
  foreach role_name in array denied_roles loop
   if not(role_name=any(r.allowed)) and has_function_privilege(role_name,r.signature,'EXECUTE') then
    raise exception 'mip_native_final_effective_execute: %, %',role_name,r.signature;
   end if;
  end loop;
  foreach role_name in array r.allowed loop
   if not has_function_privilege(role_name,r.signature,'EXECUTE') then raise exception 'mip_native_final_required_execute: %, %',role_name,r.signature;end if;
  end loop;
 end loop;
 foreach sig in array array['mip_identity','comparison_qualification','mip_cutover_authority'] loop
  if not exists(select 1 from pg_namespace where nspname=sig and nspowner='mip_cutover_schema_owner_v1'::regrole) then raise exception 'mip_native_final_schema_owner: %',sig;end if;
  foreach role_name in array denied_roles loop
   if has_schema_privilege(role_name,sig,'CREATE') then raise exception 'mip_native_final_schema_create: %, %',role_name,sig;end if;
  end loop;
 end loop;
 if not has_schema_privilege('mip_kernel_owner_v2','evidence_pipeline','USAGE')
 or not has_schema_privilege('mip_publication_owner_v2','evidence_pipeline','USAGE')
 or not has_schema_privilege('mip_comparison_producer_owner_v1','comparison_qualification','USAGE')
 or not has_schema_privilege('mip_comparison_worker_owner_v1','comparison_qualification','USAGE')
 or not has_schema_privilege('mip_collector_owner_v2','mip_identity','USAGE') then raise exception 'mip_native_final_schema_usage';end if;
 foreach rel in array array['evidence_pipeline.article_captures'::regclass,'evidence_pipeline.evidence_candidates'::regclass] loop
  if not exists(select 1 from pg_class where oid=rel and relrowsecurity) then raise exception 'mip_native_final_native_rls: %',rel;end if;
  foreach role_name in array array['mip_kernel_owner_v2','mip_publication_owner_v2'] loop
   if not has_table_privilege(role_name,rel,'SELECT')
   or not exists(select 1 from pg_policy where polrelid=rel and polcmd='r' and role_name::regrole::oid=any(polroles) and polqual is not null
    and (role_name<>'mip_kernel_owner_v2' or (polname='mip_native_review_kernel_select' and pg_get_expr(polqual,polrelid)='true')))
   or exists(select 1 from pg_policy where polrelid=rel and not polpermissive and polcmd in ('r','*') and (0=any(polroles) or role_name::regrole::oid=any(polroles))) then
    raise exception 'mip_native_final_native_read: %, %',role_name,rel;
   end if;
  end loop;
  foreach role_name in array array['mip_comparison_worker_v1','mip_comparison_producer_v1','mip_projection_publisher_v1','mip_comparison_worker_owner_v1','mip_comparison_producer_owner_v1'] loop
   if has_table_privilege(role_name,rel,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege(role_name,rel,'SELECT,INSERT,UPDATE,REFERENCES') then raise exception 'mip_native_final_runtime_native_access: %, %',role_name,rel;end if;
  end loop;
  select count(*) into n from pg_trigger where tgrelid=rel and not tgisinternal and tgfoid in ('mip_identity.collector_change()'::regprocedure,'mip_identity.collector_native_change()'::regprocedure);
  if n<>1 or not exists(select 1 from pg_trigger where tgrelid=rel and tgfoid='mip_identity.collector_native_change()'::regprocedure and tgtype=29 and tgenabled='O' and tgnargs=0) then raise exception 'mip_native_final_recorder: %',rel;end if;
  select count(*) into n from pg_trigger where tgrelid=rel and tgfoid='mip_identity.collector_lock()'::regprocedure;
  if n<>1 or not exists(select 1 from pg_trigger where tgrelid=rel and tgfoid='mip_identity.collector_lock()'::regprocedure and tgtype=62 and tgenabled='O') then raise exception 'mip_native_final_fence: %',rel;end if;
 end loop;
 foreach rel in array array['mip_identity.source_changes'::regclass,'mip_identity.generation_changes'::regclass,'mip_identity.collector_runs'::regclass] loop
  if not exists(select 1 from pg_class where oid=rel and relrowsecurity and relforcerowsecurity and relowner='mip_cutover_schema_owner_v1'::regrole)
  or not has_table_privilege('mip_collector_owner_v2',rel,'SELECT') or not has_table_privilege('mip_collector_owner_v2',rel,'INSERT')
  or not exists(select 1 from pg_policy where polrelid=rel and polcmd='r' and 'mip_collector_owner_v2'::regrole::oid=any(polroles) and pg_get_expr(polqual,polrelid)='true')
  or not exists(select 1 from pg_policy where polrelid=rel and polcmd='a' and 'mip_collector_owner_v2'::regrole::oid=any(polroles) and pg_get_expr(polwithcheck,polrelid)='true')
  or exists(select 1 from pg_policy where polrelid=rel and not polpermissive and polcmd in ('r','a','*') and (0=any(polroles) or 'mip_collector_owner_v2'::regrole::oid=any(polroles)))
  or not exists(select 1 from pg_trigger where tgrelid=rel and tgenabled='O' and tgtype=27 and tgfoid='comparison_qualification.reject_rewrite()'::regprocedure)
  or not exists(select 1 from pg_trigger where tgrelid=rel and tgenabled='O' and tgtype=34 and tgfoid='comparison_qualification.reject_rewrite()'::regprocedure) then
   raise exception 'mip_native_final_retention_storage: %',rel;
  end if;
  foreach role_name in array denied_roles loop
   if has_table_privilege(role_name,rel,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege(role_name,rel,'SELECT,INSERT,UPDATE,REFERENCES') then raise exception 'mip_native_final_retention_acl: %, %',role_name,rel;end if;
  end loop;
 end loop;
end $final_native_permissions$;

-- Authored; NOT RUN. Final complete-chain catalog assertions.
do $final_retention_chain_permissions$
declare r jsonb; p pg_proc%rowtype; rel regclass; role_name text; privilege_name text;
 actual jsonb; expected jsonb; allowed text[]; actors text[];isolated text[]:=array['mip_collector_owner_v2','mip_collector_scheduler_v1','mip_collector_worker_v1','mip_comparison_producer_owner_v1','mip_comparison_producer_v1','mip_comparison_worker_owner_v1','mip_comparison_worker_v1','mip_cutover_authority_admin_v1','mip_cutover_recovery_v1','mip_cutover_schema_owner_v1','mip_efta_admitter_v1','mip_efta_owner_v1','mip_efta_private_reader_v1','mip_efta_reviewer_v1','mip_factual_owner_v3','mip_factual_reviewer_v3','mip_identity_broker_v2','mip_identity_owner_v2','mip_journal_gateway_v2','mip_journal_owner_v2','mip_kernel_owner_v2','mip_projection_builder_v1','mip_projection_publisher_owner_v1','mip_projection_publisher_v1','mip_publication_owner_v2','mip_retention_reader_v1','mip_retention_writer_v1'];
begin
 actors:=isolated||array['anon','authenticated','service_role'];
 foreach role_name in array isolated loop
  if not exists(select 1 from pg_roles where rolname=role_name and not
   (rolcanlogin or rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication)
   and rolinherit=(not(role_name=any(array['mip_efta_owner_v1','mip_efta_reviewer_v1','mip_efta_admitter_v1','mip_efta_private_reader_v1'])))) then
   raise exception 'mip_native_final_chain_role_attributes: %',role_name;end if;
 end loop;
 if exists(select 1 from pg_auth_members m join pg_roles a on a.oid=m.member join pg_roles b on b.oid=m.roleid
  where a.rolname=any(isolated) or b.rolname=any(isolated)) then raise exception 'mip_native_final_chain_membership';end if;
 for r in select value from jsonb_array_elements($function_matrix$[{"allowed":["mip_comparison_producer_owner_v1","mip_kernel_owner_v2"],"expected_owner":"mip_kernel_owner_v2","security_definer":true,"signature":"comparison_qualification.enqueue(text,jsonb,text,timestamptz)","volatility":"v"},{"allowed":["mip_kernel_owner_v2"],"expected_owner":"mip_kernel_owner_v2","security_definer":true,"signature":"comparison_qualification.claim()","volatility":"v"},{"allowed":["mip_comparison_worker_owner_v1","mip_kernel_owner_v2"],"expected_owner":"mip_kernel_owner_v2","security_definer":true,"signature":"comparison_qualification.claim_scoped(text)","volatility":"v"},{"allowed":["mip_comparison_worker_owner_v1","mip_kernel_owner_v2"],"expected_owner":"mip_kernel_owner_v2","security_definer":true,"signature":"comparison_qualification.claim_payload(uuid,boolean,text)","volatility":"v"},{"allowed":["mip_comparison_worker_owner_v1","mip_kernel_owner_v2"],"expected_owner":"mip_kernel_owner_v2","security_definer":true,"signature":"comparison_qualification.complete(uuid,uuid,text,text,jsonb)","volatility":"v"},{"allowed":["mip_comparison_worker_owner_v1","mip_kernel_owner_v2"],"expected_owner":"mip_kernel_owner_v2","security_definer":true,"signature":"comparison_qualification.fail(uuid,uuid,text,text)","volatility":"v"},{"allowed":["mip_comparison_worker_owner_v1","mip_kernel_owner_v2"],"expected_owner":"mip_kernel_owner_v2","security_definer":true,"signature":"comparison_qualification.lock_generation_for_journal(uuid)","volatility":"v"},{"allowed":["mip_comparison_worker_owner_v1","mip_kernel_owner_v2"],"expected_owner":"mip_kernel_owner_v2","security_definer":true,"signature":"comparison_qualification.resume_exact_claim(text,uuid)","volatility":"v"},{"allowed":["mip_kernel_owner_v2"],"expected_owner":"mip_kernel_owner_v2","security_definer":false,"signature":"comparison_qualification.reject_rewrite()","volatility":"v"},{"allowed":["mip_comparison_producer_owner_v1"],"expected_owner":"mip_comparison_producer_owner_v1","security_definer":true,"signature":"mip_cutover_authority.producer_enqueue(uuid,uuid,text,jsonb,timestamptz)","volatility":"v"},{"allowed":["mip_collector_owner_v2","mip_comparison_producer_owner_v1","mip_comparison_producer_v1"],"expected_owner":"mip_comparison_producer_owner_v1","security_definer":true,"signature":"mip_identity.producer_enqueue(uuid,uuid,text,jsonb,timestamptz)","volatility":"v"},{"allowed":["mip_comparison_worker_owner_v1"],"expected_owner":"mip_comparison_worker_owner_v1","security_definer":true,"signature":"mip_cutover_authority.worker_claim(uuid,uuid,text)","volatility":"v"},{"allowed":["mip_comparison_worker_owner_v1","mip_comparison_worker_v1"],"expected_owner":"mip_comparison_worker_owner_v1","security_definer":true,"signature":"mip_identity.worker_claim(uuid,uuid,text)","volatility":"v"},{"allowed":["mip_comparison_worker_owner_v1"],"expected_owner":"mip_comparison_worker_owner_v1","security_definer":true,"signature":"mip_cutover_authority.worker_complete(uuid,uuid,text,uuid,uuid,text,text,jsonb)","volatility":"v"},{"allowed":["mip_comparison_worker_owner_v1","mip_comparison_worker_v1"],"expected_owner":"mip_comparison_worker_owner_v1","security_definer":true,"signature":"mip_identity.worker_complete(uuid,uuid,text,uuid,uuid,text,text,jsonb)","volatility":"v"},{"allowed":["mip_comparison_worker_owner_v1"],"expected_owner":"mip_comparison_worker_owner_v1","security_definer":true,"signature":"mip_cutover_authority.worker_fail(uuid,uuid,text,uuid,uuid,text,text)","volatility":"v"},{"allowed":["mip_comparison_worker_owner_v1","mip_comparison_worker_v1"],"expected_owner":"mip_comparison_worker_owner_v1","security_definer":true,"signature":"mip_identity.worker_fail(uuid,uuid,text,uuid,uuid,text,text)","volatility":"v"},{"allowed":["mip_comparison_worker_owner_v1"],"expected_owner":"mip_comparison_worker_owner_v1","security_definer":true,"signature":"mip_cutover_authority.worker_journal_put(uuid,text,text,jsonb)","volatility":"v"},{"allowed":["mip_comparison_worker_owner_v1","mip_comparison_worker_v1"],"expected_owner":"mip_comparison_worker_owner_v1","security_definer":true,"signature":"mip_identity.worker_journal_put(uuid,text,text,jsonb)","volatility":"v"},{"allowed":["mip_comparison_worker_owner_v1"],"expected_owner":"mip_comparison_worker_owner_v1","security_definer":true,"signature":"mip_cutover_authority.worker_journal_get(uuid,text,text)","volatility":"v"},{"allowed":["mip_comparison_worker_owner_v1","mip_comparison_worker_v1"],"expected_owner":"mip_comparison_worker_owner_v1","security_definer":true,"signature":"mip_identity.worker_journal_get(uuid,text,text)","volatility":"v"},{"allowed":["mip_comparison_worker_owner_v1"],"expected_owner":"mip_comparison_worker_owner_v1","security_definer":true,"signature":"mip_cutover_authority.worker_journal_pending(uuid,text,text,integer)","volatility":"v"},{"allowed":["mip_comparison_worker_owner_v1","mip_comparison_worker_v1"],"expected_owner":"mip_comparison_worker_owner_v1","security_definer":true,"signature":"mip_identity.worker_journal_pending(uuid,text,text,integer)","volatility":"v"},{"allowed":["mip_comparison_worker_owner_v1"],"expected_owner":"mip_comparison_worker_owner_v1","security_definer":true,"signature":"mip_cutover_authority.worker_resume_claim(uuid,text,text)","volatility":"v"},{"allowed":["mip_comparison_worker_owner_v1","mip_comparison_worker_v1"],"expected_owner":"mip_comparison_worker_owner_v1","security_definer":true,"signature":"mip_identity.worker_resume_claim(uuid,text,text)","volatility":"v"},{"allowed":["mip_comparison_worker_owner_v1"],"expected_owner":"mip_comparison_worker_owner_v1","security_definer":false,"signature":"mip_cutover_authority.worker_journal_token(text,jsonb,text)","volatility":"v"},{"allowed":["mip_collector_owner_v2","mip_comparison_producer_owner_v1","mip_comparison_worker_owner_v1","mip_efta_owner_v1","mip_identity_owner_v2","mip_publication_owner_v2"],"expected_owner":"mip_identity_owner_v2","security_definer":true,"signature":"mip_identity.authorize(uuid,text,text)","volatility":"v"},{"allowed":["mip_collector_owner_v2","mip_comparison_producer_v1"],"expected_owner":"mip_collector_owner_v2","security_definer":true,"signature":"mip_identity.capture_delta(uuid,uuid,text)","volatility":"v"},{"allowed":["mip_collector_owner_v2","mip_comparison_producer_v1"],"expected_owner":"mip_collector_owner_v2","security_definer":true,"signature":"mip_identity.reconciliation(uuid,text)","volatility":"v"},{"allowed":["mip_collector_owner_v2"],"expected_owner":"mip_collector_owner_v2","security_definer":true,"signature":"mip_identity.collector_lock()","volatility":"v"},{"allowed":["mip_collector_owner_v2"],"expected_owner":"mip_collector_owner_v2","security_definer":true,"signature":"mip_identity.collector_change()","volatility":"v"},{"allowed":["mip_publication_owner_v2"],"expected_owner":"mip_publication_owner_v2","security_definer":true,"signature":"mip_identity.validate_review(uuid)","volatility":"v"},{"allowed":["mip_publication_owner_v2"],"expected_owner":"mip_publication_owner_v2","security_definer":true,"signature":"mip_identity.validate_review_predicates_v1(uuid)","volatility":"v"},{"allowed":["mip_publication_owner_v2"],"expected_owner":"mip_publication_owner_v2","security_definer":true,"signature":"mip_identity.validate_review_operations_v2(uuid)","volatility":"v"},{"allowed":["mip_publication_owner_v2"],"expected_owner":"mip_publication_owner_v2","security_definer":true,"signature":"mip_identity.validate_review_before_native_v4(uuid)","volatility":"v"},{"allowed":["mip_publication_owner_v2"],"expected_owner":"mip_publication_owner_v2","security_definer":true,"signature":"mip_identity.canonicalize_native_review(uuid,jsonb,jsonb)","volatility":"s"},{"allowed":["mip_publication_owner_v2"],"expected_owner":"mip_publication_owner_v2","security_definer":true,"signature":"mip_identity.guard_publication_review_retention()","volatility":"v"},{"allowed":["mip_projection_publisher_v1","mip_publication_owner_v2"],"expected_owner":"mip_publication_owner_v2","security_definer":true,"signature":"mip_identity.stage_review(uuid,text,uuid)","volatility":"v"},{"allowed":["mip_projection_publisher_v1","mip_publication_owner_v2"],"expected_owner":"mip_publication_owner_v2","security_definer":true,"signature":"mip_identity.release_isolated(uuid,uuid,text,uuid)","volatility":"v"},{"allowed":["mip_projection_publisher_v1","mip_publication_owner_v2"],"expected_owner":"mip_publication_owner_v2","security_definer":true,"signature":"mip_identity.read_isolated_comparison(uuid,text,uuid)","volatility":"v"},{"allowed":["mip_publication_owner_v2"],"expected_owner":"mip_publication_owner_v2","security_definer":false,"signature":"mip_identity.release_public()","volatility":"v"},{"allowed":["mip_publication_owner_v2"],"expected_owner":"mip_publication_owner_v2","security_definer":true,"signature":"mip_identity.survivor_context()","volatility":"v"},{"allowed":["mip_publication_owner_v2"],"expected_owner":"mip_publication_owner_v2","security_definer":true,"signature":"mip_identity.invalidate_source_publications()","volatility":"v"},{"allowed":["mip_publication_owner_v2"],"expected_owner":"mip_publication_owner_v2","security_definer":true,"signature":"mip_cutover_authority.check_publication_payload(uuid)","volatility":"v"},{"allowed":["mip_publication_owner_v2"],"expected_owner":"mip_publication_owner_v2","security_definer":true,"signature":"mip_cutover_authority.select_approved_payload(uuid)","volatility":"v"},{"allowed":["mip_publication_owner_v2"],"expected_owner":"mip_publication_owner_v2","security_definer":true,"signature":"mip_cutover_authority.fence_publication_write()","volatility":"v"},{"allowed":["mip_efta_owner_v1","mip_publication_owner_v2"],"expected_owner":"mip_publication_owner_v2","security_definer":true,"signature":"mip_identity.operation_check(jsonb)","volatility":"v"},{"allowed":["mip_publication_owner_v2"],"expected_owner":"mip_publication_owner_v2","security_definer":true,"signature":"mip_identity.operation_check_synthetic_v1(jsonb)","volatility":"v"},{"allowed":["mip_publication_owner_v2"],"expected_owner":"mip_publication_owner_v2","security_definer":true,"signature":"mip_identity.operation_check_pre_efta_v4(jsonb)","volatility":"v"},{"allowed":["mip_comparison_worker_v1","mip_publication_owner_v2"],"expected_owner":"mip_publication_owner_v2","security_definer":true,"signature":"mip_identity.check_admitted_material(uuid,text,jsonb)","volatility":"v"},{"allowed":["mip_factual_owner_v3","mip_factual_reviewer_v3"],"expected_owner":"mip_factual_owner_v3","security_definer":true,"signature":"mip_factual.review_publish(uuid,text)","volatility":"v"},{"allowed":["mip_factual_owner_v3","mip_publication_owner_v2"],"expected_owner":"mip_factual_owner_v3","security_definer":true,"signature":"mip_factual.source_hash(uuid[])","volatility":"v"},{"allowed":["mip_factual_owner_v3","mip_publication_owner_v2"],"expected_owner":"mip_factual_owner_v3","security_definer":false,"signature":"mip_factual.record_hash(jsonb)","volatility":"i"}]$function_matrix$::jsonb) loop
  select * into p from pg_proc where oid=to_regprocedure(r->>'signature');
  if not found or p.proowner<>(r->>'expected_owner')::regrole or p.prokind<>'f'
   or p.prosecdef<>(r->>'security_definer')::boolean or p.provolatile::text<>r->>'volatility'
   or cardinality(p.proconfig) is distinct from 1 or not(p.proconfig[1]=any(array['search_path=""','search_path='])) then
   raise exception 'mip_native_final_chain_function_configuration: %',r->>'signature';end if;
  select array_agg(value) into allowed from jsonb_array_elements_text(r->'allowed');
  if exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a left join pg_roles g on g.oid=a.grantee
   where a.grantee=0 or g.rolname is null or not(g.rolname=any(allowed)) or a.privilege_type<>'EXECUTE' or (a.is_grantable and a.grantee<>p.proowner)) then
   raise exception 'mip_native_final_chain_function_acl: %',r->>'signature';end if;
  foreach role_name in array actors loop
   if has_function_privilege(role_name,p.oid,'EXECUTE') is distinct from (role_name=any(allowed)) then
    raise exception 'mip_native_final_chain_effective_execute: %, %',r->>'signature',role_name;end if;
  end loop;
  foreach role_name in array allowed loop
   if not has_function_privilege(role_name,p.oid,'EXECUTE') or not has_schema_privilege(role_name,p.pronamespace,'USAGE') then
    raise exception 'mip_native_final_chain_required_path: %, %',r->>'signature',role_name;end if;
  end loop;
 end loop;
 for r in select value from jsonb_array_elements($table_matrix$[{"acl":["mip_collector_owner_v2:SELECT","mip_kernel_owner_v2:INSERT","mip_kernel_owner_v2:SELECT","mip_kernel_owner_v2:UPDATE","mip_publication_owner_v2:SELECT"],"columns":[],"immutable":true,"policies":[{"check":null,"command":"r","name":"collector_generation_read","permissive":true,"roles":["mip_collector_owner_v2"],"using":"true"},{"check":"true","command":"*","name":"kernel_only_v2","permissive":true,"roles":["mip_kernel_owner_v2"],"using":"true"},{"check":null,"command":"r","name":"publication_generation","permissive":true,"roles":["mip_publication_owner_v2"],"using":"true"}],"relation":"comparison_qualification.generations"},{"acl":["mip_collector_owner_v2:SELECT","mip_kernel_owner_v2:INSERT","mip_kernel_owner_v2:SELECT","mip_kernel_owner_v2:UPDATE","mip_publication_owner_v2:SELECT"],"columns":["mip_comparison_worker_owner_v1:SELECT:generation_id","mip_comparison_worker_owner_v1:SELECT:lease_token"],"immutable":true,"policies":[{"check":null,"command":"r","name":"collector_output_read","permissive":true,"roles":["mip_collector_owner_v2"],"using":"true"},{"check":null,"command":"r","name":"journal_native_token","permissive":true,"roles":["mip_comparison_worker_owner_v1"],"using":"true"},{"check":"true","command":"*","name":"kernel_only_v2","permissive":true,"roles":["mip_kernel_owner_v2"],"using":"true"},{"check":null,"command":"r","name":"publication_output","permissive":true,"roles":["mip_publication_owner_v2"],"using":"true"}],"relation":"comparison_qualification.outputs"},{"acl":["mip_collector_owner_v2:SELECT","mip_kernel_owner_v2:INSERT","mip_kernel_owner_v2:SELECT","mip_kernel_owner_v2:UPDATE"],"columns":["mip_comparison_worker_owner_v1:SELECT:generation_id","mip_comparison_worker_owner_v1:SELECT:lease_token","mip_comparison_worker_owner_v1:SELECT:state"],"immutable":false,"policies":[{"check":null,"command":"r","name":"collector_job_read","permissive":true,"roles":["mip_collector_owner_v2"],"using":"true"},{"check":null,"command":"r","name":"journal_native_token","permissive":true,"roles":["mip_comparison_worker_owner_v1"],"using":"true"},{"check":"true","command":"*","name":"kernel_only_v2","permissive":true,"roles":["mip_kernel_owner_v2"],"using":"true"}],"relation":"comparison_qualification.jobs"},{"acl":["mip_kernel_owner_v2:INSERT","mip_kernel_owner_v2:SELECT","mip_kernel_owner_v2:UPDATE"],"columns":["mip_comparison_worker_owner_v1:SELECT:generation_id","mip_comparison_worker_owner_v1:SELECT:lease_token"],"immutable":true,"policies":[{"check":null,"command":"r","name":"journal_native_token","permissive":true,"roles":["mip_comparison_worker_owner_v1"],"using":"true"},{"check":"true","command":"*","name":"kernel_only_v2","permissive":true,"roles":["mip_kernel_owner_v2"],"using":"true"}],"relation":"comparison_qualification.failure_reports"},{"acl":["mip_kernel_owner_v2:INSERT","mip_kernel_owner_v2:SELECT","mip_kernel_owner_v2:UPDATE"],"columns":["mip_comparison_worker_owner_v1:SELECT:generation_id","mip_comparison_worker_owner_v1:SELECT:outcome","mip_comparison_worker_owner_v1:SELECT:principal","mip_comparison_worker_owner_v1:SELECT:request_id","mip_comparison_worker_owner_v1:SELECT:rpc_name","mip_comparison_worker_owner_v1:SELECT:runtime_id"],"immutable":true,"policies":[{"check":null,"command":"r","name":"journal_discovery_runs","permissive":true,"roles":["mip_comparison_worker_owner_v1"],"using":"true"},{"check":"true","command":"*","name":"kernel_only_v2","permissive":true,"roles":["mip_kernel_owner_v2"],"using":"true"}],"relation":"comparison_qualification.request_runs"},{"acl":["mip_comparison_worker_owner_v1:INSERT","mip_comparison_worker_owner_v1:SELECT","mip_kernel_owner_v2:INSERT","mip_kernel_owner_v2:SELECT"],"columns":[],"immutable":true,"policies":[{"check":"true","command":"a","name":"native_resume_lease_owner_insert","permissive":true,"roles":["mip_kernel_owner_v2"],"using":null},{"check":null,"command":"r","name":"native_resume_lease_owner_read","permissive":true,"roles":["mip_kernel_owner_v2"],"using":"true"},{"check":"true","command":"*","name":"worker_lease_owners","permissive":true,"roles":["mip_comparison_worker_owner_v1"],"using":"true"}],"relation":"mip_cutover_authority.lease_owners"},{"acl":["mip_comparison_worker_owner_v1:INSERT","mip_comparison_worker_owner_v1:SELECT","mip_kernel_owner_v2:SELECT"],"columns":[],"immutable":true,"policies":[{"check":"true","command":"*","name":"journal_rpc_owner","permissive":true,"roles":["mip_comparison_worker_owner_v1"],"using":"true"},{"check":null,"command":"r","name":"native_resume_journal_read","permissive":true,"roles":["mip_kernel_owner_v2"],"using":"true"}],"relation":"mip_cutover_authority.worker_journal"},{"acl":["mip_publication_owner_v2:SELECT"],"columns":[],"immutable":true,"policies":[{"check":"true","command":"*","name":"publication_owner","permissive":true,"roles":["mip_publication_owner_v2"],"using":"true"}],"relation":"mip_identity.publication_reviews"},{"acl":["mip_publication_owner_v2:INSERT","mip_publication_owner_v2:SELECT"],"columns":[],"immutable":true,"policies":[{"check":"true","command":"*","name":"publication_owner","permissive":true,"roles":["mip_publication_owner_v2"],"using":"true"}],"relation":"mip_identity.review_stages"},{"acl":["mip_publication_owner_v2:INSERT","mip_publication_owner_v2:SELECT"],"columns":[],"immutable":true,"policies":[{"check":"true","command":"*","name":"publication_owner","permissive":true,"roles":["mip_publication_owner_v2"],"using":"true"}],"relation":"mip_identity.private_releases"},{"acl":["mip_publication_owner_v2:INSERT","mip_publication_owner_v2:SELECT","mip_publication_owner_v2:UPDATE"],"columns":[],"immutable":true,"policies":[{"check":"true","command":"*","name":"publication_kernel","permissive":true,"roles":["mip_publication_owner_v2"],"using":"true"}],"relation":"mip_cutover_authority.approved_payloads"},{"acl":["mip_publication_owner_v2:INSERT","mip_publication_owner_v2:SELECT","mip_publication_owner_v2:UPDATE"],"columns":[],"immutable":true,"policies":[{"check":"true","command":"*","name":"publication_kernel","permissive":true,"roles":["mip_publication_owner_v2"],"using":"true"}],"relation":"mip_cutover_authority.publication_selections"}]$table_matrix$::jsonb) loop
  rel:=to_regclass(r->>'relation');
  if rel is null or not exists(select 1 from pg_class where oid=rel and relowner='mip_cutover_schema_owner_v1'::regrole and relrowsecurity and relforcerowsecurity) then
   raise exception 'mip_native_final_chain_table_configuration: %',r->>'relation';end if;
  if exists(select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
   where c.oid=rel and a.grantee<>c.relowner and (a.grantee=0 or a.is_grantable)) then raise exception 'mip_native_final_chain_table_grant_option: %',rel;end if;
  select coalesce(jsonb_agg(x.token order by x.token),'[]'::jsonb) into actual from
   (select g.rolname||':'||a.privilege_type token from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    left join pg_roles g on g.oid=a.grantee where c.oid=rel and a.grantee<>c.relowner) x;
  if actual<>r->'acl' then raise exception 'mip_native_final_chain_table_acl: %',rel;end if;
  select coalesce(jsonb_agg(x.token order by x.token),'[]'::jsonb) into actual from
   (select g.rolname||':'||a.privilege_type||':'||att.attname token from pg_attribute att join pg_class c on c.oid=att.attrelid
    cross join lateral aclexplode(att.attacl) a left join pg_roles g on g.oid=a.grantee where att.attrelid=rel and att.attnum>0 and not att.attisdropped and a.grantee<>c.relowner) x;
  if actual<>r->'columns' or exists(select 1 from pg_attribute att join pg_class c on c.oid=att.attrelid cross join lateral aclexplode(att.attacl) a
   where att.attrelid=rel and att.attnum>0 and not att.attisdropped and a.grantee<>c.relowner and (a.grantee=0 or a.is_grantable)) then
   raise exception 'mip_native_final_chain_column_acl: %',rel;end if;
  foreach role_name in array actors loop
   foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
    if has_table_privilege(role_name,rel,privilege_name) is distinct from
     (role_name='mip_cutover_schema_owner_v1' or (r->'acl') ? (role_name||':'||privilege_name)) then
     raise exception 'mip_native_final_chain_effective_table: %, %, %',rel,role_name,privilege_name;end if;
   end loop;
  end loop;
  select coalesce(jsonb_agg(x.policy order by x.name),'[]'::jsonb) into actual from
   (select pol.polname name,jsonb_build_object('name',pol.polname,'command',pol.polcmd::text,
     'roles',(select jsonb_agg(case when q=0 then 'PUBLIC' else q::regrole::text end order by case when q=0 then 'PUBLIC' else q::regrole::text end) from unnest(pol.polroles) q),
     'permissive',pol.polpermissive,'using',pg_get_expr(pol.polqual,pol.polrelid),'check',pg_get_expr(pol.polwithcheck,pol.polrelid)) policy from pg_policy pol where pol.polrelid=rel) x;
  if actual<>r->'policies' then raise exception 'mip_native_final_chain_policy: %',rel;end if;
  if not exists(select 1 from pg_trigger where tgrelid=rel and not tgisinternal and tgenabled='O' and tgtype=34 and tgfoid='comparison_qualification.reject_rewrite()'::regprocedure)
   or ((r->>'immutable')::boolean and not exists(select 1 from pg_trigger where tgrelid=rel and not tgisinternal and tgenabled='O' and tgtype=27 and tgfoid='comparison_qualification.reject_rewrite()'::regprocedure)) then
   raise exception 'mip_native_final_chain_immutable: %',rel;end if;
 end loop;
 if (select count(*) from pg_trigger where tgrelid='mip_identity.publication_reviews'::regclass and not tgisinternal and tgfoid='mip_identity.guard_publication_review_retention()'::regprocedure)<>1
  or not exists(select 1 from pg_trigger where tgrelid='mip_identity.publication_reviews'::regclass and tgname='publication_review_retention' and tgtype=7 and tgenabled='O' and tgnargs=0 and tgqual is null and tgattr=''::int2vector
   and tgfoid='mip_identity.guard_publication_review_retention()'::regprocedure) then raise exception 'mip_native_final_chain_review_retention_trigger';end if;
end $final_retention_chain_permissions$;

commit;
