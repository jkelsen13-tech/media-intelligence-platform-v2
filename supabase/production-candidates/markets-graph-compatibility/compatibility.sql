-- UNAPPLIED PRODUCTION CANDIDATE: graph privacy compatibility foundation only.
-- Not a Supabase migration. Never run qualification/markets-evidence/001 after this.
-- Apply only after independent review and disposable production-schema qualification.
-- PRIVACY BREAKS: unresolved citations are suppressed; queue count is NULL/redacted.
\set ON_ERROR_STOP on
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
set local search_path=public,pg_catalog;
do $preflight$
declare r record; actual_fingerprint text;
begin
 with targets as (
 select c.* from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in('nodes','edges','citations','node_topics','graph_event_article_memberships','comparison_public','investigation_surface_public','spatial_projection_v1','graph_coverage_public')
), state as (
 select c.relname,jsonb_build_object('owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,
 'options',c.reloptions,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,
 'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'acl',a.attacl::text,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
 'policies',(select jsonb_agg(to_jsonb(p) order by p.policyname) from pg_policies p where p.schemaname='public' and p.tablename=c.relname),
 'constraints',(select jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid),'validated',k.convalidated) order by k.conname) from pg_constraint k where k.conrelid=c.oid),
 'triggers',(select jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid),'function',pg_get_functiondef(t.tgfoid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text) order by t.tgname) from pg_trigger t join pg_proc p on p.oid=t.tgfoid where t.tgrelid=c.oid and not t.tgisinternal),
 'view',case when c.relkind='v' then pg_get_viewdef(c.oid,true) end) value from targets c
) select md5(jsonb_object_agg(relname,value)::text) into actual_fingerprint from state;
 if actual_fingerprint <> 'e5aea518d5606e19012091d64515789f' then raise exception 'Graph security/schema drift: %',actual_fingerprint; end if;
 if current_setting('server_version_num')::integer < 170000 then raise exception 'PostgreSQL 17+ required (MAINTAIN privilege)'; end if;
 for r in select * from (values
 ('comparison_public','caa4d581a3f6a423a32d5204f61d766b'),
 ('graph_coverage_public','ebb88aaf1e984dabed03ad0f78a8dd04'),
 ('spatial_projection_v1','f6522df2dfa0d5fb624f3a61fe94e745'),
 ('investigation_surface_public','1ca58374bb255610e65a45c13854462a')
 ) h(name,hash) loop
  if to_regclass('public.'||r.name) is null or md5(pg_get_viewdef(to_regclass('public.'||r.name),true))<>r.hash then
   raise exception 'View drift: %',r.name;
  end if;
 end loop;
 if exists(select 1 from pg_attribute where attrelid in('public.nodes'::regclass,'public.edges'::regclass) and attname='private_candidate' and not attisdropped) then
  raise exception 'Already installed or qualification schema: reconcile explicitly';
 end if;
end $preflight$;
-- Fast constant defaults on PG15+; no table-wide update/backfill.
alter table public.nodes add column private_candidate boolean not null default false;
alter table public.edges add column private_candidate boolean not null default false;
-- Existing citations retain their pre-cutover public designation; future inserts
-- must explicitly opt in. Unresolved citations are suppressed regardless.
-- Baseline eligibility must be independently reviewed before applying.
alter table public.citations add column public_eligible boolean not null default true;
alter table public.citations alter column public_eligible set default false;
create schema mip_market_graph;
revoke all on schema mip_market_graph from public,anon,authenticated,service_role;
-- Immutable classification avoids endpoint/classification races and prevents promotion.
-- Existing public identities remain public; new private identities remain private.
create function mip_market_graph.guard_classification() returns trigger
language plpgsql security definer set search_path='' as $guard$
begin
 if tg_op='UPDATE' and old.private_candidate is distinct from new.private_candidate then
  raise exception 'market_graph_classification_immutable';
 end if;
 return new;
end $guard$;
revoke all on function mip_market_graph.guard_classification() from public,anon,authenticated,service_role;
create trigger market_graph_classification before insert or update on public.nodes
 for each row execute function mip_market_graph.guard_classification();
create trigger market_graph_classification before insert or update on public.edges
 for each row execute function mip_market_graph.guard_classification();
