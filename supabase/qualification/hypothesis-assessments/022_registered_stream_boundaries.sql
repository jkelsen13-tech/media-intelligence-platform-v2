-- Isolated registered boundary integration. Load after 020/021. No production admission.
begin;
set role mip_temporal_registry_owner;
create table mip_temporal.boundary_stream_configs(
 binding_id uuid primary key references mip_temporal.stream_configs,
 contract_digest text not null check(contract_digest ~ '^[0-9a-f]{64}$'),
 revision_relation oid not null,marker_relation oid not null
);
create table mip_temporal.boundary_issues(
 request_id uuid primary key,binding_id uuid not null references mip_temporal.boundary_stream_configs,
 incarnation_id uuid not null,mapping_revision uuid not null,contract_digest text not null,
 epoch uuid not null,creator_xid xid8 not null
);
create table mip_temporal.registered_stream_markers(
 marker_id uuid primary key references mip_temporal.boundary_issues,
 binding_id uuid not null,epoch uuid not null,creator_xid xid8 not null
);
create table mip_temporal.boundary_pending(
 binding_id uuid primary key references mip_temporal.boundary_stream_configs,
 request_id uuid not null unique references mip_temporal.boundary_issues
);
create table mip_temporal.boundary_capture_types(
 capture_id uuid primary key references mip_temporal.stream_captures,
 target_request uuid not null references mip_temporal.boundary_issues,
 kind text not null check(kind in('revision','marker'))
);
do $rls$
declare t text;
begin
 foreach t in array array['boundary_stream_configs','boundary_issues','registered_stream_markers','boundary_pending','boundary_capture_types'] loop
  execute format('alter table mip_temporal.%I enable row level security',t);
  execute format('alter table mip_temporal.%I force row level security',t);
  execute format('create policy advancer on mip_temporal.%I to mip_temporal_advance_owner using(true) with check(true)',t);
 end loop;
end $rls$;
reset role;
grant select on mip_temporal.boundary_stream_configs to mip_temporal_advance_owner;
grant select,insert on mip_temporal.boundary_issues,mip_temporal.registered_stream_markers,mip_temporal.boundary_capture_types to mip_temporal_advance_owner;
grant select,insert,delete on mip_temporal.boundary_pending to mip_temporal_advance_owner;

create function mip_temporal.check_boundary_stream(p_session uuid,p_binding uuid,p_incarnation uuid,p_digest text)
returns mip_temporal.source_versions language plpgsql security definer set search_path='' as $$
declare v mip_temporal.source_versions;s mip_temporal.stream_configs;c mip_temporal.boundary_stream_configs;
 expected_filter text;expected_digest text;
begin
 perform mip_temporal.require_incarnation(p_session,p_binding,p_incarnation);
 v:=mip_temporal.authorize_binding(p_session,p_binding);
 perform pg_advisory_xact_lock(hashtextextended('mip-temporal-slot:'||v.slot_name::text,0));
 perform mip_temporal.require_incarnation(p_session,p_binding,p_incarnation);
 select * into s from mip_temporal.stream_configs where binding_id=p_binding;
 select * into c from mip_temporal.boundary_stream_configs where binding_id=p_binding;
 if not found or p_digest is distinct from c.contract_digest then raise exception 'mip_boundary_contract_denied';end if;
 perform 1 from mip_temporal.stream_heads where binding_id=p_binding for update;
 if not found then raise exception 'mip_coverage_head_missing';end if;
 expected_filter:=format('(binding_id = %L::uuid)',p_binding);
 expected_digest:=encode(sha256(convert_to('mip-boundary-contract-v2|'||p_binding::text||'|'||s.publication_name::text||'|'||
  c.revision_relation::text||'|'||c.marker_relation::text||'|'||expected_filter,'UTF8')),'hex');
 if expected_digest<>c.contract_digest or c.revision_relation is distinct from (select r.oid from pg_catalog.pg_class r join pg_catalog.pg_namespace n on n.oid=r.relnamespace where n.nspname='mip_hypothesis' and r.relname='revision_transactions')
 or c.marker_relation is distinct from (select r.oid from pg_catalog.pg_class r join pg_catalog.pg_namespace n on n.oid=r.relnamespace where n.nspname='mip_temporal' and r.relname='registered_stream_markers')
 or not exists(select 1 from pg_catalog.pg_publication where pubname=s.publication_name and pubinsert
  and not pubupdate and not pubdelete and not pubtruncate and not puballtables and not pubviaroot)
 or (select count(*) from pg_catalog.pg_publication_tables where pubname=s.publication_name)<>2
 or not exists(select 1 from pg_catalog.pg_publication_tables where pubname=s.publication_name
  and schemaname='mip_hypothesis' and tablename='revision_transactions'
  and attnames::text[]=array['revision_id','epoch','creator_xid'] and rowfilter is null)
 or not exists(select 1 from pg_catalog.pg_publication_tables where pubname=s.publication_name
  and schemaname='mip_temporal' and tablename='registered_stream_markers'
  and attnames::text[]=array['marker_id','binding_id','epoch','creator_xid'] and rowfilter=expected_filter)
 then raise exception 'mip_boundary_publication_denied';end if;
 return v;
