-- Destination delta: transfer Manus public-surface relations, private
-- predicates, and publication gates onto the existing production stubs.
-- Does not replay historical migrations, enable collectors, move Auth,
-- or join graph-event UUIDs to Source Comparison event UUIDs.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create schema if not exists mip_private;
revoke all on schema mip_private from public, anon, authenticated;
grant usage on schema mip_private to anon, authenticated, service_role;

-- Isolated foundation and some destination revisions omit these live columns.
alter table public.articles add column if not exists arc_id uuid;
alter table public.articles add column if not exists author_id uuid;
alter table public.articles add column if not exists arc_assignment_evidence jsonb;
alter table public.articles add column if not exists unattributed boolean not null default false;
alter table public.articles add column if not exists monoculture boolean not null default false;
alter table public.articles add column if not exists is_digest boolean not null default false;

-- ---------------------------------------------------------------------------
-- Reconcile id-only stubs. Empty on the destination; add live columns.
-- ---------------------------------------------------------------------------
alter table public.story_arcs add column if not exists slug text;
alter table public.story_arcs add column if not exists title text;
alter table public.story_arcs add column if not exists category text;
alter table public.story_arcs add column if not exists status text;
alter table public.story_arcs add column if not exists root_node_id uuid;
alter table public.story_arcs add column if not exists coverage_gap boolean not null default false;
alter table public.story_arcs add column if not exists summary text;
alter table public.story_arcs add column if not exists started_at date not null default current_date;
alter table public.story_arcs add column if not exists last_update_at timestamptz not null default now();
alter table public.story_arcs add column if not exists last_assignment_run timestamptz;
alter table public.story_arcs add column if not exists seed_article_id uuid;
alter table public.story_arcs add column if not exists category_confidence numeric;
alter table public.story_arcs add column if not exists category_evidence text;
alter table public.story_arcs add column if not exists title_article_count integer not null default 0;
alter table public.story_arcs add column if not exists display_kind text not null default 'story_arc';
do $$
begin
  if exists (select 1 from pg_type where typname = 'vector') then
    execute 'alter table public.story_arcs add column if not exists embedding vector';
  end if;
end $$;
update public.story_arcs set slug = coalesce(slug, id::text), title = coalesce(title, 'Untitled arc'), category = coalesce(category, 'unclassified'), status = coalesce(status, 'active') where slug is null or title is null or category is null or status is null;
alter table public.story_arcs alter column slug set not null;
alter table public.story_arcs alter column title set not null;
alter table public.story_arcs alter column category set not null;
alter table public.story_arcs alter column status set not null;
create unique index if not exists story_arcs_slug_key on public.story_arcs (slug);

alter table public.authors add column if not exists name text;
alter table public.authors add column if not exists normalized_name text;
alter table public.authors add column if not exists outlet_ids uuid[] not null default '{}'::uuid[];
alter table public.authors add column if not exists beats text[] not null default '{}'::text[];
alter table public.authors add column if not exists article_count integer not null default 0;
alter table public.authors add column if not exists first_seen timestamptz not null default now();
alter table public.authors add column if not exists last_seen timestamptz not null default now();
alter table public.authors add column if not exists framing_profile jsonb;
alter table public.authors add column if not exists confidence numeric;
alter table public.authors add column if not exists last_computed timestamptz;
update public.authors set name = coalesce(name, 'Unknown author'), normalized_name = coalesce(normalized_name, lower(coalesce(name, 'unknown author'))) where name is null or normalized_name is null;
alter table public.authors alter column name set not null;
alter table public.authors alter column normalized_name set not null;

alter table public.outlets add column if not exists name text;
alter table public.outlets add column if not exists parent_ownership text;
alter table public.outlets add column if not exists country text;
alter table public.outlets add column if not exists known_editorial_stance text;
alter table public.outlets add column if not exists notes text;
alter table public.outlets add column if not exists created_at timestamptz not null default now();
update public.outlets set name = coalesce(name, 'Unknown outlet') where name is null;
alter table public.outlets alter column name set not null;

alter table public.policies add column if not exists name text;
alter table public.policies add column if not exists jurisdiction text;
alter table public.policies add column if not exists instrument_type text;
alter table public.policies add column if not exists enacted_date date;
alter table public.policies add column if not exists effective_date date;
alter table public.policies add column if not exists status text;
alter table public.policies add column if not exists source_url text;
alter table public.policies add column if not exists full_text_url text;
alter table public.policies add column if not exists external_id text;
alter table public.policies add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.policies add column if not exists created_at timestamptz not null default now();
update public.policies set name = coalesce(name, 'Untitled policy') where name is null;
alter table public.policies alter column name set not null;
create unique index if not exists policies_external_id_idx on public.policies (external_id);
create index if not exists policies_name_idx on public.policies (lower(name));