-- AFTER trigger runs after immediate FK checks. Missing endpoint visibility fails
-- closed rather than treating absence as proof of public classification.
create function mip_market_graph.guard_public_endpoints() returns trigger
language plpgsql security definer set search_path='' as $endpoints$
declare endpoint uuid; classified_private boolean;
begin
 if new.private_candidate then return null; end if;
 for endpoint in select x from unnest(array[new.source_id,new.target_id]) x order by x loop
  select n.private_candidate into strict classified_private
   from public.nodes n where n.id=endpoint for key share;
  if classified_private then raise exception 'market_graph_public_edge_private_endpoint'; end if;
 end loop;
 return null;
exception when no_data_found then
 raise exception 'market_graph_endpoint_not_visible' using errcode='23503';
end $endpoints$;
revoke all on function mip_market_graph.guard_public_endpoints() from public,anon,authenticated,service_role;
create constraint trigger market_graph_public_endpoints after insert or update on public.edges
 deferrable initially immediate for each row execute function mip_market_graph.guard_public_endpoints();
create function mip_market_graph.guard_citation_classification() returns trigger
language plpgsql security invoker set search_path='' as $citation$
begin
 if old.public_eligible is distinct from new.public_eligible then
  raise exception 'market_citation_classification_immutable';
 end if;
 return new;
end $citation$;
revoke all on function mip_market_graph.guard_citation_classification() from public,anon,authenticated,service_role;
create trigger market_citation_classification before update on public.citations
 for each row execute function mip_market_graph.guard_citation_classification();
alter table public.nodes enable row level security;
revoke insert,update,delete,truncate,references,trigger,maintain on public.nodes from public,anon,authenticated;
grant select on public.nodes to anon,authenticated;
alter table public.edges enable row level security;
revoke insert,update,delete,truncate,references,trigger,maintain on public.edges from public,anon,authenticated;
grant select on public.edges to anon,authenticated;
alter table public.citations enable row level security;
revoke insert,update,delete,truncate,references,trigger,maintain on public.citations from public,anon,authenticated;
grant select on public.citations to anon,authenticated;
alter table public.node_topics enable row level security;
revoke insert,update,delete,truncate,references,trigger,maintain on public.node_topics from public,anon,authenticated;
grant select on public.node_topics to anon,authenticated;
alter table public.graph_event_article_memberships enable row level security;
revoke insert,update,delete,truncate,references,trigger,maintain on public.graph_event_article_memberships from public,anon,authenticated;
grant select on public.graph_event_article_memberships to anon,authenticated;
create policy market_graph_private_nodes on public.nodes as restrictive for select to anon,authenticated using(not private_candidate);
create policy market_graph_private_edges on public.edges as restrictive for select to anon,authenticated
 using(not private_candidate and exists(select 1 from public.nodes n where n.id=source_id and not n.private_candidate)
 and exists(select 1 from public.nodes n where n.id=target_id and not n.private_candidate));
create policy market_graph_private_citations on public.citations as restrictive for select to anon,authenticated
 using(public_eligible and resolved_node_id is not null and exists(select 1 from public.nodes n where n.id=resolved_node_id and not n.private_candidate));
create policy market_graph_private_topics on public.node_topics as restrictive for select to anon,authenticated
 using(exists(select 1 from public.nodes n where n.id=node_id and not n.private_candidate));
create policy market_graph_private_memberships on public.graph_event_article_memberships as restrictive for select to anon,authenticated
 using(exists(select 1 from public.nodes n where n.id=event_node_id and not n.private_candidate));

