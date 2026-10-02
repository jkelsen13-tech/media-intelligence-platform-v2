-- UNAPPLIED SOURCE PROPOSAL. No live install, grants, admissions or migration replay.
-- Pin the complete catalog from comparison-reviewed-versions-v1.catalog.sql.
begin;
set local search_path=pg_catalog;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table public.comparison_public in access exclusive mode;
lock table public.events,public.event_articles,public.article_claims,public.claims,
 public.explanations,public.claim_evidence_links,public.claim_corrections,
 mip_private.reviewed_public_article_versions,mip_private.reviewed_public_article_evidence in share row exclusive mode;
do $preflight$
declare actual jsonb; expected text:=current_setting('mip.comparison_expected_catalog',true);
begin
 -- BEGIN COMPARISON CATALOG
 select jsonb_build_object(
  'relations',(select jsonb_agg(jsonb_build_object('identity',n.nspname||'.'||c.relname,
   'owner',pg_get_userbyid(c.relowner),'kind',c.relkind,'acl',c.relacl::text,
   'options',c.reloptions,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'comment',obj_description(c.oid,'pg_class'),
   'definition',case when c.relkind='v' then pg_get_viewdef(c.oid,true) end,
   'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
    'not_null',a.attnotnull,'acl',a.attacl::text,'comment',col_description(a.attrelid,a.attnum),
    'default',(select pg_get_expr(d.adbin,d.adrelid) from pg_attrdef d where d.adrelid=a.attrelid and d.adnum=a.attnum)) order by a.attnum)
    from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
   'constraints',(select coalesce(jsonb_agg(jsonb_build_object('name',x.conname,'definition',pg_get_constraintdef(x.oid)) order by x.conname),'[]') from pg_constraint x where x.conrelid=c.oid),
   'indexes',(select coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid) order by i.indexrelid::regclass::text),'[]') from pg_index i where i.indrelid=c.oid),
   'policies',(select coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'cmd',p.polcmd,'roles',p.polroles,
    'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname),'[]') from pg_policy p where p.polrelid=c.oid),
   'triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid),
    'function',pg_get_functiondef(t.tgfoid)) order by t.tgname),'[]') from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal)) order by n.nspname,c.relname)
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname||'.'||c.relname=any(array[
    'public.comparison_public','public.articles','public.article_claims','public.claims','public.events','public.event_articles',
    'public.explanations','public.claim_evidence_links','public.claim_corrections','public.story_arcs','public.nodes',
    'evidence_pipeline.article_captures','mip_private.reader_claim_surfaces','mip_private.reviewed_public_article_versions',
    'mip_private.reviewed_public_article_evidence','mip_private.public_reviewed_article_versions','mip_private.public_reviewed_article_evidence',
    'mip_private.comparison_reviewed_members','mip_private.comparison_reviewed_surfaces','mip_private.comparison_install_snapshot',
    'mip_private.comparison_bound_members','mip_private.comparison_bound_surfaces'])),
  'functions',(select coalesce(jsonb_agg(jsonb_build_object('identity',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),
   'acl',p.proacl::text,'definition',pg_get_functiondef(p.oid),'comment',obj_description(p.oid,'pg_proc')) order by p.oid::regprocedure::text),'[]')
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
    p.oid=any(array['mip_private.public_article_version_is_visible(uuid)'::regprocedure,
     'mip_private.public_article_evidence_is_visible(uuid,uuid)'::regprocedure,'evidence_pipeline.reject_history_mutation()'::regprocedure])
    or (n.nspname='mip_private' and p.proname in ('bind_comparison_member','bind_comparison_surface','comparison_member_is_visible','comparison_surface_is_visible'))
    or (n.nspname='public' and p.proname='read_reviewed_comparison_v1')),
  'schemas',(select jsonb_agg(jsonb_build_object('name',nspname,'owner',pg_get_userbyid(nspowner),'acl',nspacl::text) order by nspname)
   from pg_namespace where nspname in ('public','mip_private','evidence_pipeline')),
  'default_privileges',(select coalesce(jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),
   'schema',n.nspname,'type',d.defaclobjtype,'acl',d.defaclacl::text) order by d.defaclrole,d.defaclnamespace,d.defaclobjtype),'[]')
   from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace),
  'roles',(select jsonb_agg(jsonb_build_object('name',r.rolname,'superuser',r.rolsuper,'bypass_rls',r.rolbypassrls,
   'memberships',(select coalesce(jsonb_agg(p.rolname order by p.rolname),'[]') from pg_roles p where p.oid<>r.oid and pg_has_role(r.oid,p.oid,'MEMBER'))) order by r.rolname)
   from pg_roles r where r.rolname in ('anon','authenticated','service_role'))
 ) into actual;
 -- END COMPARISON CATALOG
 if nullif(expected,'') is null or actual is distinct from expected::jsonb then raise exception 'comparison catalog baseline missing or drifted'; end if;
 if exists(select 1 from jsonb_array_elements(actual->'relations') r where r->>'identity' like 'mip_private.comparison_%')
  or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mip_private'
   and p.proname in ('bind_comparison_member','bind_comparison_surface','comparison_member_is_visible','comparison_surface_is_visible'))
  or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='read_reviewed_comparison_v1') then
   raise exception 'comparison package names occupied; exact overloads preserved'; end if;
 if current_user in ('anon','authenticated','service_role') or current_user is distinct from
  (select pg_get_userbyid(relowner) from pg_class where oid='public.comparison_public'::regclass)
  or current_user is distinct from (select pg_get_userbyid(relowner) from pg_class where oid='mip_private.reviewed_public_article_versions'::regclass)
  or current_user is distinct from (select pg_get_userbyid(relowner) from pg_class where oid='public.explanations'::regclass) then
  raise exception 'existing comparison and source publication owner required'; end if;
 if (select reloptions from pg_class where oid='public.comparison_public'::regclass) is distinct from array['security_barrier=true','security_invoker=false']::text[] then
  raise exception 'comparison view options require exact owner review'; end if;
 if (select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod)) order by a.attnum)
  from pg_attribute a where a.attrelid='public.comparison_public'::regclass and a.attnum>0 and not a.attisdropped) is distinct from
  '[["event_key","text"],["canonical_title","text"],["occurred_at_start","date"],["occurred_at_end","date"],["articles","jsonb"],["claims","jsonb"]]'::jsonb then
  raise exception 'exact existing comparison output contract required'; end if;
 if has_table_privilege('anon','public.comparison_public','SELECT') or has_table_privilege('authenticated','public.comparison_public','SELECT')
  or has_any_column_privilege('anon','public.comparison_public','SELECT') or has_any_column_privilege('authenticated','public.comparison_public','SELECT') then
  raise exception 'shared source package must first close legacy comparison grants'; end if;
