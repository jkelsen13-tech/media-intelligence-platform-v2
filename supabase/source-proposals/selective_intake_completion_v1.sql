-- UNAPPLIED SOURCE-ONLY follow-on. Same selective RPC identity; no roles/grants/new engine.
-- A fresh independently accepted POST-DEPENDENCY installed catalogue is mandatory.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local search_path=pg_catalog;
lock table evidence_pipeline.investigations,evidence_pipeline.investigation_versions,evidence_pipeline.investigation_memberships,
 evidence_pipeline.selective_criteria_versions,evidence_pipeline.selective_source_authorizations,
 evidence_pipeline.selective_authorization_revocations,evidence_pipeline.selective_discovery_receipts,
 evidence_pipeline.selective_fetch_permits,evidence_pipeline.selective_execution_receipts,
 evidence_pipeline.investigation_selective_intake_receipts,evidence_pipeline.assessments,evidence_pipeline.article_captures,
 evidence_pipeline.import_receipts in share row exclusive mode;
do $preflight$
declare actual jsonb; expected text:=current_setting('mip.selective_completion_expected_catalog',true);
begin
-- BEGIN SELECTIVE COMPLETION CATALOG
with names as (
 select distinct p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='evidence_pipeline' or (n.nspname='public' and p.proname like 'mip\_%' escape '\')
 union select unnest(array['selective_metadata_decision','mip_selective_execution_v1'])
), targets as (select unnest(array['selective_criteria_versions','selective_source_authorizations','selective_authorization_revocations','selective_discovery_receipts','selective_fetch_permits','selective_execution_receipts','_selective_criteria_versions','_selective_source_authorizations','_selective_authorization_revocations','_selective_discovery_receipts','_selective_fetch_permits','_selective_execution_receipts','selective_criteria_versions_pkey','selective_source_authorizations_pkey','selective_authorization_revocations_pkey','selective_discovery_receipts_pkey','selective_fetch_permits_pkey','selective_execution_receipts_pkey','selective_discovery_receipts_ordinal_seq','selective_execution_receipts_ordinal_seq','selective_discovery_receipts_ordinal_key','selective_execution_receipts_ordinal_key','selective_discovery_head','selective_fetch_permits_selection_id_key','selective_execution_receipts_previous_execution_id_key','selective_execution_receipts_declaration_receipt_id_key','selective_execution_receipts_reconsideration_receipt_id_key']) name)
select jsonb_build_object(
 'database',current_database(),'server_version_num',current_setting('server_version_num'),'installer',current_user,
 'schemas',(select jsonb_agg(jsonb_build_object('name',n.nspname,'owner',pg_get_userbyid(n.nspowner),'acl',(select coalesce(jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(z.grantor),'grantee',case when z.grantee=0 then 'PUBLIC' else pg_get_userbyid(z.grantee) end,'privilege',z.privilege_type,'grantable',z.is_grantable) order by pg_get_userbyid(z.grantor),case when z.grantee=0 then 'PUBLIC' else pg_get_userbyid(z.grantee) end,z.privilege_type,z.is_grantable),'[]') from aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner)))z)) order by n.nspname) from pg_namespace n where n.nspname not like 'pg_%' and n.nspname<>'information_schema'),
 'default_acls',(select coalesce(jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',coalesce(n.nspname,'GLOBAL'),'kind',d.defaclobjtype,'acl',(select coalesce(jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(z.grantor),'grantee',case when z.grantee=0 then 'PUBLIC' else pg_get_userbyid(z.grantee) end,'privilege',z.privilege_type,'grantable',z.is_grantable) order by pg_get_userbyid(z.grantor),case when z.grantee=0 then 'PUBLIC' else pg_get_userbyid(z.grantee) end,z.privilege_type,z.is_grantable),'[]') from aclexplode(d.defaclacl)z)) order by pg_get_userbyid(d.defaclrole),coalesce(n.nspname,'GLOBAL'),d.defaclobjtype),'[]') from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace),
 'relations',(select jsonb_agg(jsonb_build_object('identity',c.oid::regclass::text,'owner',pg_get_userbyid(c.relowner),'kind',c.relkind,'acl',(select coalesce(jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(z.grantor),'grantee',case when z.grantee=0 then 'PUBLIC' else pg_get_userbyid(z.grantee) end,'privilege',z.privilege_type,'grantable',z.is_grantable) order by pg_get_userbyid(z.grantor),case when z.grantee=0 then 'PUBLIC' else pg_get_userbyid(z.grantee) end,z.privilege_type,z.is_grantable),'[]') from aclexplode(coalesce(c.relacl,acldefault(case when c.relkind='S' then 'S'::"char" else 'r'::"char" end,c.relowner)))z),
  'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'options',c.reloptions,'definition',case when c.relkind in ('v','m') then pg_get_viewdef(c.oid,true) when c.relkind in ('i','I') then pg_get_indexdef(c.oid) else null end,
  'columns',(select coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid),'acl',(select coalesce(jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(z.grantor),'grantee',case when z.grantee=0 then 'PUBLIC' else pg_get_userbyid(z.grantee) end,'privilege',z.privilege_type,'grantable',z.is_grantable) order by pg_get_userbyid(z.grantor),case when z.grantee=0 then 'PUBLIC' else pg_get_userbyid(z.grantee) end,z.privilege_type,z.is_grantable),'[]') from aclexplode(a.attacl)z)) order by a.attnum),'[]') from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
  'constraints',(select coalesce(jsonb_agg(jsonb_build_object('name',x.conname,'definition',pg_get_constraintdef(x.oid)) order by x.conname),'[]') from pg_constraint x where x.conrelid=c.oid),
  'policies',(select coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'cmd',p.polcmd,'permissive',p.polpermissive,'roles',(select jsonb_agg(case when r=0 then 'PUBLIC' else pg_get_userbyid(r) end order by case when r=0 then 'PUBLIC' else pg_get_userbyid(r) end) from unnest(p.polroles)r),'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname),'[]') from pg_policy p where p.polrelid=c.oid),
  'triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid),'function',pg_get_functiondef(t.tgfoid)) order by t.tgname),'[]') from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal),
  'sequence',case when c.relkind='S' then (select jsonb_build_object('type',format_type(seq.seqtypid,null),'start',seq.seqstart::text,'increment',seq.seqincrement::text,'min',seq.seqmin::text,'max',seq.seqmax::text,'cache',seq.seqcache::text,'cycle',seq.seqcycle) from pg_sequence seq where seq.seqrelid=c.oid) else null end) order by c.oid::regclass::text)
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='evidence_pipeline' or (n.nspname='public' and c.relname in ('articles','nodes','pipeline_config','geographic_places','mip_profiles'))),
 'functions',(select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'schema',n.nspname,'owner',pg_get_userbyid(p.proowner),'acl',(select coalesce(jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(z.grantor),'grantee',case when z.grantee=0 then 'PUBLIC' else pg_get_userbyid(z.grantee) end,'privilege',z.privilege_type,'grantable',z.is_grantable) order by pg_get_userbyid(z.grantor),case when z.grantee=0 then 'PUBLIC' else pg_get_userbyid(z.grantee) end,z.privilege_type,z.is_grantable),'[]') from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))z),'definition',pg_get_functiondef(p.oid)) order by p.oid::regprocedure::text),'[]') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in (select proname from names)),
 'roles',(select jsonb_agg(jsonb_build_object('name',r.rolname,'login',r.rolcanlogin,'inherit',r.rolinherit,'superuser',r.rolsuper,'bypass_rls',r.rolbypassrls,'create_role',r.rolcreaterole,'create_db',r.rolcreatedb,'replication',r.rolreplication,'connection_limit',r.rolconnlimit,'valid_until_epoch',extract(epoch from r.rolvaliduntil)::text,'config',r.rolconfig,
  'memberships',(select coalesce(jsonb_agg(jsonb_build_object('role',pg_get_userbyid(m.roleid),'grantor',pg_get_userbyid(m.grantor),'admin',m.admin_option,'inherit',to_jsonb(m)->'inherit_option','set',to_jsonb(m)->'set_option') order by pg_get_userbyid(m.roleid),pg_get_userbyid(m.grantor)),'[]') from pg_auth_members m where m.member=r.oid)) order by r.rolname) from pg_roles r),
 'target_relations',(select coalesce(jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner)) order by c.relname),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='evidence_pipeline' and c.relname in (select name from targets)),
 'target_types',(select coalesce(jsonb_agg(jsonb_build_object('name',t.typname,'kind',t.typtype,'owner',pg_get_userbyid(t.typowner)) order by t.typname),'[]') from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='evidence_pipeline' and t.typname in (select name from targets)),
 'target_signatures',jsonb_build_array(to_regprocedure('evidence_pipeline.selective_metadata_decision(jsonb,jsonb)')::text,to_regprocedure('public.mip_selective_execution_v1(text,jsonb)')::text)
) into actual;
-- END SELECTIVE COMPLETION CATALOG
 if nullif(expected,'') is null or actual is distinct from expected::jsonb then
  raise exception 'selective completion exact installed catalogue missing or drifted';end if;
 if current_user in ('anon','authenticated','service_role') or current_user is distinct from
  (select pg_get_userbyid(nspowner) from pg_namespace where nspname='evidence_pipeline') or current_user is distinct from
  (select pg_get_userbyid(proowner) from pg_proc where oid=to_regprocedure('public.mip_selective_execution_v1(text,jsonb)')) then
  raise exception 'exact existing selective schema and function owner required';end if;
