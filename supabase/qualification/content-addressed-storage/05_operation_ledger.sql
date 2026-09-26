-- Record objects created by 001_store.sql. Not a second evidence store.
begin;
create schema mip_cas_source_install;
revoke all on schema mip_cas_source_install from public;
create table mip_cas_source_install.objects (
  kind text not null check (kind in ('schema','role','table','function')),
  identity text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (kind, identity)
);
insert into mip_cas_source_install.objects(kind, identity)
values
  ('schema','mip_cas'),
  ('schema','mip_cas_source_install'),
  ('role','mip_cas_owner'),
  ('role','mip_cas_gateway'),
  ('role','mip_cas_codec_verifier');
insert into mip_cas_source_install.objects(kind, identity)
select 'table', n.nspname||'.'||c.relname
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='mip_cas' and c.relkind='r';
insert into mip_cas_source_install.objects(kind, identity)
select 'function', n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='mip_cas';
create function mip_cas_source_install.refuse_external_dependents()
returns void language plpgsql as $$
declare extra text;
begin
  -- DROP FUNCTION CASCADE is not limited to mip_cas. Refuse any unapproved
  -- trigger, view, or function outside recorded package identities.
  select string_agg(fmt, ',' order by 1) into extra
  from (
    select n.nspname||'.'||c.relname||'.'||t.tgname as fmt
    from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    join pg_proc p on p.oid=t.tgfoid
    join pg_namespace pn on pn.oid=p.pronamespace
    where pn.nspname='mip_cas'
      and not t.tgisinternal
      and not exists (
        select 1 from mip_cas_source_install.objects o
        where o.kind='table' and o.identity=n.nspname||'.'||c.relname
      )
    union
    select n.nspname||'.'||c.relname as fmt
    from pg_depend d
    join pg_rewrite r on r.oid=d.objid and d.classid='pg_rewrite'::regclass
    join pg_class c on c.oid=r.ev_class
    join pg_namespace n on n.oid=c.relnamespace
    join pg_proc p on p.oid=d.refobjid and d.refclassid='pg_proc'::regclass
    join pg_namespace pn on pn.oid=p.pronamespace
    where pn.nspname='mip_cas'
      and n.nspname is distinct from 'mip_cas'
      and d.deptype in ('n','a')
    union
    select n.nspname||'.'||p2.proname as fmt
    from pg_depend d
    join pg_proc p2 on p2.oid=d.objid and d.classid='pg_proc'::regclass
    join pg_namespace n on n.oid=p2.pronamespace
    join pg_proc p on p.oid=d.refobjid and d.refclassid='pg_proc'::regclass
    join pg_namespace pn on pn.oid=p.pronamespace
    where pn.nspname='mip_cas'
      and n.nspname is distinct from 'mip_cas'
      and d.deptype in ('n','a')
  ) deps;
  if extra is not null then
    raise exception 'mip_cas_unapproved_external_dependent:%', extra;
  end if;
end $$;

do $check$
begin
  if (select count(*) from mip_cas_source_install.objects where kind='table') < 1
     or (select count(*) from mip_cas_source_install.objects where kind='function') < 1 then
    raise exception 'mip_cas_ledger_empty';
  end if;
end
$check$;
commit;
