-- SOURCE PROPOSAL ONLY. No live installation, row admission, migration replay
-- or grant change is authorized. Owner must pin a fresh full catalog baseline.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local search_path=pg_catalog;
lock table public.articles,public.nodes,evidence_pipeline.article_captures,
  public.article_claims,public.claims,public.event_articles,public.events,public.citations in share row exclusive mode;
do $preflight$
declare actual jsonb; expected text:=current_setting('mip.public_reviewed_versions_expected_catalog',true);
begin
  -- BEGIN REVIEWED VERSION BASELINE
  select jsonb_build_object(
    'relations',(select jsonb_agg(jsonb_build_object('identity',c.oid::regclass::text,
      'owner',pg_get_userbyid(c.relowner),'kind',c.relkind,'acl',c.relacl::text,
      'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'options',c.reloptions,
      'definition',case when c.relkind='v' then pg_get_viewdef(c.oid,true) else null end,
      'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
        'not_null',a.attnotnull,'acl',a.attacl::text) order by a.attnum) from pg_attribute a
        where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
      'constraints',(select coalesce(jsonb_agg(pg_get_constraintdef(x.oid) order by x.conname),'[]') from pg_constraint x where x.conrelid=c.oid),
      'policies',(select coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'cmd',p.polcmd,'roles',p.polroles,
        'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname),'[]') from pg_policy p where p.polrelid=c.oid),
      'triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,
        'definition',pg_get_triggerdef(t.oid),'function',pg_get_functiondef(t.tgfoid)) order by t.tgname),'[]')
        from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal)) order by c.oid::regclass::text)
      from pg_class c where c.oid=any(array['public.articles'::regclass,'public.nodes'::regclass,
        'evidence_pipeline.article_captures'::regclass,'public.article_claims'::regclass,'public.claims'::regclass,
        'public.event_articles'::regclass,'public.events'::regclass,'public.citations'::regclass,
        'mip_private.reader_claim_surfaces'::regclass])),
    'roles',(select jsonb_agg(jsonb_build_object('name',r.rolname,'superuser',r.rolsuper,'bypass_rls',r.rolbypassrls,
      'memberships',(select coalesce(jsonb_agg(p.rolname order by p.rolname),'[]') from pg_roles p
        where p.oid<>r.oid and pg_has_role(r.oid,p.oid,'MEMBER'))) order by r.rolname)
      from pg_roles r where r.rolname in ('anon','authenticated','service_role')),
    'new_objects',(select coalesce(jsonb_agg(n.nspname||'.'||c.relname order by n.nspname,c.relname),'[]')
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='mip_private'
      and c.relname in ('reviewed_public_article_versions','reviewed_public_article_evidence','reviewed_public_stories',
        'reviewed_public_story_versions','reviewed_public_story_members','public_reviewed_article_versions','public_reviewed_article_evidence'))
  ) into actual;
  -- END REVIEWED VERSION BASELINE
  if nullif(expected,'') is null or actual is distinct from expected::jsonb then raise exception 'reviewed public version catalog baseline missing or drifted'; end if;
  if actual->'new_objects'<>'[]'::jsonb then raise exception 'reviewed public version package already installed or names occupied'; end if;
  if (select pg_get_userbyid(relowner) from pg_class where oid='public.articles'::regclass) is distinct from current_user
    or (select pg_get_userbyid(relowner) from pg_class where oid='public.nodes'::regclass) is distinct from current_user then
    raise exception 'exact existing article and graph publication owner required';
  end if;
  if current_user in ('anon','authenticated','service_role') then raise exception 'ordinary readers and ingestion service are not publication owners'; end if;
end $preflight$;