alter table public.arc_membership_candidates add column if not exists article_id uuid;
alter table public.arc_membership_candidates add column if not exists arc_id uuid;
alter table public.arc_membership_candidates add column if not exists generation_method text;
alter table public.arc_membership_candidates add column if not exists generation_evidence jsonb not null default '{}'::jsonb;
alter table public.arc_membership_candidates add column if not exists state text not null default 'pending';
alter table public.arc_membership_candidates add column if not exists membership_fingerprint text;
alter table public.arc_membership_candidates add column if not exists membership_fingerprint_hash text;
alter table public.arc_membership_candidates add column if not exists invalidated_at timestamptz;
alter table public.arc_membership_candidates add column if not exists created_at timestamptz not null default now();
alter table public.arc_membership_candidates add column if not exists updated_at timestamptz not null default now();
alter table public.arc_membership_candidates add column if not exists approved_score_id uuid;
alter table public.arc_membership_candidates add column if not exists approved_at timestamptz;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'arc_membership_candidates_article_arc_key'
  ) then
    alter table public.arc_membership_candidates
      add constraint arc_membership_candidates_article_arc_key unique (article_id, arc_id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'arc_membership_candidates_state_check'
  ) then
    alter table public.arc_membership_candidates
      add constraint arc_membership_candidates_state_check
      check (state in ('pending', 'approved', 'rejected', 'invalidated'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Private publication predicates (Manus live definitions).
-- ---------------------------------------------------------------------------
create or replace function mip_private.arc_has_approved_membership(p_arc_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_catalog'
as $$
  select exists (
    select 1
    from public.arc_membership_candidates c
    where c.arc_id = p_arc_id
      and c.state = 'approved'
  );
$$;

create or replace function mip_private.arc_event_candidate_is_approved(p_candidate_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_catalog'
as $$
  select p_candidate_id is not null and exists (
    select 1
    from public.arc_membership_candidates c
    where c.id = p_candidate_id
      and c.state = 'approved'
  );
$$;

revoke all on function mip_private.arc_has_approved_membership(uuid) from public;
revoke all on function mip_private.arc_event_candidate_is_approved(uuid) from public;
grant execute on function mip_private.arc_has_approved_membership(uuid) to anon, authenticated, service_role;
grant execute on function mip_private.arc_event_candidate_is_approved(uuid) to anon, authenticated, service_role;

create or replace function public.mip_intercept_direct_arc_attachment()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $$
declare
  v_approved_candidate uuid := nullif(current_setting('app.arc_membership_approval_candidate_id', true), '')::uuid;
begin
  if new.arc_id is distinct from old.arc_id and new.arc_id is not null then
    if v_approved_candidate is not null and exists (
      select 1 from public.arc_membership_candidates c
      where c.id = v_approved_candidate
        and c.article_id = new.id
        and c.arc_id = new.arc_id
        and c.state = 'approved'
    ) then
      return new;
    end if;
    insert into public.arc_membership_candidates(article_id, arc_id, generation_method, generation_evidence, state)
    values (
      new.id,
      new.arc_id,
      'direct_attachment_intercept_v1',
      jsonb_build_object('prior_arc_id', old.arc_id, 'intercepted_at', now()),
      'pending'
    )
    on conflict (article_id, arc_id) do update
      set state = 'pending',
          invalidated_at = null,
          generation_evidence = public.arc_membership_candidates.generation_evidence || excluded.generation_evidence;
    new.arc_id := old.arc_id;
    new.arc_assignment_evidence := coalesce(new.arc_assignment_evidence, '{}'::jsonb)
      || jsonb_build_object('membership_gate', 'staged_pending_score');
  end if;
  return new;
end;
$$;

create or replace function public.mip_invalidate_arc_membership_approvals()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $$
declare
  v_exempt uuid := nullif(current_setting('app.arc_membership_approval_candidate_id', true), '')::uuid;
  v_old_arc uuid := case when tg_op = 'INSERT' then null else old.arc_id end;
  v_new_arc uuid := case when tg_op = 'DELETE' then null else new.arc_id end;
begin
  update public.arc_membership_candidates c
     set state = 'invalidated', invalidated_at = now()
   where c.state = 'approved'
     and c.id is distinct from v_exempt
     and c.arc_id in (v_old_arc, v_new_arc);
  return coalesce(new, old);
end;
$$;

drop trigger if exists articles_intercept_direct_arc_attachment on public.articles;
create trigger articles_intercept_direct_arc_attachment
  before update on public.articles
  for each row execute function public.mip_intercept_direct_arc_attachment();

drop trigger if exists articles_invalidate_arc_membership_approvals on public.articles;
create trigger articles_invalidate_arc_membership_approvals
  after insert or update or delete on public.articles
  for each row execute function public.mip_invalidate_arc_membership_approvals();

-- ---------------------------------------------------------------------------
-- Tables required by the 11 frontend relations and remaining loaders.
-- ---------------------------------------------------------------------------
create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  parent_id uuid references public.topics (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.node_topics (
  node_id uuid not null references public.nodes (id) on delete cascade,
  topic_id uuid not null references public.topics (id) on delete cascade,
  confidence numeric not null default 0.5,
  created_at timestamptz not null default now(),
  primary key (node_id, topic_id)
);

create table if not exists public.entities (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  normalized_name text not null,
  aliases text[] not null default '{}'::text[],
  entity_type text not null default 'other',
  mention_count integer not null default 0,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create table if not exists public.policy_topics (
  policy_id uuid not null references public.policies (id) on delete cascade,
  topic_id uuid not null references public.topics (id) on delete cascade,
  confidence numeric not null default 0.5,
  created_at timestamptz not null default now(),
  primary key (policy_id, topic_id)
);

create table if not exists public.policy_actors (
  policy_id uuid not null references public.policies (id) on delete cascade,
  entity_id uuid not null references public.entities (id) on delete cascade,
  role text not null default 'issuing_authority',
  created_at timestamptz not null default now(),
  primary key (policy_id, entity_id, role)
);
alter table public.policy_actors add column if not exists actor_id uuid generated always as (entity_id) stored;

create table if not exists public.arc_events (
  id uuid primary key default gen_random_uuid(),
  arc_id uuid not null references public.story_arcs (id) on delete cascade,
  title text not null,
  category text not null,
  confidence text not null default 'confirmed',
  occurred_at date,
  description text,
  arc_membership_candidate_id uuid references public.arc_membership_candidates (id)
);

create table if not exists public.arc_milestones (
  id uuid primary key default gen_random_uuid(),
  arc_id uuid not null references public.story_arcs (id) on delete cascade,
  title text not null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'failed', 'abandoned')),
  notes text,
  updated_at timestamptz not null default now(),
  milestone_key text
);

create table if not exists public.citations (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles (id) on delete cascade,
  cited_entity text not null,
  cited_type text not null,
  documentation_strength numeric not null,
  resolved_node_id uuid references public.nodes (id),
  created_at timestamptz not null default now()
);

create table if not exists public.sky_verifications (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles (id) on delete cascade,
  arc_id uuid references public.story_arcs (id) on delete set null,
  observed_azimuth_deg numeric(6,2) not null,
  observed_altitude_deg numeric(5,2) not null,
  captured_at timestamptz not null,
  centroid_lat numeric(9,6),
  centroid_lng numeric(9,6),
  confidence_radius_km numeric(7,2) not null,
  sensor_quality text not null check (sensor_quality in ('high','medium','low')),
  angular_error_deg numeric(4,2),
  image_hash text not null,
  method text not null default 'shadow_assisted'
    check (method in ('shadow_assisted','shadow_auto','sky_disk','star_field')),
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  canonical_title text not null,
  occurred_at_start date,
  occurred_at_end date,
  location_text text,
  arc_id uuid references public.story_arcs (id),
  arc_event_id uuid references public.arc_events (id),
  status text not null default 'candidate',
  rule_version text,
  created_at timestamptz not null default now(),
  comparison_validation_state text not null default 'pending_review'
    check (comparison_validation_state in ('pending_review', 'approved', 'quarantined', 'not_applicable'))
);
comment on table public.events is
  'Source Comparison event family. Distinct from public.nodes of type event. UUIDs are not interchangeable.';
comment on column public.events.comparison_validation_state is
  'Reader-facing Source Comparison admission state. pending_review and quarantined events are withheld from comparison_public.';

create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events (id),
  canonical_text text not null,
  claim_kind text not null default 'fact',
  thin_extraction boolean not null default false,
  status text not null default 'active',
  rule_version text,
  first_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.article_claims (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims (id),
  article_id uuid not null references public.articles (id),
  surface_text text not null,
  char_start integer,
  char_end integer,
  extraction_method text not null default 'existing_claims_jsonb',
  extraction_confidence numeric,
  stance text not null default 'asserts',
  loaded_language jsonb not null default '[]'::jsonb,
  version integer not null default 1,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  evidence_source_field text,
  evidence_excerpt text,
  auditability_state text not null default 'unverified_against_retained_source',
  auditability_note text,
  unique (claim_id, article_id, version)
);

create table if not exists public.event_articles (
  event_id uuid not null references public.events (id),
  article_id uuid not null references public.articles (id),
  membership_method text not null,
  membership_confidence numeric,
  created_at timestamptz not null default now(),
  primary key (event_id, article_id)
);

create table if not exists public.claim_evidence_links (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims (id),
  evidence_url text not null,
  evidence_type text not null default 'other',
  linked_from_article_id uuid references public.articles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.claim_corrections (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims (id),
  correcting_article_id uuid not null references public.articles (id),
  corrected_article_id uuid references public.articles (id),
  correction_text text,
  detected_method text not null default 'manual',
  occurred_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.explanations (
  id uuid primary key default gen_random_uuid(),
  assertion_id text not null,
  assertion_type text not null,
  version integer not null,
  is_current boolean not null default true,
  source_ids uuid[] not null default '{}'::uuid[],
  archived_sources jsonb not null default '[]'::jsonb,
  source_roles jsonb not null default '{}'::jsonb,
  supporting_passage text,
  contradicting_evidence jsonb not null default '[]'::jsonb,
  missing_evidence jsonb not null default '[]'::jsonb,
  shared_entities uuid[] not null default '{}'::uuid[],
  relationship_type text,
  rule_version text,
  provenance_class text not null,
  created_at timestamptz not null default now(),
  recomputed_at timestamptz,
  reviewed_at timestamptz,
  review_status text not null default 'draft',
  falsification_condition text,
  correction_history jsonb not null default '[]'::jsonb,
  remaining_uncertainty text,
  state text not null default 'explanation_pending'
);

create table if not exists public.cross_surface_candidates (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles (id),
  candidate_type text not null,
  target_table text not null,
  target_id uuid,
  evidence_excerpt text not null,
  evidence_start integer,
  evidence_end integer,
  algorithm_version text not null,
  review_state text not null default 'pending',
  remaining_uncertainty text not null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text
);

create table if not exists public.node_location_mentions (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.nodes (id) on delete cascade,
  article_id uuid references public.articles (id),
  event_id uuid,
  place_id uuid references public.geographic_places (id),
  mention_text text not null,
  text_field text not null,
  mention_start integer,
  mention_end integer,
  location_role text not null,
  literal_status text not null,
  resolution_method text not null,
  review_state text not null,
  remaining_uncertainty text,
  extraction_version text not null default 'geography-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.node_location_mentions.event_id is
  'Optional Source Comparison event family id. Not a public.nodes id.';

create table if not exists public.p3_legal_case (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  case_status text not null,
  verdict_or_disposition text,
  charge_or_issue text,
  deciding_body text,
  appeal_status text,
  involves_minor_or_private_person boolean not null default false,
  sealed_or_expunged boolean not null default false,
  authentication_completeness text,
  remaining_uncertainty text,
  review_status text not null,
  reviewed_by text,
  reviewed_at timestamptz,
  correction_notice text,
  correction_history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.p3_legal_case_evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.p3_legal_case (id) on delete cascade,
  track text not null,
  description text not null,
  source_id uuid,
  source_passage text,
  method_version text,
  authentication_state text,
  remaining_uncertainty text,
  review_status text not null,
  reviewed_by text,
  reviewed_at timestamptz,
  correction_notice text,
  correction_history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  source_url text
);

create table if not exists public.p3_policy (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  jurisdiction text,
  instrument_type text,
  description text,
  review_status text not null default 'draft',
  reviewed_by text,
  reviewed_at timestamptz,
  correction_notice text,
  correction_history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  agency text,
  source_locator jsonb
);

create table if not exists public.p3_policy_track_event (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.p3_policy (id) on delete cascade,
  track text not null,
  state text not null,
  event_date date,
  source_id uuid,
  source_passage text,
  method_version text,
  remaining_uncertainty text,
  missing_evidence boolean not null default false,
  review_status text not null default 'draft',
  reviewed_by text,
  reviewed_at timestamptz,
  correction_notice text,
  correction_history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  source_locator jsonb
);

create table if not exists public.mip_consolidation_watermarks (
  source_project_ref text not null,
  channel text not null,
  watermark jsonb not null,
  captured_at timestamptz not null default now(),
  primary key (source_project_ref, channel)
);

create or replace function public.policy_edge_attributed()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.nodes n
    where n.type = 'policy' and (n.id = new.source_id or n.id = new.target_id)
  ) then
    if new.claimed_by is null or new.doc_strength is null
       or new.signal_source is null or new.reliability is null then
      raise exception 'policy edge missing attribution (claimed_by/doc_strength/signal_source/reliability required)';
    end if;
    if new.claimed_by = 'MIP_inferred'
       and (new.counterfactual_test is null or jsonb_array_length(new.alternative_causes) = 0) then
      raise exception 'MIP_inferred policy edge requires counterfactual_test and >=1 alternative_causes';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists policy_edge_attributed on public.edges;
create trigger policy_edge_attributed
  before insert or update on public.edges
  for each row execute function public.policy_edge_attributed();

-- ---------------------------------------------------------------------------
-- Topic taxonomy (existing seed; ingestion may tag these slugs only).
-- ---------------------------------------------------------------------------
insert into public.topics (slug, name, parent_id) values
  ('technology', 'Technology', null),
  ('governance', 'Governance', null),
  ('security-defense', 'Security & Defense', null),
  ('energy-environment', 'Energy & Environment', null),
  ('labor-economy', 'Labor & Economy', null),
  ('public-health', 'Public Health', null),
  ('civil-liberties', 'Civil Liberties', null)
on conflict (slug) do update set name = excluded.name;

insert into public.topics (slug, name, parent_id)
select s.slug, s.name, p.id from (values
  ('ai', 'Artificial Intelligence', 'technology'),
  ('semiconductors', 'Semiconductors', 'technology'),
  ('quantum-computing', 'Quantum computing', 'technology'),
  ('data-centers', 'Data centers', 'technology'),
  ('telecommunications', 'Telecommunications', 'technology'),
  ('governance-legislation', 'Legislation', 'governance'),
  ('governance-regulatory-action', 'Regulatory action', 'governance'),
  ('governance-judicial', 'Judicial', 'governance'),
  ('governance-executive-action', 'Executive action', 'governance')
) as s (slug, name, parent_slug)
join public.topics p on p.slug = s.parent_slug
on conflict (slug) do update set name = excluded.name, parent_id = excluded.parent_id;

insert into public.topics (slug, name, parent_id)
select s.slug, s.name, p.id from (values
  ('ai-model-development', 'Model development', 'ai'),
  ('ai-regulation', 'AI regulation', 'ai'),
  ('ai-infrastructure', 'AI infrastructure', 'ai'),
  ('semiconductors-fabrication', 'Fabrication', 'semiconductors'),
  ('semiconductors-export-controls', 'Export controls', 'semiconductors'),
  ('semiconductors-supply-chain', 'Supply chain', 'semiconductors'),
  ('data-centers-siting', 'Siting & permitting', 'data-centers'),
  ('data-centers-energy', 'Energy consumption', 'data-centers'),
  ('data-centers-water', 'Water use', 'data-centers')
) as s (slug, name, parent_slug)
join public.topics p on p.slug = s.parent_slug
on conflict (slug) do update set name = excluded.name, parent_id = excluded.parent_id;

-- ---------------------------------------------------------------------------
-- RLS: keep private bases closed; public views carry publication gates.
-- ---------------------------------------------------------------------------
alter table public.topics enable row level security;
alter table public.node_topics enable row level security;
alter table public.entities enable row level security;
alter table public.policy_topics enable row level security;
alter table public.policy_actors enable row level security;
alter table public.arc_events enable row level security;
alter table public.arc_milestones enable row level security;
alter table public.citations enable row level security;
alter table public.sky_verifications enable row level security;
alter table public.events enable row level security;
alter table public.claims enable row level security;
alter table public.article_claims enable row level security;
alter table public.event_articles enable row level security;
alter table public.claim_evidence_links enable row level security;
alter table public.claim_corrections enable row level security;
alter table public.explanations enable row level security;
alter table public.cross_surface_candidates enable row level security;
alter table public.node_location_mentions enable row level security;
alter table public.p3_legal_case enable row level security;
alter table public.p3_legal_case_evidence enable row level security;
alter table public.p3_policy enable row level security;
alter table public.p3_policy_track_event enable row level security;
alter table public.mip_consolidation_watermarks enable row level security;
alter table public.authors enable row level security;
alter table public.outlets enable row level security;

revoke insert, update, delete, truncate on
  public.topics, public.node_topics, public.entities, public.policy_topics,
  public.policy_actors, public.arc_events, public.arc_milestones, public.citations,
  public.sky_verifications, public.events, public.claims, public.article_claims,
  public.event_articles, public.claim_evidence_links, public.claim_corrections,
  public.explanations, public.cross_surface_candidates, public.node_location_mentions,
  public.p3_legal_case, public.p3_legal_case_evidence, public.p3_policy,
  public.p3_policy_track_event, public.mip_consolidation_watermarks
  from public, anon, authenticated;

grant select on public.topics, public.node_topics, public.policy_topics, public.policy_actors,
  public.arc_events, public.citations, public.sky_verifications, public.node_location_mentions
  to anon, authenticated, service_role;

revoke all on public.authors from anon, authenticated;
grant select on public.authors to service_role;
grant select on public.outlets to anon, authenticated, service_role;

revoke all on
  public.arc_milestones, public.events, public.claims, public.article_claims,
  public.event_articles, public.claim_evidence_links, public.claim_corrections,
  public.explanations, public.cross_surface_candidates, public.entities,
  public.p3_legal_case, public.p3_legal_case_evidence, public.p3_policy,
  public.p3_policy_track_event, public.mip_consolidation_watermarks
  from anon;
grant select on
  public.arc_milestones, public.events, public.claims, public.article_claims,
  public.event_articles, public.claim_evidence_links, public.claim_corrections,
  public.explanations, public.cross_surface_candidates, public.entities,
  public.p3_legal_case, public.p3_legal_case_evidence, public.p3_policy,
  public.p3_policy_track_event
  to authenticated, service_role;
grant select, insert, update on public.mip_consolidation_watermarks to service_role;
grant insert, update on
  public.topics, public.node_topics, public.entities, public.policy_topics,
  public.policy_actors, public.arc_events, public.arc_milestones, public.citations,
  public.sky_verifications, public.events, public.claims, public.article_claims,
  public.event_articles, public.claim_evidence_links, public.claim_corrections,
  public.explanations, public.cross_surface_candidates, public.node_location_mentions,
  public.p3_legal_case, public.p3_legal_case_evidence, public.p3_policy,
  public.p3_policy_track_event, public.authors, public.outlets, public.story_arcs,
  public.policies
  to service_role;

drop policy if exists topics_read on public.topics;
create policy topics_read on public.topics for select to anon, authenticated using (true);
drop policy if exists node_topics_read on public.node_topics;
create policy node_topics_read on public.node_topics for select to anon, authenticated using (true);
drop policy if exists policy_topics_read on public.policy_topics;
create policy policy_topics_read on public.policy_topics for select to anon, authenticated using (true);
drop policy if exists policy_actors_read on public.policy_actors;
create policy policy_actors_read on public.policy_actors for select to anon, authenticated using (true);
drop policy if exists citations_public_read on public.citations;
create policy citations_public_read on public.citations for select to anon, authenticated using (true);
drop policy if exists sky_verifications_public_read on public.sky_verifications;
create policy sky_verifications_public_read on public.sky_verifications for select to anon, authenticated using (true);
drop policy if exists outlets_public_read on public.outlets;
create policy outlets_public_read on public.outlets for select to anon, authenticated using (true);
drop policy if exists node_location_mentions_public_read on public.node_location_mentions;
create policy node_location_mentions_public_read on public.node_location_mentions
  for select to anon, authenticated using (true);

-- Timeline contract: untagged historical rows stay visible; tagged rows
-- require an approved membership candidate. Do not copy Manus's leftover
-- using(true) policy that would publish pending tagged rows.
drop policy if exists arc_events_public_algorithmic_read on public.arc_events;
create policy arc_events_public_algorithmic_read on public.arc_events
  for select to anon, authenticated
  using (
    arc_membership_candidate_id is null
    or mip_private.arc_event_candidate_is_approved(arc_membership_candidate_id)
  );

drop policy if exists arc_milestones_public_algorithmic_read on public.arc_milestones;
create policy arc_milestones_public_algorithmic_read on public.arc_milestones
  for select to authenticated
  using (mip_private.arc_has_approved_membership(arc_id));

drop policy if exists events_authenticated_read on public.events;
create policy events_authenticated_read on public.events for select to authenticated using (true);
drop policy if exists claims_authenticated_read on public.claims;
create policy claims_authenticated_read on public.claims for select to authenticated using (true);
drop policy if exists article_claims_authenticated_read on public.article_claims;
create policy article_claims_authenticated_read on public.article_claims for select to authenticated using (true);
drop policy if exists event_articles_authenticated_read on public.event_articles;
create policy event_articles_authenticated_read on public.event_articles for select to authenticated using (true);
drop policy if exists explanations_authenticated_read on public.explanations;
create policy explanations_authenticated_read on public.explanations for select to authenticated using (true);
drop policy if exists cross_surface_candidates_read on public.cross_surface_candidates;
create policy cross_surface_candidates_read on public.cross_surface_candidates for select to authenticated using (true);
drop policy if exists p3_legal_case_read on public.p3_legal_case;
create policy p3_legal_case_read on public.p3_legal_case for select to authenticated using (true);
drop policy if exists p3_legal_case_evidence_read on public.p3_legal_case_evidence;
create policy p3_legal_case_evidence_read on public.p3_legal_case_evidence for select to authenticated using (true);
drop policy if exists p3_policy_read on public.p3_policy;
create policy p3_policy_read on public.p3_policy for select to authenticated using (true);
drop policy if exists p3_policy_track_event_read on public.p3_policy_track_event;
create policy p3_policy_track_event_read on public.p3_policy_track_event for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Public views. security_barrier + owner access so private bases stay closed.
-- Article-keyed projections also honor destination reader_state.
-- ---------------------------------------------------------------------------
create or replace view public.authors_public
with (security_barrier = true, security_invoker = false)
as
select a.id, a.name
from public.authors a;

create or replace view public.arc_milestones_public
with (security_barrier = true, security_invoker = false)
as
select m.id, m.arc_id, m.title, m.status, m.notes, m.updated_at
from public.arc_milestones m
where mip_private.arc_has_approved_membership(m.arc_id);

create or replace view public.graph_coverage_public
with (security_barrier = true, security_invoker = false)
as
with article_totals as (
  select count(*)::integer as article_count
  from public.articles
),
resolved_article_totals as (
  select count(distinct c.article_id)::integer as articles_with_published_node
  from public.citations c
  where c.article_id is not null
    and c.resolved_node_id is not null
),
pending_graph_candidates as (
  select count(*)::integer as pending_graph_candidate_count
  from public.cross_surface_candidates c
  where c.candidate_type in ('graph_node', 'graph_edge')
    and c.review_state in ('pending', 'owner_hold')
),
published_graph as (
  select
    (select count(*)::integer from public.nodes) as published_node_count,
    (select count(*)::integer from public.edges) as documented_relationship_count
)
select
  a.article_count,
  r.articles_with_published_node,
  greatest(a.article_count - r.articles_with_published_node, 0)::integer as articles_without_published_node,
  p.pending_graph_candidate_count,
  g.published_node_count,
  g.documented_relationship_count
from article_totals a
cross join resolved_article_totals r
cross join pending_graph_candidates p
cross join published_graph g;

create or replace view public.news_detail_public
with (security_barrier = true, security_invoker = false)
as
select
  a.id as article_id,
  coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'surface_text', ac.surface_text,
        'canonical_text', c.canonical_text,
        'auditability_state', ac.auditability_state,
        'auditability_note', ac.auditability_note,
        'evidence_source_field', ac.evidence_source_field,
        'evidence_excerpt', ac.evidence_excerpt,
        'evidence_records', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'evidence_url', cel.evidence_url,
              'evidence_type', cel.evidence_type
            )
            order by cel.evidence_type, cel.evidence_url
          )
          from public.claim_evidence_links cel
          where cel.claim_id = c.id
        ), '[]'::jsonb)
      )
      order by ac.id
    )
    from public.article_claims ac
    join public.claims c on c.id = ac.claim_id
    where ac.article_id = a.id
      and ac.is_current = true
  ), '[]'::jsonb) as reviewed_claims
