-- UNAPPLIED source proposal. Install only after explicit protected-installation
-- authority and reviewed-public-versions-v1.sql. No population/activation here.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local search_path=pg_catalog;
lock table evidence_pipeline.record_versions,mip_private.reviewed_public_article_versions,
  mip_private.reviewed_public_article_evidence,evidence_pipeline.assessments,evidence_pipeline.evidence_candidates in share row exclusive mode;
do $preflight$
declare actual jsonb; expected text:=current_setting('mip.markets_expected_catalog',true);
begin
-- BEGIN MARKETS BASELINE
select jsonb_build_object(
  'relations',(select jsonb_agg(jsonb_build_object('name',c.oid::regclass::text,'owner',pg_get_userbyid(c.relowner),
    'acl',c.relacl::text,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'options',c.reloptions,
    'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'acl',a.attacl::text) order by a.attnum)
      from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
    'definition',case when c.relkind='v' then pg_get_viewdef(c.oid,true) else null end,
    'constraints',(select coalesce(jsonb_agg(pg_get_constraintdef(x.oid) order by x.conname),'[]') from pg_constraint x where x.conrelid=c.oid),
    'policies',(select coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'using',pg_get_expr(p.polqual,p.polrelid),
      'check',pg_get_expr(p.polwithcheck,p.polrelid),'roles',p.polroles,'cmd',p.polcmd) order by p.polname),'[]') from pg_policy p where p.polrelid=c.oid),
    'triggers',(select coalesce(jsonb_agg(pg_get_triggerdef(t.oid) order by t.tgname),'[]') from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal)) order by c.oid::regclass::text)
    from pg_class c where c.oid=any(array['evidence_pipeline.record_versions'::regclass,'mip_private.reviewed_public_article_versions'::regclass,
      'mip_private.reviewed_public_article_evidence'::regclass,'mip_private.public_reviewed_article_versions'::regclass,'mip_private.public_reviewed_article_evidence'::regclass,
      'evidence_pipeline.assessments'::regclass,'evidence_pipeline.assessment_invalidations'::regclass,'evidence_pipeline.evidence_candidates'::regclass])),
  'functions',(select jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),
    'acl',p.proacl::text,'definition',pg_get_functiondef(p.oid)) order by p.oid::regprocedure::text) from pg_proc p where p.oid=any(array[
      'mip_private.public_article_version_is_visible(uuid)'::regprocedure,'mip_private.public_article_evidence_is_visible(uuid,uuid)'::regprocedure,
      'evidence_pipeline.reject_history_mutation()'::regprocedure,'evidence_pipeline.append_version(text,text,text,jsonb,text)'::regprocedure,
      'evidence_pipeline.read_assessment(uuid,timestamp with time zone)'::regprocedure])),
  'roles',(select jsonb_agg(jsonb_build_object('name',r.rolname,'superuser',r.rolsuper,'bypass_rls',r.rolbypassrls,
    'memberships',(select coalesce(jsonb_agg(p.rolname order by p.rolname),'[]') from pg_roles p where p.oid<>r.oid and pg_has_role(r.oid,p.oid,'MEMBER'))) order by r.rolname)
    from pg_roles r where r.rolname in ('anon','authenticated','service_role')),
  'new_objects',(select coalesce(jsonb_agg(n.nspname||'.'||c.relname order by c.relname),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='mip_private' and c.relname in ('market_revision_qualifications','market_revision_revocations','market_revision_sources','public_market_source_bindings','public_market_revisions')),
  'rpc_exists',exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='read_markets_source_directory_v1')
) into actual;
-- END MARKETS BASELINE
if nullif(expected,'') is null or actual is distinct from expected::jsonb then raise exception 'Markets catalog baseline missing or drifted'; end if;
if actual->'new_objects'<>'[]'::jsonb or actual->>'rpc_exists'<>'false' then raise exception 'Markets names occupied'; end if;
if current_user in ('anon','authenticated','service_role') or current_user is distinct from
  (select pg_get_userbyid(relowner) from pg_class where oid='mip_private.reviewed_public_article_versions'::regclass)
  or current_user is distinct from (select pg_get_userbyid(relowner) from pg_class where oid='evidence_pipeline.record_versions'::regclass)
