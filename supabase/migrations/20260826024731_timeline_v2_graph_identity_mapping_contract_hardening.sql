-- Mirrors already-applied live migration 20260826024731.
-- Repository synchronization only. Do not apply this migration to the current live sandbox.
-- Identity confirmation remains distinct from Timeline release and Graph consumption.

CREATE OR REPLACE VIEW public.timeline_v2_graph_identity_state_v1
WITH (security_invoker = true)
AS
SELECT
  m.id AS mapping_candidate_id,
  m.timeline_candidate_id,
  m.timeline_event_id,
  m.graph_node_id,
  m.proposal_method,
  m.candidate_revision_timestamp,
  m.graph_node_revision_timestamp,
  m.proposal_fingerprint_hash,
  m.proposal_basis,
  m.created_at AS proposed_at,
  a.id AS mapping_audit_id,
  a.audit_outcome,
  a.independent_provenance,
  a.audit_method_version,
  a.structured_judgment,
  a.audited_at,
  tc.candidate_updated_at = m.candidate_revision_timestamp AS current_candidate_revision,
  n.updated_at = m.graph_node_revision_timestamp AS current_graph_node_revision,
  CASE
    WHEN tc.candidate_updated_at <> m.candidate_revision_timestamp THEN 'stale_candidate_revision'
    WHEN n.updated_at <> m.graph_node_revision_timestamp THEN 'stale_graph_node_revision'
    WHEN a.audit_outcome = 'confirmed_same_event' THEN 'confirmed_current'
    WHEN a.audit_outcome = 'rejected_not_same_event' THEN 'rejected_current'
    WHEN a.audit_outcome = 'undetermined' THEN 'undetermined_current'
    ELSE 'pending_audit_current'
  END AS mapping_state,
  tc.candidate_updated_at = m.candidate_revision_timestamp
    AND n.updated_at = m.graph_node_revision_timestamp
    AND a.audit_outcome = 'confirmed_same_event'
    AS explicit_event_graph_identity_mapping_exists
FROM public.timeline_v2_graph_identity_candidates m
JOIN public.timeline_placement_candidates tc ON tc.id = m.timeline_candidate_id
JOIN public.nodes n ON n.id = m.graph_node_id
LEFT JOIN public.timeline_v2_graph_identity_audits a ON a.mapping_candidate_id = m.id;

CREATE OR REPLACE VIEW public.timeline_v2_graph_consumption_contract_v1
WITH (security_invoker = true)
AS
WITH confirmed_identity AS (
  SELECT DISTINCT ON (s.timeline_candidate_id)
    s.timeline_candidate_id,
    s.mapping_candidate_id,
    s.mapping_audit_id,
    s.graph_node_id,
    s.proposal_fingerprint_hash AS identity_proposal_fingerprint_hash,
    s.audit_method_version AS identity_audit_method_version,
    s.audited_at AS identity_audited_at,
    s.mapping_state
  FROM public.timeline_v2_graph_identity_state_v1 s
  WHERE s.mapping_state = 'confirmed_current'
  ORDER BY s.timeline_candidate_id, s.audited_at DESC NULLS LAST, s.mapping_candidate_id
),
gate AS (
  SELECT
    g.gating_version,
    g.required_status_code,
    g.requires_exact_candidate_evidence_audit_release_ids,
    g.requires_noninvalidated_lineage,
    g.requires_event_graph_identity_mapping,
    g.requires_versioned_gated_projection,
    g.requires_edge_specific_relationship_provenance,
    g.graph_consumption_enabled,
    g.created_at
  FROM public.timeline_v2_graph_gating_contract_v1 g
  LIMIT 1
)
SELECT
  p.status_contract_version,
  g.gating_version,
  p.timeline_candidate_id,
  p.event_id AS timeline_event_id,
  ci.graph_node_id,
  ci.mapping_candidate_id,
  ci.mapping_audit_id,
  ci.identity_proposal_fingerprint_hash,
  ci.identity_audit_method_version,
  ci.identity_audited_at,
  p.status_code,
  p.visibility_state,
  p.public_timeline_visibility,
  p.graph_context_eligibility,
  p.graph_edge_support_eligibility,
  p.audit_id AS timeline_audit_id,
  p.audited_score_id,
  p.release_policy_model_version,
  p.invalidated_at,
  ci.graph_node_id IS NOT NULL AS explicit_event_graph_identity_mapping_exists,
  g.graph_consumption_enabled
    AND p.status_code = g.required_status_code
    AND ci.graph_node_id IS NOT NULL
    AND p.audit_outcome = 'correct'
    AND p.invalidated_at IS NULL
    AS graph_timeline_overlay_eligible,
  g.graph_consumption_enabled
    AND p.status_code = g.required_status_code
    AND ci.graph_node_id IS NOT NULL
    AND p.audit_outcome = 'correct'
    AND p.invalidated_at IS NULL
    AND g.requires_edge_specific_relationship_provenance
    AS graph_edge_support_possible_with_separate_relationship_provenan,
  CASE
    WHEN NOT g.graph_consumption_enabled THEN 'graph_consumption_disabled'
    WHEN p.status_code <> g.required_status_code THEN 'timeline_status_not_release_qualified'
    WHEN ci.graph_node_id IS NULL THEN 'missing_confirmed_event_graph_identity_mapping'
    WHEN p.audit_outcome IS DISTINCT FROM 'correct' THEN 'timeline_audit_not_correct'
    WHEN p.invalidated_at IS NOT NULL THEN 'timeline_candidate_invalidated'
    ELSE 'timeline_graph_floor_ready_subject_to_graph_specific_provenance'
  END AS graph_floor_state
FROM public.timeline_v2_internal_status_projection_v1 p
CROSS JOIN gate g
LEFT JOIN confirmed_identity ci ON ci.timeline_candidate_id = p.timeline_candidate_id;

REVOKE ALL ON TABLE public.timeline_v2_graph_identity_candidates FROM service_role;
REVOKE ALL ON TABLE public.timeline_v2_graph_identity_audits FROM service_role;
REVOKE ALL ON TABLE public.timeline_v2_graph_identity_state_v1 FROM service_role;
REVOKE ALL ON TABLE public.timeline_v2_graph_consumption_contract_v1 FROM service_role;

GRANT SELECT, INSERT ON TABLE public.timeline_v2_graph_identity_candidates TO service_role;
GRANT SELECT, INSERT ON TABLE public.timeline_v2_graph_identity_audits TO service_role;
GRANT SELECT ON TABLE public.timeline_v2_graph_identity_state_v1 TO service_role;
GRANT SELECT ON TABLE public.timeline_v2_graph_consumption_contract_v1 TO service_role;

REVOKE ALL ON TABLE public.timeline_v2_graph_identity_candidates FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.timeline_v2_graph_identity_audits FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.timeline_v2_graph_identity_state_v1 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.timeline_v2_graph_consumption_contract_v1 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_timeline_v2_graph_identity_candidate() FROM PUBLIC, anon, authenticated;