-- Retains existing column order/types and ownership; only graph eligibility changes.
create or replace view public.spatial_projection_v1 with(security_barrier=true) as
 WITH in_effect_scopes AS (
         SELECT s.id,
            s.audience_code,
            s.audience_version,
            s.canonical_capabilities,
            s.canonicalization_version,
            s.content_hash_algorithm,
            s.content_hash,
            s.effective_at,
            s.supersedes_audience_scope_id,
            s.created_by_principal_ref,
            s.created_at
           FROM spatial.audience_scopes s
          WHERE s.effective_at <= now()
        ), public_scopes AS (
         SELECT s.id
           FROM in_effect_scopes s
          WHERE s.audience_code = 'public'::text AND NOT (EXISTS ( SELECT 1
                   FROM in_effect_scopes newer
                  WHERE newer.supersedes_audience_scope_id = s.id))
        ), public_scope_head AS (
         SELECT
                CASE
                    WHEN count(*) = 1 THEN min(public_scopes.id::text)::uuid
                    ELSE NULL::uuid
                END AS id
           FROM public_scopes
        ), current_revision AS (
         SELECT r_1.id,
            r_1.spatial_assertion_id,
            r_1.revision_ordinal,
            r_1.graph_node_authority_snapshot_id,
            r_1.location_role,
            r_1.relationship_qualifier,
            r_1.canonical_place_id,
            r_1.place_authority_snapshot_id,
            r_1.evidence_precision,
            r_1.internal_geometry_snapshot_id,
            r_1.valid_time_precision,
            r_1.source_native_time,
            r_1.guard_start_utc,
            r_1.guard_end_utc,
            r_1.temporal_policy_artifact_id,
            r_1.uncertainty_class,
            r_1.uncertainty_note,
            r_1.revision_fingerprint,
            r_1.created_by_principal_ref,
            r_1.created_at,
            row_number() OVER (PARTITION BY r_1.spatial_assertion_id ORDER BY r_1.revision_ordinal DESC) AS rn
           FROM spatial.assertion_revisions r_1
        ), in_effect_review AS (
         SELECT d.id,
            d.assertion_revision_id,
            d.support_disposition,
            d.review_mode,
            d.review_outcome_basis,
            d.review_policy_artifact_id,
            d.reviewed_by_principal_ref,
            d.effective_at,
            d.reason_code,
            d.decision_fingerprint,
            d.created_at
           FROM spatial.review_decisions d
          WHERE d.effective_at <= now()
        ), review_heads AS (
         SELECT d.assertion_revision_id,
            d.id,
            d.support_disposition,
            d.effective_at
           FROM in_effect_review d
          WHERE NOT (EXISTS ( SELECT 1
                   FROM in_effect_review n
                  WHERE n.assertion_revision_id = d.assertion_revision_id AND ((ROW(n.effective_at, n.created_at) > ROW(d.effective_at, d.created_at)))))
        ), review_head AS (
         SELECT review_heads.assertion_revision_id,
                CASE
                    WHEN count(*) = 1 THEN min(review_heads.support_disposition)
                    ELSE NULL::text
                END AS disposition,
                CASE
                    WHEN count(*) = 1 THEN min(review_heads.effective_at)
                    ELSE NULL::timestamp with time zone
                END AS effective_at
           FROM review_heads
          GROUP BY review_heads.assertion_revision_id
        ), in_effect_release AS (
         SELECT d.id,
            d.assertion_revision_id,
            d.audience_scope_id,
            d.release_policy_artifact_id,
            d.decision_disposition,
            d.predecessor_release_decision_id,
            d.decided_by_principal_ref,
            d.decided_at,
            d.effective_at,
            d.reason_code,
            d.decision_fingerprint,
            d.created_at
           FROM spatial.release_decisions d
          WHERE d.effective_at <= now()
        ), release_heads AS (
         SELECT d.assertion_revision_id,
            d.audience_scope_id,
            d.id,
            d.decision_disposition,
            d.effective_at
           FROM in_effect_release d
          WHERE NOT (EXISTS ( SELECT 1
                   FROM in_effect_release n
                  WHERE n.predecessor_release_decision_id = d.id AND n.assertion_revision_id = d.assertion_revision_id AND n.audience_scope_id = d.audience_scope_id))
        ), release_head AS (
         SELECT release_heads.assertion_revision_id,
            release_heads.audience_scope_id,
                CASE
                    WHEN count(*) = 1 THEN min(release_heads.decision_disposition)
                    ELSE NULL::text
                END AS disposition,
                CASE
                    WHEN count(*) = 1 THEN min(release_heads.effective_at)
                    ELSE NULL::timestamp with time zone
                END AS effective_at
           FROM release_heads
          GROUP BY release_heads.assertion_revision_id, release_heads.audience_scope_id
        )
 SELECT 'spatial_projection_v1'::text AS projection_contract_version,
    a.id AS mip_object_id,
    a.assertion_kind AS object_type,
    a.graph_node_id AS subject_graph_node_id,
    g.snapshot_hash AS subject_snapshot_hash,
    r.id AS revision_id,
    r.revision_ordinal,
    sup.to_revision_id AS superseded_by_revision_id,
    r.location_role AS spatial_role,
    r.relationship_qualifier,
    r.canonical_place_id,
    p.snapshot_hash AS place_snapshot_hash,
    r.evidence_precision AS precision_class,
    r.valid_time_precision,
    r.source_native_time,
    r.guard_start_utc AS valid_from_utc,
    r.guard_end_utc AS valid_to_utc,
    r.created_at AS revision_known_at_utc,
    rh.effective_at AS review_effective_at_utc,
    rl.effective_at AS release_effective_at_utc,
    rh.disposition AS review_state,
    rl.disposition AS release_state,
    r.uncertainty_class,
    r.uncertainty_note,
    NULL::text AS confidence,
    'unsupported_by_governed_model'::text AS confidence_status,
        CASE r.location_role
            WHEN 'event'::text THEN 'event_location'::text
            WHEN 'facility'::text THEN 'facility_location'::text
            WHEN 'jurisdiction'::text THEN 'jurisdiction_area'::text
            WHEN 'context'::text THEN 'context_location'::text
            WHEN 'publisher'::text THEN 'publisher_location'::text
            ELSE NULL::text
        END AS display_hint,
        CASE
            WHEN gs.id IS NULL THEN NULL::jsonb
            WHEN gs.representation_kind <> ALL (ARRAY['point'::text, 'representative_point'::text]) THEN NULL::jsonb
            WHEN gs.canonical_geojson IS NULL THEN NULL::jsonb
            WHEN (gs.canonical_geojson ->> 'type'::text) <> 'Point'::text THEN NULL::jsonb
            ELSE jsonb_build_object('type', 'Point', 'coordinates', jsonb_build_array(floor((((gs.canonical_geojson -> 'coordinates'::text) ->> 0)::numeric) / grid.step) * grid.step, floor((((gs.canonical_geojson -> 'coordinates'::text) ->> 1)::numeric) / grid.step) * grid.step))
        END AS display_geometry,
        CASE
            WHEN gs.id IS NULL THEN 'absent_no_geometry_referenced'::text
            WHEN gs.representation_kind <> ALL (ARRAY['point'::text, 'representative_point'::text]) THEN 'omitted_unsupported_representation'::text
            WHEN gs.canonical_geojson IS NULL OR (gs.canonical_geojson ->> 'type'::text) <> 'Point'::text THEN 'omitted_unsupported_representation'::text
            ELSE 'coarsened_to_precision_class'::text
        END AS geometry_status,
    COALESCE(ev.evidence_refs, '[]'::jsonb) AS evidence_refs
   FROM spatial.assertions a
     JOIN nodes subj ON subj.id = a.graph_node_id AND NOT subj.private_candidate AND subj.type = 'event'::text
     JOIN current_revision r ON r.spatial_assertion_id = a.id AND r.rn = 1
     JOIN spatial.graph_node_authority_snapshots g ON g.id = r.graph_node_authority_snapshot_id AND (g.node_payload ->> 'type'::text) = 'event'::text
     JOIN review_head rh ON rh.assertion_revision_id = r.id AND rh.disposition = 'operative'::text
     JOIN release_head rl ON rl.assertion_revision_id = r.id AND rl.disposition = 'released'::text
     JOIN public_scope_head ph ON ph.id = rl.audience_scope_id
     LEFT JOIN spatial.place_authority_snapshots p ON p.id = r.place_authority_snapshot_id
     LEFT JOIN spatial.geometry_snapshots gs ON gs.id = r.internal_geometry_snapshot_id
     LEFT JOIN LATERAL ( SELECT jsonb_agg(jsonb_build_object('evidence_snapshot_id', re.evidence_snapshot_id, 'evidence_role', re.evidence_role) ORDER BY re.evidence_role, re.evidence_snapshot_id) AS evidence_refs
           FROM spatial.revision_evidence re
          WHERE re.assertion_revision_id = r.id) ev ON true
     JOIN LATERAL ( SELECT
                CASE r.evidence_precision
                    WHEN 'country'::text THEN 1.0
                    WHEN 'region'::text THEN 0.5
                    WHEN 'city'::text THEN 0.1
                    ELSE NULL::numeric
                END AS step) grid ON grid.step IS NOT NULL
     LEFT JOIN LATERAL ( SELECT l.to_revision_id
           FROM spatial.revision_lineage l
          WHERE l.from_revision_id = r.id AND (l.relationship_type = ANY (ARRAY['supersedes'::text, 'corrects'::text]))
          ORDER BY l.created_at DESC
         LIMIT 1) sup ON true
  WHERE a.assertion_kind = 'event_spatial_relationship'::text AND (r.evidence_precision = ANY (ARRAY['country'::text, 'region'::text, 'city'::text]));
