-- Disposable PostgreSQL 17 qualification only. Apply after 001_mentions.sql.
-- Neither canonical registration nor an accepted assertion is a documented fact.
begin;
set role mip_mentions_owner;
create table mip_mentions.actor_revisions(
 scope uuid not null, id uuid not null, actor_id uuid not null, version integer not null check(version>0),
 predecessor_id uuid, label text not null check(length(label)<=256 and length(btrim(label)) between 1 and 256),
 kind text not null check(kind in('person','organization','collective','unknown')),
 evidence uuid[] not null check(cardinality(evidence) between 1 and 16 and array_position(evidence,null) is null),
 reason text not null check(length(reason)<=4096 and length(btrim(reason)) between 1 and 4096),
 principal name not null, created_at timestamptz not null default clock_timestamp(),
 primary key(scope,id),unique(scope,actor_id,version),
 foreign key(scope,actor_id) references mip_mentions.actors(scope,id),
 foreign key(scope,predecessor_id) references mip_mentions.actor_revisions(scope,id));
create index actor_revision_head on mip_mentions.actor_revisions(scope,actor_id,version desc);
-- Lineage is an interpretation of exact revisions, never a mutable alias.
-- Later events supersede earlier interpretations; no transitive identity rewrite.
create table mip_mentions.actor_lineage(
 scope uuid not null,id uuid not null,anchor_actor uuid not null,version integer not null check(version>0),predecessor_id uuid,
 kind text not null check(kind in('merge','split','supersession','withdrawn')),
 from_revisions uuid[] not null,to_revisions uuid[] not null,
 evidence uuid[] not null check(cardinality(evidence) between 1 and 16),
 reason text not null check(length(reason)<=4096 and length(btrim(reason)) between 1 and 4096),
 principal name not null,created_at timestamptz not null default clock_timestamp(),
 primary key(scope,id),unique(scope,anchor_actor,version),
 foreign key(scope,anchor_actor) references mip_mentions.actors(scope,id),
 foreign key(scope,predecessor_id) references mip_mentions.actor_lineage(scope,id),
 check(cardinality(from_revisions) between 1 and 8 and cardinality(to_revisions) between 1 and 8),
 check(kind<>'withdrawn' or (version>1 and predecessor_id is not null)));
create index actor_lineage_head on mip_mentions.actor_lineage(scope,anchor_actor,version desc);
create table mip_mentions.agency_assertions(
 scope uuid not null,id uuid not null,action_mention uuid not null,participant_mention uuid not null,
 role text not null check(role in('speaker','addressee','agent','principal','beneficiary','affected_actor')),
 version integer not null check(version>0),predecessor_id uuid,
 action_kind text not null check(action_kind in('direct_action','attributed_action')),
 status text not null check(status in('unresolved','proposed','accepted','rejected')),
 choices jsonb not null check(jsonb_typeof(choices)='array' and jsonb_array_length(choices)<=8),
 evidence uuid[] not null check(cardinality(evidence) between 1 and 16),
 role_confidence numeric not null check(role_confidence between 0 and 1),
 evidence_quality numeric not null check(evidence_quality between 0 and 1),
 evidence_relevance numeric not null check(evidence_relevance between 0 and 1),
 assessment_confidence numeric not null check(assessment_confidence between 0 and 1),
 reason text not null check(length(reason)<=4096 and length(btrim(reason)) between 1 and 4096),
 principal name not null,created_at timestamptz not null default clock_timestamp(),
 primary key(scope,id),unique(scope,action_mention,role,version),
 foreign key(scope,action_mention) references mip_mentions.mentions(scope,id),
 foreign key(scope,participant_mention) references mip_mentions.mentions(scope,id),
 foreign key(scope,predecessor_id) references mip_mentions.agency_assertions(scope,id),
 check((status='accepted' and jsonb_array_length(choices)=1) or
       (status='proposed' and jsonb_array_length(choices)>0) or
       (status in('unresolved','rejected') and jsonb_array_length(choices)=0)));
