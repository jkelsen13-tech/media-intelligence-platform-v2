-- Isolated canonical source capture/coverage extension. Load after 018; no production activation.
begin;
set role mip_temporal_registry_owner;
create table mip_temporal.stream_configs(
 binding_id uuid primary key references mip_temporal.source_versions,
 publication_name name not null,baseline_lsn pg_lsn not null,
 bootstrap_hash text not null check(bootstrap_hash ~ '^[0-9a-f]{64}$')
);
create table mip_temporal.stream_heads(
 binding_id uuid primary key references mip_temporal.stream_configs,last_lsn pg_lsn not null,last_capture uuid
);
create table mip_temporal.stream_captures(
 id uuid primary key,binding_id uuid not null references mip_temporal.stream_configs,
 mapping_revision uuid not null,before_lsn pg_lsn not null,end_lsn pg_lsn not null,
 frame_hash text not null,frames jsonb not null,creator_xid xid8 not null,
 unique(binding_id,before_lsn),check(end_lsn>before_lsn)
);
create table mip_temporal.covered_permits(
 request_id uuid primary key references mip_temporal.advance_permits,capture_id uuid not null unique references mip_temporal.stream_captures
);
create table mip_temporal.stream_checkpoints(
 capture_id uuid primary key references mip_temporal.stream_captures,
 before_lsn pg_lsn not null,end_lsn pg_lsn not null,predecessor uuid,receipt jsonb not null
);
do $rls$
declare t text;
begin
 foreach t in array array['stream_configs','stream_heads','stream_captures','covered_permits','stream_checkpoints'] loop
  execute format('alter table mip_temporal.%I enable row level security',t);
  execute format('alter table mip_temporal.%I force row level security',t);
  execute format('create policy advancer on mip_temporal.%I to mip_temporal_advance_owner using(true) with check(true)',t);
 end loop;
end $rls$;
reset role;
grant select on mip_temporal.stream_configs to mip_temporal_advance_owner;
grant select,insert on mip_temporal.stream_captures,mip_temporal.covered_permits,mip_temporal.stream_checkpoints to mip_temporal_advance_owner;
grant select,update on mip_temporal.stream_heads to mip_temporal_advance_owner;
grant execute on function mip_temporal.prepare_advance(uuid,uuid,uuid,uuid,uuid,pg_lsn,text) to mip_temporal_advance_owner;
create function mip_temporal.check_stream(p_session uuid,p_binding uuid)
returns mip_temporal.source_versions language plpgsql security definer set search_path='' as $$
declare v mip_temporal.source_versions;s mip_temporal.stream_configs;
begin
 v:=mip_temporal.authorize_binding(p_session,p_binding);
 perform pg_advisory_xact_lock(hashtextextended('mip-temporal-slot:'||v.slot_name::text,0));
 v:=mip_temporal.authorize_binding(p_session,p_binding);
 select * into s from mip_temporal.stream_configs where binding_id=p_binding;
 if not found then raise exception 'mip_coverage_config_missing';end if;
 perform 1 from mip_temporal.stream_heads where binding_id=p_binding for update;
 if not found then raise exception 'mip_coverage_head_missing';end if;
 if not exists(select 1 from pg_catalog.pg_publication where pubname=s.publication_name and pubinsert
  and not pubupdate and not pubdelete and not pubtruncate and not puballtables and not pubviaroot)
 or (select count(*) from pg_catalog.pg_publication_tables where pubname=s.publication_name)<>1
 or not exists(select 1 from pg_catalog.pg_publication_tables where pubname=s.publication_name
  and schemaname='mip_hypothesis' and tablename='revision_transactions'
  and attnames::text[]=array['revision_id','epoch','creator_xid'] and rowfilter is null) then
  raise exception 'mip_coverage_publication_denied';
 end if;
 return v;