revoke all on public.spatial_projection_v1 from public,anon,authenticated;
grant select on public.spatial_projection_v1 to anon,authenticated;

-- Retains existing column order/types and ownership; only graph eligibility changes.
create or replace view public.investigation_surface_public with(security_invoker=true) as
 SELECT id AS canonical_event_id,
    slug,
    label AS event_label,
    type AS event_type,
    occurred_at,
    (EXISTS ( SELECT 1
           FROM spatial_projection_v1 p
          WHERE p.subject_graph_node_id = n.id)) AS has_released_geography,
    ( SELECT p.revision_id
           FROM spatial_projection_v1 p
          WHERE p.subject_graph_node_id = n.id
         LIMIT 1) AS spatial_revision_id,
    ( SELECT count(*)::integer AS count
           FROM graph_event_article_memberships m
             JOIN articles a ON a.id = m.article_id
          WHERE m.event_node_id = n.id AND a.reader_state = 'eligible'::text AND a.source_status = 'active'::text) AS public_article_count,
    0 AS reviewed_claim_count,
    ( SELECT count(*)::integer AS count
           FROM edges e
          WHERE (e.source_id = n.id OR e.target_id = n.id) AND NOT e.private_candidate AND EXISTS (SELECT 1 FROM public.nodes s WHERE s.id=e.source_id AND NOT s.private_candidate) AND EXISTS (SELECT 1 FROM public.nodes t WHERE t.id=e.target_id AND NOT t.private_candidate)) AS published_relationship_count,
    false AS auto_approval_enabled
   FROM nodes n
  WHERE NOT n.private_candidate AND type = 'event'::text;
