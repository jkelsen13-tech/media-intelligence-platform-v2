-- Additive synthetic canonical-field citation qualification. No live source admission.
begin;
create role mip_citation_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role mip_citation_source nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role mip_citation_gateway nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create schema mip_citation authorization mip_citation_owner;
revoke all on schema mip_citation from public;
grant usage on schema mip_hypothesis,evidence_pipeline,mip_cas to mip_citation_owner;
grant select on mip_hypothesis.revisions,mip_hypothesis.acceptance_bindings,evidence_pipeline.investigation_versions,evidence_pipeline.investigation_observations,mip_cas.refs,mip_cas.objects,mip_cas.source_identities to mip_citation_owner;
create policy citation_read on mip_hypothesis.revisions for select to mip_citation_owner using(true);
create policy citation_read on mip_hypothesis.acceptance_bindings for select to mip_citation_owner using(true);
create policy citation_read on evidence_pipeline.investigation_versions for select to mip_citation_owner using(true);
create policy citation_read on evidence_pipeline.investigation_observations for select to mip_citation_owner using(true);
create policy citation_read on mip_cas.refs for select to mip_citation_owner using(true);
create policy citation_read on mip_cas.objects for select to mip_citation_owner using(true);
create policy citation_read on mip_cas.source_identities for select to mip_citation_owner using(true);
grant execute on function mip_cas.authorize(uuid),mip_cas.check_source(uuid,jsonb,text),mip_cas.read(uuid,text,text),mip_hypothesis.read_selected_bound_history(uuid,uuid,uuid[]) to mip_citation_owner;
set role mip_citation_owner;
create table mip_citation.fields(
 id uuid not null default gen_random_uuid(), investigation uuid not null, workspace_version uuid not null,
 input_position text not null check(length(input_position) between 1 and 256), material_version uuid not null,
 source_field text not null check(source_field in('title','summary','body_text')),
 identity jsonb not null check(octet_length(identity::text)<=16384), created_at timestamptz not null default clock_timestamp(),
 primary key(investigation,id),
 unique(investigation,workspace_version,input_position,source_field)
);
create table mip_citation.bindings(
 investigation uuid not null, assessment_revision uuid not null, evidence_id text not null check(length(evidence_id) between 1 and 256),
 field_id uuid not null, identity jsonb not null check(octet_length(identity::text)<=24576),
 primary key(investigation,assessment_revision,evidence_id),
 foreign key(investigation,field_id) references mip_citation.fields(investigation,id)
);
create table mip_citation.binding_requests(
 investigation uuid not null, user_id uuid not null, request_id uuid not null,
 assessment_revision uuid not null, evidence_id text not null, field_id uuid not null,
 identity jsonb not null check(octet_length(identity::text)<=24576),
 primary key(investigation,user_id,request_id),
 foreign key(investigation,assessment_revision,evidence_id) references mip_citation.bindings(investigation,assessment_revision,evidence_id)
);
create index binding_requests_revision on mip_citation.binding_requests(investigation,assessment_revision,evidence_id,user_id,request_id);
create function mip_citation.immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'mip_citation_immutable';end$$;
-- Investigation-leading keys support future partitioning; no global admission scan or insert mutex.
create index fields_material_field on mip_citation.fields(investigation,material_version,source_field,id);
create index bindings_field_revision on mip_citation.bindings(investigation,field_id,assessment_revision,evidence_id);
do $rls$ declare n text;begin foreach n in array array['fields','bindings','binding_requests'] loop
 execute format('alter table mip_citation.%I enable row level security',n);
 execute format('alter table mip_citation.%I force row level security',n);
 execute format('create policy owner_only on mip_citation.%I to mip_citation_owner using(true) with check(true)',n);
 execute format('create trigger immutable_rows before update or delete on mip_citation.%I for each row execute function mip_citation.immutable()',n);
 execute format('create trigger immutable_table before truncate on mip_citation.%I for each statement execute function mip_citation.immutable()',n);
 end loop;end $rls$;