create table mip_private.reviewed_public_article_versions (
  public_version_id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id),
  capture_id uuid not null references evidence_pipeline.article_captures(id),
  capture_hash text not null check(capture_hash ~ '^[0-9a-f]{64}$'),
  sequence bigint not null check(sequence>0),
  admission_kind text not null check(admission_kind in ('source_report','reviewed_proposition')),
  review_ref text not null check(length(btrim(review_ref)) between 1 and 500),
  reviewed_by name not null,
  reviewed_at timestamptz not null,
  visible_at timestamptz not null check(visible_at>=reviewed_at),
  policy_version text not null check(length(btrim(policy_version)) between 1 and 120),
  predecessor_public_version_id uuid references mip_private.reviewed_public_article_versions(public_version_id),
  correction_reason text,
  remaining_uncertainty text not null check(length(btrim(remaining_uncertainty)) between 1 and 4000),
  source_snapshot jsonb not null,
  unique(article_id,sequence), unique(article_id,review_ref),
  check((sequence=1 and predecessor_public_version_id is null and correction_reason is null)
    or (sequence>1 and predecessor_public_version_id is not null and length(btrim(correction_reason))>0))
);
create index reviewed_public_article_capture on mip_private.reviewed_public_article_versions(capture_id);
create table mip_private.reviewed_public_article_evidence (
  public_version_id uuid not null references mip_private.reviewed_public_article_versions(public_version_id),
  article_claim_id uuid not null references public.article_claims(id),
  claim_id uuid not null references public.claims(id),
  capture_id uuid not null references evidence_pipeline.article_captures(id),
  capture_hash text not null check(capture_hash ~ '^[0-9a-f]{64}$'),
  source_field text not null check(source_field in ('title','summary','body_text')),
  span_start integer not null check(span_start>=0), span_end integer not null check(span_end>span_start),
  excerpt text not null, excerpt_hash text not null check(excerpt_hash ~ '^[0-9a-f]{64}$'),
  surface_text text not null, canonical_text text not null,
  primary key(public_version_id,article_claim_id), check(char_length(excerpt)=span_end-span_start)
);
create table mip_private.reviewed_public_stories (
  story_id uuid primary key default gen_random_uuid(),
  subject_type text not null check(subject_type in ('article','graph_node')),
  subject_id uuid not null,
  subject_kind text not null,
  unique(subject_type,subject_id)
);
create table mip_private.reviewed_public_story_versions (
  public_version_id uuid primary key default gen_random_uuid(),
  story_id uuid not null references mip_private.reviewed_public_stories(story_id),
  sequence bigint not null check(sequence>0),
  predecessor_public_version_id uuid references mip_private.reviewed_public_story_versions(public_version_id),
  review_ref text not null check(length(btrim(review_ref)) between 1 and 500), reviewed_by name not null,
  reviewed_at timestamptz not null, visible_at timestamptz not null check(visible_at>=reviewed_at),
  policy_version text not null check(length(btrim(policy_version)) between 1 and 120), correction_reason text,
  unique(story_id,sequence), unique(story_id,review_ref),
  check((sequence=1 and predecessor_public_version_id is null and correction_reason is null)
    or (sequence>1 and predecessor_public_version_id is not null and length(btrim(correction_reason))>0))
);
create table mip_private.reviewed_public_story_members (
  public_version_id uuid not null references mip_private.reviewed_public_story_versions(public_version_id),
  article_public_version_id uuid not null references mip_private.reviewed_public_article_versions(public_version_id),
  ordinal integer not null check(ordinal between 1 and 100),
  primary key(public_version_id,article_public_version_id),unique(public_version_id,ordinal)
);

-- This ledger binds decisions made by the existing owners. It changes no
-- capture review state, article eligibility, claim/event review or graph record.
create function mip_private.public_article_evidence_is_visible(p_version uuid,p_claim uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from mip_private.reviewed_public_article_evidence e
    join mip_private.reviewed_public_article_versions v on v.public_version_id=e.public_version_id
    join evidence_pipeline.article_captures cap on cap.id=e.capture_id
    join mip_private.reader_claim_surfaces rs on rs.id=e.article_claim_id
    join public.article_claims ac on ac.id=e.article_claim_id
    join public.claims c on c.id=e.claim_id
    where e.public_version_id=p_version and e.article_claim_id=p_claim
      and e.capture_id=v.capture_id and e.capture_hash=v.capture_hash and cap.article_id=v.article_id
      and cap.content_hash=e.capture_hash and encode(sha256(convert_to(cap.payload::text,'UTF8')),'hex')=e.capture_hash
      and ac.article_id=v.article_id and ac.claim_id=e.claim_id
      and ac.surface_text=e.surface_text and c.canonical_text=e.canonical_text
      and ac.evidence_source_field=e.source_field and ac.evidence_excerpt=e.excerpt
      and ac.char_start=e.span_start and ac.char_end=e.span_end
      and substring(cap.payload->>e.source_field from e.span_start+1 for e.span_end-e.span_start)=e.excerpt
      and encode(sha256(convert_to(e.excerpt,'UTF8')),'hex')=e.excerpt_hash)
