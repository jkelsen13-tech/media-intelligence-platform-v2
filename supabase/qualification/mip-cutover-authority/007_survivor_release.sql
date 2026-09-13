-- Isolated retained-evidence adapter and private release path. Actual public release stays disabled.
begin;
do $$begin if not exists(select 1 from pg_roles where rolname='mip_publication_owner_v2') then
 create role mip_publication_owner_v2 nologin nosuperuser nobypassrls;end if;end $$;
alter table mip_identity.mapping_versions drop constraint mapping_versions_principal_check;
alter table mip_identity.mapping_versions add check(principal in ('mip_comparison_worker_v1','mip_comparison_producer_v1','mip_projection_publisher_v1'));
create table mip_identity.publication_policy_versions(
 revision uuid primary key,privacy_rule_ref text not null check(length(privacy_rule_ref)>0),
 rights_rule_ref text not null check(length(rights_rule_ref)>0),
 publication_rule_ref text not null check(length(publication_rule_ref)>0),
 adapter_ref text not null check(adapter_ref='survivor-reader-v1'),
 approval_ref text not null check(length(approval_ref)>0)
);
create table mip_identity.publication_policy_heads(
 id boolean primary key check(id),revision uuid not null references mip_identity.publication_policy_versions,active boolean not null
);
create trigger policy_fence before insert or update or delete or truncate on mip_identity.publication_policy_heads
 for each statement execute function mip_cutover_authority.fence_publication_write();
create trigger policy_retirement before insert or update or delete on mip_identity.publication_policy_heads
 for each row execute function mip_identity.guard_revision_reuse();
create table mip_identity.publication_reviews(
 revision uuid primary key,generation_id uuid not null references comparison_qualification.outputs(generation_id),
 input_hash text not null,output_hash text not null,
 policy_revision uuid not null references mip_identity.publication_policy_versions,
 privacy_status text not null check(privacy_status in ('eligible','ineligible','unknown')),
 rights_status text not null check(rights_status in ('eligible','ineligible','unknown')),
 evidence jsonb not null,explanations jsonb not null,relationship_context jsonb not null,
 valid_until timestamptz not null check(isfinite(valid_until)),policy_ref text not null check(length(policy_ref)>0),
 authorization_ref text not null check(length(authorization_ref)>0)
);
create table mip_identity.publication_review_heads(
 generation_id uuid primary key,revision uuid not null references mip_identity.publication_reviews,active boolean not null
);
create table mip_identity.review_stages(
 review_revision uuid primary key references mip_identity.publication_reviews,
 approved_payload_id uuid not null unique references mip_cutover_authority.approved_payloads
);
create table mip_identity.private_releases(
 request_id uuid primary key,runtime text not null,review_revision uuid not null,
 approved_payload_id uuid not null references mip_cutover_authority.approved_payloads,
 payload_hash text not null,recorded_at timestamptz not null default clock_timestamp()
);
create function mip_identity.survivor_relations() returns text[] language sql immutable set search_path='' as $$
 select array['events','articles','event_articles','pipeline_config','claims','article_claims',
 'claim_evidence_links','claim_corrections','explanations','story_arcs','nodes',
 'edges','arc_events','arc_milestones','arc_membership_candidates'];
$$;
create function mip_identity.survivor_context() returns jsonb
language plpgsql security definer set search_path='' as $$
declare name text;rows jsonb;result jsonb:='{}';
begin
 foreach name in array mip_identity.survivor_relations() loop
 if to_regclass('public.'||name) is null or not exists(
 select 1 from pg_trigger where tgrelid=to_regclass('public.'||name) and tgname='survivor_mutation_lock' and tgenabled='O')
 then raise exception 'mip_survivor_relation_or_fence_missing';end if;
 execute format('select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]''::jsonb) from public.%I r',name) into rows;
 result:=result||jsonb_build_object(name,rows);
 end loop;
 return result;
end $$;
-- Only explicit trusted installation can call this. No live migration invocation.
create function mip_identity.install_survivor_fences() returns void
language plpgsql security invoker set search_path='' as $$
declare name text;
begin
 foreach name in array mip_identity.survivor_relations() loop
 if to_regclass('public.'||name) is null then raise exception 'mip_survivor_relation_missing';end if;
 execute format('create trigger survivor_mutation_lock before insert or update or delete or truncate on public.%I for each statement execute function mip_identity.collector_lock()',name);
 if name not in ('events','articles','event_articles','pipeline_config') then
 execute format('create trigger survivor_retention after insert or update or delete on public.%I for each row execute function mip_identity.collector_change(''id'')',name);
 execute format('create trigger survivor_no_truncate before truncate on public.%I for each statement execute function comparison_qualification.reject_rewrite()',name);
 end if;
 execute format('grant select on public.%I to mip_publication_owner_v2',name);
 end loop;