end $preflight$;

create table mip_private.comparison_install_snapshot(original_catalog jsonb not null);
insert into mip_private.comparison_install_snapshot values(current_setting('mip.comparison_expected_catalog')::jsonb);
create table mip_private.comparison_reviewed_members(
 public_version_id uuid not null references mip_private.reviewed_public_article_versions(public_version_id),
 event_id uuid not null references public.events(id),
 review_ref text not null check(length(btrim(review_ref)) between 1 and 500), reviewed_by name not null,
 reviewed_at timestamptz not null, event_snapshot jsonb not null, membership_snapshot jsonb not null,
 navigation_snapshot jsonb not null, primary key(public_version_id,event_id)
);
create table mip_private.comparison_reviewed_surfaces(
 public_version_id uuid not null,article_claim_id uuid not null, event_id uuid not null,
 review_ref text not null check(length(btrim(review_ref)) between 1 and 500),reviewed_by name not null,reviewed_at timestamptz not null,
 surface_snapshot jsonb not null,claim_snapshot jsonb not null,
 explanation_id uuid references public.explanations(id),explanation_snapshot jsonb,
 evidence_links jsonb not null check(jsonb_typeof(evidence_links)='array'),
 corrections jsonb not null check(jsonb_typeof(corrections)='array'),
 primary key(public_version_id,article_claim_id),
 foreign key(public_version_id,article_claim_id) references mip_private.reviewed_public_article_evidence(public_version_id,article_claim_id),
 foreign key(public_version_id,event_id) references mip_private.comparison_reviewed_members(public_version_id,event_id)
);