end $preflight$;

create or replace function public.mip_selective_execution_v1(p_action text,p_input jsonb default '{}') returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare iid uuid; uid uuid; vid uuid; sid uuid; expected uuid; rid uuid; fp text; head uuid;
  member evidence_pipeline.investigation_memberships; authz evidence_pipeline.selective_source_authorizations;
  criteria evidence_pipeline.selective_criteria_versions; sel evidence_pipeline.selective_discovery_receipts;
  permit evidence_pipeline.selective_fetch_permits; execution evidence_pipeline.selective_execution_receipts;
  prior_execution evidence_pipeline.selective_execution_receipts; post evidence_pipeline.investigation_selective_intake_receipts;
  reconsideration evidence_pipeline.investigation_selective_intake_receipts; a evidence_pipeline.assessments;
  decision jsonb; doc jsonb; metadata jsonb; annotated jsonb; input jsonb; job evidence_pipeline.import_jobs;
  job_id uuid; token uuid; cap evidence_pipeline.article_captures;
  continuation jsonb; phase text; native_input jsonb; candidate evidence_pipeline.evidence_candidates;
  current_version evidence_pipeline.investigation_versions; current_observation evidence_pipeline.investigation_observations;
  supplied_observation evidence_pipeline.investigation_observations; allowed_scope uuid[]; supplied_scope uuid[];
  lock_key text; canonical_payload jsonb; progress jsonb; child_hex text; completed_version uuid; completed_observation uuid;
