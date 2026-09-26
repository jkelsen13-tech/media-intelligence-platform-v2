-- J1 portable native structure from bounded jfn catalog 2026-09-23.
-- Synthetic-only. NOT a live migration. Omits Auth/profile UI and project-wide
-- service configuration; no equivalence claimed there.
create schema extensions; create extension pgcrypto with schema extensions;
create extension vector with schema public;
create schema spatial authorization spatial_owner;
set check_function_bodies=off;
create table arc_membership_candidates (
 "id" uuid not null
);
create table articles (
 "id" uuid default gen_random_uuid() not null,
 "feed" text not null,
 "outlet" text not null,
 "title" text not null,
 "url" text not null,
 "summary" text,
 "published_at" timestamp with time zone,
 "fetched_at" timestamp with time zone default now() not null,
 "outlet_id" uuid,
 "author_id" uuid,
 "body_text" text,
 "embedding" public.vector(384),
 "claims" jsonb default '[]'::jsonb not null,
 "arc_id" uuid,
 "unattributed" boolean default false not null,
 "monoculture" boolean default false not null,
 "is_digest" boolean default false not null,
 "image_url" text,
 "image_alt" text,
 "entities_extracted_at" timestamp with time zone,
 "arc_assign_attempted_at" timestamp with time zone,
 "ingestion_run_id" text,
 "source_status" text default 'active'::text not null,
 "source_status_changed_at" timestamp with time zone,
 "source_status_note" text,
 "arc_assignment_evidence" jsonb,
 "candidate_generation_attempted_at" timestamp with time zone,
 "candidate_generation_note" text,
 "reader_state" text default 'pending_review'::text not null,
 "reader_exclusion_reason" text
);
create table authors (
 "id" uuid default gen_random_uuid() not null
);
create table geographic_places (
 "id" uuid default gen_random_uuid() not null,
 "canonical_name" text not null,
 "country_code" text,
 "admin1_name" text,
 "latitude" numeric(9,6),
 "longitude" numeric(9,6),
 "precision" text not null,
 "gazetteer_provider" text,
 "gazetteer_id" text,
 "created_at" timestamp with time zone default now() not null,
 "updated_at" timestamp with time zone default now() not null
);
create table nodes (
 "id" uuid default gen_random_uuid() not null,
 "slug" text not null,
 "label" text not null,
 "type" text not null,
 "description" text,
 "metadata" jsonb default '{}'::jsonb not null,
 "created_at" timestamp with time zone default now() not null,
 "updated_at" timestamp with time zone default now() not null,
 "confidence" integer,
 "summary" text,
 "occurred_at" date,
 "arc_id" uuid,
 "arc_membership_candidate_id" uuid
);
create table outlets (
 "id" uuid default gen_random_uuid() not null
);
create table pipeline_config (
 "key" text not null,
 "value" jsonb not null,
 "description" text,
 "updated_at" timestamp with time zone default now() not null
);
create table policies (
 "id" uuid default gen_random_uuid() not null
);
create table policy_documents (
 "id" uuid default gen_random_uuid() not null,
 "policy_id" uuid,
 "source" text not null,
 "external_id" text,
 "title" text,
 "url" text,
 "published_at" timestamp with time zone,
 "raw_summary" text,
 "extracted_claims" jsonb default '[]'::jsonb not null,
 "created_at" timestamp with time zone default now() not null
);
create table source_change_events (
 "id" uuid default gen_random_uuid() not null,
 "source_id" uuid not null,
 "change_type" text not null,
 "affected_assertion_ids" text[] default '{}'::text[] not null,
 "actor" text default 'system'::text not null,
 "note" text,
 "created_at" timestamp with time zone default now() not null,
 "linked_assertion_ids" text[] default '{}'::text[] not null,
 "mutated_assertion_ids" text[] default '{}'::text[] not null,
 "skipped_withdrawn_assertion_ids" text[] default '{}'::text[] not null,
 "linked_count" integer default 0 not null,
 "mutated_count" integer default 0 not null,
 "skipped_withdrawn_count" integer default 0 not null
);
create table sources (
 "id" uuid default gen_random_uuid() not null,
 "node_id" uuid not null,
 "outlet" text not null,
 "headline" text not null,
 "url" text,
 "published_at" date,
 "created_at" timestamp with time zone default now() not null,
 "arc_membership_candidate_id" uuid
);
create table spatial.assertion_revisions (
 "id" uuid default gen_random_uuid() not null,
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
 "created_at" timestamp with time zone default transaction_timestamp() not null
);
create table spatial.assertions (
 "id" uuid default gen_random_uuid() not null,
 "graph_node_id" uuid not null,
 "assertion_kind" text not null,
 "relationship_scope_key" text not null,
 "scope_policy_artifact_id" uuid not null,
 "created_by_principal_ref" text not null,
 "assertion_fingerprint" text not null,
 "created_at" timestamp with time zone default transaction_timestamp() not null
);
create table spatial.audience_scopes (
 "id" uuid default gen_random_uuid() not null,
 "audience_code" text not null,
 "audience_version" text not null,
 "canonical_capabilities" jsonb not null,
 "canonicalization_version" text not null,
 "content_hash_algorithm" text not null,
 "content_hash" text not null,
 "effective_at" timestamp with time zone not null,
 "supersedes_audience_scope_id" uuid,
 "created_by_principal_ref" text not null,
 "created_at" timestamp with time zone default transaction_timestamp() not null
);
create table spatial.break_glass_audit (
 "id" uuid default gen_random_uuid() not null,
 "audit_phase" text not null,
 "related_intent_id" uuid,
 "administrator_principal_ref" text not null,
 "owner_authorization_ref" text not null,
 "target_object" text not null,
 "proposed_or_completed_action" text not null,
 "reason" text not null,
 "before_state_hash" text,
 "result_state_hash" text,
 "created_at" timestamp with time zone default transaction_timestamp() not null
);
create table spatial.evidence_artifact_registry (
 "id" uuid default gen_random_uuid() not null,
 "artifact_type_code" text not null,
 "article_id" uuid,
 "policy_document_id" uuid,
 "source_record_id" uuid,
 "source_node_id" uuid,
 "source_node_authority_snapshot_id" uuid,
 "source_graph_association_fingerprint" text,
 "stable_artifact_key" text not null,
 "validation_policy_artifact_id" uuid not null,
 "validated_by_principal_ref" text not null,
 "validated_at" timestamp with time zone not null,
 "registry_fingerprint" text not null
);
create table spatial.evidence_condition_events (
 "id" uuid default gen_random_uuid() not null,
 "evidence_snapshot_id" uuid not null,
 "condition" text not null,
 "source_change_event_id" uuid,
 "condition_policy_artifact_id" uuid not null,
 "reason_code" text not null,
 "observed_by_principal_ref" text not null,
 "observed_at" timestamp with time zone not null,
 "event_fingerprint" text not null
);
create table spatial.evidence_snapshots (
 "id" uuid default gen_random_uuid() not null,
 "evidence_artifact_registry_id" uuid not null,
 "source_field" text not null,
 "span_start" integer,
 "span_end" integer,
 "span_coordinate_system" text not null,
 "normalization_version" text not null,
 "encoding_version" text not null,
 "content_hash_algorithm" text not null,
 "content_hash" text not null,
 "source_version_identifier" text,
 "source_acquired_at" timestamp with time zone not null,
 "capture_mode" text not null,
 "capture_policy_artifact_id" uuid not null,
 "retention_policy_artifact_id" uuid not null,
 "retention_classification" text not null,
 "access_scope" text not null,
 "immutable_capture_ref" text,
 "snapshot_fingerprint" text not null,
 "created_by_principal_ref" text not null,
 "created_at" timestamp with time zone default transaction_timestamp() not null
);
create table spatial.geometry_snapshots (
 "id" uuid default gen_random_uuid() not null,
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
 "created_at" timestamp with time zone default transaction_timestamp() not null
);
create table spatial.graph_node_authority_snapshots (
 "id" uuid default gen_random_uuid() not null,
 "graph_node_id" uuid not null,
 "node_payload" jsonb not null,
 "node_updated_at" timestamp with time zone not null,
 "observed_at" timestamp with time zone not null,
 "canonicalization_version" text not null,
 "snapshot_hash" text not null,
 "captured_by_principal_ref" text not null,
 "captured_at" timestamp with time zone default transaction_timestamp() not null
);
create table spatial.place_authority_snapshots (
 "id" uuid default gen_random_uuid() not null,
 "canonical_place_id" uuid not null,
 "place_payload" jsonb not null,
 "place_updated_at" timestamp with time zone not null,
 "observed_at" timestamp with time zone not null,
 "canonicalization_version" text not null,
 "snapshot_hash" text not null,
 "captured_by_principal_ref" text not null,
 "captured_at" timestamp with time zone default transaction_timestamp() not null
);
create table spatial.policy_artifacts (
 "id" uuid default gen_random_uuid() not null,
 "policy_family_code" text not null,
 "policy_version" text not null,
 "canonical_content" jsonb not null,
 "canonicalization_version" text not null,
 "content_hash_algorithm" text not null,
 "content_hash" text not null,
 "effective_at" timestamp with time zone not null,
 "supersedes_policy_artifact_id" uuid,
 "created_by_principal_ref" text not null,
 "created_at" timestamp with time zone default transaction_timestamp() not null
);
create table spatial.release_decisions (
 "id" uuid default gen_random_uuid() not null,
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
 "created_at" timestamp with time zone default transaction_timestamp() not null
);
create table spatial.review_decisions (
 "id" uuid default gen_random_uuid() not null,
 "assertion_revision_id" uuid not null,
 "support_disposition" text not null,
 "review_mode" text not null,
 "review_outcome_basis" jsonb not null,
 "review_policy_artifact_id" uuid not null,
 "reviewed_by_principal_ref" text not null,
 "effective_at" timestamp with time zone not null,
 "reason_code" text not null,
 "decision_fingerprint" text not null,
 "created_at" timestamp with time zone default transaction_timestamp() not null
);
create table spatial.revision_evidence (
 "id" uuid default gen_random_uuid() not null,
 "assertion_revision_id" uuid not null,
 "evidence_snapshot_id" uuid not null,
 "evidence_role" text not null,
 "linkage_fingerprint" text not null,
 "created_at" timestamp with time zone default transaction_timestamp() not null
);
create table spatial.revision_lineage (
 "id" uuid default gen_random_uuid() not null,
 "from_revision_id" uuid not null,
 "to_revision_id" uuid not null,
 "relationship_type" text not null,
 "lineage_fingerprint" text not null,
 "created_by_principal_ref" text not null,
 "created_at" timestamp with time zone default transaction_timestamp() not null
);
create table story_arcs (
 "id" uuid default gen_random_uuid() not null
);
alter table story_arcs add constraint "story_arcs_pkey" PRIMARY KEY (id);
alter table outlets add constraint "outlets_pkey" PRIMARY KEY (id);
alter table authors add constraint "authors_pkey" PRIMARY KEY (id);
alter table policies add constraint "policies_pkey" PRIMARY KEY (id);
alter table arc_membership_candidates add constraint "arc_membership_candidates_pkey" PRIMARY KEY (id);
alter table nodes add constraint "nodes_type_check" CHECK ((type = ANY (ARRAY['event'::text, 'actor'::text, 'institution'::text, 'document'::text, 'anomaly'::text, 'policy'::text, 'topic'::text])));
alter table nodes add constraint "nodes_confidence_check" CHECK (((confidence >= 0) AND (confidence <= 100)));
alter table nodes add constraint "nodes_pkey" PRIMARY KEY (id);
alter table nodes add constraint "nodes_slug_key" UNIQUE (slug);
alter table sources add constraint "sources_pkey" PRIMARY KEY (id);
alter table articles add constraint "articles_source_status_check" CHECK ((source_status = ANY (ARRAY['active'::text, 'corrected'::text, 'withdrawn'::text])));
alter table articles add constraint "articles_reader_state_check" CHECK ((reader_state = ANY (ARRAY['eligible'::text, 'pending_review'::text, 'withheld'::text])));
alter table geographic_places add constraint "geographic_places_check" CHECK ((((latitude IS NULL) AND (longitude IS NULL)) OR (((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric)) AND ((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric)))));
alter table geographic_places add constraint "geographic_places_pkey" PRIMARY KEY (id);
alter table geographic_places add constraint "geographic_places_gazetteer_provider_gazetteer_id_key" UNIQUE NULLS NOT DISTINCT (gazetteer_provider, gazetteer_id);
alter table spatial.policy_artifacts add constraint "policy_artifacts_policy_family_code_check" CHECK ((policy_family_code = ANY (ARRAY['assertion_scope_key'::text, 'temporal_interval'::text, 'evidence_artifact_validation'::text, 'evidence_capture'::text, 'evidence_retention'::text, 'geometry_compatibility'::text, 'evidence_condition_interpretation'::text, 'review_authorization'::text, 'release_disclosure'::text])));
alter table articles add constraint "articles_reader_exclusion_reason_check" CHECK (((reader_exclusion_reason IS NULL) OR (reader_exclusion_reason = ANY (ARRAY['malformed_title'::text, 'unavailable_page'::text, 'canonical_url_duplicate'::text, 'promotional_material'::text, 'off_mission'::text, 'manual_hold'::text]))));
alter table articles add constraint "articles_pkey" PRIMARY KEY (id);
alter table articles add constraint "articles_url_key" UNIQUE (url);
alter table policy_documents add constraint "policy_documents_source_check" CHECK ((source = ANY (ARRAY['federal_register'::text, 'gao'::text, 'crs'::text, 'ig'::text, 'eurlex'::text, 'legislation_gov_uk'::text, 'courtlistener'::text])));
alter table policy_documents add constraint "policy_documents_pkey" PRIMARY KEY (id);
alter table policy_documents add constraint "policy_documents_source_external_id_key" UNIQUE (source, external_id);
alter table source_change_events add constraint "source_change_events_change_type_check" CHECK ((change_type = ANY (ARRAY['corrected'::text, 'withdrawn'::text])));
alter table source_change_events add constraint "source_change_events_pkey" PRIMARY KEY (id);
alter table geographic_places add constraint "geographic_places_precision_check" CHECK (("precision" = ANY (ARRAY['country'::text, 'region'::text, 'city'::text, 'area'::text, 'facility'::text])));
alter table spatial.assertions add constraint "assertions_graph_node_id_assertion_kind_relationship_scope__key" UNIQUE (graph_node_id, assertion_kind, relationship_scope_key);
alter table spatial.policy_artifacts add constraint "policy_artifacts_canonicalization_version_check" CHECK ((canonicalization_version = 'rfc8785-jcs-v1'::text));
alter table spatial.policy_artifacts add constraint "policy_artifacts_content_hash_algorithm_check" CHECK ((content_hash_algorithm = 'sha256'::text));
alter table spatial.policy_artifacts add constraint "policy_artifacts_content_hash_check" CHECK ((content_hash ~ '^[0-9a-f]{64}$'::text));
alter table spatial.policy_artifacts add constraint "policy_artifacts_check" CHECK (((supersedes_policy_artifact_id IS NULL) OR (supersedes_policy_artifact_id <> id)));
alter table spatial.policy_artifacts add constraint "policy_artifacts_pkey" PRIMARY KEY (id);
alter table spatial.policy_artifacts add constraint "policy_artifacts_policy_family_code_policy_version_key" UNIQUE (policy_family_code, policy_version);
alter table spatial.audience_scopes add constraint "audience_scopes_canonicalization_version_check" CHECK ((canonicalization_version = 'rfc8785-jcs-v1'::text));
alter table spatial.audience_scopes add constraint "audience_scopes_content_hash_algorithm_check" CHECK ((content_hash_algorithm = 'sha256'::text));
alter table spatial.audience_scopes add constraint "audience_scopes_content_hash_check" CHECK ((content_hash ~ '^[0-9a-f]{64}$'::text));
alter table spatial.audience_scopes add constraint "audience_scopes_check" CHECK (((supersedes_audience_scope_id IS NULL) OR (supersedes_audience_scope_id <> id)));
alter table spatial.audience_scopes add constraint "audience_scopes_pkey" PRIMARY KEY (id);
alter table spatial.audience_scopes add constraint "audience_scopes_audience_code_audience_version_key" UNIQUE (audience_code, audience_version);
alter table spatial.assertions add constraint "assertions_assertion_kind_check" CHECK ((assertion_kind = 'event_spatial_relationship'::text));
alter table spatial.assertions add constraint "assertions_assertion_fingerprint_check" CHECK ((assertion_fingerprint ~ '^[0-9a-f]{64}$'::text));
alter table spatial.assertions add constraint "assertions_pkey" PRIMARY KEY (id);
alter table spatial.assertions add constraint "assertions_assertion_fingerprint_key" UNIQUE (assertion_fingerprint);
alter table spatial.graph_node_authority_snapshots add constraint "graph_node_authority_snapshots_canonicalization_version_check" CHECK ((canonicalization_version = 'rfc8785-jcs-v1'::text));
alter table spatial.graph_node_authority_snapshots add constraint "graph_node_authority_snapshots_snapshot_hash_check" CHECK ((snapshot_hash ~ '^[0-9a-f]{64}$'::text));
alter table spatial.graph_node_authority_snapshots add constraint "graph_node_authority_snapshots_pkey" PRIMARY KEY (id);
alter table spatial.graph_node_authority_snapshots add constraint "graph_node_authority_snapshots_graph_node_id_snapshot_hash_key" UNIQUE (graph_node_id, snapshot_hash);
alter table spatial.place_authority_snapshots add constraint "place_authority_snapshots_canonicalization_version_check" CHECK ((canonicalization_version = 'rfc8785-jcs-v1'::text));
alter table spatial.place_authority_snapshots add constraint "place_authority_snapshots_snapshot_hash_check" CHECK ((snapshot_hash ~ '^[0-9a-f]{64}$'::text));
alter table spatial.place_authority_snapshots add constraint "place_authority_snapshots_pkey" PRIMARY KEY (id);
alter table spatial.place_authority_snapshots add constraint "place_authority_snapshots_canonical_place_id_snapshot_hash_key" UNIQUE (canonical_place_id, snapshot_hash);
alter table spatial.geometry_snapshots add constraint "geometry_snapshots_geometry_scope_check" CHECK ((geometry_scope = 'internal'::text));
alter table spatial.geometry_snapshots add constraint "geometry_snapshots_representation_kind_check" CHECK ((representation_kind = ANY (ARRAY['point'::text, 'representative_point'::text, 'line'::text, 'route'::text, 'polygon'::text, 'multipolygon'::text, 'named_place_reference'::text, 'no_geometry'::text])));
alter table spatial.geometry_snapshots add constraint "geometry_snapshots_crs_check" CHECK ((crs = 'EPSG:4326'::text));
alter table spatial.geometry_snapshots add constraint "geometry_snapshots_geometry_precision_check" CHECK ((geometry_precision = ANY (ARRAY['country'::text, 'region'::text, 'city'::text, 'area'::text, 'facility'::text])));
alter table spatial.geometry_snapshots add constraint "geometry_snapshots_canonicalization_version_check" CHECK ((canonicalization_version = 'rfc8785-jcs-v1'::text));
alter table spatial.geometry_snapshots add constraint "geometry_snapshots_geometry_hash_check" CHECK ((geometry_hash ~ '^[0-9a-f]{64}$'::text));
alter table spatial.geometry_snapshots add constraint "geometry_snapshots_check" CHECK (((canonical_place_id IS NULL) = (place_authority_snapshot_id IS NULL)));
alter table spatial.geometry_snapshots add constraint "geometry_snapshots_check1" CHECK (((representation_kind <> ALL (ARRAY['named_place_reference'::text, 'no_geometry'::text])) OR (canonical_geojson IS NULL)));
alter table spatial.geometry_snapshots add constraint "geometry_snapshots_check2" CHECK (((representation_kind = ANY (ARRAY['named_place_reference'::text, 'no_geometry'::text])) OR (canonical_geojson IS NOT NULL)));
alter table spatial.geometry_snapshots add constraint "geometry_snapshots_pkey" PRIMARY KEY (id);
alter table spatial.geometry_snapshots add constraint "geometry_snapshots_geometry_hash_key" UNIQUE (geometry_hash);
alter table spatial.assertion_revisions add constraint "assertion_revisions_revision_ordinal_check" CHECK ((revision_ordinal > 0));
alter table spatial.assertion_revisions add constraint "assertion_revisions_location_role_check" CHECK ((location_role = ANY (ARRAY['event'::text, 'facility'::text, 'jurisdiction'::text, 'context'::text, 'publisher'::text])));
alter table spatial.assertion_revisions add constraint "assertion_revisions_relationship_qualifier_check" CHECK ((relationship_qualifier = ANY (ARRAY['none'::text, 'origin'::text, 'destination'::text, 'route'::text, 'affected_area'::text, 'operational_footprint'::text, 'multiple_sites'::text, 'ongoing_area'::text, 'representative_context'::text])));
alter table spatial.assertion_revisions add constraint "assertion_revisions_evidence_precision_check" CHECK ((evidence_precision = ANY (ARRAY['country'::text, 'region'::text, 'city'::text, 'area'::text, 'facility'::text])));
alter table spatial.assertion_revisions add constraint "assertion_revisions_valid_time_precision_check" CHECK ((valid_time_precision = ANY (ARRAY['exact_timestamp'::text, 'day'::text, 'month'::text, 'year'::text, 'range'::text, 'approximate'::text, 'unknown'::text])));
alter table spatial.assertion_revisions add constraint "assertion_revisions_revision_fingerprint_check" CHECK ((revision_fingerprint ~ '^[0-9a-f]{64}$'::text));
alter table spatial.assertion_revisions add constraint "assertion_revisions_check" CHECK (((canonical_place_id IS NULL) = (place_authority_snapshot_id IS NULL)));
alter table spatial.assertion_revisions add constraint "assertion_revisions_check1" CHECK (((guard_start_utc IS NULL) OR (guard_end_utc IS NULL) OR (guard_start_utc < guard_end_utc)));
alter table spatial.assertion_revisions add constraint "assertion_revisions_pkey" PRIMARY KEY (id);
alter table spatial.assertion_revisions add constraint "assertion_revisions_revision_fingerprint_key" UNIQUE (revision_fingerprint);
alter table spatial.assertion_revisions add constraint "assertion_revisions_spatial_assertion_id_revision_ordinal_key" UNIQUE (spatial_assertion_id, revision_ordinal);
alter table spatial.revision_lineage add constraint "revision_lineage_relationship_type_check" CHECK ((relationship_type = ANY (ARRAY['supersedes'::text, 'corrects'::text, 'derives_from'::text])));
alter table spatial.revision_lineage add constraint "revision_lineage_lineage_fingerprint_check" CHECK ((lineage_fingerprint ~ '^[0-9a-f]{64}$'::text));
alter table spatial.revision_lineage add constraint "revision_lineage_check" CHECK ((from_revision_id <> to_revision_id));
alter table spatial.revision_lineage add constraint "revision_lineage_pkey" PRIMARY KEY (id);
alter table spatial.revision_lineage add constraint "revision_lineage_lineage_fingerprint_key" UNIQUE (lineage_fingerprint);
alter table spatial.revision_lineage add constraint "revision_lineage_from_revision_id_to_revision_id_key" UNIQUE (from_revision_id, to_revision_id);
alter table spatial.evidence_artifact_registry add constraint "evidence_artifact_registry_artifact_type_code_check" CHECK ((artifact_type_code = ANY (ARRAY['article'::text, 'source_record'::text, 'policy_document'::text])));
alter table spatial.evidence_artifact_registry add constraint "evidence_artifact_registry_source_graph_association_finge_check" CHECK (((source_graph_association_fingerprint IS NULL) OR (source_graph_association_fingerprint ~ '^[0-9a-f]{64}$'::text)));
alter table spatial.evidence_artifact_registry add constraint "evidence_artifact_registry_registry_fingerprint_check" CHECK ((registry_fingerprint ~ '^[0-9a-f]{64}$'::text));
alter table spatial.evidence_artifact_registry add constraint "evidence_artifact_registry_check" CHECK ((((artifact_type_code = 'article'::text) AND (article_id IS NOT NULL) AND (policy_document_id IS NULL) AND (source_record_id IS NULL) AND (source_node_id IS NULL) AND (source_node_authority_snapshot_id IS NULL) AND (source_graph_association_fingerprint IS NULL)) OR ((artifact_type_code = 'policy_document'::text) AND (article_id IS NULL) AND (policy_document_id IS NOT NULL) AND (source_record_id IS NULL) AND (source_node_id IS NULL) AND (source_node_authority_snapshot_id IS NULL) AND (source_graph_association_fingerprint IS NULL)) OR ((artifact_type_code = 'source_record'::text) AND (article_id IS NULL) AND (policy_document_id IS NULL) AND (source_record_id IS NOT NULL) AND (source_node_id IS NOT NULL) AND (source_node_authority_snapshot_id IS NOT NULL) AND (source_graph_association_fingerprint IS NOT NULL))));
alter table spatial.evidence_artifact_registry add constraint "evidence_artifact_registry_pkey" PRIMARY KEY (id);
alter table spatial.evidence_artifact_registry add constraint "evidence_artifact_registry_stable_artifact_key_key" UNIQUE (stable_artifact_key);
alter table spatial.evidence_artifact_registry add constraint "evidence_artifact_registry_registry_fingerprint_key" UNIQUE (registry_fingerprint);
alter table spatial.evidence_snapshots add constraint "evidence_snapshots_span_start_check" CHECK (((span_start IS NULL) OR (span_start >= 0)));
alter table spatial.evidence_snapshots add constraint "evidence_snapshots_span_end_check" CHECK (((span_end IS NULL) OR (span_end >= 0)));
alter table spatial.evidence_snapshots add constraint "evidence_snapshots_span_coordinate_system_check" CHECK ((span_coordinate_system = ANY (ARRAY['unicode_codepoint_v1'::text, 'structured_field_v1'::text])));
alter table spatial.evidence_snapshots add constraint "evidence_snapshots_content_hash_algorithm_check" CHECK ((content_hash_algorithm = 'sha256'::text));
alter table spatial.evidence_snapshots add constraint "evidence_snapshots_content_hash_check" CHECK ((content_hash ~ '^[0-9a-f]{64}$'::text));
alter table spatial.evidence_snapshots add constraint "evidence_snapshots_capture_mode_check" CHECK ((capture_mode = ANY (ARRAY['hash_offsets'::text, 'immutable_artifact_ref'::text])));
alter table spatial.evidence_snapshots add constraint "evidence_snapshots_retention_classification_check" CHECK ((retention_classification = ANY (ARRAY['reference_only'::text, 'governed_internal'::text])));
alter table spatial.evidence_snapshots add constraint "evidence_snapshots_access_scope_check" CHECK ((access_scope = ANY (ARRAY['internal_governance'::text, 'internal_restricted'::text])));
alter table spatial.evidence_snapshots add constraint "evidence_snapshots_snapshot_fingerprint_check" CHECK ((snapshot_fingerprint ~ '^[0-9a-f]{64}$'::text));
alter table spatial.evidence_condition_events add constraint "evidence_condition_events_event_fingerprint_check" CHECK ((event_fingerprint ~ '^[0-9a-f]{64}$'::text));
alter table spatial.evidence_condition_events add constraint "evidence_condition_events_pkey" PRIMARY KEY (id);
alter table spatial.evidence_snapshots add constraint "evidence_snapshots_check" CHECK ((((span_start IS NULL) AND (span_end IS NULL)) OR ((span_start IS NOT NULL) AND (span_end IS NOT NULL) AND (span_start < span_end))));
alter table spatial.evidence_snapshots add constraint "evidence_snapshots_check1" CHECK (((capture_mode <> 'immutable_artifact_ref'::text) OR (immutable_capture_ref IS NOT NULL)));
alter table spatial.evidence_snapshots add constraint "evidence_snapshots_pkey" PRIMARY KEY (id);
alter table spatial.evidence_snapshots add constraint "evidence_snapshots_snapshot_fingerprint_key" UNIQUE (snapshot_fingerprint);
alter table spatial.revision_evidence add constraint "revision_evidence_evidence_role_check" CHECK ((evidence_role = ANY (ARRAY['primary_support'::text, 'corroborating_support'::text, 'contradictory'::text, 'context_only'::text])));
alter table spatial.revision_evidence add constraint "revision_evidence_linkage_fingerprint_check" CHECK ((linkage_fingerprint ~ '^[0-9a-f]{64}$'::text));
alter table spatial.revision_evidence add constraint "revision_evidence_pkey" PRIMARY KEY (id);
alter table spatial.revision_evidence add constraint "revision_evidence_linkage_fingerprint_key" UNIQUE (linkage_fingerprint);
alter table spatial.revision_evidence add constraint "revision_evidence_assertion_revision_id_evidence_snapshot_i_key" UNIQUE (assertion_revision_id, evidence_snapshot_id);
alter table spatial.evidence_condition_events add constraint "evidence_condition_events_condition_check" CHECK ((condition = ANY (ARRAY['active'::text, 'changed'::text, 'unavailable'::text, 'contradicted'::text])));
alter table spatial.evidence_condition_events add constraint "evidence_condition_events_event_fingerprint_key" UNIQUE (event_fingerprint);
alter table spatial.review_decisions add constraint "review_decisions_support_disposition_check" CHECK ((support_disposition = ANY (ARRAY['under_review'::text, 'operative'::text, 'invalidated'::text, 'retracted'::text])));
alter table spatial.review_decisions add constraint "review_decisions_review_mode_check" CHECK ((review_mode = ANY (ARRAY['manual'::text, 'assisted'::text, 'deterministic_verification'::text, 'automated_proposal'::text])));
alter table spatial.review_decisions add constraint "review_decisions_decision_fingerprint_check" CHECK ((decision_fingerprint ~ '^[0-9a-f]{64}$'::text));
alter table spatial.review_decisions add constraint "review_decisions_pkey" PRIMARY KEY (id);
alter table spatial.review_decisions add constraint "review_decisions_decision_fingerprint_key" UNIQUE (decision_fingerprint);
alter table spatial.release_decisions add constraint "release_decisions_decision_disposition_check" CHECK ((decision_disposition = ANY (ARRAY['withheld'::text, 'revoked'::text, 'released'::text, 'restricted'::text])));
alter table spatial.release_decisions add constraint "release_decisions_decision_fingerprint_check" CHECK ((decision_fingerprint ~ '^[0-9a-f]{64}$'::text));
alter table spatial.release_decisions add constraint "release_decisions_check" CHECK (((predecessor_release_decision_id IS NULL) OR (predecessor_release_decision_id <> id)));
alter table spatial.release_decisions add constraint "release_decisions_pkey" PRIMARY KEY (id);
alter table spatial.release_decisions add constraint "release_decisions_decision_fingerprint_key" UNIQUE (decision_fingerprint);
alter table spatial.break_glass_audit add constraint "break_glass_audit_audit_phase_check" CHECK ((audit_phase = ANY (ARRAY['intent'::text, 'completion'::text])));
alter table spatial.break_glass_audit add constraint "break_glass_audit_before_state_hash_check" CHECK (((before_state_hash IS NULL) OR (before_state_hash ~ '^[0-9a-f]{64}$'::text)));
alter table spatial.break_glass_audit add constraint "break_glass_audit_result_state_hash_check" CHECK (((result_state_hash IS NULL) OR (result_state_hash ~ '^[0-9a-f]{64}$'::text)));
alter table spatial.break_glass_audit add constraint "break_glass_audit_check" CHECK ((((audit_phase = 'intent'::text) AND (related_intent_id IS NULL)) OR ((audit_phase = 'completion'::text) AND (related_intent_id IS NOT NULL))));
alter table spatial.break_glass_audit add constraint "break_glass_audit_pkey" PRIMARY KEY (id);
alter table pipeline_config add constraint "pipeline_config_pkey" PRIMARY KEY (key);
alter table spatial.assertions add constraint "assertions_graph_node_id_fkey" FOREIGN KEY (graph_node_id) REFERENCES nodes(id) ON DELETE RESTRICT;
alter table spatial.assertions add constraint "assertions_scope_policy_artifact_id_fkey" FOREIGN KEY (scope_policy_artifact_id) REFERENCES spatial.policy_artifacts(id) ON DELETE RESTRICT;
alter table spatial.assertion_revisions add constraint "assertion_revisions_spatial_assertion_id_fkey" FOREIGN KEY (spatial_assertion_id) REFERENCES spatial.assertions(id) ON DELETE RESTRICT;
alter table spatial.assertion_revisions add constraint "assertion_revisions_graph_node_authority_snapshot_id_fkey" FOREIGN KEY (graph_node_authority_snapshot_id) REFERENCES spatial.graph_node_authority_snapshots(id) ON DELETE RESTRICT;
alter table nodes add constraint "nodes_arc_id_fkey" FOREIGN KEY (arc_id) REFERENCES story_arcs(id) ON DELETE SET NULL;
alter table sources add constraint "sources_node_id_fkey" FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE;
alter table sources add constraint "sources_arc_membership_candidate_id_fkey" FOREIGN KEY (arc_membership_candidate_id) REFERENCES arc_membership_candidates(id) ON DELETE SET NULL;
alter table articles add constraint "articles_outlet_id_fkey" FOREIGN KEY (outlet_id) REFERENCES outlets(id);
alter table articles add constraint "articles_author_id_fkey" FOREIGN KEY (author_id) REFERENCES authors(id);
alter table articles add constraint "articles_arc_id_fkey" FOREIGN KEY (arc_id) REFERENCES story_arcs(id);
alter table policy_documents add constraint "policy_documents_policy_id_fkey" FOREIGN KEY (policy_id) REFERENCES policies(id) ON DELETE SET NULL;
alter table spatial.policy_artifacts add constraint "policy_artifacts_supersedes_policy_artifact_id_fkey" FOREIGN KEY (supersedes_policy_artifact_id) REFERENCES spatial.policy_artifacts(id) ON DELETE RESTRICT;
alter table spatial.audience_scopes add constraint "audience_scopes_supersedes_audience_scope_id_fkey" FOREIGN KEY (supersedes_audience_scope_id) REFERENCES spatial.audience_scopes(id) ON DELETE RESTRICT;
alter table spatial.graph_node_authority_snapshots add constraint "graph_node_authority_snapshots_graph_node_id_fkey" FOREIGN KEY (graph_node_id) REFERENCES nodes(id) ON DELETE RESTRICT;
alter table spatial.place_authority_snapshots add constraint "place_authority_snapshots_canonical_place_id_fkey" FOREIGN KEY (canonical_place_id) REFERENCES geographic_places(id) ON DELETE RESTRICT;
alter table spatial.assertion_revisions add constraint "assertion_revisions_canonical_place_id_fkey" FOREIGN KEY (canonical_place_id) REFERENCES geographic_places(id) ON DELETE RESTRICT;
alter table spatial.assertion_revisions add constraint "assertion_revisions_place_authority_snapshot_id_fkey" FOREIGN KEY (place_authority_snapshot_id) REFERENCES spatial.place_authority_snapshots(id) ON DELETE RESTRICT;
alter table spatial.assertion_revisions add constraint "assertion_revisions_internal_geometry_snapshot_id_fkey" FOREIGN KEY (internal_geometry_snapshot_id) REFERENCES spatial.geometry_snapshots(id) ON DELETE RESTRICT;
alter table spatial.assertion_revisions add constraint "assertion_revisions_temporal_policy_artifact_id_fkey" FOREIGN KEY (temporal_policy_artifact_id) REFERENCES spatial.policy_artifacts(id) ON DELETE RESTRICT;
alter table spatial.geometry_snapshots add constraint "geometry_snapshots_canonical_place_id_fkey" FOREIGN KEY (canonical_place_id) REFERENCES geographic_places(id) ON DELETE RESTRICT;
alter table spatial.geometry_snapshots add constraint "geometry_snapshots_place_authority_snapshot_id_fkey" FOREIGN KEY (place_authority_snapshot_id) REFERENCES spatial.place_authority_snapshots(id) ON DELETE RESTRICT;
alter table spatial.geometry_snapshots add constraint "geometry_snapshots_compatibility_policy_artifact_id_fkey" FOREIGN KEY (compatibility_policy_artifact_id) REFERENCES spatial.policy_artifacts(id) ON DELETE RESTRICT;
alter table spatial.evidence_artifact_registry add constraint "evidence_artifact_registry_validation_policy_artifact_id_fkey" FOREIGN KEY (validation_policy_artifact_id) REFERENCES spatial.policy_artifacts(id) ON DELETE RESTRICT;
alter table spatial.evidence_condition_events add constraint "evidence_condition_events_evidence_snapshot_id_fkey" FOREIGN KEY (evidence_snapshot_id) REFERENCES spatial.evidence_snapshots(id) ON DELETE RESTRICT;
alter table spatial.revision_lineage add constraint "revision_lineage_from_revision_id_fkey" FOREIGN KEY (from_revision_id) REFERENCES spatial.assertion_revisions(id) ON DELETE RESTRICT;
alter table spatial.revision_lineage add constraint "revision_lineage_to_revision_id_fkey" FOREIGN KEY (to_revision_id) REFERENCES spatial.assertion_revisions(id) ON DELETE RESTRICT;
alter table spatial.evidence_artifact_registry add constraint "evidence_artifact_registry_article_id_fkey" FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE RESTRICT;
alter table spatial.evidence_artifact_registry add constraint "evidence_artifact_registry_policy_document_id_fkey" FOREIGN KEY (policy_document_id) REFERENCES policy_documents(id) ON DELETE RESTRICT;
alter table spatial.evidence_artifact_registry add constraint "evidence_artifact_registry_source_node_authority_snapshot__fkey" FOREIGN KEY (source_node_authority_snapshot_id) REFERENCES spatial.graph_node_authority_snapshots(id) ON DELETE RESTRICT;
alter table spatial.evidence_snapshots add constraint "evidence_snapshots_evidence_artifact_registry_id_fkey" FOREIGN KEY (evidence_artifact_registry_id) REFERENCES spatial.evidence_artifact_registry(id) ON DELETE RESTRICT;
alter table spatial.evidence_snapshots add constraint "evidence_snapshots_capture_policy_artifact_id_fkey" FOREIGN KEY (capture_policy_artifact_id) REFERENCES spatial.policy_artifacts(id) ON DELETE RESTRICT;
alter table spatial.evidence_snapshots add constraint "evidence_snapshots_retention_policy_artifact_id_fkey" FOREIGN KEY (retention_policy_artifact_id) REFERENCES spatial.policy_artifacts(id) ON DELETE RESTRICT;
alter table spatial.revision_evidence add constraint "revision_evidence_assertion_revision_id_fkey" FOREIGN KEY (assertion_revision_id) REFERENCES spatial.assertion_revisions(id) ON DELETE RESTRICT;
alter table spatial.revision_evidence add constraint "revision_evidence_evidence_snapshot_id_fkey" FOREIGN KEY (evidence_snapshot_id) REFERENCES spatial.evidence_snapshots(id) ON DELETE RESTRICT;
alter table spatial.evidence_condition_events add constraint "evidence_condition_events_source_change_event_id_fkey" FOREIGN KEY (source_change_event_id) REFERENCES source_change_events(id) ON DELETE RESTRICT;
alter table spatial.evidence_condition_events add constraint "evidence_condition_events_condition_policy_artifact_id_fkey" FOREIGN KEY (condition_policy_artifact_id) REFERENCES spatial.policy_artifacts(id) ON DELETE RESTRICT;
alter table spatial.review_decisions add constraint "review_decisions_assertion_revision_id_fkey" FOREIGN KEY (assertion_revision_id) REFERENCES spatial.assertion_revisions(id) ON DELETE RESTRICT;
alter table spatial.review_decisions add constraint "review_decisions_review_policy_artifact_id_fkey" FOREIGN KEY (review_policy_artifact_id) REFERENCES spatial.policy_artifacts(id) ON DELETE RESTRICT;
alter table spatial.release_decisions add constraint "release_decisions_assertion_revision_id_fkey" FOREIGN KEY (assertion_revision_id) REFERENCES spatial.assertion_revisions(id) ON DELETE RESTRICT;
alter table spatial.release_decisions add constraint "release_decisions_audience_scope_id_fkey" FOREIGN KEY (audience_scope_id) REFERENCES spatial.audience_scopes(id) ON DELETE RESTRICT;
alter table spatial.release_decisions add constraint "release_decisions_release_policy_artifact_id_fkey" FOREIGN KEY (release_policy_artifact_id) REFERENCES spatial.policy_artifacts(id) ON DELETE RESTRICT;
alter table spatial.release_decisions add constraint "release_decisions_predecessor_release_decision_id_fkey" FOREIGN KEY (predecessor_release_decision_id) REFERENCES spatial.release_decisions(id) ON DELETE RESTRICT;
alter table spatial.break_glass_audit add constraint "break_glass_audit_related_intent_id_fkey" FOREIGN KEY (related_intent_id) REFERENCES spatial.break_glass_audit(id) ON DELETE RESTRICT;
CREATE OR REPLACE FUNCTION spatial.append_assertion(p_graph_node_id uuid, p_relationship_scope_key text, p_scope_policy_artifact_id uuid, p_identity_payload jsonb, p_identity_canonical_text text, p_assertion_fingerprint text, p_run_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE v_id uuid; v_principal text;
BEGIN
  v_principal:=spatial.resolve_direct_wire_principal(p_run_id);
  PERFORM spatial.require_policy_family(p_scope_policy_artifact_id,'assertion_scope_key');
  PERFORM spatial.verify_jcs_claim(p_identity_payload,p_identity_canonical_text,p_assertion_fingerprint);
  PERFORM spatial.require_exact_fingerprint_payload(p_identity_payload,pg_catalog.jsonb_build_object('graph_node_id',p_graph_node_id,'assertion_kind','event_spatial_relationship','relationship_scope_key',p_relationship_scope_key,'scope_policy_artifact_id',p_scope_policy_artifact_id),'assertion');
  IF NOT EXISTS (SELECT 1 FROM public.nodes n WHERE n.id=p_graph_node_id AND n.type='event') THEN
    RAISE EXCEPTION 'Phase-1 assertion subject must be an existing Graph event node';
  END IF;
  INSERT INTO spatial.assertions(graph_node_id,assertion_kind,relationship_scope_key,scope_policy_artifact_id,created_by_principal_ref,assertion_fingerprint)
  VALUES (p_graph_node_id,'event_spatial_relationship',p_relationship_scope_key,p_scope_policy_artifact_id,v_principal,p_assertion_fingerprint)
  RETURNING id INTO v_id;
  RETURN v_id;
END
$function$
;
alter function spatial.append_assertion(p_graph_node_id uuid, p_relationship_scope_key text, p_scope_policy_artifact_id uuid, p_identity_payload jsonb, p_identity_canonical_text text, p_assertion_fingerprint text, p_run_id text) owner to spatial_owner;
revoke all on function spatial.append_assertion(p_graph_node_id uuid, p_relationship_scope_key text, p_scope_policy_artifact_id uuid, p_identity_payload jsonb, p_identity_canonical_text text, p_assertion_fingerprint text, p_run_id text) from public,anon,authenticated,service_role;
grant execute on function spatial.append_assertion(p_graph_node_id uuid, p_relationship_scope_key text, p_scope_policy_artifact_id uuid, p_identity_payload jsonb, p_identity_canonical_text text, p_assertion_fingerprint text, p_run_id text) to spatial_writer_runtime;
CREATE OR REPLACE FUNCTION spatial.append_assertion_revision(p_assertion_id uuid, p_location_role text, p_relationship_qualifier text, p_canonical_place_id uuid, p_evidence_precision text, p_internal_geometry_snapshot_id uuid, p_valid_time_precision text, p_source_native_time jsonb, p_guard_start_utc timestamp with time zone, p_guard_end_utc timestamp with time zone, p_temporal_policy_artifact_id uuid, p_uncertainty_class text, p_uncertainty_note text, p_revision_payload jsonb, p_revision_canonical_text text, p_revision_fingerprint text, p_node_payload jsonb, p_node_canonical_text text, p_node_snapshot_hash text, p_place_payload jsonb DEFAULT NULL::jsonb, p_place_canonical_text text DEFAULT NULL::text, p_place_snapshot_hash text DEFAULT NULL::text, p_run_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE v_revision_id uuid; v_principal text; v_graph_node_id uuid; v_ordinal integer; v_now timestamptz:=pg_catalog.statement_timestamp();
BEGIN
  v_principal:=spatial.resolve_direct_wire_principal(p_run_id);
  PERFORM spatial.require_policy_family(p_temporal_policy_artifact_id,'temporal_interval');
  PERFORM spatial.verify_jcs_claim(p_revision_payload,p_revision_canonical_text,p_revision_fingerprint);
  PERFORM spatial.verify_jcs_claim(p_node_payload,p_node_canonical_text,p_node_snapshot_hash);
  IF p_canonical_place_id IS NOT NULL THEN PERFORM spatial.verify_jcs_claim(p_place_payload,p_place_canonical_text,p_place_snapshot_hash); END IF;

  -- Internal spatial row lock only. Legacy authority rows are never SELECT ... FOR UPDATE/SHARE locked.
  SELECT a.graph_node_id INTO v_graph_node_id FROM spatial.assertions a WHERE a.id=p_assertion_id FOR UPDATE;
  IF v_graph_node_id IS NULL THEN RAISE EXCEPTION 'assertion not found'; END IF;
  SELECT coalesce(pg_catalog.max(r.revision_ordinal),0)+1 INTO v_ordinal FROM spatial.assertion_revisions r WHERE r.spatial_assertion_id=p_assertion_id;
  PERFORM spatial.require_exact_fingerprint_payload(p_revision_payload,pg_catalog.jsonb_build_object('spatial_assertion_id',p_assertion_id,'revision_ordinal',v_ordinal,'graph_node_snapshot_hash',p_node_snapshot_hash,'location_role',p_location_role,'relationship_qualifier',p_relationship_qualifier,'canonical_place_id',p_canonical_place_id,'place_snapshot_hash',p_place_snapshot_hash,'evidence_precision',p_evidence_precision,'internal_geometry_snapshot_id',p_internal_geometry_snapshot_id,'valid_time_precision',p_valid_time_precision,'source_native_time',p_source_native_time,'guard_start_utc',p_guard_start_utc,'guard_end_utc',p_guard_end_utc,'temporal_policy_artifact_id',p_temporal_policy_artifact_id,'uncertainty_class',p_uncertainty_class,'uncertainty_note',p_uncertainty_note),'assertion revision');

  WITH node_observed AS (
    SELECT n.id,n.updated_at,pg_catalog.jsonb_build_object(
      'id',n.id,'slug',n.slug,'label',n.label,'type',n.type,'description',n.description,'metadata',n.metadata,
      'confidence',n.confidence,'summary',n.summary,'occurred_at',n.occurred_at,'arc_id',n.arc_id,
      'arc_membership_candidate_id',n.arc_membership_candidate_id,'created_at',n.created_at,'updated_at',n.updated_at) AS payload
    FROM public.nodes n WHERE n.id=v_graph_node_id
  ), node_ins AS (
    INSERT INTO spatial.graph_node_authority_snapshots(graph_node_id,node_payload,node_updated_at,observed_at,canonicalization_version,snapshot_hash,captured_by_principal_ref,captured_at)
    SELECT id,payload,updated_at,v_now,'rfc8785-jcs-v1',p_node_snapshot_hash,v_principal,v_now FROM node_observed WHERE payload=p_node_payload
    ON CONFLICT (graph_node_id,snapshot_hash) DO NOTHING RETURNING id
  ), node_pick AS (
    SELECT id FROM node_ins
    UNION ALL SELECT g.id FROM spatial.graph_node_authority_snapshots g WHERE g.graph_node_id=v_graph_node_id AND g.snapshot_hash=p_node_snapshot_hash
    LIMIT 1
  ), place_observed AS (
    SELECT gp.id,gp.updated_at,pg_catalog.jsonb_build_object(
      'id',gp.id,'canonical_name',gp.canonical_name,'country_code',gp.country_code,'admin1_name',gp.admin1_name,
      'latitude',gp.latitude,'longitude',gp.longitude,'precision',gp.precision,'gazetteer_provider',gp.gazetteer_provider,
      'gazetteer_id',gp.gazetteer_id,'created_at',gp.created_at,'updated_at',gp.updated_at) AS payload
    FROM public.geographic_places gp WHERE gp.id=p_canonical_place_id
  ), place_ins AS (
    INSERT INTO spatial.place_authority_snapshots(canonical_place_id,place_payload,place_updated_at,observed_at,canonicalization_version,snapshot_hash,captured_by_principal_ref,captured_at)
    SELECT id,payload,updated_at,v_now,'rfc8785-jcs-v1',p_place_snapshot_hash,v_principal,v_now
    FROM place_observed WHERE p_canonical_place_id IS NOT NULL AND payload=p_place_payload
    ON CONFLICT (canonical_place_id,snapshot_hash) DO NOTHING RETURNING id
  ), place_pick AS (
    SELECT id FROM place_ins
    UNION ALL SELECT p.id FROM spatial.place_authority_snapshots p WHERE p.canonical_place_id=p_canonical_place_id AND p.snapshot_hash=p_place_snapshot_hash
    LIMIT 1
  ), new_revision AS (
    INSERT INTO spatial.assertion_revisions(spatial_assertion_id,revision_ordinal,graph_node_authority_snapshot_id,location_role,relationship_qualifier,canonical_place_id,place_authority_snapshot_id,evidence_precision,internal_geometry_snapshot_id,valid_time_precision,source_native_time,guard_start_utc,guard_end_utc,temporal_policy_artifact_id,uncertainty_class,uncertainty_note,revision_fingerprint,created_by_principal_ref)
    SELECT p_assertion_id,v_ordinal,np.id,p_location_role,p_relationship_qualifier,p_canonical_place_id,pp.id,p_evidence_precision,p_internal_geometry_snapshot_id,p_valid_time_precision,p_source_native_time,p_guard_start_utc,p_guard_end_utc,p_temporal_policy_artifact_id,p_uncertainty_class,p_uncertainty_note,p_revision_fingerprint,v_principal
    FROM node_pick np LEFT JOIN place_pick pp ON p_canonical_place_id IS NOT NULL
    WHERE p_canonical_place_id IS NULL OR pp.id IS NOT NULL
    RETURNING id
  ) SELECT id INTO v_revision_id FROM new_revision;

  IF v_revision_id IS NULL THEN RAISE EXCEPTION 'authority observed-state/payload mismatch'; END IF;
  -- B8: a place-derived geometry must bind the revision's exact historical place snapshot,
  -- not merely the same canonical place. The exception rolls back the just-created revision.
  IF p_internal_geometry_snapshot_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM spatial.geometry_snapshots g
    JOIN spatial.assertion_revisions r ON r.id=v_revision_id
    WHERE g.id=p_internal_geometry_snapshot_id AND g.canonical_place_id IS NOT NULL
      AND (r.canonical_place_id IS DISTINCT FROM g.canonical_place_id
           OR r.place_authority_snapshot_id IS DISTINCT FROM g.place_authority_snapshot_id)
  ) THEN RAISE EXCEPTION 'place-derived geometry must match revision canonical place and exact place authority snapshot'; END IF;
  IF p_internal_geometry_snapshot_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM spatial.geometry_snapshots g WHERE g.id=p_internal_geometry_snapshot_id
  ) THEN RAISE EXCEPTION 'geometry snapshot not found'; END IF;
  RETURN v_revision_id;