create index agency_assertion_head on mip_mentions.agency_assertions(scope,action_mention,role,version desc);
do $ddl$
declare t text;
begin
 foreach t in array array['actor_revisions','actor_lineage','agency_assertions'] loop
  execute format('alter table mip_mentions.%I enable row level security',t);
  execute format('alter table mip_mentions.%I force row level security',t);
  execute format('create policy owner_scoped on mip_mentions.%I to mip_mentions_owner using(exists(select 1 from mip_mentions.members g where g.scope=%I.scope and g.principal=session_user)) with check(exists(select 1 from mip_mentions.members g where g.scope=%I.scope and g.principal=session_user))',t,t,t);
  execute format('create trigger immutable_rows before update or delete on mip_mentions.%I for each row execute function mip_mentions.immutable()',t);
  execute format('create trigger immutable_table before truncate on mip_mentions.%I for each statement execute function mip_mentions.immutable()',t);
 end loop;
end $ddl$;
create function mip_mentions.interpretation(payload jsonb) returns jsonb language sql immutable set search_path='' as $$
 select payload||jsonb_build_object('attribution_kind','reviewed_interpretation','documented_fact',false,
 'production_qualified',false,'source_authority_qualified',false,'transport_qualified',false,'publication_allowed',false)
$$;
-- Namespace prefix prevents actor locks colliding intentionally with Slice1 mention locks.
create function mip_mentions.lock_actors(s uuid,ids uuid[]) returns void language plpgsql set search_path='' as $$
declare a uuid;
begin
 if ids is null or cardinality(ids)>16 or array_position(ids,null) is not null then raise exception 'actor budget denied';end if;
 for a in select distinct x from unnest(ids)x order by x loop
  perform pg_advisory_xact_lock(hashtextextended('actor:'||s::text||a::text,0));
 end loop;
end $$;
create function mip_mentions.revision_context(s uuid,ids uuid[],current_required boolean) returns uuid[] language plpgsql set search_path='' as $$
declare result uuid[];r mip_mentions.actor_revisions;rid uuid;head uuid;
begin
 if ids is null or cardinality(ids)>16 or array_position(ids,null) is not null then raise exception 'revision budget denied';end if;
 result:='{}'::uuid[];
 foreach rid in array ids loop
  select * into r from mip_mentions.actor_revisions where scope=s and id=rid;
  if not found then raise exception 'actor revision unavailable';end if;
  if current_required then
   select id into head from mip_mentions.actor_revisions where scope=s and actor_id=r.actor_id order by version desc limit 1;
   if head is distinct from rid then raise exception 'stale actor revision denied';end if;
  end if;
  result:=result||r.evidence;
 end loop;
 return result;
