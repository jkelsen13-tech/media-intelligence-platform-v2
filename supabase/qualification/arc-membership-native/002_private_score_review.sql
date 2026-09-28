
-- Private score/audit journal and exact manual review; no public attachment.
begin;
set local lock_timeout='5s';
grant mip_arc_native_owner to current_user with set true;
set role mip_arc_native_owner;
create function mip_arc_native.exact_keys(v jsonb,keys text[]) returns boolean
language sql immutable set search_path='' as $keys$
 select case when jsonb_typeof(v) is distinct from 'object' then false else
 coalesce((select array_agg(k order by k) from jsonb_object_keys(v)k)=
 (select array_agg(k order by k) from unnest(keys)k),false) end
$keys$;
create function mip_arc_native.validate_score(o jsonb,g mip_arc_native.generations) returns void
language plpgsql set search_path='' as $validate$
declare score jsonb;ev jsonb;k text;n numeric;reason text;expected_stratum text;
begin
 if o is null or octet_length(o::text)>16384 or
 not mip_arc_native.exact_keys(o,array['contract','generation_id','candidate_id','input_hash','manifest_hash','runtime','scorer_blob','score','audit','approval_allowed','publication_allowed','attached'])
 or o->>'contract' is distinct from 'arc-native-private-score-v1'
 or o->>'generation_id' is distinct from g.id::text
 or o->>'candidate_id' is distinct from g.manifest->>'candidate'
 or o->>'input_hash' is distinct from g.expanded_hash
 or o->>'manifest_hash' is distinct from g.manifest_hash
 or o->>'runtime' is distinct from '22.14.0'
 or o->>'scorer_blob' is distinct from '08ce23092cfbbe8dcb7eb7c26cf6e3943e177531'
 or o->'approval_allowed' is distinct from 'false'::jsonb
 or o->'publication_allowed' is distinct from 'false'::jsonb
 or o->'attached' is distinct from 'false'::jsonb then raise exception 'arc_native_output_shape';end if;
 score:=o->'score';
 if not mip_arc_native.exact_keys(score,array['model_version','candidate_article_id','arc_id','cluster_confidence','decision','eligible_for_auto_approval','hard_rejections','signals','evidence','release_gate'])
 or score->>'model_version' is distinct from 'arc-v1-membership-2026-08-23.2'
 or score->>'candidate_article_id' is distinct from g.manifest->>'article'
 or score->>'arc_id' is distinct from g.manifest->'arc'->>'id'
 or score->>'decision' is null or score->>'decision' not in('candidate','rejected')
 or score->'eligible_for_auto_approval' is distinct from 'false'::jsonb
 or score->'release_gate' is distinct from '{"fixture_passed":false,"auto_approval_enabled":false,"auto_approval_threshold":null}'::jsonb
 or not mip_arc_native.exact_keys(score->'signals',array['entity','canonical','recent','action','continuity','temporal','source_diversity'])
 or not mip_arc_native.exact_keys(score->'evidence',array['shared_entity_count','candidate_entity_count','arc_entity_count','temporal_gap_days','explicit_continuity','recent_member_count'])
 then raise exception 'arc_native_score_shape';end if;
 foreach k in array array['cluster_confidence','entity','canonical','recent','action','continuity','temporal','source_diversity'] loop
  ev:=case when k='cluster_confidence' then score->k else score->'signals'->k end;
  if jsonb_typeof(ev) is distinct from 'number' then raise exception 'arc_native_score_number';end if;
  n:=(ev::text)::numeric;
  if n not between 0 and 1 then raise exception 'arc_native_score_number';end if;
 end loop;
 if jsonb_typeof(score->'hard_rejections') is distinct from 'array'
  or jsonb_array_length(score->'hard_rejections')>5 then raise exception 'arc_native_score_reasons';end if;
 for ev in select value from jsonb_array_elements(score->'hard_rejections') loop
  if jsonb_typeof(ev) is distinct from 'string' or ev#>>'{}' not in
  ('insufficient_evidence','actor_only_contamination','generic_entity_no_continuity','stale_without_narrative_bridge','topic_action_contradiction')
  then raise exception 'arc_native_score_reasons';end if;
 end loop;
 if (select count(distinct value) from jsonb_array_elements(score->'hard_rejections'))<>jsonb_array_length(score->'hard_rejections')
 or (score->>'decision'='rejected') is distinct from(jsonb_array_length(score->'hard_rejections')>0)
 or(jsonb_array_length(score->'hard_rejections')>0 and(score->>'cluster_confidence')::numeric<>0)
 then raise exception 'arc_native_score_decision';end if;
 foreach k in array array['shared_entity_count','candidate_entity_count','arc_entity_count','recent_member_count'] loop
  ev:=score->'evidence'->k;
  if jsonb_typeof(ev) is distinct from 'number' then raise exception 'arc_native_score_evidence';end if;
  n:=(ev::text)::numeric;
  if n<>trunc(n) or n<0 or n>(case when k='recent_member_count' then 5 else 64 end)
  then raise exception 'arc_native_score_evidence';end if;
 end loop;
 ev:=score->'evidence'->'temporal_gap_days';
 if ev is distinct from 'null'::jsonb then
  if jsonb_typeof(ev) is distinct from 'number' then raise exception 'arc_native_score_evidence';end if;
  n:=(ev::text)::numeric;
  if n not between 0 and 1000000000 then raise exception 'arc_native_score_evidence';end if;
 end if;
 if jsonb_typeof(score->'evidence'->'explicit_continuity') is distinct from 'boolean'
 then raise exception 'arc_native_score_evidence';end if;
 expected_stratum:=case when(score->>'cluster_confidence')::numeric<0.70 or jsonb_array_length(score->'hard_rejections')>0
 then 'low_confidence_all' else 'high_confidence_random' end;
 -- The complete population is the single exact generation, so its unchanged
 -- audit sampler always selects it at high_sample_size=1.
 if o->'audit' is distinct from jsonb_build_array(jsonb_build_object('candidate_id',g.manifest->'candidate','stratum',expected_stratum))
 then raise exception 'arc_native_audit_shape';end if;
