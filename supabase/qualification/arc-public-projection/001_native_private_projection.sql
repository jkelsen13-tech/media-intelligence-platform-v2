-- Native pending/private projection successor. Source-only candidate; no public writes.
begin;
set local lock_timeout='5s';
grant mip_arc_native_owner to current_user with set true;
create schema mip_arc_projection_private authorization mip_arc_native_owner;
revoke all on schema mip_arc_projection_private from public,anon,authenticated,service_role;
grant select(category,root_node_id) on public.story_arcs to mip_arc_native_owner;
grant select(id,arc_id,milestone_key,status) on public.arc_milestones to mip_arc_native_owner;
grant select(id,type) on public.nodes to mip_arc_native_owner;
grant select(reader_state,source_status) on public.articles to mip_arc_native_owner;
create policy arc_private_projection_milestones on public.arc_milestones for select to mip_arc_native_owner using(true);
create policy arc_private_projection_nodes on public.nodes for select to mip_arc_native_owner using(true);
set role mip_arc_native_owner;

create table mip_arc_projection_private.source_bindings(
 scope uuid not null,id uuid not null,article uuid not null,capture uuid not null,job uuid not null,
 content_hash text not null check(content_hash~'^[0-9a-f]{64}$'),
 body_kind text not null check(body_kind in('string','null','missing')),
 body_hash text not null check(body_hash~'^[0-9a-f]{64}$'),
 url_hash text not null check(url_hash~'^[0-9a-f]{64}$'),
 principal name not null default session_user,primary key(scope,id),unique(scope,capture));
create table mip_arc_projection_private.source_access(
 scope uuid not null,binding uuid not null,version integer not null check(version>0),allowed boolean not null,
 primary key(scope,binding),foreign key(scope,binding) references mip_arc_projection_private.source_bindings);
create table mip_arc_projection_private.citation_reviews(
 scope uuid not null,id uuid not null,binding uuid not null,version integer not null check(version>0),predecessor uuid,
 state text not null check(state in('reviewed_complete','revoked')),
 items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items)<=64 and octet_length(items::text)<=16384),
 principal name not null default session_user,primary key(scope,id),unique(scope,binding,version),
 foreign key(scope,binding) references mip_arc_projection_private.source_bindings,
 foreign key(scope,predecessor) references mip_arc_projection_private.citation_reviews);
create table mip_arc_projection_private.context_reviews(
 scope uuid not null,id uuid not null,arc uuid not null,version integer not null check(version>0),predecessor uuid,
 state text not null check(state in('reviewed','revoked')),
 selected_context jsonb not null check(octet_length(selected_context::text)<=65536),
 context_hash text not null check(context_hash~'^[0-9a-f]{64}$'),
 principal name not null default session_user,primary key(scope,id),unique(scope,arc,version),
 foreign key(scope,predecessor) references mip_arc_projection_private.context_reviews);
create table mip_arc_projection_private.projections(
 scope uuid not null,id uuid not null,generation uuid not null,input_hash text not null,output_hash text not null,
 score_review uuid not null,binding uuid not null,access_version integer not null,citation_review uuid not null,context_review uuid not null,
 dependency_manifest jsonb not null check(octet_length(dependency_manifest::text)<=16384),
 dependency_hash text not null check(dependency_hash~'^[0-9a-f]{64}$'),
 -- Deliberate private display content, never a metadata receipt or body archive.
 display_payload jsonb not null check(octet_length(display_payload::text)<=131072),
 display_hash text not null check(display_hash~'^[0-9a-f]{64}$'),
 principal name not null default session_user,primary key(scope,id),
 foreign key(scope,generation) references mip_arc_native.generations(scope,id),
 foreign key(scope,binding) references mip_arc_projection_private.source_bindings,
 foreign key(scope,citation_review) references mip_arc_projection_private.citation_reviews,
 foreign key(scope,context_review) references mip_arc_projection_private.context_reviews);
create table mip_arc_projection_private.reviews(
 scope uuid not null,id uuid not null,projection uuid not null,version integer not null check(version>0),predecessor uuid,
 dependency_hash text not null,display_hash text not null,
 disposition text not null check(disposition in('pending_private','accepted_private','revoked')),
 reason text not null check(reason in('awaiting_publication_contract','reviewed_private_display','revocation')),
 principal name not null default session_user,primary key(scope,id),unique(scope,projection,version),
 foreign key(scope,projection) references mip_arc_projection_private.projections,
 foreign key(scope,predecessor) references mip_arc_projection_private.reviews,
 check((disposition='pending_private' and reason='awaiting_publication_contract')
 or(disposition='accepted_private' and reason='reviewed_private_display')
 or(disposition='revoked' and reason='revocation')));

create function mip_arc_projection_private.enter_scope(s uuid,review boolean) returns void
language plpgsql set search_path='' as $enter$
begin
 perform mip_arc_native.context(s,review);
 perform mip_arc_native.fences();
end $enter$;
create function mip_arc_projection_private.hash_json(v jsonb) returns text
language sql immutable strict set search_path='' as $hash$
 select encode(sha256(convert_to(v::text,'UTF8')),'hex')
$hash$;
create function mip_arc_projection_private.receipt(p mip_arc_projection_private.projections) returns jsonb
language sql immutable set search_path='' as $receipt$
 select jsonb_build_object('contract','native-private-projection-receipt-v1','projection_id',p.id,
 'generation_id',p.generation,'dependency_hash',p.dependency_hash,'display_hash',p.display_hash,
 'state','pending_private','approval_allowed',false,'publication_allowed',false,'attached',false)
