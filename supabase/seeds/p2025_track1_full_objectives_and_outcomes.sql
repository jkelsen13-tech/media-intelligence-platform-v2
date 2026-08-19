-- Isolated v2 only — Project 2025 Track 1 full-objective and outcome expansion.
-- Manifest: p2025-track1-stageE-v1
-- Scope: all eight verified Chapter 17 Track 1 objectives, plus source-limited
-- post-2025-01-20 outcome records. No causal attribution, completion score,
-- universal implementation claim, or negative inference from missing evidence.

BEGIN;

WITH missing_objectives (name, description, pages, source_passage, remaining_uncertainty) AS (
  VALUES
    (
      'P2025-T1-G1 — Review policies, investigations, and cases',
      'Project 2025 Track 1 stated objective for DOJ Civil Rights Division enforcement posture. This record describes a source-stated objective only; it does not assert an execution outcome.',
      '556-557',
      'Conduct a thorough review of all publicly available policies, investigations, and cases; prepare a plan to end any contrary to law or Administration policies.',
      'The planned review may leave no public artifact. No status-moving outcome is inferred from the absence of a public record.'
    ),
    (
      'P2025-T1-G6 — Lead a whole-of-government nondiscrimination initiative',
      'Project 2025 Track 1 stated objective for DOJ Civil Rights Division enforcement posture. This record describes a source-stated objective only; it does not assert an execution outcome.',
      '561',
      'DOJ spearheads a whole-of-government nondiscrimination initiative, coordinating with EEOC, DoD, Education, HUD, and SEC; enforce nondiscrimination requirements on federal contractors.',
      'The stated objective is diffuse across agencies. No public status-moving outcome is inferred without a bounded, primary-source DOJ record.'
    )
),
inserted_policies AS (
  INSERT INTO public.p3_policy (name, jurisdiction, instrument_type, description, review_status, agency, source_locator)
  SELECT
    m.name, 'US Federal', 'policy objective', m.description, 'draft', 'DOJ',
    jsonb_build_object('chapter', 17, 'chapter_title', 'Department of Justice', 'pages', m.pages, 'edition', '2023-04-21')
  FROM missing_objectives m
  WHERE NOT EXISTS (SELECT 1 FROM public.p3_policy p WHERE p.name = m.name)
  RETURNING id, name
),
all_missing_policies AS (
  SELECT id, name FROM inserted_policies
  UNION ALL
  SELECT p.id, p.name FROM public.p3_policy p JOIN missing_objectives m ON m.name = p.name
  WHERE NOT EXISTS (SELECT 1 FROM inserted_policies i WHERE i.name = p.name)
)
INSERT INTO public.p3_policy_track_event (
  policy_id, track, state, event_date, source_passage, method_version,
  remaining_uncertainty, missing_evidence, review_status, source_locator
)
SELECT
  p.id, 'stated_objective', 'stated_objective', DATE '2023-04-21',
  m.source_passage, 'p2025-track1-stageC-v1', m.remaining_uncertainty,
  false, 'draft', jsonb_build_object('chapter', 17, 'chapter_title', 'Department of Justice', 'pages', m.pages, 'edition', '2023-04-21')
FROM missing_objectives m
JOIN all_missing_policies p ON p.name = m.name
WHERE NOT EXISTS (
  SELECT 1 FROM public.p3_policy_track_event e
  WHERE e.policy_id = p.id AND e.track = 'stated_objective' AND e.method_version = 'p2025-track1-stageC-v1'
);