end $validate$;
create table mip_arc_native.private_scores(
 scope uuid not null,generation uuid not null,output jsonb not null,output_hash text not null,
 principal name not null default session_user,primary key(scope,generation),
 foreign key(scope,generation) references mip_arc_native.generations(scope,id),
 check(octet_length(output::text)<=16384),
 check(output_hash=encode(sha256(convert_to(output::text,'UTF8')),'hex')));
create table mip_arc_native.private_reviews(
 scope uuid not null,id uuid not null,generation uuid not null,output_hash text not null,
 version integer not null check(version>0),predecessor uuid,
 state text not null check(state in('accepted_private','rejected_private','revoked')),
 reason text not null check(reason in('reviewed_continuity','reviewed_mismatch','insufficient_review','revocation')),
 principal name not null default session_user,primary key(scope,id),unique(scope,generation,version),
 foreign key(scope,generation) references mip_arc_native.private_scores(scope,generation),
 foreign key(scope,predecessor) references mip_arc_native.private_reviews(scope,id),
 check((state='accepted_private' and reason='reviewed_continuity')
 or(state='rejected_private' and reason in('reviewed_mismatch','insufficient_review'))
 or(state='revoked' and reason='revocation')));
do $tables$
declare n text;
begin
 foreach n in array array['private_scores','private_reviews'] loop
 execute format('alter table mip_arc_native.%I enable row level security',n);
 execute format('alter table mip_arc_native.%I force row level security',n);
 execute format('create policy owner_only on mip_arc_native.%I to mip_arc_native_owner using(true) with check(true)',n);
 execute format('create trigger immutable_rows before update or delete on mip_arc_native.%I for each statement execute function mip_arc_native.immutable()',n);
 execute format('create trigger immutable_table before truncate on mip_arc_native.%I for each statement execute function mip_arc_native.immutable()',n);
 end loop;
end $tables$;
create function mip_arc_native.complete_score(s uuid,g uuid,h text,o jsonb) returns jsonb
language plpgsql security definer set search_path='' as $complete$
declare saved mip_arc_native.generations;prior mip_arc_native.private_scores;oh text;
begin
 perform mip_arc_native.context(s,false);
 perform mip_arc_native.read_scoring_input(s,g,h);
 select * into strict saved from mip_arc_native.generations where scope=s and id=g;
 perform mip_arc_native.validate_score(o,saved);
 oh:=encode(sha256(convert_to(o::text,'UTF8')),'hex');
 select * into prior from mip_arc_native.private_scores where scope=s and generation=g;
 if found then
  if prior.output is distinct from o then raise exception 'arc_native_score_retry_conflict';end if;
 else insert into mip_arc_native.private_scores values(s,g,o,oh,session_user);end if;
 return jsonb_build_object('generation_id',g,'output_hash',oh,'state','scored_private',
  'approval_allowed',false,'publication_allowed',false,'attached',false);