from public.articles a
where a.reader_state = 'eligible'
  and a.source_status = 'active';

create or replace view public.comparison_public
with (security_barrier = true, security_invoker = false)
as
select
  md5(e.id::text) as event_key,
  e.canonical_title,
  e.occurred_at_start,
  e.occurred_at_end,
  coalesce((
    select jsonb_agg(article_row.article order by article_row.published_at nulls last, article_row.article_key)
    from (
      select
        a.published_at,
        md5(a.id::text) as article_key,
        jsonb_build_object(
          'article_key', md5(a.id::text),
          'outlet', a.outlet,
          'article_url', a.url,
          'published_at', a.published_at,
          'arc_slug', arc.slug,
          'arc_title', arc.title,
          'timeline_key', timeline.timeline_key,
          'has_extracted_claim', exists (
            select 1
            from public.article_claims existing_surface
            join public.claims existing_claim on existing_claim.id = existing_surface.claim_id
            where existing_surface.article_id = a.id
              and existing_surface.is_current = true
              and existing_claim.status = 'active'
              and existing_claim.rule_version = 'sc-v2-event-projection'
          )
        ) as article
      from public.event_articles ea
      join public.articles a on a.id = ea.article_id
      left join public.story_arcs arc on arc.id = a.arc_id
      left join lateral (
        select right(n.slug, 8) as timeline_key
        from public.nodes n
        where n.type = 'event'
          and n.arc_id = a.arc_id
        order by (n.slug like 'evt-%') desc, n.slug
        limit 1
      ) timeline on true
      where ea.event_id = e.id
        and a.reader_state = 'eligible'
        and a.source_status = 'active'
    ) article_row
  ), '[]'::jsonb) as articles,
  coalesce((
    select jsonb_agg(claim_row.claim order by claim_row.canonical_text)
    from (
      select
        c.canonical_text,
        jsonb_build_object(
          'claim_key', md5(c.id::text),
          'canonical_text', c.canonical_text,
          'thin_extraction', c.thin_extraction,
          'surfaces', coalesce((
            select jsonb_agg(surface_row.surface order by surface_row.published_at nulls last, surface_row.article_key)
            from (
              select
                a.published_at,
                md5(a.id::text) as article_key,
                jsonb_build_object(
                  'article_key', md5(a.id::text),
                  'surface_text', ac.surface_text,
                  'loaded_language', ac.loaded_language,
                  'explanation', explanation.explanation
                ) as surface
              from public.article_claims ac
              join public.articles a on a.id = ac.article_id
              left join lateral (
                select jsonb_build_object(
                  'supporting_passage', x.supporting_passage,
                  'rule_version', x.rule_version,
                  'provenance_class', x.provenance_class,
                  'reviewed_at', x.reviewed_at,
                  'review_status', x.review_status,
                  'state', x.state,
                  'remaining_uncertainty', x.remaining_uncertainty
                ) as explanation
                from public.explanations x
                where x.assertion_type = 'claim_grouping'
                  and x.is_current = true
                  and x.rule_version like 'sc-v2-event-projection|%'
                  and right(x.assertion_id, 36) = ac.article_id::text
                  and position(format('Surface claim "%s" grouped under canonical "', ac.surface_text) in coalesce(x.supporting_passage, '')) = 1
                order by x.recomputed_at desc nulls last, x.id
                limit 1
              ) explanation on true
              where ac.claim_id = c.id
                and ac.is_current = true
                and a.reader_state = 'eligible'
                and a.source_status = 'active'
            ) surface_row
          ), '[]'::jsonb),
          'evidence_links', coalesce((
            select jsonb_agg(jsonb_build_object(
              'evidence_url', cel.evidence_url,
              'evidence_type', cel.evidence_type
            ) order by cel.evidence_type, cel.evidence_url)
            from public.claim_evidence_links cel
            where cel.claim_id = c.id
          ), '[]'::jsonb),
          'corrections', coalesce((
            select jsonb_agg(jsonb_build_object(
              'correction_text', cc.correction_text,
              'occurred_at', cc.occurred_at
            ) order by cc.occurred_at nulls last)
            from public.claim_corrections cc
            where cc.claim_id = c.id
          ), '[]'::jsonb)
        ) as claim
      from public.claims c
      where c.event_id = e.id
        and c.status = 'active'
        and c.rule_version = 'sc-v2-event-projection'
    ) claim_row
  ), '[]'::jsonb) as claims
