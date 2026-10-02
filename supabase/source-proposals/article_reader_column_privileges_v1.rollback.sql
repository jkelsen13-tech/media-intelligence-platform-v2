-- SOURCE ROLLBACK PROPOSAL ONLY. Not applied. Separate review/execution required.
-- WARNING: restores the original whole-table ordinary-reader SELECT privilege,
-- including raw articles.claims. It reopens the known extraction boundary gap.
-- Supply exact fresh post-proposal catalog as mip.article_reader_acl_expected_catalog.
-- Restore only this package's owner-granted SELECT changes; no CASCADE/row writes.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local search_path=pg_catalog;
lock table public.articles in share row exclusive mode;
do $proposal$
declare expected_text text := current_setting('mip.article_reader_acl_expected_catalog',true); actual jsonb; r text; column_row record;
begin
  if expected_text is null or expected_text='' then raise exception 'article rollback requires exact reviewed post-proposal baseline'; end if;
  -- BEGIN BASELINE QUERY
  select jsonb_build_object(
    'owner', pg_get_userbyid(c.relowner), 'acl', c.relacl::text,
    'row_security', c.relrowsecurity, 'force_row_security', c.relforcerowsecurity,
    'columns', (select jsonb_agg(jsonb_build_object('name', a.attname,
      'type', format_type(a.atttypid,a.atttypmod), 'not_null', a.attnotnull,
      'acl', a.attacl::text, 'default', pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
      from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
    'constraints', (select coalesce(jsonb_agg(jsonb_build_object('name', conname,
      'definition', pg_get_constraintdef(oid), 'validated', convalidated) order by conname),'[]'::jsonb)
      from pg_constraint where conrelid=c.oid),
    'policies', (select coalesce(jsonb_agg(jsonb_build_object('name',polname,
      'command',polcmd,'roles',polroles::text,'permissive',polpermissive,
      'using',pg_get_expr(polqual,polrelid),'check',pg_get_expr(polwithcheck,polrelid)) order by polname),'[]'::jsonb)
      from pg_policy where polrelid=c.oid),
    'reader_roles', (select jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper,
      'bypass_rls',rolbypassrls,'inherit',rolinherit) order by rolname)
      from pg_roles where rolname in ('anon','authenticated')),
    'reader_memberships', (select coalesce(jsonb_agg(jsonb_build_object('reader',reader.rolname,
      'member_of',parent.rolname) order by reader.rolname,parent.rolname),'[]'::jsonb)
      from pg_roles reader cross join pg_roles parent where reader.rolname in ('anon','authenticated')
      and reader.oid<>parent.oid and pg_has_role(reader.oid,parent.oid,'MEMBER')),
    'triggers', (select coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,
      'definition',pg_get_triggerdef(t.oid),'function',pg_get_functiondef(t.tgfoid),
      'function_owner',pg_get_userbyid(p.proowner),'function_acl',p.proacl::text) order by t.tgname),'[]'::jsonb)
      from pg_trigger t join pg_proc p on p.oid=t.tgfoid where t.tgrelid=c.oid and not t.tgisinternal),
    'governed_views', (select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',v.relname,
      'owner',pg_get_userbyid(v.relowner),'acl',v.relacl::text,'options',to_jsonb(v.reloptions),
      'definition',pg_get_viewdef(v.oid,true)) order by n.nspname,v.relname)
      from pg_class v join pg_namespace n on n.oid=v.relnamespace where v.relkind='v'
      and ((n.nspname='public' and v.relname in ('news_detail_public','comparison_public','graph_coverage_public'))
        or (n.nspname='mip_private' and v.relname='reader_claim_surfaces')))
  ) into actual from pg_class c where c.oid='public.articles'::regclass;
  -- END BASELINE QUERY
  if actual is distinct from expected_text::jsonb then raise exception 'article rollback catalog baseline drift'; end if;
  if actual->>'owner' is distinct from current_user or actual->>'row_security' is distinct from 'true' then
    raise exception 'article rollback requires verified owner and RLS'; end if;
  foreach r in array array['anon','authenticated'] loop
    if has_table_privilege(r,'public.articles','SELECT') then raise exception 'article rollback unexpected table SELECT'; end if;
    for column_row in select attname from pg_attribute where attrelid='public.articles'::regclass and attnum>0 and not attisdropped loop
      if has_column_privilege(r,'public.articles',column_row.attname,'SELECT') is distinct from
        (column_row.attname=any(array['id','feed','outlet','title','url','summary','body_text','published_at','fetched_at',
          'reader_state','source_status','arc_id','author_id','monoculture','unattributed'])) then
        raise exception 'article rollback effective privilege prerequisite mismatch'; end if;
    end loop;
  end loop;
  if exists(select 1 from pg_attribute a cross join lateral aclexplode(a.attacl) x
    where a.attrelid='public.articles'::regclass and a.attnum>0 and not a.attisdropped and x.privilege_type='SELECT'
    and x.grantee in (select oid from pg_roles where rolname in ('anon','authenticated'))
    and (x.grantor<>(select relowner from pg_class where oid='public.articles'::regclass) or x.is_grantable)) then
    raise exception 'article rollback unsupported column grantor/option'; end if;
end
$proposal$;
revoke select(id,feed,outlet,title,url,summary,body_text,published_at,fetched_at,
 reader_state,source_status,arc_id,author_id,monoculture,unattributed) on table public.articles from anon,authenticated;
grant select on table public.articles to anon,authenticated;
do $proposal$
begin
  if not has_table_privilege('anon','public.articles','SELECT') or not has_table_privilege('authenticated','public.articles','SELECT') then
    raise exception 'article rollback original effective table SELECT missing'; end if;
end
$proposal$;
commit;
