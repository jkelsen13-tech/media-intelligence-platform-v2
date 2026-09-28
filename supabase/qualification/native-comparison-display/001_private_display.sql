-- Binding-keyed private display. No tables, source grants, public writes or publication eligibility.
begin;
set local lock_timeout='5s';
grant mip_arc_native_owner,mip_publication_owner_v2 to current_user with set true;
create schema mip_native_display authorization mip_arc_native_owner;
revoke all on schema mip_native_display from public;
grant usage on schema mip_native_display to mip_mentions_gateway,mip_publication_owner_v2;
grant create on schema mip_native_display to mip_publication_owner_v2;
set role mip_arc_native_owner;
create function mip_native_display.contract(k text) returns jsonb
language sql immutable set search_path='' as $contract$
 select '{"display":{"contract":"text","projection_id":"uuid","candidate_id":"uuid","article_id":"uuid","arc_id":"uuid","node":{"label":"text?","type":"text","description":"text","summary":"text","confidence":"number","occurred_at":"text?"},"source":{"outlet":"text","headline":"text?","url":"url","published_at":"text?"},"event":{"title":"text?","category":"text","confidence":"text","occurred_at":"text?","description":"text"},"edge":{"$nullable":{"source_id":"uuid","target_projection_id":"uuid","type":"text","weight":"text","label":"text","signal_source":"text","doc_strength":"text","claimed_by":"text","reliability":"number","counterfactual_test":"text"}},"milestone_outcomes":[{"milestone_id":"uuid","outcome":"text"},64],"vector":{"state":"text","centroid_updated":"boolean"},"state":"text","approval_allowed":"boolean","publication_allowed":"boolean","attached":"boolean"},"comparison":{"event":{"id":"uuid","canonical_title":"text","status":"text","comparison_validation_state":"text"},"sources":[{"article_id":"uuid","capture_id":"uuid","content_hash":"hash","publisher_url":"url?","publisher":"text?","publication":{"kind":"text","at":"text?","source_field":"text"}},32],"claims":[{"event_id":"uuid","claim_key":"text","canonical_text":"text","thin_extraction":"boolean","status":"text","rule_version":"text"},128],"evidence":[{"article_id":"uuid","claim_key":"text","capture_id":"uuid","content_hash":"hash","candidate_id":"uuid","source_field":"text","span_start":"number","span_end":"number","span_units":"text","excerpt":"passage","field_hash":"hash","extractor_version":"text","candidate_review_state":"text","review_revision":"uuid"},128],"occurrence":{"kind":"text","state":"text","start":"text?","end":"text?","precision":"text","reason":"text"},"retained_event_date_proxy":{"kind":"text","basis":"text","occurrence_verified":"boolean","start":"text?","end":"text?","source_fields":["text",2],"precision":"text"},"observation":{"kind":"text","at":"text?"},"explanations":[{"assertion_id":"text","assertion_type":"text","supporting_passage":"passage","rule_version":"text","provenance_class":"text","state":"text","review_status":"text","reviewed_at":"text?","remaining_uncertainty":"text?","falsification_condition":"text"},128],"evidence_links":[{"id":"uuid","claim_key":"text","linked_from_article_id":"uuid","evidence_url":"url","evidence_type":"text?"},128],"corrections":[{"id":"uuid","claim_key":"text","correcting_article_id":"uuid","correction_text":"text","occurred_at":"text?"},128]},"review":{"review_id":"uuid","version":"number","disposition":"text","reason":"text"},"output":{"contract":"text","scope":"uuid","binding_id":"uuid","manifest_hash":"hash","identity":{"native_generation_id":"uuid","projection_id":"uuid","projection_review_id":"uuid","comparison_generation_id":"uuid","comparison_event_id":"uuid","comparison_review_revision":"uuid","comparison_policy_revision":"uuid","release_request":"uuid"},"private_projection":{"review":{"review_id":"uuid","version":"number","disposition":"text","reason":"text"},"display":{"contract":"text","projection_id":"uuid","candidate_id":"uuid","article_id":"uuid","arc_id":"uuid","node":{"label":"text?","type":"text","description":"text","summary":"text","confidence":"number","occurred_at":"text?"},"source":{"outlet":"text","headline":"text?","url":"url","published_at":"text?"},"event":{"title":"text?","category":"text","confidence":"text","occurred_at":"text?","description":"text"},"edge":{"$nullable":{"source_id":"uuid","target_projection_id":"uuid","type":"text","weight":"text","label":"text","signal_source":"text","doc_strength":"text","claimed_by":"text","reliability":"number","counterfactual_test":"text"}},"milestone_outcomes":[{"milestone_id":"uuid","outcome":"text"},64],"vector":{"state":"text","centroid_updated":"boolean"},"state":"text","approval_allowed":"boolean","publication_allowed":"boolean","attached":"boolean"}},"comparison":{"event":{"id":"uuid","canonical_title":"text","status":"text","comparison_validation_state":"text"},"sources":[{"article_id":"uuid","capture_id":"uuid","content_hash":"hash","publisher_url":"url","publisher":"text?","publication":{"kind":"text","at":"text?","source_field":"text"}},32],"claims":[{"event_id":"uuid","claim_key":"text","canonical_text":"text","thin_extraction":"boolean","status":"text","rule_version":"text"},128],"evidence":[{"article_id":"uuid","claim_key":"text","capture_id":"uuid","content_hash":"hash","candidate_id":"uuid","source_field":"text","span_start":"number","span_end":"number","span_units":"text","excerpt":"passage","field_hash":"hash","extractor_version":"text","candidate_review_state":"text","review_revision":"uuid"},128],"occurrence":{"kind":"text","state":"text","start":"text?","end":"text?","precision":"text","reason":"text"},"retained_event_date_proxy":{"kind":"text","basis":"text","occurrence_verified":"boolean","start":"text?","end":"text?","source_fields":["text",2],"precision":"text"},"observation":{"kind":"text","at":"text?"},"explanations":[{"assertion_id":"text","assertion_type":"text","supporting_passage":"passage","rule_version":"text","provenance_class":"text","state":"text","review_status":"text","reviewed_at":"text?","remaining_uncertainty":"text?","falsification_condition":"text"},128],"evidence_links":[{"id":"uuid","claim_key":"text","linked_from_article_id":"uuid","evidence_url":"url","evidence_type":"text?"},128],"corrections":[{"id":"uuid","claim_key":"text","correcting_article_id":"uuid","correction_text":"text","occurred_at":"text?"},128]},"publication_allowed":"boolean","attachment_allowed":"boolean"}}'::jsonb->k