-- Source-only preparation derives a field identity, never accepts offsets or hashes from a caller.
-- Parent canonical unit is exactly PostgreSQL retained-record JSONB::text UTF-8.
create function mip_citation.plan(i uuid,w uuid,pos text,f text,parent_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o jsonb;inp jsonb;rec jsonb;raw text;parent mip_cas.refs;parent_bytes bytea;field_bytes bytea;h text;fh text;derived text;capture uuid;
begin
 if f is null or f not in('title','summary','body_text') or pos is null or length(pos) not between 1 and 256 then raise exception 'mip_citation_field_invalid';end if;
 select ob.snapshot into strict o from evidence_pipeline.investigation_versions v join evidence_pipeline.investigation_observations ob on ob.id=v.observation_id where v.id=w and v.investigation_id=i;
 if (select count(*) from jsonb_array_elements(o->'inputs') x where x->>'position'=pos)<>1 then raise exception 'mip_citation_input_ambiguous';end if;
 select value into strict inp from jsonb_array_elements(o->'inputs') where value->>'position'=pos;
 if (inp->'capture' is null or inp->'capture'='null'::jsonb)=(inp->'record_version' is null or inp->'record_version'='null'::jsonb) then raise exception 'mip_citation_input_ambiguous';end if;
 rec:=case when inp->'capture' is not null and inp->'capture'<>'null'::jsonb then inp->'capture' else inp->'record_version' end;
 if jsonb_typeof(rec->'payload'->f) is distinct from 'string' then raise exception 'mip_citation_field_missing';end if;
 raw:=rec->'payload'->>f;parent_bytes:=convert_to(rec::text,'UTF8');field_bytes:=convert_to(raw,'UTF8');
 if octet_length(parent_bytes) not between 1 and 1048576 or octet_length(field_bytes) not between 1 and 1048576 then raise exception 'mip_citation_size';end if;
 h:=encode(public.digest(parent_bytes,'sha256'),'hex');fh:=encode(public.digest(field_bytes,'sha256'),'hex');
 select * into strict parent from mip_cas.refs where investigation=i and logical_key=parent_key;
 if parent.hash<>h or parent.provenance->>'source_version'<>rec->>'id' or (parent.provenance->>'acquired_at')::timestamptz is distinct from coalesce(rec->>'captured_at',rec->>'recorded_at')::timestamptz then raise exception 'mip_citation_parent_identity';end if;
 perform mip_cas.check_source(i,parent.provenance,parent.hash);
 if not exists(select 1 from mip_cas.objects where hash=h and raw_size=octet_length(parent_bytes)) then raise exception 'mip_citation_parent_identity';end if;
 derived:=encode(public.digest(convert_to(jsonb_build_array('mip-citation-field-source-v1','utf8_field_bytes_v1',i,parent.id,parent.provenance->>'source_version',h,rec->>'id',f,fh)::text,'UTF8'),'sha256'),'hex');
 capture:=(substr(derived,1,8)||'-'||substr(derived,9,4)||'-'||substr(derived,13,4)||'-'||substr(derived,17,4)||'-'||substr(derived,21,12))::uuid;
 return jsonb_build_object('investigation',i,'workspace_version',w,'input_position',pos,'material_version',rec->>'id','source_field',f,
  'parent_logical_key',parent_key,'parent_ref_id',parent.id,'parent_canonical_hash',h,'parent_source_version',parent.provenance->>'source_version',
  'parent_contract','postgres_retained_jsonb_text_utf8_v1','field_contract','utf8_field_bytes_v1',
  'assessment_offset_unit','unicode_code_points_v1','resolver_offset_unit','utf8_bytes_v1',
  'field_source_version','field-v1:'||derived,'field_capture_id',capture,'field_hash',fh,'field_size',octet_length(field_bytes),
  'field_base64',replace(encode(field_bytes,'base64'),chr(10),''),'acquired_at',parent.provenance->>'acquired_at');
end$$;
create function mip_citation.register_field(i uuid,w uuid,pos text,f text,parent_key text,field_key text) returns uuid
language plpgsql security definer set search_path='' as $$
declare p jsonb;r mip_cas.refs;fid uuid;expected jsonb;prior jsonb;
begin
 p:=mip_citation.plan(i,w,pos,f,parent_key);
 select * into strict r from mip_cas.refs where investigation=i and logical_key=field_key;
 if r.id=(p->>'parent_ref_id')::uuid or r.hash<>p->>'field_hash' or r.provenance->>'source_version'<>p->>'field_source_version' or r.provenance->>'acquired_at'<>p->>'acquired_at'
 or not exists(select 1 from mip_cas.source_identities where investigation=i and source_version=p->>'field_source_version' and capture_id=(p->>'field_capture_id')::uuid and canonical_hash=r.hash and raw_size=(p->>'field_size')::integer)
 or not exists(select 1 from mip_cas.objects where hash=r.hash and raw_size=(p->>'field_size')::integer) then raise exception 'mip_citation_field_identity';end if;
 perform mip_cas.check_source(i,r.provenance,r.hash);
 expected:=(p-'field_base64')||jsonb_build_object('field_logical_key',field_key,'field_ref_id',r.id);
 insert into mip_citation.fields(investigation,workspace_version,input_position,material_version,source_field,identity)
 values(i,w,pos,(p->>'material_version')::uuid,f,expected)
 on conflict(investigation,workspace_version,input_position,source_field) do nothing;
 select id,identity into strict fid,prior from mip_citation.fields where investigation=i and workspace_version=w and input_position=pos and source_field=f;
 if prior is distinct from expected then raise exception 'mip_citation_registration_conflict';end if;
 return fid;
end$$;

-- Current saved-assessment permission semantics, including generation/reassessment closure, are reused.
create function mip_citation.checked_evidence(i uuid,r uuid,eid text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid;h jsonb;e jsonb;entry jsonb;
begin
 u:=mip_cas.authorize(i);
 h:=mip_hypothesis.read_selected_bound_history(u,i,array[r]);
 if jsonb_array_length(h->'entries')<>1 then raise exception 'mip_citation_assessment_denied';end if;
 entry:=h->'entries'->0;
 if entry->>'revision_id'<>r::text or entry->>'status'<>'available' then raise exception 'mip_citation_assessment_denied';end if;
 if eid is null or length(eid) not between 1 and 256 or (select count(*) from jsonb_array_elements(entry->'assessment'->'evidence') as evidence_rows(evidence_value) where evidence_rows.evidence_value->>'id'=eid)<>1 then raise exception 'mip_citation_evidence_ambiguous';end if;
 select value into strict e from jsonb_array_elements(entry->'assessment'->'evidence') where value->>'id'=eid;
 return jsonb_build_object('evidence',e,'workspace_version',(entry->>'workspace_version_id')::uuid);
end$$;
create function mip_citation.derive(i uuid,r uuid,eid text,fid uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare checked jsonb;e jsonb;m mip_citation.fields;p jsonb;raw text;bytes bytea;a integer;b integer;ba integer;bb integer;span bytea;parent_read jsonb;field_read jsonb;
begin
 checked:=mip_citation.checked_evidence(i,r,eid);e:=checked->'evidence';
 select * into strict m from mip_citation.fields where id=fid and investigation=i;
 if m.workspace_version<>(checked->>'workspace_version')::uuid or m.input_position is distinct from e->>'input_position' or m.material_version::text is distinct from e->>'material_version' or m.source_field is distinct from e->'source_span'->>'source_field' then raise exception 'mip_citation_mapping_mismatch';end if;
 p:=mip_citation.plan(i,m.workspace_version,m.input_position,m.source_field,m.identity->>'parent_logical_key');
 if m.identity-(array['field_logical_key','field_ref_id']) is distinct from p-'field_base64' then raise exception 'mip_citation_mapping_tampered';end if;
 parent_read:=mip_cas.read(i,m.identity->>'parent_logical_key','canonical');
 field_read:=mip_cas.read(i,m.identity->>'field_logical_key','canonical');
 if parent_read->>'state'<>'canonical_encoded' or field_read->>'state'<>'canonical_encoded' then raise exception 'mip_citation_rehydration_required';end if;
 if parent_read->>'ref_id'<>p->>'parent_ref_id' or parent_read->>'hash'<>p->>'parent_canonical_hash' or parent_read->'provenance'->>'source_version'<>p->>'parent_source_version'
 or field_read->>'ref_id'<>m.identity->>'field_ref_id' or field_read->>'hash'<>p->>'field_hash' or field_read->'provenance'->>'source_version'<>p->>'field_source_version' then raise exception 'mip_citation_storage_identity';end if;
 bytes:=decode(p->>'field_base64','base64');raw:=convert_from(bytes,'UTF8');
 if jsonb_typeof(e->'source_span') is distinct from 'object' or (select count(*) from jsonb_object_keys(e->'source_span'))<>4 or not(e->'source_span' ?& array['source_field','start','end','excerpt_sha256']) or jsonb_typeof(e->'source_span'->'start') is distinct from 'number' or jsonb_typeof(e->'source_span'->'end') is distinct from 'number' or e->'source_span'->>'start' !~ '^[0-9]+$' or e->'source_span'->>'end' !~ '^[0-9]+$' then raise exception 'mip_citation_span_units';end if;
 a:=(e->'source_span'->>'start')::integer;b:=(e->'source_span'->>'end')::integer;
 if a<0 or b<=a or b>char_length(raw) or b-a>2000 then raise exception 'mip_citation_span_bounds';end if;
 ba:=octet_length(convert_to(substring(raw from 1 for a),'UTF8'));bb:=octet_length(convert_to(substring(raw from 1 for b),'UTF8'));
 span:=substring(bytes from ba+1 for bb-ba);
 if encode(public.digest(span,'sha256'),'hex') is distinct from e->'source_span'->>'excerpt_sha256' then raise exception 'mip_citation_excerpt_hash';end if;
 return jsonb_build_object('investigation',i,'assessment_revision',r,'evidence_id',eid,'field_id',fid,'input_position',e->>'input_position','material_version',e->>'material_version','source_field',m.source_field,
  'start_code_point',a,'end_code_point',b,'byte_start',ba,'byte_end',bb,'span_hash',e->'source_span'->>'excerpt_sha256','mapping',m.identity);
end$$;
create function mip_citation.preview(i uuid,r uuid,eid text,fid uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare identity_value jsonb;
begin
 identity_value:=mip_citation.derive(i,r,eid,fid);
 return jsonb_build_object('identity',identity_value,
  'parent',mip_cas.read(i,identity_value->'mapping'->>'parent_logical_key','canonical'),
  'field',mip_cas.read(i,identity_value->'mapping'->>'field_logical_key','canonical'),
  'source_authority_qualified',false,'ingest_extraction_qualified',false,'production_qualified',false,'transport_qualified',false,'deployment_qualified',false,'publication_allowed',false);
end$$;
create function mip_citation.bind(i uuid,r uuid,eid text,fid uuid,request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare identity_value jsonb;prior jsonb;u uuid;receipt mip_citation.binding_requests;
begin
 u:=mip_cas.authorize(i);
 if request is null then raise exception 'mip_citation_request_required';end if;
 -- Per-user/request serialization only; no global insert lock or registry scan.
 perform pg_advisory_xact_lock(hashtextextended('citation-bind-request:'||i::text||':'||u::text||':'||request::text,0));
 select * into receipt from mip_citation.binding_requests where investigation=i and user_id=u and request_id=request;
 if found and (receipt.assessment_revision is distinct from r or receipt.evidence_id is distinct from eid or receipt.field_id is distinct from fid) then raise exception 'mip_citation_request_conflict';end if;
 identity_value:=mip_citation.derive(i,r,eid,fid);
 if receipt.request_id is not null then
  if receipt.identity is distinct from identity_value then raise exception 'mip_citation_request_conflict';end if;
  return jsonb_build_object('request_id',request,'identity',receipt.identity);
 end if;
 insert into mip_citation.bindings values(i,r,eid,fid,identity_value)
 on conflict(investigation,assessment_revision,evidence_id) do nothing;
 select identity into strict prior from mip_citation.bindings where investigation=i and assessment_revision=r and evidence_id=eid;
 if prior is distinct from identity_value then raise exception 'mip_citation_binding_conflict';end if;
 insert into mip_citation.binding_requests values(i,u,request,r,eid,fid,identity_value);
 return jsonb_build_object('request_id',request,'identity',identity_value);
end$$;
create function mip_citation.read(i uuid,r uuid,eid text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b mip_citation.bindings;current_identity jsonb;
begin
 perform mip_cas.authorize(i);
 select * into strict b from mip_citation.bindings where investigation=i and assessment_revision=r and evidence_id=eid;
 current_identity:=mip_citation.derive(i,r,eid,b.field_id);
 if b.identity is distinct from current_identity then raise exception 'mip_citation_binding_tampered';end if;
 return jsonb_build_object('identity',current_identity,
  'parent',mip_cas.read(i,current_identity->'mapping'->>'parent_logical_key','canonical'),
  'field',mip_cas.read(i,current_identity->'mapping'->>'field_logical_key','canonical'),
  'source_authority_qualified',false,'ingest_extraction_qualified',false,'production_qualified',false,'transport_qualified',false,'deployment_qualified',false,'publication_allowed',false);
end$$;
revoke all on all tables in schema mip_citation from public;
revoke all on all functions in schema mip_citation from public;
grant usage on schema mip_citation to mip_citation_source,mip_citation_gateway;
grant execute on function mip_citation.plan(uuid,uuid,text,text,text),mip_citation.register_field(uuid,uuid,text,text,text,text) to mip_citation_source;
grant execute on function mip_citation.preview(uuid,uuid,text,uuid),mip_citation.bind(uuid,uuid,text,uuid,uuid),mip_citation.read(uuid,uuid,text) to mip_citation_gateway;
reset role;
commit;
