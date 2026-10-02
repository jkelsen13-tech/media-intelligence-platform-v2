-- UNAPPLIED source proposal. Install only after reviewed_public_versions_v1 owner.
-- Personal state is private. No push/email, polling worker, source acquisition or publisher.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local search_path = pg_catalog;
lock table mip_private.reviewed_public_stories,mip_private.reviewed_public_story_versions,
  mip_private.reviewed_public_story_members,public.mip_profiles,public.articles,public.nodes in share row exclusive mode;
do $preflight$
declare actual jsonb; expected text:=current_setting('mip.story_following_expected_catalog',true);
begin
  -- BEGIN STORY FOLLOWING BASELINE
  select jsonb_build_object(
    'schema_owner',(select pg_get_userbyid(nspowner) from pg_namespace where nspname='mip_private'),
    'schema_acl',(select jsonb_agg(jsonb_build_object('grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
      'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable) order by a.grantee,a.grantor,a.privilege_type)
      from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where n.nspname='mip_private'),
    'relations',(select jsonb_agg(jsonb_build_object('identity',c.oid::regclass::text,'owner',pg_get_userbyid(c.relowner),
      'acl',c.relacl::text,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
      'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'acl',a.attacl::text) order by a.attnum)
        from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
      'constraints',(select coalesce(jsonb_agg(pg_get_constraintdef(x.oid) order by x.conname),'[]') from pg_constraint x where x.conrelid=c.oid),
      'policies',(select coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'cmd',p.polcmd,'roles',p.polroles,
        'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname),'[]') from pg_policy p where p.polrelid=c.oid),
      'triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid),
        'function',pg_get_functiondef(t.tgfoid)) order by t.tgname),'[]') from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal)) order by c.oid::regclass::text)
      from pg_class c where c.oid=any(array['mip_private.reviewed_public_stories'::regclass,'mip_private.reviewed_public_story_versions'::regclass,
        'mip_private.reviewed_public_story_members'::regclass,'public.mip_profiles'::regclass,'public.articles'::regclass,'public.nodes'::regclass])),
    'functions',(select jsonb_agg(jsonb_build_object('identity',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),
      'acl',p.proacl::text,'definition',pg_get_functiondef(p.oid)) order by p.oid::regprocedure::text) from pg_proc p
      where p.oid=any(array['public.read_reviewed_public_story_v1(uuid,uuid)'::regprocedure,
        'mip_private.public_story_version_is_visible(uuid)'::regprocedure])),
    'roles',(select jsonb_agg(jsonb_build_object('name',r.rolname,'superuser',r.rolsuper,'bypass_rls',r.rolbypassrls,
      'memberships',(select coalesce(jsonb_agg(jsonb_build_object('role',pg_get_userbyid(m.roleid),'grantor',pg_get_userbyid(m.grantor),
        'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option) order by m.roleid,m.grantor),'[]') from pg_auth_members m where m.member=r.oid)) order by r.rolname)
      from pg_roles r where r.rolname in ('anon','authenticated','service_role')),
    'history_completeness_helper',(select jsonb_build_object('identity',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),
      'acl',p.proacl::text,'definition',pg_get_functiondef(p.oid)) from pg_proc p
      where p.oid=to_regprocedure('mip_private.public_story_material_history_is_complete(uuid,uuid)')),
    'new_objects',(select coalesce(jsonb_agg(n.nspname||'.'||c.relname order by c.relname),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='mip_private' and c.relname in ('public_story_material_changes','public_story_follows','public_story_follow_events'))
  ) into actual;
  -- END STORY FOLLOWING BASELINE
  if nullif(expected,'') is null or actual is distinct from expected::jsonb then raise exception 'Story Following catalog baseline missing or drifted'; end if;
  if actual->'new_objects'<>'[]'::jsonb or actual->'history_completeness_helper'<>'null'::jsonb
    then raise exception 'Story Following package already installed'; end if;
  if current_user in ('anon','authenticated','service_role') or actual->>'schema_owner' is distinct from current_user
    or exists(select 1 from jsonb_array_elements(actual->'relations') r where r->>'owner' is distinct from current_user)
    then raise exception 'exact existing public story, profile and publication owner required'; end if;
end $preflight$;

create table mip_private.public_story_material_changes (
  material_change_id uuid primary key,
  story_id uuid not null references mip_private.reviewed_public_stories(story_id),
  public_version_id uuid not null unique references mip_private.reviewed_public_story_versions(public_version_id),
  previous_public_version_id uuid not null references mip_private.reviewed_public_story_versions(public_version_id),
  subject_type text not null check (subject_type in ('article','graph_node')),
  subject_id uuid not null,
  sequence bigint not null check (sequence > 1),
  effective_at timestamptz not null,
  declared_at timestamptz not null default clock_timestamp(),
  declared_by text not null,
  reason text not null check (length(btrim(reason)) between 1 and 2000),
  evidence_refs uuid[] not null check (cardinality(evidence_refs) between 1 and 100),
  review_refs text[] not null check (cardinality(review_refs) between 1 and 100),
  policy_version text not null check (length(btrim(policy_version)) between 1 and 200),
  kind text not null check (kind in ('event_established','update','correction','resolution')),
  importance text not null check (importance in ('major','material')),
  novelty text not null check (novelty in ('genuinely_new','correction')),
  event_state text not null check (event_state in ('active','resolved','unresolved')),
  request_fingerprint text not null,
  unique(story_id,sequence)
);
create table mip_private.public_story_follows (
  user_id uuid not null references public.mip_profiles(id),
  story_id uuid not null references mip_private.reviewed_public_stories(story_id),
  subject_type text not null check (subject_type in ('article','graph_node')),
  subject_id uuid not null,
  anchor_public_version_id uuid not null references mip_private.reviewed_public_story_versions(public_version_id),
  acknowledged_public_version_id uuid not null references mip_private.reviewed_public_story_versions(public_version_id),
  status text not null check (status in ('active','unsubscribed','revoked')),
  current_event_id uuid,
  primary key(user_id,story_id)
);
create table mip_private.public_story_follow_events (
  event_id uuid primary key,
  user_id uuid not null,
  story_id uuid not null,
  action text not null check (action in ('subscribe','acknowledge','unsubscribe','revoke')),
  previous_event_id uuid,
  request_fingerprint text not null,
  result jsonb not null,
  recorded_at timestamptz not null default clock_timestamp(),
  unique(user_id,story_id,event_id),
  foreign key(user_id,story_id) references mip_private.public_story_follows(user_id,story_id),
  foreign key(user_id,story_id,previous_event_id) references mip_private.public_story_follow_events(user_id,story_id,event_id)
);
alter table mip_private.public_story_follows add constraint public_story_follow_current_event
  foreign key(user_id,story_id,current_event_id) references mip_private.public_story_follow_events(user_id,story_id,event_id);
create index public_story_follows_story on mip_private.public_story_follows(story_id,user_id);

create function mip_private.public_story_material_payload(c mip_private.public_story_material_changes) returns jsonb
language sql immutable security invoker set search_path = '' as $$
  select jsonb_build_object('material_change_id',c.material_change_id,'story_id',c.story_id,
    'subject_type',c.subject_type,'subject_id',c.subject_id,'public_version_id',c.public_version_id,
    'previous_public_version_id',c.previous_public_version_id,'sequence',c.sequence::text,
    'effective_at',c.effective_at,'declared_at',c.declared_at,'reason',c.reason,
    'evidence_refs',c.evidence_refs,'review_refs',c.review_refs,'policy_version',c.policy_version,
    'kind',c.kind,'importance',c.importance,'novelty',c.novelty,'event_state',c.event_state,
    'materiality_owner','reviewed_publication_owner')
$$;

-- Uses the same publication owner as the canonical registry. Neither service
-- credentials nor a user-supplied review claim can declare a material change.
create function mip_private.declare_public_story_material_change_v1(p_input jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare after_v mip_private.reviewed_public_story_versions; before_v mip_private.reviewed_public_story_versions;
  s mip_private.reviewed_public_stories; c mip_private.public_story_material_changes;
  refs uuid[]; reviews text[]; after_members uuid[]; before_members uuid[]; fingerprint text; owner_name text; change_id uuid;
begin
  select pg_catalog.pg_get_userbyid(relowner) into owner_name from pg_catalog.pg_class
    where oid = 'mip_private.reviewed_public_story_versions'::regclass;
  if current_user <> owner_name then raise exception using errcode='42501',message='publication owner required'; end if;
  if p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>16384
    or (select array_agg(k order by k) from jsonb_object_keys(p_input) k) is distinct from
      array['effective_at','event_state','evidence_refs','importance','kind','material_change_id','novelty','policy_version','previous_public_version_id','public_version_id','reason','review_refs','story_id']::text[]
    or jsonb_typeof(p_input->'evidence_refs')<>'array' or jsonb_typeof(p_input->'review_refs')<>'array'
    or jsonb_array_length(p_input->'evidence_refs') not between 1 and 100 or jsonb_array_length(p_input->'review_refs') not between 1 and 100
    or exists(select 1 from jsonb_array_elements(p_input->'review_refs') x where jsonb_typeof(x)<>'string' or length(btrim(x#>>'{}')) not between 1 and 2000)
    then raise exception using errcode='22023',message='invalid material declaration'; end if;
  change_id := (p_input->>'material_change_id')::uuid;
  if change_id is null or (p_input->>'effective_at')::timestamptz is null then raise exception using errcode='22023',message='missing material identity or clock'; end if;
  if p_input->>'effective_at' !~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$'
    then raise exception using errcode='22023',message='explicit material clock offset required'; end if;
  select * into after_v from mip_private.reviewed_public_story_versions where public_version_id=(p_input->>'public_version_id')::uuid;
  select * into before_v from mip_private.reviewed_public_story_versions where public_version_id=(p_input->>'previous_public_version_id')::uuid;
  select * into s from mip_private.reviewed_public_stories where story_id=(p_input->>'story_id')::uuid;
  -- Append-only owner admission rows establish historical lineage identity.
  -- A correction may supersede or withdraw the predecessor's public payload;
  -- that denial must not prevent publication of its separately admitted successor.
  -- No predecessor source snapshot or nested evidence is read or returned here.
  if s.story_id is null or after_v.story_id is distinct from s.story_id or before_v.story_id is distinct from s.story_id
    or after_v.predecessor_public_version_id is distinct from before_v.public_version_id or before_v.sequence <> after_v.sequence-1
    or not mip_private.public_story_version_is_visible(after_v.public_version_id)
    then raise exception using errcode='22023',message='material declaration requires exact admitted predecessor'; end if;
  select array_agg(x::uuid order by x) into refs from jsonb_array_elements_text(p_input->'evidence_refs') x;
  select array_agg(x order by x) into reviews from jsonb_array_elements_text(p_input->'review_refs') x;
  select array_agg(article_public_version_id order by article_public_version_id) into after_members
    from mip_private.reviewed_public_story_members where public_version_id=after_v.public_version_id;
  select array_agg(article_public_version_id order by article_public_version_id) into before_members
    from mip_private.reviewed_public_story_members where public_version_id=before_v.public_version_id;
  if refs is null or cardinality(refs) <> (select count(distinct x) from unnest(refs) x)
    or not refs <@ after_members or reviews is null or not after_v.review_ref=any(reviews)
    or not reviews <@ array[after_v.review_ref,before_v.review_ref]
    or cardinality(reviews) <> (select count(distinct x) from unnest(reviews) x)
    or p_input->>'policy_version' is distinct from after_v.policy_version
    or after_members=before_members
    then raise exception using errcode='22023',message='material declaration lacks reviewed evidence difference'; end if;
  fingerprint := md5(p_input::text);
  select * into c from mip_private.public_story_material_changes where material_change_id=change_id;
  if found then
    if c.request_fingerprint<>fingerprint then raise exception using errcode='23505',message='material identity conflict'; end if;
    return mip_private.public_story_material_payload(c);
  end if;
  insert into mip_private.public_story_material_changes(material_change_id,story_id,public_version_id,previous_public_version_id,
    subject_type,subject_id,sequence,effective_at,declared_by,reason,evidence_refs,review_refs,policy_version,kind,importance,novelty,event_state,request_fingerprint)
  values(change_id,s.story_id,after_v.public_version_id,before_v.public_version_id,s.subject_type,s.subject_id,after_v.sequence,
    (p_input->>'effective_at')::timestamptz,current_user,p_input->>'reason',refs,reviews,p_input->>'policy_version',
    p_input->>'kind',p_input->>'importance',p_input->>'novelty',p_input->>'event_state',fingerprint) returning * into c;
  return mip_private.public_story_material_payload(c);
end $$;

create function mip_private.public_story_follow_payload(f mip_private.public_story_follows) returns jsonb
language sql immutable security invoker set search_path = '' as $$
  select jsonb_build_object('story_id',f.story_id,'subject_type',f.subject_type,'subject_id',f.subject_id,
    'anchor_public_version_id',f.anchor_public_version_id,'acknowledged_public_version_id',f.acknowledged_public_version_id,
    'status',f.status,'current_event_id',f.current_event_id)
$$;
create function mip_private.revoke_public_story_follow(p_user uuid,p_story uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare f mip_private.public_story_follows; eid uuid:=gen_random_uuid(); result jsonb;
begin
  select * into f from mip_private.public_story_follows where user_id=p_user and story_id=p_story for update;
  if not found or f.status='revoked' then return; end if;
  f.status := 'revoked'; f.current_event_id := eid;
  result := mip_private.public_story_follow_payload(f)||jsonb_build_object('receipt_id',eid,'action','revoke');
  insert into mip_private.public_story_follow_events(event_id,user_id,story_id,action,previous_event_id,request_fingerprint,result)
    select eid,p_user,p_story,'revoke',current_event_id,'revocation:'||eid::text,result from mip_private.public_story_follows where user_id=p_user and story_id=p_story;
  update mip_private.public_story_follows set status='revoked',current_event_id=eid where user_id=p_user and story_id=p_story;
end $$;
create function mip_private.read_public_story_follow(p_user uuid,p_story uuid,p_limit integer default 20) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare s mip_private.reviewed_public_stories; f mip_private.public_story_follows;
  head mip_private.reviewed_public_story_versions; ack mip_private.reviewed_public_story_versions;
  changes jsonb:='[]'; n integer:=0; admitted boolean; advanced boolean:=false; unclassified boolean:=false; story jsonb;
begin
  if p_limit is null or p_limit not between 1 and 50 then raise exception using errcode='22023',message='invalid following limit'; end if;
  select * into s from mip_private.reviewed_public_stories where story_id=p_story;
  if not found then raise exception using errcode='42501',message='story unavailable'; end if;
  -- Highest sequence first; eligibility never chooses an older head.
  select * into head from mip_private.reviewed_public_story_versions where story_id=p_story order by sequence desc limit 1;
  admitted := head.public_version_id is not null and mip_private.public_story_version_is_visible(head.public_version_id);
  if admitted then story:=public.read_reviewed_public_story_v1(p_story,head.public_version_id); end if;
  if not admitted then perform mip_private.revoke_public_story_follow(p_user,p_story); end if;
  select * into f from mip_private.public_story_follows where user_id=p_user and story_id=p_story;
  if f.status='active' and admitted then
    select * into ack from mip_private.reviewed_public_story_versions where public_version_id=f.acknowledged_public_version_id;
    advanced := head.sequence>ack.sequence;
    -- Recheck exact admitted lineage, then authorize only successor payloads.
    -- Predecessor IDs are historical references, never permission to display
    -- the predecessor's claims/source fields after correction or withdrawal.
    select count(*)::integer into n from mip_private.public_story_material_changes c
      join mip_private.reviewed_public_story_versions successor on successor.public_version_id=c.public_version_id
        and successor.story_id=c.story_id and successor.sequence=c.sequence
      join mip_private.reviewed_public_story_versions predecessor on predecessor.public_version_id=c.previous_public_version_id
        and predecessor.story_id=c.story_id and predecessor.sequence=successor.sequence-1
        and successor.predecessor_public_version_id=predecessor.public_version_id
      where c.story_id=p_story and c.sequence>ack.sequence and c.sequence<=head.sequence
      and c.subject_type=s.subject_type and c.subject_id=s.subject_id
      and mip_private.public_story_version_is_visible(successor.public_version_id);
    select coalesce(jsonb_agg(x.doc order by x.sequence),'[]') into changes from (
      select c.sequence,mip_private.public_story_material_payload(c) doc from mip_private.public_story_material_changes c
      join mip_private.reviewed_public_story_versions successor on successor.public_version_id=c.public_version_id
        and successor.story_id=c.story_id and successor.sequence=c.sequence
      join mip_private.reviewed_public_story_versions predecessor on predecessor.public_version_id=c.previous_public_version_id
        and predecessor.story_id=c.story_id and predecessor.sequence=successor.sequence-1
        and successor.predecessor_public_version_id=predecessor.public_version_id
      where c.story_id=p_story and c.sequence>ack.sequence and c.sequence<=head.sequence
      and c.subject_type=s.subject_type and c.subject_id=s.subject_id
      and mip_private.public_story_version_is_visible(successor.public_version_id)
      order by c.sequence limit p_limit) x;
    unclassified := exists(select 1 from mip_private.reviewed_public_story_versions v where v.story_id=p_story and v.sequence>ack.sequence
      and v.sequence<=head.sequence and not exists(select 1 from mip_private.public_story_material_changes c
        join mip_private.reviewed_public_story_versions predecessor on predecessor.public_version_id=c.previous_public_version_id
          and predecessor.story_id=c.story_id and predecessor.sequence=c.sequence-1
        where c.public_version_id=v.public_version_id and c.story_id=v.story_id and c.sequence=v.sequence
          and v.predecessor_public_version_id=predecessor.public_version_id
          and c.subject_type=s.subject_type and c.subject_id=s.subject_id
          and mip_private.public_story_version_is_visible(v.public_version_id)));
  end if;
  return jsonb_build_object('contract','mip-public-story-following-v1','scope','public_story','delivery_channel','in_app',
    'story_id',p_story,'subject_type',s.subject_type,'subject_id',s.subject_id,'story_status',case when admitted then 'public' else 'revoked' end,
    'subscription',case when f.story_id is null then null else mip_private.public_story_follow_payload(f) end,
    'head_public_version_id',case when admitted then head.public_version_id else null end,
    'story_title',case when admitted then story->'members'->0->>'title' else null end,
    'changes',changes,'unread_count',n,'has_more',n>p_limit,'version_advanced',advanced,
    'unclassified_version_changes',unclassified,'coverage','declared_material_changes_only');
end $$;

create function public.mip_public_story_following_v1(p_action text,p_input jsonb default '{}') returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare uid uuid; sid uuid; eid uuid; expected uuid; fp text; result jsonb; k text;
  required text[]; optional text[]; page_limit integer; after_id uuid; items jsonb:='[]'; doc jsonb; more boolean:=false;
  f mip_private.public_story_follows; old_event mip_private.public_story_follow_events;
  s mip_private.reviewed_public_stories; head mip_private.reviewed_public_story_versions; v mip_private.reviewed_public_story_versions;
  ack mip_private.reviewed_public_story_versions;
begin
  if current_user<>'service_role' then raise exception using errcode='42501',message='verified service boundary required'; end if;
  if p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>16384 then raise exception using errcode='22023',message='invalid following request'; end if;
  if p_action='list' then required:=array['user_id']; optional:=array['after','limit'];
  elsif p_action='read' then required:=array['user_id','story_id']; optional:=array['limit'];
  elsif p_action in ('subscribe','acknowledge') then required:=array['user_id','story_id','subject_type','subject_id','public_version_id','event_id','previous_event_id']; optional:=array[]::text[];
  elsif p_action in ('unsubscribe','revoke') then required:=array['user_id','story_id','event_id','previous_event_id']; optional:=array[]::text[];
  else raise exception using errcode='22023',message='unsupported following action'; end if;
  if not p_input ?& required or exists(select 1 from jsonb_object_keys(p_input) x where not x=any(required||optional)) then raise exception using errcode='22023',message='invalid following keys'; end if;
  uid:=(p_input->>'user_id')::uuid;
  if uid is null or not exists(select 1 from public.mip_profiles where id=uid) then raise exception using errcode='42501',message='account unavailable'; end if;
  page_limit:=coalesce((p_input->>'limit')::integer,20);
  if page_limit not between 1 and 50 then raise exception using errcode='22023',message='invalid following limit'; end if;
  if p_action='list' then
    after_id:=(p_input->>'after')::uuid;
    if after_id is not null and not exists(select 1 from mip_private.public_story_follows where user_id=uid and story_id=after_id) then raise exception using errcode='22023',message='foreign following cursor'; end if;
    -- Foreground list observes revocation for this account only, including rows before the cursor.
    for sid in select story_id from mip_private.public_story_follows where user_id=uid and status='active' order by story_id loop
      doc:=mip_private.read_public_story_follow(uid,sid,20);
      if (after_id is null or sid>after_id) and doc->'subscription'->>'status'='active' and doc->>'story_status'='public' then
        if jsonb_array_length(items)<page_limit then items:=items||jsonb_build_array(doc); else more:=true; exit; end if;
      end if;
    end loop;
    return jsonb_build_object('contract','mip-public-story-following-v1','scope','public_story','delivery_channel','in_app',
      'items',items,'has_more',more,'next_after',case when more then items->-1->>'story_id' else null end);
  end if;
  sid:=(p_input->>'story_id')::uuid;
  if sid is null then raise exception using errcode='22023',message='missing story'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(uid::text),pg_catalog.hashtext(sid::text));
  if p_action='read' then return mip_private.read_public_story_follow(uid,sid,page_limit); end if;
  eid:=(p_input->>'event_id')::uuid; expected:=(p_input->>'previous_event_id')::uuid;
  if eid is null then raise exception using errcode='22023',message='missing event'; end if;
  select * into s from mip_private.reviewed_public_stories where story_id=sid;
  if not found then raise exception using errcode='42501',message='story unavailable'; end if;
  select * into head from mip_private.reviewed_public_story_versions where story_id=sid order by sequence desc limit 1;
  if p_action in ('subscribe','acknowledge') then
    if head.public_version_id is null or not mip_private.public_story_version_is_visible(head.public_version_id) then
      perform mip_private.revoke_public_story_follow(uid,sid);
      -- A returned refusal lets the revocation commit; raising here would undo it.
      return jsonb_build_object('error_code','access_denied');
    end if;
    select * into v from mip_private.reviewed_public_story_versions where public_version_id=(p_input->>'public_version_id')::uuid;
    if v.story_id is distinct from sid or not mip_private.public_story_version_is_visible(v.public_version_id)
      or s.subject_type is distinct from p_input->>'subject_type' or s.subject_id is distinct from (p_input->>'subject_id')::uuid then
      raise exception using errcode='22023',message='displayed public version binding invalid'; end if;
  end if;
  fp:=md5(p_action||':'||p_input::text);
  select * into old_event from mip_private.public_story_follow_events where event_id=eid;
  if found then
    if old_event.user_id<>uid or old_event.story_id<>sid or old_event.request_fingerprint<>fp then raise exception using errcode='23505',message='event identity conflict'; end if;
    return old_event.result;
  end if;
  select * into f from mip_private.public_story_follows where user_id=uid and story_id=sid for update;
  if f.current_event_id is distinct from expected then raise exception using errcode='40001',message='following version conflict'; end if;
  if p_action='subscribe' then
    if f.story_id is null then
      insert into mip_private.public_story_follows(user_id,story_id,subject_type,subject_id,anchor_public_version_id,acknowledged_public_version_id,status)
        values(uid,sid,s.subject_type,s.subject_id,v.public_version_id,v.public_version_id,'active') returning * into f;
    else
      select * into ack from mip_private.reviewed_public_story_versions where public_version_id=f.acknowledged_public_version_id;
      if v.sequence<ack.sequence then raise exception using errcode='40001',message='acknowledgement cannot move backwards'; end if;
      f.status:='active'; f.acknowledged_public_version_id:=v.public_version_id;
    end if;
  elsif p_action='acknowledge' then
    if f.status is distinct from 'active' then raise exception using errcode='22023',message='active follow required'; end if;
    select * into ack from mip_private.reviewed_public_story_versions where public_version_id=f.acknowledged_public_version_id;
    if v.sequence<ack.sequence then raise exception using errcode='40001',message='acknowledgement cannot move backwards'; end if;
    f.acknowledged_public_version_id:=v.public_version_id;
  else
    if f.story_id is null then raise exception using errcode='22023',message='saved follow required'; end if;
    f.status:=case when p_action='revoke' then 'revoked' else 'unsubscribed' end;
  end if;
  f.current_event_id:=eid;
  result:=mip_private.public_story_follow_payload(f)||jsonb_build_object('contract','mip-public-story-following-v1',
    'scope','public_story','delivery_channel','in_app','receipt_id',eid,'action',p_action);
  insert into mip_private.public_story_follow_events(event_id,user_id,story_id,action,previous_event_id,request_fingerprint,result)
    values(eid,uid,sid,p_action,expected,fp,result);
  update mip_private.public_story_follows set status=f.status,acknowledged_public_version_id=f.acknowledged_public_version_id,current_event_id=eid where user_id=uid and story_id=sid;
  return result;
end $$;

-- Public material history is read through column grants and RLS; never through
-- a definer with access to private follows. Each evidence envelope is reread
-- through the existing publication projection and current eligibility gate.
alter table mip_private.public_story_material_changes enable row level security;
alter table mip_private.public_story_material_changes force row level security;
-- The publication owner established immutable predecessor identity at declare
-- time. Public metadata reads authorize successor/current-head payloads only;
-- reading the predecessor payload would suppress the very correction notice.
create policy public_story_material_read on mip_private.public_story_material_changes for select to anon,authenticated
  using (public.read_reviewed_public_story_v1(story_id,public_version_id) is not null
    and public.read_reviewed_public_story_v1(story_id,null) is not null);
create policy public_story_material_service on mip_private.public_story_material_changes for select to service_role using (true);
do $$ declare owner_name text; begin
  select pg_catalog.pg_get_userbyid(relowner) into owner_name from pg_catalog.pg_class
    where oid='mip_private.reviewed_public_story_versions'::regclass;
  execute format('create policy public_story_material_owner on mip_private.public_story_material_changes for all to %I using (true) with check (true)',owner_name);
  execute format('grant select,insert on mip_private.public_story_material_changes to %I',owner_name);
  execute format('grant execute on function mip_private.declare_public_story_material_change_v1(jsonb),mip_private.public_story_material_payload(mip_private.public_story_material_changes) to %I',owner_name);
end $$;
alter table mip_private.public_story_follows enable row level security;
alter table mip_private.public_story_follows force row level security;
alter table mip_private.public_story_follow_events enable row level security;
alter table mip_private.public_story_follow_events force row level security;
create policy public_story_follow_service on mip_private.public_story_follows for all to service_role using (true) with check (true);
create policy public_story_follow_event_service on mip_private.public_story_follow_events for all to service_role using (true) with check (true);

-- A coarse continuity proof, not a payload reader or arbitrary-count oracle.
-- Invoker RLS can hide a declaration before the context loop sees it. Only the
-- checked publication owner may inspect the immutable declaration ledger here.
-- The exact selected version must remain independently public; declarations
-- beyond it, personal follows, and withheld identities/content are not exposed.
create function mip_private.public_story_material_history_is_complete(p_story_id uuid,p_public_version_id uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare selected jsonb; selected_sequence bigint; head_visible boolean;
begin
  selected:=public.read_reviewed_public_story_v1(p_story_id,p_public_version_id);
  if selected is null then return false; end if;
  selected_sequence:=(selected->>'sequence')::bigint;
  -- The public context's 100-declaration limit also bounds this private proof;
  -- more admitted declarations mean incomplete coverage, even if all are public.
  if exists(select 1 from mip_private.public_story_material_changes c
    where c.story_id=p_story_id and c.sequence<=selected_sequence offset 100 limit 1)
    then return false; end if;
  head_visible:=public.read_reviewed_public_story_v1(p_story_id,null) is not null;
  return not exists(select 1 from mip_private.public_story_material_changes c
    where c.story_id=p_story_id and c.sequence<=selected_sequence
      -- Match the public material-row policy, including its current-head gate.
      and (not head_visible or public.read_reviewed_public_story_v1(p_story_id,c.public_version_id) is null));
end $$;

create function public.read_reviewed_public_story_context_v1(p_story_id uuid,p_public_version_id uuid default null) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare story jsonb; selected_sequence bigint; changes jsonb:='[]'; evidence jsonb:='[]'; c record; envelope jsonb; member jsonb;
  n integer:=0; additional integer; truncated boolean:=false; result jsonb;
begin
  story:=public.read_reviewed_public_story_v1(p_story_id,p_public_version_id);
  -- The canonical owner checks the exact requested version. A default read
  -- still selects the newest sequence before permission, without fallback;
  -- a separately admitted historical version does not inherit head denial.
  if story is null then return null; end if;
  selected_sequence:=(story->>'sequence')::bigint;
  truncated:=not mip_private.public_story_material_history_is_complete(p_story_id,(story->>'public_version_id')::uuid);
  for c in select material_change_id,story_id,subject_type,subject_id,public_version_id,previous_public_version_id,sequence,
    effective_at,declared_at,reason,evidence_refs,review_refs,policy_version,kind,importance,novelty,event_state
    from mip_private.public_story_material_changes where story_id=p_story_id and sequence<=selected_sequence order by sequence desc limit 101 loop
    n:=n+1; if n>100 then truncated:=true; exit; end if;
    envelope:=public.read_reviewed_public_story_v1(p_story_id,c.public_version_id);
    if envelope is null then truncated:=true; continue; end if;
    -- Missing exact evidence is also incomplete. Never append a declaration
    -- whose authorized envelope cannot supply every selected evidence ref.
    if exists(select 1 from unnest(c.evidence_refs) ref where not exists(
      select 1 from jsonb_array_elements(envelope->'members') x where x->>'public_version_id'=ref::text))
      then truncated:=true; continue; end if;
    select count(*)::integer into additional from unnest(c.evidence_refs) ref
      where not exists(select 1 from jsonb_array_elements(evidence) x where x->>'public_version_id'=ref::text);
    if jsonb_array_length(evidence)+additional>100 then truncated:=true; exit; end if;
    changes:=jsonb_build_array(to_jsonb(c)||jsonb_build_object('sequence',c.sequence::text,'materiality_owner','reviewed_publication_owner'))||changes;
    for member in select value from jsonb_array_elements(envelope->'members') where (value->>'public_version_id')::uuid=any(c.evidence_refs) loop
      if not exists(select 1 from jsonb_array_elements(evidence) x where x->>'public_version_id'=member->>'public_version_id') then evidence:=evidence||jsonb_build_array(member); end if;
    end loop;
  end loop;
  result:=jsonb_build_object('contract','mip-public-story-context-v1','story',story,'material_changes',changes,
    'evidence_versions',evidence,'has_more',truncated,'coverage','declared_material_changes_only');
  if octet_length(result::text)>2097152 then return null; end if;
  return result;
end $$;

revoke all on mip_private.public_story_material_changes,mip_private.public_story_follows,mip_private.public_story_follow_events from public,anon,authenticated,service_role;
grant usage on schema mip_private to anon,authenticated,service_role;
grant select(material_change_id,story_id,subject_type,subject_id,public_version_id,previous_public_version_id,sequence,effective_at,declared_at,reason,evidence_refs,review_refs,policy_version,kind,importance,novelty,event_state)
  on mip_private.public_story_material_changes to anon,authenticated;
grant select on mip_private.public_story_material_changes,mip_private.reviewed_public_stories,mip_private.reviewed_public_story_versions to service_role;
grant select(id) on public.mip_profiles to service_role;
grant select,insert,update on mip_private.public_story_follows to service_role;
grant select,insert on mip_private.public_story_follow_events to service_role;
revoke all on function mip_private.declare_public_story_material_change_v1(jsonb),mip_private.public_story_material_payload(mip_private.public_story_material_changes),
  mip_private.public_story_follow_payload(mip_private.public_story_follows),mip_private.revoke_public_story_follow(uuid,uuid),
  mip_private.read_public_story_follow(uuid,uuid,integer),mip_private.public_story_material_history_is_complete(uuid,uuid),
  public.mip_public_story_following_v1(text,jsonb),public.read_reviewed_public_story_context_v1(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function mip_private.public_story_material_payload(mip_private.public_story_material_changes),mip_private.public_story_follow_payload(mip_private.public_story_follows),
  mip_private.revoke_public_story_follow(uuid,uuid),mip_private.read_public_story_follow(uuid,uuid,integer),public.mip_public_story_following_v1(text,jsonb),
  mip_private.public_story_version_is_visible(uuid) to service_role;
grant execute on function mip_private.public_story_material_history_is_complete(uuid,uuid),public.read_reviewed_public_story_context_v1(uuid,uuid)
  to anon,authenticated,service_role;
create function mip_private.reject_public_story_material_mutation() returns trigger
language plpgsql security invoker set search_path='' as $$ begin
  raise exception using errcode='42501',message='material declarations are immutable';
end $$;
revoke all on function mip_private.reject_public_story_material_mutation() from public,anon,authenticated,service_role;
create trigger public_story_material_immutable before update or delete on mip_private.public_story_material_changes
for each row execute function mip_private.reject_public_story_material_mutation();
create trigger public_story_material_no_truncate before truncate on mip_private.public_story_material_changes
for each statement execute function mip_private.reject_public_story_material_mutation();
create trigger public_story_follow_event_immutable before update or delete on mip_private.public_story_follow_events
for each row execute function mip_private.reject_public_story_material_mutation();
create trigger public_story_follow_event_no_truncate before truncate on mip_private.public_story_follow_events
for each statement execute function mip_private.reject_public_story_material_mutation();

-- Existing owner withdrawal changes revoke preferences at the same transaction
-- boundary. Foreground checks also cover other evidence eligibility changes.
create function mip_private.revoke_ineligible_story_follows() returns trigger
language plpgsql security invoker set search_path='' as $$
declare f record; affected_id uuid;
begin
  affected_id:=case when tg_op='DELETE' then old.id else new.id end;
  for f in select pref.user_id,pref.story_id from mip_private.public_story_follows pref
    join mip_private.reviewed_public_stories s on s.story_id=pref.story_id
    join lateral (select v.public_version_id from mip_private.reviewed_public_story_versions v where v.story_id=s.story_id order by v.sequence desc limit 1) head on true
    where pref.status='active' and not mip_private.public_story_version_is_visible(head.public_version_id)
      and ((tg_table_name='nodes' and s.subject_type='graph_node' and s.subject_id=affected_id)
        or (tg_table_name='articles' and (s.subject_type='article' and s.subject_id=affected_id
          or exists(select 1 from mip_private.reviewed_public_story_members m join mip_private.reviewed_public_article_versions a
            on a.public_version_id=m.article_public_version_id where m.public_version_id=head.public_version_id and a.article_id=affected_id))))
    order by pref.user_id,pref.story_id loop
    perform mip_private.revoke_public_story_follow(f.user_id,f.story_id);
  end loop;
  return null;
end $$;
revoke all on function mip_private.revoke_ineligible_story_follows() from public,anon,authenticated,service_role;
grant execute on function mip_private.revoke_ineligible_story_follows() to service_role;
do $$ declare owner_name text; begin
  select pg_get_userbyid(relowner) into owner_name from pg_class where oid='mip_private.reviewed_public_story_versions'::regclass;
  execute format('create policy public_story_follow_owner on mip_private.public_story_follows for all to %I using (true) with check (true)',owner_name);
  execute format('create policy public_story_follow_event_owner on mip_private.public_story_follow_events for all to %I using (true) with check (true)',owner_name);
  execute format('grant execute on function mip_private.revoke_public_story_follow(uuid,uuid),mip_private.public_story_follow_payload(mip_private.public_story_follows),mip_private.revoke_ineligible_story_follows() to %I',owner_name);
end $$;
create trigger public_story_follow_article_withdrawal after update of reader_state,source_status,url,outlet,title,summary,published_at on public.articles
for each row execute function mip_private.revoke_ineligible_story_follows();
create trigger public_story_follow_subject_withdrawal after update of type or delete on public.nodes
for each row execute function mip_private.revoke_ineligible_story_follows();
comment on table mip_private.public_story_follows is 'Private foreground public Story Following. Separate from investigation preferences; explicit displayed-version ack, CAS, revocation, in-app only.';
comment on table mip_private.public_story_material_changes is 'Append-only reviewed publication-owner declarations. Source-report permission does not admit a proposition; no automatic breaking classification.';
commit;
