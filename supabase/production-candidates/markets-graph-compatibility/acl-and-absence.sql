-- Included inside the disposable fixture transaction.
create temporary table market_positive_citation(id uuid primary key);
grant select on market_positive_citation to anon,authenticated;
with created as(
 insert into public.citations(article_id,cited_entity,cited_type,documentation_strength,resolved_node_id,public_eligible)
 select c.article_id,'EXPLICIT_PUBLIC_CITATION_SENTINEL',c.cited_type,c.documentation_strength,n.id,true
 from public.citations c join public.articles a on a.id=c.article_id
 cross join lateral(select id from public.nodes where not private_candidate order by id limit 1)n
 where a.reader_state='eligible' and a.source_status='active' limit 1 returning id
) insert into market_positive_citation select id from created;
do $$ begin
 if (select count(*) from market_positive_citation)<>1 then raise exception 'Positive citation fixture missing'; end if;
 if exists(select 1 from public.citations where cited_entity='PRIVATE_UNRESOLVED_SENTINEL' and public_eligible) then raise exception 'New citation default is not private'; end if;
 begin
  update public.citations set public_eligible=true where cited_entity='PRIVATE_UNRESOLVED_SENTINEL';
  raise exception 'Citation classification changed';
 exception when raise_exception then if sqlerrm<>'market_citation_classification_immutable' then raise; end if; end;
end $$;
create function pg_temp.market_verify_role() returns void language plpgsql security invoker as $$
declare name text; privilege text; statement text; command text; sqlstate_seen text;
begin
 if not exists(select 1 from public.citations c join market_positive_citation p on p.id=c.id) then raise exception 'Explicit public citation not visible'; end if;
 foreach name in array array['comparison_public','graph_coverage_public','spatial_projection_v1','investigation_surface_public'] loop
  if not has_table_privilege(current_user,'public.'||name,'SELECT') then raise exception 'Missing SELECT: %',name; end if;
  foreach privilege in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] loop
   if has_table_privilege(current_user,'public.'||name,privilege) then raise exception 'Unexpected view privilege: % %',name,privilege; end if;
  end loop;
  foreach command in array array['insert','update','delete'] loop
   statement:=case
    when name='comparison_public' and command='insert' then 'insert into public.comparison_public(canonical_title) values (''UNAUTHORIZED_WRITE_SENTINEL'')'
    when name='comparison_public' and command='update' then 'update public.comparison_public set canonical_title=canonical_title where false'
    when command='insert' then format('insert into public.%I default values',name)
    when command='update' then format('update public.%I set %I=%I where false',name,
      case name when 'investigation_surface_public' then 'event_label' when 'spatial_projection_v1' then 'spatial_role' else 'article_count' end,
      case name when 'investigation_surface_public' then 'event_label' when 'spatial_projection_v1' then 'spatial_role' else 'article_count' end)
    else format('delete from public.%I where false',name) end;
   sqlstate_seen:=null;
   begin execute statement;
   exception when others then get stacked diagnostics sqlstate_seen=returned_sqlstate; end;
   if name='comparison_public' and sqlstate_seen is distinct from '42501' then raise exception 'comparison DML must be ACL-denied: % %',command,sqlstate_seen; end if;
   if sqlstate_seen is null or sqlstate_seen not in('42501','55000','0A000') then raise exception 'DML was not denied as expected: % % %',name,command,sqlstate_seen; end if;
  end loop;
 end loop;
 if exists(select 1 from public.nodes where id in('f0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000002'))
 or exists(select 1 from public.edges where id in('f0000000-0000-0000-0000-000000000003','f0000000-0000-0000-0000-000000000004','f0000000-0000-0000-0000-000000000005'))
 or exists(select 1 from public.citations where cited_entity in('PRIVATE_MARKET_CITATION','PRIVATE_UNRESOLVED_SENTINEL','PUBLIC_UNRESOLVED_SENTINEL'))
 or exists(select 1 from public.node_topics where node_id='f0000000-0000-0000-0000-000000000002')
 or exists(select 1 from public.graph_event_article_memberships where event_node_id='f0000000-0000-0000-0000-000000000001')
 or exists(select 1 from public.spatial_projection_v1 where subject_graph_node_id='f0000000-0000-0000-0000-000000000001')
 or exists(select 1 from public.investigation_surface_public where canonical_event_id='f0000000-0000-0000-0000-000000000001')
 or exists(select 1 from public.comparison_public c,lateral jsonb_array_elements(c.articles) j where j->>'timeline_key'=right('evt-0000000000000000000000000000-private',8))
 then raise exception 'Individual private sentinel visible to %',current_user; end if;
 if exists(select 1 from public.citations where resolved_node_id is null) then raise exception 'Unresolved citation visible'; end if;
 if exists(select 1 from public.graph_coverage_public where pending_graph_candidate_count is not null) then raise exception 'Queue activity count visible'; end if;
end $$;
set local role anon;
select pg_temp.market_verify_role();
reset role;
set local role authenticated;
select pg_temp.market_verify_role();
reset role;
do $$
declare name text;
begin
 foreach name in array array['nodes','edges','citations','node_topics','graph_event_article_memberships'] loop
  if not (select relrowsecurity from pg_class where oid=to_regclass('public.'||name)) then raise exception 'Missing RLS: %',name; end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename=name and permissive='RESTRICTIVE' and cmd='SELECT' and roles @> array['anon','authenticated']::name[]) then raise exception 'Missing restrictive policy: %',name; end if;
 end loop;
 if not exists(select 1 from pg_trigger where tgrelid='public.edges'::regclass and tgname='market_graph_public_endpoints' and tgconstraint<>0 and tgenabled='O' and tgdeferrable and not tginitdeferred) then raise exception 'Missing enabled immediate constraint trigger'; end if;
 if (select reloptions from pg_class where oid='public.investigation_surface_public'::regclass) is distinct from array['security_invoker=true'] then raise exception 'Investigation options drift'; end if;
 if exists(select 1 from pg_depend d join pg_rewrite r on r.oid=d.objid where d.classid='pg_rewrite'::regclass and d.refobjid='public.cross_surface_candidates'::regclass and r.ev_class='public.graph_coverage_public'::regclass) then raise exception 'Coverage still depends on private queue'; end if;
end $$;