$receipt$;
-- Protected current original-source resolver. No payload is returned to a gateway.
create function mip_arc_projection_private.source_value(b mip_arc_projection_private.source_bindings,check_access boolean)
returns jsonb language plpgsql set search_path='' set timezone='UTC' as $source$
declare c record;body jsonb;url jsonb;kind text;access_row mip_arc_projection_private.source_access;
begin
 perform mip_arc_native.require_current_capture(b.article,b.capture);
 if check_access then
  select * into access_row from mip_arc_projection_private.source_access where scope=b.scope and binding=b.id for share;
  if not found or not access_row.allowed then raise exception 'arc_projection_source_access';end if;
 end if;
 select x.payload,x.content_hash,x.article_id,x.job_id,j.state,j.input_hash,j.article_id job_article
 into c from evidence_pipeline.article_captures x join evidence_pipeline.import_jobs j on j.id=x.job_id
 where x.id=b.capture and x.job_id=b.job and x.article_id=b.article;
 if not found or c.state is distinct from 'completed' or c.job_article is distinct from b.article
 or c.content_hash is distinct from b.content_hash or c.input_hash is distinct from b.content_hash
 or jsonb_typeof(c.payload) is distinct from 'object' or octet_length(c.payload::text)>262144
 or mip_arc_projection_private.hash_json(c.payload)<>b.content_hash
 then raise exception 'arc_projection_capture_binding';end if;
 body:=jsonb_build_object('present',c.payload?'body_text','value',c.payload->'body_text');
 url:=jsonb_build_object('present',c.payload?'url','value',c.payload->'url');
 kind:=case when not(c.payload?'body_text') then 'missing' when c.payload->'body_text'='null'::jsonb then 'null' else jsonb_typeof(c.payload->'body_text') end;
 if kind is distinct from b.body_kind or mip_arc_projection_private.hash_json(body)<>b.body_hash
 or mip_arc_projection_private.hash_json(url)<>b.url_hash
 or jsonb_typeof(c.payload->'url') is distinct from 'string' or octet_length(c.payload->>'url')>2048
 or c.payload->>'url'!~'^https?://' then raise exception 'arc_projection_field_binding';end if;
 return jsonb_build_object('body',body,'url',c.payload->'url','title',c.payload->'title','summary',c.payload->'summary',
 'outlet',c.payload->'outlet','published_at',c.payload->'published_at','capture_bytes',octet_length(c.payload::text));
end $source$;

create function mip_arc_projection_private.review_source(s uuid,i uuid,a uuid,c uuid,j uuid,ch text,bk text,bh text,uh text)
returns uuid language plpgsql security definer set search_path='' as $admit$
declare b mip_arc_projection_private.source_bindings;old mip_arc_projection_private.source_bindings;
begin
 perform mip_arc_projection_private.enter_scope(s,true);
 if i is null or a is null or c is null or j is null or ch is null or bh is null or uh is null
 or ch!~'^[0-9a-f]{64}$' or bh!~'^[0-9a-f]{64}$' or uh!~'^[0-9a-f]{64}$'
 or bk is null or bk not in('string','null','missing') then raise exception 'arc_projection_source_shape';end if;
 b.scope:=s;b.id:=i;b.article:=a;b.capture:=c;b.job:=j;b.content_hash:=ch;b.body_kind:=bk;b.body_hash:=bh;b.url_hash:=uh;
 perform mip_arc_projection_private.source_value(b,false);
 select * into old from mip_arc_projection_private.source_bindings where scope=s and id=i;
 if found then
  if (old.article,old.capture,old.job,old.content_hash,old.body_kind,old.body_hash,old.url_hash)
  is distinct from(a,c,j,ch,bk,bh,uh) then raise exception 'arc_projection_source_retry';end if;
 else insert into mip_arc_projection_private.source_bindings(scope,id,article,capture,job,content_hash,body_kind,body_hash,url_hash)
 values(s,i,a,c,j,ch,bk,bh,uh);end if;
 return i;
exception when others then raise exception 'arc_projection_source_review_failed' using errcode='P0001',detail='',hint='';
end $admit$;
create function mip_arc_projection_private.set_source_access(s uuid,i uuid,allow_read boolean)
returns integer language plpgsql security definer set search_path='' as $access$
declare v integer;
begin
 perform mip_arc_projection_private.enter_scope(s,true);
 if allow_read is null or not exists(select 1 from mip_arc_projection_private.source_bindings where scope=s and id=i)
 then raise exception 'arc_projection_source_missing';end if;
 insert into mip_arc_projection_private.source_access(scope,binding,version,allowed) values(s,i,1,allow_read)
 on conflict(scope,binding) do update set version=mip_arc_projection_private.source_access.version+
 case when mip_arc_projection_private.source_access.allowed is distinct from excluded.allowed then 1 else 0 end,
 allowed=excluded.allowed returning version into v;
 return v;
