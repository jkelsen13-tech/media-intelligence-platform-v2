# R5 — Cross-Surface Semantic Consistency (Canonical Source-of-Truth Contract)
#
## Scope (docs + tests only)
This document defines, for each launch-critical shared object family that exists in this repo today, the canonical source-of-truth path for identity and the canonical semantics for the shared fields. It is evidence packaging only (no refactors, no product behavior changes).

## Field semantics indexing convention
For each object family below, answers correspond to the governing spec §5 questions (seven questions).

### Object family A — Investigation Context (IC) + selection identity
1) **Canonical identity source for identity**
   - `src/lib/investigationContext.js` defines the canonical IC fields via:
     - `INVESTIGATION_CONTEXT_FIELDS`
     - `applySubject()` and the subject resolution helpers:
       - `subjectFromWorldViewSelection()`
       - `subjectFromGraphNode()`
       - `subjectFromNamedTarget()`
2) **Canonical fields vs derived**
   - Canonical (stored in IC): `canonical_subject_type`, `canonical_subject_id`, `parent_event_id`, `as_of_time`, `selected_time_range`, `active_view`, `temporal_assessment_reference`.
   - Derived in IC presentation: `temporal_assessment_reference` is computed by `temporalAssessmentReferenceFor(canonicalEventId)` in the same module, and is not recomputed from page-specific news content.
3) **Which derived fields may be recomputed independently**
   - `active_view` may be recomputed/updated as it is explicitly handled by `setInvestigationActiveView()` and is not entangled with identity.
4) **Which fields require release/provenance lineage**
   - `as_of_time`, `selected_time_range`, and `temporal_assessment_reference` are tied to the shared display-time contract and must not be recomputed from unrelated surfaces (see `src/lib/investigationContext.js` + `src/lib/temporalAssessment.js`).
5) **Which layer owns public disclosure / generalization**
   - IC is client-side state only; any disclosure gating for joined content is owned by the downstream read paths (join-state classification and read eligibility predicates).
6) **Invalidates / versions downstream projections**
   - A new-subject select is a single commit path (`src/lib/newSubjectPropagation.js commitNewSubject()`), which clears invalid prior-subject sub-selections (`INVALID_SUBSELECTIONS_ON_NEW_SUBJECT`) and preserves compatible preferences.
7) **When two pipelines disagree**
   - Not implemented as a multi-pipeline reconciliation in this repo for IC fields; reconciliation happens at join-state classification time (fallback to parent IC rather than inventing).

### Object family B — Deep links (hash → canonical subject + view)
1) **Canonical identity source**
   - `src/lib/deepLinks.js parseDeepLink()` extracts ids and never derives identity from display text (`canonicalSubjectIdFromDisplayText`).
   - `reconstructFromDeepLink()` commits identity using `commitNewSubject()` only.
2) **Canonical fields vs derived**
   - Identity fields are canonical: the parsed hash `subjectId` and selection params.
   - View slug mapping is deterministic (`DEEP_LINK_SLUG_TO_VIEW`).
3) **Independently recomputable derived fields**
   - Serialization formatting: `formatTimeQuery` and `parseTimeQuery` are deterministic and recomputable.
4) **Fields requiring provenance lineage**
   - None; deep links carry ids only. Disclosure gating is downstream.
5) **Layer owning public disclosure / generalization**
   - Deep links do not generalize; they route to the view with ids and selections.
6) **Invalidation / versioning**
   - Unsupported / unknown view slugs are fail-closed and do not create a new subject. This is encoded by returning `unknownView` and adding a fallback disclosure entry.
7) **Disagreement**
   - Canonical identity always comes from ids. Display text is explicitly ignored.

### Object family C — Events (graph node events; timeline identity)
1) **Canonical identity source**
   - Canonical event identity for IC: `canonical_subject_id` is derived via `subjectFromGraphNode()` for graph selections and seeded from World View projection via `subjectFromWorldViewSelection()` (`subject_graph_node_id`).
   - Timeline event node loading uses `src/lib/supabase.js loadTimeline()` which reads `nodes` where `type='event'` and then canonicalizes mirror nodes via `src/lib/timelineDedup.js canonicalizeTimelineEvents()`.