revoke all on public.investigation_surface_public from public,anon,authenticated;
grant select on public.investigation_surface_public to anon,authenticated;

-- Retains existing column order/types and ownership; only graph eligibility changes.
create or replace view public.graph_coverage_public with(security_barrier=true,security_invoker=false) as
 WITH article_totals AS (
         SELECT count(*)::integer AS article_count
           FROM articles
          WHERE articles.reader_state = 'eligible'::text AND articles.source_status = 'active'::text
        ), resolved_article_totals AS (
         SELECT count(DISTINCT c.article_id)::integer AS articles_with_published_node
           FROM citations c
             JOIN articles a_1 ON a_1.id = c.article_id AND a_1.reader_state = 'eligible'::text AND a_1.source_status = 'active'::text
          WHERE c.public_eligible AND c.resolved_node_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.nodes n WHERE n.id=c.resolved_node_id AND NOT n.private_candidate)
        ), published_graph AS (
         SELECT ( SELECT count(*)::integer AS count
                   FROM nodes WHERE NOT private_candidate) AS published_node_count,
            ( SELECT count(*)::integer AS count
                   FROM edges e WHERE NOT e.private_candidate AND EXISTS (SELECT 1 FROM public.nodes s WHERE s.id=e.source_id AND NOT s.private_candidate) AND EXISTS (SELECT 1 FROM public.nodes t WHERE t.id=e.target_id AND NOT t.private_candidate)) AS documented_relationship_count
        )
 SELECT a.article_count,
    r.articles_with_published_node,
    GREATEST(a.article_count - r.articles_with_published_node, 0) AS articles_without_published_node,
    NULL::integer AS pending_graph_candidate_count,
    g.published_node_count,
    g.documented_relationship_count
   FROM article_totals a
     CROSS JOIN resolved_article_totals r
     CROSS JOIN published_graph g;
revoke all on public.graph_coverage_public from public,anon,authenticated;
grant select on public.graph_coverage_public to anon,authenticated;

