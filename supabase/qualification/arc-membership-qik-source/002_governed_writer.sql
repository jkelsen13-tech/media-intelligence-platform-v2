-- Additive governed projection writer. Requires canonical-admission005 and qik001.
-- Existing release-policy fence remains closed. Materialized links are private
-- caches; only exact revalidating readers confer current input eligibility.
begin;
set local lock_timeout='5s';
create role mip_canonical_writer nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant mip_canonical_writer to current_user with set true;
grant usage,create on schema mip_arc_qik_source to mip_canonical_writer;
grant usage on schema public,mip_mentions to mip_canonical_writer;
grant usage on schema mip_arc_qik_source to mip_mentions_gateway;
grant execute on function mip_mentions.canonical_group(uuid,uuid,uuid),mip_mentions.canonical_article(uuid,uuid,uuid) to mip_canonical_writer;
grant select(scope,principal) on mip_mentions.members to mip_canonical_writer;
set role mip_mentions_owner;
create policy canonical_writer_members on mip_mentions.members for select to mip_canonical_writer using(principal=session_user);
reset role;
grant select,insert,update on public.article_entities to mip_canonical_writer;
set role mip_canonical_writer;
create table mip_arc_qik_source.governed_ownership(
 article_id uuid not null,entity_id uuid not null,scope uuid not null,first_projection uuid not null,
 primary key(article_id,entity_id));
create table mip_arc_qik_source.governed_projections(
 scope uuid not null,id uuid not null,article_id uuid not null,entity_id uuid not null,
 version integer not null check(version>0),predecessor_id uuid,
 mapping_revision uuid not null,weight_policy_revision uuid not null,admission_ids uuid[] not null,
 evidence_weight numeric not null check(evidence_weight>=0 and evidence_weight<=1),
 set_digest text not null check(set_digest~'^[0-9a-f]{64}$'),
 principal name not null,primary key(scope,id),unique(scope,article_id,entity_id,version),
 foreign key(scope,predecessor_id) references mip_arc_qik_source.governed_projections(scope,id));
create table mip_arc_qik_source.governed_heads(
 scope uuid not null,article_id uuid not null,entity_id uuid not null,projection_id uuid not null,
 primary key(scope,article_id,entity_id),
 foreign key(scope,projection_id) references mip_arc_qik_source.governed_projections(scope,id));
create function mip_arc_qik_source.governed_immutable() returns trigger language plpgsql set search_path='' as $immutable$
begin raise exception 'canonical_projection_immutable';end $immutable$;
do $tables$
declare t text;
begin
 foreach t in array array['governed_ownership','governed_projections','governed_heads'] loop
  execute format('alter table mip_arc_qik_source.%I enable row level security',t);
  execute format('alter table mip_arc_qik_source.%I force row level security',t);
  execute format('create policy writer_scoped on mip_arc_qik_source.%I to mip_canonical_writer using(exists(select 1 from mip_mentions.members m where m.scope=%I.scope and m.principal=session_user)) with check(exists(select 1 from mip_mentions.members m where m.scope=%I.scope and m.principal=session_user))',t,t,t);
  execute format('revoke all on mip_arc_qik_source.%I from public,mip_mentions_gateway,mip_mentions_admin',t);
 end loop;
 foreach t in array array['governed_ownership','governed_projections'] loop
  execute format('create trigger immutable_rows before update or delete on mip_arc_qik_source.%I for each row execute function mip_arc_qik_source.governed_immutable()',t);
  execute format('create trigger immutable_table before truncate on mip_arc_qik_source.%I for each statement execute function mip_arc_qik_source.governed_immutable()',t);
 end loop;
end $tables$;
create function mip_arc_qik_source.guard_governed_write() returns trigger
language plpgsql set search_path='' as $guard$
begin
 if current_user<>'mip_canonical_writer' then raise exception 'canonical_projection_writer_required';end if;
 return null;
end $guard$;
create function mip_arc_qik_source.governed_flags(payload jsonb) returns jsonb
language sql immutable set search_path='' as $flags$
 select payload||jsonb_build_object('production_qualified',false,'source_authority_qualified',false,
 'transport_qualified',false,'publication_allowed',false)
