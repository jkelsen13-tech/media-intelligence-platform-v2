-- One-time, held qik audit-route maintenance successor. SOURCE ONLY until independently
-- qualified/reviewed and the provider temporarily grants UPDATE(connection_string)
-- to the existing postgres installer. Never run as part of installation.
-- No credential literal, Auth row, article material, or returned connection string.
do $qik_audit_route_v1$
declare
 old_uri text;
 new_uri text;
 ca_path text;
 changed_rows integer;
begin
 if current_user <> 'postgres' or session_user <> 'postgres' or current_database() <> 'postgres'
  or (select rolsuper from pg_catalog.pg_roles where rolname=current_user) is distinct from false
 then raise exception 'qik_audit_route_identity_refused'; end if;
 if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('qik-comparison-audit-v1',0))
 then raise exception 'qik_audit_route_inflight'; end if;
 if (select count(*) from mip_comparison_install.receipts
     where operation_id='a382dcdbf2924852b711b6a8b0c713eb'
       and manifest_sha256='221fb2f848b1bbea11e80057b0ad21e5349c8370a35531e2bdc48b6f95449320'
       and state='installed_disabled_audit_pending' and installer='postgres'
       and audit_login='mip_native_audit_v1') <> 1
   or (select count(*) from mip_native_activation.bootstrap
       where singleton and operation_id='a382dcdbf2924852b711b6a8b0c713eb'
       and install_manifest='221fb2f848b1bbea11e80057b0ad21e5349c8370a35531e2bdc48b6f95449320'
       and installer='postgres') <> 1
   or (select count(*) from mip_native_activation.head where singleton and revision is null) <> 1
   or exists(select 1 from mip_comparison_install.audit_qualifications)
 then raise exception 'qik_audit_route_state_refused'; end if;
 if not pg_catalog.has_column_privilege(current_user,'mip_factual.audit_connection','connection_string','SELECT')
    or not pg_catalog.has_column_privilege(current_user,'mip_factual.audit_connection','connection_string','UPDATE')
 then raise exception 'qik_audit_route_grant_missing'; end if;
 ca_path := pg_catalog.current_setting('ssl_ca_file',true);
 if ca_path is null or ca_path !~ '^/[A-Za-z0-9_./-]+$'
 then raise exception 'qik_audit_route_ca_refused'; end if;
 select connection_string into strict old_uri
 from mip_factual.audit_connection where id for update;
 if old_uri !~ '^postgresql://mip_native_audit_v1[.]qikvmopbtijoebdqosyq:[^@]+@aws-0-us-west-1[.]pooler[.]supabase[.]com:5432/postgres[?]'
   or pg_catalog.regexp_count(old_uri,'@') <> 1
   or pg_catalog.regexp_count(old_uri,'[?]') <> 1
   or pg_catalog.array_length(pg_catalog.string_to_array(pg_catalog.split_part(old_uri,'?',2),'&'),1) <> 3
   or not pg_catalog.string_to_array(pg_catalog.split_part(old_uri,'?',2),'&')
      @> array['sslrootcert=system','sslmode=verify-full','connect_timeout=5']
 then raise exception 'qik_audit_route_source_refused'; end if;
 new_uri := pg_catalog.replace(
  pg_catalog.replace(
   pg_catalog.replace(old_uri,
    'postgresql://mip_native_audit_v1.qikvmopbtijoebdqosyq:',
    'postgresql://mip_native_audit_v1:'),
   '@aws-0-us-west-1.pooler.supabase.com:5432/postgres?',
   '@db.qikvmopbtijoebdqosyq.supabase.co:5432/postgres?'),
  'sslrootcert=system',
  'sslrootcert='||pg_catalog.replace(ca_path,'/','%2F'));
 if new_uri = old_uri
   or new_uri !~ '^postgresql://mip_native_audit_v1:[^@]+@db[.]qikvmopbtijoebdqosyq[.]supabase[.]co:5432/postgres[?]'
   or pg_catalog.regexp_count(new_uri,'@') <> 1
   or pg_catalog.regexp_count(new_uri,'[?]') <> 1
   or pg_catalog.array_length(pg_catalog.string_to_array(pg_catalog.split_part(new_uri,'?',2),'&'),1) <> 3
   or not pg_catalog.string_to_array(pg_catalog.split_part(new_uri,'?',2),'&')
      @> array['sslrootcert='||pg_catalog.replace(ca_path,'/','%2F'),'sslmode=verify-full','connect_timeout=5']
 then raise exception 'qik_audit_route_target_refused'; end if;
 -- Authenticate the distinct auditor over the exact target before changing the row.
 if not exists(
   select 1 from mip_factual_transport_raw.dblink(
    new_uri,
    'select current_user::text,(select ssl from pg_catalog.pg_stat_ssl where pid=pg_catalog.pg_backend_pid())'
   ) as t(auditor text,tls boolean)
   where auditor='mip_native_audit_v1' and tls
 ) then raise exception 'qik_audit_route_probe_refused'; end if;
 update mip_factual.audit_connection
 set connection_string=new_uri where id and connection_string=old_uri;
 get diagnostics changed_rows = row_count;
 if changed_rows <> 1 then raise exception 'qik_audit_route_write_refused'; end if;
 -- No result or stored secret leaves this fixed, single-statement transaction.
end
$qik_audit_route_v1$;
