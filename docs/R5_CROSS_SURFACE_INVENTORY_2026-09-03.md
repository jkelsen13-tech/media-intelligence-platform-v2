# R5 — Cross-Surface Semantic Consistency (Inventory, docs + tests only)
#
## Scope / stop conditions (evidence packaging only)
This inventory is documentation and test evidence packaging only. It does **not** start the later R5 steps, and it does **not** change any product behavior.

Base repo stopping point referenced by this package: `main @ 4d2b46ff1cdb0130dc248f5b2e12550a89c83d85` (PR #13 squash-merged as described in the owner’s R4 closeout).

## Method (where this inventory is grounded)
All object-family identity and join statements below name concrete code paths and contracts in `src/lib/` plus view entry points in `src/views/` / `src/panels/`. Where a join path from the governing spec is not wired in this repo today, it is marked explicitly as **join not present** (no implication it passes).

## Launch-critical object families in this repo today
Legend for invariants: CS-01..CS-12 are the governing semantic consistency invariants from the owner spec appendix (this inventory maps which invariants this repo already encodes via specific helpers and read-path contracts).

### 1) Investigation Context (shared selection root)
- **Canonical identity / contract code:** `src/lib/investigationContext.js`
  - Canonical contract fields: `INVESTIGATION_CONTEXT_FIELDS`
  - Canonical subject identity functions: `applySubject`, `subjectFromWorldViewSelection`, `subjectFromGraphNode`, `subjectFromNamedTarget`
- **Primary surfaces that consume it:** every investigation-rooted view and overlay:
  - News / Graph / Timeline / Arcs / World View / Compare: wired through `src/App.jsx` via `commitNewSubject` and `setInvestigationActiveView`
- **Invariants covered:** CS-01, CS-07, CS-08, CS-09, CS-12
- **Why:** deep links and selections resolve through ids, not labels, and missing/unsupported joins fall back to parent investigation context rather than inventing a subject (`src/lib/investigationJoinState.js` + `src/lib/deepLinks.js`).

### 2) Deep links (id-only, cross-surface reconstruction)
- **Canonical identity / contract code:** `src/lib/deepLinks.js`
  - Id-only rule: `canonicalSubjectIdFromDisplayText()` returns `null`
  - Hash parsing: `parseDeepLink()`
  - Reconstruction: `reconstructFromDeepLink()` -> `commitNewSubject()`
  - Round-trip serialization: `serializeDeepLink()`
- **Invariants covered:** CS-01, CS-02, CS-07, CS-08

### 3) Join state taxonomy for empty / failure / stale / permission states
- **Canonical code:** `src/lib/investigationJoinState.js`
  - Join kinds: `JOIN_STATE_KINDS`
  - Copy + action: `JOIN_STATE_COPY`
  - Deterministic classification: `classifyJoinState()`
  - Staleness based on existing markers only: `freshnessFromExistingMarkers()`
  - Honest missing sub-selection fallback: `selectionFallbackDisclosure()`, `visibleJoinDisclosures()`
- **Invariants covered:** CS-03, CS-04, CS-11, CS-12

### 4) Events (graph node events; also serve as timeline identity)
- **Canonical identity / contract code:**
  - Graph selection identity: `src/lib/investigationContext.js` + `subjectFromGraphNode()`
  - Event membership / timeline event nodes: `src/lib/supabase.js` -> `loadTimeline()`, `canonicalizeTimelineEvents()`
  - Timeline dedup canonicalizes by suffix mirror rule: `src/lib/timelineDedup.js` (`canonicalizeTimelineEvents`)
- **Surfaces representing it:**
  - Graph: via `src/lib/supabase.js loadGraph()` nodes where `type` is used in views.
  - Timeline: `src/views/TimelineView.jsx` (timeline entries rooted at investigation context event / arc scope)
  - World View: projection-to-IC bridge seeds canonical event id from spatial projection rows (`src/lib/investigationContext.js subjectFromWorldViewSelection()`).
  - Arcs: events are used in the arc timeline tab within the Arcs screen (in-view timeline rendering).
  - Compare (Source Comparison beta): uses its own `event_key` but opens Timeline/Arcs through shared selection routes (`src/views/SourceComparisonView.jsx` + `src/lib/navigationContract.js` + `src/App.jsx`).
- **Invariants covered:** CS-01, CS-02, CS-03, CS-05, CS-07, CS-08, CS-09, CS-12

### 5) Story arcs (arc identity drives in-view timeline and downstream navigation)
- **Canonical identity / contract code:**
  - Arc listing: `src/lib/supabase.js loadArcs()`
  - Arc detail milestones + arc events: `src/lib/supabase.js loadArcDetail()`
  - Arc selection is an explicit new-subject commit: `src/lib/newSubjectPropagation.js resolveCanonicalSubject()` + `commitNewSubject()`
  - Arc screen resolution by both `id` and `slug`: `src/views/ArcsView.jsx` checks `a.id === focusArcId || a.slug === focusArcId`
  - Source Comparison passes `arc_slug` as arc id key: `src/lib/sourceComparisonReadPath.js` builds `arcLinks` with `arcId: article.arc_slug`
- **Surfaces representing it:**
  - Arcs screen (`src/views/ArcsView.jsx`)
  - In-view Timeline tab inside Arcs uses one shared timeline renderer: `src/components/ArcTimeline.jsx` + `src/lib/timelineEngine.js`
  - News: News arcs are opened from article arc badges (News->Arc join): `src/views/NewsView.jsx` passes `a.arc_id` into `onOpenArc`
  - Compare: Source Comparison opens arcs using `onOpenArc(l.arcId)` (gated by Source Comparison beta flag).
- **Invariants covered:** CS-01, CS-02, CS-06, CS-07, CS-12
- **Drift risk explicitly recorded (no refactor in this run):**
  - Arc identity key may be sourced as either `arc_id`/`id` or `arc_slug` depending on entry point.
  - Code paths involved:
    - News arc badge click uses `a.arc_id` (`src/views/NewsView.jsx`)
    - Source Comparison uses `article.arc_slug` (`src/lib/sourceComparisonReadPath.js` + `src/views/SourceComparisonView.jsx`)
    - ArcsView resolves both (`src/views/ArcsView.jsx`)
  - This is an intentional dual-resolution behavior in the current codebase; it is a drift risk for any future canonicalization.

### 6) Entities / actors (graph nodes; join semantics controlled by node type)
- **Canonical identity / contract code:** graph nodes resolved by `id`/`slug` and stored into investigation context via `subjectFromGraphNode()` (`src/lib/investigationContext.js`).
- **Surfaces representing it:**
  - Graph: nodes rendered from `src/lib/supabase.js loadGraph()` / `src/views/GraphView.jsx`.
  - World View: projection stub uses `subject_graph_node_id` mapping; non-event node type selections are represented as graph node selection stubs (World View app seam in `src/App.jsx`).
  - Join fallback behavior is controlled by `src/lib/investigationJoinState.js` `classifyJoinState()` and selection fallback logic.
- **Invariants covered:** CS-01, CS-03, CS-07, CS-12

### 7) Relationships / edges (graph edges + edge-level provenance)
- **Canonical identity / contract code:**
  - Graph edges fetched as stored edge records: `src/lib/supabase.js loadWorldViewGraph()` and `src/lib/supabase.js loadGraph()`
  - Meaning line and relationship semantics: `src/lib/relationshipProvenance.js buildRelationshipPanelView()`
    - Meaning is derived from `edge.type` (causal vs sequence) and plain label mapping is in `src/graph/theme.js`
  - Provenance gating: relationship panel withholds provenance when the provenance UI flag is not enabled (02B posture).
- **Surfaces representing it:**
  - Graph relationship panels: docked RelationshipPanel (read path of explanation objects + sources).
  - Timeline “connections” panel renders edge metadata text only (no cross-screen navigation contract).
- **Invariants covered:** CS-02, CS-03, CS-04, CS-06, CS-12

### 8) Places / spatial assertions (World View projection; MIP projection id is not canonical event id)
- **Canonical identity / contract code:** `src/lib/spatialProjection.js`
  - Projection table: `SPATIAL_PROJECTION_TABLE = 'spatial_projection_v1'`
  - Projection columns contract: `SPATIAL_PROJECTION_COLUMNS`
  - Canvas placement uses `plotDecision()`, does not invent geometry.
  - Identity bridging:
    - Investigation context seeded with canonical event id from projection rows: `src/lib/investigationContext.js subjectFromWorldViewSelection()`
    - Stub creation from a projection row: `selectionStubFromProjection()` (mip_object_id in inspector; subject_graph_node_id in IC).
- **Surfaces representing it:**
  - World View (Map + inspector and graph/map split)
  - Staleness and freshness for projections: revision markers inside `src/lib/spatialProjection.js revisionCoverageAt()` and join-state staleness uses existing markers only (`src/lib/investigationJoinState.js freshnessFromExistingMarkers()`).
- **Invariants covered:** CS-01, CS-03, CS-05, CS-09, CS-11, CS-12

### 9) Claims, explanations, evidence objects (provenance objects and read-path eligibility)
- **Canonical identity / contract code:**
  - Explanation read eligibility predicate: `src/lib/explanationEligibility.js presentationFailureState()`
  - Explanation read view wiring: `src/lib/explanationReadPath.js buildExplanationReadView()` and `loadExplanationReadView()`
  - Relationship panel maps stored explanation fields into a unified view model: `src/lib/relationshipProvenance.js`
- **Surfaces representing it:**
  - Graph relationship panel provenance.
  - News detail uses a security-barrier projection (`news_detail_public`) and shows reviewed claims only when eligible.
  - Source Comparison uses its own public projection and embeds explanation objects for those surfaces (gated behind Source Comparison beta).
  - Legal & Policy uses phase 3 evidence tracks (behind phase3 beta).
- **Invariants covered:** CS-02, CS-03, CS-04, CS-09, CS-12

### 10) Source Comparison candidates and released membership rows (comparison_public projection)
- **Canonical identity / contract code:** `src/lib/sourceComparisonReadPath.js` + the narrow DB projection definition in the applied migrations (comparison_public view).
  - Public boundary: `src/lib/sourceComparisonReadPath.js loadSourceComparisonView()` only reads `comparison_public`
  - Event projection identity: `event_key` returned by the view
  - Claim object assembly is done inside the read path (`buildClaimView()`, `buildEventView()`).
- **Surfaces representing it:**
  - Source Comparison view (`src/views/SourceComparisonView.jsx`)
  - The join outputs drive shared navigation using `src/App.jsx` arc and timeline open handlers.
- **Invariants covered:** CS-01, CS-02, CS-03, CS-06, CS-07, CS-10, CS-12
- **Join paths wired from this surface:**
  - Source Comparison -> Arc context: wired by `onOpenArc(l.arcId)` (`src/views/SourceComparisonView.jsx`)
  - Source Comparison -> Timeline context: wired by `onOpenTimeline({ eventKey: l.timelineKey, arcId: l.arcId })` when `l.timelineKey` exists (`src/views/SourceComparisonView.jsx`)
- **Join not present:** Source Comparison -> Graph relationship navigation exists only via explicitly opening Graph nodes (not part of CS-07 list as written).

### 11) Legal & Policy records (phase 3 view: p3 tables; evidence tracks and consequence navigation)
- **Canonical identity / contract code:** `src/lib/phase3ReadPath.js`
  - Policy loader: reads `p3_policy` and `p3_policy_track_event` and builds view model `buildPolicyView()`
  - Evidence loader: reads `p3_legal_case` and `p3_legal_case_evidence` and builds evidence tracks `buildCaseView()`
- **Surfaces representing it:**
  - Phase3View (`src/views/Phase3View.jsx`)
  - PolicyPanel consequence view uses graph-edge evidence and opens nodes via `onNavigate` -> `src/App.jsx handleNavigate()`
- **Invariants covered:** CS-01, CS-02, CS-03, CS-04, CS-06, CS-07, CS-12
- **Join not present (explicit):**
  - Legal & Policy -> curated related News / Arc / Source context is not wired as a direct cross-surface jump. PolicyPanel navigates to graph nodes and stays within the graph selection seam.

### 12) Provenance and revision objects (staleness markers, evidence versioning, correction history)
- **Canonical identity / contract code:**
  - Projection revision markers: `src/lib/spatialProjection.js` uses `revision_id`, `revision_ordinal`, `superseded_by_revision_id` and `revisionCoverageAt()`.
  - Temporal assessment version pinning: `src/lib/temporalAssessment.js loadTemporalAssessment()` reads `pipeline_config` key and pins composer digest.
  - Explanation versioning fields and correction history are served via explanation read path (`src/lib/explanationReadPath.js` selects `version`, `recomputed_at`, `correction_history`, etc).
- **Surfaces representing it:**
  - World View uses revision markers for projection freshness labeling and plots.
  - Evidence panels render correction history where present (RelationshipPanel view model).
  - Temporal assessment panels render only allowed copy derived from pinned assessment payload.
- **Invariants covered:** CS-03, CS-04, CS-11, CS-12

## Cross-surface navigation path inventory (spec CS-07)
The table below lists each spec CS-07 join path and whether it is wired in this repo today.

| CS-07 join path | Exists in this repo today? | Concrete code evidence |
|---|---|---|
| News -> Arc | **JOIN PRESENT** | News article arc badge click uses `onOpenArc?.(a.arc_id)` and App route commits `{type:'arc', id: arcKey}` (`src/views/NewsView.jsx`, `src/App.jsx` handlers `openArcInView`). |
| News -> Timeline event | **JOIN PRESENT (when timelineKey exists)** | NewsView uses `onOpenTimeline({ eventKey: timelineKey, arcId: expandedArcId })` gated by optional prop. Timeline key comes from `src/lib/supabase.js loadArticleTimelineKey()`. (`src/views/NewsView.jsx`, `src/lib/supabase.js`). |
| Arc -> Timeline event | **JOIN NOT PRESENT** | ArcsView renders timeline content in-place, and there is no cross-view handler prop `onOpenTimeline` wired from ArcsView to Timeline. (`src/views/ArcsView.jsx`, `src/components/ArcTimeline.jsx`, `src/lib/timelineEngine.js`). |
| Timeline -> Graph relationship | **JOIN NOT PRESENT (as cross-view navigation)** | Timeline connections panel renders edge metadata text only and does not call any graph open navigation handler. (`src/views/TimelineView.jsx`). |
| Graph -> evidence / provenance | **JOIN PRESENT** | RelationshipPanel and evidence/provenance are part of the Graph/inspector surface: `src/lib/relationshipProvenance.js buildRelationshipPanelView()` + `src/panels/RelationshipPanel.jsx` behavior. |
| Timeline or Graph -> Spatial / World View | **JOIN NOT PRESENT (as cross-view navigation)** | Geography lens inside Graph does not switch app view to World View; it focuses graph selection in-place. World View projection selection is handled inside World View via App’s projection-to-investigation seam (`src/App.jsx handleSelectProjection`). |
| World View -> selected-event inspector | **JOIN PRESENT** | Selecting a World View projection commits canonical investigation identity through `subjectFromWorldViewSelection()` in `src/lib/investigationContext.js` and `commitNewSubjectFromApp()` in `src/App.jsx`. |
| Source Comparison -> event / Arc context | **JOIN PRESENT (Arc + Timeline routes)** | SourceComparisonView triggers `onOpenArc(l.arcId)` and `onOpenTimeline({eventKey: l.timelineKey, arcId: l.arcId})` from projected member rows (`src/views/SourceComparisonView.jsx`, `src/lib/sourceComparisonReadPath.js`). |
| Legal & Policy -> curated related News/Arc/Source context | **JOIN NOT PRESENT (explicit)** | Phase3/PolicyPanel consequence navigation uses App’s graph node navigation (`onNavigate` -> `handleNavigate`), not direct jumps to News/Arc/Source Comparison surfaces (`src/panels/PolicyPanel.jsx`, `src/App.jsx`). |

## Inventory gaps intentionally recorded (to be repaired in later R5 steps)
- Arc -> Timeline event cross-view jump is not implemented as a separate navigation contract in this repo today.
- Timeline -> Graph relationship cross-view jump is not implemented as a navigation contract in this repo today.
- Timeline/Graph -> World View is not implemented as a click-equivalent cross-view jump (World View selection occurs within World View).
- Legal & Policy does not directly jump into News/Arc/Source Comparison surfaces; it navigates via graph node selection.