$$;
create function mip_private.public_article_version_is_visible(p_version uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from mip_private.reviewed_public_article_versions v
    join public.articles a on a.id=v.article_id join evidence_pipeline.article_captures cap on cap.id=v.capture_id
    where v.public_version_id=p_version and a.reader_state='eligible' and a.source_status='active'
      and cap.article_id=v.article_id and cap.content_hash=v.capture_hash
      and encode(sha256(convert_to(cap.payload::text,'UTF8')),'hex')=v.capture_hash
      and a.url=v.source_snapshot->>'url' and a.outlet=v.source_snapshot->>'outlet'
      and (v.admission_kind='source_report' or (a.title=v.source_snapshot->>'title'
        and a.summary is not distinct from v.source_snapshot->>'summary'
        and a.published_at is not distinct from (v.source_snapshot->>'published_at')::timestamptz
        and exists(select 1 from mip_private.reviewed_public_article_evidence e where e.public_version_id=v.public_version_id)))
      and not exists(select 1 from mip_private.reviewed_public_article_evidence e where e.public_version_id=v.public_version_id
        and not mip_private.public_article_evidence_is_visible(v.public_version_id,e.article_claim_id)))
$$;
create view mip_private.public_reviewed_article_versions with (security_barrier=true,security_invoker=true)
as select * from mip_private.reviewed_public_article_versions v where mip_private.public_article_version_is_visible(v.public_version_id);
create view mip_private.public_reviewed_article_evidence with (security_barrier=true,security_invoker=true)
as select e.* from mip_private.reviewed_public_article_evidence e
where mip_private.public_article_version_is_visible(e.public_version_id) and mip_private.public_article_evidence_is_visible(e.public_version_id,e.article_claim_id);

create function mip_private.bind_reviewed_public_article_version(
  p_article_id uuid,p_capture_id uuid,p_capture_hash text,p_admission_kind text,p_review_ref text,p_policy_version text,
  p_remaining_uncertainty text,p_article_claim_ids uuid[] default '{}',p_predecessor_public_version_id uuid default null,
  p_correction_reason text default null) returns uuid
language plpgsql security invoker set search_path='' as $$
declare a public.articles; cap evidence_pipeline.article_captures; head mip_private.reviewed_public_article_versions;
  v uuid; ac record; n integer:=0; stamp timestamptz:=clock_timestamp(); snap jsonb;