2) **Canonical fields vs derived**
   - Canonical identity: node `id` / slug used for the mapping.
   - Event timing fields used in UI are derived from:
     - `loadTimeline()` (for event cards)
     - `temporalAssessment` (for assessment and copy)
3) **Recomputable derived fields**
   - Mirror dedup mapping is recomputable from loaded nodes via `canonicalizeTimelineEvents()`.
4) **Fields requiring release/provenance lineage**
   - Temporal assessment verdict/copy is pinned to a composer digest from `pipeline_config` (`src/lib/temporalAssessment.js`).
5) **Disclosure/generalization owner**
   - Timeline display is owned by `src/views/TimelineView.jsx` + `src/lib/timelineEngine.js`; it does not recompute evidence/provenance from independent sources.
6) **Invalidation / versions downstream**
   - Staleness marking for joined views uses the shared “existing markers only” contract in `src/lib/investigationJoinState.js freshnessFromExistingMarkers()`.
7) **When pipelines disagree**
   - Timeline mirror dedup always picks canonical event nodes based on the suffix rule; disagreement does not become a new identity.

### Object family D — Story arcs
1) **Canonical identity source**
   - Arc rows come from `story_arcs` + arc detail from `arc_events` and `arc_milestones_public`:
     - `src/lib/supabase.js loadArcs()`
     - `src/lib/supabase.js loadArcDetail()`
2) **Canonical fields vs derived**
   - Fields that may be absent / id-only stub:
     - `loadArcs()` explicitly sets `title: null` for stub rows and derives `derived_status` via `deriveArcStatus()` from arc events and milestones.
   - Derived fields: `derived_status` in `loadArcs()`.
3) **Recomputable derived fields**
   - `derived_status` is recomputable from arc events and milestones using `deriveArcStatus()`.
4) **Fields requiring release/provenance lineage**
   - Derived status is tied to public arc tables and milestone statuses; it does not claim private review states.
5) **Disclosure/generalization owner**
   - The Arcs screen renders arc derived status and timeline content (in-view).
6) **Invalidation**
   - Any changes to arc event or milestone rows naturally update the derived status on the next load.
7) **Disagreement**
   - UI does not reconcile “dual id sources” at a canonical-model level; instead it resolves both `id` and `slug` in `src/views/ArcsView.jsx`.

### Object family E — Entities / actors (graph nodes)
1) **Canonical identity source**
   - Graph nodes from `src/lib/supabase.js loadGraph()` are treated as canonical for identity across Graph and World View selection:
     - IC seeding via `subjectFromGraphNode()`.
2) **Canonical fields vs derived**
   - Canonical identity fields: node `id` / slug. Rendering category is derived in `src/lib/supabase.js loadNodeCategory()`.
3) **Recomputable derived fields**
   - Node-derived category and “best effort” source derivations are recomputable from graph edges and joined event nodes.
4) **Fields requiring lineage**
   - When sources are derived, the source list is a best-effort view of recorded citations (`loadSources` / `loadNodeArticles` / `loadActorDerivation`).
5) **Owner**
   - Graph and World View display layers own rendering; read paths own data access.
6) **Invalidation**
   - Join fallback behavior prevents invention (`src/lib/investigationJoinState.js`).
7) **Disagreement**
   - No centralized pipeline reconciliation is implemented; the UI falls back to empty / honest degradation.

### Object family F — Relationships / edges + edge-level provenance
1) **Canonical identity source**
   - Edge identity and endpoints come from graph edge reads:
     - `src/lib/supabase.js loadGraph()` and `loadWorldViewGraph()`
   - Provenance / meaning mapping uses `src/lib/relationshipProvenance.js buildRelationshipPanelView()`.