end $complete$;
create function mip_arc_native.review_score(s uuid,i uuid,g uuid,h text,oh text,v integer,prev uuid,st text,why text) returns jsonb
language plpgsql security definer set search_path='' as $review$
declare score mip_arc_native.private_scores;old mip_arc_native.private_reviews;head mip_arc_native.private_reviews;
begin
 perform mip_arc_native.context(s,true);
 perform mip_arc_native.read_scoring_input(s,g,h);
 select * into score from mip_arc_native.private_scores where scope=s and generation=g;
 if not found or score.output_hash is distinct from oh then raise exception 'arc_native_score_missing';end if;
 if st='accepted_private' and score.output->'score'->>'decision'<>'candidate'
 then raise exception 'arc_native_rejected_score';end if;
 select * into old from mip_arc_native.private_reviews where scope=s and id=i;
 if found then
  if(old.generation,old.output_hash,old.version,old.predecessor,old.state,old.reason,old.principal)
   is distinct from(g,oh,v,prev,st,why,session_user) then raise exception 'arc_native_review_retry_conflict';end if;
 else
  select * into head from mip_arc_native.private_reviews where scope=s and generation=g order by version desc limit 1;
  if v is null or v<>coalesce(head.version,0)+1 or prev is distinct from head.id then raise exception 'arc_native_predecessor';end if;
  insert into mip_arc_native.private_reviews values(s,i,g,oh,v,prev,st,why,session_user);
 end if;
 return jsonb_build_object('generation_id',g,'review_id',i,'output_hash',oh,'state',st,
  'approval_allowed',false,'publication_allowed',false,'attached',false);