exception when others then raise exception 'arc_projection_source_access_failed' using errcode='P0001',detail='',hint='';
end $access$;
create function mip_arc_projection_private.check_citations(items jsonb,source jsonb) returns void
language plpgsql set search_path='' as $citations$
declare item jsonb;body bytea;start_at integer;end_at integer;prior_end integer:=0;
begin
 if items is null or jsonb_typeof(items)<>'array' or jsonb_array_length(items)>64 or octet_length(items::text)>16384
 then raise exception 'arc_projection_citation_shape';end if;
 body:=convert_to(coalesce(source->'body'->>'value',''),'UTF8');
 for item in select value from jsonb_array_elements(items) loop
  if not mip_arc_native.exact_keys(item,array['start','end','span_hash','cited_type'])
  or jsonb_typeof(item->'start') is distinct from 'number' or jsonb_typeof(item->'end') is distinct from 'number'
  or item->>'start'!~'^[0-9]{1,6}$' or item->>'end'!~'^[0-9]{1,6}$'
  or jsonb_typeof(item->'span_hash') is distinct from 'string' or jsonb_typeof(item->'cited_type') is distinct from 'string'
  or item->>'span_hash'!~'^[0-9a-f]{64}$'
  or item->>'cited_type' not in('court_doc','agency_release','other')
  then raise exception 'arc_projection_citation_shape';end if;
  start_at:=(item->>'start')::integer;end_at:=(item->>'end')::integer;
  if start_at<prior_end or end_at<=start_at or end_at>octet_length(body)
  or encode(sha256(substring(body from start_at+1 for end_at-start_at)),'hex')<>item->>'span_hash'
  then raise exception 'arc_projection_citation_binding';end if;
  -- Both byte boundaries must also be UTF8 boundaries.
  perform convert_from(substring(body from 1 for start_at),'UTF8');
  perform convert_from(substring(body from start_at+1 for end_at-start_at),'UTF8');
  prior_end:=end_at;
 end loop;
end $citations$;
create function mip_arc_projection_private.review_citations(s uuid,i uuid,b uuid,v integer,prev uuid,st text,items jsonb)
returns uuid language plpgsql security definer set search_path='' as $review$
declare binding mip_arc_projection_private.source_bindings;head mip_arc_projection_private.citation_reviews;old mip_arc_projection_private.citation_reviews;
begin
 perform mip_arc_projection_private.enter_scope(s,true);
 if i is null or b is null or v is null or v<1 or st is null or st not in('reviewed_complete','revoked')
 then raise exception 'arc_projection_citation_shape';end if;
 select * into strict binding from mip_arc_projection_private.source_bindings where scope=s and id=b;
 perform mip_arc_projection_private.check_citations(items,mip_arc_projection_private.source_value(binding,true));
 select * into head from mip_arc_projection_private.citation_reviews where scope=s and binding=b order by version desc limit 1;
 select * into old from mip_arc_projection_private.citation_reviews where scope=s and id=i;
 if found then
  if (old.binding,old.version,old.predecessor,old.state,old.items) is distinct from(b,v,prev,st,items)
  or head.id<>i then raise exception 'arc_projection_citation_retry';end if;return i;
 end if;
 if prev is distinct from head.id or v<>coalesce(head.version,0)+1 then raise exception 'arc_projection_citation_predecessor';end if;
 insert into mip_arc_projection_private.citation_reviews(scope,id,binding,version,predecessor,state,items) values(s,i,b,v,prev,st,items);
 return i;
exception when others then raise exception 'arc_projection_review_failed' using errcode='P0001',detail='',hint='';
end $review$;

create function mip_arc_projection_private.current_context(a uuid) returns jsonb
language plpgsql set search_path='' as $context$
declare arc record;root_type text;milestones jsonb;
begin
 select id,category,root_node_id into arc from public.story_arcs where id=a;
 if not found then raise exception 'arc_projection_arc_missing';end if;
 if arc.root_node_id is not null then
  select type into root_type from public.nodes where id=arc.root_node_id;
  if not found then raise exception 'arc_projection_root_missing';end if;
 end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]'::jsonb) into milestones from(
 select id,milestone_key,status from public.arc_milestones where arc_id=a order by id limit 65)q;
 if jsonb_array_length(milestones)>64 or octet_length(milestones::text)>60000 then raise exception 'arc_projection_context_budget';end if;
 return jsonb_build_object('contract','native-arc-projection-context-v1','arc_id',a,'category',arc.category,
 'root_node_id',arc.root_node_id,'root_type',root_type,'milestones',milestones,
 'selected_relation_change_count',(select count(*) from mip_identity.source_changes
 where relation_name in('public.articles','public.story_arcs','public.nodes','public.arc_milestones')));
end $context$;
create function mip_arc_projection_private.review_context(s uuid,i uuid,a uuid,v integer,prev uuid,st text,expected text)
returns uuid language plpgsql security definer set search_path='' as $review$
declare observed jsonb;h text;head mip_arc_projection_private.context_reviews;old mip_arc_projection_private.context_reviews;
begin
 perform mip_arc_projection_private.enter_scope(s,true);
 if i is null or a is null or v is null or v<1 or st is null or st not in('reviewed','revoked')
 or expected is null or expected!~'^[0-9a-f]{64}$' then raise exception 'arc_projection_context_shape';end if;
 observed:=mip_arc_projection_private.current_context(a);h:=mip_arc_projection_private.hash_json(observed);
 if h<>expected then raise exception 'arc_projection_context_changed';end if;
 select * into head from mip_arc_projection_private.context_reviews where scope=s and arc=a order by version desc limit 1;
 select * into old from mip_arc_projection_private.context_reviews where scope=s and id=i;
 if found then
  if (old.arc,old.version,old.predecessor,old.state,old.context_hash) is distinct from(a,v,prev,st,h)
  or old.selected_context<>observed or head.id<>i then raise exception 'arc_projection_context_retry';end if;return i;
 end if;
 if prev is distinct from head.id or v<>coalesce(head.version,0)+1 then raise exception 'arc_projection_context_predecessor';end if;
 insert into mip_arc_projection_private.context_reviews(scope,id,arc,version,predecessor,state,selected_context,context_hash)
 values(s,i,a,v,prev,st,observed,h);return i;