-- Binding functions retain existing owner decisions; they never change source,
-- claim/event eligibility, membership, explanations, links or corrections.
create function mip_private.bind_comparison_member(p_public_version_id uuid,p_event_id uuid,p_review_ref text) returns void
language plpgsql security invoker set search_path='' as $$
declare v mip_private.reviewed_public_article_versions; e public.events; ea public.event_articles;
 nav jsonb; prior mip_private.comparison_reviewed_members;
begin
 if current_user in ('anon','authenticated','service_role') or current_user is distinct from
  (select pg_get_userbyid(relowner) from pg_class where oid='public.comparison_public'::regclass) then raise exception 'existing comparison publication owner required'; end if;
 if nullif(btrim(p_review_ref),'') is null then raise exception 'explicit comparison review reference required'; end if;
 select * into v from mip_private.reviewed_public_article_versions where public_version_id=p_public_version_id for key share;
 if not found or not mip_private.public_article_version_is_visible(v.public_version_id)
  or exists(select 1 from mip_private.reviewed_public_article_versions newer where newer.article_id=v.article_id and newer.sequence>v.sequence) then
  raise exception 'exact latest visible reviewed article version required'; end if;
 select * into e from public.events where id=p_event_id for key share;
 if not found or e.comparison_validation_state<>'approved' or e.status='timeline_only' then raise exception 'existing approved comparison event required'; end if;
 select * into ea from public.event_articles where event_id=e.id and article_id=v.article_id for key share;
 if not found then raise exception 'existing event/article membership required'; end if;
 select jsonb_build_object('arc_slug',arc.slug,'arc_title',arc.title,'timeline_key',node.timeline_key,
  'arc_snapshot',to_jsonb(arc),'node_snapshot',node.snapshot) into nav
 from (select 1) seed left join public.story_arcs arc on arc.id=(v.source_snapshot->>'arc_id')::uuid
 left join lateral(select right(n.slug,8) timeline_key,to_jsonb(n) snapshot from public.nodes n
  where n.arc_id=arc.id and n.type='event' order by (n.slug like 'evt-%') desc,n.slug limit 1) node on true;
 select * into prior from mip_private.comparison_reviewed_members where public_version_id=v.public_version_id and event_id=e.id;
 if found then
  if prior.review_ref is distinct from p_review_ref or prior.event_snapshot is distinct from to_jsonb(e)
   or prior.membership_snapshot is distinct from to_jsonb(ea) or prior.navigation_snapshot is distinct from nav then
   raise exception 'comparison member idempotency conflict'; end if;
  return;
 end if;
 insert into mip_private.comparison_reviewed_members values(v.public_version_id,e.id,p_review_ref,current_user,clock_timestamp(),to_jsonb(e),to_jsonb(ea),nav);
end $$;

create function mip_private.bind_comparison_surface(p_public_version_id uuid,p_article_claim_id uuid,p_review_ref text,
 p_explanation_id uuid default null,p_evidence_link_ids uuid[] default '{}',p_correction_ids uuid[] default '{}') returns void
language plpgsql security invoker set search_path='' as $$
declare v mip_private.reviewed_public_article_versions; ac public.article_claims; c public.claims; x public.explanations;
 links jsonb; corrections jsonb; prior mip_private.comparison_reviewed_surfaces;