end $review$;
create function mip_arc_native.read_current_score(s uuid,g uuid,h text,oh text,review_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $reader$
declare score mip_arc_native.private_scores;saved mip_arc_native.generations;head mip_arc_native.private_reviews;
begin
 perform mip_arc_native.context(s,false);
 perform mip_arc_native.read_scoring_input(s,g,h);
 select * into saved from mip_arc_native.generations where scope=s and id=g;
 select * into score from mip_arc_native.private_scores where scope=s and generation=g;
 if not found or score.output_hash is distinct from oh then raise exception 'arc_native_score_missing';end if;
 perform mip_arc_native.validate_score(score.output,saved);
 select * into head from mip_arc_native.private_reviews where scope=s and generation=g order by version desc limit 1;
 if head.id is distinct from review_id or head.state='revoked' then raise exception 'arc_native_review_stale';end if;
 return jsonb_build_object('generation_id',g,'input_hash',h,'output_hash',oh,'output',score.output,
  'review',case when head.id is null then null else jsonb_build_object('review_id',head.id,'version',head.version,'state',head.state,'reason',head.reason) end,
  'approval_allowed',false,'publication_allowed',false,'attached',false);
end $reader$;
reset role;
-- Default ACLs apply only to new objects; clean them before granting wrappers.
do $acl$
declare r record;a record;
begin
 for r in select oid,oid::regprocedure sig,proowner from pg_proc where pronamespace='mip_arc_native'::regnamespace
 and proname in('exact_keys','validate_score','complete_score','review_score','read_current_score') loop
  execute format('revoke all on function %s from public',r.sig);
  for a in select distinct grantee from aclexplode((select proacl from pg_proc where oid=r.oid))
   where grantee<>r.proowner and grantee<>0 loop
   execute format('revoke all on function %s from %I',r.sig,a.grantee::regrole);
  end loop;
 end loop;
 for r in select c.oid,c.relname,c.relowner from pg_class c where c.relnamespace='mip_arc_native'::regnamespace
 and c.relname in('private_scores','private_reviews') loop
  execute format('revoke all on table mip_arc_native.%I from public',r.relname);
  for a in select distinct grantee from aclexplode((select relacl from pg_class where oid=r.oid)) where grantee<>r.relowner and grantee<>0 loop
   execute format('revoke all on table mip_arc_native.%I from %I',r.relname,a.grantee::regrole);
  end loop;
 end loop;
end $acl$;
grant execute on function mip_arc_native.complete_score(uuid,uuid,text,jsonb) to mip_arc_native_worker;
grant execute on function mip_arc_native.review_score(uuid,uuid,uuid,text,text,integer,uuid,text,text) to mip_mentions_gateway;
grant execute on function mip_arc_native.read_current_score(uuid,uuid,text,text,uuid) to mip_mentions_gateway,mip_arc_native_worker;
revoke mip_arc_native_owner from current_user;
do $final$
declare p record;a record;allowed oid[];r record;principal text;rel regclass;
begin
 for p in select * from pg_proc where pronamespace='mip_arc_native'::regnamespace loop
  allowed:=array[p.proowner];
  if p.proname='context' then allowed:=allowed||'mip_arc_native_owner'::regrole::oid;end if;
  if p.proname in('snapshot','read_scoring_input','complete_score','read_current_score')
   then allowed:=allowed||'mip_arc_native_worker'::regrole::oid;end if;
  if p.proname in('review_scalar','review_selection_policy','review_extraction','review_cohort','revoke_cohort','review_score','read_current_score')
   then allowed:=allowed||'mip_mentions_gateway'::regrole::oid;end if;
  if p.proname='set_scalar_access' then allowed:=allowed||'mip_mentions_admin'::regrole::oid;end if;
  if p.proowner<>(case when p.proname='context' then 'mip_mentions_owner'::regrole else 'mip_arc_native_owner'::regrole end)
   or not coalesce(p.proconfig @> array['search_path=""'],false)
   or exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x where x.privilege_type='EXECUTE' and not(x.grantee=any(allowed)))
  then raise exception 'arc_native_function_boundary';end if;
 end loop;
 for r in select * from pg_roles where rolname in('mip_arc_native_owner','mip_arc_native_worker') loop
  if r.rolcanlogin or r.rolinherit or r.rolsuper or r.rolcreatedb or r.rolcreaterole or r.rolreplication or r.rolbypassrls
   or exists(select 1 from pg_auth_members where roleid=r.oid or member=r.oid)
  then raise exception 'arc_native_role_boundary';end if;
 end loop;
 if exists(select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault(case when c.relkind='S' then 'S'::"char" else 'r'::"char" end,c.relowner)))x
  where c.relnamespace='mip_arc_native'::regnamespace and x.grantee<>c.relowner)
 then raise exception 'arc_native_storage_boundary';end if;
 foreach principal in array array['mip_arc_native_worker','mip_mentions_gateway','mip_mentions_admin','anon','authenticated','service_role'] loop
  for rel in select oid from pg_class where relnamespace='mip_arc_native'::regnamespace and relkind='r' loop
   if has_table_privilege(principal,rel,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or has_any_column_privilege(principal,rel,'SELECT,INSERT,UPDATE,REFERENCES')
   then raise exception 'arc_native_effective_storage_boundary';end if;
  end loop;
 end loop;
 if exists(select 1 from pg_proc proc_entry cross join lateral aclexplode(coalesce(proc_entry.proacl,acldefault('f',proc_entry.proowner))) acl_entry
  where proc_entry.oid='mip_mentions.canonical_prelock_articles(uuid,uuid[],uuid[])'::regprocedure
  and (proc_entry.proowner<>'mip_mentions_owner'::regrole or not proc_entry.prosecdef
   or not(proc_entry.proconfig @> array['search_path=""'])
   or acl_entry.grantee not in('mip_mentions_owner'::regrole,'mip_arc_native_owner'::regrole)))
 then raise exception 'arc_native_prelock_boundary';end if;
 perform mip_arc_native.assert_source_authority();
 if has_schema_privilege('mip_arc_native_worker','mip_arc_native','CREATE')
  or has_schema_privilege('mip_mentions_gateway','mip_arc_native','CREATE')
  or has_schema_privilege('mip_mentions_admin','mip_arc_native','CREATE')
 then raise exception 'arc_native_schema_boundary';end if;
end $final$;
commit;