$flags$;
create function mip_arc_qik_source.projection_context(s uuid,article uuid,entity uuid,g jsonb) returns jsonb
language plpgsql set search_path='' as $context$
declare h mip_arc_qik_source.governed_projections;c public.article_entities;status text;
begin
 select p.* into h from mip_arc_qik_source.governed_projections p join mip_arc_qik_source.governed_heads x
 on x.scope=p.scope and x.projection_id=p.id where x.scope=s and x.article_id=article and x.entity_id=entity;
 status:='admitted_not_projected';
 if h.id is not null and h.set_digest=g->>'set_digest' then
  select * into c from public.article_entities where article_id=article and entity_id=entity;
  if not found or c.confidence is distinct from h.evidence_weight
   or c.extraction_method is distinct from 'reviewed_evidence_weight_v1' or c.role is not null
  then raise exception 'canonical_projection_cache_mismatch';end if;
  status:='projected_current';
 end if;
 return g||jsonb_build_object('projection_status',status,'expected_predecessor',h.id,
  'current_projection_id',case when status='projected_current' then h.id else null end);
end $context$;
create function mip_arc_qik_source.prepare_governed_relation(s uuid,article uuid,entity uuid)
returns jsonb language plpgsql security definer set search_path='' as $prepare$
declare g jsonb;
begin
 g:=mip_mentions.canonical_group(s,article,entity);
 return mip_arc_qik_source.governed_flags(mip_arc_qik_source.projection_context(s,article,entity,g));
end $prepare$;
create function mip_arc_qik_source.prepare_governed_article(s uuid,article uuid,capture uuid)
returns jsonb language plpgsql security definer set search_path='' as $article$
declare a jsonb;g jsonb;groups jsonb:='[]';
begin
 a:=mip_mentions.canonical_article(s,article,capture);
 for g in select value from jsonb_array_elements(a->'groups') loop
  groups:=groups||jsonb_build_array(mip_arc_qik_source.projection_context(s,article,(g->>'entity_id')::uuid,g));
 end loop;
 -- article_set_digest binds admission head content, not cache availability.
 -- Each nested status exposes unprojected groups rather than omitting them.
 return mip_arc_qik_source.governed_flags(jsonb_set(a,'{groups}',groups));
end $article$;
create function mip_arc_qik_source.read_governed_relation(s uuid,article uuid,entity uuid,expected uuid)
returns jsonb language plpgsql security definer set search_path='' as $read$
declare g jsonb;p mip_arc_qik_source.governed_projections;
begin
 g:=mip_mentions.canonical_group(s,article,entity);
 if expected is null then raise exception 'canonical_projection_exact_required';end if;
 select x.* into p from mip_arc_qik_source.governed_projections x join mip_arc_qik_source.governed_heads h
  on h.scope=x.scope and h.projection_id=x.id where h.scope=s and h.article_id=article and h.entity_id=entity;
 if not found or p.id<>expected or p.set_digest is distinct from g->>'set_digest'
 then raise exception 'canonical_projection_stale';end if;
 perform mip_arc_qik_source.projection_context(s,article,entity,g);
 return mip_arc_qik_source.governed_flags(g||jsonb_build_object('projection_id',p.id,'version',p.version,
  'predecessor_id',p.predecessor_id,'projection_status','projected_current'));
end $read$;
create function mip_arc_qik_source.write_governed_relation(s uuid,i uuid,article uuid,entity uuid,prev uuid,ids uuid[],digest text)
returns jsonb language plpgsql security definer set search_path='' as $write$
declare g jsonb;expected_ids uuid[];old mip_arc_qik_source.governed_projections;h mip_arc_qik_source.governed_projections;
 owned mip_arc_qik_source.governed_ownership;c public.article_entities;v integer;