begin
  if current_user in ('anon','authenticated','service_role') or current_user is distinct from
    (select pg_get_userbyid(relowner) from pg_class where oid='public.articles'::regclass) then raise exception 'existing article publication owner required'; end if;
  if p_admission_kind is null or p_admission_kind not in ('source_report','reviewed_proposition') or nullif(btrim(p_review_ref),'') is null
    or nullif(btrim(p_policy_version),'') is null or nullif(btrim(p_remaining_uncertainty),'') is null
    or p_article_claim_ids is null or cardinality(p_article_claim_ids)>100
    or cardinality(p_article_claim_ids)<>(select count(distinct x) from unnest(p_article_claim_ids)x)
    or (p_admission_kind='source_report' and cardinality(p_article_claim_ids)>0)
    or (p_admission_kind='reviewed_proposition' and cardinality(p_article_claim_ids)=0) then raise exception 'invalid explicit admission contract'; end if;
  select * into a from public.articles where id=p_article_id for update;
  if not found or a.reader_state<>'eligible' or a.source_status<>'active' then raise exception 'existing source publication permission required'; end if;
  select * into cap from evidence_pipeline.article_captures where id=p_capture_id for key share;
  if not found or cap.article_id<>a.id or cap.content_hash is distinct from p_capture_hash
    or encode(sha256(convert_to(cap.payload::text,'UTF8')),'hex') is distinct from p_capture_hash then raise exception 'exact retained capture/hash mismatch'; end if;
  if cap.payload->>'url' is distinct from a.url or cap.payload->>'outlet' is distinct from a.outlet then raise exception 'source identity mismatch'; end if;
  if p_admission_kind='reviewed_proposition' and (cap.payload->>'title' is distinct from a.title
    or cap.payload->>'summary' is distinct from a.summary
    or (cap.payload->>'published_at')::timestamptz is distinct from a.published_at) then raise exception 'proposition capture must match existing published source version'; end if;
  select * into head from mip_private.reviewed_public_article_versions where article_id=a.id order by sequence desc limit 1;
  if head.public_version_id is distinct from p_predecessor_public_version_id then raise exception 'public article predecessor conflict'; end if;
  if (head.public_version_id is null and p_correction_reason is not null)
    or (head.public_version_id is not null and nullif(btrim(p_correction_reason),'') is null) then raise exception 'correction lineage reason required'; end if;
  snap:=jsonb_build_object('url',cap.payload->>'url','outlet',cap.payload->>'outlet','title',cap.payload->>'title',
    'summary',cap.payload->>'summary','published_at',(cap.payload->>'published_at')::timestamptz,'fetched_at',a.fetched_at,'captured_at',cap.captured_at);
  insert into mip_private.reviewed_public_article_versions(article_id,capture_id,capture_hash,sequence,admission_kind,review_ref,
    reviewed_by,reviewed_at,visible_at,policy_version,predecessor_public_version_id,correction_reason,remaining_uncertainty,source_snapshot)
  values(a.id,cap.id,cap.content_hash,coalesce(head.sequence,0)+1,p_admission_kind,p_review_ref,current_user,stamp,stamp,
    p_policy_version,head.public_version_id,p_correction_reason,p_remaining_uncertainty,snap) returning public_version_id into v;
  for ac in select ac0.*,c.canonical_text from public.article_claims ac0 join public.claims c on c.id=ac0.claim_id
    join mip_private.reader_claim_surfaces rs on rs.id=ac0.id where ac0.id=any(p_article_claim_ids) and ac0.article_id=a.id loop
    if ac.evidence_source_field is null or ac.char_start is null or ac.char_end is null or ac.evidence_excerpt is null
      or ac.char_start<0 or ac.char_end<=ac.char_start
      or substring(cap.payload->>ac.evidence_source_field from ac.char_start+1 for ac.char_end-ac.char_start) is distinct from ac.evidence_excerpt then
      raise exception 'exact admitted evidence span mismatch'; end if;
    insert into mip_private.reviewed_public_article_evidence values(v,ac.id,ac.claim_id,cap.id,cap.content_hash,
      ac.evidence_source_field,ac.char_start,ac.char_end,ac.evidence_excerpt,
      encode(sha256(convert_to(ac.evidence_excerpt,'UTF8')),'hex'),ac.surface_text,ac.canonical_text);
    n:=n+1;
  end loop;
  if n<>cardinality(p_article_claim_ids) or not mip_private.public_article_version_is_visible(v) then raise exception 'nested evidence publication permission required'; end if;
  return v;
end $$;