then raise exception 'exact existing review and retained-history owner required'; end if;
end $preflight$;

-- Extend the native append-only history; preserve every existing kind.
alter table evidence_pipeline.record_versions drop constraint record_versions_record_kind_check;
alter table evidence_pipeline.record_versions add constraint record_versions_record_kind_check
  check(record_kind in ('article','graph_node','temporal_assessment','market_identity','market_evidence_path','source_rights'));

-- These are existing-owner review references and source bindings, not a second
-- story/identity/history engine. Public clients receive no table or writer grant.
create table mip_private.market_revision_qualifications (
  record_version_id uuid primary key references evidence_pipeline.record_versions(id),
  review_kind text not null check(review_kind in ('identity_mapping','supported_path','excerpt_rights')),
  review_ref text not null check(length(btrim(review_ref)) between 1 and 1000),
  method_version text not null check(length(btrim(method_version)) between 1 and 120),
  reviewed_by name not null default current_user,
  reviewed_at timestamptz not null default clock_timestamp()
);
create table mip_private.market_revision_revocations (
  record_version_id uuid primary key references mip_private.market_revision_qualifications(record_version_id),
  review_ref text not null check(length(btrim(review_ref)) between 1 and 1000),
  reason text not null check(length(btrim(reason)) between 1 and 2000),
  reviewed_by name not null default current_user,
  revoked_at timestamptz not null default clock_timestamp()
);
create table mip_private.market_revision_sources (
  record_version_id uuid not null references evidence_pipeline.record_versions(id),
  public_version_id uuid not null references mip_private.reviewed_public_article_versions(public_version_id),
  rights_version_id uuid not null references evidence_pipeline.record_versions(id),
  capture_id uuid not null references evidence_pipeline.article_captures(id),
  capture_hash text not null check(capture_hash ~ '^[a-f0-9]{64}$'),
  source_field text not null check(source_field in ('title','summary','body_text')),
  span_start integer not null check(span_start>=0),span_end integer not null check(span_end>span_start),
  excerpt text not null check(length(excerpt)>0),
  primary key(record_version_id,public_version_id,source_field,span_start,span_end)
);
create index market_revision_sources_public on mip_private.market_revision_sources(public_version_id);
create index market_revision_sources_rights on mip_private.market_revision_sources(rights_version_id);
create index market_revision_sources_capture on mip_private.market_revision_sources(capture_id);
alter table mip_private.market_revision_qualifications enable row level security;
alter table mip_private.market_revision_revocations enable row level security;
alter table mip_private.market_revision_sources enable row level security;
revoke all on mip_private.market_revision_qualifications,mip_private.market_revision_revocations,mip_private.market_revision_sources from public,anon,authenticated,service_role;
create trigger market_qualifications_immutable before update or delete on mip_private.market_revision_qualifications
  for each row execute function evidence_pipeline.reject_history_mutation();
create trigger market_revocations_immutable before update or delete on mip_private.market_revision_revocations
  for each row execute function evidence_pipeline.reject_history_mutation();
create trigger market_sources_immutable before update or delete on mip_private.market_revision_sources
  for each row execute function evidence_pipeline.reject_history_mutation();