2) **Canonical fields vs derived**
   - Canonical edge semantics:
     - Relationship type meaning is derived directly from stored `edge.type` (causal vs sequence vs actor vs constrained_by).
     - Evidence strength presentation uses recorded `edge.doc_strength` only; RelationshipPanel never uses any derived source count as a strength signal (locked correction rule).
   - Derived: panel axes strings are derived from stored fields and eligibility outcomes.
3) **Recomputable derived fields**
   - Panel axes are recomputable from the same edge + explanation row.
4) **Fields requiring lineage**
   - Grounding excerpts and contradictions are taken from the explanation row when enabled and eligible (`src/lib/explanationReadPath.js` + `src/lib/explanationEligibility.js` + `src/lib/relationshipProvenance.js`).
5) **Disclosure/generalization owner**
   - RelationshipPanel owns disclosure wording for edge-level meaning and provenance status. The underlying eligibility predicate is owned by explanation read path.
6) **Invalidation**
   - Correction history and falsification condition updates are reflected via the explanation row fields selected in `loadExplanationReadView()`.
7) **Disagreement**
   - If an explanation row is missing, the edge record still renders. Missing provenance never erases or contradicts stored edge type.

### Object family G — Claims, explanations, evidence objects
1) **Canonical identity source**
   - Explanations are keyed by:
     - `explanations.id` and `explanations.assertion_id` in the read path.
   - Eligibility classification is done in `src/lib/explanationEligibility.js presentationFailureState()`.
2) **Canonical fields vs derived**
   - Canonical for eligibility:
     - `is_current`
     - `review_status`
     - `state` (failure states like ok, source_corrected, etc)
     - `supporting_passage`
     - `falsification_condition`
     - `archived_sources` missing state
   - Derived view objects: `partitionByEligibility()` outputs `{ eligible, excluded }` without mutating rows.
3) **Independently recomputable derived fields**
   - None of the eligibility failures are derived from anything else; they are driven by fields from the explanation row.
4) **Fields requiring lineage**
   - Eligibility depends on archived source missing states and explicit failure states; it therefore requires provenance lineage to be correct and is never inferred from absence.
5) **Owner**
   - Explanation read path owns gating and eligibility; relationship and other panels own disclosure copy.
6) **Invalidation / versioning**
   - Read path selects only `is_current = true` rows and never serves historical versions on the read path. Correction history is served where present.
7) **When pipelines disagree**
   - Disagreement resolves to explicit failure states rather than silent promotion:
     - e.g. `source_corrected` remains excluded until renewed human review.

### Object family H — Source Comparison projections (comparison_public view)
1) **Canonical identity source**
   - The Source Comparison UI reads only the narrow projection `public.comparison_public` and uses its `event_key` as its identity.
   - See `src/lib/sourceComparisonReadPath.js` (`loadSourceComparisonView()`).
2) **Canonical fields vs derived**
   - Canonical identity: `event_key`.
   - Derived in the read path:
     - normalized claim presentation objects
     - out/inclusive metrics (but not used to infer evidence strength beyond recorded claim evidence)
3) **Recomputable derived fields**
   - Presentation-level evidence strength computed from:
     - existence of primary evidence
     - independent outlet counts after syndication collapse
4) **Fields requiring release/provenance lineage**
   - Admission to the projection is controlled by DB-side membership validation state (the view definition in `supabase/migrations/20260821_v2_source_comparison_membership_gate.sql` gates pending / quarantined / approved membership).
5) **Owner of public disclosure/generalization**
   - The DB view defines the public boundary; the read path only formats it.
6) **Invalidation / versions**
   - If membership validation changes, the projection output changes on the next read; the client does not cache on an independent revision API.
7) **When pipelines disagree**
   - Source Comparison explicitly avoids unsupported independence claims:
     - independence labels are “unverified lineage not tracked” by design.