END
$function$
;
alter function spatial.append_assertion_revision(p_assertion_id uuid, p_location_role text, p_relationship_qualifier text, p_canonical_place_id uuid, p_evidence_precision text, p_internal_geometry_snapshot_id uuid, p_valid_time_precision text, p_source_native_time jsonb, p_guard_start_utc timestamp with time zone, p_guard_end_utc timestamp with time zone, p_temporal_policy_artifact_id uuid, p_uncertainty_class text, p_uncertainty_note text, p_revision_payload jsonb, p_revision_canonical_text text, p_revision_fingerprint text, p_node_payload jsonb, p_node_canonical_text text, p_node_snapshot_hash text, p_place_payload jsonb, p_place_canonical_text text, p_place_snapshot_hash text, p_run_id text) owner to spatial_owner;
revoke all on function spatial.append_assertion_revision(p_assertion_id uuid, p_location_role text, p_relationship_qualifier text, p_canonical_place_id uuid, p_evidence_precision text, p_internal_geometry_snapshot_id uuid, p_valid_time_precision text, p_source_native_time jsonb, p_guard_start_utc timestamp with time zone, p_guard_end_utc timestamp with time zone, p_temporal_policy_artifact_id uuid, p_uncertainty_class text, p_uncertainty_note text, p_revision_payload jsonb, p_revision_canonical_text text, p_revision_fingerprint text, p_node_payload jsonb, p_node_canonical_text text, p_node_snapshot_hash text, p_place_payload jsonb, p_place_canonical_text text, p_place_snapshot_hash text, p_run_id text) from public,anon,authenticated,service_role;
grant execute on function spatial.append_assertion_revision(p_assertion_id uuid, p_location_role text, p_relationship_qualifier text, p_canonical_place_id uuid, p_evidence_precision text, p_internal_geometry_snapshot_id uuid, p_valid_time_precision text, p_source_native_time jsonb, p_guard_start_utc timestamp with time zone, p_guard_end_utc timestamp with time zone, p_temporal_policy_artifact_id uuid, p_uncertainty_class text, p_uncertainty_note text, p_revision_payload jsonb, p_revision_canonical_text text, p_revision_fingerprint text, p_node_payload jsonb, p_node_canonical_text text, p_node_snapshot_hash text, p_place_payload jsonb, p_place_canonical_text text, p_place_snapshot_hash text, p_run_id text) to spatial_writer_runtime;
CREATE OR REPLACE FUNCTION spatial.append_audience_scope(p_audience_code text, p_audience_version text, p_canonical_capabilities jsonb, p_canonical_text text, p_content_hash text, p_effective_at timestamp with time zone, p_supersedes_audience_scope_id uuid DEFAULT NULL::uuid, p_run_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE v_id uuid; v_principal text;
BEGIN
  v_principal:=spatial.resolve_direct_wire_principal(p_run_id);
  PERFORM spatial.verify_jcs_claim(p_canonical_capabilities,p_canonical_text,p_content_hash);
  IF p_supersedes_audience_scope_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM spatial.audience_scopes a WHERE a.id=p_supersedes_audience_scope_id
      AND a.audience_code=p_audience_code AND a.effective_at<p_effective_at
  ) THEN RAISE EXCEPTION 'invalid audience predecessor'; END IF;
  INSERT INTO spatial.audience_scopes(audience_code,audience_version,canonical_capabilities,canonicalization_version,content_hash_algorithm,content_hash,effective_at,supersedes_audience_scope_id,created_by_principal_ref)
  VALUES (p_audience_code,p_audience_version,p_canonical_capabilities,'rfc8785-jcs-v1','sha256',p_content_hash,p_effective_at,p_supersedes_audience_scope_id,v_principal)
  RETURNING id INTO v_id;
  RETURN v_id;
