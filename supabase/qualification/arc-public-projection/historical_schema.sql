-- DISPOSABLE SYNTHETIC FIXTURE ONLY. Not a deployment migration.
-- Exact selected column/types/defaults/checks/FKs/indexes recovered as metadata;
-- no stored material copied. Primary metadata blobs:
-- 9f3ad8a71a2a81b0168fddc031a78be3e1f8f09d, b85eccfe5952d7dc85c78a5b814e678e175d66a7.
-- Authors/outlets FK closure uses recorded 59047b6f00a8d9da927de6b08be6f05a94a466fa.
begin;
set local search_path=public,pg_catalog;
create table public.outlets (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null unique,
  parent_ownership       text,
  country                text,
  known_editorial_stance text,
  notes                  text,
  created_at             timestamptz not null default now()
);
create table public.authors (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  normalized_name text not null unique,
  outlet_ids      uuid[] not null default '{}',
  beats           text[] not null default '{}',
  article_count   int not null default 0,
  first_seen      timestamptz not null default now(),
  last_seen       timestamptz not null default now(),
  framing_profile jsonb,
  confidence      numeric check (confidence between 0 and 1),
  last_computed   timestamptz
);

create table public."arc_events" (
 "id" uuid default gen_random_uuid() not null,
 "arc_id" uuid not null,
 "title" text not null,
 "category" text not null,
 "confidence" text default 'confirmed'::text not null,
 "occurred_at" date,
 "description" text,
 "arc_membership_candidate_id" uuid
);

create table public."arc_membership_candidates" (
 "id" uuid default gen_random_uuid() not null,
 "article_id" uuid not null,
 "arc_id" uuid not null,
 "generation_method" text not null,
 "generation_evidence" jsonb default '{}'::jsonb not null,
 "state" text default 'pending'::text not null,
 "membership_fingerprint" text,
 "membership_fingerprint_hash" text,
 "invalidated_at" timestamp with time zone,
 "created_at" timestamp with time zone default now() not null,
 "updated_at" timestamp with time zone default now() not null,
 "approved_score_id" uuid,
 "approved_at" timestamp with time zone
);

create table public."arc_membership_projection_milestone_baselines" (
 "milestone_id" uuid not null,
 "baseline_status" text not null,
 "baseline_notes" text,
 "captured_at" timestamp with time zone default now() not null
);

create table public."arc_membership_projection_milestone_evidence" (
 "candidate_id" uuid not null,
 "milestone_id" uuid not null,
 "outcome" text not null,
 "article_title" text not null,
 "article_url" text,
 "recorded_at" timestamp with time zone default now() not null
);

create table public."arc_membership_projection_runs" (
 "candidate_id" uuid not null,
 "state" text not null,
 "event_node_id" uuid,
 "source_id" uuid,
 "edge_id" uuid,
 "arc_event_id" uuid,
 "projected_at" timestamp with time zone default now() not null,
 "retracted_at" timestamp with time zone,
 "updated_at" timestamp with time zone default now() not null
);

create table public."arc_membership_release_policy" (
 "model_version" text not null,
 "fixture_passed" boolean default false not null,
 "fixture_checked_at" timestamp with time zone,
 "auto_approval_threshold" numeric,
 "auto_approval_enabled" boolean default false not null,
 "threshold_evidence" jsonb default '{}'::jsonb not null,
 "updated_at" timestamp with time zone default now() not null
);

create table public."arc_membership_scores" (
 "id" uuid default gen_random_uuid() not null,
 "candidate_id" uuid not null,
 "model_version" text not null,
 "membership_fingerprint" text not null,
 "membership_fingerprint_hash" text not null,
 "candidate_updated_at" timestamp with time zone not null,
 "cluster_confidence" numeric not null,
 "decision" text not null,
 "hard_rejections" jsonb default '[]'::jsonb not null,
 "signal_breakdown" jsonb default '{}'::jsonb not null,
 "evidence" jsonb default '{}'::jsonb not null,
 "release_gate" jsonb default '{}'::jsonb not null,
 "scored_at" timestamp with time zone default now() not null
);

create table public."arc_milestones" (
 "id" uuid default gen_random_uuid() not null,
 "arc_id" uuid not null,
 "title" text not null,
 "status" text default 'pending'::text not null,
 "notes" text,
 "updated_at" timestamp with time zone default now() not null,
 "milestone_key" text
);