$contract$;
-- Fixed schemas choose every output key; source objects cannot supply nested extras.
create function mip_native_display.project(v jsonb,spec jsonb) returns jsonb
language plpgsql immutable set search_path='' as $project$
declare result jsonb;item record;kind text;t text;
begin
 if spec is null then raise exception 'native_display_contract';end if;
 if jsonb_typeof(spec)='object' then
  if spec?'$nullable' then
   if v is null or v='null'::jsonb then return 'null'::jsonb;end if;
   return mip_native_display.project(v,spec->'$nullable');
  end if;
  if jsonb_typeof(v) is distinct from 'object' then raise exception 'native_display_shape';end if;
  result:='{}';
  for item in select key,value from jsonb_each(spec) loop
   result:=result||jsonb_build_object(item.key,mip_native_display.project(v->item.key,item.value));
  end loop;return result;
 elsif jsonb_typeof(spec)='array' then
  if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v)>(spec->>1)::integer
  then raise exception 'native_display_array_bound';end if;
  result:='[]';for item in select value from jsonb_array_elements(v) loop
   result:=result||jsonb_build_array(mip_native_display.project(item.value,spec->0));
  end loop;return result;
 end if;
 kind:=spec#>>'{}';
 if right(kind,1)='?' then
  if v is null or v='null'::jsonb then return 'null'::jsonb;end if;
  kind:=left(kind,length(kind)-1);
 end if;
 if kind in('boolean','number') then
  if jsonb_typeof(v) is distinct from kind then raise exception 'native_display_scalar';end if;
  return v;
 end if;
 if jsonb_typeof(v) is distinct from 'string' then raise exception 'native_display_scalar';end if;
 t:=v#>>'{}';
 if octet_length(t)>(case kind when 'passage' then 65536 when 'url' then 2048 else 16384 end)
 or(kind='uuid' and t!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
 or(kind='hash' and t!~'^[0-9a-f]{64}$') or(kind='url' and t!~'^https?://')
 then raise exception 'native_display_scalar_bound';end if;
 return v;
end $project$;
revoke all on function mip_native_display.contract(text),mip_native_display.project(jsonb,jsonb) from public;
grant execute on function mip_native_display.contract(text),mip_native_display.project(jsonb,jsonb) to mip_publication_owner_v2;
reset role;
set role mip_publication_owner_v2;
create function mip_native_display.accepted_event(sid uuid,rt text,expected jsonb) returns jsonb
language plpgsql security definer set search_path='' as $event$
declare accepted jsonb;ev jsonb;result jsonb;source_meta jsonb;evidence_meta jsonb;
 release_id uuid;event_id uuid;bytes bigint;claims text[];item jsonb;explanations jsonb:='[]';links jsonb;corrections jsonb;
begin
 perform mip_native_comparison.authorize_session(sid,rt);
 if jsonb_typeof(expected) is distinct from 'object' or octet_length(expected::text)>98304
 or (select count(*) from jsonb_object_keys(expected))<>11
 or exists(select 1 from jsonb_object_keys(expected)k where k<>all(array['generation_id','review_revision','policy_revision','release_request','event_id','runtime_hash','input_hash','output_hash','approved_payload_hash','sources','evidence']))
 then raise exception 'native_display_expected';end if;
 release_id:=(expected->>'release_request')::uuid;event_id:=(expected->>'event_id')::uuid;
 if release_id is null or event_id is null
 or expected->>'runtime_hash' is distinct from encode(sha256(convert_to(rt,'UTF8')),'hex')
 then raise exception 'native_display_expected';end if;
 -- Repeat the bounded accepted reader, not an unchecked stored projection read.
 select octet_length(g.input_payload::text)+octet_length(o.output_payload::text)+octet_length(r.evidence::text)+
 octet_length(r.explanations::text)+octet_length(r.relationship_context::text) into bytes
 from mip_identity.private_releases pr join mip_identity.publication_reviews r on r.revision=pr.review_revision
 join mip_comparison_kernel_v1.generations g on g.id=r.generation_id
 join mip_comparison_kernel_v1.outputs o on o.generation_id=g.id
 where pr.request_id=release_id and pr.runtime=rt
 and g.id=(expected->>'generation_id')::uuid and r.revision=(expected->>'review_revision')::uuid
 and r.policy_revision=(expected->>'policy_revision')::uuid
 and r.input_hash=expected->>'input_hash' and r.output_hash=expected->>'output_hash'
 and pr.payload_hash=expected->>'approved_payload_hash';
 if not found or bytes is null or bytes>131072 then raise exception 'native_display_input_bound';end if;
 accepted:=mip_identity.read_isolated_comparison(sid,rt,release_id);
 if octet_length(accepted::text)>262144
 or accepted->>'contract_version' is distinct from 'accepted-comparison-private-v2'
 or accepted->>'audience' is distinct from 'isolated_internal_review'
 or jsonb_typeof(accepted->'events') is distinct from 'array' or jsonb_array_length(accepted->'events') not between 1 and 32
 then raise exception 'native_display_accepted_shape';end if;
 foreach item in array array[to_jsonb('generation_id'::text),to_jsonb('review_revision'::text),to_jsonb('policy_revision'::text),
 to_jsonb('input_hash'::text),to_jsonb('output_hash'::text),to_jsonb('approved_payload_hash'::text),to_jsonb('release_request'::text)] loop
  if accepted->(item#>>'{}') is distinct from expected->(item#>>'{}') then raise exception 'native_display_head_mismatch';end if;
 end loop;
 if(select count(*) from jsonb_array_elements(accepted->'events') x where x.value#>>'{event,id}'=event_id::text)<>1
 then raise exception 'native_display_event_mismatch';end if;
 select x.value into strict ev from jsonb_array_elements(accepted->'events')x where x.value#>>'{event,id}'=event_id::text;
 select jsonb_agg(jsonb_build_object('article_id',x.value->'article_id','capture_id',x.value->'capture_id',
 'content_hash',x.value->'content_hash','membership_hash',encode(sha256(convert_to((x.value->'membership')::text,'UTF8')),'hex'))
 order by x.value->>'article_id') into source_meta from jsonb_array_elements(ev->'sources')x;
 select jsonb_agg(jsonb_build_object('article_id',x.value->'article_id','capture_id',x.value->'capture_id',
 'candidate_id',x.value->'candidate_id','content_hash',x.value->'content_hash','source_field',x.value->'source_field',
 'field_hash',x.value->'field_hash','span_start',x.value->'span_start','span_end',x.value->'span_end',
 'span_units','unicode_code_points','claim_key_hash',encode(sha256(convert_to(x.value->>'claim_key','UTF8')),'hex'))
 order by x.value->>'article_id',x.value->>'candidate_id',x.value->>'claim_key') into evidence_meta
 from jsonb_array_elements(ev->'evidence')x;
 if source_meta is distinct from expected->'sources' or evidence_meta is distinct from expected->'evidence'
 then raise exception 'native_display_evidence_mismatch';end if;
 select array_agg(x.value->>'claim_key') into claims from jsonb_array_elements(ev->'claims')x;
 if cardinality(claims) not between 1 and 128 or cardinality(claims)<>(select count(distinct x) from unnest(claims)x)
 then raise exception 'native_display_claim_bound';end if;
 for item in select value from jsonb_array_elements(accepted->'explanations') loop
  -- Existing007 binds claim_grouping assertion IDs to this exact event and source.
  if item->>'assertion_id' ~ ('^sc:claim_grouping:'||event_id::text||':[0-9]+:[0-9a-f-]{36}$') then
   explanations:=explanations||jsonb_build_array(item);
  end if;
 end loop;
 select coalesce(jsonb_agg(x.value order by x.value->>'id'),'[]'::jsonb) into links
 from jsonb_array_elements(accepted->'evidence_links')x where x.value->>'claim_key'=any(claims);
 select coalesce(jsonb_agg(x.value order by x.value->>'id'),'[]'::jsonb) into corrections
 from jsonb_array_elements(accepted->'corrections')x where x.value->>'claim_key'=any(claims);
 result:=mip_native_display.project(ev||jsonb_build_object('observation',accepted->'observation','explanations',explanations,
 'evidence_links',links,'corrections',corrections),mip_native_display.contract('comparison'));
 if jsonb_array_length(result->'explanations')=0 or octet_length(result::text)>262144
 then raise exception 'native_display_output_bound';end if;
 perform mip_native_comparison.authorize_session(sid,rt);
 return result;
exception when others then raise exception 'native_display_accepted_refused' using errcode='P0001',detail='',hint='';
end $event$;
revoke all on function mip_native_display.accepted_event(uuid,text,jsonb) from public;
grant execute on function mip_native_display.accepted_event(uuid,text,jsonb) to mip_arc_native_owner;
reset role;
revoke create on schema mip_native_display from mip_publication_owner_v2;
set role mip_arc_native_owner;
create function mip_native_display.read_current(s uuid,i uuid,h text,sid uuid,rt text) returns jsonb
language plpgsql security definer set search_path='' as $read$
declare receipt jsonb;b mip_native_comparison.bindings;p mip_arc_projection_private.projections;
 head mip_arc_projection_private.reviews;comparison jsonb;result jsonb;review jsonb;
begin
 if s is null or i is null or h is null or h!~'^[0-9a-f]{64}$' then raise exception 'native_display_request';end if;
 -- Existing reader acquires identity, native scope, collector, publication and
 -- source locks; the same transaction retains them through both materializations.
 receipt:=mip_native_comparison.read_current(s,i,h,sid,rt);
 select * into strict b from mip_native_comparison.bindings where scope=s and id=i;
 if b.manifest_hash<>h or encode(sha256(convert_to(b.manifest::text,'UTF8')),'hex')<>h
 then raise exception 'native_display_binding';end if;
 select * into strict p from mip_arc_projection_private.projections
 where scope=s and id=(b.manifest#>>'{native,projection_id}')::uuid;
 select * into head from mip_arc_projection_private.reviews where scope=s and projection=p.id order by version desc limit 1;
 if p.generation is distinct from(b.manifest#>>'{native,generation_id}')::uuid
 or p.dependency_hash is distinct from b.manifest#>>'{native,dependency_hash}'
 or p.display_hash is distinct from b.manifest#>>'{native,display_hash}'
 or encode(sha256(convert_to(p.display_payload::text,'UTF8')),'hex') is distinct from p.display_hash
 or head.id is distinct from(b.manifest#>>'{native,projection_review_id}')::uuid
 or head.disposition is distinct from 'accepted_private' or head.dependency_hash is distinct from p.dependency_hash
 or head.display_hash is distinct from p.display_hash then raise exception 'native_display_projection';end if;
 comparison:=mip_native_display.accepted_event(sid,rt,b.manifest->'comparison');
 review:=jsonb_build_object('review_id',head.id,'version',head.version,'disposition',head.disposition,'reason',head.reason);
 result:=jsonb_build_object('contract','native-comparison-display-private-v1','scope',s,'binding_id',i,'manifest_hash',h,
 'identity',jsonb_build_object('native_generation_id',p.generation,'projection_id',p.id,'projection_review_id',head.id,
 'comparison_generation_id',b.manifest#>'{comparison,generation_id}','comparison_event_id',b.manifest#>'{comparison,event_id}',
 'comparison_review_revision',b.manifest#>'{comparison,review_revision}','comparison_policy_revision',b.manifest#>'{comparison,policy_revision}',
 'release_request',b.manifest#>'{comparison,release_request}'),
 'private_projection',jsonb_build_object('review',review,'display',mip_native_display.project(p.display_payload,mip_native_display.contract('display'))),
 'comparison',comparison,'publication_allowed',false,'attachment_allowed',false);
 -- Retained source bodies never cross this seam; only explicitly selected
 -- reviewed passages and bounded private display fields are returned.
 if octet_length(b.manifest::text)+octet_length(p.display_payload::text)+octet_length(comparison::text)+octet_length(result::text)>1048576
 or octet_length(result::text)>524288 then raise exception 'native_display_response_bound';end if;
 perform mip_native_comparison.authorize_session(sid,rt);
 return result;
exception when others then raise exception 'native_display_read_refused' using errcode='P0001',detail='',hint='';
end $read$;
revoke all on function mip_native_display.read_current(uuid,uuid,text,uuid,text) from public;
grant execute on function mip_native_display.read_current(uuid,uuid,text,uuid,text) to mip_mentions_gateway;
reset role;
-- Remove inherited provider default ACL entries only on the new function set.
do $display_acl$
declare p record;a record;
begin
 for p in select oid,oid::regprocedure sig,proowner from pg_proc where pronamespace='mip_native_display'::regnamespace loop
  execute format('set local role %I',p.proowner::regrole);
  for a in select distinct grantee from aclexplode((select proacl from pg_proc where oid=p.oid))
   where grantee<>0 and grantee<>p.proowner
   and not(grantee='mip_publication_owner_v2'::regrole and p.sig::text in('mip_native_display.contract(text)','mip_native_display.project(jsonb,jsonb)'))
   and not(grantee='mip_arc_native_owner'::regrole and p.sig::text='mip_native_display.accepted_event(uuid,text,jsonb)')
   and not(grantee='mip_mentions_gateway'::regrole and p.sig::text='mip_native_display.read_current(uuid,uuid,text,uuid,text)') loop
   execute format('revoke all on function %s from %I',p.sig,a.grantee::regrole);
  end loop;
  reset role;
 end loop;
end $display_acl$;
revoke mip_arc_native_owner,mip_publication_owner_v2 from current_user;
-- Complete unchanged binding/native boundary plus the new no-storage compositor.
do $native_display_final$
begin

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


 if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mip_identity'
  and p.proname='survivor_relations' and p.pronargs=0 and p.prorettype='text[]'::regtype
  and p.proowner='mip_publication_owner_v2'::regrole and not p.prosecdef and p.provolatile='i'
  and p.proconfig=array['search_path=""'] and p.prosrc='
 select array[''events'',''articles'',''event_articles'',''pipeline_config'',''claims'',''article_claims'',
 ''claim_evidence_links'',''claim_corrections'',''explanations'',''story_arcs'',''nodes'',
 ''edges'',''arc_events'',''arc_milestones'',''arc_membership_candidates''];
')
 then raise exception 'native_comparison_source_inventory';end if;
 -- Final current effective source visibility, including inherited restrictive
 -- policies. Missing RLS rows must refuse; an empty snapshot is not authority.
 for spec in select * from(values
 ('mip_kernel_owner_v2','events','native_comparison_kernel_sources'),
 ('mip_kernel_owner_v2','articles','native_comparison_kernel_sources'),
 ('mip_kernel_owner_v2','event_articles','native_comparison_kernel_sources'),
 ('mip_kernel_owner_v2','pipeline_config','native_comparison_kernel_sources'),
 ('mip_publication_owner_v2','events','native_comparison_publication_sources'),
 ('mip_publication_owner_v2','articles','native_comparison_publication_sources'),
 ('mip_publication_owner_v2','event_articles','native_comparison_publication_sources'),
 ('mip_publication_owner_v2','pipeline_config','native_comparison_publication_sources'),
 ('mip_publication_owner_v2','claims','native_comparison_publication_sources'),
 ('mip_publication_owner_v2','article_claims','native_comparison_publication_sources'),
 ('mip_publication_owner_v2','claim_evidence_links','native_comparison_publication_sources'),
 ('mip_publication_owner_v2','claim_corrections','native_comparison_publication_sources'),
 ('mip_publication_owner_v2','explanations','native_comparison_publication_sources'),
 ('mip_publication_owner_v2','story_arcs','native_comparison_publication_sources'),
 ('mip_publication_owner_v2','nodes','native_comparison_publication_sources'),
 ('mip_publication_owner_v2','edges','native_comparison_publication_sources'),
 ('mip_publication_owner_v2','arc_events','native_comparison_publication_sources'),
 ('mip_publication_owner_v2','arc_milestones','native_comparison_publication_sources'),
 ('mip_publication_owner_v2','arc_membership_candidates','native_comparison_publication_sources')
 )v(source_role,source_relation,source_policy) loop
  relation_id:=to_regclass('public.'||spec.source_relation);
  select c.* into strict object_row from pg_class c where c.oid=relation_id and c.relkind='r';
  if not has_schema_privilege(spec.source_role,'public','USAGE') or not has_table_privilege(spec.source_role,relation_id,'SELECT')
   or exists(select 1 from pg_policy p where p.polrelid=relation_id and not p.polpermissive and p.polcmd in('r','*')
    and(0=any(p.polroles) or exists(select 1 from unnest(p.polroles)r(oid) where r.oid<>0 and pg_has_role(spec.source_role::regrole::oid,r.oid,'USAGE'))))
   or(object_row.relrowsecurity and not exists(select 1 from pg_policy p where p.polrelid=relation_id
    and p.polcmd in('r','*') and p.polpermissive and p.polroles=array[spec.source_role::regrole::oid]
    and pg_get_expr(p.polqual,p.polrelid)='true'))
  then raise exception 'native_comparison_source_authority';end if;
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
end;

declare spec record;p record;n text;allowed oid[];
 principals text[]:=array['mip_arc_native_owner','mip_publication_owner_v2','mip_mentions_gateway','mip_mentions_admin',
 'mip_mentions_owner','mip_mentions_native_validator','mip_arc_native_worker','mip_arc_attachment_owner',
 'mip_arc_qik_source_owner','mip_canonical_writer','mip_projection_publisher_v1','mip_comparison_worker_v1',
 'mip_comparison_producer_v1','anon','authenticated','service_role'];
begin
 if not exists(select 1 from pg_namespace where nspname='mip_native_display' and nspowner='mip_arc_native_owner'::regrole)
 or exists(select 1 from pg_class where relnamespace='mip_native_display'::regnamespace)
 then raise exception 'native_display_storage_boundary';end if;
 foreach n in array principals loop
  if has_schema_privilege(n,'mip_native_display','USAGE') is distinct from(n in('mip_arc_native_owner','mip_publication_owner_v2','mip_mentions_gateway'))
   or has_schema_privilege(n,'mip_native_display','CREATE') is distinct from(n='mip_arc_native_owner')
  then raise exception 'native_display_schema_boundary';end if;
 end loop;
 if exists(select 1 from pg_namespace ns cross join lateral aclexplode(coalesce(ns.nspacl,acldefault('n',ns.nspowner)))a
  where ns.nspname='mip_native_display' and a.grantee<>ns.nspowner
  and(a.grantee not in('mip_publication_owner_v2'::regrole,'mip_mentions_gateway'::regrole) or a.privilege_type<>'USAGE' or a.is_grantable))
 then raise exception 'native_display_schema_acl';end if;
 if(select count(*) from pg_proc where pronamespace='mip_native_display'::regnamespace)<>4
 then raise exception 'native_display_function_presence';end if;
 for spec in select * from(values
 ('mip_native_display.contract(text)','mip_arc_native_owner',false,'i',array['mip_arc_native_owner','mip_publication_owner_v2']::text[]),
 ('mip_native_display.project(jsonb,jsonb)','mip_arc_native_owner',false,'i',array['mip_arc_native_owner','mip_publication_owner_v2']::text[]),
 ('mip_native_display.accepted_event(uuid,text,jsonb)','mip_publication_owner_v2',true,'v',array['mip_publication_owner_v2','mip_arc_native_owner']::text[]),
 ('mip_native_display.read_current(uuid,uuid,text,uuid,text)','mip_arc_native_owner',true,'v',array['mip_arc_native_owner','mip_mentions_gateway']::text[])
 )v(signature,owner_name,definer,volatility,grantees) loop
  select * into p from pg_proc where oid=to_regprocedure(spec.signature);
  if not found or p.proowner<>spec.owner_name::regrole or p.prosecdef is distinct from spec.definer
   or p.provolatile::text<>spec.volatility or p.prokind<>'f' or p.proconfig is distinct from array['search_path=""']
  then raise exception 'native_display_function_boundary';end if;
  select array_agg(x::regrole::oid) into allowed from unnest(spec.grantees)x;
  if exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a
   where a.grantee=0 or not(a.grantee=any(allowed)) or a.privilege_type<>'EXECUTE' or(a.grantee<>p.proowner and a.is_grantable))
  then raise exception 'native_display_function_acl';end if;
  foreach n in array principals loop
   if has_function_privilege(n,p.oid,'EXECUTE') is distinct from(n::regrole::oid=any(allowed))
   then raise exception 'native_display_function_effective';end if;
  end loop;
 end loop;
end;

end $native_display_final$;
commit;