END
$function$
;
alter function spatial.append_audience_scope(p_audience_code text, p_audience_version text, p_canonical_capabilities jsonb, p_canonical_text text, p_content_hash text, p_effective_at timestamp with time zone, p_supersedes_audience_scope_id uuid, p_run_id text) owner to spatial_owner;
revoke all on function spatial.append_audience_scope(p_audience_code text, p_audience_version text, p_canonical_capabilities jsonb, p_canonical_text text, p_content_hash text, p_effective_at timestamp with time zone, p_supersedes_audience_scope_id uuid, p_run_id text) from public,anon,authenticated,service_role;
grant execute on function spatial.append_audience_scope(p_audience_code text, p_audience_version text, p_canonical_capabilities jsonb, p_canonical_text text, p_content_hash text, p_effective_at timestamp with time zone, p_supersedes_audience_scope_id uuid, p_run_id text) to spatial_writer_runtime;
CREATE OR REPLACE FUNCTION spatial.append_evidence_condition_event(p_evidence_snapshot_id uuid, p_condition text, p_source_change_event_id uuid, p_condition_policy_artifact_id uuid, p_reason_code text, p_observed_at timestamp with time zone, p_event_payload jsonb, p_event_canonical_text text, p_event_fingerprint text, p_run_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE v_id uuid; v_principal text;
BEGIN
  v_principal:=spatial.resolve_direct_wire_principal(p_run_id);
  PERFORM spatial.require_policy_family(p_condition_policy_artifact_id,'evidence_condition_interpretation');
  PERFORM spatial.verify_jcs_claim(p_event_payload,p_event_canonical_text,p_event_fingerprint);
  PERFORM spatial.require_exact_fingerprint_payload(p_event_payload,pg_catalog.jsonb_build_object('evidence_snapshot_id',p_evidence_snapshot_id,'condition',p_condition,'source_change_event_id',p_source_change_event_id,'condition_policy_artifact_id',p_condition_policy_artifact_id,'reason_code',p_reason_code,'observed_at',p_observed_at),'evidence condition event');
  -- source_change_event_id is FK/reference-only; this function never reads public.source_change_events.
  INSERT INTO spatial.evidence_condition_events(evidence_snapshot_id,condition,source_change_event_id,condition_policy_artifact_id,reason_code,observed_by_principal_ref,observed_at,event_fingerprint)
  VALUES (p_evidence_snapshot_id,p_condition,p_source_change_event_id,p_condition_policy_artifact_id,p_reason_code,v_principal,p_observed_at,p_event_fingerprint)
  RETURNING id INTO v_id;
  RETURN v_id;
END
$function$
;
alter function spatial.append_evidence_condition_event(p_evidence_snapshot_id uuid, p_condition text, p_source_change_event_id uuid, p_condition_policy_artifact_id uuid, p_reason_code text, p_observed_at timestamp with time zone, p_event_payload jsonb, p_event_canonical_text text, p_event_fingerprint text, p_run_id text) owner to spatial_owner;
revoke all on function spatial.append_evidence_condition_event(p_evidence_snapshot_id uuid, p_condition text, p_source_change_event_id uuid, p_condition_policy_artifact_id uuid, p_reason_code text, p_observed_at timestamp with time zone, p_event_payload jsonb, p_event_canonical_text text, p_event_fingerprint text, p_run_id text) from public,anon,authenticated,service_role;
grant execute on function spatial.append_evidence_condition_event(p_evidence_snapshot_id uuid, p_condition text, p_source_change_event_id uuid, p_condition_policy_artifact_id uuid, p_reason_code text, p_observed_at timestamp with time zone, p_event_payload jsonb, p_event_canonical_text text, p_event_fingerprint text, p_run_id text) to spatial_writer_runtime;
CREATE OR REPLACE FUNCTION spatial.append_evidence_snapshot(p_registry_id uuid, p_source_field text, p_span_start integer, p_span_end integer, p_span_coordinate_system text, p_normalization_version text, p_encoding_version text, p_content_hash text, p_source_version_identifier text, p_source_acquired_at timestamp with time zone, p_capture_mode text, p_capture_policy_artifact_id uuid, p_retention_policy_artifact_id uuid, p_retention_classification text, p_access_scope text, p_immutable_capture_ref text, p_snapshot_payload jsonb, p_snapshot_canonical_text text, p_snapshot_fingerprint text, p_run_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE v_id uuid; v_type text; v_principal text;
BEGIN
  v_principal:=spatial.resolve_direct_wire_principal(p_run_id);
  PERFORM spatial.require_policy_family(p_capture_policy_artifact_id,'evidence_capture');
  PERFORM spatial.require_policy_family(p_retention_policy_artifact_id,'evidence_retention');
  PERFORM spatial.verify_jcs_claim(p_snapshot_payload,p_snapshot_canonical_text,p_snapshot_fingerprint);
  PERFORM spatial.require_exact_fingerprint_payload(p_snapshot_payload,pg_catalog.jsonb_build_object('evidence_artifact_registry_id',p_registry_id,'source_field',p_source_field,'span_start',p_span_start,'span_end',p_span_end,'span_coordinate_system',p_span_coordinate_system,'normalization_version',p_normalization_version,'encoding_version',p_encoding_version,'content_hash_algorithm','sha256','content_hash',p_content_hash,'source_version_identifier',p_source_version_identifier,'source_acquired_at',p_source_acquired_at,'capture_mode',p_capture_mode,'capture_policy_artifact_id',p_capture_policy_artifact_id,'retention_policy_artifact_id',p_retention_policy_artifact_id,'retention_classification',p_retention_classification,'access_scope',p_access_scope,'immutable_capture_ref',p_immutable_capture_ref),'evidence snapshot');
  SELECT r.artifact_type_code INTO v_type FROM spatial.evidence_artifact_registry r WHERE r.id=p_registry_id;
  IF v_type IS NULL THEN RAISE EXCEPTION 'unknown registry id'; END IF;
  IF (v_type='article' AND p_source_field NOT IN ('title','summary','body_text'))
     OR (v_type='source_record' AND p_source_field<>'headline')
     OR (v_type='policy_document' AND p_source_field NOT IN ('raw_summary','extracted_claims')) THEN
    RAISE EXCEPTION 'source_field % not allowed for artifact type %',p_source_field,v_type;
  END IF;
  IF p_capture_mode='immutable_artifact_ref' AND p_immutable_capture_ref IS NULL THEN RAISE EXCEPTION 'immutable capture mode requires durable reference'; END IF;
  INSERT INTO spatial.evidence_snapshots(evidence_artifact_registry_id,source_field,span_start,span_end,span_coordinate_system,normalization_version,encoding_version,content_hash_algorithm,content_hash,source_version_identifier,source_acquired_at,capture_mode,capture_policy_artifact_id,retention_policy_artifact_id,retention_classification,access_scope,immutable_capture_ref,snapshot_fingerprint,created_by_principal_ref)
  VALUES (p_registry_id,p_source_field,p_span_start,p_span_end,p_span_coordinate_system,p_normalization_version,p_encoding_version,'sha256',p_content_hash,p_source_version_identifier,p_source_acquired_at,p_capture_mode,p_capture_policy_artifact_id,p_retention_policy_artifact_id,p_retention_classification,p_access_scope,p_immutable_capture_ref,p_snapshot_fingerprint,v_principal)
  RETURNING id INTO v_id;
  RETURN v_id;
END
$function$
;
alter function spatial.append_evidence_snapshot(p_registry_id uuid, p_source_field text, p_span_start integer, p_span_end integer, p_span_coordinate_system text, p_normalization_version text, p_encoding_version text, p_content_hash text, p_source_version_identifier text, p_source_acquired_at timestamp with time zone, p_capture_mode text, p_capture_policy_artifact_id uuid, p_retention_policy_artifact_id uuid, p_retention_classification text, p_access_scope text, p_immutable_capture_ref text, p_snapshot_payload jsonb, p_snapshot_canonical_text text, p_snapshot_fingerprint text, p_run_id text) owner to spatial_owner;
revoke all on function spatial.append_evidence_snapshot(p_registry_id uuid, p_source_field text, p_span_start integer, p_span_end integer, p_span_coordinate_system text, p_normalization_version text, p_encoding_version text, p_content_hash text, p_source_version_identifier text, p_source_acquired_at timestamp with time zone, p_capture_mode text, p_capture_policy_artifact_id uuid, p_retention_policy_artifact_id uuid, p_retention_classification text, p_access_scope text, p_immutable_capture_ref text, p_snapshot_payload jsonb, p_snapshot_canonical_text text, p_snapshot_fingerprint text, p_run_id text) from public,anon,authenticated,service_role;
grant execute on function spatial.append_evidence_snapshot(p_registry_id uuid, p_source_field text, p_span_start integer, p_span_end integer, p_span_coordinate_system text, p_normalization_version text, p_encoding_version text, p_content_hash text, p_source_version_identifier text, p_source_acquired_at timestamp with time zone, p_capture_mode text, p_capture_policy_artifact_id uuid, p_retention_policy_artifact_id uuid, p_retention_classification text, p_access_scope text, p_immutable_capture_ref text, p_snapshot_payload jsonb, p_snapshot_canonical_text text, p_snapshot_fingerprint text, p_run_id text) to spatial_writer_runtime;
CREATE OR REPLACE FUNCTION spatial.append_geometry_snapshot(p_representation_kind text, p_canonical_geojson jsonb, p_canonical_place_id uuid, p_place_payload jsonb, p_place_canonical_text text, p_place_snapshot_hash text, p_geometry_precision text, p_geometry_source_kind text, p_geometry_source_version text, p_compatibility_policy_artifact_id uuid, p_geometry_payload jsonb, p_geometry_canonical_text text, p_geometry_hash text, p_capture_basis text, p_run_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE v_id uuid; v_principal text; v_place_snapshot_id uuid; v_now timestamptz:=pg_catalog.statement_timestamp();
BEGIN
  v_principal:=spatial.resolve_direct_wire_principal(p_run_id);
  PERFORM spatial.require_policy_family(p_compatibility_policy_artifact_id,'geometry_compatibility');
  PERFORM spatial.verify_jcs_claim(p_geometry_payload,p_geometry_canonical_text,p_geometry_hash);
  PERFORM spatial.require_exact_fingerprint_payload(p_geometry_payload,pg_catalog.jsonb_build_object('geometry_scope','internal','representation_kind',p_representation_kind,'crs','EPSG:4326','canonical_geojson',p_canonical_geojson,'canonical_place_id',p_canonical_place_id,'geometry_precision',p_geometry_precision,'geometry_source_kind',p_geometry_source_kind,'geometry_source_version',p_geometry_source_version,'compatibility_policy_artifact_id',p_compatibility_policy_artifact_id,'canonicalization_version','rfc8785-jcs-v1','capture_basis',p_capture_basis),'geometry');
  IF p_canonical_place_id IS NOT NULL THEN
    PERFORM spatial.verify_jcs_claim(p_place_payload,p_place_canonical_text,p_place_snapshot_hash);
    WITH observed AS (
      SELECT gp.id,gp.updated_at,pg_catalog.jsonb_build_object(
        'id',gp.id,'canonical_name',gp.canonical_name,'country_code',gp.country_code,'admin1_name',gp.admin1_name,
        'latitude',gp.latitude,'longitude',gp.longitude,'precision',gp.precision,'gazetteer_provider',gp.gazetteer_provider,
        'gazetteer_id',gp.gazetteer_id,'created_at',gp.created_at,'updated_at',gp.updated_at) AS payload
      FROM public.geographic_places gp WHERE gp.id=p_canonical_place_id
    ), ins AS (
      INSERT INTO spatial.place_authority_snapshots(canonical_place_id,place_payload,place_updated_at,observed_at,canonicalization_version,snapshot_hash,captured_by_principal_ref,captured_at)
      SELECT id,payload,updated_at,v_now,'rfc8785-jcs-v1',p_place_snapshot_hash,v_principal,v_now FROM observed WHERE payload=p_place_payload
      ON CONFLICT (canonical_place_id,snapshot_hash) DO NOTHING RETURNING id
    )
    SELECT id INTO v_place_snapshot_id FROM ins
    UNION ALL SELECT pas.id FROM spatial.place_authority_snapshots pas WHERE pas.canonical_place_id=p_canonical_place_id AND pas.snapshot_hash=p_place_snapshot_hash
    LIMIT 1;
    IF v_place_snapshot_id IS NULL THEN RAISE EXCEPTION 'place observed-state/payload mismatch'; END IF;
  END IF;
  INSERT INTO spatial.geometry_snapshots(geometry_scope,representation_kind,crs,canonical_geojson,canonical_place_id,place_authority_snapshot_id,geometry_precision,geometry_source_kind,geometry_source_version,compatibility_policy_artifact_id,canonicalization_version,geometry_hash,capture_basis,created_by_principal_ref)
  VALUES ('internal',p_representation_kind,'EPSG:4326',p_canonical_geojson,p_canonical_place_id,v_place_snapshot_id,p_geometry_precision,p_geometry_source_kind,p_geometry_source_version,p_compatibility_policy_artifact_id,'rfc8785-jcs-v1',p_geometry_hash,p_capture_basis,v_principal)
  RETURNING id INTO v_id;
  RETURN v_id;
END
$function$
;
alter function spatial.append_geometry_snapshot(p_representation_kind text, p_canonical_geojson jsonb, p_canonical_place_id uuid, p_place_payload jsonb, p_place_canonical_text text, p_place_snapshot_hash text, p_geometry_precision text, p_geometry_source_kind text, p_geometry_source_version text, p_compatibility_policy_artifact_id uuid, p_geometry_payload jsonb, p_geometry_canonical_text text, p_geometry_hash text, p_capture_basis text, p_run_id text) owner to spatial_owner;
revoke all on function spatial.append_geometry_snapshot(p_representation_kind text, p_canonical_geojson jsonb, p_canonical_place_id uuid, p_place_payload jsonb, p_place_canonical_text text, p_place_snapshot_hash text, p_geometry_precision text, p_geometry_source_kind text, p_geometry_source_version text, p_compatibility_policy_artifact_id uuid, p_geometry_payload jsonb, p_geometry_canonical_text text, p_geometry_hash text, p_capture_basis text, p_run_id text) from public,anon,authenticated,service_role;
grant execute on function spatial.append_geometry_snapshot(p_representation_kind text, p_canonical_geojson jsonb, p_canonical_place_id uuid, p_place_payload jsonb, p_place_canonical_text text, p_place_snapshot_hash text, p_geometry_precision text, p_geometry_source_kind text, p_geometry_source_version text, p_compatibility_policy_artifact_id uuid, p_geometry_payload jsonb, p_geometry_canonical_text text, p_geometry_hash text, p_capture_basis text, p_run_id text) to spatial_writer_runtime;
CREATE OR REPLACE FUNCTION spatial.append_policy_artifact(p_policy_family_code text, p_policy_version text, p_canonical_content jsonb, p_canonical_text text, p_content_hash text, p_effective_at timestamp with time zone, p_supersedes_policy_artifact_id uuid DEFAULT NULL::uuid, p_run_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE v_id uuid; v_principal text;
BEGIN
  v_principal:=spatial.resolve_direct_wire_principal(p_run_id);
  PERFORM spatial.verify_jcs_claim(p_canonical_content,p_canonical_text,p_content_hash);
  IF p_supersedes_policy_artifact_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM spatial.policy_artifacts p WHERE p.id=p_supersedes_policy_artifact_id
      AND p.policy_family_code=p_policy_family_code AND p.effective_at<p_effective_at
  ) THEN RAISE EXCEPTION 'invalid policy predecessor'; END IF;
  INSERT INTO spatial.policy_artifacts(policy_family_code,policy_version,canonical_content,canonicalization_version,content_hash_algorithm,content_hash,effective_at,supersedes_policy_artifact_id,created_by_principal_ref)
  VALUES (p_policy_family_code,p_policy_version,p_canonical_content,'rfc8785-jcs-v1','sha256',p_content_hash,p_effective_at,p_supersedes_policy_artifact_id,v_principal)
  RETURNING id INTO v_id;
  RETURN v_id;
END
$function$
;
alter function spatial.append_policy_artifact(p_policy_family_code text, p_policy_version text, p_canonical_content jsonb, p_canonical_text text, p_content_hash text, p_effective_at timestamp with time zone, p_supersedes_policy_artifact_id uuid, p_run_id text) owner to spatial_owner;
revoke all on function spatial.append_policy_artifact(p_policy_family_code text, p_policy_version text, p_canonical_content jsonb, p_canonical_text text, p_content_hash text, p_effective_at timestamp with time zone, p_supersedes_policy_artifact_id uuid, p_run_id text) from public,anon,authenticated,service_role;
grant execute on function spatial.append_policy_artifact(p_policy_family_code text, p_policy_version text, p_canonical_content jsonb, p_canonical_text text, p_content_hash text, p_effective_at timestamp with time zone, p_supersedes_policy_artifact_id uuid, p_run_id text) to spatial_writer_runtime;
CREATE OR REPLACE FUNCTION spatial.append_release_decision(p_revision_id uuid, p_audience_scope_id uuid, p_release_policy_artifact_id uuid, p_decision_disposition text, p_predecessor_release_decision_id uuid, p_decided_at timestamp with time zone, p_effective_at timestamp with time zone, p_reason_code text, p_decision_payload jsonb, p_decision_canonical_text text, p_decision_fingerprint text, p_run_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_id uuid; v_principal text;
  v_pred_revision uuid; v_pred_audience uuid; v_pred_policy uuid; v_pred_disposition text;
  v_pred_decided timestamptz; v_pred_effective timestamptz;
  v_lane_lock_1 integer; v_lane_lock_2 integer;
BEGIN
  v_principal:=spatial.resolve_direct_wire_principal(p_run_id);
  PERFORM spatial.require_policy_family(p_release_policy_artifact_id,'release_disclosure');
  PERFORM spatial.verify_jcs_claim(p_decision_payload,p_decision_canonical_text,p_decision_fingerprint);
  PERFORM spatial.require_exact_fingerprint_payload(p_decision_payload,pg_catalog.jsonb_build_object('assertion_revision_id',p_revision_id,'audience_scope_id',p_audience_scope_id,'release_policy_artifact_id',p_release_policy_artifact_id,'decision_disposition',p_decision_disposition,'predecessor_release_decision_id',p_predecessor_release_decision_id,'decided_at',p_decided_at,'effective_at',p_effective_at,'reason_code',p_reason_code),'release decision');
  IF NOT EXISTS (SELECT 1 FROM spatial.assertion_revisions r WHERE r.id=p_revision_id) THEN RAISE EXCEPTION 'revision not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM spatial.audience_scopes a WHERE a.id=p_audience_scope_id) THEN RAISE EXCEPTION 'audience scope not found'; END IF;
  IF p_decision_disposition IN ('released','restricted') THEN RAISE EXCEPTION 'Gate A rejects released/restricted'; END IF;

  -- B4: serialize the exact immutable release lane (revision + audience) before inspecting
  -- predecessor/cardinality/chain state. Advisory-key collision can only over-serialize;
  -- it cannot weaken integrity.
  v_lane_lock_1:=pg_catalog.hashtext(p_revision_id::text);
  v_lane_lock_2:=pg_catalog.hashtext(p_audience_scope_id::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(v_lane_lock_1,v_lane_lock_2);

  IF p_decision_disposition='revoked' THEN
    IF p_predecessor_release_decision_id IS NULL THEN RAISE EXCEPTION 'revoked requires predecessor'; END IF;

    SELECT r.assertion_revision_id,r.audience_scope_id,r.release_policy_artifact_id,r.decision_disposition,r.decided_at,r.effective_at
      INTO v_pred_revision,v_pred_audience,v_pred_policy,v_pred_disposition,v_pred_decided,v_pred_effective
    FROM spatial.release_decisions r WHERE r.id=p_predecessor_release_decision_id;

    IF v_pred_revision IS NULL OR v_pred_revision<>p_revision_id OR v_pred_audience<>p_audience_scope_id
       OR v_pred_decided>=p_decided_at OR v_pred_effective>=p_effective_at THEN
      RAISE EXCEPTION 'invalid release predecessor lane/chronology';
    END IF;

    -- Gate-A fail-closed policy validity: the predecessor must be governed by the exact same
    -- immutable release-policy artifact. Cross-policy predecessor semantics are intentionally
    -- unsupported in this first slice and require a separately authorized future expansion.
    IF v_pred_policy<>p_release_policy_artifact_id THEN
      RAISE EXCEPTION 'release predecessor is not valid under the exact bound release policy';
    END IF;
    IF v_pred_disposition NOT IN ('withheld','revoked') THEN
      RAISE EXCEPTION 'release predecessor disposition is not valid in Gate A';
    END IF;

    -- One direct successor per decision. The matching unique index is the final race-safe guard.
    IF EXISTS (SELECT 1 FROM spatial.release_decisions r WHERE r.predecessor_release_decision_id=p_predecessor_release_decision_id) THEN
      RAISE EXCEPTION 'release predecessor already has a direct successor';
    END IF;

    -- Traverse predecessor history with an explicit visited path. Reject cycles AND any
    -- pre-existing chain segment that leaves the exact revision/audience/policy lane or violates
    -- strict backward chronology. This makes the complete predecessor history policy/lane-valid,
    -- not merely the direct predecessor. New IDs are generated internally, so caller self-reference
    -- is impossible; corrupted historical self/cycles are still detected here.
    IF EXISTS (
      WITH RECURSIVE chain(id,predecessor_id,revision_id,audience_id,policy_id,decided_at,effective_at,path,cycle,invalid) AS (
        SELECT r.id,r.predecessor_release_decision_id,r.assertion_revision_id,r.audience_scope_id,
               r.release_policy_artifact_id,r.decided_at,r.effective_at,ARRAY[r.id]::uuid[],false,
               (r.assertion_revision_id<>p_revision_id OR r.audience_scope_id<>p_audience_scope_id
                OR r.release_policy_artifact_id<>p_release_policy_artifact_id)
        FROM spatial.release_decisions r WHERE r.id=p_predecessor_release_decision_id
        UNION ALL
        SELECT p.id,p.predecessor_release_decision_id,p.assertion_revision_id,p.audience_scope_id,
               p.release_policy_artifact_id,p.decided_at,p.effective_at,c.path||p.id,(p.id=ANY(c.path)),
               (p.assertion_revision_id<>p_revision_id OR p.audience_scope_id<>p_audience_scope_id
                OR p.release_policy_artifact_id<>p_release_policy_artifact_id
                OR p.decided_at>=c.decided_at OR p.effective_at>=c.effective_at)
        FROM spatial.release_decisions p
        JOIN chain c ON p.id=c.predecessor_id
        WHERE NOT c.cycle AND NOT c.invalid
      ) SELECT 1 FROM chain WHERE cycle OR invalid
    ) THEN RAISE EXCEPTION 'release predecessor history is cyclic or invalid for the exact policy/lane/chronology'; END IF;
  ELSE
    IF p_predecessor_release_decision_id IS NOT NULL THEN RAISE EXCEPTION 'withheld is an originating Gate-A decision'; END IF;
    -- One linear history per exact lane: there may be only one origin.
    IF EXISTS (SELECT 1 FROM spatial.release_decisions r WHERE r.assertion_revision_id=p_revision_id AND r.audience_scope_id=p_audience_scope_id) THEN
      RAISE EXCEPTION 'release lane already has an origin; append must extend its current tail';
    END IF;
  END IF;

  INSERT INTO spatial.release_decisions(assertion_revision_id,audience_scope_id,release_policy_artifact_id,decision_disposition,predecessor_release_decision_id,decided_by_principal_ref,decided_at,effective_at,reason_code,decision_fingerprint)
  VALUES (p_revision_id,p_audience_scope_id,p_release_policy_artifact_id,p_decision_disposition,p_predecessor_release_decision_id,v_principal,p_decided_at,p_effective_at,p_reason_code,p_decision_fingerprint)
  RETURNING id INTO v_id;
  RETURN v_id;
END
$function$
;
alter function spatial.append_release_decision(p_revision_id uuid, p_audience_scope_id uuid, p_release_policy_artifact_id uuid, p_decision_disposition text, p_predecessor_release_decision_id uuid, p_decided_at timestamp with time zone, p_effective_at timestamp with time zone, p_reason_code text, p_decision_payload jsonb, p_decision_canonical_text text, p_decision_fingerprint text, p_run_id text) owner to spatial_owner;
revoke all on function spatial.append_release_decision(p_revision_id uuid, p_audience_scope_id uuid, p_release_policy_artifact_id uuid, p_decision_disposition text, p_predecessor_release_decision_id uuid, p_decided_at timestamp with time zone, p_effective_at timestamp with time zone, p_reason_code text, p_decision_payload jsonb, p_decision_canonical_text text, p_decision_fingerprint text, p_run_id text) from public,anon,authenticated,service_role;
grant execute on function spatial.append_release_decision(p_revision_id uuid, p_audience_scope_id uuid, p_release_policy_artifact_id uuid, p_decision_disposition text, p_predecessor_release_decision_id uuid, p_decided_at timestamp with time zone, p_effective_at timestamp with time zone, p_reason_code text, p_decision_payload jsonb, p_decision_canonical_text text, p_decision_fingerprint text, p_run_id text) to spatial_writer_runtime;
CREATE OR REPLACE FUNCTION spatial.append_review_decision(p_revision_id uuid, p_support_disposition text, p_review_mode text, p_review_outcome_basis jsonb, p_review_policy_artifact_id uuid, p_effective_at timestamp with time zone, p_reason_code text, p_decision_payload jsonb, p_decision_canonical_text text, p_decision_fingerprint text, p_run_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_id uuid; v_principal text; v_assertion_id uuid; v_start timestamptz; v_end timestamptz; v_precision text;
  v_primary_count integer; v_bad_primary integer; v_contradictory integer;
BEGIN
  v_principal:=spatial.resolve_direct_wire_principal(p_run_id);
  PERFORM spatial.require_policy_family(p_review_policy_artifact_id,'review_authorization');
  PERFORM spatial.verify_jcs_claim(p_decision_payload,p_decision_canonical_text,p_decision_fingerprint);
  PERFORM spatial.require_exact_fingerprint_payload(p_decision_payload,pg_catalog.jsonb_build_object('assertion_revision_id',p_revision_id,'support_disposition',p_support_disposition,'review_mode',p_review_mode,'review_outcome_basis',p_review_outcome_basis,'review_policy_artifact_id',p_review_policy_artifact_id,'effective_at',p_effective_at,'reason_code',p_reason_code),'review decision');

  IF p_review_mode IN ('manual','assisted') THEN RAISE EXCEPTION 'human review principal propagation is not activated in Gate A'; END IF;
  IF p_support_disposition='operative' AND p_review_mode='automated_proposal' THEN RAISE EXCEPTION 'automated_proposal cannot produce operative state'; END IF;

  SELECT r.spatial_assertion_id,r.guard_start_utc,r.guard_end_utc,r.valid_time_precision
    INTO v_assertion_id,v_start,v_end,v_precision FROM spatial.assertion_revisions r WHERE r.id=p_revision_id;
  IF v_assertion_id IS NULL THEN RAISE EXCEPTION 'revision not found'; END IF;

  -- Serialize overlap checks on the internal spatial assertion envelope.
  PERFORM 1 FROM spatial.assertions a WHERE a.id=v_assertion_id FOR UPDATE;

  IF p_support_disposition='operative' THEN
    IF v_precision='unknown' OR v_start IS NULL OR v_end IS NULL OR v_start>=v_end THEN RAISE EXCEPTION 'operative revision requires finite valid-time guard'; END IF;

    SELECT pg_catalog.count(*) FILTER (WHERE re.evidence_role='primary_support'),
           pg_catalog.count(*) FILTER (
             WHERE re.evidence_role='primary_support'
               AND (es.immutable_capture_ref IS NULL OR coalesce(latest.condition,'active') IN ('unavailable','contradicted'))
           ),
           pg_catalog.count(*) FILTER (WHERE re.evidence_role='contradictory')
    INTO v_primary_count,v_bad_primary,v_contradictory
    FROM spatial.revision_evidence re
    JOIN spatial.evidence_snapshots es ON es.id=re.evidence_snapshot_id
    LEFT JOIN LATERAL (
      SELECT ece.condition FROM spatial.evidence_condition_events ece
      WHERE ece.evidence_snapshot_id=es.id ORDER BY ece.observed_at DESC LIMIT 1
    ) latest ON true
    WHERE re.assertion_revision_id=p_revision_id;

    IF v_primary_count=0 THEN RAISE EXCEPTION 'operative review requires primary_support'; END IF;
    IF v_bad_primary>0 THEN RAISE EXCEPTION 'primary_support must have durable reproducible capture and usable current condition'; END IF;
    IF v_contradictory>0 AND NOT (p_review_outcome_basis ? 'contradictory_evidence_assessment') THEN RAISE EXCEPTION 'contradictory evidence requires explicit assessment'; END IF;

    IF EXISTS (
      SELECT 1 FROM spatial.assertion_revisions sibling
      JOIN LATERAL (
        SELECT rd.support_disposition FROM spatial.review_decisions rd
        WHERE rd.assertion_revision_id=sibling.id AND rd.effective_at<=p_effective_at
        ORDER BY rd.effective_at DESC,rd.created_at DESC LIMIT 1
      ) latest_review ON true
      WHERE sibling.spatial_assertion_id=v_assertion_id AND sibling.id<>p_revision_id
        AND latest_review.support_disposition='operative'
        AND sibling.guard_start_utc IS NOT NULL AND sibling.guard_end_utc IS NOT NULL
        AND sibling.guard_start_utc<v_end AND v_start<sibling.guard_end_utc
    ) THEN RAISE EXCEPTION 'overlapping operative sibling revision exists'; END IF;
  END IF;

  INSERT INTO spatial.review_decisions(assertion_revision_id,support_disposition,review_mode,review_outcome_basis,review_policy_artifact_id,reviewed_by_principal_ref,effective_at,reason_code,decision_fingerprint)
  VALUES (p_revision_id,p_support_disposition,p_review_mode,p_review_outcome_basis,p_review_policy_artifact_id,v_principal,p_effective_at,p_reason_code,p_decision_fingerprint)
  RETURNING id INTO v_id;
  RETURN v_id;
END
$function$
;
alter function spatial.append_review_decision(p_revision_id uuid, p_support_disposition text, p_review_mode text, p_review_outcome_basis jsonb, p_review_policy_artifact_id uuid, p_effective_at timestamp with time zone, p_reason_code text, p_decision_payload jsonb, p_decision_canonical_text text, p_decision_fingerprint text, p_run_id text) owner to spatial_owner;
revoke all on function spatial.append_review_decision(p_revision_id uuid, p_support_disposition text, p_review_mode text, p_review_outcome_basis jsonb, p_review_policy_artifact_id uuid, p_effective_at timestamp with time zone, p_reason_code text, p_decision_payload jsonb, p_decision_canonical_text text, p_decision_fingerprint text, p_run_id text) from public,anon,authenticated,service_role;
grant execute on function spatial.append_review_decision(p_revision_id uuid, p_support_disposition text, p_review_mode text, p_review_outcome_basis jsonb, p_review_policy_artifact_id uuid, p_effective_at timestamp with time zone, p_reason_code text, p_decision_payload jsonb, p_decision_canonical_text text, p_decision_fingerprint text, p_run_id text) to spatial_writer_runtime;
CREATE OR REPLACE FUNCTION spatial.append_revision_evidence(p_revision_id uuid, p_evidence_snapshot_id uuid, p_evidence_role text, p_linkage_payload jsonb, p_linkage_canonical_text text, p_linkage_fingerprint text, p_run_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE v_id uuid; v_principal text; v_assertion_node uuid; v_type text; v_source_node uuid;
BEGIN
  v_principal:=spatial.resolve_direct_wire_principal(p_run_id);
  PERFORM spatial.verify_jcs_claim(p_linkage_payload,p_linkage_canonical_text,p_linkage_fingerprint);
  PERFORM spatial.require_exact_fingerprint_payload(p_linkage_payload,pg_catalog.jsonb_build_object('assertion_revision_id',p_revision_id,'evidence_snapshot_id',p_evidence_snapshot_id,'evidence_role',p_evidence_role),'revision evidence');
  SELECT a.graph_node_id INTO v_assertion_node FROM spatial.assertion_revisions r JOIN spatial.assertions a ON a.id=r.spatial_assertion_id WHERE r.id=p_revision_id;
  SELECT reg.artifact_type_code,reg.source_node_id INTO v_type,v_source_node
  FROM spatial.evidence_snapshots es JOIN spatial.evidence_artifact_registry reg ON reg.id=es.evidence_artifact_registry_id WHERE es.id=p_evidence_snapshot_id;
  IF v_assertion_node IS NULL OR v_type IS NULL THEN RAISE EXCEPTION 'unknown revision or evidence snapshot'; END IF;
  IF v_type='source_record' AND v_source_node<>v_assertion_node AND p_evidence_role<>'context_only' THEN RAISE EXCEPTION 'cross-node source_record may only be context_only in Gate A'; END IF;
  INSERT INTO spatial.revision_evidence(assertion_revision_id,evidence_snapshot_id,evidence_role,linkage_fingerprint)
  VALUES (p_revision_id,p_evidence_snapshot_id,p_evidence_role,p_linkage_fingerprint) RETURNING id INTO v_id;
  RETURN v_id;
END
$function$
;
alter function spatial.append_revision_evidence(p_revision_id uuid, p_evidence_snapshot_id uuid, p_evidence_role text, p_linkage_payload jsonb, p_linkage_canonical_text text, p_linkage_fingerprint text, p_run_id text) owner to spatial_owner;
revoke all on function spatial.append_revision_evidence(p_revision_id uuid, p_evidence_snapshot_id uuid, p_evidence_role text, p_linkage_payload jsonb, p_linkage_canonical_text text, p_linkage_fingerprint text, p_run_id text) from public,anon,authenticated,service_role;
grant execute on function spatial.append_revision_evidence(p_revision_id uuid, p_evidence_snapshot_id uuid, p_evidence_role text, p_linkage_payload jsonb, p_linkage_canonical_text text, p_linkage_fingerprint text, p_run_id text) to spatial_writer_runtime;
CREATE OR REPLACE FUNCTION spatial.append_revision_lineage(p_from_revision_id uuid, p_to_revision_id uuid, p_relationship_type text, p_lineage_payload jsonb, p_lineage_canonical_text text, p_lineage_fingerprint text, p_run_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE v_id uuid; v_principal text; v_from_assertion uuid; v_to_assertion uuid; v_from_ordinal integer; v_to_ordinal integer;
BEGIN
  v_principal:=spatial.resolve_direct_wire_principal(p_run_id);
  PERFORM spatial.verify_jcs_claim(p_lineage_payload,p_lineage_canonical_text,p_lineage_fingerprint);
  PERFORM spatial.require_exact_fingerprint_payload(p_lineage_payload,pg_catalog.jsonb_build_object('from_revision_id',p_from_revision_id,'to_revision_id',p_to_revision_id,'relationship_type',p_relationship_type),'revision lineage');

  SELECT spatial_assertion_id,revision_ordinal INTO v_from_assertion,v_from_ordinal
  FROM spatial.assertion_revisions WHERE id=p_from_revision_id;
  SELECT spatial_assertion_id,revision_ordinal INTO v_to_assertion,v_to_ordinal
  FROM spatial.assertion_revisions WHERE id=p_to_revision_id;
  IF v_from_assertion IS NULL OR v_to_assertion IS NULL OR v_from_assertion<>v_to_assertion THEN
    RAISE EXCEPTION 'lineage must remain within one assertion';
  END IF;

  -- B3: serialize every lineage append for the common assertion envelope BEFORE any
  -- chronology/direct-predecessor/conflict/cycle check. Competing transactions therefore
  -- cannot both validate against the same pre-insert lineage state.
  PERFORM 1 FROM spatial.assertions a WHERE a.id=v_from_assertion FOR UPDATE;

  -- Re-read immutable revision facts after the serialization point so every integrity check
  -- is evaluated from the serialized transaction state.
  SELECT spatial_assertion_id,revision_ordinal INTO v_from_assertion,v_from_ordinal
  FROM spatial.assertion_revisions WHERE id=p_from_revision_id;
  SELECT spatial_assertion_id,revision_ordinal INTO v_to_assertion,v_to_ordinal
  FROM spatial.assertion_revisions WHERE id=p_to_revision_id;
  IF v_from_assertion IS NULL OR v_to_assertion IS NULL OR v_from_assertion<>v_to_assertion THEN
    RAISE EXCEPTION 'lineage must remain within one assertion';
  END IF;
  -- B10: lineage is newer -> earlier (N+1 -> N). revision_ordinal is the serialized,
  -- monotonic ordering authority; created_at is intentionally not used because multiple
  -- revisions created in one transaction share transaction_timestamp().
  IF v_from_ordinal<=v_to_ordinal THEN RAISE EXCEPTION 'from_revision must have a greater revision_ordinal than to_revision'; END IF;

  IF p_relationship_type IN ('corrects','supersedes') AND EXISTS (
    SELECT 1 FROM spatial.revision_lineage rl
    WHERE rl.to_revision_id=p_to_revision_id AND rl.relationship_type IN ('corrects','supersedes')
  ) THEN
    RAISE EXCEPTION 'direct corrects/supersedes predecessor already exists';
  END IF;

  IF EXISTS (
    SELECT 1 FROM spatial.revision_lineage rl
    WHERE (rl.from_revision_id=p_from_revision_id AND rl.to_revision_id=p_to_revision_id)
       OR (rl.from_revision_id=p_to_revision_id AND rl.to_revision_id=p_from_revision_id)
  ) THEN
    RAISE EXCEPTION 'duplicate or reciprocal lineage pair rejected';
  END IF;

  IF EXISTS (
    WITH RECURSIVE walk(id) AS (
      SELECT p_to_revision_id
      UNION
      SELECT rl.to_revision_id FROM spatial.revision_lineage rl JOIN walk w ON rl.from_revision_id=w.id
    ) SELECT 1 FROM walk WHERE id=p_from_revision_id
  ) THEN RAISE EXCEPTION 'lineage cycle detected'; END IF;

  INSERT INTO spatial.revision_lineage(from_revision_id,to_revision_id,relationship_type,lineage_fingerprint,created_by_principal_ref)
  VALUES (p_from_revision_id,p_to_revision_id,p_relationship_type,p_lineage_fingerprint,v_principal) RETURNING id INTO v_id;
  RETURN v_id;
END
$function$
;
alter function spatial.append_revision_lineage(p_from_revision_id uuid, p_to_revision_id uuid, p_relationship_type text, p_lineage_payload jsonb, p_lineage_canonical_text text, p_lineage_fingerprint text, p_run_id text) owner to spatial_owner;
revoke all on function spatial.append_revision_lineage(p_from_revision_id uuid, p_to_revision_id uuid, p_relationship_type text, p_lineage_payload jsonb, p_lineage_canonical_text text, p_lineage_fingerprint text, p_run_id text) from public,anon,authenticated,service_role;
grant execute on function spatial.append_revision_lineage(p_from_revision_id uuid, p_to_revision_id uuid, p_relationship_type text, p_lineage_payload jsonb, p_lineage_canonical_text text, p_lineage_fingerprint text, p_run_id text) to spatial_writer_runtime;
CREATE OR REPLACE FUNCTION spatial.register_evidence_artifact(p_artifact_type_code text, p_native_id uuid, p_stable_artifact_key text, p_validation_policy_artifact_id uuid, p_registry_payload jsonb, p_registry_canonical_text text, p_registry_fingerprint text, p_source_node_payload jsonb DEFAULT NULL::jsonb, p_source_node_canonical_text text DEFAULT NULL::text, p_source_node_snapshot_hash text DEFAULT NULL::text, p_source_graph_payload jsonb DEFAULT NULL::jsonb, p_source_graph_canonical_text text DEFAULT NULL::text, p_source_graph_association_fingerprint text DEFAULT NULL::text, p_run_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE v_id uuid; v_principal text; v_node_id uuid; v_node_snapshot_id uuid; v_now timestamptz:=pg_catalog.statement_timestamp();
BEGIN
  v_principal:=spatial.resolve_direct_wire_principal(p_run_id);
  PERFORM spatial.require_policy_family(p_validation_policy_artifact_id,'evidence_artifact_validation');
  PERFORM spatial.verify_jcs_claim(p_registry_payload,p_registry_canonical_text,p_registry_fingerprint);

  IF p_artifact_type_code='article' THEN
    IF p_stable_artifact_key<>'article:'||p_native_id::text OR NOT EXISTS (SELECT 1 FROM public.articles a WHERE a.id=p_native_id) THEN RAISE EXCEPTION 'invalid article artifact'; END IF;
    PERFORM spatial.require_exact_fingerprint_payload(p_registry_payload,pg_catalog.jsonb_build_object('artifact_type_code','article','native_id',p_native_id,'stable_artifact_key',p_stable_artifact_key,'validation_policy_artifact_id',p_validation_policy_artifact_id),'evidence registry');
    INSERT INTO spatial.evidence_artifact_registry(artifact_type_code,article_id,stable_artifact_key,validation_policy_artifact_id,validated_by_principal_ref,validated_at,registry_fingerprint)
    VALUES ('article',p_native_id,p_stable_artifact_key,p_validation_policy_artifact_id,v_principal,v_now,p_registry_fingerprint) RETURNING id INTO v_id;

  ELSIF p_artifact_type_code='policy_document' THEN
    IF p_stable_artifact_key<>'policy_document:'||p_native_id::text OR NOT EXISTS (SELECT 1 FROM public.policy_documents p WHERE p.id=p_native_id) THEN RAISE EXCEPTION 'invalid policy_document artifact'; END IF;
    PERFORM spatial.require_exact_fingerprint_payload(p_registry_payload,pg_catalog.jsonb_build_object('artifact_type_code','policy_document','native_id',p_native_id,'stable_artifact_key',p_stable_artifact_key,'validation_policy_artifact_id',p_validation_policy_artifact_id),'evidence registry');
    INSERT INTO spatial.evidence_artifact_registry(artifact_type_code,policy_document_id,stable_artifact_key,validation_policy_artifact_id,validated_by_principal_ref,validated_at,registry_fingerprint)
    VALUES ('policy_document',p_native_id,p_stable_artifact_key,p_validation_policy_artifact_id,v_principal,v_now,p_registry_fingerprint) RETURNING id INTO v_id;

  ELSIF p_artifact_type_code='source_record' THEN
    IF p_stable_artifact_key<>'source_record:'||p_native_id::text THEN RAISE EXCEPTION 'invalid source stable key'; END IF;
    SELECT s.node_id INTO v_node_id FROM public.sources s WHERE s.id=p_native_id;
    IF v_node_id IS NULL THEN RAISE EXCEPTION 'source_record does not exist'; END IF;
    PERFORM spatial.verify_jcs_claim(p_source_node_payload,p_source_node_canonical_text,p_source_node_snapshot_hash);
    PERFORM spatial.verify_jcs_claim(p_source_graph_payload,p_source_graph_canonical_text,p_source_graph_association_fingerprint);
    PERFORM spatial.require_exact_fingerprint_payload(p_source_graph_payload,pg_catalog.jsonb_build_object('source_record_id',p_native_id,'source_node_id',v_node_id,'source_node_snapshot_hash',p_source_node_snapshot_hash),'source graph association');

    WITH observed AS (
      SELECT n.id,n.updated_at,pg_catalog.jsonb_build_object(
        'id',n.id,'slug',n.slug,'label',n.label,'type',n.type,'description',n.description,'metadata',n.metadata,
        'confidence',n.confidence,'summary',n.summary,'occurred_at',n.occurred_at,'arc_id',n.arc_id,
        'arc_membership_candidate_id',n.arc_membership_candidate_id,'created_at',n.created_at,'updated_at',n.updated_at) AS payload
      FROM public.nodes n WHERE n.id=v_node_id
    ), ins AS (
      INSERT INTO spatial.graph_node_authority_snapshots(graph_node_id,node_payload,node_updated_at,observed_at,canonicalization_version,snapshot_hash,captured_by_principal_ref,captured_at)
      SELECT id,payload,updated_at,v_now,'rfc8785-jcs-v1',p_source_node_snapshot_hash,v_principal,v_now FROM observed WHERE payload=p_source_node_payload
      ON CONFLICT (graph_node_id,snapshot_hash) DO NOTHING RETURNING id
    )
    SELECT id INTO v_node_snapshot_id FROM ins
    UNION ALL SELECT g.id FROM spatial.graph_node_authority_snapshots g WHERE g.graph_node_id=v_node_id AND g.snapshot_hash=p_source_node_snapshot_hash
    LIMIT 1;
    IF v_node_snapshot_id IS NULL THEN RAISE EXCEPTION 'source node observed-state/payload mismatch'; END IF;

    PERFORM spatial.require_exact_fingerprint_payload(p_registry_payload,pg_catalog.jsonb_build_object('artifact_type_code','source_record','native_id',p_native_id,'source_node_id',v_node_id,'source_node_snapshot_hash',p_source_node_snapshot_hash,'source_graph_association_fingerprint',p_source_graph_association_fingerprint,'stable_artifact_key',p_stable_artifact_key,'validation_policy_artifact_id',p_validation_policy_artifact_id),'evidence registry');

    INSERT INTO spatial.evidence_artifact_registry(artifact_type_code,source_record_id,source_node_id,source_node_authority_snapshot_id,source_graph_association_fingerprint,stable_artifact_key,validation_policy_artifact_id,validated_by_principal_ref,validated_at,registry_fingerprint)
    VALUES ('source_record',p_native_id,v_node_id,v_node_snapshot_id,p_source_graph_association_fingerprint,p_stable_artifact_key,p_validation_policy_artifact_id,v_principal,v_now,p_registry_fingerprint)
    RETURNING id INTO v_id;
  ELSE
    RAISE EXCEPTION 'unsupported artifact type';
  END IF;
  RETURN v_id;
END
$function$
;
alter function spatial.register_evidence_artifact(p_artifact_type_code text, p_native_id uuid, p_stable_artifact_key text, p_validation_policy_artifact_id uuid, p_registry_payload jsonb, p_registry_canonical_text text, p_registry_fingerprint text, p_source_node_payload jsonb, p_source_node_canonical_text text, p_source_node_snapshot_hash text, p_source_graph_payload jsonb, p_source_graph_canonical_text text, p_source_graph_association_fingerprint text, p_run_id text) owner to spatial_owner;
revoke all on function spatial.register_evidence_artifact(p_artifact_type_code text, p_native_id uuid, p_stable_artifact_key text, p_validation_policy_artifact_id uuid, p_registry_payload jsonb, p_registry_canonical_text text, p_registry_fingerprint text, p_source_node_payload jsonb, p_source_node_canonical_text text, p_source_node_snapshot_hash text, p_source_graph_payload jsonb, p_source_graph_canonical_text text, p_source_graph_association_fingerprint text, p_run_id text) from public,anon,authenticated,service_role;
grant execute on function spatial.register_evidence_artifact(p_artifact_type_code text, p_native_id uuid, p_stable_artifact_key text, p_validation_policy_artifact_id uuid, p_registry_payload jsonb, p_registry_canonical_text text, p_registry_fingerprint text, p_source_node_payload jsonb, p_source_node_canonical_text text, p_source_node_snapshot_hash text, p_source_graph_payload jsonb, p_source_graph_canonical_text text, p_source_graph_association_fingerprint text, p_run_id text) to spatial_writer_runtime;
CREATE OR REPLACE FUNCTION spatial.reject_historical_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  RAISE EXCEPTION 'spatial history is append-only: % on %.% is forbidden', TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE='55000';
END
$function$
;
alter function spatial.reject_historical_mutation() owner to spatial_owner;
revoke all on function spatial.reject_historical_mutation() from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION spatial.require_exact_fingerprint_payload(p_claimed jsonb, p_server jsonb, p_label text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  IF p_claimed IS DISTINCT FROM p_server THEN
    RAISE EXCEPTION '% fingerprint payload does not equal server-constructed governed fields',p_label;
  END IF;
END
$function$
;
alter function spatial.require_exact_fingerprint_payload(p_claimed jsonb, p_server jsonb, p_label text) owner to spatial_owner;
revoke all on function spatial.require_exact_fingerprint_payload(p_claimed jsonb, p_server jsonb, p_label text) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION spatial.require_policy_family(p_policy_id uuid, p_family text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM spatial.policy_artifacts pa WHERE pa.id=p_policy_id AND pa.policy_family_code=p_family) THEN
    RAISE EXCEPTION 'policy % is not family %',p_policy_id,p_family;
  END IF;
END
$function$
;
alter function spatial.require_policy_family(p_policy_id uuid, p_family text) owner to spatial_owner;
revoke all on function spatial.require_policy_family(p_policy_id uuid, p_family text) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION spatial.resolve_direct_wire_principal(p_run_id text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE v_session name := session_user;
BEGIN
  IF v_session::text<>'spatial_writer_runtime' THEN
    RAISE EXCEPTION 'unallowlisted direct-wire session_user: %',v_session USING ERRCODE='42501';
  END IF;
  IF p_run_id IS NULL OR pg_catalog.btrim(p_run_id)='' THEN RETURN 'db_role:spatial_writer_runtime'; END IF;
  RETURN 'db_role:spatial_writer_runtime;run:'||p_run_id;
END
$function$
;
alter function spatial.resolve_direct_wire_principal(p_run_id text) owner to spatial_owner;
revoke all on function spatial.resolve_direct_wire_principal(p_run_id text) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION spatial.verify_jcs_claim(p_payload jsonb, p_canonical_text text, p_claimed_hash text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE v_parsed jsonb; v_actual_hash text;
BEGIN
  IF p_payload IS NULL OR p_canonical_text IS NULL OR p_claimed_hash IS NULL THEN
    RAISE EXCEPTION 'payload, canonical text, and claimed hash are required';
  END IF;
  BEGIN
    v_parsed := p_canonical_text::jsonb;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'canonical text is not valid JSON';
  END;
  IF v_parsed IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'JCS semantic payload mismatch'; END IF;
  v_actual_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(p_canonical_text,'UTF8'),'sha256'),'hex');
  IF v_actual_hash<>p_claimed_hash OR p_claimed_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'JCS SHA-256 mismatch'; END IF;
END
$function$
;
alter function spatial.verify_jcs_claim(p_payload jsonb, p_canonical_text text, p_claimed_hash text) owner to spatial_owner;
revoke all on function spatial.verify_jcs_claim(p_payload jsonb, p_canonical_text text, p_claimed_hash text) from public,anon,authenticated,service_role;
CREATE TRIGGER no_mutation_policy_artifacts BEFORE DELETE OR UPDATE ON spatial.policy_artifacts FOR EACH ROW EXECUTE FUNCTION spatial.reject_historical_mutation();
CREATE TRIGGER no_mutation_audience_scopes BEFORE DELETE OR UPDATE ON spatial.audience_scopes FOR EACH ROW EXECUTE FUNCTION spatial.reject_historical_mutation();
CREATE TRIGGER no_mutation_assertions BEFORE DELETE OR UPDATE ON spatial.assertions FOR EACH ROW EXECUTE FUNCTION spatial.reject_historical_mutation();
CREATE TRIGGER no_mutation_graph_snapshots BEFORE DELETE OR UPDATE ON spatial.graph_node_authority_snapshots FOR EACH ROW EXECUTE FUNCTION spatial.reject_historical_mutation();
CREATE TRIGGER no_mutation_place_snapshots BEFORE DELETE OR UPDATE ON spatial.place_authority_snapshots FOR EACH ROW EXECUTE FUNCTION spatial.reject_historical_mutation();
CREATE TRIGGER no_mutation_geometry_snapshots BEFORE DELETE OR UPDATE ON spatial.geometry_snapshots FOR EACH ROW EXECUTE FUNCTION spatial.reject_historical_mutation();
CREATE TRIGGER no_mutation_assertion_revisions BEFORE DELETE OR UPDATE ON spatial.assertion_revisions FOR EACH ROW EXECUTE FUNCTION spatial.reject_historical_mutation();
CREATE TRIGGER no_mutation_revision_lineage BEFORE DELETE OR UPDATE ON spatial.revision_lineage FOR EACH ROW EXECUTE FUNCTION spatial.reject_historical_mutation();
CREATE TRIGGER no_mutation_evidence_registry BEFORE DELETE OR UPDATE ON spatial.evidence_artifact_registry FOR EACH ROW EXECUTE FUNCTION spatial.reject_historical_mutation();
CREATE TRIGGER no_mutation_evidence_snapshots BEFORE DELETE OR UPDATE ON spatial.evidence_snapshots FOR EACH ROW EXECUTE FUNCTION spatial.reject_historical_mutation();
CREATE TRIGGER no_mutation_revision_evidence BEFORE DELETE OR UPDATE ON spatial.revision_evidence FOR EACH ROW EXECUTE FUNCTION spatial.reject_historical_mutation();
CREATE TRIGGER no_mutation_evidence_conditions BEFORE DELETE OR UPDATE ON spatial.evidence_condition_events FOR EACH ROW EXECUTE FUNCTION spatial.reject_historical_mutation();
CREATE TRIGGER no_mutation_review_decisions BEFORE DELETE OR UPDATE ON spatial.review_decisions FOR EACH ROW EXECUTE FUNCTION spatial.reject_historical_mutation();
CREATE TRIGGER no_mutation_release_decisions BEFORE DELETE OR UPDATE ON spatial.release_decisions FOR EACH ROW EXECUTE FUNCTION spatial.reject_historical_mutation();
CREATE TRIGGER no_mutation_break_glass BEFORE DELETE OR UPDATE ON spatial.break_glass_audit FOR EACH ROW EXECUTE FUNCTION spatial.reject_historical_mutation();
alter table arc_membership_candidates enable row level security;
revoke all on arc_membership_candidates from public,anon,authenticated,service_role,spatial_writer_runtime;
alter table articles enable row level security;
revoke all on articles from public,anon,authenticated,service_role,spatial_writer_runtime;
alter table authors enable row level security;
revoke all on authors from public,anon,authenticated,service_role,spatial_writer_runtime;
alter table geographic_places enable row level security;
revoke all on geographic_places from public,anon,authenticated,service_role,spatial_writer_runtime;
alter table nodes enable row level security;
revoke all on nodes from public,anon,authenticated,service_role,spatial_writer_runtime;
alter table outlets enable row level security;
revoke all on outlets from public,anon,authenticated,service_role,spatial_writer_runtime;
alter table pipeline_config enable row level security;
revoke all on pipeline_config from public,anon,authenticated,service_role,spatial_writer_runtime;
alter table policies enable row level security;
revoke all on policies from public,anon,authenticated,service_role,spatial_writer_runtime;
alter table policy_documents enable row level security;
revoke all on policy_documents from public,anon,authenticated,service_role,spatial_writer_runtime;
alter table source_change_events enable row level security;
revoke all on source_change_events from public,anon,authenticated,service_role,spatial_writer_runtime;
alter table sources enable row level security;
revoke all on sources from public,anon,authenticated,service_role,spatial_writer_runtime;
alter table spatial.assertion_revisions owner to spatial_owner;
alter table spatial.assertion_revisions enable row level security;
revoke all on spatial.assertion_revisions from public,anon,authenticated,service_role,spatial_writer_runtime;
alter table spatial.assertions owner to spatial_owner;
alter table spatial.assertions enable row level security;
revoke all on spatial.assertions from public,anon,authenticated,service_role,spatial_writer_runtime;
alter table spatial.audience_scopes owner to spatial_owner;
alter table spatial.audience_scopes enable row level security;
revoke all on spatial.audience_scopes from public,anon,authenticated,service_role,spatial_writer_runtime;
alter table spatial.break_glass_audit owner to spatial_owner;
alter table spatial.break_glass_audit enable row level security;
revoke all on spatial.break_glass_audit from public,anon,authenticated,service_role,spatial_writer_runtime;
alter table spatial.evidence_artifact_registry owner to spatial_owner;
alter table spatial.evidence_artifact_registry enable row level security;
revoke all on spatial.evidence_artifact_registry from public,anon,authenticated,service_role,spatial_writer_runtime;
alter table spatial.evidence_condition_events owner to spatial_owner;
alter table spatial.evidence_condition_events enable row level security;
revoke all on spatial.evidence_condition_events from public,anon,authenticated,service_role,spatial_writer_runtime;
alter table spatial.evidence_snapshots owner to spatial_owner;
alter table spatial.evidence_snapshots enable row level security;
revoke all on spatial.evidence_snapshots from public,anon,authenticated,service_role,spatial_writer_runtime;
alter table spatial.geometry_snapshots owner to spatial_owner;
alter table spatial.geometry_snapshots enable row level security;
revoke all on spatial.geometry_snapshots from public,anon,authenticated,service_role,spatial_writer_runtime;
alter table spatial.graph_node_authority_snapshots owner to spatial_owner;
alter table spatial.graph_node_authority_snapshots enable row level security;
revoke all on spatial.graph_node_authority_snapshots from public,anon,authenticated,service_role,spatial_writer_runtime;
alter table spatial.place_authority_snapshots owner to spatial_owner;
alter table spatial.place_authority_snapshots enable row level security;
revoke all on spatial.place_authority_snapshots from public,anon,authenticated,service_role,spatial_writer_runtime;
alter table spatial.policy_artifacts owner to spatial_owner;
alter table spatial.policy_artifacts enable row level security;
revoke all on spatial.policy_artifacts from public,anon,authenticated,service_role,spatial_writer_runtime;
alter table spatial.release_decisions owner to spatial_owner;
alter table spatial.release_decisions enable row level security;
revoke all on spatial.release_decisions from public,anon,authenticated,service_role,spatial_writer_runtime;
alter table spatial.review_decisions owner to spatial_owner;
alter table spatial.review_decisions enable row level security;
revoke all on spatial.review_decisions from public,anon,authenticated,service_role,spatial_writer_runtime;
alter table spatial.revision_evidence owner to spatial_owner;
alter table spatial.revision_evidence enable row level security;
revoke all on spatial.revision_evidence from public,anon,authenticated,service_role,spatial_writer_runtime;
alter table spatial.revision_lineage owner to spatial_owner;
alter table spatial.revision_lineage enable row level security;
revoke all on spatial.revision_lineage from public,anon,authenticated,service_role,spatial_writer_runtime;
alter table story_arcs enable row level security;
revoke all on story_arcs from public,anon,authenticated,service_role,spatial_writer_runtime;
grant INSERT on "public"."pipeline_config" to "anon";
grant SELECT on "public"."pipeline_config" to "anon";
grant UPDATE on "public"."pipeline_config" to "anon";
grant DELETE on "public"."pipeline_config" to "anon";
grant TRUNCATE on "public"."pipeline_config" to "anon";
grant REFERENCES on "public"."pipeline_config" to "anon";
grant TRIGGER on "public"."pipeline_config" to "anon";
grant INSERT on "public"."pipeline_config" to "authenticated";
grant SELECT on "public"."pipeline_config" to "authenticated";
grant UPDATE on "public"."pipeline_config" to "authenticated";
grant DELETE on "public"."pipeline_config" to "authenticated";
grant TRUNCATE on "public"."pipeline_config" to "authenticated";
grant REFERENCES on "public"."pipeline_config" to "authenticated";
grant TRIGGER on "public"."pipeline_config" to "authenticated";
grant INSERT on "public"."pipeline_config" to "service_role";
grant SELECT on "public"."pipeline_config" to "service_role";
grant UPDATE on "public"."pipeline_config" to "service_role";
grant DELETE on "public"."pipeline_config" to "service_role";
grant TRUNCATE on "public"."pipeline_config" to "service_role";
grant REFERENCES on "public"."pipeline_config" to "service_role";
grant TRIGGER on "public"."pipeline_config" to "service_role";
grant SELECT on "public"."nodes" to "anon";
grant SELECT on "public"."nodes" to "authenticated";
grant SELECT on "public"."nodes" to "service_role";
grant SELECT on "public"."policy_documents" to "anon";
grant SELECT on "public"."policy_documents" to "authenticated";
grant SELECT on "public"."policy_documents" to "service_role";
grant SELECT on "public"."geographic_places" to "service_role";
create policy "public read pipeline_config" on public.pipeline_config as PERMISSIVE for SELECT to public using (true);
create policy "spatial_owner_read_sources" on public.sources as PERMISSIVE for SELECT to "spatial_owner" using (true);
create policy "spatial_owner_read_articles" on public.articles as PERMISSIVE for SELECT to "spatial_owner" using (true);
create policy "public read nodes" on public.nodes as PERMISSIVE for SELECT to public using (true);
create policy "policy_documents_read" on public.policy_documents as PERMISSIVE for SELECT to public using (true);
create policy "spatial_owner_read_geographic_places" on public.geographic_places as PERMISSIVE for SELECT to "spatial_owner" using (true);
grant usage on schema spatial to spatial_writer_runtime;
grant usage on schema public,extensions to spatial_owner;

CREATE INDEX assertion_revisions_by_assertion_time ON spatial.assertion_revisions USING btree (spatial_assertion_id, guard_start_utc, guard_end_utc);
CREATE INDEX revision_lineage_to_idx ON spatial.revision_lineage USING btree (to_revision_id);
CREATE INDEX revision_lineage_from_idx ON spatial.revision_lineage USING btree (from_revision_id);
CREATE INDEX review_decisions_latest ON spatial.review_decisions USING btree (assertion_revision_id, effective_at DESC, created_at DESC);
CREATE UNIQUE INDEX revision_lineage_one_direct_predecessor ON spatial.revision_lineage USING btree (to_revision_id) WHERE (relationship_type = ANY (ARRAY['corrects'::text, 'supersedes'::text]));
CREATE INDEX evidence_condition_latest_idx ON spatial.evidence_condition_events USING btree (evidence_snapshot_id, observed_at DESC);
CREATE UNIQUE INDEX release_one_direct_successor ON spatial.release_decisions USING btree (predecessor_release_decision_id) WHERE (predecessor_release_decision_id IS NOT NULL);
CREATE INDEX release_lane_idx ON spatial.release_decisions USING btree (assertion_revision_id, audience_scope_id, decided_at DESC);
CREATE INDEX revision_evidence_revision_idx ON spatial.revision_evidence USING btree (assertion_revision_id, evidence_role);
grant select ("id") on articles to spatial_owner;
grant select ("outlet") on articles to spatial_owner;
grant select ("title") on articles to spatial_owner;
grant select ("url") on articles to spatial_owner;
grant select ("summary") on articles to spatial_owner;
grant select ("published_at") on articles to spatial_owner;
grant select ("fetched_at") on articles to spatial_owner;
grant select ("outlet_id") on articles to spatial_owner;
grant select ("body_text") on articles to spatial_owner;
grant select ("source_status") on articles to spatial_owner;
grant select ("source_status_changed_at") on articles to spatial_owner;
grant select ("reader_state") on articles to spatial_owner;
grant select ("reader_exclusion_reason") on articles to spatial_owner;
grant select ("id") on geographic_places to spatial_owner;
grant select ("canonical_name") on geographic_places to spatial_owner;
grant select ("country_code") on geographic_places to spatial_owner;
grant select ("admin1_name") on geographic_places to spatial_owner;
grant select ("latitude") on geographic_places to spatial_owner;
grant select ("longitude") on geographic_places to spatial_owner;
grant select ("precision") on geographic_places to spatial_owner;
grant select ("gazetteer_provider") on geographic_places to spatial_owner;
grant select ("gazetteer_id") on geographic_places to spatial_owner;
grant select ("created_at") on geographic_places to spatial_owner;
grant select ("updated_at") on geographic_places to spatial_owner;
grant select ("id") on nodes to spatial_owner;
grant select ("slug") on nodes to spatial_owner;
grant select ("label") on nodes to spatial_owner;
grant select ("type") on nodes to spatial_owner;
grant select ("description") on nodes to spatial_owner;
grant select ("metadata") on nodes to spatial_owner;
grant select ("created_at") on nodes to spatial_owner;
grant select ("updated_at") on nodes to spatial_owner;
grant select ("confidence") on nodes to spatial_owner;
grant select ("summary") on nodes to spatial_owner;
grant select ("occurred_at") on nodes to spatial_owner;
grant select ("arc_id") on nodes to spatial_owner;
grant select ("arc_membership_candidate_id") on nodes to spatial_owner;
grant select ("id") on policy_documents to spatial_owner;
grant select ("policy_id") on policy_documents to spatial_owner;
grant select ("source") on policy_documents to spatial_owner;
grant select ("external_id") on policy_documents to spatial_owner;
grant select ("title") on policy_documents to spatial_owner;
grant select ("url") on policy_documents to spatial_owner;
grant select ("published_at") on policy_documents to spatial_owner;
grant select ("raw_summary") on policy_documents to spatial_owner;
grant select ("extracted_claims") on policy_documents to spatial_owner;
grant select ("created_at") on policy_documents to spatial_owner;
grant select ("id") on sources to spatial_owner;
grant select ("node_id") on sources to spatial_owner;
grant select ("outlet") on sources to spatial_owner;
grant select ("headline") on sources to spatial_owner;
grant select ("url") on sources to spatial_owner;
grant select ("published_at") on sources to spatial_owner;
grant select ("created_at") on sources to spatial_owner;

revoke all on schema extensions from public,spatial_writer_runtime;
grant usage on schema extensions to anon,authenticated,service_role,spatial_owner;