create function mip_private.append_market_revision(p_kind text,p_identity uuid,p_payload jsonb,p_review_ref text,p_method_version text,p_sources jsonb default '[]') returns uuid
language plpgsql security invoker set search_path='' as $$
declare new_id uuid:=gen_random_uuid(); ordinal integer; source jsonb; prior jsonb; payload jsonb; review_kind text;
begin
  if current_user in ('anon','authenticated','service_role') or current_user is distinct from
    (select pg_get_userbyid(relowner) from pg_class where oid='mip_private.reviewed_public_article_versions'::regclass) then
    raise exception 'existing review owner required'; end if;
  if p_kind not in ('market_identity','market_evidence_path','source_rights') or p_identity is null or jsonb_typeof(p_payload)<>'object'
    or octet_length(p_payload::text)>262144 or jsonb_typeof(p_sources)<>'array' or jsonb_array_length(p_sources)>32
    or nullif(btrim(p_review_ref),'') is null or nullif(btrim(p_method_version),'') is null then raise exception 'invalid native Markets revision'; end if;
  if p_kind<>'source_rights' and jsonb_array_length(p_sources)=0 then raise exception 'exact reviewed source bindings required'; end if;
  if p_kind='market_identity' and (not p_payload ? 'validTo' or mip_private.market_instant_ns(p_payload->>'validFrom') is null
    or not (p_payload->'validTo'='null'::jsonb or mip_private.market_instant_ns(p_payload->>'validTo')>mip_private.market_instant_ns(p_payload->>'validFrom'))) then
    raise exception 'explicit identity validity required'; end if;
  if p_kind='source_rights' and p_payload->>'publicVersionId' is distinct from p_identity::text then raise exception 'rights revisions use the exact public source-version anchor'; end if;
  perform pg_advisory_xact_lock(hashtextextended('mip-version:'||p_kind||':'||p_identity::text,0));
  select r.payload into prior from evidence_pipeline.record_versions r where r.record_kind=p_kind and r.record_key=p_identity::text order by r.ordinal desc limit 1;
  if p_kind='market_identity' and (p_payload->>'identityType' not in ('issuer','share_class','listing','cryptoasset','network','trading_pair')
    or nullif(btrim(p_payload->>'name'),'') is null or (prior is not null and prior->>'identityType' is distinct from p_payload->>'identityType')) then
    raise exception 'typed canonical identity is immutable'; end if;
  select coalesce(max(r.ordinal),0)+1 into ordinal from evidence_pipeline.record_versions r where r.record_kind=p_kind and r.record_key=p_identity::text;
  payload:=(p_payload-'publiclyEligible'-'releaseState'-'sourceBindings')||jsonb_build_object('id',p_identity,'recordVersionId',new_id);
  if p_kind='market_identity' and jsonb_typeof(payload->'aliases')='array' then
    payload:=jsonb_set(payload,'{aliases}',(select coalesce(jsonb_agg(a||jsonb_build_object('recordVersionId',new_id)),'[]') from jsonb_array_elements(payload->'aliases') a));
  end if;
  insert into evidence_pipeline.record_versions(id,record_kind,record_key,ordinal,operation,payload,reason,actor)
    values(new_id,p_kind,p_identity::text,ordinal,case when ordinal=1 then 'insert' else 'update' end,payload,p_review_ref,current_user);
  review_kind:=case p_kind when 'market_identity' then 'identity_mapping' when 'market_evidence_path' then 'supported_path' else 'excerpt_rights' end;
  insert into mip_private.market_revision_qualifications(record_version_id,review_kind,review_ref,method_version) values(new_id,review_kind,p_review_ref,p_method_version);
  for source in select value from jsonb_array_elements(p_sources) loop
    insert into mip_private.market_revision_sources(record_version_id,public_version_id,rights_version_id,capture_id,capture_hash,source_field,span_start,span_end,excerpt)
      values(new_id,(source->>'publicVersionId')::uuid,(source->>'rightsVersionId')::uuid,(source->>'captureId')::uuid,source->>'payloadHash',
        case when source->>'field'='body' then 'body_text' else source->>'field' end,(source->>'start')::integer,(source->>'end')::integer,source->>'excerpt');
  end loop;
  return new_id;
end $$;
revoke all on function mip_private.append_market_revision(text,uuid,jsonb,text,text,jsonb) from public,anon,authenticated,service_role;

