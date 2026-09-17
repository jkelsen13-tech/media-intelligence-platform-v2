-- Opt-in qualification extension after 001..010. Never auto-installed.
-- Bounded private review admission; 007 remains sole comparison publication path.
begin;
create table mip_identity.efta_scope(candidate_id uuid primary key,binding jsonb not null);
insert into mip_identity.efta_scope select (x->>'candidate_id')::uuid,x from jsonb_array_elements($scope$[{"candidate_id":"f5548254-e6c4-4abd-925d-8ea6d8e076ea","capture_id":"a1e37087-54c7-49a8-886d-0f7189ffbde9","article_id":"44167b15-ca52-4827-be4b-50f81d384674","content_hash":"d9f0ed6ccf11a673749d7ba91b34e228d3649d7b84c33b2be9a371199a939470","url":"https://www.govinfo.gov/content/pkg/PLAW-119publ38/html/PLAW-119publ38.htm","span_start":0,"span_end":122,"source_field":"body_text","excerpt":"All redactions must be accompanied by a written justification published in the Federal Register and submitted to Congress.","origin_id":"us-congress-enacted-law","dependency_id":"pl119-38","semantic_kind":"enacted_requirement","statement":"Statutory redaction-accountability requirement, section 2(c)(2).","remaining_uncertainty":"Requirement is not proof of compliance."},{"candidate_id":"dd1ef05f-dd67-4595-908f-d195671a5db5","capture_id":"5a01a9c2-0f86-4757-a056-52700980d0aa","article_id":"1baddfa5-9b2d-466d-8bd3-2e9a5c3702ee","content_hash":"7062c77032a711a61eac7cb1071cb9c916166eba429110ebb9dfdbc2456e5a57","url":"https://www.justice.gov/opa/media/1434851/dl?inline=","span_start":0,"span_end":73,"source_field":"body_text","excerpt":"I anticipate this ongoing review being completed over the next two weeks.","origin_id":"doj-executive","dependency_id":"doj-efta-dec19-letter","semantic_kind":"agency_projection","statement":"Agency projection acknowledges ongoing review.","remaining_uncertainty":"PDF extraction whitespace normalized; words unchanged. Projection is not completion. Search metadata differs; date verified on PDF page 1."},{"candidate_id":"a255ffc5-2209-4e50-8fec-cf72f3f0e7eb","capture_id":"225e33dc-9e67-47a0-86e4-7a75b8ff4b88","article_id":"d0bf46df-efcb-4f0d-83cd-f5f60343f650","content_hash":"f23bb82300d53b4870bdf8001cfb61cabc38791abaca2efc8f52cd0dfce82642","url":"https://www.justice.gov/media/1426281/dl?inline=","span_start":0,"span_end":127,"source_field":"body_text","excerpt":"It is of paramount importance to the Department that this review is thorough and that victim information is properly protected.","origin_id":"doj-executive","dependency_id":"efta-review-protocol","semantic_kind":"agency_instruction","statement":"Redaction review standard.","remaining_uncertainty":"Instruction not proof of implementation. PDF extraction whitespace normalized; words unchanged; subject line used as title."},{"candidate_id":"c5a7416f-2495-41cf-b3d6-8a02d3becf22","capture_id":"9a898688-2f39-4a40-a1a7-0e6bb5b0f58c","article_id":"e444d8ef-765a-4624-bf8b-3f2f90eab743","content_hash":"f4b682cf0a6c7476aa115d1cf83dcbd35da057165821aa483dc08b08f1ddbf1a","url":"https://www.justice.gov/opa/pr/department-justice-publishes-35-million-responsive-pages-compliance-epstein-files","span_start":0,"span_end":123,"source_field":"body_text","excerpt":"Combined with prior releases, this makes the total production nearly 3.5 million pages released in compliance with the Act.","origin_id":"doj-executive","dependency_id":"doj-efta-jan30-production","semantic_kind":"official_claim","statement":"Agency production-total claim.","remaining_uncertainty":"Not independently verified compliance; same event as Jan30 letter."},{"candidate_id":"f741208c-0a00-418a-afab-028f558b902b","capture_id":"2c7428e6-0e4b-4dd2-af93-fca438307359","article_id":"c6b19030-a485-4fd8-9e68-3674ea8bffeb","content_hash":"342d4813cc6fc151b6937d20b549e76957908a4a0f70dcc2429406dddfac973a","url":"https://www.justice.gov/letter-to-congress.pdf","span_start":0,"span_end":87,"source_field":"body_text","excerpt":"approximately 200,000 pages have been redacted or withheld based on various privileges.","origin_id":"doj-executive","dependency_id":"doj-efta-jan30-production","semantic_kind":"agency_disclosure_accounting","statement":"Agency quantifies claimed privilege withholding.","remaining_uncertainty":"PDF extraction whitespace normalized; words unchanged. Same origin/event as January 30 release; legal basis not adjudicated."},{"candidate_id":"5cabcb8f-99bf-4e42-8172-473ef6c59f0f","capture_id":"df6eeb70-a24a-4e3f-9ea8-55faa8fcabfd","article_id":"781bf13f-f1db-4a9f-9a8d-e234a5a303d2","content_hash":"b7fe286748aabbe09ad853f6abea1e8cfa3ead74dbe2eee26c0889bb343fd682","url":"https://oig.justice.gov/ongoing-work/audit-department-justices-compliance-epstein-files-transparency-act","span_start":0,"span_end":105,"source_field":"body_text","excerpt":"The OIG is auditing the Department of Justice’s (DOJ) compliance with the Epstein Files Transparency Act.","origin_id":"doj-oig","dependency_id":"efta-oig-audit","semantic_kind":"audit_status","statement":"DOJ OIG states that it is auditing DOJ compliance with the Epstein Files Transparency Act.","remaining_uncertainty":"Audit initiation/status statement only, not an audit conclusion. No underlying disclosure documents, private persons, victims, contacts or misconduct assertions retained."},{"candidate_id":"a5457418-1a23-4345-8fb7-788d07123aa8","capture_id":"b556327b-1053-4ea2-bdf8-464cd3133c35","article_id":"8cd6f366-1254-4ef9-97cd-f4057520bc80","content_hash":"ff60158e4e80cce95b8c0dae955becc91791a536b92458fc7ce8643bac03c7b5","url":"https://public-inspection.federalregister.gov/2026-17533.pdf","span_start":0,"span_end":142,"source_field":"body_text","excerpt":"The Department of Justice is publishing a report submitted to Congress concerning records released and withheld pursuant to Public Law 119-38.","origin_id":"doj-executive","dependency_id":"efta-fr-2026-17533","semantic_kind":"publication_notice","statement":"Formal publication milestone for withholding report.","remaining_uncertainty":"PDF extraction whitespace normalized; words unchanged. Signed August 21, filed August 26, published August 27. Publication does not establish compliance; no appendix retained."}]$scope$::jsonb) x;
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
 or a->>'source_status' in ('withdrawn','corrected','revoked')
 then raise exception 'efta_stale_source';end if;
 return b||jsonb_build_object('capture_payload',c->'payload','candidate_record',k,'article_record',a);