WITH outcome_rows (
  policy_name, state, event_date, source_url, source_node_slug, source_passage,
  remaining_uncertainty, missing_evidence
) AS (
  VALUES
    (
      'P2025-T1-G1 — Review policies, investigations, and cases',
      'outcome_evidence_not_identified', DATE '2026-08-19', NULL, NULL,
      'No bounded, post-2025-01-20 primary-source outcome record was identified in this tracker batch.',
      'This is an evidence-gap marker, not a conclusion that the stated review did not occur or had no effect.', true
    ),
    (
      'P2025-T1-G2 — Review consent decrees and settlements in force',
      'documented_related_action', DATE '2025-05-21',
      'https://www.justice.gov/opa/pr/us-department-justices-civil-rights-division-dismisses-biden-era-police-investigations-and',
      'evt-p2025-doj-louisville-minneapolis-20250521',
      'DOJ stated that its Civil Rights Division was beginning dismissal steps for the Louisville and Minneapolis lawsuits and closing specified investigations.',
      'This named action is related to consent-decree and investigation posture. It does not establish a comprehensive review of all consent decrees and settlements in force.', false
    ),
    (
      'P2025-T1-G3 — Seek termination of unnecessary or outdated consent decrees',
      'documented_termination_support', DATE '2025-07-23',
      'https://www.justice.gov/opa/pr/justice-department-supports-seattles-motion-terminate-police-department-consent-decree',
      'evt-p2025-seattle-decree-response-20250723',
      'DOJ stated that its Civil Rights Division filed a response supporting Seattle’s motion to terminate the police-department consent decree.',
      'This documents support for a named motion, not a court termination or a general outcome for other decrees.', false
    ),
    (
      'P2025-T1-G3 — Seek termination of unnecessary or outdated consent decrees',
      'documented_court_termination', DATE '2025-08-13',
      'https://www.justice.gov/opa/pr/federal-court-grants-justice-departments-motion-terminate-47-year-old-consent-decree',
      'evt-p2025-norfolk-decree-termination-20250813',
      'DOJ stated that the Eastern District of Virginia granted its motion to terminate the 1978 Norfolk consent decree governing police and firefighter employment.',
      'This documents the named Norfolk court action; it does not establish a general result for other consent decrees.', false
    ),
    (
      'P2025-T1-G4 — Consider intervention in long-running consent decrees',
      'outcome_evidence_not_identified', DATE '2026-08-19', NULL, NULL,
      'No bounded, post-2025-01-20 primary-source intervention record was identified in this tracker batch.',
      'This is an evidence-gap marker, not a conclusion that intervention was not considered or pursued.', true
    ),
    (
      'P2025-T1-G5 — Prohibit third-party settlement payments',
      'documented_policy_action', DATE '2025-02-05',
      'https://www.justice.gov/ag/media/1388536/dl?inline',
      'evt-p2025-third-party-settlement-policy-20250205',
      'The Attorney General’s memorandum rescinded the May 5, 2022 and July 28, 2023 memoranda concerning payments to non-governmental third parties and directed a report on strategies and measures concerning improper payments.',
      'The memorandum establishes the stated rescissions and direction; it does not establish the effectiveness, completion, or universal application of the requested follow-on measures.', false
    ),
    (
      'P2025-T1-G6 — Lead a whole-of-government nondiscrimination initiative',
      'outcome_evidence_not_identified', DATE '2026-08-19', NULL, NULL,
      'No bounded, post-2025-01-20 primary-source interagency outcome record was identified in this tracker batch.',
      'This is an evidence-gap marker, not a conclusion that the diffuse cross-agency initiative did not occur.', true
    ),
    (
      'P2025-T1-G7 — Reorganize and refocus the Civil Rights Division',
      'outcome_evidence_not_identified', DATE '2026-08-19', NULL, NULL,
      'No bounded, post-2025-01-20 primary-source Civil Rights Division reorganization record was identified in this tracker batch.',
      'Named Civil Rights Division actions are tracked elsewhere, but they do not by themselves establish the stated reorganization or a comprehensive refocusing outcome.', true
    ),
    (
      'P2025-T1-G8 — Reassign 18 U.S.C. 241 election-offense responsibility',
      'outcome_evidence_not_identified', DATE '2026-08-19', NULL, NULL,
      'No bounded, post-2025-01-20 DOJ organizational directive or case-filing division attribution establishing the stated reassignment was identified in this tracker batch.',
      'This is an evidence-gap marker, not a conclusion that the reassignment did not occur. The public Civil Rights Division materials located in this check continue to list Section 241 among Criminal Section statutes.', true
    )
),
resolved_outcomes AS (
  SELECT
    p.id AS policy_id, r.state, r.event_date, r.source_url, r.source_node_slug,
    r.source_passage, r.remaining_uncertainty, r.missing_evidence
  FROM outcome_rows r
  JOIN public.p3_policy p ON p.name = r.policy_name
),
inserted_outcomes AS (
  INSERT INTO public.p3_policy_track_event (
    policy_id, track, state, event_date, source_id, source_passage, method_version,
    remaining_uncertainty, missing_evidence, review_status, source_locator
  )
  SELECT
    r.policy_id, 'actual_outcome', r.state, r.event_date,
    CASE WHEN r.source_url IS NULL THEN NULL
      ELSE (
        SELECT s.id FROM public.sources s
        JOIN public.nodes n ON n.id = s.node_id
        WHERE s.url = r.source_url AND n.slug = r.source_node_slug
        ORDER BY s.created_at DESC
        LIMIT 1
      )
    END,
    r.source_passage, 'p2025-track1-stageE-v1', r.remaining_uncertainty,
    r.missing_evidence, 'draft',
    CASE WHEN r.source_url IS NULL
      THEN jsonb_build_object('source_type', 'evidence_gap_marker', 'checked_on', '2026-08-19')
      ELSE jsonb_build_object('url', r.source_url, 'source_type', 'primary_doj_record', 'scope', 'source_limited')
    END
  FROM resolved_outcomes r
  WHERE NOT EXISTS (
    SELECT 1 FROM public.p3_policy_track_event e
    WHERE e.policy_id = r.policy_id AND e.track = 'actual_outcome'
      AND e.state = r.state AND e.event_date = r.event_date
      AND e.method_version = 'p2025-track1-stageE-v1'
  )
  RETURNING id
)
SELECT
  (SELECT count(*)::int FROM public.p3_policy WHERE agency = 'DOJ' AND name LIKE 'P2025-T1-G%') AS p2025_policy_count,
  (SELECT count(*)::int FROM public.p3_policy_track_event WHERE method_version = 'p2025-track1-stageC-v1') AS stated_objective_count,
  (SELECT count(*)::int FROM public.p3_policy_track_event WHERE method_version = 'p2025-track1-stageE-v1') AS outcome_or_marker_count,
  (SELECT count(*)::int FROM inserted_outcomes) AS outcomes_inserted_now
LIMIT 1;

COMMIT;