from public.events e
where e.status <> 'timeline_only'
  and e.comparison_validation_state = 'approved'
  and exists (
    select 1
    from public.event_articles ea
    join public.articles a on a.id = ea.article_id
    where ea.event_id = e.id
      and a.reader_state = 'eligible'
      and a.source_status = 'active'
    group by ea.event_id
    having count(distinct a.outlet) >= 2
  );

revoke all on public.authors_public, public.arc_milestones_public, public.graph_coverage_public,
  public.news_detail_public, public.comparison_public from public;
grant select on public.authors_public, public.arc_milestones_public, public.graph_coverage_public,
  public.news_detail_public, public.comparison_public to anon, authenticated, service_role;

comment on view public.authors_public is
  'Anonymous author byline contract. Private author profiling columns stay on authors.';
comment on view public.arc_milestones_public is
  'Anonymous milestone contract. Rows appear only for arcs with an approved membership candidate.';
comment on view public.graph_coverage_public is
  'Anonymous aggregate coverage disclosure. Counts stored publication and review states only.';
comment on view public.news_detail_public is
  'Anonymous News-detail contract. Pending and non-active articles are withheld.';
comment on view public.comparison_public is
  'Anonymous Source Comparison contract. Requires approved comparison_validation_state, two eligible outlets, and does not join graph node ids.';

comment on table public.mip_consolidation_watermarks is
  'Capture watermarks for Manus collectors. Does not start or stop workers.';

commit;