-- Retains existing column order/types and ownership; only graph eligibility changes.
create or replace view public.comparison_public with(security_barrier=true,security_invoker=false) as
 SELECT md5(id::text) AS event_key,
    canonical_title,
    occurred_at_start,
    occurred_at_end,
    COALESCE(( SELECT jsonb_agg(article_row.article ORDER BY article_row.published_at, article_row.article_key) AS jsonb_agg
           FROM ( SELECT a.published_at,
                    md5(a.id::text) AS article_key,
                    jsonb_build_object('article_key', md5(a.id::text), 'outlet', a.outlet, 'article_url', a.url, 'published_at', a.published_at, 'arc_slug', arc.slug, 'arc_title', arc.title, 'timeline_key', timeline.timeline_key, 'has_extracted_claim', (EXISTS ( SELECT 1
                           FROM article_claims existing_surface
                             JOIN claims existing_claim ON existing_claim.id = existing_surface.claim_id
                          WHERE existing_surface.article_id = a.id AND existing_surface.is_current = true AND existing_claim.event_id = e.id AND (EXISTS ( SELECT 1
                                   FROM mip_private.reader_claim_surfaces rs
                                  WHERE rs.id = existing_surface.id)) AND existing_claim.status = 'active'::text AND existing_claim.rule_version = 'sc-v2-event-projection'::text))) AS article
                   FROM event_articles ea
                     JOIN articles a ON a.id = ea.article_id
                     LEFT JOIN story_arcs arc ON arc.id = a.arc_id
                     LEFT JOIN LATERAL ( SELECT "right"(n.slug, 8) AS timeline_key
                           FROM nodes n
                          WHERE NOT n.private_candidate AND n.type = 'event'::text AND n.arc_id = a.arc_id
                          ORDER BY (n.slug ~~ 'evt-%'::text) DESC, n.slug
                         LIMIT 1) timeline ON true
                  WHERE ea.event_id = e.id AND a.reader_state = 'eligible'::text AND a.source_status = 'active'::text) article_row), '[]'::jsonb) AS articles,
    COALESCE(( SELECT jsonb_agg(claim_row.claim ORDER BY claim_row.canonical_text) AS jsonb_agg
           FROM ( SELECT c.canonical_text,
                    jsonb_build_object('claim_key', md5(c.id::text), 'canonical_text', c.canonical_text, 'thin_extraction', c.thin_extraction, 'surfaces', COALESCE(( SELECT jsonb_agg(surface_row.surface ORDER BY surface_row.published_at, surface_row.article_key) AS jsonb_agg
                           FROM ( SELECT a.published_at,
                                    md5(a.id::text) AS article_key,
                                    jsonb_build_object('article_key', md5(a.id::text), 'surface_text', ac.surface_text, 'loaded_language', ac.loaded_language, 'explanation', explanation.explanation) AS surface
                                   FROM article_claims ac
                                     JOIN articles a ON a.id = ac.article_id
                                     LEFT JOIN LATERAL ( SELECT jsonb_build_object('supporting_passage', x.supporting_passage, 'rule_version', x.rule_version, 'provenance_class', x.provenance_class, 'reviewed_at', x.reviewed_at, 'review_status', x.review_status, 'state', x.state, 'remaining_uncertainty', x.remaining_uncertainty) AS explanation
   FROM explanations x
  WHERE x.assertion_type = 'claim_grouping'::text AND x.is_current = true AND x.review_status = 'published'::text AND x.state = 'ok'::text AND NULLIF(btrim(x.supporting_passage), ''::text) IS NOT NULL AND NULLIF(btrim(x.falsification_condition), ''::text) IS NOT NULL AND btrim(x.falsification_condition) !~~* 'missing:%'::text AND jsonb_typeof(x.archived_sources) = 'array'::text AND NOT jsonb_path_exists(x.archived_sources, '$[*]?(@."status" == "missing")'::jsonpath) AND x.rule_version ~~ 'sc-v2-event-projection|%'::text AND x.assertion_id ~ (((('^sc:claim_grouping:'::text || c.event_id::text) || ':[0-9]+:'::text) || ac.article_id::text) || '$'::text) AND POSITION((format('Surface claim "%s" grouped under canonical "%s"'::text, ac.surface_text, c.canonical_text)) IN (COALESCE(x.supporting_passage, ''::text))) = 1
  ORDER BY x.recomputed_at DESC NULLS LAST, x.id
 LIMIT 1) explanation ON true
                                  WHERE ac.claim_id = c.id AND ac.is_current = true AND (EXISTS ( SELECT 1
   FROM mip_private.reader_claim_surfaces rs
  WHERE rs.id = ac.id)) AND a.reader_state = 'eligible'::text AND a.source_status = 'active'::text) surface_row), '[]'::jsonb), 'evidence_links', COALESCE(( SELECT jsonb_agg(jsonb_build_object('evidence_url', cel.evidence_url, 'evidence_type', cel.evidence_type) ORDER BY cel.evidence_type, cel.evidence_url) AS jsonb_agg
                           FROM claim_evidence_links cel
                          WHERE cel.claim_id = c.id AND (EXISTS ( SELECT 1
                                   FROM mip_private.reader_claim_surfaces rs
                                  WHERE rs.claim_id = c.id AND rs.article_id = cel.linked_from_article_id))), '[]'::jsonb), 'corrections', COALESCE(( SELECT jsonb_agg(jsonb_build_object('correction_text', cc.correction_text, 'occurred_at', cc.occurred_at) ORDER BY cc.occurred_at) AS jsonb_agg
                           FROM claim_corrections cc
                          WHERE cc.claim_id = c.id AND (EXISTS ( SELECT 1
                                   FROM articles ca
                                     JOIN event_articles cea ON cea.article_id = ca.id
                                  WHERE ca.id = cc.correcting_article_id AND cea.event_id = c.event_id AND ca.reader_state = 'eligible'::text AND ca.source_status = 'active'::text))), '[]'::jsonb)) AS claim
                   FROM claims c
                  WHERE c.event_id = e.id AND c.status = 'active'::text AND c.rule_version = 'sc-v2-event-projection'::text AND (EXISTS ( SELECT 1
                           FROM mip_private.reader_claim_surfaces rs
                          WHERE rs.claim_id = c.id))) claim_row), '[]'::jsonb) AS claims
   FROM events e
  WHERE status <> 'timeline_only'::text AND comparison_validation_state = 'approved'::text AND (EXISTS ( SELECT 1
           FROM event_articles ea
             JOIN articles a ON a.id = ea.article_id
          WHERE ea.event_id = e.id AND a.reader_state = 'eligible'::text AND a.source_status = 'active'::text
          GROUP BY ea.event_id
         HAVING count(DISTINCT a.outlet) >= 2));