begin
 g:=mip_mentions.canonical_group(s,article,entity);
 select array_agg(value::uuid order by ord) into expected_ids from jsonb_array_elements_text(g->'admission_ids') with ordinality q(value,ord);
 if i is null or ids is distinct from expected_ids or digest is distinct from g->>'set_digest'
 then raise exception 'canonical_projection_set_mismatch';end if;
 -- All callers use scope/mention/source locks before this cross-scope pair lock.
 perform pg_advisory_xact_lock(hashtextextended('canonical-pair:'||article::text||entity::text,0));
 select * into old from mip_arc_qik_source.governed_projections where scope=s and id=i;
 select p.* into h from mip_arc_qik_source.governed_projections p join mip_arc_qik_source.governed_heads x
  on x.scope=p.scope and x.projection_id=p.id where x.scope=s and x.article_id=article and x.entity_id=entity;
 if old.id is not null then
  if (old.article_id,old.entity_id,old.predecessor_id,old.admission_ids,old.set_digest,old.principal)
   is distinct from(article,entity,prev,ids,digest,session_user) or h.id is distinct from i
  then raise exception 'canonical_projection_retry_conflict';end if;
  return mip_arc_qik_source.read_governed_relation(s,article,entity,i);
 end if;
 if prev is distinct from h.id then raise exception 'canonical_projection_predecessor';end if;
 if h.id is not null and h.set_digest=digest then raise exception 'canonical_projection_unchanged_set';end if;
 select * into owned from mip_arc_qik_source.governed_ownership where article_id=article and entity_id=entity;
 select * into c from public.article_entities where article_id=article and entity_id=entity;
 -- Cross-scope ownership is hidden by forced RLS but the global unique key
 -- still refuses the attempted reservation; no existing row is overwritten.
 if h.id is null then
  if owned.article_id is not null or c.article_id is not null then raise exception 'canonical_projection_collision';end if;
  insert into mip_arc_qik_source.governed_ownership values(article,entity,s,i);
 else
  if owned.scope is distinct from s or c.article_id is null
   or c.confidence is distinct from h.evidence_weight or c.extraction_method is distinct from 'reviewed_evidence_weight_v1'
   or c.role is not null then raise exception 'canonical_projection_cache_mismatch';end if;
 end if;
 v:=coalesce(h.version,0)+1;
 insert into mip_arc_qik_source.governed_projections values(s,i,article,entity,v,prev,
  (g->>'mapping_revision')::uuid,(g->>'weight_policy_revision')::uuid,ids,(g->>'evidence_weight')::numeric,digest,session_user);
 if h.id is null then
  -- A hidden unowned physical row causes PK refusal, never blind upsert.
  insert into public.article_entities(article_id,entity_id,confidence,extraction_method,role)
   values(article,entity,(g->>'evidence_weight')::numeric,'reviewed_evidence_weight_v1',null);
 else
  update public.article_entities set confidence=(g->>'evidence_weight')::numeric
   where article_id=article and entity_id=entity;
  if not found then raise exception 'canonical_projection_cache_mismatch';end if;
 end if;
 insert into mip_arc_qik_source.governed_heads values(s,article,entity,i)
  on conflict(scope,article_id,entity_id) do update set projection_id=excluded.projection_id;
 return mip_arc_qik_source.read_governed_relation(s,article,entity,i);
end $write$;
revoke all on function mip_arc_qik_source.governed_immutable(),mip_arc_qik_source.guard_governed_write(),
 mip_arc_qik_source.governed_flags(jsonb),mip_arc_qik_source.projection_context(uuid,uuid,uuid,jsonb),
 mip_arc_qik_source.prepare_governed_relation(uuid,uuid,uuid),mip_arc_qik_source.prepare_governed_article(uuid,uuid,uuid),
 mip_arc_qik_source.write_governed_relation(uuid,uuid,uuid,uuid,uuid,uuid[],text),
 mip_arc_qik_source.read_governed_relation(uuid,uuid,uuid,uuid) from public;
grant execute on function mip_arc_qik_source.prepare_governed_relation(uuid,uuid,uuid),mip_arc_qik_source.prepare_governed_article(uuid,uuid,uuid),
 mip_arc_qik_source.write_governed_relation(uuid,uuid,uuid,uuid,uuid,uuid[],text),
 mip_arc_qik_source.read_governed_relation(uuid,uuid,uuid,uuid) to mip_mentions_gateway;
reset role;
create policy canonical_projection_owner on public.article_entities to mip_canonical_writer
 using(exists(select 1 from mip_arc_qik_source.governed_ownership o where o.article_id=article_entities.article_id and o.entity_id=article_entities.entity_id))
 with check(exists(select 1 from mip_arc_qik_source.governed_ownership o where o.article_id=article_entities.article_id and o.entity_id=article_entities.entity_id));