-- Exact nanoseconds in original text. PostgreSQL timestamptz alone rounds beyond
-- microseconds; parse whole seconds and the fractional component separately.
create function mip_private.market_instant_ns(p_text text) returns numeric
language plpgsql immutable strict security invoker set search_path='' as $$
declare m text[]; base numeric; zone text; minutes integer; fraction text;
begin
  m:=regexp_match(p_text,'^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}(?::?\d{2})?)$','i');
  if m is null or substring(m[2],1,2)::integer>23 or substring(m[2],4,2)::integer>59 or substring(m[2],7,2)::integer>59 then return null; end if;
  base:=extract(epoch from ((m[1]||' '||m[2])::timestamp at time zone 'UTC'))*1000000000;
  zone:=upper(m[4]); minutes:=0;
  if zone<>'Z' then
    fraction:=rpad(replace(substr(zone,2),':',''),4,'0');
    if substr(fraction,1,2)::integer>23 or substr(fraction,3,2)::integer>59 then return null; end if;
    minutes:=(substr(fraction,1,2)::integer*60+substr(fraction,3,2)::integer)*case when substr(zone,1,1)='-' then -1 else 1 end;
  end if;
  return base-minutes::numeric*60000000000+coalesce(nullif(rpad(m[3],9,'0'),''),'0')::numeric;
exception when others then return null;
end $$;
revoke all on function mip_private.market_instant_ns(text) from public,anon,authenticated,service_role;

-- This source view invokes the SAME article-version and nested-evidence owner.
-- It requires reviewed propositions, exact spans and separately qualified rights.
create view mip_private.public_market_source_bindings as
select s.record_version_id,
  jsonb_build_object('publicVersionId',v.public_version_id,'captureId',v.capture_id,'payloadHash',v.capture_hash,
    'articleId',v.article_id,'admissionKind',v.admission_kind,'reviewRef',v.review_ref,'policyVersion',v.policy_version,
    'reviewedBy',v.reviewed_by,'reviewedAt',v.reviewed_at,'field',e.source_field,'start',e.span_start,'end',e.span_end,
    'excerpt',e.excerpt,'excerptHash',e.excerpt_hash,'eventId',cl.event_id,'rightsVersionId',r.id,'attribution',r.payload->>'attribution') binding,
  v.source_snapshot
from mip_private.market_revision_sources s
join mip_private.public_reviewed_article_versions v on v.public_version_id=s.public_version_id
join mip_private.public_reviewed_article_evidence e on e.public_version_id=v.public_version_id
  and e.capture_id=s.capture_id and e.capture_hash=s.capture_hash and e.source_field=s.source_field
  and e.span_start=s.span_start and e.span_end=s.span_end and e.excerpt=s.excerpt
