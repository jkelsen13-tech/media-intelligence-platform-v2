-- Isolated v2 sandbox reconciliation only — 2026-08-18.
-- Source: Document 08, the Stage A manifest, and 00_INDEX.md.
-- Inserts only the six approved Stage C/D stated objectives; asserts no outcome,
-- score, causal/sequential Callais relationship, or unsupported source linkage.
-- Rollback:
--   DELETE FROM p3_policy_track_event WHERE method_version = 'p2025-track1-stageC-v1';
--   DELETE FROM p3_policy WHERE agency = 'DOJ' AND name LIKE 'P2025-T1-G%';

WITH seed (name, description, pages, source_passage, remaining_uncertainty) AS (
  VALUES
    ('P2025-T1-G2 — Review consent decrees and settlements in force',
     'Project 2025 Track 1 stated objective for DOJ Civil Rights Division enforcement posture. This record describes a source-stated objective only; it does not assert an execution outcome.',
     '557',
     'Review all consent decrees and settlement agreements currently in force.',
     'No actual-outcome status is asserted. A post-2025-01-20 primary source such as a court docket is required before a status-moving event can be added.'),
    ('P2025-T1-G3 — Seek termination of unnecessary or outdated consent decrees',
     'Project 2025 Track 1 stated objective for DOJ Civil Rights Division enforcement posture. This record describes a source-stated objective only; it does not assert an execution outcome.',
     '557',
     'Seek to terminate any unnecessary or outdated consent decree to which the United States is a party.',
     'No actual-outcome status is asserted. A post-2025-01-20 primary source such as a motion or court docket is required before a status-moving event can be added.'),
    ('P2025-T1-G4 — Consider intervention in long-running consent decrees',
     'Project 2025 Track 1 stated objective for DOJ Civil Rights Division enforcement posture. This record describes a source-stated objective only; it does not assert an execution outcome.',
     '557',
     'Consider pursuing intervention where consent decrees or settlement agreements continue to bind parties years or decades after the fact.',
     'No actual-outcome status is asserted. A post-2025-01-20 primary source such as a motion to intervene or court docket is required before a status-moving event can be added.'),
    ('P2025-T1-G5 — Prohibit third-party settlement payments',
     'Project 2025 Track 1 stated objective for DOJ Civil Rights Division enforcement posture. This record describes a source-stated objective only; it does not assert an execution outcome.',
     '557',
     'Enact policies and regulations prohibiting settlement payments to third parties.',
     'No actual-outcome status is asserted. A post-2025-01-20 Federal Register notice or DOJ policy issuance is required before a status-moving event can be added.'),
    ('P2025-T1-G7 — Reorganize and refocus the Civil Rights Division',
     'Project 2025 Track 1 stated objective for DOJ Civil Rights Division enforcement posture. This record describes a source-stated objective only; it does not assert an execution outcome.',
     '561-562',
     'Reorganize and refocus the Civil Rights Division; use first-year federal prosecutorial resources to investigate and prosecute covered discrimination claims.',
     'No actual-outcome status is asserted. Post-2025-01-20 DOJ Civil Rights Division filings, official reorganization announcements, or court dockets are required before a status-moving event can be added.'),
    ('P2025-T1-G8 — Reassign 18 U.S.C. 241 election-offense responsibility',
     'Project 2025 Track 1 stated objective for DOJ Civil Rights Division enforcement posture. This record describes a source-stated objective only; it does not assert an execution outcome.',
     '562',
     'Reassign responsibility for prosecuting 18 U.S.C. 241 election-related offenses from the Civil Rights Division to the Criminal Division.',
     'No actual-outcome status is asserted. A post-2025-01-20 DOJ organizational directive or case-filing division attribution is required before a status-moving event can be added.')
),
inserted_policies AS (
  INSERT INTO p3_policy (
    name, jurisdiction, instrument_type, description, review_status, agency, source_locator
  )
  SELECT
    s.name,
    'US Federal',
    'policy objective',
    s.description,
    'draft',
    'DOJ',
    jsonb_build_object(
      'chapter', 17,
      'chapter_title', 'Department of Justice',
      'pages', s.pages,
      'edition', '2023-04-21'
    )
  FROM seed AS s
  WHERE NOT EXISTS (SELECT 1 FROM p3_policy AS p WHERE p.name = s.name)
  RETURNING id, name
),
all_policies AS (
  SELECT id, name FROM inserted_policies
  UNION ALL
  SELECT p.id, p.name
  FROM p3_policy AS p
  JOIN seed AS s ON s.name = p.name
  WHERE NOT EXISTS (SELECT 1 FROM inserted_policies AS ip WHERE ip.name = p.name)
),
inserted_events AS (
  INSERT INTO p3_policy_track_event (
    policy_id, track, state, event_date, source_passage, method_version,
    remaining_uncertainty, missing_evidence, review_status
  )
  SELECT
    p.id,
    'stated_objective',
    'stated_objective',
    DATE '2023-04-21',
    s.source_passage,
    'p2025-track1-stageC-v1',
    s.remaining_uncertainty,
    false,
    'draft'
  FROM seed AS s
  JOIN all_policies AS p ON p.name = s.name
  WHERE NOT EXISTS (
    SELECT 1
    FROM p3_policy_track_event AS e
    WHERE e.policy_id = p.id
      AND e.track = 'stated_objective'
      AND e.method_version = 'p2025-track1-stageC-v1'
  )
  RETURNING id
)
SELECT
  (SELECT count(*)::int FROM p3_policy WHERE agency = 'DOJ' AND name LIKE 'P2025-T1-G%') AS p2025_policy_count,
  (SELECT count(*)::int FROM p3_policy_track_event WHERE method_version = 'p2025-track1-stageC-v1') AS p2025_stated_objective_count,
  (SELECT count(*)::int FROM inserted_policies) AS policies_inserted_now,
  (SELECT count(*)::int FROM inserted_events) AS events_inserted_now
LIMIT 1;
