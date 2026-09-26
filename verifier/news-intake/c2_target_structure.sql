-- DISPOSABLE C2 structural fixture; no production rows, endpoints or credentials.
-- Exact article shape except unused nullable embedding vector(384), explicitly omitted.
-- Parent lookup/spatial tables reproduce columns, not their write constraints/triggers;
-- spatial tables stay empty. Synthetic parent rows support trigger tests; their
-- write semantics are not qualified. Native spatial read resolution only.
create role anon nologin; create role authenticated nologin;
create role service_role nologin bypassrls; create role spatial_owner nologin;
create schema spatial; create schema mip_private;
create table "public"."geographic_places" (
 "id" uuid not null default gen_random_uuid(),
 "canonical_name" text not null,
 "country_code" text,
 "admin1_name" text,
 "latitude" numeric(9,6),
 "longitude" numeric(9,6),
 "precision" text not null,
 "gazetteer_provider" text,
 "gazetteer_id" text,
 "created_at" timestamp with time zone not null default now(),
 "updated_at" timestamp with time zone not null default now(),
 PRIMARY KEY (id)
);
create table "public"."nodes" (
 "id" uuid not null default gen_random_uuid(),
 "slug" text not null,
 "label" text not null,
 "type" text not null,
 "description" text,
 "metadata" jsonb not null default '{}'::jsonb,
 "created_at" timestamp with time zone not null default now(),
 "updated_at" timestamp with time zone not null default now(),
 "confidence" integer,
 "summary" text,
 "occurred_at" date,
 "arc_id" uuid,
 "arc_membership_candidate_id" uuid,
 PRIMARY KEY (id)
);
create table "spatial"."assertions" (
 "id" uuid not null default gen_random_uuid(),
 "graph_node_id" uuid not null,
 "assertion_kind" text not null,
 "relationship_scope_key" text not null,
 "scope_policy_artifact_id" uuid not null,
 "created_by_principal_ref" text not null,
 "assertion_fingerprint" text not null,
 "created_at" timestamp with time zone not null default transaction_timestamp()
);
create table "spatial"."graph_node_authority_snapshots" (
 "id" uuid not null default gen_random_uuid(),
 "graph_node_id" uuid not null,
 "node_payload" jsonb not null,
 "node_updated_at" timestamp with time zone not null,
 "observed_at" timestamp with time zone not null,
 "canonicalization_version" text not null,
 "snapshot_hash" text not null,
 "captured_by_principal_ref" text not null,
 "captured_at" timestamp with time zone not null default transaction_timestamp()
);
create table "spatial"."place_authority_snapshots" (
 "id" uuid not null default gen_random_uuid(),
 "canonical_place_id" uuid not null,
 "place_payload" jsonb not null,
 "place_updated_at" timestamp with time zone not null,
 "observed_at" timestamp with time zone not null,
 "canonicalization_version" text not null,
 "snapshot_hash" text not null,
 "captured_by_principal_ref" text not null,
 "captured_at" timestamp with time zone not null default transaction_timestamp()
);
create table "spatial"."geometry_snapshots" (
 "id" uuid not null default gen_random_uuid(),
 "geometry_scope" text not null,
 "representation_kind" text not null,
 "crs" text not null,
 "canonical_geojson" jsonb,
 "canonical_place_id" uuid,
 "place_authority_snapshot_id" uuid,
 "geometry_precision" text not null,
 "geometry_source_kind" text not null,
 "geometry_source_version" text,
 "compatibility_policy_artifact_id" uuid not null,
 "canonicalization_version" text not null,
 "geometry_hash" text not null,
 "capture_basis" text not null,
 "created_by_principal_ref" text not null,
 "created_at" timestamp with time zone not null default transaction_timestamp()
);
create table "spatial"."assertion_revisions" (
 "id" uuid not null default gen_random_uuid(),
 "spatial_assertion_id" uuid not null,
 "revision_ordinal" integer not null,
 "graph_node_authority_snapshot_id" uuid not null,
 "location_role" text not null,
 "relationship_qualifier" text not null,
 "canonical_place_id" uuid,
 "place_authority_snapshot_id" uuid,
 "evidence_precision" text not null,
 "internal_geometry_snapshot_id" uuid,
 "valid_time_precision" text not null,
 "source_native_time" jsonb not null,
 "guard_start_utc" timestamp with time zone,
 "guard_end_utc" timestamp with time zone,
 "temporal_policy_artifact_id" uuid not null,
 "uncertainty_class" text,
 "uncertainty_note" text,
 "revision_fingerprint" text not null,
 "created_by_principal_ref" text not null,
 "created_at" timestamp with time zone not null default transaction_timestamp()
);
create table "spatial"."revision_lineage" (
 "id" uuid not null default gen_random_uuid(),
 "from_revision_id" uuid not null,
 "to_revision_id" uuid not null,
 "relationship_type" text not null,
 "lineage_fingerprint" text not null,
 "created_by_principal_ref" text not null,
 "created_at" timestamp with time zone not null default transaction_timestamp()
);
create table "spatial"."revision_evidence" (
 "id" uuid not null default gen_random_uuid(),
 "assertion_revision_id" uuid not null,
 "evidence_snapshot_id" uuid not null,
 "evidence_role" text not null,
 "linkage_fingerprint" text not null,
 "created_at" timestamp with time zone not null default transaction_timestamp()
);
create table "spatial"."review_decisions" (
 "id" uuid not null default gen_random_uuid(),
 "assertion_revision_id" uuid not null,
 "support_disposition" text not null,
 "review_mode" text not null,
 "review_outcome_basis" jsonb not null,
 "review_policy_artifact_id" uuid not null,
 "reviewed_by_principal_ref" text not null,
 "effective_at" timestamp with time zone not null,
 "reason_code" text not null,
 "decision_fingerprint" text not null,
 "created_at" timestamp with time zone not null default transaction_timestamp()
);
create table "spatial"."release_decisions" (
 "id" uuid not null default gen_random_uuid(),
 "assertion_revision_id" uuid not null,
 "audience_scope_id" uuid not null,
 "release_policy_artifact_id" uuid not null,
 "decision_disposition" text not null,
 "predecessor_release_decision_id" uuid,
 "decided_by_principal_ref" text not null,
 "decided_at" timestamp with time zone not null,
 "effective_at" timestamp with time zone not null,
 "reason_code" text not null,
 "decision_fingerprint" text not null,
 "created_at" timestamp with time zone not null default transaction_timestamp()
);
create table "spatial"."audience_scopes" (
 "id" uuid not null default gen_random_uuid(),
 "audience_code" text not null,
 "audience_version" text not null,
 "canonical_capabilities" jsonb not null,
 "canonicalization_version" text not null,
 "content_hash_algorithm" text not null,
 "content_hash" text not null,
 "effective_at" timestamp with time zone not null,
 "supersedes_audience_scope_id" uuid,
 "created_by_principal_ref" text not null,
 "created_at" timestamp with time zone not null default transaction_timestamp()
);
create table "public"."authors" (
 "id" uuid not null default gen_random_uuid(),
 "name" text not null,
 "normalized_name" text not null,
 "outlet_ids" uuid[] not null default '{}'::uuid[],
 "beats" text[] not null default '{}'::text[],
 "article_count" integer not null default 0,
 "first_seen" timestamp with time zone not null default now(),
 "last_seen" timestamp with time zone not null default now(),
 "framing_profile" jsonb,
 "confidence" numeric,
 "last_computed" timestamp with time zone,
 PRIMARY KEY (id)
);
create table "public"."outlets" (
 "id" uuid not null default gen_random_uuid(),
 "name" text not null,
 "parent_ownership" text,
 "country" text,
 "known_editorial_stance" text,
 "notes" text,
 "created_at" timestamp with time zone not null default now(),
 PRIMARY KEY (id)
);
create table "public"."story_arcs" (
 "id" uuid not null default gen_random_uuid(),
 "slug" text not null,
 "title" text not null,
 "category" text not null,
 "status" text not null,
 "root_node_id" uuid,
 "coverage_gap" boolean not null default false,
 "summary" text,
 "started_at" date not null default CURRENT_DATE,
 "last_update_at" timestamp with time zone not null default now(),
 "last_assignment_run" timestamp with time zone,
 "seed_article_id" uuid,
 "category_confidence" numeric,
 "category_evidence" text,
 "title_article_count" integer not null default 0,
 "display_kind" text not null default 'story_arc'::text,
 PRIMARY KEY (id)
);
create table "public"."articles" (
 "id" uuid not null default gen_random_uuid(),
 "feed" text not null,
 "outlet" text not null,
 "title" text not null,
 "url" text not null,
 "summary" text,
 "published_at" timestamp with time zone,
 "fetched_at" timestamp with time zone not null default now(),
 "outlet_id" uuid,
 "author_id" uuid,
 "body_text" text,
 "claims" jsonb not null default '[]'::jsonb,
 "arc_id" uuid,
 "unattributed" boolean not null default false,
 "monoculture" boolean not null default false,
 "is_digest" boolean not null default false,
 "image_url" text,
 "image_alt" text,
 "entities_extracted_at" timestamp with time zone,
 "arc_assign_attempted_at" timestamp with time zone,
 "ingestion_run_id" text,
 "source_status" text not null default 'active'::text,
 "source_status_changed_at" timestamp with time zone,
 "source_status_note" text,
 "arc_assignment_evidence" jsonb,
 "candidate_generation_attempted_at" timestamp with time zone,
 "candidate_generation_note" text,
 "reader_state" text not null default 'pending_review'::text,
 "reader_exclusion_reason" text,
 CHECK ((source_status = ANY (ARRAY['active'::text, 'corrected'::text, 'withdrawn'::text]))),
 CHECK ((reader_state = ANY (ARRAY['eligible'::text, 'pending_review'::text, 'withheld'::text]))),
 CHECK (((reader_exclusion_reason IS NULL) OR (reader_exclusion_reason = ANY (ARRAY['malformed_title'::text, 'unavailable_page'::text, 'canonical_url_duplicate'::text, 'promotional_material'::text, 'off_mission'::text, 'manual_hold'::text])))),
 PRIMARY KEY (id),
 UNIQUE (url),
 FOREIGN KEY (outlet_id) REFERENCES outlets(id),
 FOREIGN KEY (author_id) REFERENCES authors(id),
 FOREIGN KEY (arc_id) REFERENCES story_arcs(id)
);
create table "public"."arc_membership_candidates" (
 "id" uuid not null,
 "article_id" uuid,
 "arc_id" uuid,
 "generation_method" text,
 "generation_evidence" jsonb not null default '{}'::jsonb,
 "state" text not null default 'pending'::text,
 "membership_fingerprint" text,
 "membership_fingerprint_hash" text,
 "invalidated_at" timestamp with time zone,
 "created_at" timestamp with time zone not null default now(),
 "updated_at" timestamp with time zone not null default now(),
 "approved_score_id" uuid,
 "approved_at" timestamp with time zone,
 UNIQUE (article_id, arc_id),
 PRIMARY KEY (id),
 CHECK ((state = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'invalidated'::text])))
);
create table public.pipeline_config(key text primary key,value jsonb);
alter table public.articles enable row level security;
create policy articles_select_eligible on public.articles for select to anon,authenticated using(reader_state='eligible' and source_status='active');
create policy spatial_owner_read_articles on public.articles for select to spatial_owner using(true);
revoke all on all tables in schema public from public,anon,authenticated,service_role;
grant select on public.articles to anon,authenticated;
grant select on public.nodes to service_role;
create view public.spatial_projection_v1 as  WITH in_effect_scopes AS (
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
     JOIN nodes subj ON subj.id = a.graph_node_id AND subj.type = 'event'::text
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
grant select on public.spatial_projection_v1 to service_role;
CREATE OR REPLACE FUNCTION public.mip_intercept_direct_arc_attachment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_approved_candidate uuid := nullif(current_setting('app.arc_membership_approval_candidate_id', true), '')::uuid;
begin
  if new.arc_id is distinct from old.arc_id and new.arc_id is not null then
    if v_approved_candidate is not null and exists (select 1 from public.arc_membership_candidates c where c.id = v_approved_candidate and c.article_id = new.id and c.arc_id = new.arc_id and c.state = 'approved') then
      return new;
    end if;
    insert into public.arc_membership_candidates(article_id, arc_id, generation_method, generation_evidence, state)
    values (new.id, new.arc_id, 'direct_attachment_intercept_v1', jsonb_build_object('prior_arc_id', old.arc_id, 'intercepted_at', now()), 'pending')
    on conflict (article_id, arc_id) do update set state = 'pending', invalidated_at = null, generation_evidence = public.arc_membership_candidates.generation_evidence || excluded.generation_evidence;
    new.arc_id := old.arc_id;
    new.arc_assignment_evidence := coalesce(new.arc_assignment_evidence, '{}'::jsonb) || jsonb_build_object('membership_gate', 'staged_pending_score');
  end if;
  return new;
end; $function$;

CREATE TRIGGER articles_intercept_direct_arc_attachment BEFORE UPDATE ON public.articles FOR EACH ROW EXECUTE FUNCTION mip_intercept_direct_arc_attachment();
revoke all on function mip_intercept_direct_arc_attachment() from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.mip_invalidate_arc_membership_approvals()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_exempt uuid := nullif(current_setting('app.arc_membership_approval_candidate_id', true), '')::uuid;
  v_old_arc uuid := case when tg_op = 'INSERT' then null else old.arc_id end;
  v_new_arc uuid := case when tg_op = 'DELETE' then null else new.arc_id end;
begin
  update public.arc_membership_candidates c set state = 'invalidated', invalidated_at = now()
  where c.state = 'approved' and c.id is distinct from v_exempt and c.arc_id in (v_old_arc, v_new_arc);
  return coalesce(new, old);
end; $function$;

CREATE TRIGGER articles_invalidate_arc_membership_approvals AFTER INSERT OR DELETE OR UPDATE ON public.articles FOR EACH ROW EXECUTE FUNCTION mip_invalidate_arc_membership_approvals();
revoke all on function mip_invalidate_arc_membership_approvals() from public,anon,authenticated;
create table if not exists public.arc_events (id uuid primary key default gen_random_uuid(), arc_id uuid not null references public.story_arcs (id) on delete cascade, title text not null, category text not null, confidence text not null default 'confirmed', occurred_at date, description text, arc_membership_candidate_id uuid references public.arc_membership_candidates (id));
create table if not exists public.citations (id uuid primary key default gen_random_uuid(), article_id uuid not null references public.articles (id) on delete cascade, cited_entity text not null, cited_type text not null, documentation_strength numeric not null, resolved_node_id uuid references public.nodes (id), created_at timestamptz not null default now());
create table if not exists public.events (id uuid primary key default gen_random_uuid(), canonical_title text not null, occurred_at_start date, occurred_at_end date, location_text text, arc_id uuid references public.story_arcs (id), arc_event_id uuid references public.arc_events (id), status text not null default 'candidate', rule_version text, created_at timestamptz not null default now(), comparison_validation_state text not null default 'pending_review' check (comparison_validation_state in ('pending_review', 'approved', 'quarantined', 'not_applicable')));
create table if not exists public.claims (id uuid primary key default gen_random_uuid(), event_id uuid references public.events (id), canonical_text text not null, claim_kind text not null default 'fact', thin_extraction boolean not null default false, status text not null default 'active', rule_version text, first_seen_at timestamptz not null default now(), created_at timestamptz not null default now());
create table if not exists public.article_claims (id uuid primary key default gen_random_uuid(), claim_id uuid not null references public.claims (id), article_id uuid not null references public.articles (id), surface_text text not null, char_start integer, char_end integer, extraction_method text not null default 'existing_claims_jsonb', extraction_confidence numeric, stance text not null default 'asserts', loaded_language jsonb not null default '[]'::jsonb, version integer not null default 1, is_current boolean not null default true, created_at timestamptz not null default now(), evidence_source_field text, evidence_excerpt text, auditability_state text not null default 'unverified_against_retained_source', auditability_note text, unique (claim_id, article_id, version));
create table if not exists public.event_articles (event_id uuid not null references public.events (id), article_id uuid not null references public.articles (id), membership_method text not null, membership_confidence numeric, created_at timestamptz not null default now(), primary key (event_id, article_id));
create table if not exists public.claim_evidence_links (id uuid primary key default gen_random_uuid(), claim_id uuid not null references public.claims (id), evidence_url text not null, evidence_type text not null default 'other', linked_from_article_id uuid references public.articles (id), created_at timestamptz not null default now());
revoke all on public.arc_membership_candidates from public,anon,authenticated;
alter table public.arc_membership_candidates enable row level security;
grant select,insert,update on public.arc_membership_candidates to service_role;
revoke all on public.citations,public.events,public.claims,public.article_claims,public.event_articles,public.claim_evidence_links from public,anon,authenticated;
grant select on public.citations to anon,authenticated;
