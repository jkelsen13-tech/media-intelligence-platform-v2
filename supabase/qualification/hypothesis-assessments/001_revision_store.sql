-- Isolated qualification only; NOT a deployable migration or source-admission path.
-- The trusted gateway supplies a verified Auth UUID. Workers/browser roles receive no access.
create role mip_hypothesis_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role mip_hypothesis_gateway nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create schema mip_hypothesis authorization mip_hypothesis_owner;
grant usage on schema evidence_pipeline to mip_hypothesis_owner;
grant select on evidence_pipeline.investigation_memberships to mip_hypothesis_owner;
create policy hypothesis_owner_membership_read on evidence_pipeline.investigation_memberships for select to mip_hypothesis_owner using(true);

set role mip_hypothesis_owner;
create table mip_hypothesis.revisions(
 id uuid primary key,
 investigation_id uuid not null,
 request_id uuid not null,
 author_id uuid not null,
 predecessor_id uuid,
 revision bigint not null check(revision>0),
 request_arguments jsonb not null,
 assessment jsonb not null,
 recorded_at timestamptz not null default clock_timestamp(),
 unique(investigation_id,id),
 unique(investigation_id,revision),
 unique(investigation_id,request_id),
 foreign key(investigation_id,predecessor_id) references mip_hypothesis.revisions(investigation_id,id),
 check(assessment->>'release_state' is not distinct from 'private'),
 check(assessment->>'contract_version' is not distinct from 'mip_hypothesis_assessment_v1')
);
alter table mip_hypothesis.revisions enable row level security;
alter table mip_hypothesis.revisions force row level security;
create policy owner_only on mip_hypothesis.revisions to mip_hypothesis_owner using(true) with check(true);
create function mip_hypothesis.reject_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception using errcode='55000',message='hypothesis revisions are append-only'; end $$;
create trigger immutable_rows before update or delete on mip_hypothesis.revisions
 for each row execute function mip_hypothesis.reject_mutation();
create trigger immutable_table before truncate on mip_hypothesis.revisions
 for each statement execute function mip_hypothesis.reject_mutation();

create function mip_hypothesis.append_revision(p_user uuid,p_investigation uuid,p_request uuid,p_predecessor uuid,p_assessment jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare old mip_hypothesis.revisions; head mip_hypothesis.revisions; access text; result jsonb; new_id uuid;
 args jsonb; n bigint; cutoff timestamptz; acquired timestamptz; item jsonb;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception using errcode='25001',message='hypothesis requires read committed';end if;
 if p_user is null or p_investigation is null or p_request is null then
  raise exception using errcode='22023',message='missing assessment identity'; end if;
 -- Same fence used by the existing membership set_access RPC.
 perform pg_advisory_xact_lock(hashtextextended('mip-workspace-access:'||p_investigation::text||':'||p_user::text,0));
 select access_role into access from evidence_pipeline.investigation_memberships
  where investigation_id=p_investigation and user_id=p_user;
 if access is distinct from 'reviewer' then raise exception using errcode='42501',message='hypothesis append denied'; end if;
 perform pg_advisory_xact_lock(hashtextextended('mip-hypothesis-question:'||p_investigation::text,0));
 args:=jsonb_build_object('predecessor',p_predecessor,'assessment',p_assessment);
 select * into old from mip_hypothesis.revisions where investigation_id=p_investigation and request_id=p_request;
 if found then
  if old.author_id<>p_user or old.request_arguments is distinct from args then
   raise exception using errcode='23505',message='hypothesis retry conflict'; end if;
  return old.assessment;
 end if;
 select * into head from mip_hypothesis.revisions where investigation_id=p_investigation order by revision desc limit 1;
 if head.id is distinct from p_predecessor then
  raise exception using errcode='40001',message='hypothesis predecessor changed'; end if;
 if jsonb_typeof(p_assessment) is distinct from 'object' or
    p_assessment->>'contract_version' is distinct from 'mip_hypothesis_assessment_v1' or
    p_assessment->>'release_state' is distinct from 'private' or
    p_assessment->>'review_state' is distinct from 'unreviewed' or
    p_assessment->>'question_id' is distinct from p_investigation::text or
    jsonb_typeof(p_assessment->'evidence') is distinct from 'array' or
    jsonb_typeof(p_assessment->'hypotheses') is distinct from 'array' then
  raise exception using errcode='22023',message='unsupported hypothesis envelope'; end if;
 if jsonb_array_length(p_assessment->'hypotheses')<2 then
  raise exception using errcode='22023',message='competing hypotheses required'; end if;
 if p_assessment->>'knowledge_cutoff' is null then
  raise exception using errcode='22023',message='missing knowledge cutoff'; end if;
 cutoff:=(p_assessment->>'knowledge_cutoff')::timestamptz;
 if not isfinite(cutoff) or cutoff>clock_timestamp() then
  raise exception using errcode='22023',message='future knowledge cutoff'; end if;
 for item in select value from jsonb_array_elements(p_assessment->'evidence') loop
  acquired:=(item->>'acquired_at')::timestamptz;
  if acquired is null or not isfinite(acquired) or acquired>cutoff then
   raise exception using errcode='22023',message='evidence outside knowledge boundary'; end if;
 end loop;
 n:=coalesce(head.revision,0)+1;
 new_id:=gen_random_uuid();
 -- Server assigns completed/recorded time; client identity/revision/time claims cannot backdate history.
 result:=p_assessment||jsonb_build_object('id',new_id,'revision',n,'predecessor_id',p_predecessor,
  'completed_at',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
 insert into mip_hypothesis.revisions(id,investigation_id,request_id,author_id,predecessor_id,revision,request_arguments,assessment)
 values(new_id,p_investigation,p_request,p_user,p_predecessor,n,args,result);
 return result;
end $$;
create function mip_hypothesis.read_history(p_user uuid,p_investigation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare access text; result jsonb;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception using errcode='25001',message='hypothesis requires read committed';end if;
 perform pg_advisory_xact_lock(hashtextextended('mip-workspace-access:'||p_investigation::text||':'||p_user::text,0));
 select access_role into access from evidence_pipeline.investigation_memberships
  where investigation_id=p_investigation and user_id=p_user;
 if access is null or access not in('viewer','reviewer') then
  raise exception using errcode='42501',message='hypothesis read denied'; end if;
 select coalesce(jsonb_agg(assessment order by revision),'[]'::jsonb) into result
  from mip_hypothesis.revisions where investigation_id=p_investigation;
 return result;
end $$;
revoke all on all tables in schema mip_hypothesis from public;
revoke all on all functions in schema mip_hypothesis from public;
grant usage on schema mip_hypothesis to mip_hypothesis_gateway;
grant execute on function mip_hypothesis.append_revision(uuid,uuid,uuid,uuid,jsonb),
 mip_hypothesis.read_history(uuid,uuid) to mip_hypothesis_gateway;
reset role;