begin
 if current_user in ('anon','authenticated','service_role') or current_user is distinct from
  (select pg_get_userbyid(relowner) from pg_class where oid='public.comparison_public'::regclass) then raise exception 'existing comparison publication owner required'; end if;
 if nullif(btrim(p_review_ref),'') is null or p_evidence_link_ids is null or p_correction_ids is null
  or cardinality(p_evidence_link_ids)>100 or cardinality(p_correction_ids)>100
  or cardinality(p_evidence_link_ids)<>(select count(distinct id) from unnest(p_evidence_link_ids) id)
  or cardinality(p_correction_ids)<>(select count(distinct id) from unnest(p_correction_ids) id) then raise exception 'invalid explicit comparison annotation review'; end if;
 select * into v from mip_private.reviewed_public_article_versions where public_version_id=p_public_version_id;
 if not found or v.admission_kind<>'reviewed_proposition' or not mip_private.public_article_version_is_visible(v.public_version_id)
  or not mip_private.public_article_evidence_is_visible(v.public_version_id,p_article_claim_id)
  or exists(select 1 from mip_private.reviewed_public_article_versions newer where newer.article_id=v.article_id and newer.sequence>v.sequence) then
  raise exception 'exact latest reviewed proposition evidence required'; end if;
 select * into ac from public.article_claims where id=p_article_claim_id for key share;
 select * into c from public.claims where id=ac.claim_id for key share;
 if not exists(select 1 from mip_private.comparison_reviewed_members m where m.public_version_id=v.public_version_id and m.event_id=c.event_id) then
  raise exception 'exact comparison member binding required'; end if;
 if p_explanation_id is not null then
  select * into x from public.explanations where id=p_explanation_id for key share;
  if not found or x.assertion_type<>'claim_grouping' or not x.is_current or x.review_status<>'published' or x.state<>'ok'
   or x.rule_version not like 'sc-v2-event-projection|%'
   or x.assertion_id !~ ('^sc:claim_grouping:'||c.event_id::text||':[0-9]+:'||ac.article_id::text||'$')
   or nullif(btrim(x.falsification_condition),'') is null or x.falsification_condition like 'missing:%'
   or nullif(btrim(x.supporting_passage),'') is null
   or position(format('Surface claim "%s" grouped under canonical "%s"',ac.surface_text,c.canonical_text) in x.supporting_passage)<>1
   or jsonb_typeof(x.archived_sources)<>'array' or jsonb_path_exists(x.archived_sources,'$[*] ? (@.status == "missing")') then
    raise exception 'existing published event-specific grounded explanation required'; end if;
 end if;
 select coalesce(jsonb_agg(to_jsonb(l) order by l.id),'[]') into links from public.claim_evidence_links l
  where l.id=any(p_evidence_link_ids) and l.claim_id=c.id and l.linked_from_article_id=v.article_id;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') into corrections from public.claim_corrections r
  where r.id=any(p_correction_ids) and r.claim_id=c.id and r.correcting_article_id=v.article_id;
 if jsonb_array_length(links)<>cardinality(p_evidence_link_ids) or jsonb_array_length(corrections)<>cardinality(p_correction_ids) then
  raise exception 'annotation source/claim owner mismatch'; end if;
 select * into prior from mip_private.comparison_reviewed_surfaces where public_version_id=v.public_version_id and article_claim_id=ac.id;
 if found then
  if prior.review_ref is distinct from p_review_ref or prior.surface_snapshot is distinct from to_jsonb(ac)
   or prior.claim_snapshot is distinct from to_jsonb(c) or prior.explanation_id is distinct from p_explanation_id
   or prior.explanation_snapshot is distinct from (case when p_explanation_id is null then null else to_jsonb(x) end)
   or prior.evidence_links is distinct from links or prior.corrections is distinct from corrections then raise exception 'comparison surface idempotency conflict'; end if;
  return;
 end if;
 insert into mip_private.comparison_reviewed_surfaces values(v.public_version_id,ac.id,c.event_id,p_review_ref,current_user,clock_timestamp(),
  to_jsonb(ac),to_jsonb(c),p_explanation_id,case when p_explanation_id is null then null else to_jsonb(x) end,links,corrections);
end $$;

