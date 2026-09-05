-- Production-recorded public-surface transfer chunk.
-- Applied on qikvmopbtijoebdqosyq as 20260905172558 / mip_public_surface_topics_rls.
-- Restored verbatim from supabase_migrations.schema_migrations.statements.
-- Do not replay this file on production; it is already recorded there.

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
revoke insert, update, delete, truncate on public.topics, public.node_topics, public.entities, public.policy_topics, public.policy_actors, public.arc_events, public.arc_milestones, public.citations, public.sky_verifications, public.events, public.claims, public.article_claims, public.event_articles, public.claim_evidence_links, public.claim_corrections, public.explanations, public.cross_surface_candidates, public.node_location_mentions, public.p3_legal_case, public.p3_legal_case_evidence, public.p3_policy, public.p3_policy_track_event, public.mip_consolidation_watermarks from public, anon, authenticated;
grant select on public.topics, public.node_topics, public.policy_topics, public.policy_actors, public.arc_events, public.citations, public.sky_verifications, public.node_location_mentions to anon, authenticated, service_role;
revoke all on public.authors from anon, authenticated;
grant select on public.authors to service_role;
grant select on public.outlets to anon, authenticated, service_role;
revoke all on public.arc_milestones, public.events, public.claims, public.article_claims, public.event_articles, public.claim_evidence_links, public.claim_corrections, public.explanations, public.cross_surface_candidates, public.entities, public.p3_legal_case, public.p3_legal_case_evidence, public.p3_policy, public.p3_policy_track_event, public.mip_consolidation_watermarks from anon;
grant select on public.arc_milestones, public.events, public.claims, public.article_claims, public.event_articles, public.claim_evidence_links, public.claim_corrections, public.explanations, public.cross_surface_candidates, public.entities, public.p3_legal_case, public.p3_legal_case_evidence, public.p3_policy, public.p3_policy_track_event to authenticated, service_role;
grant select, insert, update on public.mip_consolidation_watermarks to service_role;
grant insert, update on public.topics, public.node_topics, public.entities, public.policy_topics, public.policy_actors, public.arc_events, public.arc_milestones, public.citations, public.sky_verifications, public.events, public.claims, public.article_claims, public.event_articles, public.claim_evidence_links, public.claim_corrections, public.explanations, public.cross_surface_candidates, public.node_location_mentions, public.p3_legal_case, public.p3_legal_case_evidence, public.p3_policy, public.p3_policy_track_event, public.authors, public.outlets, public.story_arcs, public.policies to service_role;
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
create policy node_location_mentions_public_read on public.node_location_mentions for select to anon, authenticated using (true);
drop policy if exists arc_events_public_algorithmic_read on public.arc_events;
create policy arc_events_public_algorithmic_read on public.arc_events for select to anon, authenticated using (arc_membership_candidate_id is null or mip_private.arc_event_candidate_is_approved(arc_membership_candidate_id));
drop policy if exists arc_milestones_public_algorithmic_read on public.arc_milestones;
create policy arc_milestones_public_algorithmic_read on public.arc_milestones for select to authenticated using (mip_private.arc_has_approved_membership(arc_id));
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