end $$;
create function mip_identity.invalidate_source_publications() returns trigger
language plpgsql security definer set search_path='' as $$
declare dep mip_cutover_authority.dependency_versions;v uuid;
begin
 -- Collector's source fence is already held, then publication fence; consistent order.
 perform 1 from mip_cutover_authority.publication_fence where id for update;
 for dep in select d.* from mip_cutover_authority.dependency_heads h
 join mip_cutover_authority.dependency_versions d on d.id=h.version_id
 where d.source=new.source and d.state='current' order by h.dependency_key loop
 insert into mip_cutover_authority.dependency_versions(dependency_key,source,children,record_hash,
 privacy_eligible,rights_eligible,retained_evidence,correction_current,explanation_eligible,publication_eligible,
 state,valid_until,predicate_version)
 values(dep.dependency_key,dep.source,dep.children,dep.record_hash,false,false,dep.retained_evidence,
 false,false,false,'revoked',dep.valid_until,dep.predicate_version) returning id into v;
 update mip_cutover_authority.dependency_heads set version_id=v where dependency_key=dep.dependency_key;
 end loop;
 return null;
end $$;
create trigger invalidate_retained_change after insert on mip_identity.source_changes for each row execute function mip_identity.invalidate_source_publications();
create trigger publication_review_fence before insert or update or delete or truncate on mip_identity.publication_review_heads
 for each statement execute function mip_cutover_authority.fence_publication_write();
create trigger publication_review_retirement before insert or update or delete on mip_identity.publication_review_heads
 for each row execute function mip_identity.guard_revision_reuse();

