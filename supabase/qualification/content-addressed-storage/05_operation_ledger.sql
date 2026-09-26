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
do $check$
begin
  if (select count(*) from mip_cas_source_install.objects where kind='table') < 1
     or (select count(*) from mip_cas_source_install.objects where kind='function') < 1 then
    raise exception 'mip_cas_ledger_empty';
  end if;
end
$check$;
commit;