end $$;
create function mip_temporal.capture_next(p_session uuid,p_binding uuid,p_before pg_lsn,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v mip_temporal.source_versions;s mip_temporal.stream_configs;h mip_temporal.stream_heads;
 c mip_temporal.stream_captures;m uuid;actual pg_lsn;last bytea;item record;
 data jsonb:='[]';joined text:='';n integer:=0;bytes bigint:=0;hex text;ending pg_lsn;
begin
 v:=mip_temporal.check_stream(p_session,p_binding);
 select * into s from mip_temporal.stream_configs where binding_id=p_binding;
 select * into h from mip_temporal.stream_heads where binding_id=p_binding;
 select confirmed_flush_lsn into actual from pg_catalog.pg_replication_slots where slot_name=v.slot_name;
 m:=(mip_identity.current_mapping(v.runtime,'mip_comparison_producer_v1')).revision;
 if p_request is null or p_before is null then raise exception 'mip_coverage_request_denied';end if;
 select * into c from mip_temporal.stream_captures where id=p_request;
 if found then
  if c.binding_id<>p_binding or c.before_lsn<>p_before or c.mapping_revision<>m then raise exception 'mip_coverage_request_conflict';end if;
  if ((h.last_lsn=c.before_lsn and actual in(c.before_lsn,c.end_lsn))
   or (h.last_lsn>=c.end_lsn and actual=h.last_lsn and exists(select 1 from mip_temporal.stream_checkpoints where capture_id=c.id))) is not true
   then raise exception 'mip_coverage_position_gap';end if;
 else
  if h.last_lsn<>p_before or actual is distinct from h.last_lsn then raise exception 'mip_coverage_position_gap';end if;
  if exists(select 1 from mip_temporal.stream_captures where binding_id=p_binding and before_lsn=p_before) then raise exception 'mip_coverage_request_conflict';end if;
  for item in select x.data from pg_catalog.pg_logical_slot_peek_binary_changes(v.slot_name,null,1,
   'proto_version','1','publication_names',s.publication_name::text,'binary','false','streaming','false','messages','false')
   with ordinality as x(lsn,xid,data,sequence) order by x.sequence loop
   n:=n+1;bytes:=bytes+octet_length(item.data);
   if n>100003 or bytes>16777216 or octet_length(item.data)>4096 or octet_length(item.data)=0 then raise exception 'mip_coverage_delivery_limit';end if;
   if n=1 and get_byte(item.data,0)<>66 then raise exception 'mip_coverage_protocol_denied';end if;
   hex:=encode(item.data,'hex');data:=data||jsonb_build_array(hex);
   joined:=joined||case when n>1 then E'\n' else '' end||hex;last:=item.data;
  end loop;
  perform mip_temporal.check_stream(p_session,p_binding);
  if n=0 then return jsonb_build_object('state','no_revision_transaction_observed','covered_through',h.last_lsn::text,'historical_time_qualified',false);end if;
  if get_byte(last,0)<>67 or octet_length(last)<>26 then raise exception 'mip_coverage_protocol_denied';end if;
  hex:=encode(substring(last from 11 for 8),'hex');
  ending:=(substring(hex from 1 for 8)||'/'||substring(hex from 9 for 8))::pg_lsn;
  insert into mip_temporal.stream_captures values(p_request,p_binding,m,p_before,ending,
   encode(sha256(convert_to(joined,'UTF8')),'hex'),data,pg_current_xact_id()) returning * into c;
 end if;
 return jsonb_build_object('schema','mip_source_capture_v1','id',c.id,'binding_id',p_binding,
  'source_id',v.source_id,'stream_epoch',v.stream_epoch,'observation_epoch',v.observation_epoch,
  'bootstrap_hash',s.bootstrap_hash,'before_lsn',c.before_lsn::text,'end_lsn',c.end_lsn::text,
  'frame_hash',c.frame_hash,'frames',c.frames);
end $$;
create function mip_temporal.prepare_covered_advance(p_session uuid,p_capture uuid,p_request uuid,p_source uuid,p_stream uuid,
 p_end pg_lsn,p_bootstrap text,p_frames text,p_delivery text) returns uuid
 language plpgsql security definer set search_path='' as $$
declare c mip_temporal.stream_captures;v mip_temporal.source_versions;s mip_temporal.stream_configs;
 h mip_temporal.stream_heads;m uuid;actual pg_lsn;old uuid;
begin
 select * into c from mip_temporal.stream_captures where id=p_capture;
 if not found or c.creator_xid=pg_current_xact_id() then raise exception 'mip_coverage_committed_capture_required';end if;
 v:=mip_temporal.check_stream(p_session,c.binding_id);
 select * into s from mip_temporal.stream_configs where binding_id=c.binding_id;
 select * into h from mip_temporal.stream_heads where binding_id=c.binding_id;
 select confirmed_flush_lsn into actual from pg_catalog.pg_replication_slots where slot_name=v.slot_name;
 m:=(mip_identity.current_mapping(v.runtime,'mip_comparison_producer_v1')).revision;
 if c.mapping_revision<>m or p_source is distinct from v.source_id or p_stream is distinct from v.stream_epoch
 or p_end is distinct from c.end_lsn or p_bootstrap is distinct from s.bootstrap_hash or p_frames is distinct from c.frame_hash then
  raise exception 'mip_coverage_capture_mismatch';
 end if;
 if ((h.last_lsn=c.before_lsn and actual in(c.before_lsn,c.end_lsn))
  or (h.last_lsn>=c.end_lsn and actual=h.last_lsn and exists(select 1 from mip_temporal.stream_checkpoints where capture_id=c.id))) is not true
  then raise exception 'mip_coverage_position_gap';end if;
 perform mip_temporal.prepare_advance(p_session,c.binding_id,p_source,p_stream,p_request,c.end_lsn,p_delivery);
 select capture_id into old from mip_temporal.covered_permits where request_id=p_request;
 if found and old<>p_capture then raise exception 'mip_coverage_request_conflict';end if;
 insert into mip_temporal.covered_permits values(p_request,p_capture) on conflict(request_id) do nothing;
 return p_request;
end $$;
create function mip_temporal.advance_covered(p_session uuid,p_request uuid) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare c mip_temporal.stream_captures;v mip_temporal.source_versions;h mip_temporal.stream_heads;
 actual pg_lsn;result jsonb;m uuid;
begin
 select c1.* into c from mip_temporal.covered_permits p join mip_temporal.stream_captures c1 on c1.id=p.capture_id where p.request_id=p_request;
 if not found then raise exception 'mip_coverage_permit_required';end if;
 v:=mip_temporal.check_stream(p_session,c.binding_id);
 m:=(mip_identity.current_mapping(v.runtime,'mip_comparison_producer_v1')).revision;
 if c.mapping_revision<>m then raise exception 'mip_coverage_capture_mismatch';end if;
 select * into h from mip_temporal.stream_heads where binding_id=c.binding_id;
 select confirmed_flush_lsn into actual from pg_catalog.pg_replication_slots where slot_name=v.slot_name;
 select receipt into result from mip_temporal.stream_checkpoints where capture_id=c.id;
 if found then
  if actual is distinct from h.last_lsn then raise exception 'mip_coverage_position_gap';end if;
  return result;
 end if;
 if h.last_lsn<>c.before_lsn or actual is null or actual not in(c.before_lsn,c.end_lsn) then raise exception 'mip_coverage_position_gap';end if;
 result:=mip_temporal.advance(p_session,p_request)||jsonb_build_object('capture_id',c.id,
  'covered_from',c.before_lsn::text,'covered_through',c.end_lsn::text,'frame_hash',c.frame_hash);
 insert into mip_temporal.stream_checkpoints values(c.id,c.before_lsn,c.end_lsn,h.last_capture,result);
 update mip_temporal.stream_heads set last_lsn=c.end_lsn,last_capture=c.id where binding_id=c.binding_id;
 return result;
end $$;
do $owners$
declare r record;
begin
 for r in select p.oid::regprocedure::text signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='mip_temporal' and p.proname in('check_stream','capture_next','prepare_covered_advance','advance_covered') loop
  execute 'alter function '||r.signature||' owner to mip_temporal_advance_owner';
  execute 'revoke all on function '||r.signature||' from public,anon,authenticated,service_role';
 end loop;
end $owners$;
grant execute on function mip_temporal.capture_next(uuid,uuid,pg_lsn,uuid),
 mip_temporal.prepare_covered_advance(uuid,uuid,uuid,uuid,uuid,pg_lsn,text,text,text) to mip_temporal_recorder;
grant execute on function mip_temporal.advance_covered(uuid,uuid) to mip_temporal_ack_gateway;
-- The current consumer cannot bypass the coverage path through the preceding unbound interface.
revoke execute on function mip_temporal.prepare_advance(uuid,uuid,uuid,uuid,uuid,pg_lsn,text) from mip_temporal_recorder;
revoke execute on function mip_temporal.advance(uuid,uuid) from mip_temporal_ack_gateway;
do $immutable$
declare t text;
begin
 foreach t in array array['stream_configs','stream_captures','covered_permits','stream_checkpoints'] loop
  execute format('create trigger immutable_rows before update or delete on mip_temporal.%I for each row execute function mip_hypothesis.reject_mutation()',t);
  execute format('create trigger immutable_table before truncate on mip_temporal.%I for each statement execute function mip_hypothesis.reject_mutation()',t);
 end loop;
end $immutable$;
commit;