create function mip_identity.validate_review(p_revision uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare rev mip_identity.publication_reviews;g comparison_qualification.generations;o comparison_qualification.outputs;pc jsonb;
 current_input jsonb;event_input jsonb;member jsonb;ac jsonb;ev jsonb;x jsonb;original jsonb;article jsonb;field text;valid boolean;links jsonb:='[]';corrections jsonb:='[]';target jsonb;relation jsonb;source_claim jsonb;
begin
 perform 1 from mip_identity.collector_fence where id for share;
 perform 1 from mip_cutover_authority.publication_fence where id for share;
 select r.* into rev from mip_identity.publication_reviews r join mip_identity.publication_review_heads h on h.revision=r.revision
 and h.generation_id=r.generation_id and h.active where r.revision=p_revision;
 if not found or rev.valid_until<=clock_timestamp() or rev.privacy_status<>'eligible' or rev.rights_status<>'eligible' then
 raise exception 'mip_publication_authority_missing';end if;
 if not exists(select 1 from mip_identity.publication_policy_heads h join mip_identity.publication_policy_versions v on v.revision=h.revision
 where h.id and h.active and h.revision=rev.policy_revision and v.adapter_ref='survivor-reader-v1') then raise exception 'mip_publication_policy_revoked';end if;
 select * into strict g from comparison_qualification.generations where id=rev.generation_id;
 select * into strict o from comparison_qualification.outputs where generation_id=g.id;
 if rev.input_hash is distinct from g.input_hash or rev.output_hash is distinct from o.output_hash then raise exception 'mip_publication_binding';end if;
 current_input:=comparison_qualification.source_snapshot(g.input_payload->'lexicon',g.implementation_ref);
 if (current_input-'snapshot_metadata') is distinct from (g.input_payload-'snapshot_metadata') then raise exception 'mip_publication_stale_source_input';end if;
 if mip_identity.survivor_context() is distinct from rev.relationship_context then raise exception 'mip_publication_stale_source_context';end if;
 if jsonb_typeof(g.input_payload->'eventInputs') is distinct from 'array'
 or jsonb_array_length(g.input_payload->'eventInputs')=0 then raise exception 'mip_publication_missing_input';end if;
 for event_input in select value from jsonb_array_elements(g.input_payload->'eventInputs') loop
 if event_input#>>'{event,comparison_validation_state}' is distinct from 'approved'
 or event_input#>>'{event,status}' is null or event_input#>>'{event,status}'='timeline_only'
 or (select count(distinct value#>>'{article,outlet}') from jsonb_array_elements(event_input->'members'))<2
 then raise exception 'mip_publication_event_ineligible';end if;
 for member in select value from jsonb_array_elements(event_input->'members') loop
 if member#>>'{article,reader_state}' is distinct from 'eligible'
 or member#>>'{article,source_status}' is distinct from 'active' then raise exception 'mip_publication_article_ineligible';end if;
 end loop;end loop;
 if jsonb_typeof(rev.evidence) is distinct from 'array' or jsonb_array_length(rev.evidence)=0
 or jsonb_typeof(rev.explanations) is distinct from 'array'
 or jsonb_typeof(o.output_payload#>'{projection,article_claims}') is distinct from 'array'
 or jsonb_array_length(o.output_payload#>'{projection,article_claims}')=0
 then raise exception 'mip_publication_evidence_missing';end if;
 if jsonb_typeof(o.output_payload#>'{projection,claims}') is distinct from 'array'
 or jsonb_typeof(o.output_payload#>'{projection,explanations}') is distinct from 'array'
 or jsonb_array_length(o.output_payload#>'{projection,explanations}')=0 then raise exception 'mip_publication_explanation_missing';end if;
 for pc in select value from jsonb_array_elements(o.output_payload#>'{projection,claims}') loop
 if pc->>'status' is distinct from 'active' or pc->>'rule_version' is distinct from 'sc-v2-event-projection'
 or not exists(select 1 from jsonb_array_elements(g.input_payload->'eventInputs') e where e.value#>>'{event,id}'=pc->>'event_id')
 then raise exception 'mip_publication_claim_ineligible';end if;
 end loop;
 for ac in select value from jsonb_array_elements(o.output_payload#>'{projection,article_claims}') loop
 valid:=false;
 if not exists(select 1 from jsonb_array_elements(o.output_payload#>'{projection,claims}') c
 join lateral jsonb_array_elements(g.input_payload->'eventInputs') e on e.value#>>'{event,id}'=c.value->>'event_id'
 cross join lateral jsonb_array_elements(e.value->'members') m
 where c.value->>'claim_key'=ac->>'claim_key' and m.value#>>'{article,id}'=ac->>'article_id')
 then raise exception 'mip_publication_membership_missing';end if;
 for ev in select value from jsonb_array_elements(rev.evidence) where value->>'article_id'=ac->>'article_id' and value->>'claim_key'=ac->>'claim_key' loop
 select m.value->'article' into article from jsonb_array_elements(g.input_payload->'eventInputs') e
 cross join lateral jsonb_array_elements(e.value->'members') m where m.value#>>'{article,id}'=ac->>'article_id' limit 1;
 field:=ev->>'field';
 if field in ('title','summary','body_text') and ev->>'auditability_state'='verified_retained_source'
 and nullif(ev->>'excerpt','') is not null and ev->>'excerpt'=ac->>'surface_text'
 and position((ev->>'excerpt') in coalesce(article->>field,''))>0
 and ev->>'field_hash'=encode(sha256(convert_to(article->>field,'UTF8')),'hex') then valid:=true;end if;
 end loop;
 if not valid then raise exception 'mip_publication_retained_evidence_missing';end if;
 end loop;
 if jsonb_array_length(rev.explanations)<>jsonb_array_length(o.output_payload#>'{projection,explanations}')
 or jsonb_array_length(rev.explanations)<>(select count(distinct value->>'assertion_id') from jsonb_array_elements(rev.explanations))
 then raise exception 'mip_publication_explanation_missing';end if;
 for x in select value from jsonb_array_elements(rev.explanations) loop
 select value into original from jsonb_array_elements(o.output_payload#>'{projection,explanations}') where value->>'assertion_id'=x->>'assertion_id';
 if not found or x->>'assertion_type' is distinct from 'claim_grouping' or x->>'rule_version' not like 'sc-v2-event-projection|%' or nullif(btrim(x->>'supporting_passage'),'') is null or x->>'review_status' is distinct from 'published' or x->>'state' is distinct from 'ok'
 or x->'is_current' is distinct from 'true'::jsonb or x->>'rule_version' is distinct from original->>'rule_version'
 or x->>'supporting_passage' is distinct from original->>'supporting_passage'
 or nullif(btrim(x->>'falsification_condition'),'') is null or btrim(x->>'falsification_condition') ilike 'missing:%'
 or jsonb_typeof(x->'archived_sources') is distinct from 'array' or jsonb_array_length(x->'archived_sources')=0
 then raise exception 'mip_publication_explanation_ineligible';end if;
 for ev in select value from jsonb_array_elements(x->'archived_sources') loop
 if ev->>'status' is distinct from 'retained' or not exists(select 1 from jsonb_array_elements(rev.evidence) e where e.value->>'field_hash'=ev->>'field_hash' and e.value->>'article_id'=ev->>'article_id')
 then raise exception 'mip_publication_archive_missing';end if;
 end loop;
 if not exists(select 1 from jsonb_array_elements(o.output_payload#>'{projection,claims}') c
 join lateral jsonb_array_elements(o.output_payload#>'{projection,article_claims}') a on a.value->>'claim_key'=c.value->>'claim_key'
 where x->>'assertion_id' ~ ('^sc:claim_grouping:'||(c.value->>'event_id')||':[0-9]+:'||(a.value->>'article_id')||'$')
 and position(format('Surface claim "%s" grouped under canonical "%s"',a.value->>'surface_text',c.value->>'canonical_text') in (x->>'supporting_passage'))=1
 and exists(select 1 from jsonb_array_elements(x->'archived_sources') z where z.value->>'article_id'=a.value->>'article_id'))
 then raise exception 'mip_publication_explanation_binding';end if;
 end loop;

 -- A fresh review cannot relabel an explicitly withdrawn/revoked dependency current.
 for relation in select value from jsonb_each(rev.relationship_context) loop
 for ev in select value from jsonb_array_elements(relation) loop
 if ev->>'state' in ('withdrawn','revoked') or ev->>'status' in ('withdrawn','revoked')
 or ev->'privacy_eligible'='false'::jsonb or ev->'rights_eligible'='false'::jsonb
 or (ev ? 'reader_state' and ev->>'reader_state' is distinct from 'eligible')
 or (ev ? 'source_status' and ev->>'source_status' is distinct from 'active')
 then raise exception 'mip_publication_dependency_ineligible';end if;
 end loop;end loop;
 -- Bind existing evidence links/corrections by exact event and canonical claim.
 -- Ambiguous/missing bindings fail closed; no worker attestation or URL synthesis.
 for relation in select value from jsonb_array_elements(rev.relationship_context->'claim_evidence_links') loop
 select value into source_claim from jsonb_array_elements(rev.relationship_context->'claims') where value->>'id'=relation->>'claim_id';
 select value into target from jsonb_array_elements(o.output_payload#>'{projection,claims}')
 where value->>'event_id'=source_claim->>'event_id' and value->>'canonical_text'=source_claim->>'canonical_text';
 if target is null or source_claim->>'status' is distinct from 'active' or source_claim->>'rule_version' is distinct from 'sc-v2-event-projection'
 or not exists(select 1 from jsonb_array_elements(rev.evidence) e where e.value->>'claim_key'=target->>'claim_key' and e.value->>'article_id'=relation->>'linked_from_article_id')
 or nullif(relation->>'evidence_url','') is null then raise exception 'mip_publication_link_ineligible';end if;
 links:=links||jsonb_build_array(relation||jsonb_build_object('claim_key',target->>'claim_key'));
 end loop;
 for relation in select value from jsonb_array_elements(rev.relationship_context->'claim_corrections') loop
 select value into source_claim from jsonb_array_elements(rev.relationship_context->'claims') where value->>'id'=relation->>'claim_id';
 select value into target from jsonb_array_elements(o.output_payload#>'{projection,claims}')
 where value->>'event_id'=source_claim->>'event_id' and value->>'canonical_text'=source_claim->>'canonical_text';
 if target is null or source_claim->>'status' is distinct from 'active'
 or not exists(select 1 from jsonb_array_elements(g.input_payload->'eventInputs') e
 cross join lateral jsonb_array_elements(e.value->'members') m where e.value#>>'{event,id}'=target->>'event_id'
 and m.value#>>'{article,id}'=relation->>'correcting_article_id' and m.value#>>'{article,reader_state}'='eligible'
 and m.value#>>'{article,source_status}'='active')
 or nullif(btrim(relation->>'correction_text'),'') is null then raise exception 'mip_publication_correction_ineligible';end if;
 corrections:=corrections||jsonb_build_array(relation||jsonb_build_object('claim_key',target->>'claim_key'));
 end loop;
 return jsonb_set(o.output_payload,'{projection,explanations}',rev.explanations)
 ||jsonb_build_object('evidence_links',links,'corrections',corrections,'review_revision',rev.revision);

end $$;
create function mip_identity.stage_review(p_session uuid,p_runtime text,p_revision uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare rev mip_identity.publication_reviews;g comparison_qualification.generations;payload jsonb;prior uuid;
 dep uuid;ids uuid[]:='{}';keys text[]:='{}';relation record;item jsonb;k text;approved uuid;
begin
 perform mip_identity.authorize(p_session,p_runtime,'mip_projection_publisher_v1');
 perform 1 from mip_identity.collector_fence where id for share;
 perform 1 from mip_cutover_authority.publication_fence where id for update;
 payload:=mip_identity.validate_review(p_revision);
 select * into strict rev from mip_identity.publication_reviews where revision=p_revision;
 select * into strict g from comparison_qualification.generations where id=rev.generation_id;
 perform comparison_qualification.require_source_scope(p_runtime,g.source_project);
 perform comparison_qualification.require_evaluated_implementation(p_runtime,g.implementation_ref);
 select approved_payload_id into prior from mip_identity.review_stages where review_revision=p_revision;
 if found then
 perform mip_cutover_authority.check_publication_payload(prior);
 perform mip_identity.authorize(p_session,p_runtime,'mip_projection_publisher_v1');return prior;end if;
 -- Conservatively include every row in the retained relationship context, a superset
 -- of the transitive graph. Relationship insertion/deletion is therefore covered too.
 for relation in select * from jsonb_each(rev.relationship_context) loop
 for item in select value from jsonb_array_elements(relation.value) loop
 k:='source:'||relation.key||':'||comparison_qualification.argument_digest(item);
 insert into mip_cutover_authority.dependency_versions(dependency_key,source,children,record_hash,
 privacy_eligible,rights_eligible,retained_evidence,correction_current,explanation_eligible,publication_eligible,state,valid_until,predicate_version)
 values(k,g.source_project,'{}',comparison_qualification.argument_digest(item),true,true,true,true,true,true,'current',rev.valid_until,rev.policy_ref)
 returning id into dep;
 insert into mip_cutover_authority.dependency_heads values(k,dep) on conflict(dependency_key) do update set version_id=excluded.version_id;
 ids:=array_append(ids,dep);keys:=array_append(keys,k);
 end loop;end loop;
 k:='review:'||p_revision::text;
 insert into mip_cutover_authority.dependency_versions(dependency_key,source,children,record_hash,
 privacy_eligible,rights_eligible,retained_evidence,correction_current,explanation_eligible,publication_eligible,state,valid_until,predicate_version)
 values(k,g.source_project,keys,comparison_qualification.argument_digest(payload),true,true,true,true,true,true,'current',rev.valid_until,rev.policy_ref) returning id into dep;
 insert into mip_cutover_authority.dependency_heads values(k,dep);
 ids:=array_append(ids,dep);
 insert into mip_cutover_authority.approved_payloads(source,generation_id,payload,payload_hash,dependency_versions,owner_approval_ref)
 values(g.source_project,g.id,payload,comparison_qualification.argument_digest(payload),ids,rev.authorization_ref) returning id into approved;
 perform mip_cutover_authority.select_approved_payload(approved);
 insert into mip_identity.review_stages values(p_revision,approved);
 perform mip_identity.validate_review(p_revision);
 perform mip_identity.authorize(p_session,p_runtime,'mip_projection_publisher_v1');
 return approved;
end $$;
create function mip_identity.release_isolated(p_request uuid,p_session uuid,p_runtime text,p_revision uuid) returns text
language plpgsql security definer set search_path='' as $$
declare approved uuid;payload jsonb;prior mip_identity.private_releases;
begin
 approved:=mip_identity.stage_review(p_session,p_runtime,p_revision);
 payload:=mip_cutover_authority.check_publication_payload(approved);
 select * into prior from mip_identity.private_releases where request_id=p_request;
 if found then
 if prior.runtime is distinct from p_runtime or prior.review_revision is distinct from p_revision then raise exception 'mip_publication_replay_conflict';end if;
 perform mip_identity.validate_review(p_revision);
 perform mip_identity.authorize(p_session,p_runtime,'mip_projection_publisher_v1');
 return 'isolated_released';end if;
 insert into mip_identity.private_releases(request_id,runtime,review_revision,approved_payload_id,payload_hash)
 values(p_request,p_runtime,p_revision,approved,comparison_qualification.argument_digest(payload));
 perform mip_identity.validate_review(p_revision);
 perform mip_identity.authorize(p_session,p_runtime,'mip_projection_publisher_v1');
 return 'isolated_released';
end $$;
create function mip_identity.release_public() returns void language plpgsql set search_path='' as $$
begin raise exception 'mip_public_release_disabled';end $$;

do $permissions$
declare t text;r record;
begin
 foreach t in array array['publication_policy_versions','publication_policy_heads','publication_reviews','publication_review_heads','review_stages','private_releases'] loop
 execute format('alter table mip_identity.%I owner to mip_cutover_schema_owner_v1',t);
 execute format('alter table mip_identity.%I enable row level security',t);
 execute format('alter table mip_identity.%I force row level security',t);
 execute format('revoke all on mip_identity.%I from public,anon,authenticated,service_role',t);
 execute format('grant select on mip_identity.%I to mip_publication_owner_v2',t);
 execute format('create policy publication_owner on mip_identity.%I to mip_publication_owner_v2 using(true) with check(true)',t);
 if t not in ('publication_review_heads','publication_policy_heads') then
 execute format('create trigger immutable before update or delete on mip_identity.%I for each row execute function comparison_qualification.reject_rewrite()',t);
 execute format('create trigger no_truncate before truncate on mip_identity.%I for each statement execute function comparison_qualification.reject_rewrite()',t);
 end if;end loop;
 for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mip_identity'
 and p.proname in ('survivor_relations','survivor_context','invalidate_source_publications','validate_review','stage_review','release_isolated','release_public') loop
 execute 'alter function '||r.sig||' owner to mip_publication_owner_v2';
 execute 'revoke all on function '||r.sig||' from public,anon,authenticated,service_role';
 end loop;
 for r in select tablename from pg_tables where schemaname='mip_cutover_authority' loop
 execute format('alter table mip_cutover_authority.%I owner to mip_cutover_schema_owner_v1',r.tablename);
 execute format('alter table mip_cutover_authority.%I force row level security',r.tablename);
 end loop;
 foreach t in array array['publication_fence','dependency_versions','dependency_heads','approved_payloads','publication_selections'] loop
 execute format('grant select,insert,update on mip_cutover_authority.%I to mip_publication_owner_v2',t);
 execute format('create policy publication_kernel on mip_cutover_authority.%I to mip_publication_owner_v2 using(true) with check(true)',t);
 end loop;
 for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mip_cutover_authority'
 and p.proname in ('fence_publication_write','check_publication_payload','select_approved_payload') loop
 execute 'alter function '||r.sig||' owner to mip_publication_owner_v2';
 end loop;
end $permissions$;
grant insert on mip_identity.review_stages,mip_identity.private_releases to mip_publication_owner_v2;
alter function mip_identity.install_survivor_fences() owner to mip_cutover_schema_owner_v1;
grant usage on schema mip_identity,mip_cutover_authority,comparison_qualification,public to mip_publication_owner_v2;
grant usage on schema mip_identity to mip_projection_publisher_v1;
grant select,update on mip_identity.collector_fence to mip_publication_owner_v2;
create policy publication_collector_fence on mip_identity.collector_fence to mip_publication_owner_v2 using(true) with check(true);
grant select on comparison_qualification.generations,comparison_qualification.outputs to mip_publication_owner_v2;
create policy publication_generation on comparison_qualification.generations for select to mip_publication_owner_v2 using(true);
create policy publication_output on comparison_qualification.outputs for select to mip_publication_owner_v2 using(true);
grant execute on function mip_identity.authorize(uuid,text,text),
 comparison_qualification.source_snapshot(jsonb,text),comparison_qualification.argument_digest(jsonb),
 comparison_qualification.require_source_scope(text,text),comparison_qualification.require_evaluated_implementation(text,text)
 to mip_publication_owner_v2;
grant execute on function mip_identity.stage_review(uuid,text,uuid),mip_identity.release_isolated(uuid,uuid,text,uuid) to mip_projection_publisher_v1;
revoke all on function mip_identity.install_survivor_fences() from public,anon,authenticated,service_role;
-- No worker grants on review records, staging, publisher APIs, source mutation or rule decisions.
commit;