create function mip_private.comparison_member_is_visible(p_version uuid,p_event uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from mip_private.comparison_reviewed_members m
  join mip_private.reviewed_public_article_versions v on v.public_version_id=m.public_version_id
  join public.events e on e.id=m.event_id join public.event_articles ea on ea.event_id=e.id and ea.article_id=v.article_id
  where m.public_version_id=p_version and m.event_id=p_event and mip_private.public_article_version_is_visible(v.public_version_id)
   and not exists(select 1 from mip_private.reviewed_public_article_versions newer where newer.article_id=v.article_id and newer.sequence>v.sequence)
   and to_jsonb(e)=m.event_snapshot and to_jsonb(ea)=m.membership_snapshot
   and e.comparison_validation_state='approved' and e.status<>'timeline_only'
   and (m.navigation_snapshot->'arc_snapshot'='null'::jsonb or exists(select 1 from public.story_arcs a
     where a.id=(m.navigation_snapshot->'arc_snapshot'->>'id')::uuid and to_jsonb(a)=m.navigation_snapshot->'arc_snapshot'))
   and (m.navigation_snapshot->'node_snapshot'='null'::jsonb or exists(select 1 from public.nodes n
     where n.id=(m.navigation_snapshot->'node_snapshot'->>'id')::uuid and to_jsonb(n)=m.navigation_snapshot->'node_snapshot')))
$$;
create function mip_private.comparison_surface_is_visible(p_version uuid,p_surface uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from mip_private.comparison_reviewed_surfaces s
  join public.article_claims ac on ac.id=s.article_claim_id join public.claims c on c.id=ac.claim_id
  where s.public_version_id=p_version and s.article_claim_id=p_surface
   and mip_private.comparison_member_is_visible(s.public_version_id,s.event_id)
   and mip_private.public_article_evidence_is_visible(s.public_version_id,s.article_claim_id)
   and to_jsonb(ac)=s.surface_snapshot and to_jsonb(c)=s.claim_snapshot
   and (s.explanation_id is null or exists(select 1 from public.explanations x where x.id=s.explanation_id and to_jsonb(x)=s.explanation_snapshot))
   and not exists(select 1 from jsonb_array_elements(s.evidence_links) l where not exists(select 1 from public.claim_evidence_links x where x.id=(l->>'id')::uuid and to_jsonb(x)=l))
   and not exists(select 1 from jsonb_array_elements(s.corrections) r where not exists(select 1 from public.claim_corrections x where x.id=(r->>'id')::uuid and to_jsonb(x)=r)))
$$;
create view mip_private.comparison_bound_members with(security_barrier=true,security_invoker=true) as
 select m.*,v.article_id,v.capture_id,v.capture_hash,v.source_snapshot,v.admission_kind,v.review_ref source_review_ref
 from mip_private.comparison_reviewed_members m join mip_private.reviewed_public_article_versions v using(public_version_id)
 where mip_private.comparison_member_is_visible(m.public_version_id,m.event_id);
create view mip_private.comparison_bound_surfaces with(security_barrier=true,security_invoker=true) as
 select s.*,ev.claim_id,ev.surface_text,ev.canonical_text,ev.capture_id,ev.capture_hash,
  ev.source_field,ev.span_start,ev.span_end,ev.excerpt_hash,m.article_id,m.source_snapshot
 from mip_private.comparison_reviewed_surfaces s
 join mip_private.reviewed_public_article_evidence ev using(public_version_id,article_claim_id)
 join mip_private.comparison_bound_members m using(public_version_id,event_id)
 where m.admission_kind='reviewed_proposition' and mip_private.comparison_surface_is_visible(s.public_version_id,s.article_claim_id);

-- Six existing output columns and types are preserved. All rendered source
-- metadata and annotations come from immutable owner snapshots.
create function public.read_reviewed_comparison_v1() returns table(event_key text,canonical_title text,
 occurred_at_start date,occurred_at_end date,articles jsonb,claims jsonb)
