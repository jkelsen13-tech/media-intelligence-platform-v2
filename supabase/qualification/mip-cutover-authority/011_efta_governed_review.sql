-- Opt-in qualification extension after 001..010. Never auto-installed.
-- Bounded private review admission; 007 remains sole comparison publication path.
begin;
create table mip_identity.efta_scope(candidate_id uuid primary key,binding jsonb not null);
insert into mip_identity.efta_scope select (x->>'candidate_id')::uuid,x from jsonb_array_elements($scope$[{"candidate_id":"f5548254-e6c4-4abd-925d-8ea6d8e076ea","capture_id":"a1e37087-54c7-49a8-886d-0f7189ffbde9","article_id":"44167b15-ca52-4827-be4b-50f81d384674","content_hash":"d9f0ed6ccf11a673749d7ba91b34e228d3649d7b84c33b2be9a371199a939470","url":"https://www.govinfo.gov/content/pkg/PLAW-119publ38/html/PLAW-119publ38.htm","span_start":0,"span_end":122,"source_field":"body_text","excerpt":"All redactions must be accompanied by a written justification published in the Federal Register and submitted to Congress.","origin_id":"us-congress-enacted-law","dependency_id":"pl119-38","semantic_kind":"enacted_requirement","statement":"Statutory redaction-accountability requirement, section 2(c)(2).","remaining_uncertainty":"Requirement is not proof of compliance.","event_time_rules":{"date":"2025-11-19","precision":"day","basis_id":"document-date:a1e37087-54c7-49a8-886d-0f7189ffbde9:2025-11-19","milestones":[{"kind":"document_date","date":"2025-11-19"}]}},{"candidate_id":"dd1ef05f-dd67-4595-908f-d195671a5db5","capture_id":"5a01a9c2-0f86-4757-a056-52700980d0aa","article_id":"1baddfa5-9b2d-466d-8bd3-2e9a5c3702ee","content_hash":"7062c77032a711a61eac7cb1071cb9c916166eba429110ebb9dfdbc2456e5a57","url":"https://www.justice.gov/opa/media/1434851/dl?inline=","span_start":0,"span_end":73,"source_field":"body_text","excerpt":"I anticipate this ongoing review being completed over the next two weeks.","origin_id":"doj-executive","dependency_id":"doj-efta-dec19-letter","semantic_kind":"agency_projection","statement":"Agency projection acknowledges ongoing review.","remaining_uncertainty":"PDF extraction whitespace normalized; words unchanged. Projection is not completion. Search metadata differs; date verified on PDF page 1.","event_time_rules":{"date":"2025-12-19","precision":"day","basis_id":"document-date:5a01a9c2-0f86-4757-a056-52700980d0aa:2025-12-19","milestones":[{"kind":"document_date","date":"2025-12-19"}]}},{"candidate_id":"a255ffc5-2209-4e50-8fec-cf72f3f0e7eb","capture_id":"225e33dc-9e67-47a0-86e4-7a75b8ff4b88","article_id":"d0bf46df-efcb-4f0d-83cd-f5f60343f650","content_hash":"f23bb82300d53b4870bdf8001cfb61cabc38791abaca2efc8f52cd0dfce82642","url":"https://www.justice.gov/media/1426281/dl?inline=","span_start":0,"span_end":127,"source_field":"body_text","excerpt":"It is of paramount importance to the Department that this review is thorough and that victim information is properly protected.","origin_id":"doj-executive","dependency_id":"efta-review-protocol","semantic_kind":"agency_instruction","statement":"Redaction review standard.","remaining_uncertainty":"Instruction not proof of implementation. PDF extraction whitespace normalized; words unchanged; subject line used as title.","event_time_rules":{"date":"2026-01-04","precision":"day","basis_id":"document-date:225e33dc-9e67-47a0-86e4-7a75b8ff4b88:2026-01-04","milestones":[{"kind":"document_date","date":"2026-01-04"}]}},{"candidate_id":"c5a7416f-2495-41cf-b3d6-8a02d3becf22","capture_id":"9a898688-2f39-4a40-a1a7-0e6bb5b0f58c","article_id":"e444d8ef-765a-4624-bf8b-3f2f90eab743","content_hash":"f4b682cf0a6c7476aa115d1cf83dcbd35da057165821aa483dc08b08f1ddbf1a","url":"https://www.justice.gov/opa/pr/department-justice-publishes-35-million-responsive-pages-compliance-epstein-files","span_start":0,"span_end":123,"source_field":"body_text","excerpt":"Combined with prior releases, this makes the total production nearly 3.5 million pages released in compliance with the Act.","origin_id":"doj-executive","dependency_id":"doj-efta-jan30-production","semantic_kind":"official_claim","statement":"Agency production-total claim.","remaining_uncertainty":"Not independently verified compliance; same event as Jan30 letter.","event_time_rules":{"date":"2026-01-30","precision":"day","basis_id":"document-date:9a898688-2f39-4a40-a1a7-0e6bb5b0f58c:2026-01-30","milestones":[{"kind":"document_date","date":"2026-01-30"}]}},{"candidate_id":"f741208c-0a00-418a-afab-028f558b902b","capture_id":"2c7428e6-0e4b-4dd2-af93-fca438307359","article_id":"c6b19030-a485-4fd8-9e68-3674ea8bffeb","content_hash":"342d4813cc6fc151b6937d20b549e76957908a4a0f70dcc2429406dddfac973a","url":"https://www.justice.gov/letter-to-congress.pdf","span_start":0,"span_end":87,"source_field":"body_text","excerpt":"approximately 200,000 pages have been redacted or withheld based on various privileges.","origin_id":"doj-executive","dependency_id":"doj-efta-jan30-production","semantic_kind":"agency_disclosure_accounting","statement":"Agency quantifies claimed privilege withholding.","remaining_uncertainty":"PDF extraction whitespace normalized; words unchanged. Same origin/event as January 30 release; legal basis not adjudicated.","event_time_rules":{"date":"2026-01-30","precision":"day","basis_id":"document-date:2c7428e6-0e4b-4dd2-af93-fca438307359:2026-01-30","milestones":[{"kind":"document_date","date":"2026-01-30"}]}},{"candidate_id":"5cabcb8f-99bf-4e42-8172-473ef6c59f0f","capture_id":"df6eeb70-a24a-4e3f-9ea8-55faa8fcabfd","article_id":"781bf13f-f1db-4a9f-9a8d-e234a5a303d2","content_hash":"b7fe286748aabbe09ad853f6abea1e8cfa3ead74dbe2eee26c0889bb343fd682","url":"https://oig.justice.gov/ongoing-work/audit-department-justices-compliance-epstein-files-transparency-act","span_start":0,"span_end":105,"source_field":"body_text","excerpt":"The OIG is auditing the Department of Justice’s (DOJ) compliance with the Epstein Files Transparency Act.","origin_id":"doj-oig","dependency_id":"efta-oig-audit","semantic_kind":"audit_status","statement":"DOJ OIG states that it is auditing DOJ compliance with the Epstein Files Transparency Act.","remaining_uncertainty":"Audit initiation/status statement only, not an audit conclusion. No underlying disclosure documents, private persons, victims, contacts or misconduct assertions retained.","event_time_rules":{"date":"2026-04-23","precision":"day","basis_id":"document-date:df6eeb70-a24a-4e3f-9ea8-55faa8fcabfd:2026-04-23","milestones":[{"kind":"document_date","date":"2026-04-23"}]}},{"candidate_id":"a5457418-1a23-4345-8fb7-788d07123aa8","capture_id":"b556327b-1053-4ea2-bdf8-464cd3133c35","article_id":"8cd6f366-1254-4ef9-97cd-f4057520bc80","content_hash":"ff60158e4e80cce95b8c0dae955becc91791a536b92458fc7ce8643bac03c7b5","url":"https://public-inspection.federalregister.gov/2026-17533.pdf","span_start":0,"span_end":142,"source_field":"body_text","excerpt":"The Department of Justice is publishing a report submitted to Congress concerning records released and withheld pursuant to Public Law 119-38.","origin_id":"doj-executive","dependency_id":"efta-fr-2026-17533","semantic_kind":"publication_notice","statement":"Formal publication milestone for withholding report.","remaining_uncertainty":"PDF extraction whitespace normalized; words unchanged. Signed August 21, filed August 26, published August 27. Publication does not establish compliance; no appendix retained.","event_time_rules":{"date":"2026-08-27","precision":"day","basis_id":"document-date:b556327b-1053-4ea2-bdf8-464cd3133c35:2026-08-27","milestones":[{"kind":"signed","date":"2026-08-21"},{"kind":"filed","date":"2026-08-26"},{"kind":"published","date":"2026-08-27"}]}}]$scope$::jsonb) x;
create table mip_identity.efta_identity_resolutions(
 id uuid primary key,scope_origin text not null,entity jsonb not null,
 predecessor uuid references mip_identity.efta_identity_resolutions,
 state text not null check(state in ('resolved','revoked')),
 reviewer text not null,reason text not null,actor text not null,
 recorded_at timestamptz not null default clock_timestamp()
);
create unique index efta_identity_successor on mip_identity.efta_identity_resolutions(predecessor) where predecessor is not null;
create table mip_identity.efta_decisions(
 id uuid primary key,candidate_id uuid not null references mip_identity.efta_scope,
 predecessor uuid references mip_identity.efta_decisions,
 action text not null check(action in ('approve','correct','reverse')),
 review jsonb not null,binding_hash text not null,actor text not null,
 recorded_at timestamptz not null default clock_timestamp()
);
create unique index efta_one_successor on mip_identity.efta_decisions(predecessor) where predecessor is not null;
create table mip_identity.efta_admissions(
 request_id uuid primary key,decision_id uuid not null unique references mip_identity.efta_decisions,
 runtime text not null,receipt_hash text not null,recorded_at timestamptz not null default clock_timestamp()
);
create table mip_identity.efta_private_reads(
 request_id uuid primary key,runtime text not null,payload_hash text not null,
 decision_ids uuid[] not null,recorded_at timestamptz not null default clock_timestamp()
);
create function mip_identity.efta_current_binding(p_candidate uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b jsonb;c jsonb;k jsonb;a jsonb;canonical jsonb;
begin
 perform 1 from mip_identity.collector_fence where id for share;
 select binding into strict b from mip_identity.efta_scope where candidate_id=p_candidate;
 select to_jsonb(x) into strict k from evidence_pipeline.evidence_candidates x where x.id=p_candidate;
 select to_jsonb(x) into strict c from evidence_pipeline.article_captures x where x.id=(b->>'capture_id')::uuid;
 select to_jsonb(x) into strict a from public.articles x where x.id=(b->>'article_id')::uuid;
 if c->>'article_id' is distinct from b->>'article_id' or k->>'capture_id' is distinct from b->>'capture_id'
 or c->>'content_hash' is distinct from b->>'content_hash'
 or k->>'source_field' is distinct from b->>'source_field'
 or k->'span_start' is distinct from b->'span_start' or k->'span_end' is distinct from b->'span_end'
 or k->>'excerpt' is distinct from b->>'excerpt'
 or k->>'review_state' is distinct from 'pending' or c->>'review_state' is distinct from 'pending'
 or k->>'predecessor_candidate_id' is not null
 or k->>'event_node_id' is not null or k->>'related_node_id' is not null
 or k->>'place_id' is not null or k->>'spatial_revision_id' is not null
 then raise exception 'efta_exact_binding_denied';end if;
 if exists(select 1 from evidence_pipeline.article_captures x
 where x.article_id=(b->>'article_id')::uuid and (x.captured_at,x.id)>((c->>'captured_at')::timestamptz,(c->>'id')::uuid))
 or exists(select 1 from evidence_pipeline.evidence_candidates x where x.predecessor_candidate_id=p_candidate)
 then raise exception 'efta_replaced_evidence';end if;
 canonical:=jsonb_build_object('url',a->>'url','title',btrim(a->>'title'),'outlet',btrim(a->>'outlet'),
 'summary',nullif(a->>'summary',''),'body_text',nullif(a->>'body_text',''),'published_at',nullif(a->>'published_at','')::timestamptz);
 if c->'payload' is distinct from canonical or canonical->>'url' is distinct from b->>'url'
 or encode(sha256(convert_to((c->'payload')::text,'UTF8')),'hex') is distinct from b->>'content_hash'
 or substring(canonical->>(b->>'source_field') from (b->>'span_start')::int+1 for (b->>'span_end')::int-(b->>'span_start')::int) is distinct from b->>'excerpt'
 or a->>'reader_state' is distinct from 'pending_review'
 or a->>'source_status' is distinct from 'active'
 then raise exception 'efta_stale_source';end if;
 if not exists(select 1 from mip_identity.source_changes where relation_name='public.articles' and row_key=b->>'article_id') then raise exception 'efta_source_revision_missing';end if;
 return b||jsonb_build_object('capture_payload',c->'payload','candidate_record',k,'article_record',a,
 'collector_revision',(select id from mip_identity.source_changes where relation_name='public.articles' and row_key=b->>'article_id' order by retained_at desc,id desc limit 1),
 'capture_revision',(select id from mip_identity.source_changes where relation_name='evidence_pipeline.article_captures' and row_key=b->>'capture_id' order by retained_at desc,id desc limit 1),
 'candidate_revision',(select id from mip_identity.source_changes where relation_name='evidence_pipeline.evidence_candidates' and row_key=b->>'candidate_id' order by retained_at desc,id desc limit 1));
end $$;
create trigger efta_capture_fence before insert or update or delete or truncate on evidence_pipeline.article_captures
 for each statement execute function mip_identity.collector_lock();
create trigger efta_candidate_fence before insert or update or delete or truncate on evidence_pipeline.evidence_candidates
 for each statement execute function mip_identity.collector_lock();
create trigger efta_capture_change after insert or update or delete on evidence_pipeline.article_captures
 for each row execute function mip_identity.collector_change('id');
create trigger efta_candidate_change after insert or update or delete on evidence_pipeline.evidence_candidates
 for each row execute function mip_identity.collector_change('id');
create function mip_identity.efta_resolve_identity(p_request uuid,p_origin text,p_entity jsonb,p_predecessor uuid,p_state text,p_reviewer text,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare prior mip_identity.efta_identity_resolutions;latest mip_identity.efta_identity_resolutions;
begin
 perform 1 from mip_cutover_authority.publication_fence where id for update;
 if not exists(select 1 from mip_identity.efta_scope where binding->>'origin_id'=p_origin)
 or p_state is null or p_state not in ('resolved','revoked')
 or nullif(btrim(p_reviewer),'') is null or nullif(btrim(p_reason),'') is null
 or p_entity->>'kind' is distinct from 'institution'
 or nullif(btrim(p_entity->>'namespace'),'') is null or nullif(btrim(p_entity->>'id'),'') is null
 or nullif(btrim(p_entity->>'label'),'') is null or nullif(btrim(p_entity->>'resolution_ref'),'') is null
 then raise exception 'efta_identity_review_required';end if;
 select * into prior from mip_identity.efta_identity_resolutions where id=p_request;
 if found then
 if prior.scope_origin is distinct from p_origin or prior.entity is distinct from p_entity or prior.predecessor is distinct from p_predecessor
 or prior.state is distinct from p_state or prior.reviewer is distinct from p_reviewer or prior.reason is distinct from p_reason
 then raise exception 'efta_replay_conflict';end if;
 if exists(select 1 from mip_identity.efta_identity_resolutions where predecessor=prior.id) then raise exception 'efta_identity_replaced';end if;
 return prior.id;end if;
 select r.* into latest from mip_identity.efta_identity_resolutions r where scope_origin=p_origin
 and not exists(select 1 from mip_identity.efta_identity_resolutions n where n.predecessor=r.id);
 if latest.id is distinct from p_predecessor or (latest.id is null and p_state='revoked') then raise exception 'efta_identity_predecessor';end if;
 if p_state='revoked' and p_entity is distinct from latest.entity then raise exception 'efta_identity_drift';end if;
 -- A canonical namespace/id cannot denote two different institutional records.
 if exists(select 1 from mip_identity.efta_identity_resolutions r where r.scope_origin<>p_origin
 and r.entity->>'namespace'=p_entity->>'namespace' and r.entity->>'id'=p_entity->>'id'
 and r.entity is distinct from p_entity) then raise exception 'efta_identity_ambiguous';end if;
 insert into mip_identity.efta_identity_resolutions(id,scope_origin,entity,predecessor,state,reviewer,reason,actor)
 values(p_request,p_origin,p_entity,p_predecessor,p_state,p_reviewer,p_reason,session_user);
 return p_request;
end $$;
create function mip_identity.efta_require_identity(p_review jsonb,p_binding jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare r mip_identity.efta_identity_resolutions;
begin
 select * into r from mip_identity.efta_identity_resolutions where id=(p_review->>'identity_resolution_id')::uuid;
 if r.id is null or r.state<>'resolved' or r.scope_origin is distinct from p_binding->>'origin_id'
 or r.entity is distinct from p_review->'entity'
 or exists(select 1 from mip_identity.efta_identity_resolutions where predecessor=r.id)
 then raise exception 'efta_identity_unresolved_or_stale';end if;
end $$;
create function mip_identity.efta_decide(p_request uuid,p_candidate uuid,p_action text,p_predecessor uuid,p_review jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare b jsonb;prior mip_identity.efta_decisions;latest mip_identity.efta_decisions;binding_hash text;
begin
 perform 1 from mip_identity.collector_fence where id for share;
 perform 1 from mip_cutover_authority.publication_fence where id for update;
 select * into prior from mip_identity.efta_decisions where id=p_request;
 if found then
 if prior.candidate_id is distinct from p_candidate or prior.action is distinct from p_action
 or prior.predecessor is distinct from p_predecessor or prior.review is distinct from p_review
 then raise exception 'efta_replay_conflict';end if;
 if exists(select 1 from mip_identity.efta_decisions where predecessor=prior.id) then raise exception 'efta_decision_replaced';end if;
 if prior.action<>'reverse' then
 b:=mip_identity.efta_current_binding(p_candidate);
 if comparison_qualification.argument_digest(b) is distinct from prior.binding_hash then raise exception 'efta_stale_review';end if;
 perform mip_identity.efta_require_identity(prior.review,b);
 end if;
 return prior.id;
 end if;
 if p_action is null or p_action not in ('approve','correct','reverse')
 or jsonb_typeof(p_review) is distinct from 'object'
 or nullif(btrim(p_review->>'reason'),'') is null
 or nullif(btrim(p_review->>'reviewer'),'') is null then raise exception 'efta_review_required';end if;
 select * into latest from mip_identity.efta_decisions where candidate_id=p_candidate order by recorded_at desc,id desc limit 1;
 if latest.id is distinct from p_predecessor or (p_action='approve' and latest.id is not null)
 or (p_action in ('correct','reverse') and latest.id is null)
 then raise exception 'efta_predecessor_conflict';end if;
 if p_action='reverse' then binding_hash:=latest.binding_hash;
 else
 b:=mip_identity.efta_current_binding(p_candidate);binding_hash:=comparison_qualification.argument_digest(b);
 if p_review->>'semantic_kind' is distinct from b->>'semantic_kind'
 or p_review->>'audience' is distinct from 'isolated_internal_review'
 or p_review->'publication_allowed' is distinct from 'false'::jsonb
 or p_review ? 'geography' or p_review ? 'place_id'
 or p_review->>'uncertainty' is distinct from b->>'remaining_uncertainty'
 or nullif(btrim(p_review->>'owner_authorization_ref'),'') is null
 or nullif(btrim(p_review->>'privacy_ref'),'') is null
 or nullif(btrim(p_review->>'rights_ref'),'') is null
 or p_review#>>'{event_time,precision}' is distinct from 'day'
 or p_review#>>'{event_time,date}' !~ '^\d{4}-\d{2}-\d{2}$'
 or p_review#>>'{event_time,date}' is null
 or nullif(btrim(p_review#>>'{event_time,evidence_basis}'),'') is null
 or p_review#>>'{event_time,evidence_basis}' is distinct from b#>>'{event_time_rules,basis_id}'
 or p_review#>>'{event_time,date}' is distinct from b#>>'{event_time_rules,date}'
 or nullif(btrim(p_review#>>'{event_time,uncertainty}'),'') is null
 or p_review#>>'{entity,kind}' is distinct from 'institution'
 or nullif(btrim(p_review#>>'{entity,namespace}'),'') is null
 or nullif(btrim(p_review#>>'{entity,id}'),'') is null
 or nullif(btrim(p_review#>>'{entity,label}'),'') is null
 or nullif(btrim(p_review#>>'{entity,resolution_ref}'),'') is null
 then raise exception 'efta_review_binding_required';end if;
 perform (p_review#>>'{event_time,date}')::date;
 perform mip_identity.efta_require_identity(p_review,b);
 -- Stable institutional identity cannot silently be relabelled between admissions.
 if exists(select 1 from mip_identity.efta_decisions d where d.action<>'reverse'
 and d.review#>>'{entity,namespace}'=p_review#>>'{entity,namespace}'
 and d.review#>>'{entity,id}'=p_review#>>'{entity,id}'
 and d.review->'entity' is distinct from p_review->'entity')
 then raise exception 'efta_identity_conflict';end if;
 end if;
 insert into mip_identity.efta_decisions(id,candidate_id,predecessor,action,review,binding_hash,actor)
 values(p_request,p_candidate,p_predecessor,p_action,p_review,binding_hash,session_user);
 return p_request;
end $$;
create function mip_identity.efta_admit(p_request uuid,p_session uuid,p_runtime text,p_decision uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare d mip_identity.efta_decisions;b jsonb;h text;prior mip_identity.efta_admissions;
begin
 perform mip_identity.authorize(p_session,p_runtime,'mip_projection_publisher_v1');
 perform 1 from mip_identity.collector_fence where id for share;
 perform 1 from mip_cutover_authority.publication_fence where id for update;
 select * into strict d from mip_identity.efta_decisions where id=p_decision;
 if d.action='reverse' or exists(select 1 from mip_identity.efta_decisions where predecessor=d.id) then raise exception 'efta_decision_replaced';end if;
 b:=mip_identity.efta_current_binding(d.candidate_id);
 if comparison_qualification.argument_digest(b)<>d.binding_hash then raise exception 'efta_stale_review';end if;
 perform mip_identity.efta_require_identity(d.review,b);
 h:=comparison_qualification.argument_digest(jsonb_build_object('decision',to_jsonb(d),'runtime',p_runtime));
 select * into prior from mip_identity.efta_admissions where request_id=p_request;
 if found then
 if prior.decision_id is distinct from p_decision or prior.runtime is distinct from p_runtime or prior.receipt_hash is distinct from h then raise exception 'efta_replay_conflict';end if;
 return p_request;end if;
 insert into mip_identity.efta_admissions values(p_request,p_decision,p_runtime,h,clock_timestamp());
 perform mip_identity.authorize(p_session,p_runtime,'mip_projection_publisher_v1');
 return p_request;
end $$;
create function mip_identity.efta_private_read(p_request uuid,p_session uuid,p_runtime text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d mip_identity.efta_decisions;b jsonb;items jsonb:='[]';result jsonb;ids uuid[]:='{}';h text;prior mip_identity.efta_private_reads;
begin
 perform mip_identity.authorize(p_session,p_runtime,'mip_projection_publisher_v1');
 perform 1 from mip_identity.collector_fence where id for share;
 perform 1 from mip_cutover_authority.publication_fence where id for update;
 for d in select decision_row.* from mip_identity.efta_decisions decision_row join mip_identity.efta_admissions a on a.decision_id=decision_row.id
 where a.runtime=p_runtime and decision_row.action<>'reverse'
 and not exists(select 1 from mip_identity.efta_decisions n where n.predecessor=decision_row.id)
 order by decision_row.candidate_id loop
 b:=mip_identity.efta_current_binding(d.candidate_id);
 if comparison_qualification.argument_digest(b)<>d.binding_hash then raise exception 'efta_stale_review';end if;
 perform mip_identity.efta_require_identity(d.review,b);
 items:=items||jsonb_build_array((b-'capture_payload'-'candidate_record'-'article_record')||
 jsonb_build_object('decision_id',d.id,'predecessor',d.predecessor,'review',d.review,'reviewed_at',d.recorded_at));
 ids:=array_append(ids,d.id);
 end loop;
 result:=jsonb_build_object('contract','efta-private-review-v1','state','private_review','sources',items,
 'public_release',false,'comparison',jsonb_build_object('state','unavailable','reason','Approved comparison and independent-evidence gates remain unsatisfied'),
 'world_view',jsonb_build_object('state','absent','reason','No reviewed geography'));
 h:=comparison_qualification.argument_digest(result);
 select * into prior from mip_identity.efta_private_reads where request_id=p_request;
 if found then
 if prior.runtime is distinct from p_runtime or prior.payload_hash is distinct from h or prior.decision_ids is distinct from ids then raise exception 'efta_replay_conflict';end if;
 else insert into mip_identity.efta_private_reads values(p_request,p_runtime,h,ids,clock_timestamp());end if;
 perform mip_identity.authorize(p_session,p_runtime,'mip_projection_publisher_v1');
 return result||jsonb_build_object('receipt_id',p_request,'payload_hash',h);
end $$;
-- No wrapper around release_public, no new general publication path.
-- Qualified comparison generations must still use 007 release_isolated and its immutable receipts.
do $permissions$
declare t text;f record;
begin
 foreach t in array array['efta_scope','efta_identity_resolutions','efta_decisions','efta_admissions','efta_private_reads'] loop
 execute format('alter table mip_identity.%I owner to mip_cutover_schema_owner_v1',t);
 execute format('alter table mip_identity.%I enable row level security',t);
 execute format('alter table mip_identity.%I force row level security',t);
 execute format('revoke all on mip_identity.%I from public,anon,authenticated,service_role,mip_comparison_worker_v1,mip_comparison_producer_v1,mip_projection_publisher_v1,mip_factual_reviewer_v3',t);
 execute format('grant select on mip_identity.%I to mip_publication_owner_v2',t);
 execute format('create policy efta_read on mip_identity.%I for select to mip_publication_owner_v2 using(true)',t);
 execute format('create trigger immutable before update or delete on mip_identity.%I for each row execute function comparison_qualification.reject_rewrite()',t);
 execute format('create trigger no_truncate before truncate on mip_identity.%I for each statement execute function comparison_qualification.reject_rewrite()',t);
 end loop;
 foreach t in array array['efta_identity_resolutions','efta_decisions','efta_admissions','efta_private_reads'] loop
 execute format('grant insert on mip_identity.%I to mip_publication_owner_v2',t);
 execute format('create policy efta_append on mip_identity.%I for insert to mip_publication_owner_v2 with check(true)',t);
 end loop;
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mip_identity' and p.proname like 'efta_%' loop
 execute 'alter function '||f.sig||' owner to mip_publication_owner_v2';
 execute 'revoke all on function '||f.sig||' from public,anon,authenticated,service_role';
 end loop;
end $permissions$;
grant usage on schema evidence_pipeline to mip_publication_owner_v2;
grant select on mip_identity.source_changes to mip_publication_owner_v2;
create policy efta_source_history on mip_identity.source_changes for select to mip_publication_owner_v2 using(
 (relation_name='public.articles' and row_key in (select binding->>'article_id' from mip_identity.efta_scope))
 or (relation_name='evidence_pipeline.article_captures' and row_key in (select binding->>'capture_id' from mip_identity.efta_scope))
 or (relation_name='evidence_pipeline.evidence_candidates' and row_key in (select candidate_id::text from mip_identity.efta_scope)));
grant select on public.articles to mip_publication_owner_v2;
create policy efta_article_read on public.articles for select to mip_publication_owner_v2 using(id in (select (binding->>'article_id')::uuid from mip_identity.efta_scope));
grant select on evidence_pipeline.article_captures,evidence_pipeline.evidence_candidates to mip_publication_owner_v2;
create policy efta_capture_read on evidence_pipeline.article_captures for select to mip_publication_owner_v2 using(article_id in (select (binding->>'article_id')::uuid from mip_identity.efta_scope));
create policy efta_candidate_read on evidence_pipeline.evidence_candidates for select to mip_publication_owner_v2 using(
 id in (select candidate_id from mip_identity.efta_scope)
 or predecessor_candidate_id in (select candidate_id from mip_identity.efta_scope)
 or capture_id in (select id from evidence_pipeline.article_captures where article_id in (select (binding->>'article_id')::uuid from mip_identity.efta_scope)));
grant usage on schema mip_identity to mip_factual_reviewer_v3;
grant execute on function mip_identity.efta_resolve_identity(uuid,text,jsonb,uuid,text,text,text) to mip_factual_reviewer_v3;
grant execute on function mip_identity.efta_decide(uuid,uuid,text,uuid,jsonb) to mip_factual_reviewer_v3;
grant execute on function mip_identity.efta_admit(uuid,uuid,text,uuid),mip_identity.efta_private_read(uuid,uuid,text) to mip_projection_publisher_v1;

-- Qualification-remediation hardening. This same transaction replaces the proposal-only
-- EFTA authority surface above; any failure rolls back all of 011 rather than leaving its
-- temporary broader grants or incomplete objects behind.
-- It is still opt-in, private, non-production, and creates no approved assignment,
-- canonical-identity head, permission head, admission, or public/canonical projection row.

do $roles$ begin
 if not exists(select 1 from pg_roles where rolname='mip_efta_owner_v1') then
  create role mip_efta_owner_v1 nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
 end if;
 if not exists(select 1 from pg_roles where rolname='mip_efta_reviewer_v1') then
  create role mip_efta_reviewer_v1 nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
 end if;
 if not exists(select 1 from pg_roles where rolname='mip_efta_admitter_v1') then
  create role mip_efta_admitter_v1 nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
 end if;
 if not exists(select 1 from pg_roles where rolname='mip_efta_private_reader_v1') then
  create role mip_efta_private_reader_v1 nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
 end if;
end $roles$;

-- Extend only the broker mapping vocabulary. These principals receive no LOGIN and no
-- membership in the older factual-review or projection-publication roles.
alter table mip_identity.mapping_versions drop constraint mapping_versions_principal_check;
alter table mip_identity.mapping_versions add constraint mapping_versions_principal_check check(principal in (
 'mip_comparison_worker_v1','mip_comparison_producer_v1',
 'mip_efta_reviewer_v1','mip_efta_admitter_v1','mip_efta_private_reader_v1'));

-- Remove the proposal-only external entry points and their broader-role grants.
drop function mip_identity.efta_resolve_identity(uuid,text,jsonb,uuid,text,text,text);
drop function mip_identity.efta_decide(uuid,uuid,text,uuid,jsonb);
drop function mip_identity.efta_admit(uuid,uuid,text,uuid);
drop function mip_identity.efta_private_read(uuid,uuid,text);
drop function mip_identity.efta_require_identity(jsonb,jsonb);
drop table mip_identity.efta_private_reads;
drop table mip_identity.efta_admissions;
drop table mip_identity.efta_decisions;
drop table mip_identity.efta_identity_resolutions;

create table mip_identity.efta_authority_assignment_versions(
 revision uuid primary key,
 subject_id uuid not null,
 subject_principal text generated always as ('auth_user:'||subject_id::text) stored,
 database_principal text not null check(database_principal in (
  'mip_efta_reviewer_v1','mip_efta_admitter_v1','mip_efta_private_reader_v1')),
 scope text not null check(scope='efta-bounded-demo-v1'),
 mapping_revision uuid not null references mip_identity.mapping_versions,
 key_revision uuid not null references mip_identity.key_versions,
 predecessor uuid references mip_identity.efta_authority_assignment_versions,
 approval_state text not null check(approval_state in ('proposed','owner_approved','revoked','rejected')),
 owner_approval_receipt_hash text,
 reason text not null check(length(btrim(reason))>0),
 valid_from timestamptz not null check(isfinite(valid_from)),
 valid_until timestamptz not null check(isfinite(valid_until) and valid_until>valid_from),
 created_at timestamptz not null default clock_timestamp(),
 check((approval_state='owner_approved' and owner_approval_receipt_hash ~ '^[0-9a-f]{64}$')
    or (approval_state<>'owner_approved' and owner_approval_receipt_hash is null)),
 unique(subject_id,database_principal,revision)
);
create unique index efta_assignment_successor on mip_identity.efta_authority_assignment_versions(predecessor)
 where predecessor is not null;
create table mip_identity.efta_authority_assignment_heads(
 subject_id uuid not null,database_principal text not null,
 revision uuid not null references mip_identity.efta_authority_assignment_versions,
 active boolean not null,
 primary key(subject_id,database_principal)
);

create table mip_identity.efta_institution_versions(
 revision uuid primary key,
 institution_id uuid not null,
 normalized_label text not null check(length(btrim(normalized_label))>0),
 institution_kind text not null check(institution_kind in ('legislature','executive_department','inspector_general')),
 parent_institution_id uuid,
 predecessor uuid references mip_identity.efta_institution_versions,
 state text not null check(state in ('proposed','current','superseded','revoked','rejected')),
 approval_state text not null check(approval_state in ('proposed_unapproved','owner_approved','owner_rejected')),
 proposal_receipt jsonb not null check(jsonb_typeof(proposal_receipt)='object'),
 proposal_receipt_hash text not null check(proposal_receipt_hash ~ '^[0-9a-f]{64}$'),
 owner_approval_receipt_hash text,
 created_at timestamptz not null default clock_timestamp(),
 check((approval_state='owner_approved' and state='current' and owner_approval_receipt_hash ~ '^[0-9a-f]{64}$')
    or (approval_state<>'owner_approved' and owner_approval_receipt_hash is null)),
 unique(institution_id,revision)
);
create unique index efta_institution_successor on mip_identity.efta_institution_versions(predecessor)
 where predecessor is not null;
create table mip_identity.efta_institution_heads(
 institution_id uuid primary key,
 revision uuid not null references mip_identity.efta_institution_versions,
 active boolean not null
);

-- Deterministic UUIDv5 proposal identities. These rows are explicitly unapproved and are
-- not entered into efta_institution_heads, so they cannot satisfy efta_require_identity.
insert into mip_identity.efta_institution_versions(
 revision,institution_id,normalized_label,institution_kind,parent_institution_id,predecessor,
 state,approval_state,proposal_receipt,proposal_receipt_hash)
select x.revision,x.institution_id,x.normalized_label,x.institution_kind,x.parent_id,null,
 'proposed','proposed_unapproved',x.receipt,
 comparison_qualification.argument_digest(x.receipt)
from (values
 ('d8428b15-0827-599b-8856-f1dbf89e584b'::uuid,'62bb9132-5a8a-581f-992f-f0a38ae78e39'::uuid,
  'United States Congress','legislature',null::uuid,
  jsonb_build_object('contract','efta-institution-proposal-v1','owner_approved',false,
   'deterministic_name','https://mip.invalid/institution/us-congress','origin_ids',jsonb_build_array('us-congress-enacted-law'))),
 ('6875d412-6b9a-512f-a8b5-dd03ccaf7e76'::uuid,'a95e3f14-f75d-5718-a7b3-55e4c4e055a9'::uuid,
  'United States Department of Justice','executive_department',null::uuid,
  jsonb_build_object('contract','efta-institution-proposal-v1','owner_approved',false,
   'deterministic_name','https://mip.invalid/institution/us-doj','origin_ids',jsonb_build_array('doj-executive'))),
 ('c50912f4-0fd0-5fd4-9034-08d20b092c75'::uuid,'d9e9e444-d183-5e9e-b4cb-f0b4670723a3'::uuid,
  'U.S. Department of Justice Office of Inspector General','inspector_general','a95e3f14-f75d-5718-a7b3-55e4c4e055a9'::uuid,
  jsonb_build_object('contract','efta-institution-proposal-v1','owner_approved',false,
   'deterministic_name','https://mip.invalid/institution/us-doj-oig','origin_ids',jsonb_build_array('doj-oig'),
   'parent_institution_id','a95e3f14-f75d-5718-a7b3-55e4c4e055a9'))
) x(revision,institution_id,normalized_label,institution_kind,parent_id,receipt);

create table mip_identity.efta_identity_resolutions(
 id uuid primary key,scope_origin text not null,
 institution_revision uuid not null references mip_identity.efta_institution_versions,
 predecessor uuid references mip_identity.efta_identity_resolutions,
 state text not null check(state in ('resolved','revoked')),
 reason text not null check(length(btrim(reason))>0),
 subject_id uuid not null,assignment_revision uuid not null references mip_identity.efta_authority_assignment_versions,
 authentication_revision uuid not null,broker_session uuid not null references mip_identity.sessions,
 mapping_revision uuid not null references mip_identity.mapping_versions,
 key_revision uuid not null references mip_identity.key_versions,
 authority_receipt_hash text not null check(authority_receipt_hash ~ '^[0-9a-f]{64}$'),
 database_actor text not null,recorded_at timestamptz not null default clock_timestamp()
);
create unique index efta_identity_successor_v2 on mip_identity.efta_identity_resolutions(predecessor)
 where predecessor is not null;

create table mip_identity.efta_operation_evidence_versions(
 revision uuid primary key,candidate_id uuid not null references mip_identity.efta_scope,
 operation text not null check(operation in ('retention','analysis','excerpt_display')),
 domain text not null check(domain in ('rights','privacy')),
 audience text not null check(audience='isolated_internal_review'),
 capture_id uuid not null,content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'),
 evidence_ref text not null check(length(btrim(evidence_ref))>0),
 evidence_hash text not null check(evidence_hash ~ '^[0-9a-f]{64}$'),
 authority_adapter text not null check(authority_adapter='efta-authoritative-rights-privacy-v1'),
 disposition text not null check(disposition in ('allow','deny','unknown','withdrawn','conflicting')),
 approval_state text not null check(approval_state in ('proposed','owner_approved','revoked','rejected')),
 owner_approval_receipt_hash text,
 non_fixture boolean not null,
 valid_from timestamptz not null check(isfinite(valid_from)),
 valid_until timestamptz not null check(isfinite(valid_until) and valid_until>valid_from),
 created_at timestamptz not null default clock_timestamp(),
 check((approval_state='owner_approved' and owner_approval_receipt_hash ~ '^[0-9a-f]{64}$')
    or (approval_state<>'owner_approved' and owner_approval_receipt_hash is null)),
 unique(candidate_id,operation,domain,revision)
);
create table mip_identity.efta_operation_evidence_heads(
 candidate_id uuid not null,operation text not null,domain text not null,
 revision uuid not null references mip_identity.efta_operation_evidence_versions,
 active boolean not null,primary key(candidate_id,operation,domain)
);

create table mip_identity.efta_decisions(
 id uuid primary key,candidate_id uuid not null references mip_identity.efta_scope,
 predecessor uuid references mip_identity.efta_decisions,
 action text not null check(action in ('approve','correct','reverse')),
 review jsonb not null,binding_hash text not null,operation_receipt_hash text not null,
 identity_resolution_id uuid references mip_identity.efta_identity_resolutions,
 subject_id uuid not null,assignment_revision uuid not null references mip_identity.efta_authority_assignment_versions,
 authentication_revision uuid not null,broker_session uuid not null references mip_identity.sessions,
 mapping_revision uuid not null references mip_identity.mapping_versions,key_revision uuid not null references mip_identity.key_versions,
 authority_receipt_hash text not null check(authority_receipt_hash ~ '^[0-9a-f]{64}$'),
 database_actor text not null,recorded_at timestamptz not null default clock_timestamp()
);
create unique index efta_one_successor_v2 on mip_identity.efta_decisions(predecessor) where predecessor is not null;
create table mip_identity.efta_admissions(
 request_id uuid primary key,decision_id uuid not null unique references mip_identity.efta_decisions,
 runtime text not null,operation_receipt_hash text not null,receipt_hash text not null,
 subject_id uuid not null,assignment_revision uuid not null references mip_identity.efta_authority_assignment_versions,
 authentication_revision uuid not null,broker_session uuid not null references mip_identity.sessions,
 mapping_revision uuid not null references mip_identity.mapping_versions,key_revision uuid not null references mip_identity.key_versions,
 authority_receipt_hash text not null check(authority_receipt_hash ~ '^[0-9a-f]{64}$'),
 database_actor text not null,recorded_at timestamptz not null default clock_timestamp()
);
create table mip_identity.efta_private_reads(
 request_id uuid primary key,runtime text not null,payload_hash text not null,
 decision_ids uuid[] not null,operation_receipt_hash text not null,
 subject_id uuid not null,assignment_revision uuid not null references mip_identity.efta_authority_assignment_versions,
 authentication_revision uuid not null,broker_session uuid not null references mip_identity.sessions,
 mapping_revision uuid not null references mip_identity.mapping_versions,key_revision uuid not null references mip_identity.key_versions,
 authority_receipt_hash text not null check(authority_receipt_hash ~ '^[0-9a-f]{64}$'),
 database_actor text not null,recorded_at timestamptz not null default clock_timestamp()
);

-- Authority context is SECURITY INVOKER. It is callable only by the six EFTA definers'
-- owner and derives every field from immutable relational state, never a caller JSON blob.
create function mip_identity.authority_context(
 p_session uuid,p_runtime text,p_assignment uuid,p_expected_principal text
) returns jsonb language plpgsql set search_path='' as $$
declare a mip_identity.efta_authority_assignment_versions;h mip_identity.efta_authority_assignment_heads;
 s mip_identity.sessions;m mip_identity.mapping_versions;k mip_identity.key_versions;auth_revision uuid;result jsonb;
begin
 perform mip_identity.authorize(p_session,p_runtime,p_expected_principal);
 select * into strict a from mip_identity.efta_authority_assignment_versions where revision=p_assignment;
 select * into h from mip_identity.efta_authority_assignment_heads
  where subject_id=a.subject_id and database_principal=a.database_principal;
 if h.revision is distinct from a.revision or h.active is distinct from true
 or a.database_principal is distinct from p_expected_principal or a.scope<>'efta-bounded-demo-v1'
 or a.approval_state<>'owner_approved' or a.valid_from>clock_timestamp() or a.valid_until<=clock_timestamp()
 then raise exception 'efta_assignment_not_authorized';end if;
 select * into strict s from mip_identity.sessions where session_id=p_session;
 select * into strict m from mip_identity.mapping_versions where revision=s.mapping_revision;
 select * into strict k from mip_identity.key_versions where revision=s.key_revision;
 if s.mapping_revision is distinct from a.mapping_revision or s.key_revision is distinct from a.key_revision
 or m.runtime is distinct from p_runtime or m.principal is distinct from p_expected_principal
 or m.subject is distinct from a.subject_principal or m.key_revision is distinct from k.revision
 then raise exception 'efta_authenticated_subject_mismatch';end if;
 select ps.session_id into strict auth_revision from comparison_qualification.principal_sessions ps
 where ps.session_id=p_session and ps.runtime_id=p_runtime and ps.principal=p_expected_principal
 and ps.revoked_at is null and ps.expires_at>clock_timestamp();
 result:=jsonb_build_object('subject_id',a.subject_id,'subject_principal',a.subject_principal,
  'assignment_revision',a.revision,'authentication_revision',auth_revision,'broker_session',p_session,
  'mapping_revision',s.mapping_revision,'key_revision',s.key_revision,'runtime',p_runtime,
  'database_principal',p_expected_principal,'token_hash',s.token_hash);
 return result||jsonb_build_object('authority_receipt_hash',comparison_qualification.argument_digest(result));
end $$;

alter function mip_identity.operation_check(jsonb) rename to operation_check_pre_efta_v4;
create function mip_identity.operation_check(p_scope jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare candidate uuid;b jsonb;v mip_identity.efta_operation_evidence_versions;
 h mip_identity.efta_operation_evidence_heads;reason text:='efta_authoritative_evidence_bound';
begin
 if p_scope->>'source_project' is distinct from 'efta-bounded-demo-v1' then
  return mip_identity.operation_check_pre_efta_v4(p_scope);end if;
 if p_scope->>'material_ref' !~ '^candidate:[0-9a-f-]{36}$' then
  return jsonb_build_object('allowed',false,'reason','efta_material_ref_invalid');end if;
 candidate:=substring(p_scope->>'material_ref' from 11)::uuid;
 select binding into b from mip_identity.efta_scope where candidate_id=candidate;
 select * into h from mip_identity.efta_operation_evidence_heads
  where candidate_id=candidate and operation=p_scope->>'operation' and domain=p_scope->>'domain';
 select * into v from mip_identity.efta_operation_evidence_versions where revision=h.revision;
 if b is null then reason:='efta_candidate_out_of_scope';
 elsif p_scope->>'audience' is distinct from 'isolated_internal_review' then reason:='audience_denied';
 elsif p_scope->>'operation' not in ('retention','analysis','excerpt_display') then reason:='operation_denied';
 elsif p_scope->>'domain' not in ('rights','privacy') then reason:='domain_denied';
 elsif p_scope->>'material_version' is distinct from b->>'content_hash'
 or p_scope->>'capture_id' is distinct from b->>'capture_id' then reason:='material_version_mismatch';
 elsif h.revision is null then reason:='missing_operation_evidence';
 elsif h.active is distinct from true then reason:='revoked_operation_evidence';
 elsif v.candidate_id is distinct from candidate or v.capture_id::text is distinct from b->>'capture_id'
 or v.content_hash is distinct from b->>'content_hash' then reason:='evidence_binding_mismatch';
 elsif v.authority_adapter<>'efta-authoritative-rights-privacy-v1' or not v.non_fixture then reason:='authoritative_adapter_unbound';
 elsif v.approval_state<>'owner_approved' then reason:='approval_'||v.approval_state;
 elsif v.disposition<>'allow' then reason:='permission_'||v.disposition;
 elsif v.valid_from>clock_timestamp() then reason:='permission_not_effective';
 elsif v.valid_until<=clock_timestamp() then reason:='permission_expired';
 end if;
 return jsonb_build_object('allowed',reason='efta_authoritative_evidence_bound','reason',reason,
  'scope',p_scope,'revision',v.revision,'synthetic',false,'non_fixture',v.non_fixture,
  'evidence_ref',v.evidence_ref,'evidence_hash',v.evidence_hash,
  'approval_receipt_hash',v.owner_approval_receipt_hash);
end $$;

create function mip_identity.operation_closure(p_candidate uuid,p_binding jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare op text;domain text;scope jsonb;checked jsonb;cells jsonb:='[]'::jsonb;
begin
 foreach op in array array['retention','analysis','excerpt_display'] loop
  foreach domain in array array['rights','privacy'] loop
   scope:=jsonb_build_object('source_project','efta-bounded-demo-v1','material_ref','candidate:'||p_candidate,
    'material_version',p_binding->>'content_hash','capture_id',p_binding->>'capture_id',
    'operation',op,'audience','isolated_internal_review','domain',domain);
   checked:=mip_identity.operation_check(scope);
   if checked->'allowed' is distinct from 'true'::jsonb then
    raise exception 'efta_operation_denied_%',checked->>'reason' using detail=checked::text;end if;
   cells:=cells||jsonb_build_array(jsonb_build_object('operation',op,'domain',domain,
    'revision',checked->>'revision','evidence_hash',checked->>'evidence_hash',
    'approval_receipt_hash',checked->>'approval_receipt_hash'));
  end loop;
 end loop;
 return jsonb_build_object('candidate_id',p_candidate,'cells',cells,
  'closure_hash',comparison_qualification.argument_digest(cells));
end $$;

create or replace function mip_identity.efta_current_binding(p_candidate uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b jsonb;c jsonb;k jsonb;a jsonb;canonical jsonb;
begin
 perform 1 from mip_identity.collector_fence where id for share;
 select binding into strict b from mip_identity.efta_scope where candidate_id=p_candidate;
 select to_jsonb(x) into strict k from evidence_pipeline.evidence_candidates x where x.id=p_candidate;
 select to_jsonb(x) into strict c from evidence_pipeline.article_captures x where x.id=(b->>'capture_id')::uuid;
 select to_jsonb(x) into strict a from public.articles x where x.id=(b->>'article_id')::uuid;
 if c->>'article_id' is distinct from b->>'article_id' or k->>'capture_id' is distinct from b->>'capture_id'
 or c->>'content_hash' is distinct from b->>'content_hash' or k->>'source_field' is distinct from b->>'source_field'
 or k->'span_start' is distinct from b->'span_start' or k->'span_end' is distinct from b->'span_end'
 or k->>'excerpt' is distinct from b->>'excerpt' or k->>'review_state' is distinct from 'pending'
 or c->>'review_state' is distinct from 'pending' or k->>'predecessor_candidate_id' is not null
 or k->>'event_node_id' is not null or k->>'related_node_id' is not null
 or k->>'place_id' is not null or k->>'spatial_revision_id' is not null then raise exception 'efta_exact_binding_denied';end if;
 if exists(select 1 from evidence_pipeline.article_captures x where x.article_id=(b->>'article_id')::uuid
 and (x.captured_at,x.id)>((c->>'captured_at')::timestamptz,(c->>'id')::uuid))
 or exists(select 1 from evidence_pipeline.evidence_candidates x where x.predecessor_candidate_id=p_candidate)
 then raise exception 'efta_replaced_evidence';end if;
 canonical:=jsonb_build_object('url',a->>'url','title',btrim(a->>'title'),'outlet',btrim(a->>'outlet'),
 'summary',nullif(a->>'summary',''),'body_text',nullif(a->>'body_text',''),'published_at',nullif(a->>'published_at','')::timestamptz);
 if c->'payload' is distinct from canonical or canonical->>'url' is distinct from b->>'url'
 or encode(sha256(convert_to((c->'payload')::text,'UTF8')),'hex') is distinct from b->>'content_hash'
 or substring(canonical->>(b->>'source_field') from (b->>'span_start')::int+1 for (b->>'span_end')::int-(b->>'span_start')::int) is distinct from b->>'excerpt'
 or a->>'reader_state' is distinct from 'pending_review' or a->>'source_status' is distinct from 'active'
 then raise exception 'efta_stale_source';end if;
 if not exists(select 1 from mip_identity.source_changes where relation_name='public.articles' and row_key=b->>'article_id')
 or not exists(select 1 from mip_identity.source_changes where relation_name='evidence_pipeline.article_captures' and row_key=b->>'capture_id')
 or not exists(select 1 from mip_identity.source_changes where relation_name='evidence_pipeline.evidence_candidates' and row_key=p_candidate::text)
 then raise exception 'efta_source_revision_missing';end if;
 return b||jsonb_build_object('capture_payload',c->'payload','candidate_record',k,'article_record',a,
 'collector_revision',(select id from mip_identity.source_changes where relation_name='public.articles' and row_key=b->>'article_id' order by retained_at desc,id desc limit 1),
 'capture_revision',(select id from mip_identity.source_changes where relation_name='evidence_pipeline.article_captures' and row_key=b->>'capture_id' order by retained_at desc,id desc limit 1),
 'candidate_revision',(select id from mip_identity.source_changes where relation_name='evidence_pipeline.evidence_candidates' and row_key=p_candidate::text order by retained_at desc,id desc limit 1));
end $$;

create function mip_identity.efta_require_identity(p_resolution uuid,p_binding jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r mip_identity.efta_identity_resolutions;v mip_identity.efta_institution_versions;h mip_identity.efta_institution_heads;
begin
 select * into strict r from mip_identity.efta_identity_resolutions where id=p_resolution;
 select * into strict v from mip_identity.efta_institution_versions where revision=r.institution_revision;
 select * into h from mip_identity.efta_institution_heads where institution_id=v.institution_id;
 if r.state<>'resolved' or r.scope_origin is distinct from p_binding->>'origin_id'
 or exists(select 1 from mip_identity.efta_identity_resolutions where predecessor=r.id)
 or v.approval_state<>'owner_approved' or v.state<>'current' or h.active is distinct from true
 or h.revision is distinct from v.revision then raise exception 'efta_identity_unresolved_or_stale';end if;
 if v.parent_institution_id is not null and not exists(select 1 from mip_identity.efta_institution_heads ph
 join mip_identity.efta_institution_versions pv on pv.revision=ph.revision
 where ph.institution_id=v.parent_institution_id and ph.active and pv.state='current' and pv.approval_state='owner_approved')
 then raise exception 'efta_identity_parent_unresolved';end if;
 return jsonb_build_object('resolution_id',r.id,'institution_id',v.institution_id,
  'institution_revision',v.revision,'label',v.normalized_label,'parent_institution_id',v.parent_institution_id,
  'owner_approval_receipt_hash',v.owner_approval_receipt_hash);
end $$;

create function mip_identity.efta_resolve_identity(
 p_request uuid,p_origin text,p_institution_revision uuid,p_predecessor uuid,p_state text,
 p_reason text,p_session uuid,p_runtime text,p_assignment uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare prior mip_identity.efta_identity_resolutions;latest mip_identity.efta_identity_resolutions;
 v mip_identity.efta_institution_versions;h mip_identity.efta_institution_heads;ctx jsonb;receipt text;
begin
 ctx:=mip_identity.authority_context(p_session,p_runtime,p_assignment,'mip_efta_reviewer_v1');
 perform 1 from mip_cutover_authority.publication_fence where id for update;
 if not exists(select 1 from mip_identity.efta_scope where binding->>'origin_id'=p_origin)
 or p_state not in ('resolved','revoked') or nullif(btrim(p_reason),'') is null then raise exception 'efta_identity_review_required';end if;
 select * into strict v from mip_identity.efta_institution_versions where revision=p_institution_revision;
 select * into h from mip_identity.efta_institution_heads where institution_id=v.institution_id;
 if v.approval_state<>'owner_approved' or v.state<>'current' or h.active is distinct from true or h.revision is distinct from v.revision
 then raise exception 'efta_identity_not_owner_approved';end if;
 if (p_origin='us-congress-enacted-law' and v.institution_id<>'62bb9132-5a8a-581f-992f-f0a38ae78e39'::uuid)
 or (p_origin='doj-executive' and v.institution_id<>'a95e3f14-f75d-5718-a7b3-55e4c4e055a9'::uuid)
 or (p_origin='doj-oig' and v.institution_id<>'d9e9e444-d183-5e9e-b4cb-f0b4670723a3'::uuid)
 then raise exception 'efta_identity_origin_mismatch';end if;
 select * into prior from mip_identity.efta_identity_resolutions where id=p_request;
 if found then
  if prior.scope_origin is distinct from p_origin or prior.institution_revision is distinct from p_institution_revision
  or prior.predecessor is distinct from p_predecessor or prior.state is distinct from p_state
  or prior.reason is distinct from p_reason or prior.assignment_revision is distinct from p_assignment
  then raise exception 'efta_replay_conflict';end if;return prior.id;
 end if;
 select r.* into latest from mip_identity.efta_identity_resolutions r where scope_origin=p_origin
 and not exists(select 1 from mip_identity.efta_identity_resolutions n where n.predecessor=r.id);
 if latest.id is distinct from p_predecessor or (latest.id is null and p_state='revoked') then raise exception 'efta_identity_predecessor';end if;
 receipt:=comparison_qualification.argument_digest(jsonb_build_object('request',p_request,'origin',p_origin,
  'institution_revision',p_institution_revision,'predecessor',p_predecessor,'state',p_state,'reason',p_reason,'authority',ctx));
 insert into mip_identity.efta_identity_resolutions values(p_request,p_origin,p_institution_revision,p_predecessor,p_state,p_reason,
  (ctx->>'subject_id')::uuid,(ctx->>'assignment_revision')::uuid,(ctx->>'authentication_revision')::uuid,
  (ctx->>'broker_session')::uuid,(ctx->>'mapping_revision')::uuid,(ctx->>'key_revision')::uuid,
  receipt,session_user,clock_timestamp());
 return p_request;
end $$;

create function mip_identity.efta_decide(
 p_request uuid,p_candidate uuid,p_action text,p_predecessor uuid,p_review jsonb,
 p_session uuid,p_runtime text,p_assignment uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare b jsonb;prior mip_identity.efta_decisions;latest mip_identity.efta_decisions;
 ctx jsonb;identity jsonb;operations jsonb;binding_hash text;operation_hash text;resolution uuid;receipt text;
begin
 ctx:=mip_identity.authority_context(p_session,p_runtime,p_assignment,'mip_efta_reviewer_v1');
 perform 1 from mip_identity.collector_fence where id for share;perform 1 from mip_cutover_authority.publication_fence where id for update;
 if p_action not in ('approve','correct','reverse') or jsonb_typeof(p_review) is distinct from 'object'
 or nullif(btrim(p_review->>'reason'),'') is null or p_review ?| array['reviewer','rights_ref','privacy_ref','owner_authorization_ref']
 then raise exception 'efta_review_required';end if;
 select * into prior from mip_identity.efta_decisions where id=p_request;
 if found then
  if prior.candidate_id is distinct from p_candidate or prior.action is distinct from p_action
  or prior.predecessor is distinct from p_predecessor or prior.review is distinct from p_review
  or prior.assignment_revision is distinct from p_assignment then raise exception 'efta_replay_conflict';end if;
  return prior.id;
 end if;
 select * into latest from mip_identity.efta_decisions where candidate_id=p_candidate order by recorded_at desc,id desc limit 1;
 if latest.id is distinct from p_predecessor or (p_action='approve' and latest.id is not null)
 or (p_action in ('correct','reverse') and latest.id is null) then raise exception 'efta_predecessor_conflict';end if;
 if p_action='reverse' then
  binding_hash:=latest.binding_hash;operation_hash:=latest.operation_receipt_hash;resolution:=latest.identity_resolution_id;
 else
  b:=mip_identity.efta_current_binding(p_candidate);operations:=mip_identity.operation_closure(p_candidate,b);
  binding_hash:=comparison_qualification.argument_digest(b);operation_hash:=operations->>'closure_hash';
  if p_review->>'semantic_kind' is distinct from b->>'semantic_kind'
  or p_review->>'audience' is distinct from 'isolated_internal_review'
  or p_review->'publication_allowed' is distinct from 'false'::jsonb
  or p_review ? 'geography' or p_review ? 'place_id'
  or p_review->>'uncertainty' is distinct from b->>'remaining_uncertainty'
  or p_review#>>'{event_time,precision}' is distinct from 'day'
  or p_review#>>'{event_time,date}' is distinct from b#>>'{event_time_rules,date}'
  or p_review#>>'{event_time,evidence_basis}' is distinct from b#>>'{event_time_rules,basis_id}'
  or nullif(btrim(p_review#>>'{event_time,uncertainty}'),'') is null
  or p_review->>'identity_resolution_id' is null then raise exception 'efta_review_binding_required';end if;
  perform (p_review#>>'{event_time,date}')::date;
  resolution:=(p_review->>'identity_resolution_id')::uuid;identity:=mip_identity.efta_require_identity(resolution,b);
 end if;
 receipt:=comparison_qualification.argument_digest(jsonb_build_object('request',p_request,'candidate',p_candidate,
  'action',p_action,'predecessor',p_predecessor,'binding_hash',binding_hash,'operation_hash',operation_hash,
  'identity_resolution_id',resolution,'authority',ctx));
 insert into mip_identity.efta_decisions values(p_request,p_candidate,p_predecessor,p_action,p_review,binding_hash,
  operation_hash,resolution,(ctx->>'subject_id')::uuid,(ctx->>'assignment_revision')::uuid,
  (ctx->>'authentication_revision')::uuid,(ctx->>'broker_session')::uuid,(ctx->>'mapping_revision')::uuid,
  (ctx->>'key_revision')::uuid,receipt,session_user,clock_timestamp());
 return p_request;
end $$;

create function mip_identity.efta_admit(
 p_request uuid,p_decision uuid,p_session uuid,p_runtime text,p_assignment uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare d mip_identity.efta_decisions;b jsonb;ctx jsonb;operations jsonb;identity jsonb;h text;prior mip_identity.efta_admissions;
begin
 ctx:=mip_identity.authority_context(p_session,p_runtime,p_assignment,'mip_efta_admitter_v1');
 perform 1 from mip_identity.collector_fence where id for share;perform 1 from mip_cutover_authority.publication_fence where id for update;
 select * into strict d from mip_identity.efta_decisions where id=p_decision;
 if d.action='reverse' or exists(select 1 from mip_identity.efta_decisions where predecessor=d.id) then raise exception 'efta_decision_replaced';end if;
 b:=mip_identity.efta_current_binding(d.candidate_id);operations:=mip_identity.operation_closure(d.candidate_id,b);
 if comparison_qualification.argument_digest(b)<>d.binding_hash or operations->>'closure_hash' is distinct from d.operation_receipt_hash
 then raise exception 'efta_stale_review';end if;
 identity:=mip_identity.efta_require_identity(d.identity_resolution_id,b);
 h:=comparison_qualification.argument_digest(jsonb_build_object('decision',to_jsonb(d),'runtime',p_runtime,'operations',operations,'authority',ctx));
 select * into prior from mip_identity.efta_admissions where request_id=p_request;
 if found then if prior.decision_id is distinct from p_decision or prior.receipt_hash is distinct from h
  or prior.assignment_revision is distinct from p_assignment then raise exception 'efta_replay_conflict';end if;return p_request;end if;
 insert into mip_identity.efta_admissions values(p_request,p_decision,p_runtime,operations->>'closure_hash',h,
  (ctx->>'subject_id')::uuid,(ctx->>'assignment_revision')::uuid,(ctx->>'authentication_revision')::uuid,
  (ctx->>'broker_session')::uuid,(ctx->>'mapping_revision')::uuid,(ctx->>'key_revision')::uuid,
  ctx->>'authority_receipt_hash',session_user,clock_timestamp());
 return p_request;
end $$;

create function mip_identity.efta_private_read(
 p_request uuid,p_session uuid,p_runtime text,p_assignment uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare d mip_identity.efta_decisions;b jsonb;items jsonb:='[]'::jsonb;result jsonb;ids uuid[]:='{}';
 ctx jsonb;operations jsonb;all_operations jsonb:='[]'::jsonb;h text;op_hash text;prior mip_identity.efta_private_reads;
begin
 ctx:=mip_identity.authority_context(p_session,p_runtime,p_assignment,'mip_efta_private_reader_v1');
 perform 1 from mip_identity.collector_fence where id for share;perform 1 from mip_cutover_authority.publication_fence where id for update;
 for d in select dr.* from mip_identity.efta_decisions dr join mip_identity.efta_admissions a on a.decision_id=dr.id
  where a.runtime=p_runtime and dr.action<>'reverse' and not exists(select 1 from mip_identity.efta_decisions n where n.predecessor=dr.id)
  order by dr.candidate_id loop
  b:=mip_identity.efta_current_binding(d.candidate_id);operations:=mip_identity.operation_closure(d.candidate_id,b);
  if comparison_qualification.argument_digest(b)<>d.binding_hash or operations->>'closure_hash' is distinct from d.operation_receipt_hash
  then raise exception 'efta_stale_review';end if;
  perform mip_identity.efta_require_identity(d.identity_resolution_id,b);
  all_operations:=all_operations||jsonb_build_array(operations);
  items:=items||jsonb_build_array((b-'capture_payload'-'candidate_record'-'article_record')||
   jsonb_build_object('decision_id',d.id,'predecessor',d.predecessor,'review',d.review,'reviewed_at',d.recorded_at,
   'reviewer_subject','auth_user:'||d.subject_id::text,'reviewer_assignment_revision',d.assignment_revision));
  ids:=array_append(ids,d.id);
 end loop;
 op_hash:=comparison_qualification.argument_digest(all_operations);
 result:=jsonb_build_object('contract','efta-private-review-v2','state','private_review','sources',items,
  'public_release',false,'operation_closure_hash',op_hash,
  'comparison',jsonb_build_object('state','unavailable','reason','Approved comparison and independent-evidence gates remain unsatisfied'),
  'world_view',jsonb_build_object('state','absent','reason','No reviewed geography'));
 h:=comparison_qualification.argument_digest(result);
 select * into prior from mip_identity.efta_private_reads where request_id=p_request;
 if found then if prior.runtime is distinct from p_runtime or prior.payload_hash is distinct from h
  or prior.decision_ids is distinct from ids or prior.assignment_revision is distinct from p_assignment
  then raise exception 'efta_replay_conflict';end if;
 else insert into mip_identity.efta_private_reads values(p_request,p_runtime,h,ids,op_hash,
  (ctx->>'subject_id')::uuid,(ctx->>'assignment_revision')::uuid,(ctx->>'authentication_revision')::uuid,
  (ctx->>'broker_session')::uuid,(ctx->>'mapping_revision')::uuid,(ctx->>'key_revision')::uuid,
  ctx->>'authority_receipt_hash',session_user,clock_timestamp());end if;
 return result||jsonb_build_object('receipt_id',p_request,'payload_hash',h,
  'reader_subject',ctx->>'subject_principal','reader_assignment_revision',ctx->>'assignment_revision');
end $$;

-- Defense-in-depth ownership, RLS, immutability and direct-table denial.
do $secure$
declare t text;f regprocedure;
begin
 foreach t in array array[
  'efta_authority_assignment_versions','efta_authority_assignment_heads','efta_institution_versions','efta_institution_heads',
  'efta_identity_resolutions','efta_operation_evidence_versions','efta_operation_evidence_heads',
  'efta_decisions','efta_admissions','efta_private_reads'] loop
  execute format('alter table mip_identity.%I owner to mip_cutover_schema_owner_v1',t);
  execute format('alter table mip_identity.%I enable row level security',t);
  execute format('alter table mip_identity.%I force row level security',t);
  execute format('revoke all on mip_identity.%I from public,anon,authenticated,service_role,mip_factual_reviewer_v3,mip_projection_publisher_v1,mip_efta_reviewer_v1,mip_efta_admitter_v1,mip_efta_private_reader_v1',t);
  execute format('grant select,insert on mip_identity.%I to mip_efta_owner_v1',t);
  execute format('create policy efta_owner on mip_identity.%I to mip_efta_owner_v1 using(true) with check(true)',t);
  execute format('create trigger immutable_v2 before update or delete on mip_identity.%I for each row execute function comparison_qualification.reject_rewrite()',t);
  execute format('create trigger no_truncate_v2 before truncate on mip_identity.%I for each statement execute function comparison_qualification.reject_rewrite()',t);
 end loop;
 -- Heads are the only mutable authorization selectors; replace immutable triggers with fenced, version-retiring updates.
 foreach t in array array['efta_authority_assignment_heads','efta_institution_heads','efta_operation_evidence_heads'] loop
  execute format('drop trigger immutable_v2 on mip_identity.%I',t);
  execute format('create trigger retire_revision before insert or update or delete on mip_identity.%I for each row execute function mip_identity.guard_revision_reuse()',t);
  execute format('create trigger publication_fence before insert or update or delete on mip_identity.%I for each statement execute function mip_cutover_authority.fence_publication_write()',t);
 end loop;
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='mip_identity' and p.proname in ('efta_current_binding','efta_require_identity','efta_resolve_identity','efta_decide','efta_admit','efta_private_read') loop
  execute 'alter function '||f||' owner to mip_efta_owner_v1';
  execute 'revoke all on function '||f||' from public,anon,authenticated,service_role,mip_factual_reviewer_v3,mip_projection_publisher_v1,mip_efta_reviewer_v1,mip_efta_admitter_v1,mip_efta_private_reader_v1';
 end loop;
end $secure$;

-- The EFTA owner can inspect only the exact retained corpus and authority inputs needed by
-- the six definers. External roles have function execution only and no direct table access.
grant usage on schema mip_identity,evidence_pipeline to mip_efta_owner_v1,mip_efta_reviewer_v1,mip_efta_admitter_v1,mip_efta_private_reader_v1;
grant usage on schema mip_cutover_authority,comparison_qualification,public to mip_efta_owner_v1;
grant select on mip_identity.efta_scope,mip_identity.source_changes,mip_identity.sessions,
 mip_identity.mapping_versions,mip_identity.mapping_heads,mip_identity.key_versions,mip_identity.key_heads to mip_efta_owner_v1;
grant select,update on mip_identity.collector_fence,mip_cutover_authority.publication_fence to mip_efta_owner_v1;
grant select on comparison_qualification.principal_sessions to mip_efta_owner_v1;
grant select on public.articles to mip_efta_owner_v1;
grant select on evidence_pipeline.article_captures,evidence_pipeline.evidence_candidates to mip_efta_owner_v1;
create policy efta_owner_scope on mip_identity.efta_scope for select to mip_efta_owner_v1 using(true);
create policy efta_owner_history on mip_identity.source_changes for select to mip_efta_owner_v1 using(
 (relation_name='public.articles' and row_key in (select binding->>'article_id' from mip_identity.efta_scope))
 or (relation_name='evidence_pipeline.article_captures' and row_key in (select binding->>'capture_id' from mip_identity.efta_scope))
 or (relation_name='evidence_pipeline.evidence_candidates' and row_key in (select candidate_id::text from mip_identity.efta_scope)));
create policy efta_owner_sessions on mip_identity.sessions for select to mip_efta_owner_v1 using(true);
create policy efta_owner_mapping_versions on mip_identity.mapping_versions for select to mip_efta_owner_v1 using(principal like 'mip_efta_%');
create policy efta_owner_mapping_heads on mip_identity.mapping_heads for select to mip_efta_owner_v1 using(principal like 'mip_efta_%');
create policy efta_owner_key_versions on mip_identity.key_versions for select to mip_efta_owner_v1 using(true);
create policy efta_owner_key_heads on mip_identity.key_heads for select to mip_efta_owner_v1 using(true);
create policy efta_owner_collector_fence on mip_identity.collector_fence to mip_efta_owner_v1 using(true) with check(true);
create policy efta_owner_publication_fence on mip_cutover_authority.publication_fence to mip_efta_owner_v1 using(true) with check(true);
create policy efta_owner_principal_sessions on comparison_qualification.principal_sessions for select to mip_efta_owner_v1 using(principal like 'mip_efta_%');
create policy efta_owner_article on public.articles for select to mip_efta_owner_v1 using(id in(select (binding->>'article_id')::uuid from mip_identity.efta_scope));
create policy efta_owner_capture on evidence_pipeline.article_captures for select to mip_efta_owner_v1 using(id in(select (binding->>'capture_id')::uuid from mip_identity.efta_scope));
create policy efta_owner_candidate on evidence_pipeline.evidence_candidates for select to mip_efta_owner_v1 using(
 id in(select candidate_id from mip_identity.efta_scope) or predecessor_candidate_id in(select candidate_id from mip_identity.efta_scope));

grant execute on function mip_identity.authorize(uuid,text,text),mip_identity.operation_check(jsonb),
 comparison_qualification.argument_digest(jsonb) to mip_efta_owner_v1;
alter function mip_identity.authority_context(uuid,text,uuid,text) owner to mip_efta_owner_v1;
alter function mip_identity.operation_closure(uuid,jsonb) owner to mip_efta_owner_v1;
revoke all on function mip_identity.authority_context(uuid,text,uuid,text),mip_identity.operation_closure(uuid,jsonb)
 from public,anon,authenticated,service_role,mip_factual_reviewer_v3,mip_projection_publisher_v1,
 mip_efta_reviewer_v1,mip_efta_admitter_v1,mip_efta_private_reader_v1;
grant execute on function mip_identity.authority_context(uuid,text,uuid,text),mip_identity.operation_closure(uuid,jsonb)
 to mip_efta_owner_v1;
grant execute on function mip_identity.efta_resolve_identity(uuid,text,uuid,uuid,text,text,uuid,text,uuid),
 mip_identity.efta_decide(uuid,uuid,text,uuid,jsonb,uuid,text,uuid) to mip_efta_reviewer_v1;
grant execute on function mip_identity.efta_admit(uuid,uuid,uuid,text,uuid) to mip_efta_admitter_v1;
grant execute on function mip_identity.efta_private_read(uuid,uuid,text,uuid) to mip_efta_private_reader_v1;

-- Keep the authoritative adapter private too. The broader 008/009 validator reaches it
-- only through its pre-existing owner, while EFTA callers reach it only through six definers.
alter function mip_identity.operation_check(jsonb) owner to mip_publication_owner_v2;
grant select on mip_identity.efta_scope,mip_identity.efta_operation_evidence_versions,
 mip_identity.efta_operation_evidence_heads to mip_publication_owner_v2;
create policy efta_operation_publication_owner_versions on mip_identity.efta_operation_evidence_versions
 for select to mip_publication_owner_v2 using(true);
create policy efta_operation_publication_owner_heads on mip_identity.efta_operation_evidence_heads
 for select to mip_publication_owner_v2 using(true);
revoke all on function mip_identity.operation_check(jsonb),mip_identity.operation_check_pre_efta_v4(jsonb)
 from public,anon,authenticated,service_role,mip_factual_reviewer_v3,mip_projection_publisher_v1,
 mip_efta_reviewer_v1,mip_efta_admitter_v1,mip_efta_private_reader_v1;
grant execute on function mip_identity.operation_check(jsonb) to mip_efta_owner_v1,mip_publication_owner_v2;
grant execute on function mip_identity.operation_check_pre_efta_v4(jsonb) to mip_publication_owner_v2;

-- release_public remains the unchanged, deliberately disabled 007 function. No EFTA role
-- receives stage_review, release_isolated, review_publish, or any canonical/public DML.
commit;