exception when others then raise exception 'arc_projection_review_failed' using errcode='P0001',detail='',hint='';
end $review$;

-- Original recovered milestone evaluator, namespace-only adaptation below.
CREATE OR REPLACE FUNCTION mip_arc_projection_private.milestone_outcome(p_milestone_key text, p_article_text text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
begin
  case p_milestone_key
    when 'ia_concludes' then
      if p_article_text ~* '(investigat|inquiry|probe).{0,60}(dropped|abandoned|closed without|shelved)' then return 'failed'; end if;
      if p_article_text ~* '(findings?|report).{0,40}(published|released)|(investigat|inquiry|probe|inquest).{0,80}(conclud|complet|publishes|releases)' then return 'confirmed'; end if;
    when 'ia_charges' then
      if p_article_text ~* '(cleared|no charges|charges dropped|acquit|exonerat)' then return 'failed'; end if;
      if p_article_text ~* '(charged|charges (filed|brought)|indict|prosecut|disciplin|suspended|dismissed|sacked)' then return 'confirmed'; end if;
    when 'ia_policy' then
      if p_article_text ~* '(policy change|reform|new (rules|guidelines|protocols)|overhaul|code of conduct)' then return 'confirmed'; end if;
    when 'ia_remedy' then
      if p_article_text ~* '(settlement|compensation|payout|remedy|apolog|damages awarded|redress)' then return 'confirmed'; end if;
    when 'gp_ceasefire' then
      if p_article_text ~* '(talks? (collapse|fail)|ceasefire (broken|collapses|ends))' then return 'failed'; end if;
      if p_article_text ~* '(ceasefire|truce|de-escalat|peace (deal|agreement)|armistice|withdraw)' then return 'confirmed'; end if;
    when 'gp_sanctions' then
      if p_article_text ~* '(sanctions? (imposed|announced|extended)|retaliat|expel|travel ban)' then return 'confirmed'; end if;
    when 'gp_routes' then
      if p_article_text ~* '(resum|reopen|normali|returns? to (the )?(red sea|route|port))' then return 'confirmed'; end if;
    when 'gp_escalation' then
      if p_article_text ~* '(escalat|strike|attack|intervention|deploy|mobilis|mobiliz)' then return 'confirmed'; end if;
    when 'ep_enacted' then
      if p_article_text ~* '(takes effect|comes into force|enacted|implement|signed into law|approved)' then return 'confirmed'; end if;
    when 'ep_market' then
      if p_article_text ~* '(markets? (react|fall|rise|slide)|shares? (fell|fall|rose|rise)|prices? (rise|fall|rose|fell)|adjust)' then return 'confirmed'; end if;
    when 'ep_reversal' then
      if p_article_text ~* '(revers|withdraw|scrapped|backs off|abandon|u-turn)' then return 'confirmed'; end if;
    when 'ep_funding', 'lr_funding' then
      if p_article_text ~* '(funding|allocat|budget|appropriat|bailout)' then return 'confirmed'; end if;
    when 'lr_enforcement' then
      if p_article_text ~* '(enforcement|fined|fine|penalt|crackdown|sanctioned)' then return 'confirmed'; end if;
    when 'lr_challenge' then
      if p_article_text ~* '(lawsuit|legal challenge|judicial review|court challenge|appeal|injunction)' then return 'confirmed'; end if;
    when 'lr_deadline' then
      if p_article_text ~* '(delayed|postponed|missed deadline|pushed back)' then return 'failed'; end if;
      if p_article_text ~* '(takes effect|comes into force|deadline|implement|in force)' then return 'confirmed'; end if;
    when 'gen_response' then
      if p_article_text ~* '(respond|statement|comment|reaction)' then return 'confirmed'; end if;
    when 'gen_development' then
      if p_article_text ~* '(develop|update|continu|latest)' then return 'confirmed'; end if;
    when 'gen_reaction' then
      if p_article_text ~* '(react|criticis|criticiz|praise|backlash|condemn)' then return 'confirmed'; end if;
  end case;
  return null;
end;
$function$


create function mip_arc_projection_private.expand(p mip_arc_projection_private.projections) returns jsonb
language plpgsql set search_path='' set timezone='UTC' set datestyle='ISO,YMD' as $expand$
declare accepted jsonb;saved mip_arc_native.generations;binding mip_arc_projection_private.source_bindings;
 cite mip_arc_projection_private.citation_reviews;ctx mip_arc_projection_private.context_reviews;source jsonb;context_now jsonb;
 access_revision integer;source_state record;manifest jsonb;display jsonb;node jsonb;event jsonb;edge jsonb;
 milestone jsonb;outcome text;milestones jsonb:='[]';text_input text;category text;confidence text;day date;
 reserve_bytes bigint;reserve_hash bigint;retained_text text;
begin
 perform mip_arc_projection_private.enter_scope(p.scope,false);
 select * into saved from mip_arc_native.generations where scope=p.scope and id=p.generation;
 if not found then raise exception 'arc_projection_generation_missing';end if;
 -- Before any reconstruction/hash access, reserve a conservative 2MiB for
 -- all supplemental bounded values. The later measured bound remains active.
 if(saved.manifest->>'max_total_bytes')::bigint+2097152>8388608
 or(saved.manifest->>'max_hash_work_bytes')::bigint+2097152>134217728
 then raise exception 'arc_projection_operation_budget';end if;
 -- One current complete native scoring read. Never substitute a newer capture.
 accepted:=mip_arc_native.read_current_score(p.scope,p.generation,p.input_hash,p.output_hash,p.score_review);
 if accepted->'review'->>'state' is distinct from 'accepted_private'
 or accepted->'output'->'score'->>'decision' is distinct from 'candidate'
 or accepted->'output'->'score'->'hard_rejections' is distinct from '[]'::jsonb
 then raise exception 'arc_projection_score_review';end if;
 select * into strict saved from mip_arc_native.generations where scope=p.scope and id=p.generation;
 select * into strict binding from mip_arc_projection_private.source_bindings where scope=p.scope and id=p.binding;
 if binding.article is distinct from(saved.manifest->>'article')::uuid
 or not exists(select 1 from mip_arc_native.extraction_reviews e
 where e.scope=p.scope and e.id in(select value::uuid from jsonb_array_elements_text(saved.manifest->'extraction_review_ids'))
 and e.article=binding.article and e.capture=binding.capture and e.content_hash=binding.content_hash)
 then raise exception 'arc_projection_native_lineage';end if;
 source:=mip_arc_projection_private.source_value(binding,true);
 select version into access_revision from mip_arc_projection_private.source_access where scope=p.scope and binding=p.binding;
 if p.access_version is not null and access_revision<>p.access_version then raise exception 'arc_projection_access_revision';end if;
 select * into cite from mip_arc_projection_private.citation_reviews where scope=p.scope and binding=p.binding order by version desc limit 1;
 if not found or cite.id is distinct from p.citation_review or cite.state<>'reviewed_complete'
 then raise exception 'arc_projection_citation_stale';end if;
 perform mip_arc_projection_private.check_citations(cite.items,source);
 select * into ctx from mip_arc_projection_private.context_reviews
 where scope=p.scope and arc=(saved.manifest->'arc'->>'id')::uuid order by version desc limit 1;
 if not found or ctx.id is distinct from p.context_review or ctx.state<>'reviewed'
 then raise exception 'arc_projection_context_stale';end if;
 context_now:=mip_arc_projection_private.current_context(ctx.arc);
 if context_now is distinct from ctx.selected_context or mip_arc_projection_private.hash_json(context_now)<>ctx.context_hash
 then raise exception 'arc_projection_context_stale';end if;
 select reader_state,source_status,arc_id into source_state from public.articles where id=binding.article;
 if not found or source_state.arc_id is not null then raise exception 'arc_projection_public_assignment';end if;
 -- Reserve the existing native operation's proven limits, not an optimistic
 -- one-pass cost. An overlarge profile requires a reviewed budget adjustment.
 reserve_bytes:=(saved.manifest->>'max_total_bytes')::bigint+(source->>'capture_bytes')::bigint
  +3*octet_length(source::text)+2*octet_length(context_now::text)+262144;
 reserve_hash:=(saved.manifest->>'max_hash_work_bytes')::bigint+(source->>'capture_bytes')::bigint
  +3*octet_length(source::text)+2*octet_length(context_now::text)+262144;
 if reserve_bytes>8388608 or reserve_hash>134217728 then raise exception 'arc_projection_operation_budget';end if;
 category:=case context_now->>'category' when 'institutional_accountability' then 'accountability'
 when 'geopolitical_consequence' then 'geopolitical' when 'economic_policy' then 'economic'
 when 'legislative_regulatory' then 'legislative' else 'accountability' end;
 confidence:=case when exists(select 1 from jsonb_array_elements(cite.items)x where x->>'cited_type' in('court_doc','agency_release'))
 then 'confirmed' else 'corroborated' end;
 day:=(source->>'published_at')::timestamptz::date;
 text_input:=btrim(coalesce(source->>'title','')||'. '||coalesce(source->>'summary','')||'. '||coalesce(source->'body'->>'value',''));
 node:=jsonb_build_object('label',left(source->>'title',120),'type','event','description',left(coalesce(source->>'summary',''),400),
 'summary',left(coalesce(source->>'summary',''),400),'confidence',70,'occurred_at',day);
 event:=jsonb_build_object('title',left(source->>'title',200),'category',category,'confidence',confidence,
 'occurred_at',day,'description',left(coalesce(source->>'summary',''),400));
 edge:=case when context_now->'root_node_id'='null'::jsonb then 'null'::jsonb else
 jsonb_build_object('source_id',context_now->'root_node_id','target_projection_id',p.id,'type','sequence',
 'weight','light','label','algorithmically admitted Arc membership','signal_source','shared_entity',
 'doc_strength','circumstantial','claimed_by','reporting','reliability',4,'counterfactual_test','sequence_only') end;
 for milestone in select value from jsonb_array_elements(context_now->'milestones') loop
  if milestone->>'status'<>'pending' then continue;end if;
  outcome:=mip_arc_projection_private.milestone_outcome(milestone->>'milestone_key',text_input);
  if outcome is not null then milestones:=milestones||jsonb_build_array(jsonb_build_object(
   'milestone_id',milestone->'id','outcome',outcome));end if;
 end loop;
 -- Citation confidence uses explicitly reviewed native classifications. This
 -- is a versioned producer successor, not fabricated historical citation rows.
 manifest:=jsonb_build_object('contract','native-private-projection-input-v1','codec','postgres17-jsonb-text-utf8-v1',
 'generation_id',p.generation,'native_input_hash',p.input_hash,'native_output_hash',p.output_hash,'score_review_id',p.score_review,
 'native_manifest_hash',saved.manifest_hash,'source_binding_id',binding.id,'article_id',binding.article,
 'capture_id',binding.capture,'job_id',binding.job,'content_hash',binding.content_hash,
 'body_kind',binding.body_kind,'body_hash',binding.body_hash,'url_hash',binding.url_hash,
 'source_access_version',access_revision,'citation_review_id',cite.id,'citation_set_hash',mip_arc_projection_private.hash_json(cite.items),
 'context_review_id',ctx.id,'context_hash',ctx.context_hash,'reader_state',source_state.reader_state,'source_status',source_state.source_status,
 'vector',jsonb_build_object('state','absent','producer_id',null),'public_release','closed_existing_contract',
 'privacy_review','not_supplied','rights_review','not_supplied','publication_eligible',false);
 display:=jsonb_build_object('contract','native-private-arc-display-v1','projection_id',p.id,'candidate_id',saved.manifest->'candidate',
 'article_id',binding.article,'arc_id',ctx.arc,'node',node,'source',jsonb_build_object(
 'outlet',coalesce(nullif(btrim(source->>'outlet'),''),'Unspecified outlet'),'headline',left(source->>'title',200),
 'url',source->'url','published_at',day),'event',event,'edge',edge,'milestone_outcomes',milestones,
 'vector',jsonb_build_object('state','absent','centroid_updated',false),
 'state','pending_private','approval_allowed',false,'publication_allowed',false,'attached',false);
 if octet_length(display::text)>131072 or octet_length(manifest::text)>16384 then raise exception 'arc_projection_output_budget';end if;
 return jsonb_build_object('manifest',manifest,'display',display);
end $expand$;

create function mip_arc_projection_private.prepare(s uuid,i uuid,g uuid,ih text,oh text,sr uuid,b uuid,cite uuid,ctx uuid)
returns jsonb language plpgsql security definer set search_path='' as $prepare$
declare proposed mip_arc_projection_private.projections;old mip_arc_projection_private.projections;expanded jsonb;
begin
 perform mip_arc_projection_private.enter_scope(s,true);
 if i is null or g is null or sr is null or b is null or cite is null or ctx is null
 or ih is null or oh is null or ih!~'^[0-9a-f]{64}$' or oh!~'^[0-9a-f]{64}$'
 then raise exception 'arc_projection_prepare_shape';end if;
 proposed.scope:=s;proposed.id:=i;proposed.generation:=g;proposed.input_hash:=ih;proposed.output_hash:=oh;
 proposed.score_review:=sr;proposed.binding:=b;proposed.citation_review:=cite;proposed.context_review:=ctx;
 expanded:=mip_arc_projection_private.expand(proposed);
 proposed.access_version:=(expanded->'manifest'->>'source_access_version')::integer;
 proposed.dependency_manifest:=expanded->'manifest';proposed.display_payload:=expanded->'display';
 proposed.dependency_hash:=mip_arc_projection_private.hash_json(proposed.dependency_manifest);
 proposed.display_hash:=mip_arc_projection_private.hash_json(proposed.display_payload);
 select * into old from mip_arc_projection_private.projections where scope=s and id=i;
 if found then
  if old.dependency_manifest<>proposed.dependency_manifest or old.display_payload<>proposed.display_payload
  then raise exception 'arc_projection_retry_conflict';end if;
  return mip_arc_projection_private.receipt(old);
 end if;
 insert into mip_arc_projection_private.projections(scope,id,generation,input_hash,output_hash,score_review,binding,access_version,
 citation_review,context_review,dependency_manifest,dependency_hash,display_payload,display_hash)
 values(s,i,g,ih,oh,sr,b,proposed.access_version,cite,ctx,proposed.dependency_manifest,proposed.dependency_hash,proposed.display_payload,proposed.display_hash);
 return mip_arc_projection_private.receipt(proposed);
exception when others then raise exception 'arc_projection_prepare_failed' using errcode='P0001',detail='',hint='';
end $prepare$;
create function mip_arc_projection_private.require_current(s uuid,i uuid,dh text,ph text)
returns mip_arc_projection_private.projections language plpgsql set search_path='' as $current$
declare p mip_arc_projection_private.projections;expanded jsonb;
begin
 select * into p from mip_arc_projection_private.projections where scope=s and id=i;
 if not found or p.dependency_hash is distinct from dh or p.display_hash is distinct from ph
 then raise exception 'arc_projection_missing';end if;
 expanded:=mip_arc_projection_private.expand(p);
 if expanded->'manifest' is distinct from p.dependency_manifest or expanded->'display' is distinct from p.display_payload
 or mip_arc_projection_private.hash_json(p.dependency_manifest)<>dh or mip_arc_projection_private.hash_json(p.display_payload)<>ph
 then raise exception 'arc_projection_stale';end if;
 return p;
end $current$;
create function mip_arc_projection_private.review(s uuid,i uuid,pid uuid,dh text,ph text,v integer,prev uuid,st text,why text)
returns uuid language plpgsql security definer set search_path='' as $review$
declare head mip_arc_projection_private.reviews;old mip_arc_projection_private.reviews;
begin
 perform mip_arc_projection_private.enter_scope(s,true);
 if i is null or pid is null or v is null or v<1 or st is null or why is null
 or not((st='pending_private' and why='awaiting_publication_contract')or(st='accepted_private' and why='reviewed_private_display')
 or(st='revoked' and why='revocation')) then raise exception 'arc_projection_review_shape';end if;
 perform mip_arc_projection_private.require_current(s,pid,dh,ph);
 select * into head from mip_arc_projection_private.reviews where scope=s and projection=pid order by version desc limit 1;
 select * into old from mip_arc_projection_private.reviews where scope=s and id=i;
 if found then
  if (old.projection,old.dependency_hash,old.display_hash,old.version,old.predecessor,old.disposition,old.reason)
  is distinct from(pid,dh,ph,v,prev,st,why) or head.id<>i then raise exception 'arc_projection_review_retry';end if;return i;
 end if;
 if prev is distinct from head.id or v<>coalesce(head.version,0)+1 then raise exception 'arc_projection_review_predecessor';end if;
 insert into mip_arc_projection_private.reviews(scope,id,projection,version,predecessor,dependency_hash,display_hash,disposition,reason)
 values(s,i,pid,v,prev,dh,ph,st,why);return i;
exception when others then raise exception 'arc_projection_review_failed' using errcode='P0001',detail='',hint='';
end $review$;
create function mip_arc_projection_private.read_current(s uuid,i uuid,dh text,ph text,review_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $read$
declare p mip_arc_projection_private.projections;head mip_arc_projection_private.reviews;
begin
 perform mip_arc_projection_private.enter_scope(s,false);
 p:=mip_arc_projection_private.require_current(s,i,dh,ph);
 select * into head from mip_arc_projection_private.reviews where scope=s and projection=i order by version desc limit 1;
 if not found or head.id is distinct from review_id or head.disposition='revoked' then raise exception 'arc_projection_review_stale';end if;
 return jsonb_build_object('receipt',mip_arc_projection_private.receipt(p),'review',jsonb_build_object(
 'review_id',head.id,'version',head.version,'disposition',head.disposition,'reason',head.reason),
 'display',p.display_payload,'approval_allowed',false,'publication_allowed',false,'attached',false);
exception when others then raise exception 'arc_projection_read_failed' using errcode='P0001',detail='',hint='';
end $read$;

create function mip_arc_projection_private.inspect_context(s uuid,a uuid) returns jsonb
language plpgsql security definer set search_path='' as $inspect$
declare c jsonb;
begin
 perform mip_arc_projection_private.enter_scope(s,true);
 c:=mip_arc_projection_private.current_context(a);
 return jsonb_build_object('context',c,'context_hash',mip_arc_projection_private.hash_json(c),
 'publication_allowed',false);
exception when others then raise exception 'arc_projection_inspect_failed' using errcode='P0001',detail='',hint='';
end $inspect$;

-- Explicit native source-authority successor v2; original 001 source unchanged.
create or replace function mip_arc_native.assert_source_authority() returns void language plpgsql set search_path='' as $authority$
declare rel regclass;pol text;cols text[];a record;owner_oid oid:='mip_arc_native_owner'::regrole;
begin
 for rel,pol,cols in select * from(values
 ('public.articles'::regclass,'arc_native_articles',array['id','arc_id','reader_state','source_status']),
 ('public.story_arcs'::regclass,'arc_native_arcs',array['id','title','summary','started_at','last_update_at','category','root_node_id']),
 ('public.nodes'::regclass,'arc_private_projection_nodes',array['id','type']),
 ('public.arc_milestones'::regclass,'arc_private_projection_milestones',array['id','arc_id','milestone_key','status']),
 ('public.arc_membership_candidates'::regclass,'arc_native_candidates',array['id','article_id','arc_id','state','updated_at']),
 ('evidence_pipeline.article_captures'::regclass,'arc_native_captures',array['id','job_id','article_id','content_hash','payload','captured_at']),
 ('evidence_pipeline.import_jobs'::regclass,'arc_native_jobs',array['id','article_id','input_hash','state']),
 ('mip_identity.source_changes'::regclass,'arc_native_source_changes',array['id','relation_name','native_retention_version','operation','before_identity','after_identity','before_hash','after_hash']))v(rel,pol,cols)
 loop
  if not exists(select 1 from pg_class where oid=rel and relkind='r' and relrowsecurity and relowner<>owner_oid)
   or not exists(select 1 from pg_policy where polrelid=rel and polname=pol and polpermissive and polcmd='r'
    and polroles=array[owner_oid] and pg_get_expr(polqual,polrelid)='true')
   or exists(select 1 from pg_policy where polrelid=rel and not polpermissive and polcmd in('r','*')
    and (0=any(polroles) or owner_oid=any(polroles)))
   or has_table_privilege(owner_oid,rel,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
   or has_any_column_privilege(owner_oid,rel,'INSERT,UPDATE,REFERENCES')
  then raise exception 'arc_native_source_authority';end if;
  for a in select attname from pg_attribute where attrelid=rel and attnum>0 and not attisdropped loop
   if has_column_privilege(owner_oid,rel,a.attname,'SELECT') is distinct from(a.attname=any(cols))
   then raise exception 'arc_native_source_columns';end if;
  end loop;
 end loop;
 if exists(select 1 from(values
 ('public.story_arcs'::regclass,'arc_native_arc_lock','mip_identity.collector_lock()'::regprocedure,62),
 ('public.arc_membership_candidates'::regclass,'arc_native_candidate_lock','mip_identity.collector_lock()'::regprocedure,62),
 ('public.story_arcs'::regclass,'arc_native_arc_revision','mip_arc_native.record_source_revision()'::regprocedure,29),
 ('public.arc_membership_candidates'::regclass,'arc_native_candidate_revision','mip_arc_native.record_source_revision()'::regprocedure,29))v(rel,n,f,t)
 where (select count(*) from pg_trigger where tgrelid=v.rel and tgname=v.n and tgfoid=v.f and tgtype=v.t
  and tgenabled='A' and tgqual is null and tgattr=''::int2vector and not tgisinternal)<>1)
 then raise exception 'arc_native_fence_boundary';end if;
 foreach rel in array array['evidence_pipeline.article_captures'::regclass,'evidence_pipeline.evidence_candidates'::regclass] loop
  if(select count(*) from pg_trigger where tgrelid=rel and tgfoid='mip_identity.collector_lock()'::regprocedure
    and tgtype=62 and tgenabled='O' and tgqual is null and not tgisinternal)<>1
   or(select count(*) from pg_trigger where tgrelid=rel and tgfoid='mip_identity.collector_native_change()'::regprocedure
    and tgtype=29 and tgenabled='O' and tgqual is null and not tgisinternal)<>1
  then raise exception 'arc_native_native_recorder_boundary';end if;
 end loop;
 if exists(select 1 from pg_auth_members where roleid=owner_oid or member=owner_oid)
 then raise exception 'arc_native_owner_membership';end if;
end $authority$;

do $storage$
declare n text;
begin
 foreach n in array array['source_bindings','source_access','citation_reviews','context_reviews','projections','reviews'] loop
  execute format('alter table mip_arc_projection_private.%I enable row level security',n);
  execute format('alter table mip_arc_projection_private.%I force row level security',n);
  execute format('create policy owner_only on mip_arc_projection_private.%I to mip_arc_native_owner using(true) with check(true)',n);
  if n<>'source_access' then
   execute format('create trigger immutable_rows before update or delete on mip_arc_projection_private.%I for each statement execute function mip_arc_native.immutable()',n);
   execute format('create trigger immutable_table before truncate on mip_arc_projection_private.%I for each statement execute function mip_arc_native.immutable()',n);
  end if;
 end loop;
end $storage$;
reset role;
-- Clear only new-schema provider defaults; no unrelated table/role ACL rewrites.
do $acl$
declare obj record;a record;
begin
 for obj in select oid,oid::regclass sig,relowner owner from pg_class where relnamespace='mip_arc_projection_private'::regnamespace and relkind='r' loop
  execute format('revoke all on table %s from public',obj.sig);
  for a in select distinct grantee from aclexplode((select relacl from pg_class where oid=obj.oid)) where grantee<>0 and grantee<>obj.owner loop
   execute format('revoke all on table %s from %I',obj.sig,a.grantee::regrole);
  end loop;
 end loop;
 for obj in select oid,oid::regprocedure sig,proowner owner from pg_proc where pronamespace='mip_arc_projection_private'::regnamespace loop
  execute format('revoke all on function %s from public',obj.sig);
  for a in select distinct grantee from aclexplode((select proacl from pg_proc where oid=obj.oid)) where grantee<>0 and grantee<>obj.owner loop
   execute format('revoke all on function %s from %I',obj.sig,a.grantee::regrole);
  end loop;
 end loop;
end $acl$;
grant usage on schema mip_arc_projection_private to mip_mentions_gateway;
grant execute on function
 mip_arc_projection_private.review_source(uuid,uuid,uuid,uuid,uuid,text,text,text,text),
 mip_arc_projection_private.set_source_access(uuid,uuid,boolean),
 mip_arc_projection_private.review_citations(uuid,uuid,uuid,integer,uuid,text,jsonb),
 mip_arc_projection_private.review_context(uuid,uuid,uuid,integer,uuid,text,text),
 mip_arc_projection_private.inspect_context(uuid,uuid),
 mip_arc_projection_private.prepare(uuid,uuid,uuid,text,text,uuid,uuid,uuid,uuid),
 mip_arc_projection_private.review(uuid,uuid,uuid,text,text,integer,uuid,text,text),
 mip_arc_projection_private.read_current(uuid,uuid,text,text,uuid)
 to mip_mentions_gateway;
revoke mip_arc_native_owner from current_user;

-- FINAL SUCCESSOR ASSERTION: includes unchanged combined003 closure verbatim
-- as a nested block, then this schema. Re-run this exact block after installer cleanup.
do $private_projection_final$
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
declare spec record;obj record;principal text;function_oid oid;allowed oid[];rel regclass;
 owner_oid oid:='mip_arc_native_owner'::regrole;
 principals text[]:=array['mip_mentions_owner','mip_mentions_gateway','mip_mentions_admin','mip_mentions_native_validator',
 'mip_arc_qik_source_owner','mip_canonical_writer','mip_arc_native_owner','mip_arc_native_worker','mip_arc_attachment_owner','anon','authenticated','service_role'];
begin
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
    and tgfoid='comparison_qualification.reject_rewrite()'::regprocedure and tgtype=34 and tgenabled='O'
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
  and tgname='no_collector_articles_truncate' and tgfoid='comparison_qualification.reject_rewrite()'::regprocedure
  and tgtype=34 and tgenabled='O' and tgqual is null and tgattr=''::int2vector
  and tgargs=''::bytea and not tgisinternal)<>1
 then raise exception 'arc_projection_article_recorder_boundary';end if;
 if not exists(select 1 from pg_trigger where tgrelid='mip_identity.source_changes'::regclass
  and tgname='immutable' and tgfoid='comparison_qualification.reject_rewrite()'::regprocedure
  and tgtype=27 and tgenabled='O' and tgqual is null and tgattr=''::int2vector and not tgisinternal)
 or not exists(select 1 from pg_trigger where tgrelid='mip_identity.source_changes'::regclass
  and tgname='no_truncate' and tgfoid='comparison_qualification.reject_rewrite()'::regprocedure
  and tgtype=34 and tgenabled='O' and tgqual is null and tgattr=''::int2vector and not tgisinternal)
 then raise exception 'arc_projection_change_cursor_boundary';end if;
 perform mip_arc_native.assert_source_authority();
end;
end $private_projection_final$;
commit;