end $$;
create function mip_mentions.put_actor_revision(s uuid,i uuid,a uuid,v integer,prev uuid,l text,k text,ev uuid[],why text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p mip_mentions.policy;h mip_mentions.actor_revisions;
begin
 p:=mip_mentions.lock_policy();perform mip_mentions.authorize(s,true);perform mip_mentions.lock_actors(s,array[a]);
 if i is null or a is null or v is null or ev is null or cardinality(ev) not between 1 and 16 or array_position(ev,null) is not null then raise exception 'invalid actor revision';end if;
 select * into h from mip_mentions.actor_revisions where scope=s and actor_id=a order by version desc limit 1;
 if v<>coalesce(h.version,0)+1 or prev is distinct from h.id then raise exception 'actor predecessor conflict';end if;
 perform mip_mentions.check_mentions(s,ev,p);
 insert into mip_mentions.actor_revisions(scope,id,actor_id,version,predecessor_id,label,kind,evidence,reason,principal)
 values(s,i,a,v,prev,l,k,ev,why,session_user);
 return mip_mentions.interpretation(jsonb_build_object('actor_revision_id',i,'version',v,'policy_version',p.version));
end $$;
create function mip_mentions.put_actor_lineage(s uuid,i uuid,a uuid,v integer,prev uuid,k text,fr uuid[],dest uuid[],ev uuid[],why text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p mip_mentions.policy;h mip_mentions.actor_lineage;actors uuid[];refs uuid[];
begin
 p:=mip_mentions.lock_policy();perform mip_mentions.authorize(s,true);
 if i is null or a is null or v is null or fr is null or dest is null or ev is null or
 cardinality(fr) not between 1 and 8 or cardinality(dest) not between 1 and 8 or cardinality(ev) not between 1 and 16 or
 array_position(fr||dest||ev,null) is not null or fr&&dest or
 cardinality(fr)<>(select count(distinct x) from unnest(fr)x) or cardinality(dest)<>(select count(distinct x) from unnest(dest)x)
 then raise exception 'invalid lineage';end if;
 if not ((k='merge' and cardinality(fr)>=2 and cardinality(dest)=1) or
 (k='split' and cardinality(fr)=1 and cardinality(dest)>=2) or
 (k='supersession' and cardinality(fr)=1 and cardinality(dest)=1) or k='withdrawn') then raise exception 'invalid lineage shape';end if;
 select array_agg(distinct actor_id) into actors from mip_mentions.actor_revisions where scope=s and id=any(fr||dest);
 if cardinality(actors)<>cardinality(fr||dest) or not exists(select 1 from mip_mentions.actor_revisions where scope=s and id=any(fr) and actor_id=a) then raise exception 'lineage anchor unavailable';end if;
 perform mip_mentions.lock_actors(s,actors);
 refs:=mip_mentions.revision_context(s,fr||dest,true);
 select * into h from mip_mentions.actor_lineage where scope=s and anchor_actor=a order by version desc limit 1;
 if v<>coalesce(h.version,0)+1 or prev is distinct from h.id then raise exception 'lineage predecessor conflict';end if;
 -- A withdrawal targets exactly the preceding non-withdrawn interpretation.
 -- The two ordered revision sets cannot be substituted with unrelated actors.
 if k='withdrawn' and (v=1 or prev is null or h.id is null or h.kind='withdrawn' or
  fr is distinct from h.from_revisions or dest is distinct from h.to_revisions)
 then raise exception 'invalid withdrawal target';end if;
 perform mip_mentions.check_mentions(s,ev||refs,p);
 insert into mip_mentions.actor_lineage(scope,id,anchor_actor,version,predecessor_id,kind,from_revisions,to_revisions,evidence,reason,principal)
 values(s,i,a,v,prev,k,fr,dest,ev,why,session_user);
 return mip_mentions.interpretation(jsonb_build_object('lineage_id',i,'automatic_identity_rewrite',false,'policy_version',p.version));
end $$;
-- This helper gathers bounded exact candidate/decision/actor evidence before one
-- grouped source validation. Callers already hold all actor and mention locks.
create function mip_mentions.agency_context(s uuid,participant uuid,choices jsonb,st text,current_required boolean)
returns uuid[] language plpgsql set search_path='' as $$
declare choice jsonb;c mip_mentions.candidates;d mip_mentions.decisions;r mip_mentions.actor_revisions;head uuid;ceiling_value bigint;refs uuid[]:='{}';seen uuid[]:='{}';cid uuid;did uuid;rid uuid;
begin
 if choices is null or jsonb_typeof(choices)<>'array' or jsonb_array_length(choices)>8 then raise exception 'invalid choices';end if;
 for choice in select value from jsonb_array_elements(choices) loop
  if jsonb_typeof(choice)<>'object' or (choice-array['candidate_id','decision_id','actor_revision_id','identity_confidence'])<>'{}'::jsonb or
  not(choice ?& array['candidate_id','decision_id','actor_revision_id','identity_confidence']) or
  jsonb_typeof(choice->'identity_confidence')<>'number' or (choice->>'identity_confidence')::numeric not between 0 and 1 then raise exception 'invalid identity choice';end if;
  cid:=(choice->>'candidate_id')::uuid;did:=(choice->>'decision_id')::uuid;rid:=(choice->>'actor_revision_id')::uuid;
  if cid is null or rid is null or cid=any(seen) then raise exception 'invalid identity choice';end if;seen:=seen||cid;
  select * into c from mip_mentions.candidates where scope=s and id=cid and mention_id=participant;
  if not found then raise exception 'candidate unavailable';end if;
  select * into r from mip_mentions.actor_revisions where scope=s and id=rid and actor_id=c.actor_id;
  if not found then raise exception 'actor revision unavailable';end if;
  if current_required then
   select id into head from mip_mentions.candidates where scope=s and mention_id=participant and actor_id=c.actor_id order by version desc limit 1;
   if head is distinct from cid then raise exception 'stale candidate denied';end if;
  end if;
  if did is not null then
   select * into d from mip_mentions.decisions where scope=s and id=did and mention_id=participant and candidate_id=cid and status='accepted';
   if not found then raise exception 'accepted identity decision unavailable';end if;
   if current_required then
    select id into head from mip_mentions.decisions where scope=s and mention_id=participant order by version desc limit 1;
    select coalesce(max(position),0) into ceiling_value from mip_mentions.candidates where scope=s and mention_id=participant;
    if head is distinct from did or ceiling_value<>d.candidate_ceiling then raise exception 'stale identity decision denied';end if;
   end if;
  elsif st='accepted' then raise exception 'accepted identity decision required';
  end if;
  refs:=refs||c.supporting_mentions||c.conflicting_mentions||mip_mentions.revision_context(s,array[rid],current_required);
  if cardinality(refs)>128 then raise exception 'operation context budget exceeded';end if;
 end loop;
 return refs;
end $$;
create function mip_mentions.lock_agency(s uuid,action uuid,participant uuid,choices jsonb) returns void language plpgsql set search_path='' as $$
declare actors uuid[];m uuid;
begin
 if action is null or participant is null or choices is null or jsonb_typeof(choices)<>'array' or jsonb_array_length(choices)>8 then raise exception 'invalid agency identity';end if;
 select coalesce(array_agg(distinct actor_id),'{}'::uuid[]) into actors from mip_mentions.actor_revisions
 where scope=s and id in(select (value->>'actor_revision_id')::uuid from jsonb_array_elements(choices));
 perform mip_mentions.lock_actors(s,actors);
 for m in select distinct x from unnest(array[action,participant])x order by x loop
  perform pg_advisory_xact_lock(hashtextextended(s::text||m::text,0));
 end loop;
end $$;
create function mip_mentions.put_agency(s uuid,i uuid,action uuid,participant uuid,r text,v integer,prev uuid,ak text,st text,ch jsonb,ev uuid[],rc numeric,eq numeric,er numeric,ac numeric,why text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p mip_mentions.policy;h mip_mentions.agency_assertions;refs uuid[];
begin
 p:=mip_mentions.lock_policy();perform mip_mentions.authorize(s,true);
 if i is null or v is null or ev is null or cardinality(ev) not between 1 and 16 or array_position(ev,null) is not null then raise exception 'invalid agency assertion';end if;
 perform mip_mentions.lock_agency(s,action,participant,ch);
 select * into h from mip_mentions.agency_assertions where scope=s and action_mention=action and role=r order by version desc limit 1;
 if v<>coalesce(h.version,0)+1 or prev is distinct from h.id then raise exception 'agency predecessor conflict';end if;
 refs:=mip_mentions.agency_context(s,participant,ch,st,true);
 perform mip_mentions.check_mentions(s,array[action,participant]||ev||refs,p);
 insert into mip_mentions.agency_assertions(scope,id,action_mention,participant_mention,role,version,predecessor_id,action_kind,status,choices,evidence,role_confidence,evidence_quality,evidence_relevance,assessment_confidence,reason,principal)
 values(s,i,action,participant,r,v,prev,ak,st,ch,ev,rc,eq,er,ac,why,session_user);
 return mip_mentions.interpretation(jsonb_build_object('assertion_id',i,'version',v,'status',st,'policy_version',p.version));
end $$;
create function mip_mentions.read_agency(s uuid,action uuid,r text,expected uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p mip_mentions.policy;h mip_mentions.agency_assertions;refs uuid[];actual uuid;
begin
 p:=mip_mentions.lock_policy();perform mip_mentions.authorize(s);
 select * into h from mip_mentions.agency_assertions where scope=s and id=expected and action_mention=action and role=r;
 if not found then raise exception 'agency assertion unavailable';end if;
 perform mip_mentions.lock_agency(s,action,h.participant_mention,h.choices);
 select id into actual from mip_mentions.agency_assertions where scope=s and action_mention=action and role=r order by version desc limit 1;
 if actual is distinct from expected then raise exception 'stale agency assertion denied';end if;
 refs:=mip_mentions.agency_context(s,h.participant_mention,h.choices,h.status,true);
 perform mip_mentions.check_mentions(s,array[action,h.participant_mention]||h.evidence||refs,p);
 return mip_mentions.interpretation(jsonb_build_object('assertion',to_jsonb(h),'policy_version',p.version));
end $$;
-- Bounded historical pages intentionally carry no current acceptance claim.
-- Keyset cursor is exact revision UUID, bound to scope, stream and policy.
create function mip_mentions.actor_history(s uuid,a uuid,n integer,cursor_value jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare p mip_mentions.policy;anchor mip_mentions.actor_revisions;ids uuid[];ev uuid[];items jsonb;after_version integer:=0;next_cursor jsonb;last_id uuid;
begin
 p:=mip_mentions.lock_policy();perform mip_mentions.authorize(s);perform mip_mentions.lock_actors(s,array[a]);
 if n is null or n not between 1 and 3 or n>p.max_page then raise exception 'history page budget denied';end if;
 if cursor_value is not null then
  if jsonb_typeof(cursor_value)<>'object' or (cursor_value-array['scope','actor_id','policy_version','after_revision'])<>'{}'::jsonb or
  not(cursor_value ?& array['scope','actor_id','policy_version','after_revision']) or
  cursor_value->>'scope' is distinct from s::text or cursor_value->>'actor_id' is distinct from a::text or
  (cursor_value->>'policy_version')::integer is distinct from p.version then raise exception 'cursor binding denied';end if;
  select * into anchor from mip_mentions.actor_revisions where scope=s and actor_id=a and id=(cursor_value->>'after_revision')::uuid;
  if not found then raise exception 'cursor binding denied';end if;after_version:=anchor.version;
 end if;
 select coalesce(array_agg(id order by version),'{}'::uuid[]) into ids from
 (select id,version from mip_mentions.actor_revisions where scope=s and actor_id=a and version>after_version order by version limit n+1)page;
 ev:=mip_mentions.revision_context(s,ids||array_remove(array[anchor.id],null),false);
 perform mip_mentions.check_mentions(s,ev,p);
 select coalesce(jsonb_agg(to_jsonb(x) order by version),'[]'::jsonb) into items from
 (select * from mip_mentions.actor_revisions where scope=s and id=any(ids) order by version limit n)x;
 if cardinality(ids)>n then last_id:=ids[n];next_cursor:=jsonb_build_object('scope',s,'actor_id',a,'policy_version',p.version,'after_revision',last_id);end if;
 return mip_mentions.interpretation(jsonb_build_object('items',items,'cursor',next_cursor,'historical_only',true,'policy_version',p.version));
end $$;
revoke all on mip_mentions.actor_revisions,mip_mentions.actor_lineage,mip_mentions.agency_assertions from public,mip_mentions_gateway,mip_mentions_admin;
revoke all on function mip_mentions.interpretation(jsonb),mip_mentions.lock_actors(uuid,uuid[]),mip_mentions.revision_context(uuid,uuid[],boolean),
 mip_mentions.agency_context(uuid,uuid,jsonb,text,boolean),mip_mentions.lock_agency(uuid,uuid,uuid,jsonb) from public,mip_mentions_gateway,mip_mentions_admin;
grant execute on function mip_mentions.put_actor_revision(uuid,uuid,uuid,integer,uuid,text,text,uuid[],text),
 mip_mentions.put_actor_lineage(uuid,uuid,uuid,integer,uuid,text,uuid[],uuid[],uuid[],text),
 mip_mentions.put_agency(uuid,uuid,uuid,uuid,text,integer,uuid,text,text,jsonb,uuid[],numeric,numeric,numeric,numeric,text),
 mip_mentions.read_agency(uuid,uuid,text,uuid),mip_mentions.actor_history(uuid,uuid,integer,jsonb) to mip_mentions_gateway;

-- History pages never claim current identity/agency acceptance. Validate selected
-- rows, lookahead and cursor anchor together; denied rows are not scanned past.
create function mip_mentions.agency_history(s uuid,action uuid,r text,cursor_value jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $agency$
declare p mip_mentions.policy;anchor mip_mentions.agency_assertions;ids uuid[];all_ids uuid[];actors uuid[];mentions uuid[];refs uuid[]:='{}';row_value mip_mentions.agency_assertions;m uuid;items jsonb;after_version integer:=0;next_cursor jsonb;
begin
 p:=mip_mentions.lock_policy();perform mip_mentions.authorize(s);
 if action is null or r is null then raise exception 'invalid history identity';end if;
 if cursor_value is not null then
  if jsonb_typeof(cursor_value)<>'object' or (cursor_value-array['scope','action_mention','role','policy_version','after_assertion'])<>'{}'::jsonb or
  not(cursor_value ?& array['scope','action_mention','role','policy_version','after_assertion']) or cursor_value->>'scope' is distinct from s::text or
  cursor_value->>'action_mention' is distinct from action::text or cursor_value->>'role' is distinct from r or
  (cursor_value->>'policy_version')::integer is distinct from p.version then raise exception 'cursor binding denied';end if;
  select * into anchor from mip_mentions.agency_assertions where scope=s and action_mention=action and role=r and id=(cursor_value->>'after_assertion')::uuid;
  if not found then raise exception 'cursor binding denied';end if;after_version:=anchor.version;
 end if;
 select coalesce(array_agg(id order by version),'{}'::uuid[]) into ids from
 (select id,version from mip_mentions.agency_assertions where scope=s and action_mention=action and role=r and version>after_version order by version limit 2)page;
 all_ids:=ids||array_remove(array[anchor.id],null);
 select coalesce(array_agg(distinct ar.actor_id),'{}'::uuid[]) into actors from mip_mentions.agency_assertions aa
 cross join lateral jsonb_array_elements(aa.choices)ch
 join mip_mentions.actor_revisions ar on ar.scope=aa.scope and ar.id=(ch->>'actor_revision_id')::uuid
 where aa.scope=s and aa.id=any(all_ids);
 perform mip_mentions.lock_actors(s,actors);
 select coalesce(array_agg(distinct participant_mention),'{}'::uuid[])||array[action] into mentions from mip_mentions.agency_assertions where scope=s and id=any(all_ids);
 for m in select distinct x from unnest(mentions)x order by x loop perform pg_advisory_xact_lock(hashtextextended(s::text||m::text,0));end loop;
 for row_value in select * from mip_mentions.agency_assertions where scope=s and id=any(all_ids) loop
  refs:=refs||row_value.evidence||mip_mentions.agency_context(s,row_value.participant_mention,row_value.choices,row_value.status,false);
  if cardinality(refs)>128 then raise exception 'operation context budget exceeded';end if;
 end loop;
 perform mip_mentions.check_mentions(s,mentions||refs,p);
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into items from (select * from mip_mentions.agency_assertions where scope=s and id=ids[1])x;
 if cardinality(ids)>1 then next_cursor:=jsonb_build_object('scope',s,'action_mention',action,'role',r,'policy_version',p.version,'after_assertion',ids[1]);end if;
 return mip_mentions.interpretation(jsonb_build_object('items',items,'cursor',next_cursor,'historical_only',true,'policy_version',p.version));
end $agency$;
create function mip_mentions.read_lineage(s uuid,a uuid,expected uuid) returns jsonb language plpgsql security definer set search_path='' as $agency$
declare p mip_mentions.policy;h mip_mentions.actor_lineage;actors uuid[];refs uuid[];actual uuid;
begin
 p:=mip_mentions.lock_policy();perform mip_mentions.authorize(s);
 select * into h from mip_mentions.actor_lineage where scope=s and anchor_actor=a and id=expected;
 if not found then raise exception 'lineage unavailable';end if;
 select array_agg(distinct actor_id) into actors from mip_mentions.actor_revisions where scope=s and id=any(h.from_revisions||h.to_revisions);
 perform mip_mentions.lock_actors(s,actors);
 select id into actual from mip_mentions.actor_lineage where scope=s and anchor_actor=a order by version desc limit 1;
 if actual is distinct from expected then raise exception 'stale lineage denied';end if;
 refs:=mip_mentions.revision_context(s,h.from_revisions||h.to_revisions,true);
 perform mip_mentions.check_mentions(s,h.evidence||refs,p);
 return mip_mentions.interpretation(jsonb_build_object('lineage',to_jsonb(h),'automatic_identity_rewrite',false,'policy_version',p.version));
end $agency$;
grant execute on function mip_mentions.agency_history(uuid,uuid,text,jsonb),mip_mentions.read_lineage(uuid,uuid,uuid) to mip_mentions_gateway;

reset role;
commit;
