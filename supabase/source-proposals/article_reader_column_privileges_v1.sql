-- SOURCE PROPOSAL ONLY. Not applied; not a recorded migration or live approval.
-- Execute after the already-recorded article/public-reader migrations, never by
-- replaying those migrations. A fresh reviewed metadata-only baseline must be
-- supplied in mip.article_reader_acl_expected_catalog using the query below.
-- Only the verified table owner may execute. Missing/drifted baseline aborts.
-- Existing browser consumers need these 15 source/filter columns. Raw claims
-- and all other columns receive no ordinary-reader SELECT grant. No CASCADE,
-- policy/owner/view/function changes, private capture exposure, or row writes.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local search_path = pg_catalog;
lock table public.articles in share row exclusive mode;

do $proposal$
declare
  expected_text text := current_setting('mip.article_reader_acl_expected_catalog', true);
  actual jsonb;
  r record;
begin
  if expected_text is null or expected_text = '' then
    raise exception 'article reader column proposal requires exact reviewed catalog baseline';
  end if;
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
  if actual is distinct from expected_text::jsonb then
    raise exception 'article reader column proposal catalog baseline drift';
  end if;
  if actual->>'owner' is distinct from current_user or actual->>'row_security' is distinct from 'true' then
    raise exception 'article reader column proposal requires verified owner and enabled RLS';
  end if;
  for r in select * from (values
    ('id','uuid'),('feed','text'),('outlet','text'),('title','text'),('url','text'),
    ('summary','text'),('body_text','text'),('published_at','timestamp with time zone'),
    ('fetched_at','timestamp with time zone'),('reader_state','text'),('source_status','text'),
    ('arc_id','uuid'),('author_id','uuid'),('monoculture','boolean'),('unattributed','boolean'),('claims','jsonb')
  ) required(name,type) loop
    if not exists(select 1 from jsonb_array_elements(actual->'columns') col
      where col->>'name'=r.name and col->>'type'=r.type) then
      raise exception 'article reader column proposal unsupported column %',r.name;
    end if;
  end loop;
  if not exists(select 1 from jsonb_array_elements(actual->'columns') col
    where col->>'name'='claims' and col->>'not_null'='true') then
    raise exception 'article reader column proposal claims catalog prerequisite missing';
  end if;
  for r in select oid,rolname,rolsuper,rolbypassrls from pg_roles where rolname in ('anon','authenticated') loop
    if r.rolsuper or r.rolbypassrls
      or not has_table_privilege(r.oid,'public.articles','SELECT') then
      raise exception 'article reader column proposal unsupported reader authority %',r.rolname;
    end if;
    if not exists(select 1 from aclexplode((select relacl from pg_class where oid='public.articles'::regclass)) x
      where x.grantee=r.oid and x.privilege_type='SELECT' and x.grantor=(select relowner from pg_class where oid='public.articles'::regclass)
      and not x.is_grantable)
      or exists(select 1 from aclexplode((select relacl from pg_class where oid='public.articles'::regclass)) x
        where x.grantee=r.oid and x.privilege_type='SELECT' and (x.grantor<>(select relowner from pg_class where oid='public.articles'::regclass) or x.is_grantable)) then
      raise exception 'article reader column proposal unsupported SELECT grantor/option %',r.rolname;
    end if;
    if exists(select 1 from pg_attribute a cross join lateral aclexplode(a.attacl) x
      where a.attrelid='public.articles'::regclass and a.attnum>0 and not a.attisdropped
      and x.privilege_type='SELECT' and x.grantee in (0,r.oid)) then
      raise exception 'article reader column proposal unexpected existing column SELECT';
    end if;
    if not exists(select 1 from pg_policy p where p.polrelid='public.articles'::regclass
      and p.polcmd in ('r','*') and (0=any(p.polroles) or exists(select 1 from unnest(p.polroles) policy_role where pg_has_role(r.oid,policy_role,'MEMBER'))))
      or exists(select 1 from pg_policy p where p.polrelid='public.articles'::regclass
        and p.polcmd in ('r','*') and (0=any(p.polroles) or exists(select 1 from unnest(p.polroles) policy_role where pg_has_role(r.oid,policy_role,'MEMBER')))
        and regexp_replace(pg_get_expr(p.polqual,p.polrelid),'[[:space:]()]','','g')
          is distinct from 'reader_state=''eligible''::textANDsource_status=''active''::text') then
      raise exception 'article reader column proposal unsupported reader RLS policy';
    end if;
  end loop;
  if exists(select 1 from aclexplode((select relacl from pg_class where oid='public.articles'::regclass)) x
    where x.grantee=0 and x.privilege_type='SELECT') then
    raise exception 'article reader column proposal unexpected PUBLIC SELECT';
  end if;
end
$proposal$;

revoke select on table public.articles from anon, authenticated;
grant select(id,feed,outlet,title,url,summary,body_text,published_at,fetched_at,
  reader_state,source_status,arc_id,author_id,monoculture,unattributed)
  on table public.articles to anon, authenticated;

do $proposal$
declare r text; a record;
begin
  foreach r in array array['anon','authenticated'] loop
    if has_table_privilege(r,'public.articles','SELECT') then
      raise exception 'article reader column proposal table SELECT remains; grantor/inheritance review required';
    end if;
    for a in select attname from pg_attribute where attrelid='public.articles'::regclass and attnum>0 and not attisdropped loop
      if has_column_privilege(r,'public.articles',a.attname,'SELECT') is distinct from
        (a.attname=any(array['id','feed','outlet','title','url','summary','body_text','published_at','fetched_at',
          'reader_state','source_status','arc_id','author_id','monoculture','unattributed'])) then
        raise exception 'article reader column proposal effective column privilege mismatch: %.%',r,a.attname;
      end if;
    end loop;
  end loop;
end
$proposal$;
commit;