### Object family I — Legal & Policy records + evidence tracks
1) **Canonical identity source**
   - Legal/policy objects come from:
     - `p3_legal_case` and `p3_legal_case_evidence`
     - `p3_policy` and `p3_policy_track_event`
   - Read path builder functions:
     - `src/lib/phase3ReadPath.js buildCaseView()`
     - `src/lib/phase3ReadPath.js buildPolicyView()`
2) **Canonical fields vs derived**
   - Canonical for content:
     - case status and verdict fields are served as documented claims.
   - Derived:
     - track split order is derived from case/policy status.
3) **Recomputable derived fields**
   - track partitioning is recomputable from the case/policy row and evidence rows.
4) **Lineage/release fields**
   - Evidence rows carry explicit review status and authentication completeness metadata; markers for missing evidence are structurally distinct.
5) **Owner**
   - Phase3 read path owns the track split; Phase3View owns display copy.
6) **Invalidation**
   - Since it reads only current rows from the loader, it updates per next read.
7) **Disagreement**
   - No composite score reconciliation is computed; verdict language is preserved.

### Object family J — Provenance and revision objects (shared staleness markers)
1) **Canonical identity source**
   - Spatial projection revision identifiers:
     - `spatial_projection_v1.revision_id`, `revision_ordinal`, and supersession pointers.
   - Temporal assessment pinned key/value:
     - `pipeline_config.key` / `pipeline_config.value` guarded by composer digest.
   - Explanation version fields:
     - `explanations.version`, `recomputed_at`, `reviewed_at`, and `correction_history`.
2) **Canonical fields vs derived**
   - Revision coverage is derived (whether a given as-of time is covered), but the coverage logic uses recorded bounds and never invents history:
     - `src/lib/spatialProjection.js revisionCoverageAt()`
     - `src/lib/spatialProjection.js revisionAtTime()`
3) **Recomputable derived**
   - Any “as-of coverage” can be recomputed from revision markers.
4) **Fields requiring lineage**
   - Pinned temporal assessment and revision bounds require lineage and integrity checks.
5) **Owner**
   - World View owns freshness labeling; join-state staleness is labeled but never used as a new revision API.
6) **Invalidation**
   - Staleness invalidates only the derived presentation label; it does not create an alternate identity.
7) **Disagreement**
   - If revision marker coverage disagrees, presentation marks staleness explicitly.

### Object family K — Temporal assessment (shared temporal intelligence)
1) **Canonical identity source**
   - `src/lib/temporalAssessment.js` reads pinned assessment by:
     - `temporalAssessmentConfigKey(canonicalEventId)` which is `temporal.assessment.v0.1.<id>`.
2) **Canonical fields vs derived**
   - Canonical: the pinned `pipeline_config.value` (jsonb stored in the DB).
   - Derived: allowed display phrases and status are extracted via `temporalAssessmentViewFromValue()`.
3) **Recomputable derived**
   - Hash pinning and allowed-phrase extraction are recomputable from stored payload.
4) **Fields requiring lineage**
   - Composer digest pinning is required; payloads with digest mismatch fail closed to unavailable.
5) **Owner**
   - Temporal assessment module owns assessment copy eligibility and does not let other screens recompute it from other signals.
6) **Invalidation**
   - Assessment is keyed; changing the pipeline_config key/value changes assessment output.
7) **Disagreement**
   - No reconciliation is performed; it either pins to the allowed payload or fails closed to unavailable.

## Explicit drift risks recorded (no refactor in this run)
- Arc identity dual-source:
  - News arc badge uses `arc_id`, while Source Comparison uses `arc_slug`, while ArcsView resolves both by matching either `id` or `slug` (`src/views/NewsView.jsx`, `src/lib/sourceComparisonReadPath.js`, `src/views/ArcsView.jsx`).
- Comparison event navigation:
  - Source Comparison uses `event_key` identity while Timeline navigation uses `eventKey` / internal mapping (`src/lib/navigationContract.js`). This dual-key boundary is intentional but requires tests to prevent accidental display-text identity derivation.