language sql stable security definer set search_path='' as $$
 select md5(e.id::text) event_key,e.canonical_title,e.occurred_at_start,e.occurred_at_end,
 coalesce((select jsonb_agg(jsonb_build_object('article_key',md5(m.article_id::text),'article_id',m.article_id,
  'public_version_id',m.public_version_id,'capture_id',m.capture_id,'capture_hash',m.capture_hash,
  'outlet',m.source_snapshot->>'outlet','article_url',m.source_snapshot->>'url','published_at',m.source_snapshot->'published_at',
  'fetched_at',m.source_snapshot->'fetched_at','captured_at',m.source_snapshot->'captured_at',
  'arc_slug',m.navigation_snapshot->>'arc_slug','arc_title',m.navigation_snapshot->>'arc_title','timeline_key',m.navigation_snapshot->>'timeline_key',
  'has_extracted_claim',exists(select 1 from mip_private.comparison_bound_surfaces s where s.public_version_id=m.public_version_id and s.event_id=e.id))
  order by m.source_snapshot->>'published_at' nulls last,m.source_snapshot->>'outlet',m.article_id)
  from mip_private.comparison_bound_members m where m.event_id=e.id),'[]'::jsonb) articles,
 coalesce((select jsonb_agg(jsonb_build_object('claim_key',md5(grouped.claim_id::text),'canonical_text',grouped.canonical_text,'thin_extraction',grouped.thin_extraction,
  'surfaces',(select jsonb_agg(jsonb_build_object('article_key',md5(s.article_id::text),'article_id',s.article_id,'article_claim_id',s.article_claim_id,
   'public_version_id',s.public_version_id,'capture_id',s.capture_id,'capture_hash',s.capture_hash,
   'source_field',s.source_field,'span_start',s.span_start,'span_end',s.span_end,'excerpt_hash',s.excerpt_hash,
   'surface_text',s.surface_text,'loaded_language',s.surface_snapshot->'loaded_language',
   'explanation',case when s.explanation_id is null then null else jsonb_build_object('supporting_passage',s.explanation_snapshot->>'supporting_passage',
    'rule_version',s.explanation_snapshot->>'rule_version','provenance_class',s.explanation_snapshot->>'provenance_class',
    'reviewed_at',s.explanation_snapshot->'reviewed_at','review_status',s.explanation_snapshot->>'review_status','state',s.explanation_snapshot->>'state',
    'remaining_uncertainty',s.explanation_snapshot->>'remaining_uncertainty','public_version_id',s.public_version_id,'capture_id',s.capture_id,'capture_hash',s.capture_hash) end)
   order by s.source_snapshot->>'published_at' nulls last,s.article_id) from mip_private.comparison_bound_surfaces s where s.claim_id=grouped.claim_id and s.event_id=e.id),
  'evidence_links',coalesce((select jsonb_agg(item order by item->>'evidence_type',item->>'evidence_url') from
   (select distinct jsonb_build_object('evidence_url',l->>'evidence_url','evidence_type',l->>'evidence_type',
    'public_version_id',s.public_version_id,'capture_id',s.capture_id,'capture_hash',s.capture_hash,'article_claim_id',s.article_claim_id) item
    from mip_private.comparison_bound_surfaces s cross join lateral jsonb_array_elements(s.evidence_links) l
    where s.claim_id=grouped.claim_id and s.event_id=e.id) links),'[]'::jsonb),
  'corrections',coalesce((select jsonb_agg(item order by item->>'occurred_at' nulls last) from
   (select distinct jsonb_build_object('correction_text',r->>'correction_text','occurred_at',r->'occurred_at',
    'public_version_id',s.public_version_id,'capture_id',s.capture_id,'capture_hash',s.capture_hash,'article_claim_id',s.article_claim_id) item
    from mip_private.comparison_bound_surfaces s cross join lateral jsonb_array_elements(s.corrections) r
    where s.claim_id=grouped.claim_id and s.event_id=e.id) corrections),'[]'::jsonb)) order by grouped.canonical_text,grouped.claim_id)
  from(select distinct s.claim_id,s.canonical_text,(s.claim_snapshot->>'thin_extraction')::boolean thin_extraction
   from mip_private.comparison_bound_surfaces s where s.event_id=e.id) grouped),'[]'::jsonb) claims
 from public.events e where e.comparison_validation_state='approved' and e.status<>'timeline_only'
  and (select count(distinct m.source_snapshot->>'outlet') from mip_private.comparison_bound_members m where m.event_id=e.id)>=2