end $$;
create trigger efta_capture_fence before insert or update or delete or truncate on evidence_pipeline.article_captures
 for each statement execute function mip_identity.collector_lock();
create trigger efta_candidate_fence before insert or update or delete or truncate on evidence_pipeline.evidence_candidates
 for each statement execute function mip_identity.collector_lock();
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
 or nullif(btrim(p_review->>'uncertainty'),'') is null
 or nullif(btrim(p_review->>'owner_authorization_ref'),'') is null
 or nullif(btrim(p_review->>'privacy_ref'),'') is null
 or nullif(btrim(p_review->>'rights_ref'),'') is null
 or p_review#>>'{event_time,precision}' is distinct from 'day'
 or p_review#>>'{event_time,date}' !~ '^\d{4}-\d{2}-\d{2}$'
 or p_review#>>'{event_time,date}' is null
 or nullif(btrim(p_review#>>'{event_time,evidence_basis}'),'') is null
 or p_review#>>'{event_time,evidence_basis}'='published_at'
 or nullif(btrim(p_review#>>'{event_time,uncertainty}'),'') is null
 or p_review#>>'{entity,kind}' is distinct from 'institution'
 or nullif(btrim(p_review#>>'{entity,namespace}'),'') is null
 or nullif(btrim(p_review#>>'{entity,id}'),'') is null
 or nullif(btrim(p_review#>>'{entity,label}'),'') is null
 or nullif(btrim(p_review#>>'{entity,resolution_ref}'),'') is null
 then raise exception 'efta_review_binding_required';end if;
 perform (p_review#>>'{event_time,date}')::date;
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
 for d in select d.* from mip_identity.efta_decisions d join mip_identity.efta_admissions a on a.decision_id=d.id
 where a.runtime=p_runtime and d.action<>'reverse'
 and not exists(select 1 from mip_identity.efta_decisions n where n.predecessor=d.id)
 order by d.candidate_id loop
 b:=mip_identity.efta_current_binding(d.candidate_id);
 if comparison_qualification.argument_digest(b)<>d.binding_hash then raise exception 'efta_stale_review';end if;
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
 foreach t in array array['efta_scope','efta_decisions','efta_admissions','efta_private_reads'] loop
 execute format('alter table mip_identity.%I owner to mip_cutover_schema_owner_v1',t);
 execute format('alter table mip_identity.%I enable row level security',t);
 execute format('alter table mip_identity.%I force row level security',t);
 execute format('revoke all on mip_identity.%I from public,anon,authenticated,service_role,mip_comparison_worker_v1,mip_comparison_producer_v1,mip_projection_publisher_v1,mip_factual_reviewer_v3',t);
 execute format('grant select on mip_identity.%I to mip_publication_owner_v2',t);
 execute format('create policy efta_read on mip_identity.%I for select to mip_publication_owner_v2 using(true)',t);
 execute format('create trigger immutable before update or delete on mip_identity.%I for each row execute function comparison_qualification.reject_rewrite()',t);
 execute format('create trigger no_truncate before truncate on mip_identity.%I for each statement execute function comparison_qualification.reject_rewrite()',t);
 end loop;
 foreach t in array array['efta_decisions','efta_admissions','efta_private_reads'] loop
 execute format('grant insert on mip_identity.%I to mip_publication_owner_v2',t);
 execute format('create policy efta_append on mip_identity.%I for insert to mip_publication_owner_v2 with check(true)',t);
 end loop;
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mip_identity' and p.proname like 'efta_%' loop
 execute 'alter function '||f.sig||' owner to mip_publication_owner_v2';
 execute 'revoke all on function '||f.sig||' from public,anon,authenticated,service_role';
 end loop;
end $permissions$;
grant usage on schema evidence_pipeline to mip_publication_owner_v2;
grant select on public.articles to mip_publication_owner_v2;
create policy efta_article_read on public.articles for select to mip_publication_owner_v2 using(true);
grant select on evidence_pipeline.article_captures,evidence_pipeline.evidence_candidates to mip_publication_owner_v2;
create policy efta_capture_read on evidence_pipeline.article_captures for select to mip_publication_owner_v2 using(true);
create policy efta_candidate_read on evidence_pipeline.evidence_candidates for select to mip_publication_owner_v2 using(true);
grant usage on schema mip_identity to mip_factual_reviewer_v3;
grant execute on function mip_identity.efta_decide(uuid,uuid,text,uuid,jsonb) to mip_factual_reviewer_v3;
grant execute on function mip_identity.efta_admit(uuid,uuid,text,uuid),mip_identity.efta_private_read(uuid,uuid,text) to mip_projection_publisher_v1;
commit;