-- Shared atomic completion precondition. Caller must already be the actual
-- publication owner; it cannot upgrade the ingestion service's permissions.
create function mip_private.require_reviewed_public_article_version(p_version uuid,p_capture uuid,p_hash text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare v mip_private.reviewed_public_article_versions;
begin
  select * into v from mip_private.reviewed_public_article_versions where public_version_id=p_version;
  if not found then raise exception 'reviewed public version required'; end if;
  perform 1 from public.articles where id=v.article_id for update;
  perform 1 from mip_private.reviewed_public_article_versions where public_version_id=p_version for key share;
  perform 1 from evidence_pipeline.article_captures where id=v.capture_id for key share;
  if v.capture_id is distinct from p_capture or v.capture_hash is distinct from p_hash
    or v.admission_kind<>'reviewed_proposition' or not mip_private.public_article_version_is_visible(v.public_version_id) then
    raise exception 'exact reviewed admitted public capture required'; end if;
  return v.article_id;
end $$;

create function mip_private.public_story_version_is_visible(p_version uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from mip_private.reviewed_public_story_versions v
    join mip_private.reviewed_public_stories s on s.story_id=v.story_id where v.public_version_id=p_version
    and ((s.subject_type='article' and exists(select 1 from public.articles a where a.id=s.subject_id and a.reader_state='eligible' and a.source_status='active'))
      or (s.subject_type='graph_node' and exists(select 1 from public.nodes n where n.id=s.subject_id and n.type=s.subject_kind)))
    and exists(select 1 from mip_private.reviewed_public_story_members m where m.public_version_id=v.public_version_id)
    and not exists(select 1 from mip_private.reviewed_public_story_members m where m.public_version_id=v.public_version_id
      and not mip_private.public_article_version_is_visible(m.article_public_version_id)))
$$;
create function mip_private.bind_reviewed_public_story_version(p_subject_type text,p_subject_id uuid,
  p_article_public_version_ids uuid[],p_review_ref text,p_policy_version text,p_predecessor_public_version_id uuid default null,
  p_correction_reason text default null) returns uuid
language plpgsql security invoker set search_path='' as $$
declare s mip_private.reviewed_public_stories; head mip_private.reviewed_public_story_versions; v uuid; member uuid; pos integer:=0;
  stamp timestamptz:=clock_timestamp(); member_article uuid;
begin
  if current_user in ('anon','authenticated','service_role') or current_user is distinct from
    (select pg_get_userbyid(relowner) from pg_class where oid='public.articles'::regclass)
    or current_user is distinct from (select pg_get_userbyid(relowner) from pg_class where oid='public.nodes'::regclass) then raise exception 'existing canonical publication owner required'; end if;
  if p_subject_type is null or p_subject_type not in ('article','graph_node') or p_subject_id is null
    or p_article_public_version_ids is null or cardinality(p_article_public_version_ids) not between 1 and 100
    or cardinality(p_article_public_version_ids)<>(select count(distinct x) from unnest(p_article_public_version_ids)x)
    or nullif(btrim(p_review_ref),'') is null or nullif(btrim(p_policy_version),'') is null then raise exception 'invalid reviewed story binding'; end if;
  perform pg_advisory_xact_lock(hashtextextended('mip-reviewed-story:'||p_subject_type||':'||p_subject_id,0));
  if p_subject_type='article' then
    perform 1 from public.articles where id=p_subject_id and reader_state='eligible' and source_status='active' for update;
  else perform 1 from public.nodes where id=p_subject_id for key share; end if;
  if not found then raise exception 'existing published canonical subject required'; end if;
  -- Take every article lock in UUID order, the same source-owner ordering.
  perform 1 from public.articles a where a.id in (select article_id from mip_private.reviewed_public_article_versions
    where public_version_id=any(p_article_public_version_ids)) order by a.id for update;
  if (select count(distinct article_id) from mip_private.reviewed_public_article_versions where public_version_id=any(p_article_public_version_ids))
    <>cardinality(p_article_public_version_ids) then raise exception 'one exact public version per source required'; end if;
  foreach member in array p_article_public_version_ids loop
    select article_id into member_article from mip_private.reviewed_public_article_versions where public_version_id=member;
    if not found or not mip_private.public_article_version_is_visible(member) then raise exception 'reviewed public source version required'; end if;
    if (p_subject_type='article' and (cardinality(p_article_public_version_ids)<>1 or member_article<>p_subject_id))
      or (p_subject_type='graph_node' and not exists(select 1 from public.citations c where c.article_id=member_article and c.resolved_node_id=p_subject_id)) then
      raise exception 'existing canonical subject/source relationship required'; end if;
  end loop;
  insert into mip_private.reviewed_public_stories(subject_type,subject_id,subject_kind) values(p_subject_type,p_subject_id,
    case when p_subject_type='article' then 'article' else (select type from public.nodes where id=p_subject_id) end)
    on conflict(subject_type,subject_id) do nothing;
  select * into s from mip_private.reviewed_public_stories where subject_type=p_subject_type and subject_id=p_subject_id;
  select * into head from mip_private.reviewed_public_story_versions where story_id=s.story_id order by sequence desc limit 1;
  if head.public_version_id is distinct from p_predecessor_public_version_id then raise exception 'public story predecessor conflict'; end if;
  if (head.public_version_id is null and p_correction_reason is not null)
    or (head.public_version_id is not null and nullif(btrim(p_correction_reason),'') is null) then raise exception 'story correction lineage reason required'; end if;
  insert into mip_private.reviewed_public_story_versions(story_id,sequence,predecessor_public_version_id,review_ref,reviewed_by,
    reviewed_at,visible_at,policy_version,correction_reason) values(s.story_id,coalesce(head.sequence,0)+1,head.public_version_id,
    p_review_ref,current_user,stamp,stamp,p_policy_version,p_correction_reason) returning public_version_id into v;
  foreach member in array p_article_public_version_ids loop
    pos:=pos+1; insert into mip_private.reviewed_public_story_members values(v,member,pos);
  end loop;
  if not mip_private.public_story_version_is_visible(v) then raise exception 'story publication permission required'; end if;
  return v;
end $$;

create function mip_private.reviewed_public_article_payload(p_public_version_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('contract','mip-reviewed-public-version-v1','public_version_id',v.public_version_id,
    'article_id',v.article_id,'capture_id',v.capture_id,'source_version_id',v.capture_id,'capture_hash',v.capture_hash,
    'sequence',v.sequence::text,'admission_kind',v.admission_kind,'source_url',v.source_snapshot->>'url',
    'source_outlet',v.source_snapshot->>'outlet','title',v.source_snapshot->>'title','summary',v.source_snapshot->>'summary',
    'published_at',v.source_snapshot->'published_at','fetched_at',v.source_snapshot->'fetched_at',
    'fetched_at_semantics','article_original_fetch','captured_at',v.source_snapshot->'captured_at',
    'review_ref',v.review_ref,'reviewed_by',v.reviewed_by,'reviewed_at',v.reviewed_at,'visible_at',v.visible_at,
    'policy_version',v.policy_version,'predecessor_public_version_id',v.predecessor_public_version_id,
    'correction_reason',v.correction_reason,'remaining_uncertainty',v.remaining_uncertainty,
    'review_state','reviewed','visibility_state','public',
    'pending_revision',exists(select 1 from evidence_pipeline.article_captures cap
      where cap.article_id=v.article_id and cap.captured_at>(v.source_snapshot->>'captured_at')::timestamptz
      and not exists(select 1 from mip_private.reviewed_public_article_versions admitted where admitted.capture_id=cap.id)),
    'evidence',coalesce((select jsonb_agg(jsonb_build_object('article_claim_id',e.article_claim_id,'claim_id',e.claim_id,
      'capture_id',e.capture_id,'capture_hash',e.capture_hash,'source_field',e.source_field,'span_start',e.span_start,
      'span_end',e.span_end,'excerpt',e.excerpt,'excerpt_hash',e.excerpt_hash,'surface_text',e.surface_text,
      'canonical_text',e.canonical_text) order by e.article_claim_id)
      from mip_private.public_reviewed_article_evidence e where e.public_version_id=v.public_version_id),'[]'))
  from mip_private.public_reviewed_article_versions v where v.public_version_id=p_public_version_id
$$;
create function mip_private.reviewed_public_story_payload(p_public_version_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('contract','mip-reviewed-public-story-v1','public_version_id',v.public_version_id,'story_id',s.story_id,
    'subject_type',s.subject_type,'subject_id',s.subject_id,'subject_kind',s.subject_kind,'sequence',v.sequence::text,'predecessor_public_version_id',v.predecessor_public_version_id,
    'correction_reason',v.correction_reason,'review_ref',v.review_ref,'reviewed_by',v.reviewed_by,'reviewed_at',v.reviewed_at,
    'visible_at',v.visible_at,'policy_version',v.policy_version,'review_state','reviewed','visibility_state','public',
    'members',(select jsonb_agg(mip_private.reviewed_public_article_payload(m.article_public_version_id) order by m.ordinal)
      from mip_private.reviewed_public_story_members m where m.public_version_id=v.public_version_id))
  from mip_private.reviewed_public_story_versions v join mip_private.reviewed_public_stories s on s.story_id=v.story_id
  where v.public_version_id=p_public_version_id and mip_private.public_story_version_is_visible(v.public_version_id)
$$;
-- Intentionally filtered definer read endpoints match the existing public
-- projection owner contract. No input can choose a role, SQL or private field.
create function public.read_reviewed_public_article_v1(p_article_id uuid,p_public_version_id uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
  select mip_private.reviewed_public_article_payload(v.public_version_id) from mip_private.reviewed_public_article_versions v
  where v.article_id=p_article_id and (p_public_version_id is null or v.public_version_id=p_public_version_id)
  order by v.sequence desc limit 1
$$;
create function public.read_reviewed_public_story_v1(p_story_id uuid,p_public_version_id uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
  select mip_private.reviewed_public_story_payload(v.public_version_id) from mip_private.reviewed_public_story_versions v
  where v.story_id=p_story_id and (p_public_version_id is null or v.public_version_id=p_public_version_id)
  order by v.sequence desc limit 1
$$;
create function public.read_reviewed_public_story_for_article_v1(p_article_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  with heads as (select distinct on (v.story_id) v.* from mip_private.reviewed_public_story_versions v order by v.story_id,v.sequence desc),
  matches as (select h.public_version_id from heads h where mip_private.public_story_version_is_visible(h.public_version_id)
    and exists(select 1 from mip_private.reviewed_public_story_members m join mip_private.reviewed_public_article_versions a
      on a.public_version_id=m.article_public_version_id where m.public_version_id=h.public_version_id and a.article_id=p_article_id))
  select case when count(*)=1 then mip_private.reviewed_public_story_payload(min(public_version_id::text)::uuid) else null end from matches
$$;
create function public.read_reviewed_public_stories_for_article_v1(p_article_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  with heads as (select distinct on (v.story_id) v.* from mip_private.reviewed_public_story_versions v order by v.story_id,v.sequence desc),
  matches as (select h.story_id,h.public_version_id from heads h where mip_private.public_story_version_is_visible(h.public_version_id)
    and exists(select 1 from mip_private.reviewed_public_story_members m join mip_private.reviewed_public_article_versions a
      on a.public_version_id=m.article_public_version_id where m.public_version_id=h.public_version_id and a.article_id=p_article_id)
    order by h.story_id limit 101)
  select case when count(*)>100 then null else coalesce(jsonb_agg(mip_private.reviewed_public_story_payload(public_version_id) order by story_id),'[]') end from matches
$$;

do $acl$ declare t text; f record; begin
  foreach t in array array['reviewed_public_article_versions','reviewed_public_article_evidence','reviewed_public_stories',
    'reviewed_public_story_versions','reviewed_public_story_members'] loop
    execute format('alter table mip_private.%I enable row level security',t);
    execute format('revoke all on table mip_private.%I from public,anon,authenticated,service_role',t);
    execute format('grant select on table mip_private.%I to service_role',t);
    execute format('create trigger reviewed_no_rewrite before update or delete on mip_private.%I for each row execute function evidence_pipeline.reject_history_mutation()',t);
    execute format('create trigger reviewed_no_truncate before truncate on mip_private.%I for each statement execute function evidence_pipeline.reject_history_mutation()',t);
  end loop;
  for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='mip_private' and p.proname in ('public_article_evidence_is_visible','public_article_version_is_visible',
      'bind_reviewed_public_article_version','require_reviewed_public_article_version','public_story_version_is_visible',
      'bind_reviewed_public_story_version','reviewed_public_article_payload','reviewed_public_story_payload'))
      or (n.nspname='public' and p.proname in ('read_reviewed_public_article_v1','read_reviewed_public_story_v1','read_reviewed_public_story_for_article_v1','read_reviewed_public_stories_for_article_v1')) loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    if f.proname like 'read_reviewed_public_%' then execute format('grant execute on function %s to anon,authenticated,service_role',f.signature);
    elsif f.proname in ('public_article_evidence_is_visible','public_article_version_is_visible','public_story_version_is_visible',
      'reviewed_public_article_payload','reviewed_public_story_payload') then execute format('grant execute on function %s to service_role',f.signature); end if;
  end loop;
end $acl$;
revoke all on mip_private.public_reviewed_article_versions,mip_private.public_reviewed_article_evidence from public,anon,authenticated,service_role;
grant select on mip_private.public_reviewed_article_versions,mip_private.public_reviewed_article_evidence to service_role;
comment on table mip_private.reviewed_public_article_versions is 'Append-only binding to exact retained source by existing publication owner. Source-report permission is separate from proposition admission; pending captures stay private.';
comment on table mip_private.reviewed_public_stories is 'Persistent reviewed Story UUID bound to an existing canonical article or published graph node. No page grouping or inferred event identity.';
commit;