$$;
create or replace view public.comparison_public with(security_barrier=true,security_invoker=false) as
 select * from public.read_reviewed_comparison_v1();

alter table mip_private.comparison_reviewed_members enable row level security;
alter table mip_private.comparison_reviewed_surfaces enable row level security;
alter table mip_private.comparison_install_snapshot enable row level security;
revoke all on mip_private.comparison_reviewed_members,mip_private.comparison_reviewed_surfaces,mip_private.comparison_install_snapshot,
 mip_private.comparison_bound_members,mip_private.comparison_bound_surfaces from public,anon,authenticated,service_role;
create trigger comparison_member_no_rewrite before update or delete on mip_private.comparison_reviewed_members for each row execute function evidence_pipeline.reject_history_mutation();
create trigger comparison_member_no_truncate before truncate on mip_private.comparison_reviewed_members for each statement execute function evidence_pipeline.reject_history_mutation();
create trigger comparison_surface_no_rewrite before update or delete on mip_private.comparison_reviewed_surfaces for each row execute function evidence_pipeline.reject_history_mutation();
create trigger comparison_surface_no_truncate before truncate on mip_private.comparison_reviewed_surfaces for each statement execute function evidence_pipeline.reject_history_mutation();
create trigger comparison_snapshot_no_rewrite before update or delete on mip_private.comparison_install_snapshot for each row execute function evidence_pipeline.reject_history_mutation();
create trigger comparison_snapshot_no_truncate before truncate on mip_private.comparison_install_snapshot for each statement execute function evidence_pipeline.reject_history_mutation();
revoke all on function mip_private.bind_comparison_member(uuid,uuid,text),
 mip_private.bind_comparison_surface(uuid,uuid,text,uuid,uuid[],uuid[]),
 mip_private.comparison_member_is_visible(uuid,uuid),mip_private.comparison_surface_is_visible(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.read_reviewed_comparison_v1() from public,anon,authenticated,service_role;
grant execute on function public.read_reviewed_comparison_v1() to anon,authenticated,service_role;
do $private_acl$
declare role_name text; object_name text; signature text;
begin
 foreach role_name in array array['anon','authenticated','service_role'] loop
  foreach object_name in array array['mip_private.comparison_reviewed_members','mip_private.comparison_reviewed_surfaces',
   'mip_private.comparison_install_snapshot','mip_private.comparison_bound_members','mip_private.comparison_bound_surfaces'] loop
   if has_table_privilege(role_name,object_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or has_any_column_privilege(role_name,object_name,'SELECT,INSERT,UPDATE,REFERENCES') then
    raise exception 'comparison private ACL inherited or default-granted; exact owner repair required'; end if;
  end loop;
  foreach signature in array array['mip_private.bind_comparison_member(uuid,uuid,text)',
   'mip_private.bind_comparison_surface(uuid,uuid,text,uuid,uuid[],uuid[])',
   'mip_private.comparison_member_is_visible(uuid,uuid)','mip_private.comparison_surface_is_visible(uuid,uuid)'] loop
   if has_function_privilege(role_name,signature,'EXECUTE') then
    raise exception 'comparison private function ACL inherited or default-granted; exact owner repair required'; end if;
  end loop;
 end loop;
end $private_acl$;
grant select on public.comparison_public to anon,authenticated;
comment on table mip_private.comparison_reviewed_surfaces is 'Immutable comparison annotation binding to exact existing reviewed proposition evidence; this does not promote sources, claims or explanations.';
commit;