end $$;

create function mip_temporal.issue_boundary_marker(p_session uuid,p_binding uuid,p_incarnation uuid,p_digest text,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v mip_temporal.source_versions;i mip_temporal.boundary_issues;m uuid;
begin
 v:=mip_temporal.check_boundary_stream(p_session,p_binding,p_incarnation,p_digest);
 if p_request is null then raise exception 'mip_boundary_request_denied';end if;
 m:=(mip_identity.current_mapping(v.runtime,'mip_comparison_producer_v1')).revision;
 select * into i from mip_temporal.boundary_issues where request_id=p_request;
 if found then
  if i.binding_id<>p_binding or i.incarnation_id<>p_incarnation or i.mapping_revision<>m or i.contract_digest<>p_digest
  then raise exception 'mip_boundary_request_conflict';end if;
 else
  if exists(select 1 from mip_temporal.boundary_pending where binding_id=p_binding) then raise exception 'mip_boundary_pending_request';end if;
  insert into mip_temporal.boundary_issues values(p_request,p_binding,p_incarnation,m,p_digest,v.observation_epoch,pg_current_xact_id()) returning * into i;
  insert into mip_temporal.registered_stream_markers values(p_request,p_binding,i.epoch,i.creator_xid);
  insert into mip_temporal.boundary_pending values(p_binding,p_request);
 end if;
 return jsonb_build_object('schema','mip_boundary_issue_v2','marker_id',i.request_id,'binding_id',i.binding_id,
  'incarnation_id',i.incarnation_id,'contract_digest',i.contract_digest,'observation_epoch',i.epoch,
  'creator_xid',i.creator_xid::text,'historical_time_qualified',false);
end $$;

-- Exact server-native marker tuple check. No caller identity/time/LSN is accepted.
create function mip_temporal.boundary_marker_tuple(p_marker uuid,p_binding uuid,p_epoch uuid,p_xid xid8,p_relation oid)
returns bytea language sql immutable set search_path='' as $$
 select decode('49','hex')||oidsend(p_relation)||decode('4e','hex')||int2send(4::smallint)||
  decode('74','hex')||int4send(length(p_marker::text))||convert_to(p_marker::text,'UTF8')||
  decode('74','hex')||int4send(length(p_binding::text))||convert_to(p_binding::text,'UTF8')||
  decode('74','hex')||int4send(length(p_epoch::text))||convert_to(p_epoch::text,'UTF8')||
  decode('74','hex')||int4send(length(p_xid::text))||convert_to(p_xid::text,'UTF8')
$$;
create function mip_temporal.capture_boundary_incarnation(p_session uuid,p_binding uuid,p_incarnation uuid,p_digest text,p_before pg_lsn,p_request uuid,p_target uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v mip_temporal.source_versions;s mip_temporal.stream_configs;h mip_temporal.stream_heads;
 c mip_temporal.stream_captures;m uuid;actual pg_lsn;last bytea;item record;
 data jsonb:='[]';joined text:='';n integer:=0;bytes bigint:=0;hex text;ending pg_lsn;i mip_temporal.boundary_issues;k mip_temporal.boundary_capture_types;cfg mip_temporal.boundary_stream_configs;
 seen_marker boolean:=false;seen_revision boolean:=false;rid bigint;
begin
 v:=mip_temporal.check_boundary_stream(p_session,p_binding,p_incarnation,p_digest);
 select * into s from mip_temporal.stream_configs where binding_id=p_binding;
 select * into h from mip_temporal.stream_heads where binding_id=p_binding;
 select confirmed_flush_lsn into actual from pg_catalog.pg_replication_slots where slot_name=v.slot_name;
 m:=(mip_identity.current_mapping(v.runtime,'mip_comparison_producer_v1')).revision;
 select * into cfg from mip_temporal.boundary_stream_configs where binding_id=p_binding;
 select * into i from mip_temporal.boundary_issues where request_id=p_target;
 if not found or i.creator_xid=pg_current_xact_id() or i.binding_id<>p_binding or i.incarnation_id<>p_incarnation
 or i.contract_digest<>p_digest or i.mapping_revision<>m or i.epoch<>v.observation_epoch then raise exception 'mip_boundary_committed_issue_required';end if;
 if p_request is null or p_before is null then raise exception 'mip_coverage_request_denied';end if;
 select * into c from mip_temporal.stream_captures where id=p_request;
 if found then
  if c.binding_id<>p_binding or c.before_lsn<>p_before or c.mapping_revision<>m then raise exception 'mip_coverage_request_conflict';end if;
  if ((h.last_lsn=c.before_lsn and actual in(c.before_lsn,c.end_lsn))
   or (h.last_lsn>=c.end_lsn and actual=h.last_lsn and exists(select 1 from mip_temporal.stream_checkpoints where capture_id=c.id))) is not true
   then raise exception 'mip_coverage_position_gap';end if;
 else
  if not exists(select 1 from mip_temporal.boundary_pending where binding_id=p_binding and request_id=p_target)
   then raise exception 'mip_boundary_pending_required';end if;
  if h.last_lsn<>p_before or actual is distinct from h.last_lsn then raise exception 'mip_coverage_position_gap';end if;
  if exists(select 1 from mip_temporal.stream_captures where binding_id=p_binding and before_lsn=p_before) then raise exception 'mip_coverage_request_conflict';end if;
  for item in select x.data from pg_catalog.pg_logical_slot_peek_binary_changes(v.slot_name,null,1,
   'proto_version','1','publication_names',s.publication_name::text,'binary','false','streaming','false','messages','false')
   with ordinality as x(lsn,xid,data,sequence) order by x.sequence loop
   n:=n+1;bytes:=bytes+octet_length(item.data);
   if n>100003 or bytes>16777216 or octet_length(item.data)>4096 or octet_length(item.data)=0 then raise exception 'mip_coverage_delivery_limit';end if;
   if n=1 and get_byte(item.data,0)<>66 then raise exception 'mip_coverage_protocol_denied';end if;
   if get_byte(item.data,0)=73 then
    rid:=('x'||encode(substring(item.data from 2 for 4),'hex'))::bit(32)::bigint;
    if rid=cfg.marker_relation::bigint then seen_marker:=true;
     if item.data<>mip_temporal.boundary_marker_tuple(i.request_id,p_binding,i.epoch,i.creator_xid,cfg.marker_relation)
     then raise exception 'mip_boundary_marker_mismatch';end if;
    elsif rid=cfg.revision_relation::bigint then seen_revision:=true;
    else raise exception 'mip_boundary_relation_denied';end if;
   end if;
   hex:=encode(item.data,'hex');data:=data||jsonb_build_array(hex);
   joined:=joined||case when n>1 then E'\n' else '' end||hex;last:=item.data;
  end loop;
  perform mip_temporal.check_boundary_stream(p_session,p_binding,p_incarnation,p_digest);
  if n=0 then return jsonb_build_object('state','no_revision_transaction_observed','covered_through',h.last_lsn::text,'historical_time_qualified',false);end if;
  if get_byte(last,0)<>67 or octet_length(last)<>26 then raise exception 'mip_coverage_protocol_denied';end if;
  hex:=encode(substring(last from 11 for 8),'hex');
  ending:=(substring(hex from 1 for 8)||'/'||substring(hex from 9 for 8))::pg_lsn;
  if seen_marker then
   if seen_revision or n<>4 or get_byte(decode(data->>1,'hex'),0)<>82
    or octet_length(decode(data->>0,'hex'))<>21
    or substring(decode(data->>0,'hex') from 2 for 8)<>substring(last from 3 for 8)
    or substring(decode(data->>0,'hex') from 10 for 8)<>substring(last from 19 for 8)
    or ('x'||encode(substring(decode(data->>0,'hex') from 18 for 4),'hex'))::bit(32)::bigint<>(i.creator_xid::text::numeric%4294967296)::bigint
   then raise exception 'mip_boundary_marker_mismatch';end if;
  elsif not seen_revision then raise exception 'mip_boundary_empty_transaction';end if;
  insert into mip_temporal.stream_captures values(p_request,p_binding,m,p_before,ending,
   encode(sha256(convert_to(joined,'UTF8')),'hex'),data,pg_current_xact_id()) returning * into c;
  insert into mip_temporal.boundary_capture_types values(c.id,p_target,case when seen_marker then 'marker' else 'revision' end);
 end if;
 select * into k from mip_temporal.boundary_capture_types where capture_id=c.id;
 if not found or k.target_request<>p_target then raise exception 'mip_boundary_target_conflict';end if;
 return jsonb_build_object('schema','mip_source_boundary_capture_v2','id',c.id,'binding_id',p_binding,
  'source_id',v.source_id,'stream_epoch',v.stream_epoch,'observation_epoch',v.observation_epoch,
  'bootstrap_hash',s.bootstrap_hash,'before_lsn',c.before_lsn::text,'end_lsn',c.end_lsn::text,
  'frame_hash',c.frame_hash,'frames',c.frames,'kind',k.kind,'target_marker',p_target,
  'incarnation_id',p_incarnation,'contract_digest',p_digest,'marker_creator_xid',i.creator_xid::text);
end $$;
create function mip_temporal.prepare_boundary_incarnation(p_session uuid,p_capture uuid,p_incarnation uuid,p_digest text,p_target uuid,p_request uuid,p_source uuid,p_stream uuid,
 p_end pg_lsn,p_bootstrap text,p_frames text,p_delivery text) returns uuid
 language plpgsql security definer set search_path='' as $$
declare c mip_temporal.stream_captures;v mip_temporal.source_versions;s mip_temporal.stream_configs;
 h mip_temporal.stream_heads;m uuid;actual pg_lsn;old uuid;i mip_temporal.boundary_issues;k mip_temporal.boundary_capture_types;
begin
 select * into c from mip_temporal.stream_captures where id=p_capture;
 if not found or c.creator_xid=pg_current_xact_id() then raise exception 'mip_coverage_committed_capture_required';end if;
 v:=mip_temporal.check_boundary_stream(p_session,c.binding_id,p_incarnation,p_digest);
 select * into k from mip_temporal.boundary_capture_types where capture_id=c.id;
 if not found or k.target_request is distinct from p_target then raise exception 'mip_boundary_target_conflict';end if;
 select * into i from mip_temporal.boundary_issues where request_id=p_target;
 if not found or i.binding_id<>c.binding_id or i.incarnation_id<>p_incarnation or i.contract_digest<>p_digest
 or i.mapping_revision<>c.mapping_revision or i.epoch<>v.observation_epoch then raise exception 'mip_boundary_issue_denied';end if;
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
create function mip_temporal.advance_boundary_incarnation(p_session uuid,p_request uuid,p_incarnation uuid,p_digest text) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare c mip_temporal.stream_captures;v mip_temporal.source_versions;h mip_temporal.stream_heads;
 actual pg_lsn;result jsonb;m uuid;k mip_temporal.boundary_capture_types;i mip_temporal.boundary_issues;
begin
 select c1.* into c from mip_temporal.covered_permits p join mip_temporal.stream_captures c1 on c1.id=p.capture_id where p.request_id=p_request;
 if not found then raise exception 'mip_coverage_permit_required';end if;
 v:=mip_temporal.check_boundary_stream(p_session,c.binding_id,p_incarnation,p_digest);
 select * into k from mip_temporal.boundary_capture_types where capture_id=c.id;
 if not found then raise exception 'mip_boundary_target_conflict';end if;
 select * into i from mip_temporal.boundary_issues where request_id=k.target_request;
 if not found or i.binding_id<>c.binding_id or i.incarnation_id<>p_incarnation or i.contract_digest<>p_digest
 or i.mapping_revision<>c.mapping_revision or i.epoch<>v.observation_epoch then raise exception 'mip_boundary_issue_denied';end if;
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
  'covered_from',c.before_lsn::text,'covered_through',c.end_lsn::text,'frame_hash',c.frame_hash,'kind',k.kind,'target_marker',k.target_request,'contract_digest',p_digest);
 insert into mip_temporal.stream_checkpoints values(c.id,c.before_lsn,c.end_lsn,h.last_capture,result);
 update mip_temporal.stream_heads set last_lsn=c.end_lsn,last_capture=c.id where binding_id=c.binding_id;
 if k.kind='marker' then delete from mip_temporal.boundary_pending where binding_id=c.binding_id and request_id=k.target_request;end if;
 return result;
end $$;
do $owners$
declare r record;
begin
 for r in select p.oid::regprocedure::text signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='mip_temporal' and p.proname in('check_boundary_stream','issue_boundary_marker','boundary_marker_tuple',
 'capture_boundary_incarnation','prepare_boundary_incarnation','advance_boundary_incarnation') loop
  execute 'alter function '||r.signature||' owner to mip_temporal_advance_owner';
  execute 'revoke all on function '||r.signature||' from public,anon,authenticated,service_role';
 end loop;
end $owners$;
grant execute on function mip_temporal.issue_boundary_marker(uuid,uuid,uuid,text,uuid),
 mip_temporal.capture_boundary_incarnation(uuid,uuid,uuid,text,pg_lsn,uuid,uuid),
 mip_temporal.prepare_boundary_incarnation(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,pg_lsn,text,text,text) to mip_temporal_recorder;
grant execute on function mip_temporal.advance_boundary_incarnation(uuid,uuid,uuid,text) to mip_temporal_ack_gateway;
do $immutable$
declare t text;
begin
 foreach t in array array['boundary_stream_configs','boundary_issues','registered_stream_markers','boundary_capture_types'] loop
  execute format('create trigger immutable_rows before update or delete on mip_temporal.%I for each row execute function mip_hypothesis.reject_mutation()',t);
  execute format('create trigger immutable_table before truncate on mip_temporal.%I for each statement execute function mip_hypothesis.reject_mutation()',t);
 end loop;
end $immutable$;
-- Registered v2 bindings cannot fall back to v1 after a publication downgrade.
-- Keep original v1 implementations intact under private names; guard their public compatibility interfaces.
alter function mip_temporal.capture_incarnation(uuid,uuid,uuid,pg_lsn,uuid) rename to capture_revision_incarnation_impl;
alter function mip_temporal.prepare_incarnation(uuid,uuid,uuid,uuid,uuid,uuid,pg_lsn,text,text,text) rename to prepare_revision_incarnation_impl;
alter function mip_temporal.advance_incarnation(uuid,uuid,uuid) rename to advance_revision_incarnation_impl;
revoke all on function mip_temporal.capture_revision_incarnation_impl(uuid,uuid,uuid,pg_lsn,uuid),
 mip_temporal.prepare_revision_incarnation_impl(uuid,uuid,uuid,uuid,uuid,uuid,pg_lsn,text,text,text),
 mip_temporal.advance_revision_incarnation_impl(uuid,uuid,uuid)
 from public,anon,authenticated,service_role,mip_temporal_recorder,mip_temporal_ack_gateway,mip_comparison_worker_v1,mip_comparison_producer_v1;
create function mip_temporal.capture_incarnation(p_session uuid,p_binding uuid,p_expected uuid,p_before pg_lsn,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform mip_temporal.require_incarnation(p_session,p_binding,p_expected);
 if exists(select 1 from mip_temporal.boundary_stream_configs where binding_id=p_binding) then raise exception 'mip_boundary_v1_fallback_denied';end if;
 return mip_temporal.capture_revision_incarnation_impl(p_session,p_binding,p_expected,p_before,p_request);
end $$;
create function mip_temporal.prepare_incarnation(p_session uuid,p_capture uuid,p_expected uuid,p_request uuid,p_source uuid,p_stream uuid,
 p_end pg_lsn,p_bootstrap text,p_frames text,p_delivery text)
returns uuid language plpgsql security definer set search_path='' as $$
declare binding uuid;
begin
 select binding_id into binding from mip_temporal.stream_captures where id=p_capture;
 perform mip_temporal.require_incarnation(p_session,binding,p_expected);
 if exists(select 1 from mip_temporal.boundary_stream_configs where binding_id=binding) then raise exception 'mip_boundary_v1_fallback_denied';end if;
 return mip_temporal.prepare_revision_incarnation_impl(p_session,p_capture,p_expected,p_request,p_source,p_stream,p_end,p_bootstrap,p_frames,p_delivery);
end $$;
create function mip_temporal.advance_incarnation(p_session uuid,p_request uuid,p_expected uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare binding uuid;
begin
 select c.binding_id into binding from mip_temporal.covered_permits p join mip_temporal.stream_captures c on c.id=p.capture_id where p.request_id=p_request;
 perform mip_temporal.require_incarnation(p_session,binding,p_expected);
 if exists(select 1 from mip_temporal.boundary_stream_configs where binding_id=binding) then raise exception 'mip_boundary_v1_fallback_denied';end if;
 return mip_temporal.advance_revision_incarnation_impl(p_session,p_request,p_expected);
end $$;
alter function mip_temporal.capture_incarnation(uuid,uuid,uuid,pg_lsn,uuid) owner to mip_temporal_advance_owner;
alter function mip_temporal.prepare_incarnation(uuid,uuid,uuid,uuid,uuid,uuid,pg_lsn,text,text,text) owner to mip_temporal_advance_owner;
alter function mip_temporal.advance_incarnation(uuid,uuid,uuid) owner to mip_temporal_advance_owner;
revoke all on function mip_temporal.capture_incarnation(uuid,uuid,uuid,pg_lsn,uuid),
 mip_temporal.prepare_incarnation(uuid,uuid,uuid,uuid,uuid,uuid,pg_lsn,text,text,text),
 mip_temporal.advance_incarnation(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function mip_temporal.capture_incarnation(uuid,uuid,uuid,pg_lsn,uuid),
 mip_temporal.prepare_incarnation(uuid,uuid,uuid,uuid,uuid,uuid,pg_lsn,text,text,text) to mip_temporal_recorder;
grant execute on function mip_temporal.advance_incarnation(uuid,uuid,uuid) to mip_temporal_ack_gateway;

commit;