begin
  if p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>147456 then
    raise exception using errcode='22023',message='invalid selective execution input'; end if;
  if p_action='select' then
    perform evidence_pipeline.workspace_keys(p_input,array['user_id','investigation_id','version_id','selection_id','previous_selection_id','authorization_id','metadata']);
  elsif p_action='permit' then
    perform evidence_pipeline.workspace_keys(p_input,array['user_id','investigation_id','selection_id','permit_id']);
  elsif p_action='read' then
    perform evidence_pipeline.workspace_keys(p_input,array['user_id','investigation_id','selection_id']);
  elsif p_action='capture' then
    perform evidence_pipeline.workspace_keys(p_input,array['user_id','investigation_id','selection_id','permit_id'],array['article','continuation']);
    if (p_input ? 'article')=(p_input ? 'continuation') then raise exception using errcode='22023',message='one capture or retained continuation required';end if;
  elsif p_action='annotate' then
    perform evidence_pipeline.workspace_keys(p_input,array['user_id','investigation_id','selection_id','execution_id','previous_execution_id','assessment_id','annotation'],array['reconsideration_receipt_id']);
  elsif p_action='reconsider' then
    perform evidence_pipeline.workspace_keys(p_input,array['user_id','investigation_id','selection_id','previous_execution_id','annotation']);
  else raise exception using errcode='22023',message='unsupported selective execution action';end if;
  iid:=evidence_pipeline.workspace_uuid(p_input->'investigation_id');uid:=evidence_pipeline.workspace_uuid(p_input->'user_id');
  sid:=evidence_pipeline.workspace_uuid(p_input->'selection_id');
  perform pg_advisory_xact_lock(hashtextextended('mip-workspace:'||iid::text,0));
  select * into member from evidence_pipeline.investigation_memberships where investigation_id=iid and user_id=uid for update;
  if not found or member.access_role='revoked' or (p_action<>'read' and member.access_role<>'reviewer') then
    raise exception using errcode='42501',message='selective execution access denied';end if;
  if p_action='select' then
    fp:=encode(sha256(convert_to(p_input::text,'UTF8')),'hex');
    select * into sel from evidence_pipeline.selective_discovery_receipts where selection_id=sid;
    if found then
      if sel.investigation_id<>iid or sel.actor_id<>uid or sel.fingerprint<>fp then raise exception using errcode='23505',message='selection identity conflict';end if;
      return (to_jsonb(sel)-'fingerprint')||jsonb_build_object('ordinal',sel.ordinal::text,'replayed',true,'publicly_eligible',false);end if;
    vid:=evidence_pipeline.workspace_uuid(p_input->'version_id');
    if not exists(select 1 from evidence_pipeline.investigations where id=iid and current_version_id=vid) then
      raise exception using errcode='40001',message='selection workspace head changed';end if;
    select * into authz from evidence_pipeline.selective_source_authorizations where authorization_id=evidence_pipeline.workspace_uuid(p_input->'authorization_id') for update;
    if not found or authz.investigation_id<>iid or authz.actor_id<>uid then raise exception using errcode='42501',message='source authorization unavailable';end if;
    metadata:=p_input->'metadata';
    if metadata->>'url' is distinct from authz.source_url then raise exception using errcode='42501',message='endpoint outside authorization';end if;
    select * into criteria from evidence_pipeline.selective_criteria_versions where criteria_key=authz.criteria_key and criteria_version=authz.criteria_version;
    decision:=evidence_pipeline.selective_metadata_decision(criteria.rules,metadata);
    select r.selection_id into head from evidence_pipeline.selective_discovery_receipts r where r.investigation_id=iid and r.metadata->>'url'=authz.source_url order by r.ordinal desc limit 1;
    expected:=(p_input->>'previous_selection_id')::uuid;
    if head is distinct from expected then raise exception using errcode='40001',message='discovery receipt head changed';end if;
    insert into evidence_pipeline.selective_discovery_receipts(selection_id,investigation_id,actor_id,version_id,authorization_id,previous_selection_id,
      criteria_key,criteria_version,policy_version,metadata,disposition,reason,fingerprint)
      values(sid,iid,uid,vid,authz.authorization_id,expected,criteria.criteria_key,criteria.criteria_version,criteria.policy_version,metadata,
        decision->>'disposition',decision->>'reason',fp) returning * into sel;
    return (to_jsonb(sel)-'fingerprint')||jsonb_build_object('ordinal',sel.ordinal::text,'replayed',false,'publicly_eligible',false);
  end if;
  select * into sel from evidence_pipeline.selective_discovery_receipts where selection_id=sid and investigation_id=iid;
  if not found then raise exception using errcode='42501',message='selection unavailable';end if;
  select * into criteria from evidence_pipeline.selective_criteria_versions where criteria_key=sel.criteria_key and criteria_version=sel.criteria_version;
  select * into execution from evidence_pipeline.selective_execution_receipts where selection_id=sid order by ordinal desc limit 1;
  if p_action='read' then
    -- Retained payload/progress is visible only to this selection's assigned producer.
    -- Viewer history remains available through the existing declaration/selection owners.
    progress:=null;
    if sel.actor_id=uid and member.access_role='reviewer' then
      select * into permit from evidence_pipeline.selective_fetch_permits where selection_id=sid;
      select c.* into cap from evidence_pipeline.article_captures c join evidence_pipeline.import_receipts r on r.job_id=c.job_id
        where r.run_id='selective:'||sid::text;
      if (select count(*) from evidence_pipeline.import_receipts where run_id='selective:'||sid::text)>1 then
        raise exception using errcode='40001',message='ambiguous retained selective progress';end if;
      progress:=jsonb_build_object('contract_version','selective-retained-progress-1',
        'permit',case when permit.permit_id is null then null else to_jsonb(permit) end,
        'capture',case when cap.id is null then null else jsonb_build_object('capture_id',cap.id,'payload',cap.payload,'content_hash',cap.content_hash) end,
        'reacquisition_allowed',false,'publicly_eligible',false);
    end if;
    select * into post from evidence_pipeline.investigation_selective_intake_receipts where receipt_id=execution.declaration_receipt_id;
    return jsonb_build_object('selection',(to_jsonb(sel)-'fingerprint')||jsonb_build_object('ordinal',sel.ordinal::text),'criteria',to_jsonb(criteria),
      'execution',case when execution.execution_id is null then null else to_jsonb(execution)||jsonb_build_object('ordinal',execution.ordinal::text) end,
      'declaration',case when post.receipt_id is null then null else evidence_pipeline.selective_intake_payload(post) end,'progress',progress,'publicly_eligible',false);
  end if;
  if sel.actor_id<>uid then raise exception using errcode='42501',message='selection producer mismatch';end if;
  if p_action='capture' then
    select * into permit from evidence_pipeline.selective_fetch_permits where selection_id=sid and permit_id=(p_input->>'permit_id')::uuid;
    if not found or sel.disposition<>'analyze_now' or (p_input ? 'article' and p_input->'article'->>'url' is distinct from sel.metadata->>'url') then
      raise exception using errcode='42501',message='capture permit mismatch';end if;
    select * into authz from evidence_pipeline.selective_source_authorizations where authorization_id=sel.authorization_id for update;
    if not authz.enabled or not authz.retain_allowed or not authz.analyze_allowed or authz.expires_at<=clock_timestamp()
      or authz.actor_id<>uid or authz.investigation_id<>iid or authz.source_url is distinct from sel.metadata->>'url'
      or criteria.criteria_key is null or criteria.policy_version is distinct from sel.policy_version
      or authz.criteria_key is distinct from sel.criteria_key or authz.criteria_version is distinct from sel.criteria_version
      or exists(select 1 from evidence_pipeline.selective_authorization_revocations where authorization_id=authz.authorization_id) then
      raise exception using errcode='42501',message='capture rights expired or binding changed';end if;
    select r.selection_id into head from evidence_pipeline.selective_discovery_receipts r
      where r.investigation_id=iid and r.metadata->>'url'=authz.source_url order by r.ordinal desc limit 1;
    if head is distinct from sid then raise exception using errcode='40001',message='retained selection superseded';end if;
    select c.* into cap from evidence_pipeline.article_captures c join evidence_pipeline.import_receipts r on r.job_id=c.job_id
      where r.run_id='selective:'||sid::text;
    if (select count(*) from evidence_pipeline.import_receipts where run_id='selective:'||sid::text)>1 then
      raise exception using errcode='40001',message='ambiguous retained selective progress';end if;
    if p_input ? 'continuation' then
      continuation:=p_input->'continuation';
      perform evidence_pipeline.workspace_keys(continuation,array['kind','expected_version_id','previous_execution_id','input']);
      perform evidence_pipeline.workspace_choice(continuation->'kind',array['candidate','analyze','observe','version']);
      phase:=continuation->>'kind';
      native_input:=continuation->'input';
      expected:=(continuation->>'previous_execution_id')::uuid;
      if execution.execution_id is distinct from expected then raise exception using errcode='40001',message='retained execution head changed';end if;
      vid:=evidence_pipeline.workspace_uuid(continuation->'expected_version_id');
      select v.* into current_version from evidence_pipeline.investigations i join evidence_pipeline.investigation_versions v on v.id=i.current_version_id
        where i.id=iid and v.id=vid;
      if not found or cap.id is null then raise exception using errcode='40001',message='retained capture or workspace head unavailable';end if;
      select * into current_observation from evidence_pipeline.investigation_observations where id=current_version.observation_id;
      if execution.execution_id is null then
        child_hex:=encode(sha256(convert_to('["'||sid::text||'","version"]','UTF8')),'hex');
        completed_version:=(substr(child_hex,1,8)||'-'||substr(child_hex,9,4)||'-5'||substr(child_hex,14,3)||'-a'||substr(child_hex,18,3)||'-'||substr(child_hex,21,12))::uuid;
        child_hex:=encode(sha256(convert_to('["'||sid::text||'","observation"]','UTF8')),'hex');
        completed_observation:=(substr(child_hex,1,8)||'-'||substr(child_hex,9,4)||'-5'||substr(child_hex,14,3)||'-a'||substr(child_hex,18,3)||'-'||substr(child_hex,21,12))::uuid;
        if vid not in (sel.version_id,completed_version) or (vid=completed_version and
          (current_version.predecessor_id is distinct from sel.version_id or current_version.observation_id is distinct from completed_observation)) then
          raise exception using errcode='40001',message='retained selection workspace head changed';end if;
      end if;
      select c.* into candidate from evidence_pipeline.evidence_candidates c where c.capture_id=cap.id
        and c.candidate_key='selective-exact-span' and c.extractor_version='selective-exact-span-1';
      if phase='candidate' then
        if execution.execution_id is not null or native_input->>'capture_id' is distinct from cap.id::text
          or native_input->>'candidate_key' is distinct from 'selective-exact-span' or native_input->>'extractor_version' is distinct from 'selective-exact-span-1'
          or native_input->>'candidate_kind' is distinct from 'claim' then
          raise exception using errcode='22023',message='retained candidate binding mismatch';end if;
        return public.mip_pipeline_v1('candidate',native_input);
      end if;
      if candidate.id is null then raise exception using errcode='40001',message='retained candidate unavailable';end if;
      if execution.execution_id is not null then
        select * into post from evidence_pipeline.investigation_selective_intake_receipts where receipt_id=execution.declaration_receipt_id;
        if post.candidate_id<>candidate.id or post.capture_id<>cap.id then raise exception using errcode='40001',message='retained declaration binding changed';end if;
      end if;
      perform pg_advisory_xact_lock(hashtextextended('mip-url:'||evidence_pipeline.canonical_url(authz.source_url),0));
      if exists(select 1 from evidence_pipeline.assessments pending_assessment where pending_assessment.candidate_id=candidate.id
        and pending_assessment.algorithm_key='selective-exact-span-baseline' and pending_assessment.algorithm_version='1'
        and (execution.execution_id is null or pending_assessment.predecessor_id=execution.assessment_id)
        and (exists(select 1 from evidence_pipeline.assessment_causes(pending_assessment.id)) or exists(select 1 from evidence_pipeline.assessments where predecessor_id=pending_assessment.id))) then
        raise exception using errcode='40001',message='retained analysis drift requires explicit reconciliation';end if;
      if phase='analyze' then
        if native_input->>'candidate_id' is distinct from candidate.id::text
          or native_input->>'algorithm_key' is distinct from 'selective-exact-span-baseline' or native_input->>'algorithm_version' is distinct from '1'
          or native_input->>'outcome' is distinct from 'insufficient_evidence' or native_input->'parents' is distinct from '[]'::jsonb
          or (native_input ? 'extra_positions' and native_input->'extra_positions' is distinct from '[]'::jsonb)
          or (native_input->>'predecessor_id')::uuid is distinct from execution.assessment_id then
          raise exception using errcode='22023',message='retained analysis binding mismatch';end if;
        return public.mip_assessments_v1('append',native_input);
      end if;
      select array_agg(distinct cid order by cid) into allowed_scope from (
        select unnest(current_observation.scope_candidate_ids) cid union select candidate.id) scope;
      if phase='observe' then
        perform evidence_pipeline.workspace_keys(native_input,array['observation_id','candidate_ids'],array['previous_observation_id']);
        select array_agg(distinct value::uuid order by value::uuid) into supplied_scope from jsonb_array_elements_text(native_input->'candidate_ids');
        if (execution.execution_id is null and (native_input->>'observation_id')::uuid is distinct from completed_observation)
          or supplied_scope is distinct from allowed_scope or (native_input->>'previous_observation_id')::uuid is distinct from
          (case when allowed_scope=current_observation.scope_candidate_ids then current_observation.id else null end) then
          raise exception using errcode='40001',message='retained observation scope or lineage changed';end if;
        return public.mip_investigation_briefings_v1('observe',native_input);
      end if;
      perform evidence_pipeline.workspace_keys(native_input,array['investigation_id','version_id','previous_version_id','observation_id','state','change_reason']);
      select * into supplied_observation from evidence_pipeline.investigation_observations where id=(native_input->>'observation_id')::uuid;
      if (execution.execution_id is null and (native_input->>'version_id')::uuid is distinct from completed_version)
        or native_input->>'investigation_id' is distinct from iid::text or (native_input->>'previous_version_id')::uuid is distinct from vid
        or native_input->'state' is distinct from current_version.state or supplied_observation.scope_candidate_ids is distinct from allowed_scope then
        raise exception using errcode='40001',message='retained version scope or head changed';end if;
      return public.mip_investigation_workspace_v1('put',native_input);
    end if;
    if not authz.acquire_allowed then raise exception using errcode='42501',message='capture acquisition binding expired';end if;
    if not exists(select 1 from evidence_pipeline.investigations where id=iid and current_version_id=sel.version_id) then
      raise exception using errcode='40001',message='capture workspace head changed';end if;
    canonical_payload:=jsonb_build_object('url',evidence_pipeline.canonical_url(p_input->'article'->>'url'),
      'title',btrim(p_input->'article'->>'title'),'outlet',btrim(p_input->'article'->>'outlet'),
      'summary',nullif(p_input->'article'->>'summary',''),'body_text',nullif(p_input->'article'->>'body_text',''),
      'published_at',nullif(p_input->'article'->>'published_at','')::timestamptz);
    if cap.id is not null then
      if cap.payload is distinct from canonical_payload then raise exception using errcode='23505',message='one-use source version conflict';end if;
      select * into job from evidence_pipeline.import_jobs where id=cap.job_id;
      return jsonb_build_object('job_id',job.id,'article_id',cap.article_id,'capture_id',cap.id,'outcome',job.outcome,'payload',cap.payload,'replayed',true);
    end if;
    if permit.valid_until<=clock_timestamp() then raise exception using errcode='40001',message='capture permit expired';end if;
    if octet_length((p_input->'article')::text)>authz.max_bytes then raise exception using errcode='22023',message='capture byte budget exceeded';end if;
    job_id:=evidence_pipeline.enqueue('selective:'||sid::text,p_input->'article');
    select * into job from evidence_pipeline.import_jobs where id=job_id for update;
    if job.state='completed' then
      select c.* into cap from evidence_pipeline.article_captures c where c.job_id=job.id;
      return jsonb_build_object('job_id',job.id,'article_id',cap.article_id,'capture_id',cap.id,'outcome',job.outcome,'payload',cap.payload,'replayed',true);end if;
    if permit.valid_until<=clock_timestamp() or job.state not in ('pending','retry_wait') or job.available_at>clock_timestamp() or job.attempt_count>=5 then
      raise exception using errcode='40001',message='capture delivery or native lease unavailable';end if;
    -- Targeted acquisition uses the SAME native import job/lease/events and finish owner.
    -- It never claims unrelated queued jobs and creates no second evidence queue.
    token:=gen_random_uuid();
    update evidence_pipeline.import_jobs set state='processing',attempt_count=attempt_count+1,lease_token=token,
      lease_expires_at=clock_timestamp()+interval '2 minutes',error_code=null where id=job.id returning * into job;
    insert into evidence_pipeline.job_events(job_id,attempt,state) values(job.id,job.attempt_count,job.state);
    doc:=evidence_pipeline.finish_job(job.id,token);
    select c.* into cap from evidence_pipeline.article_captures c where c.id=(doc->>'capture_id')::uuid;
    return doc||jsonb_build_object('payload',cap.payload);
  end if;
  if p_action='permit' then
    select * into authz from evidence_pipeline.selective_source_authorizations where authorization_id=sel.authorization_id for update;
    select r.selection_id into head from evidence_pipeline.selective_discovery_receipts r where r.investigation_id=iid and r.metadata->>'url'=authz.source_url order by r.ordinal desc limit 1;
    if head is distinct from sid or not exists(select 1 from evidence_pipeline.investigations where id=iid and current_version_id=sel.version_id) then
      raise exception using errcode='40001',message='pre-fetch selection stale';end if;
    if sel.disposition<>'analyze_now' or not authz.enabled or not authz.acquire_allowed or not authz.retain_allowed or not authz.analyze_allowed or authz.expires_at<=clock_timestamp()
      or exists(select 1 from evidence_pipeline.selective_authorization_revocations where authorization_id=authz.authorization_id) then
      raise exception using errcode='42501',message='source acquisition denied';end if;
    if exists(select 1 from evidence_pipeline.selective_fetch_permits where selection_id=sid) then
      raise exception using errcode='40001',message='permit already consumed; inspect durable state';end if;
    if (select count(*) from evidence_pipeline.selective_fetch_permits where authorization_id=authz.authorization_id)>=authz.max_requests then
      raise exception using errcode='42501',message='source request quota exhausted';end if;
    rid:=evidence_pipeline.workspace_uuid(p_input->'permit_id');
    insert into evidence_pipeline.selective_fetch_permits(permit_id,selection_id,authorization_id,valid_until)
      values(rid,sid,authz.authorization_id,least(authz.expires_at,clock_timestamp()+interval '30 seconds')) returning * into permit;
    return to_jsonb(permit)||jsonb_build_object('url',authz.source_url,'max_bytes',authz.max_bytes,'format',authz.format,'publicly_eligible',false);
  end if;
  expected:=(p_input->>'previous_execution_id')::uuid;
  if p_action='annotate' then
    rid:=evidence_pipeline.workspace_uuid(p_input->'execution_id');
    select * into prior_execution from evidence_pipeline.selective_execution_receipts where execution_id=rid;
    if found then
      -- Delegate exact request replay validation to the canonical annotation owner.
      annotated:=public.mip_investigation_selective_intake_v1('declare',p_input->'annotation');
      if prior_execution.selection_id<>sid or prior_execution.previous_execution_id is distinct from expected
        or prior_execution.declaration_receipt_id<> (annotated->>'receipt_id')::uuid
        or prior_execution.assessment_id<> (p_input->>'assessment_id')::uuid
        or prior_execution.reconsideration_receipt_id is distinct from (p_input->>'reconsideration_receipt_id')::uuid then
        raise exception using errcode='23505',message='registered execution identity conflict';end if;
      return to_jsonb(prior_execution)||jsonb_build_object('ordinal',prior_execution.ordinal::text,'replayed',true,'publicly_eligible',false);end if;
  end if;
  if execution.execution_id is distinct from expected then raise exception using errcode='40001',message='registered execution head changed';end if;
  select * into authz from evidence_pipeline.selective_source_authorizations where authorization_id=sel.authorization_id for update;
  if not authz.enabled or not authz.retain_allowed or not authz.analyze_allowed or authz.expires_at<=clock_timestamp()
    or exists(select 1 from evidence_pipeline.selective_authorization_revocations where authorization_id=authz.authorization_id) then
    raise exception using errcode='42501',message='registered analysis authorization unavailable';end if;
  if authz.actor_id<>uid or authz.investigation_id<>iid or authz.source_url is distinct from sel.metadata->>'url'
    or criteria.criteria_key is null or criteria.policy_version is distinct from sel.policy_version
    or authz.criteria_key is distinct from sel.criteria_key or authz.criteria_version is distinct from sel.criteria_version then
    raise exception using errcode='42501',message='registered authorization binding changed';end if;
  select r.selection_id into head from evidence_pipeline.selective_discovery_receipts r
    where r.investigation_id=iid and r.metadata->>'url'=authz.source_url order by r.ordinal desc limit 1;
  if head is distinct from sid then raise exception using errcode='40001',message='registered selection superseded';end if;
  input:=p_input->'annotation';
  if input->>'user_id' is distinct from uid::text or input->>'investigation_id' is distinct from iid::text then
    raise exception using errcode='42501',message='annotation owner mismatch';end if;
  if p_action='reconsider' then
    if execution.execution_id is null or input->>'declaration_receipt_id' is distinct from execution.declaration_receipt_id::text then
      raise exception using errcode='40001',message='registered declaration changed';end if;
    annotated:=public.mip_investigation_selective_intake_v1('reconsider',input);
    metadata:=jsonb_set(sel.metadata,'{signals}',jsonb_build_array(case when annotated->'result'->'trigger'->>'kind'='dependency_change' then 'correction' else 'new_relevant_input' end));
    decision:=evidence_pipeline.selective_metadata_decision(criteria.rules,metadata);
    return jsonb_build_object('receipt',annotated,'decision',decision,'publicly_eligible',false);
  end if;
  if execution.execution_id is null then
    if not exists(select 1 from evidence_pipeline.selective_fetch_permits where selection_id=sid) then
      raise exception using errcode='42501',message='source execution has no permit';end if;
    decision:=jsonb_build_object('disposition',sel.disposition);
  else
    select * into reconsideration from evidence_pipeline.investigation_selective_intake_receipts where receipt_id=(p_input->>'reconsideration_receipt_id')::uuid;
    if not found or reconsideration.investigation_id<>iid or reconsideration.actor_id<>uid or reconsideration.declaration_receipt_id<>execution.declaration_receipt_id
      or input->>'previous_receipt_id' is distinct from reconsideration.receipt_id::text then
      raise exception using errcode='40001',message='registered reconsideration binding changed';end if;
    metadata:=jsonb_set(sel.metadata,'{signals}',jsonb_build_array(case when reconsideration.result->'trigger'->>'kind'='dependency_change' then 'correction' else 'new_relevant_input' end));
    decision:=evidence_pipeline.selective_metadata_decision(criteria.rules,metadata);
  end if;
  doc:=input->'result';
  if doc->>'method_key' is distinct from criteria.criteria_key or doc->>'method_version' is distinct from criteria.criteria_version
    or doc->>'policy_version' is distinct from criteria.policy_version or doc->>'disposition' is distinct from decision->>'disposition'
    or doc->'domain_declarations' is distinct from sel.metadata->'domain_declarations' then
    raise exception using errcode='22023',message='annotation does not execute registered criteria';end if;
  select * into a from evidence_pipeline.assessments where id=(p_input->>'assessment_id')::uuid;
  if not found or a.candidate_id<>(doc->>'candidate_id')::uuid or a.algorithm_key<>'selective-exact-span-baseline'
    or a.algorithm_version<>'1' or a.outcome<>'insufficient_evidence'
    or not exists(select 1 from evidence_pipeline.article_captures c join evidence_pipeline.import_receipts r on r.job_id=c.job_id
      where c.id=(doc->>'capture_id')::uuid and c.payload->>'url'=sel.metadata->>'url' and r.run_id='selective:'||sid::text) then
    raise exception using errcode='22023',message='registered analysis/capture binding mismatch';end if;
  -- Reuse the native source/version advisory locks before checking current causes.
  -- Frozen observation freshness alone cannot authorize a new execution receipt.
  for lock_key in select distinct key from (
    select 'mip-url:'||i.canonical_url key from evidence_pipeline.article_identities i
      where ('article:'||i.article_id::text)=any(a.watch_keys)
    union select 'mip-version:'||k from unnest(a.watch_keys) k where k not like 'article:%') locks order by key loop
    perform pg_advisory_xact_lock(hashtextextended(lock_key,0));
  end loop;
  if exists(select 1 from evidence_pipeline.assessment_causes(a.id)) or exists(select 1 from evidence_pipeline.assessments where predecessor_id=a.id) then
    raise exception using errcode='40001',message='registered analysis changed after observation';end if;
  if not exists(select 1 from jsonb_array_elements(doc->'reconsideration_triggers') t where t->>'kind'='dependency_change' and t->>'assessment_id'=a.id::text) then
    raise exception using errcode='22023',message='registered analysis dependency missing';end if;
  annotated:=public.mip_investigation_selective_intake_v1('declare',input);
  insert into evidence_pipeline.selective_execution_receipts(execution_id,selection_id,previous_execution_id,declaration_receipt_id,reconsideration_receipt_id,assessment_id,disposition)
    values(rid,sid,expected,(annotated->>'receipt_id')::uuid,reconsideration.receipt_id,a.id,decision->>'disposition') returning * into execution;
  return to_jsonb(execution)||jsonb_build_object('ordinal',execution.ordinal::text,'replayed',false,'publicly_eligible',false);
end $$;
commit;