drop trigger qik_entity_authority on public.article_entities;
create trigger qik_entity_authority before insert or update or delete on public.article_entities
 for each statement execute function mip_arc_qik_source.guard_governed_write();
alter table public.article_entities enable always trigger qik_entity_authority;
revoke create on schema mip_arc_qik_source from mip_canonical_writer;
revoke mip_canonical_writer from current_user;
do $boundary$
declare r record;f record;name text;
begin
 select * into r from pg_roles where rolname='mip_canonical_writer';
 if r.rolcanlogin or r.rolinherit or r.rolsuper or r.rolcreatedb or r.rolcreaterole or r.rolreplication or r.rolbypassrls
  or exists(select 1 from pg_auth_members where roleid=r.oid or member=r.oid)
  or has_schema_privilege(r.oid,'mip_arc_qik_source','CREATE') or has_schema_privilege(r.oid,'public','CREATE')
 then raise exception 'canonical_writer_role_boundary';end if;
 foreach name in array array['governed_ownership','governed_projections','governed_heads'] loop
  select * into f from pg_class where oid=('mip_arc_qik_source.'||name)::regclass;
  if f.relowner<>r.oid or not f.relrowsecurity or not f.relforcerowsecurity
   or has_table_privilege('mip_mentions_gateway',f.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  then raise exception 'canonical_writer_table_boundary';end if;
 end loop;
 for f in select * from pg_proc where pronamespace='mip_arc_qik_source'::regnamespace and proowner=r.oid loop
  if f.proconfig is distinct from array['search_path=""']
   or exists(select 1 from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a where a.grantee not in
    (r.oid,case when f.proname in('prepare_governed_relation','prepare_governed_article','write_governed_relation','read_governed_relation')
      then 'mip_mentions_gateway'::regrole else r.oid end))
  then raise exception 'canonical_writer_function_boundary';end if;
 end loop;
 if not exists(select 1 from pg_trigger where tgrelid='public.article_entities'::regclass and tgname='qik_entity_authority'
   and tgfoid='mip_arc_qik_source.guard_governed_write()'::regprocedure and tgenabled='A')
  or not exists(select 1 from pg_trigger where tgrelid='public.arc_membership_release_policy'::regclass and tgname='qik_arc_release_authority'
   and tgfoid='mip_arc_qik_source.reject_unqualified_write()'::regprocedure and tgenabled='A')
  or has_table_privilege(r.oid,'public.arc_membership_release_policy','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
 then raise exception 'canonical_writer_fence_boundary';end if;
 if not (select relrowsecurity and relforcerowsecurity from pg_class where oid='public.article_entities'::regclass)
  or (select relowner from pg_class where oid='public.article_entities'::regclass)<>'mip_arc_qik_source_owner'::regrole
  or has_column_privilege(r.oid,'mip_mentions.fields','raw','SELECT')
  or has_any_column_privilege(r.oid,'public.entities','SELECT,INSERT,UPDATE')
 then raise exception 'canonical_writer_source_boundary';end if;
 foreach name in array array['canonical_group(uuid,uuid,uuid)','canonical_article(uuid,uuid,uuid)'] loop
  if not has_function_privilege(r.oid,('mip_mentions.'||name)::regprocedure,'EXECUTE')
   or has_function_privilege('mip_mentions_gateway',('mip_mentions.'||name)::regprocedure,'EXECUTE')
   or has_function_privilege('mip_mentions_admin',('mip_mentions.'||name)::regprocedure,'EXECUTE')
  then raise exception 'canonical_writer_helper_boundary';end if;
 end loop;
 foreach name in array array['anon','authenticated','service_role','mip_mentions_gateway','mip_mentions_admin'] loop
  if has_table_privilege(name,'public.article_entities','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
   or pg_has_role(name,r.oid,'MEMBER')
  then raise exception 'canonical_writer_ambient_boundary';end if;
  if name<>'mip_mentions_gateway' then
   for f in select oid from pg_proc where pronamespace='mip_arc_qik_source'::regnamespace and proowner=r.oid loop
    if has_function_privilege(name,f.oid,'EXECUTE') then raise exception 'canonical_writer_ambient_execute';end if;
   end loop;
  end if;
 end loop;
end $boundary$;
commit;