create table public."articles" (
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
 "embedding" vector(384),
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

create table public."citations" (
 "id" uuid default gen_random_uuid() not null,
 "article_id" uuid not null,
 "cited_entity" text not null,
 "cited_type" text not null,
 "documentation_strength" numeric not null,
 "resolved_node_id" uuid,
 "created_at" timestamp with time zone default now() not null
);

create table public."edges" (
 "id" uuid default gen_random_uuid() not null,
 "source_id" uuid not null,
 "target_id" uuid not null,
 "type" text not null,
 "weight" text default 'medium'::text not null,
 "label" text,
 "metadata" jsonb default '{}'::jsonb not null,
 "created_at" timestamp with time zone default now() not null,
 "similarity" numeric,
 "sky_verified" boolean default false not null,
 "signal_source" text,
 "doc_strength" text,
 "claimed_by" text,
 "stance" text default 'supports'::text not null,
 "disputed_by" jsonb default '[]'::jsonb not null,
 "alternative_causes" jsonb default '[]'::jsonb not null,
 "counterfactual_test" text,
 "reliability" integer,
 "arc_membership_candidate_id" uuid
);

create table public."nodes" (
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

create table public."sources" (
 "id" uuid default gen_random_uuid() not null,
 "node_id" uuid not null,
 "outlet" text not null,
 "headline" text not null,
 "url" text,
 "published_at" date,
 "created_at" timestamp with time zone default now() not null,
 "arc_membership_candidate_id" uuid
);

create table public."story_arcs" (
 "id" uuid default gen_random_uuid() not null,
 "slug" text not null,
 "title" text not null,
 "category" text not null,
 "status" text default 'active'::text not null,
 "root_node_id" uuid,
 "coverage_gap" boolean default false not null,
 "summary" text,
 "started_at" date default CURRENT_DATE not null,
 "last_update_at" timestamp with time zone default now() not null,
 "embedding" vector(384),
 "last_assignment_run" timestamp with time zone,
 "seed_article_id" uuid,
 "category_confidence" numeric,
 "category_evidence" text,
 "title_article_count" integer default 0 not null,
 "display_kind" text default 'story_arc'::text not null
);
alter table public."arc_events" add constraint "arc_events_category_check" CHECK ((category = ANY (ARRAY['accountability'::text, 'economic'::text, 'geopolitical'::text, 'legislative'::text])));
alter table public."arc_events" add constraint "arc_events_confidence_check" CHECK ((confidence = ANY (ARRAY['confirmed'::text, 'corroborated'::text, 'inferred'::text])));
alter table public."arc_events" add constraint "arc_events_pkey" PRIMARY KEY (id);
alter table public."arc_membership_candidates" add constraint "arc_membership_candidates_approved_requires_score" CHECK (((state <> 'approved'::text) OR (approved_score_id IS NOT NULL)));
alter table public."arc_membership_candidates" add constraint "arc_membership_candidates_article_id_arc_id_key" UNIQUE (article_id, arc_id);
alter table public."arc_membership_candidates" add constraint "arc_membership_candidates_pkey" PRIMARY KEY (id);
alter table public."arc_membership_candidates" add constraint "arc_membership_candidates_state_check" CHECK ((state = ANY (ARRAY['pending'::text, 'rejected'::text, 'approved'::text, 'invalidated'::text])));
alter table public."arc_membership_projection_milestone_baselines" add constraint "arc_membership_projection_milestone_baselines_pkey" PRIMARY KEY (milestone_id);
alter table public."arc_membership_projection_milestone_evidence" add constraint "arc_membership_projection_milestone_evidence_outcome_check" CHECK ((outcome = ANY (ARRAY['confirmed'::text, 'failed'::text])));
alter table public."arc_membership_projection_milestone_evidence" add constraint "arc_membership_projection_milestone_evidence_pkey" PRIMARY KEY (candidate_id, milestone_id);
alter table public."arc_membership_projection_runs" add constraint "arc_membership_projection_runs_pkey" PRIMARY KEY (candidate_id);
alter table public."arc_membership_projection_runs" add constraint "arc_membership_projection_runs_state_check" CHECK ((state = ANY (ARRAY['active'::text, 'retracted'::text])));
alter table public."arc_membership_release_policy" add constraint "arc_membership_release_policy_auto_approval_threshold_check" CHECK (((auto_approval_threshold IS NULL) OR ((auto_approval_threshold >= (0)::numeric) AND (auto_approval_threshold <= (1)::numeric))));
alter table public."arc_membership_release_policy" add constraint "arc_membership_release_policy_enabled_requires_evidence" CHECK (((NOT auto_approval_enabled) OR (fixture_passed AND (fixture_checked_at IS NOT NULL) AND (auto_approval_threshold IS NOT NULL))));
alter table public."arc_membership_release_policy" add constraint "arc_membership_release_policy_pkey" PRIMARY KEY (model_version);
alter table public."arc_membership_scores" add constraint "arc_membership_scores_cluster_confidence_check" CHECK (((cluster_confidence >= (0)::numeric) AND (cluster_confidence <= (1)::numeric)));
alter table public."arc_membership_scores" add constraint "arc_membership_scores_decision_check" CHECK ((decision = ANY (ARRAY['candidate'::text, 'rejected'::text])));
alter table public."arc_membership_scores" add constraint "arc_membership_scores_immutable_snapshot_key" UNIQUE (model_version, candidate_id, membership_fingerprint_hash, candidate_updated_at);
alter table public."arc_membership_scores" add constraint "arc_membership_scores_pkey" PRIMARY KEY (id);
alter table public."arc_milestones" add constraint "arc_milestones_pkey" PRIMARY KEY (id);
alter table public."arc_milestones" add constraint "arc_milestones_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'failed'::text, 'abandoned'::text])));
alter table public."articles" add constraint "articles_pkey" PRIMARY KEY (id);
alter table public."articles" add constraint "articles_reader_exclusion_reason_check" CHECK (((reader_exclusion_reason IS NULL) OR (reader_exclusion_reason = ANY (ARRAY['malformed_title'::text, 'unavailable_page'::text, 'canonical_url_duplicate'::text, 'promotional_material'::text, 'off_mission'::text, 'manual_hold'::text]))));
alter table public."articles" add constraint "articles_reader_state_check" CHECK ((reader_state = ANY (ARRAY['eligible'::text, 'pending_review'::text, 'withheld'::text])));
alter table public."articles" add constraint "articles_source_status_check" CHECK ((source_status = ANY (ARRAY['active'::text, 'corrected'::text, 'withdrawn'::text])));
alter table public."articles" add constraint "articles_url_key" UNIQUE (url);
alter table public."citations" add constraint "citations_cited_type_check" CHECK ((cited_type = ANY (ARRAY['court_doc'::text, 'agency_release'::text, 'named_official'::text, 'anonymous_official'::text, 'prior_reporting'::text, 'study'::text, 'other'::text])));
alter table public."citations" add constraint "citations_pkey" PRIMARY KEY (id);
alter table public."edges" add constraint "edges_causal_evidence_guard" CHECK (((type <> 'causal'::text) OR ((COALESCE(signal_source, ''::text) = ANY (ARRAY['causal_language'::text, 'citation'::text])) AND (NOT (lower(regexp_replace(regexp_replace(COALESCE((metadata ->> 'evidence'::text), ''::text), '^[^a-zA-Z0-9]+'::text, ''::text), '[^a-zA-Z0-9]+$'::text, ''::text)) ~ '^(after(wards?)?|following|amid(st)?|in\s+the\s+wake\s+of|on\s+the\s+back\s+of|in\s+the\s+aftermath\s+of|later|subsequently|days?\s+after|hours?\s+after|weeks?\s+after|months?\s+after)(\s|$)'::text)) AND (NOT (lower(regexp_replace(regexp_replace(regexp_replace(COALESCE(label, ''::text), '^\s*causal:\s*'::text, ''::text, 'i'::text), '^[^a-zA-Z0-9]+'::text, ''::text), '[^a-zA-Z0-9]+$'::text, ''::text)) ~ '^(after(wards?)?|following|amid(st)?|in\s+the\s+wake\s+of|on\s+the\s+back\s+of|in\s+the\s+aftermath\s+of|later|subsequently|days?\s+after|hours?\s+after|weeks?\s+after|months?\s+after)(\s|$)'::text)))));
alter table public."edges" add constraint "edges_check" CHECK ((source_id <> target_id));
alter table public."edges" add constraint "edges_claimed_by_check" CHECK (((claimed_by IS NULL) OR (claimed_by = ANY (ARRAY['source_document'::text, 'analysis'::text, 'reporting'::text, 'MIP_inferred'::text]))));
alter table public."edges" add constraint "edges_counterfactual_test_check" CHECK (((counterfactual_test IS NULL) OR (counterfactual_test = ANY (ARRAY['natural_experiment'::text, 'discontinuity'::text, 'sequence_only'::text]))));
alter table public."edges" add constraint "edges_doc_strength_check" CHECK (((doc_strength IS NULL) OR (doc_strength = ANY (ARRAY['documented'::text, 'corroborated'::text, 'circumstantial'::text]))));
alter table public."edges" add constraint "edges_pkey" PRIMARY KEY (id);
alter table public."edges" add constraint "edges_reliability_check" CHECK (((reliability IS NULL) OR ((reliability >= 1) AND (reliability <= 5))));
alter table public."edges" add constraint "edges_signal_source_check" CHECK (((signal_source IS NULL) OR (signal_source = ANY (ARRAY['citation'::text, 'shared_entity'::text, 'causal_language'::text, 'topic_actor_temporal'::text]))));
alter table public."edges" add constraint "edges_source_id_target_id_type_key" UNIQUE (source_id, target_id, type);
alter table public."edges" add constraint "edges_stance_check" CHECK ((stance = ANY (ARRAY['supports'::text, 'disputes'::text])));
alter table public."edges" add constraint "edges_type_check" CHECK ((type = ANY (ARRAY['causal'::text, 'actor'::text, 'financial'::text, 'conflict'::text, 'documentary'::text, 'enables'::text, 'constrains'::text, 'enabled'::text, 'constrained_by'::text, 'amends'::text, 'supersedes'::text, 'conflicts_with'::text, 'triggered_compliance'::text, 'violated'::text, 'tested'::text, 'sequence'::text])));
alter table public."edges" add constraint "edges_weight_check" CHECK ((weight = ANY (ARRAY['heavy'::text, 'medium'::text, 'light'::text])));
alter table public."nodes" add constraint "nodes_confidence_check" CHECK (((confidence >= 0) AND (confidence <= 100)));
alter table public."nodes" add constraint "nodes_pkey" PRIMARY KEY (id);
alter table public."nodes" add constraint "nodes_slug_key" UNIQUE (slug);
alter table public."nodes" add constraint "nodes_type_check" CHECK ((type = ANY (ARRAY['event'::text, 'actor'::text, 'institution'::text, 'document'::text, 'anomaly'::text, 'policy'::text, 'topic'::text])));
alter table public."sources" add constraint "sources_pkey" PRIMARY KEY (id);
alter table public."story_arcs" add constraint "story_arcs_category_check" CHECK ((category = ANY (ARRAY['institutional_accountability'::text, 'geopolitical_consequence'::text, 'economic_policy'::text, 'legislative_regulatory'::text, 'unclassified'::text])));
alter table public."story_arcs" add constraint "story_arcs_category_confidence_check" CHECK (((category_confidence IS NULL) OR ((category_confidence >= (0)::numeric) AND (category_confidence <= (1)::numeric))));
alter table public."story_arcs" add constraint "story_arcs_display_kind_check" CHECK ((display_kind = ANY (ARRAY['story_arc'::text, 'research_collection'::text])));
alter table public."story_arcs" add constraint "story_arcs_pkey" PRIMARY KEY (id);
alter table public."story_arcs" add constraint "story_arcs_slug_key" UNIQUE (slug);
alter table public."story_arcs" add constraint "story_arcs_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'dormant'::text, 'resolved'::text, 'cold'::text])));
alter table public."arc_events" add constraint "arc_events_arc_id_fkey" FOREIGN KEY (arc_id) REFERENCES story_arcs(id) ON DELETE CASCADE;
alter table public."arc_events" add constraint "arc_events_arc_membership_candidate_id_fkey" FOREIGN KEY (arc_membership_candidate_id) REFERENCES arc_membership_candidates(id) ON DELETE SET NULL;
alter table public."arc_membership_candidates" add constraint "arc_membership_candidates_approved_score_id_fkey" FOREIGN KEY (approved_score_id) REFERENCES arc_membership_scores(id);
alter table public."arc_membership_candidates" add constraint "arc_membership_candidates_arc_id_fkey" FOREIGN KEY (arc_id) REFERENCES story_arcs(id) ON DELETE CASCADE;
alter table public."arc_membership_candidates" add constraint "arc_membership_candidates_article_id_fkey" FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE;
alter table public."arc_membership_projection_milestone_baselines" add constraint "arc_membership_projection_milestone_baselines_milestone_id_fkey" FOREIGN KEY (milestone_id) REFERENCES arc_milestones(id) ON DELETE CASCADE;
alter table public."arc_membership_projection_milestone_evidence" add constraint "arc_membership_projection_milestone_evidence_candidate_id_fkey" FOREIGN KEY (candidate_id) REFERENCES arc_membership_candidates(id) ON DELETE CASCADE;
alter table public."arc_membership_projection_milestone_evidence" add constraint "arc_membership_projection_milestone_evidence_milestone_id_fkey" FOREIGN KEY (milestone_id) REFERENCES arc_milestones(id) ON DELETE CASCADE;
alter table public."arc_membership_projection_runs" add constraint "arc_membership_projection_runs_arc_event_id_fkey" FOREIGN KEY (arc_event_id) REFERENCES arc_events(id) ON DELETE SET NULL;
alter table public."arc_membership_projection_runs" add constraint "arc_membership_projection_runs_candidate_id_fkey" FOREIGN KEY (candidate_id) REFERENCES arc_membership_candidates(id) ON DELETE CASCADE;
alter table public."arc_membership_projection_runs" add constraint "arc_membership_projection_runs_edge_id_fkey" FOREIGN KEY (edge_id) REFERENCES edges(id) ON DELETE SET NULL;
alter table public."arc_membership_projection_runs" add constraint "arc_membership_projection_runs_event_node_id_fkey" FOREIGN KEY (event_node_id) REFERENCES nodes(id) ON DELETE SET NULL;
alter table public."arc_membership_projection_runs" add constraint "arc_membership_projection_runs_source_id_fkey" FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE SET NULL;
alter table public."arc_membership_scores" add constraint "arc_membership_scores_candidate_id_fkey" FOREIGN KEY (candidate_id) REFERENCES arc_membership_candidates(id) ON DELETE CASCADE;
alter table public."arc_milestones" add constraint "arc_milestones_arc_id_fkey" FOREIGN KEY (arc_id) REFERENCES story_arcs(id) ON DELETE CASCADE;
alter table public."articles" add constraint "articles_arc_id_fkey" FOREIGN KEY (arc_id) REFERENCES story_arcs(id);
alter table public."articles" add constraint "articles_author_id_fkey" FOREIGN KEY (author_id) REFERENCES authors(id);
alter table public."articles" add constraint "articles_outlet_id_fkey" FOREIGN KEY (outlet_id) REFERENCES outlets(id);
alter table public."citations" add constraint "citations_article_id_fkey" FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE;
alter table public."citations" add constraint "citations_resolved_node_id_fkey" FOREIGN KEY (resolved_node_id) REFERENCES nodes(id);
alter table public."edges" add constraint "edges_arc_membership_candidate_id_fkey" FOREIGN KEY (arc_membership_candidate_id) REFERENCES arc_membership_candidates(id) ON DELETE SET NULL;
alter table public."edges" add constraint "edges_source_id_fkey" FOREIGN KEY (source_id) REFERENCES nodes(id) ON DELETE CASCADE;
alter table public."edges" add constraint "edges_target_id_fkey" FOREIGN KEY (target_id) REFERENCES nodes(id) ON DELETE CASCADE;
alter table public."nodes" add constraint "nodes_arc_id_fkey" FOREIGN KEY (arc_id) REFERENCES story_arcs(id) ON DELETE SET NULL;
alter table public."nodes" add constraint "nodes_arc_membership_candidate_id_fkey" FOREIGN KEY (arc_membership_candidate_id) REFERENCES arc_membership_candidates(id) ON DELETE SET NULL;
alter table public."sources" add constraint "sources_arc_membership_candidate_id_fkey" FOREIGN KEY (arc_membership_candidate_id) REFERENCES arc_membership_candidates(id) ON DELETE SET NULL;
alter table public."sources" add constraint "sources_node_id_fkey" FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE;
alter table public."story_arcs" add constraint "story_arcs_root_node_id_fkey" FOREIGN KEY (root_node_id) REFERENCES nodes(id) ON DELETE SET NULL;
alter table public."story_arcs" add constraint "story_arcs_seed_article_id_fkey" FOREIGN KEY (seed_article_id) REFERENCES articles(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX arc_events_arc_membership_projection_candidate_uidx ON public.arc_events USING btree (arc_membership_candidate_id) WHERE (arc_membership_candidate_id IS NOT NULL);
CREATE INDEX arc_membership_candidates_state_idx ON public.arc_membership_candidates USING btree (state, updated_at);
CREATE INDEX arc_membership_scores_candidate_scored_idx ON public.arc_membership_scores USING btree (candidate_id, scored_at DESC);
CREATE INDEX articles_assign_idx ON public.articles USING btree (arc_assign_attempted_at) WHERE ((arc_id IS NULL) AND (arc_assign_attempted_at IS NULL));
CREATE INDEX articles_body_text_trgm_idx ON public.articles USING gin (body_text gin_trgm_ops);
CREATE INDEX articles_embedding_idx ON public.articles USING hnsw (embedding vector_cosine_ops);
CREATE INDEX articles_extract_idx ON public.articles USING btree (entities_extracted_at) WHERE (entities_extracted_at IS NULL);
CREATE INDEX articles_ingestion_run_id_idx ON public.articles USING btree (ingestion_run_id) WHERE (ingestion_run_id IS NOT NULL);
CREATE INDEX articles_reader_state_published_idx ON public.articles USING btree (reader_state, published_at DESC);
CREATE INDEX articles_summary_trgm_idx ON public.articles USING gin (summary gin_trgm_ops);
CREATE INDEX articles_title_trgm_idx ON public.articles USING gin (title gin_trgm_ops);
CREATE UNIQUE INDEX citations_article_entity_type_uidx ON public.citations USING btree (article_id, cited_entity, cited_type);
CREATE INDEX citations_article_id_idx ON public.citations USING btree (article_id);
CREATE UNIQUE INDEX edges_arc_membership_projection_candidate_uidx ON public.edges USING btree (arc_membership_candidate_id) WHERE (arc_membership_candidate_id IS NOT NULL);
CREATE INDEX edges_source_id_idx ON public.edges USING btree (source_id);
CREATE INDEX edges_target_id_idx ON public.edges USING btree (target_id);
CREATE INDEX nodes_arc_id_idx ON public.nodes USING btree (arc_id);
CREATE UNIQUE INDEX nodes_arc_membership_projection_candidate_uidx ON public.nodes USING btree (arc_membership_candidate_id) WHERE (arc_membership_candidate_id IS NOT NULL);
CREATE INDEX nodes_entity_id_idx ON public.nodes USING btree (((metadata ->> 'entity_id'::text)));
CREATE INDEX nodes_type_idx ON public.nodes USING btree (type);
CREATE UNIQUE INDEX sources_arc_membership_projection_candidate_uidx ON public.sources USING btree (arc_membership_candidate_id) WHERE (arc_membership_candidate_id IS NOT NULL);
CREATE INDEX story_arcs_embedding_idx ON public.story_arcs USING hnsw (embedding vector_cosine_ops);
alter table public."outlets" enable row level security;
revoke all on public."outlets" from public;
alter table public."authors" enable row level security;
revoke all on public."authors" from public;
alter table public."arc_events" enable row level security;
revoke all on public."arc_events" from public;
alter table public."arc_membership_candidates" enable row level security;
revoke all on public."arc_membership_candidates" from public;
alter table public."arc_membership_projection_milestone_baselines" enable row level security;
revoke all on public."arc_membership_projection_milestone_baselines" from public;
alter table public."arc_membership_projection_milestone_evidence" enable row level security;
revoke all on public."arc_membership_projection_milestone_evidence" from public;
alter table public."arc_membership_projection_runs" enable row level security;
revoke all on public."arc_membership_projection_runs" from public;
alter table public."arc_membership_release_policy" enable row level security;
revoke all on public."arc_membership_release_policy" from public;
alter table public."arc_membership_scores" enable row level security;
revoke all on public."arc_membership_scores" from public;
alter table public."arc_milestones" enable row level security;
revoke all on public."arc_milestones" from public;
alter table public."articles" enable row level security;
revoke all on public."articles" from public;
alter table public."citations" enable row level security;
revoke all on public."citations" from public;
alter table public."edges" enable row level security;
revoke all on public."edges" from public;
alter table public."nodes" enable row level security;
revoke all on public."nodes" from public;
alter table public."sources" enable row level security;
revoke all on public."sources" from public;
alter table public."story_arcs" enable row level security;
revoke all on public."story_arcs" from public;
commit;