revoke all on public.comparison_public from public,anon,authenticated;
grant select on public.comparison_public to anon,authenticated;

-- New catalog-discoverable exposed dependents must be reviewed, not silently disabled.
do $inventory$
declare unknown_view text;
begin
 with recursive dependent(oid) as(
  select unnest(array['public.nodes'::regclass::oid,'public.edges'::regclass::oid,'public.citations'::regclass::oid,'public.node_topics'::regclass::oid,'public.graph_event_article_memberships'::regclass::oid])
  union select r.ev_class from dependent d
   join pg_depend p on p.refobjid=d.oid and p.refclassid='pg_class'::regclass and p.classid='pg_rewrite'::regclass
   join pg_rewrite r on r.oid=p.objid where r.ev_class<>d.oid
 )
 select c.oid::regclass::text into unknown_view from dependent d join pg_class c on c.oid=d.oid
 where c.relkind in('v','m') and c.oid not in('public.comparison_public'::regclass,'public.investigation_surface_public'::regclass,'public.spatial_projection_v1'::regclass,'public.graph_coverage_public'::regclass)
 and(has_table_privilege('anon',c.oid,'select') or has_table_privilege('authenticated',c.oid,'select')) limit 1;
 if unknown_view is not null then raise exception 'Unreviewed graph surface: %',unknown_view; end if;
end $inventory$;
-- Fail closed on inherited privileges as well as direct grants.
do $acl$
declare role_name text; view_name text; privilege text;
begin
 foreach role_name in array array['anon','authenticated'] loop
  foreach view_name in array array['comparison_public','graph_coverage_public','spatial_projection_v1','investigation_surface_public'] loop
   foreach privilege in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] loop
    if has_table_privilege(role_name,'public.'||view_name,privilege) then
     raise exception 'Inherited/existing view privilege remains: % % %',role_name,view_name,privilege;
    end if;
   end loop;
  end loop;
 end loop;
end $acl$;
commit;