join public.claims cl on cl.id=e.claim_id
join evidence_pipeline.record_versions r on r.id=s.rights_version_id and r.record_kind='source_rights' and r.operation<>'delete'
join mip_private.market_revision_qualifications q on q.record_version_id=r.id and q.review_kind='excerpt_rights'
where v.admission_kind='reviewed_proposition' and v.capture_id=s.capture_id and v.capture_hash=s.capture_hash
  and not exists(select 1 from mip_private.market_revision_revocations x where x.record_version_id=r.id)
  and not exists(select 1 from evidence_pipeline.record_versions newer where newer.record_kind='source_rights' and newer.record_key=r.record_key and newer.ordinal>r.ordinal)
  and r.payload->>'publicVersionId'=v.public_version_id::text and r.payload->>'captureId'=v.capture_id::text
  and r.payload->>'payloadHash'=v.capture_hash and r.payload->>'displayExcerpt'='true'
  and length(btrim(coalesce(r.payload->>'attribution','')))>0 and length(btrim(coalesce(r.payload->>'reviewRef','')))>0
  and r.payload->>'termsUrl' ~ '^https://[^/@[:space:]]+([/?]|$)'
  and mip_private.market_instant_ns(r.payload->>'checkedAt') is not null
  and (r.payload->'validUntil'='null'::jsonb or mip_private.market_instant_ns(r.payload->>'validUntil')>
    mip_private.market_instant_ns(to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
revoke all on mip_private.public_market_source_bindings from public,anon,authenticated,service_role;

create view mip_private.public_market_revisions as
with latest as (
  select distinct on(record_kind,record_key) * from evidence_pipeline.record_versions
  where record_kind in ('market_identity','market_evidence_path') order by record_kind,record_key,ordinal desc
)
select r.*,q.review_ref,q.method_version,q.reviewed_by,q.reviewed_at,
  (select jsonb_agg(b.binding order by b.binding->>'publicVersionId',b.binding->>'field',b.binding->>'start')
   from mip_private.public_market_source_bindings b where b.record_version_id=r.id) source_bindings
from latest r join mip_private.market_revision_qualifications q on q.record_version_id=r.id
where r.operation<>'delete' and r.payload->>'id'=r.record_key and r.payload->>'recordVersionId'=r.id::text
  and ((r.record_kind='market_identity' and q.review_kind='identity_mapping') or (r.record_kind='market_evidence_path' and q.review_kind='supported_path'))
  and not exists(select 1 from mip_private.market_revision_revocations x where x.record_version_id=r.id)
  and exists(select 1 from mip_private.market_revision_sources s where s.record_version_id=r.id)
  and not exists(select 1 from mip_private.market_revision_sources s where s.record_version_id=r.id and not exists(
    select 1 from mip_private.public_market_source_bindings b where b.record_version_id=r.id
      and b.binding->>'publicVersionId'=s.public_version_id::text and b.binding->>'field'=s.source_field
      and (b.binding->>'start')::integer=s.span_start and (b.binding->>'end')::integer=s.span_end));
revoke all on mip_private.public_market_revisions from public,anon,authenticated,service_role;

create function mip_private.market_identity_json(p_record evidence_pipeline.record_versions,p_sources jsonb,p_review text,p_method text) returns jsonb
language sql immutable security invoker set search_path='' as $$
select jsonb_build_object('id',p_record.record_key,'recordVersionId',p_record.id,'identityType',p_record.payload->>'identityType',
  'name',p_record.payload->>'name','validFrom',p_record.payload->>'validFrom','validTo',p_record.payload->'validTo',
  'methodVersion',p_method,'reviewRef',p_review,'sourceBindings',p_sources)
  || coalesce((select jsonb_object_agg(key,value) from jsonb_each(p_record.payload)
    where key in ('issuerId','shareClassId','exchangeMic','networkId','assetIdentifier','assetIdentifierKind',
      'baseAssetId','quoteAssetId','venue')),'{}')
  || case when p_record.payload ? 'aliases' then jsonb_build_object('aliases',
    (select coalesce(jsonb_agg(jsonb_build_object('symbol',a->>'symbol','namespace',a->>'namespace','recordVersionId',p_record.id,
      'publicVersionId',a->>'publicVersionId','validFrom',a->>'validFrom','validTo',a->'validTo')),'[]') from jsonb_array_elements(p_record.payload->'aliases') a)) else '{}' end;
$$;
revoke all on function mip_private.market_identity_json(evidence_pipeline.record_versions,jsonb,text,text) from public,anon,authenticated,service_role;

create function mip_private.market_path_is_supported(p_asset uuid,p_event uuid,p_ns numeric,p_hops jsonb,p_assessments jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare current_id text:=p_asset::text; visited text[]:=array[p_asset::text]; used text[]:='{}';hop jsonb;a jsonb;connected integer:=0;
begin
  if p_asset is null or p_event is null or p_ns is null or p_hops is null or p_assessments is null
    or jsonb_typeof(p_hops)<>'array' or jsonb_typeof(p_assessments)<>'array'
    or jsonb_array_length(p_hops)<1 or jsonb_array_length(p_hops)>2 then return false; end if;
  for hop in select value from jsonb_array_elements(p_hops) loop
    if nullif(hop->>'assessmentId','') is null or nullif(hop->>'relationship','') is null or nullif(hop->>'to','') is null
      or hop->>'from' is distinct from current_id or hop->>'to' !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      or hop->>'to'=any(visited) or hop->>'assessmentId'=any(used)
      or hop->>'relationship' not in ('direct_reporting','ownership','operation','supply','regulation','financing','protocol_dependency') then return false; end if;
    select value into a from jsonb_array_elements(p_assessments) where value->>'id'=hop->>'assessmentId';
    if a is null or a->>'from' is distinct from hop->>'from' or a->>'to' is distinct from hop->>'to'
      or a->>'relationship' is distinct from hop->>'relationship' or a->>'outcome'<>'supported' or a->>'stale'<>'false'
      or a->'supersededBy'<>'[]'::jsonb or jsonb_array_length(a->'supports')<1
      or mip_private.market_instant_ns(a->>'validFrom') is null or mip_private.market_instant_ns(a->>'validFrom')>p_ns
      or not (a->'validTo'='null'::jsonb or mip_private.market_instant_ns(a->>'validTo')>p_ns) then return false; end if;
    if hop->>'relationship'<>'direct_reporting' then connected:=connected+1; end if;
    used:=array_append(used,hop->>'assessmentId');current_id:=hop->>'to';visited:=array_append(visited,current_id);
  end loop;
  return coalesce(current_id=p_event::text and connected<=1,false);
exception when others then return false;
end $$;
revoke all on function mip_private.market_path_is_supported(uuid,uuid,numeric,jsonb,jsonb) from public,anon,authenticated,service_role;

create function public.read_markets_source_directory_v1(p_at text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare at_text text; ns numeric; identities jsonb:='[]'; assets jsonb:='[]'; paths jsonb:='[]';
  row record; identity jsonb; issuer jsonb; share_class jsonb; network jsonb; refs jsonb;
  evidence jsonb; captures jsonb; cap jsonb; binding record; asset jsonb; sources jsonb;
  assessments jsonb; proposed jsonb; native jsonb; candidate evidence_pipeline.evidence_candidates; support jsonb;
  supported boolean; hops jsonb; result jsonb;
  observed text:=to_char(statement_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
begin
  at_text:=coalesce(p_at,observed);ns:=mip_private.market_instant_ns(at_text);
  if ns is null then return jsonb_build_object('status','unavailable','reason','inspection_time_unavailable'); end if;
  -- One statement reads all retained identity/source decisions at the exact
  -- inspection scope. Clock text is never reserialized through timestamptz.
  select coalesce(jsonb_agg(mip_private.market_identity_json(v,r.source_bindings,r.review_ref,r.method_version) order by r.record_key),'[]')
    into identities from (select * from mip_private.public_market_revisions where record_kind='market_identity' limit 1001) r join evidence_pipeline.record_versions v on v.id=r.id
    where r.record_kind='market_identity' and mip_private.market_instant_ns(r.payload->>'validFrom')<=ns
      and (r.payload->'validTo'='null'::jsonb or mip_private.market_instant_ns(r.payload->>'validTo')>ns)
      and r.payload->>'identityType' in ('issuer','share_class','listing','cryptoasset','network','trading_pair');
  if jsonb_array_length(identities)>1000 then return jsonb_build_object('status','unavailable','reason','directory_scope_exceeded'); end if;
  for identity in select value from jsonb_array_elements(identities) loop
    refs:=null;
    if identity->>'identityType'='listing' then
      select value into issuer from jsonb_array_elements(identities) where value->>'id'=identity->>'issuerId' and value->>'identityType'='issuer';
      select value into share_class from jsonb_array_elements(identities) where value->>'id'=identity->>'shareClassId' and value->>'identityType'='share_class';
      if issuer is not null and share_class->>'issuerId'=issuer->>'id' and identity->>'exchangeMic' ~ '^[A-Z0-9]{4}$' then
        refs:=jsonb_build_array(identity,issuer,share_class);
        asset:=identity||jsonb_build_object('kind','equity','releaseState','public','publiclyEligible',true,'identityRefs',refs);
      end if;
    elsif identity->>'identityType'='cryptoasset' then
      select value into network from jsonb_array_elements(identities) where value->>'id'=identity->>'networkId' and value->>'identityType'='network';
      if network is not null and identity->>'assetIdentifierKind' in ('native','contract') and length(btrim(coalesce(identity->>'assetIdentifier','')))>0 then
        refs:=jsonb_build_array(identity,network);
        asset:=identity||jsonb_build_object('kind','cryptoasset','releaseState','public','publiclyEligible',true,'identityRefs',refs);
      end if;
    end if;
    if refs is not null then assets:=assets||jsonb_build_array(asset); end if;
  end loop;
  if jsonb_array_length(assets)=0 then return jsonb_build_object('status','unavailable','reason','no_admitted_assets'); end if;
  if jsonb_array_length(assets)>200 then return jsonb_build_object('status','unavailable','reason','directory_scope_exceeded'); end if;
  for row in select * from mip_private.public_market_revisions where record_kind='market_evidence_path' order by record_key limit 201 loop
    select value into asset from jsonb_array_elements(assets) where value->>'id'=row.payload#>>'{evidence,asset,id}'
      and value->>'recordVersionId'=row.payload#>>'{evidence,asset,recordVersionId}';
    if asset is null or mip_private.market_instant_ns(row.payload#>>'{evidence,at}') is distinct from ns
      or exists(select 1 from jsonb_array_elements(row.source_bindings) b where b->>'eventId' is distinct from row.payload#>>'{evidence,eventId}') then continue; end if;
    assessments:='[]';supported:=true;
    for proposed in select value from jsonb_array_elements(coalesce(row.payload#>'{evidence,assessments}','[]')) loop
      native:=evidence_pipeline.read_assessment((proposed->>'id')::uuid,null);
      if native->>'candidate_id' is distinct from proposed->>'candidateId' or native->>'outcome'<>'supported'
      or native->>'stale'<>'false' or native->'superseded_by'<>'[]'::jsonb or native->>'algorithm_version' is distinct from proposed->>'algorithmVersion'
      or not proposed ? 'validTo'
        or native->>'remaining_uncertainty' is distinct from proposed->>'uncertainty' then supported:=false;exit; end if;
      select * into candidate from evidence_pipeline.evidence_candidates where id=(proposed->>'candidateId')::uuid;
      if not found then supported:=false;exit; end if;
      for support in select value from jsonb_array_elements(coalesce(proposed->'supports','[]')) loop
        if support->>'captureId' is distinct from candidate.capture_id::text or support->>'field' is distinct from
          (case when candidate.source_field='body_text' then 'body' else candidate.source_field end)
          or (support->>'start')::integer is distinct from candidate.span_start or (support->>'end')::integer is distinct from candidate.span_end
          or support->>'excerpt' is distinct from candidate.excerpt then supported:=false;exit; end if;
      end loop;
      if not supported then exit; end if;
      assessments:=assessments||jsonb_build_array(jsonb_build_object('id',proposed->>'id','candidateId',native->>'candidate_id',
        'from',proposed->>'from','to',proposed->>'to','relationship',proposed->>'relationship','outcome',native->>'outcome',
        'stale',false,'supersededBy','[]'::jsonb,'algorithmVersion',native->>'algorithm_version','uncertainty',native->>'remaining_uncertainty',
        'releaseState','public','publiclyEligible',true,'validFrom',proposed->>'validFrom','validTo',proposed->'validTo',
        'supports',(select jsonb_agg(jsonb_build_object('captureId',s->>'captureId','field',s->>'field','start',s->'start','end',s->'end','excerpt',s->>'excerpt'))
          from jsonb_array_elements(proposed->'supports') s)));
    end loop;
    if not supported or jsonb_array_length(assessments)=0 then continue; end if;
    if not mip_private.market_path_is_supported((asset->>'id')::uuid,(row.payload#>>'{evidence,eventId}')::uuid,ns,
      row.payload#>'{evidence,hops}',assessments) then continue; end if;
    captures:='[]';sources:=row.source_bindings;
    for cap in select value from jsonb_array_elements(coalesce(row.payload#>'{evidence,captures}','[]')) loop
      select b.binding,b.source_snapshot into binding from mip_private.public_market_source_bindings b where b.record_version_id=row.id
        and b.binding->>'captureId'=cap->>'id' and b.binding->>'publicVersionId'=cap->>'publicVersionId' and b.binding->>'payloadHash'=cap->>'payloadHash' limit 1;
      if not found then captures:='[]';exit; end if;
      captures:=captures||jsonb_build_array(jsonb_build_object('id',binding.binding->>'captureId','articleId',binding.binding->>'articleId',
        'rootId',cap->>'rootId','payloadHash',binding.binding->>'payloadHash','publicVersionId',binding.binding->>'publicVersionId',
        'publiclyEligible',true,'publishedAt',binding.source_snapshot->>'published_at','recordedAt',binding.source_snapshot->>'captured_at',
        'sourceUrl',binding.source_snapshot->>'url','rights',jsonb_build_object('displayExcerpt',true,
          'recordVersionId',binding.binding->>'rightsVersionId','attribution',binding.binding->>'attribution'),
        'admittedSpans',(select jsonb_agg(jsonb_build_object('publicVersionId',b.binding->>'publicVersionId','payloadHash',b.binding->>'payloadHash',
          'field',case when b.binding->>'field'='body_text' then 'body' else b.binding->>'field' end,'start',b.binding->'start','end',b.binding->'end','excerpt',b.binding->>'excerpt'))
          from mip_private.public_market_source_bindings b where b.record_version_id=row.id and b.binding->>'captureId'=cap->>'id')));
    end loop;
    if jsonb_array_length(captures)=0 then continue; end if;
    select jsonb_agg(jsonb_build_object('from',h->>'from','to',h->>'to','relationship',h->>'relationship','assessmentId',h->>'assessmentId'))
      into hops from jsonb_array_elements(row.payload#>'{evidence,hops}') h;
    evidence:=jsonb_build_object('at',at_text,'asset',asset,'eventId',row.payload#>>'{evidence,eventId}',
      'hops',hops,'assessments',assessments,'captures',captures);
    paths:=paths||jsonb_build_array(jsonb_build_object('id',row.record_key,'recordVersionId',row.id,'methodVersion',row.method_version,
      'reviewRef',row.review_ref,'sourceBindings',sources,'relevance',row.payload->>'relevance','evidence',evidence));
    if jsonb_array_length(paths)>200 then return jsonb_build_object('status','unavailable','reason','directory_scope_exceeded'); end if;
  end loop;
  result:=jsonb_build_object('contract','mip-markets-admitted-directory-v2','status','available','version',
    encode(sha256(convert_to(jsonb_build_array(identities,paths)::text,'UTF8')),'hex'),'validAt',at_text,'observedAt',observed,
    'identities',identities,'assets',assets,'reporting',paths);
  if octet_length(result::text)>2097152 then return jsonb_build_object('status','unavailable','reason','directory_scope_exceeded'); end if;
  return result;
exception when others then return jsonb_build_object('status','unavailable','reason','directory_read_failed');
end $$;
revoke all on function public.read_markets_source_directory_v1(text) from public;
grant execute on function public.read_markets_source_directory_v1(text) to anon,authenticated,service_role;
comment on function public.read_markets_source_directory_v1(text) is
  'Bounded public owner projection. Exact reviewed proposition and independent retained excerpt-rights qualification required. No provider requests or population.';
commit;
