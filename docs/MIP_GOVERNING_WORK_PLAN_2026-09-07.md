# Governing work plan — owner supplied, 7 September 2026

Source: MIP_Astra_Extra_High_Work_Plan_No_Fee_World_View_2026-09-07.docx.
The owner explicitly superseded the earlier work plan with this attachment.
Text below preserves the document's paragraph order, including its execution prompt.
Formatting and tables have been flattened; the original DOCX remains the visual source.
Historical status statements in the attachment are not current implementation claims.
See [reconciliation and batch status](NO_FEE_WORLD_VIEW_BACKFILL_2026-09-07.md).

---

MIP | Astra 6 Extra High Work Plan

Updated 7 September 2026 | Evidence-first campaigns + no-fee World View launch candidates

Goal: MIP organizes an ongoing investigation around a question and shows what the evidence supports, what changed and what remains unresolved. Use Extra High reasoning for lasting architectural value across the evidence core and shared investigation experience. The next few days are a working sequence, not a promise that every feature will ship within that window.

Revision note: The original three campaigns, six accepted additions and Question / Evidence / Change framework remain in place. The new no-fee World View extension begins after the original plan. It adds 12 bounded work packages, source/license references and an execution prompt; it does not claim those features are deployed.

Recommended Allocation

Share

Focus

50%

Algorithm and evidence architecture

30%

Algorithm → World View integration

20%

Globe navigation, rendering, and verification

Global Working Rules

Inspect first. Do not mutate until the relevant architecture, tests, current behavior, and constraints are understood.

Work on a dedicated branch. Do not merge to main without explicit authorization.

For every discovered weakness, identify the underlying invariant that should prevent the entire class of failure.

Convert discovered failure modes into permanent regression or adversarial tests.

Run the full relevant test/build suite after meaningful changes.

Prefer architectural fixes over symptom-by-symptom patches.

Preserve provenance, evidence independence, and confidence semantics across every downstream surface.

Stop and report when a required assumption cannot be proven, a migration is destructive, or the requested behavior conflicts with an existing safety/permission boundary.

Additional constraint: No paid licenses, new paid APIs or paid trials. Use commercial-compatible public-domain or permissively licensed components, preserve required notices and review data/service terms separately. Existing privacy, publication and merge gates remain in force.

Campaign 1  |  Algorithmic Core

Use: Astra 6 Extra High  |  Highest priority

Deep-audit and improve the evidence machinery before scaling downstream intelligence. Focus on claim meaning, source lineage, independent corroboration, graph revision, temporal reasoning, confidence propagation, and historical backfilling. Include disconfirming-evidence retrieval and identification of conclusions that depend on a single underlying source.

Copy/paste prompt

Perform a deep algorithmic audit of MIP as an evidence-first intelligence system.Before changing code:1. Read the relevant repository architecture, algorithm research, tests, schemas, provenance rules, confidence semantics, and current implementation.2. Reconstruct the intended end-to-end evidence flow.3. Identify semantic and architectural failure modes, not only code bugs.4. Prove each important weakness with concrete counterexamples or reproducible cases before proposing a fix.Audit especially:- claim equivalence and contradiction handling- numeric/entity/date distinctions that must not collapse into one claim- source lineage, rewrites, syndication, and copy-derived reporting- independent corroboration versus duplicated evidence- confidence propagation and double-counting- graph edge creation/revision/removal- late-arriving historical evidence and backfilling- temporal sequencing and causal inference boundaries- how new evidence should cause old connections to be reconsidered- interactions among all algorithms rather than treating them as isolated modulesFor every confirmed failure:- identify the invariant that should prevent the entire class of failure- implement the smallest architecture-consistent fix- add adversarial/regression tests- verify no downstream confidence or provenance semantics are weakenedWork branch-first. Run the full relevant test suite and build. Do not merge to main. Return:A. findings ranked by severityB. implemented changesC. new invariants/testsD. unresolved risksE. recommended next campaign.Apply the expanded implementation scope at the end of this plan. Add deliberate retrieval of corrections, incompatible dates/entities and primary counter-evidence. Test source-dependency sensitivity without inferring real-world causation. Prepare shared versioned records for change briefings, follow-up tracking, competing explanations, lineage, institution histories and evidence gaps.

Campaign 2  |  Algorithm → World View

Once the core evidence model is trustworthy, connect it cleanly to the spatial experience so the globe becomes a visualization of the same intelligence system rather than a separate feature. Begin with change briefings and promise-to-outcome tracking once their shared evidence contracts are ready; use the expanded scope and acceptance criteria at the end of this plan.

Copy/paste prompt

Integrate MIP's evidence/graph intelligence into the World View as one coherent system.Start by reading the current algorithmic pipeline, graph model, spatial runtime/projection code, World View implementation, timeline synchronization, provenance/context surfaces, and relevant tests.Do not begin with visual polish. First define and verify the data contract between evidence intelligence and the World View.Determine:- which events, entities, claims, and relationships should become spatial objects- how geographic relationships and cross-region connections are represented- how confidence, provenance, and evidence independence survive spatial projection- how late-arriving evidence and graph backfills update already-rendered spatial relationships- how revised or invalidated edges are updated or removed- how selection stays synchronized across World View, Graph, Timeline, and provenance/context- how clustering/decluttering should preserve meaning at different zoom levels- how connection density scales without turning the globe into visual spaghettiFor every design choice, establish an invariant and test it. Avoid duplicating intelligence logic inside the frontend if the authoritative decision belongs in the backend.Implement the architecture-consistent integration on a dedicated branch, run all relevant tests/builds, and add integration tests for backfill, revision, synchronization, and provenance behavior.Do not merge to main. Return:A. final data-flow architectureB. implementation summaryC. tests/invariants addedD. known scaling or UX risksE. exact remaining World View work.Integrate the accepted features progressively: change briefings/evidence impact first, then promise-to-outcome tracking, competing explanations, information lineage, institution histories and collection-aware gaps. Reuse Investigation Context and exact assessment versions. A selection must open the supporting evidence and the relevant graph/timeline/spatial state. A feature may advance when its own prerequisites are proven; do not wait for every algorithm to be complete.

Campaign 3  |  Globe Navigation & Spatial UX

Use Extra High only for the hard Cesium/system-level problems. Routine CSS, labels, and straightforward polish can be delegated to a faster model after the correct behavioral model is established.

Copy/paste prompt

Audit and improve MIP World View navigation, spatial rendering, and scale behavior.Treat this as a systems problem, not a sequence of isolated camera bug fixes.First inspect:- Cesium configuration and camera controls- current navigation invariants- altitude/zoom behavior- terrain/imagery behavior- connection rendering- clustering/decluttering- selection synchronization- performance constraints- previous navigation fixes and regression testsDefine the intended navigation model before patching symptoms. Establish invariants for:- continuous/infinite-feeling navigation where intended- stable camera restore behavior- predictable heading/pitch/altitude interactions- safe minimum/maximum altitude handling- no accidental camera jumps or hidden state corruption- readable connection rendering across zoom levels- consistent selection across World View, Graph, Timeline, and context panels- graceful degradation under large node/edge countsFor each bug found, ask: what invariant should make this entire class of bug impossible?Implement on a dedicated branch. Add regression tests wherever feasible. Run the complete relevant suite and build. Perform visual/runtime verification of the live-equivalent build.Do not merge to main. Return:A. navigation model/invariantsB. fixes madeC. tests addedD. performance findingsE. remaining issues that require manual visual approval.

Stop Gate Before Every Merge

Architecture and behavior match MIP's intended evidence-first design.

No provenance/confidence semantics were silently changed.

Adversarial and regression tests cover newly discovered failure modes.

Full relevant tests and build are green.

Visible changes are verified in a representative build before merge and directly on the deployed live page after they land.

Diff is reviewed and the branch summary explains exactly what changed and why.

After review, obtain merge authorization unless the owner has already explicitly authorized that merge.

Next Few Days  |  Order of Operations

Verify the existing Codex/remote session and authenticated read/write access to the existing MIP repository. Do not repeat setup that is already complete.

Refresh current main, preserve unrelated work and create a dedicated working branch.

Verify tests/builds in temporary remote or agent storage. Never use the owner’s physical device as MIP project storage unless explicitly requested.

Continue Campaign 1 from verified current state; review and integrate the prepared context-aware proposal package before building its dependent live adapters.

Review each bounded implementation and its evidence. Complete retained observations and change briefings, then attach them to a minimal versioned Investigation State and one end-to-end question. Use the refined dependency sequence at the end of this plan.

Run Campaign 2 against trustworthy shared contracts. Include lineage, temporal meaning and collection scope in the foundation; add dedicated hypothesis, commitment and institution experiences progressively.

Use Campaign 3 for hard globe/navigation work while relevant integration progresses. Use ordinary implementation effort for routine interface cleanup.

Working note: Keep source in GitHub and backend/data state in Supabase. Use temporary sandbox/agent storage only when needed, verify durable results reached the proper service, then discard temporary copies. If repository writes are unavailable, use the tested flat Cursor handoff in the same repository.

Accepted Additions  |  Implementation Priorities

Owner-approved on 6 September 2026. Implement these progressively alongside the three campaigns. Several extend capabilities already captured in the master plan; reconcile existing work before creating new modules or surfaces. Keep the 50% / 30% / 20% reasoning allocation as a flexible guide.

1. Change briefings and evidence impact

Show what materially changed since a user last reviewed an investigation: new support, corrections, withdrawn support and conclusions needing reconsideration. Connect each change to its affected evidence, graph, timeline and relevant World View state.

Acceptance: A correction produces a before/after explanation and opens the exact supporting versions. Repeated copies alone do not become a material-evidence alert. Preserve previous assessments.

2. Commitment → prerequisite → action → implementation → outcome

Follow an institution’s commitment through applicable prerequisites, actions, implementation and observed outcomes. Stages may branch, remain unknown, be cancelled or be inapplicable; they are not an automatic completion ladder. Retain the original wording, actor, scope, conditions, dates, evidence and revisions.

Acceptance: One institutional commitment can be followed across its documented stages. “No follow-up found” stays distinct from “nothing happened”; announcements never establish implementation or outcomes by themselves.

3. Competing explanations and missing evidence

Keep plausible explanations, supporting and conflicting evidence, assumptions and the evidence needed to distinguish them within one investigation. Retrieval should also seek material that could overturn the leading interpretation.

Acceptance: New contradictory evidence revises the explanation record without erasing the prior view. Weak alternatives receive no automatic equal weight; unresolved questions and the basis for change remain explicit.

4. Information lineage and claim evolution

Trace a statement from a primary record through reporting, syndication, social posts and corrections. Expose changes to quantities, attribution and uncertainty. Extend the existing lineage foundation and coordinate with separately accepted social/time-series work.

Acceptance: A copied-and-edited statement retains its known derivation chain. Label the earliest appearance within the observed collection; repetition alone establishes neither independent confirmation nor coordination.

5. Institution and decision histories

Provide persistent organization, agency or policy histories linking dated actors, decisions, documents, implementation and subsequent developments through the same investigation context.

Acceptance: A historical query uses the leadership, ownership and relationships valid at that time. Do not apply present-day mappings retroactively or promote association into causation.

6. Collection-aware evidence gaps

Explain whether uncertainty reflects missing primary documents, summary-only text, unresolved identity, unknown lineage or limited regional/language coverage. Keep the collection’s observable scope inspectable.

Acceptance: An investigation shows why evidence is insufficient and what would help resolve it. Limited observation or missing coverage never becomes proof of absence or contrary evidence.

Integration, Algorithm Work and Completion Gates

Shared implementation sequence

Foundation: exact retained evidence, typed and dated identity mappings, versioned assessments/dependencies, source lineage and honest coverage metadata. The existing offline proposal contract is a building block; live identity adapters and semantic verification remain required.

First visible slice: one versioned investigation question with a retained before/after briefing and exact evidence drill-down synchronized across applicable surfaces. Follow with one commitment-to-outcome investigation. Use real retained evidence and existing eligible projections; synthetic fixtures remain explicitly identified tests.

Following slices: strengthen disconfirming retrieval using source-origin and collection metadata, then connect commitment tracking, competing explanations, claim evolution and institution histories to the same investigation identity and assessment versions.

Validate incrementally: each feature gets its smallest useful end-to-end slice and explicit remaining limits. Foundational work can proceed while a dependent feature awaits a specific prerequisite.

Algorithm improvements included in this authorization

Disconfirming retrieval: search for corrections, conflicting quantities/date scopes, alternative entity matches and primary counter-evidence. Record the search coverage and unresolved conflicts; finding no contradiction does not prove the claim.

Source-dependency sensitivity: identify conclusions that lose support when a source origin or key input is withdrawn. Deduplicate syndicated and derived evidence. This is an evidence-dependency analysis, not a causal experiment on the real world.

Historical and semantic integrity: preserve polarity, modality, quantity/unit/subject/attribution, valid dates, source publication and MIP observation times. New old evidence may update the current reconstruction but must not leak into as-known-then views.

Evaluation: add representative counterexamples, correction/retraction and late-arrival tests. Measure retrieval coverage separately from semantic accuracy; use independent held-out labels before accuracy or release-threshold claims.

Working arrangement and review gates

Continue authorized implementation without repeatedly asking whether to begin each listed feature. Use read-only preflight, isolated branches, tests/builds and review. This plan does not itself authorize destructive migrations, new paid services, publication-gate relaxation or a merge that has not otherwise been authorized.

When repository writes are unavailable, use the existing backend/Cursor division. Handoffs must include exact repository paths, integration contracts, verification evidence and a paste-ready prompt. ZIPs stay flat; any SQL upload uses a compatible extension such as .sql.txt with explicit restoration instructions. Continue in jkelsen13-tech/media-intelligence-platform-v2.

For each visible slice, exercise selection, deep links, corrections and relevant empty/error states. After an authorized merge/deployment, inspect the actual live page and confirm the intended behavior. Passing tests or a green deployment alone does not complete visible work.

Standing instruction for the next agent run

Read this plan and the latest repository/backend evidence. Confirm current state, then implement the next feature whose prerequisites are ready. Preserve shared contracts and the owner’s merge process. Return changes, verification results, unresolved limits and the next ready step.

Product Refinement  |  Question, Evidence, Change

Added 6 September 2026. This refinement governs sequencing and interpretation where earlier priority lists differ. It expands the accepted plan without replacing the current consolidation work.

A question with a versioned state

MIP should organize an ongoing investigation around a question and show what the evidence supports, what changed and what remains unresolved.

Start with a stable investigation ID, versioned question and scope, explicit entities/events/places and time range, assessment references, evidence references, unresolved questions, coverage metadata and an observation baseline. Add hypotheses and commitment objects by reference when ready. Reuse the existing Investigation Context for navigation. Do not create a second graph, duplicate evidence or a single mutable object that overwrites earlier reasoning.

A shared state coordinates Graph, Timeline, World View, Sources and future investigation views. Each surface consumes the same investigation ID and compatible version references. Current selection is interface state; it does not rewrite the investigation. Concurrent or dissenting assessments remain addressable rather than becoming one imposed answer.

Changes need different meanings

Separate evidence entering the observed scope, assessments needing reconsideration, completed reassessments, changed conclusions and publication decisions. A new document is not necessarily independent support. A stale dependency is not a completed recalculation or a false conclusion. Material-change alerts require a documented assessment change; routine intake can remain in the activity record.

Use an explicit last-reviewed observation when the interface can record that action. A saved machine observation alone does not prove a human reviewed it. Keep the complete activity history and show why each selected change matters, without hiding unresolved high-impact conflicts behind an arbitrary score.

Confidence needs reasons, coverage needs boundaries

Represent evidence quality/conflict, source independence, identity and temporal fit, and observation coverage separately. Start with explicit states and reasons; do not invent numeric confidence weights. Probabilities require calibration against suitable held-out judgments. A thin collection can support a narrow fact, but cannot justify broad claims that alternatives were excluded.

Collection metadata belongs in the foundation: sources and source classes searched, languages, geography, time range, retained-text availability, exclusions and retrieval limitations. “Nothing found in this search” remains a bounded observation. Later coverage panels can refine the presentation without changing the underlying semantics.

Temporal meaning and source origins come first

Distinguish the interval a relationship is claimed to hold, when a source asserted it, when a collector observed it and when MIP recorded or revised it. Retain source-bound uncertainty, date precision, open-ended intervals and disputed intervals. Historical reconstructions and as-known-then views are different queries; never infer the latter from current rows.

Record known derivation and possible dependence with their evidence and uncertainty. Similar text or shared ownership alone does not prove copying; separate outlets do not establish independent origins. A source-lineage model may have multiple parents and unknown origins. Qualifier changes such as “up to 17%” becoming “17%” need span-level comparison and reviewed meaning, not merely a text diff.

Refined Delivery Sequence and Acceptance

Foundation and first complete experience

Historical baseline recorded 6 September: PR #41 was merged at 37b4e5c695a509ed605fe8c33e17557ee30f2818. Its offline capture proposal contract is distinct from a live semantic worker. Refresh main and inspect later work before continuing consolidation or rebuilding this slice.

Build the smallest versioned Investigation State around existing identities and retained observations. Connect one question to its current assessment references, unresolved items, coverage and exact before/after evidence. This is the first end-to-end experience; shared state and briefing delivery advance together.

Establish source-origin, temporal and collection-scope metadata before using them to make confidence claims. Improve disconfirming retrieval and evaluate it against representative positive, contradictory and unresolved cases.

Extend one real investigation through applicable commitment stages. Add competing hypotheses with discriminating evidence, followed by richer claim-lineage and institution-history experiences. Refine collection-awareness presentation throughout rather than postponing its data model.

Continue relevant World View and navigation work against these shared contracts. Broader feature delivery follows validated dependencies and actual access, not a commitment to finish every module within a few days.

Algorithm changes to carry forward

Resolve candidate identity and temporal scope, identify known source origins, retrieve supporting and disconfirming material, reconcile the evidence with an explicit ability to abstain, then write a versioned assessment and propagate dependency changes. Bound and record search effort; a search that finds no contradiction does not validate a claim.

For each competing hypothesis, retain the claim, assumptions, supporting and conflicting evidence, unresolved dependencies, and evidence that would materially strengthen or weaken it. Alternatives need not be mutually exclusive, exhaustive or equally weighted. Distinguish an observation that fits a hypothesis from evidence that discriminates between alternatives.

For commitments, retain who committed to what, for whom, where, by when, under which conditions and with which success criterion. Preserve changed deadlines and wording. Observed outcomes are separate from causal attribution to the commitment or intervention.

Evaluate whether users can answer the investigation question, explain the last meaningful change and reach the exact evidence. Measure semantic mistakes, unsupported confidence, duplicate support and missed corrections alongside retrieval performance; extra modules and edge counts are not success measures.

Acceptance example

A late correction enters an investigation. The earlier observation still shows exactly what was available then. The new briefing identifies the changed retained input and affected assessments as needing reconsideration. Only after an explicit reassessment may it report a changed conclusion. Selecting the item opens those exact versions and synchronizes the applicable graph, timeline and geographic context. The UI states collection limits and unresolved hypotheses.

Implementation boundary recorded 6 September

The private briefing slice retains a fixed candidate scope, evidence and assessment dependency closure, and compares explicit saved observations. It does not yet implement question authoring, user review markers, semantic reassessment, a live briefing UI, source-independence scoring or a public projection. Those remain distinct, testable next steps. This is the source plan’s dated baseline, not a new audit of current main; reconcile it with later work before implementation.

No-fee World View | Launch extension

New research and proposed implementation scope • 7 September 2026

Decision: Reuse the existing Cesium/MapLibre architecture and selected God’s Eye mechanisms. Replace restricted data with public-domain or permissively licensed sources. This is a no-license-fee plan, not a promise of zero hosting cost or a finished Google-quality digital twin. [R2–R4, S1–S10]

What “no paid licensing” means

MIT, BSD-3-Clause and Apache-2.0 are usable without buying a license when their conditions are met. Keep copyright, license and applicable NOTICE files, mark modifications when required, and do not imply endorsement. CC BY requires attribution, a license link and change notices; CDLA-Permissive-2.0 requires its agreement with shared data. A credit line alone does not replace these obligations. [R4, S1–S4, S8, S25]

Default admission: public domain/CC0, MIT, BSD, Apache-2.0, CDLA-Permissive-2.0 and source-specific CC BY. Do not introduce noncommercial, no-derivatives, unclear-rights or separately paid inputs. New ODbL/share-alike data is not in this default because it carries more than attribution obligations. Existing OSM obligations still apply; never strip its credits while using its data. [S8, S23, S25]

Twelve packages, with two different readiness states

Packages 01–06 strengthen the existing World View foundation. Packages 07–12 use available no-fee data to add bounded context; their source adapters, geographic coverage and release controls still need implementation and testing. Package 09 supports the already-required weather experience. A package count is not a shipped-feature count.

The new candidates are schematic buildings, institutional places, event-time weather, dated Earth imagery, earthquakes and fire/thermal detections. These should be tied to a selected investigation and time range, not an unfiltered global feed. Buildings are geometry, not photorealistic textures; imagery is not continuous live video. [S7, S9–S22, S27]

Current repository boundary remains explicit

The read-only inspection found Cesium, MapLibre and deck.gl in package.json. worldViewPrivacyLock.js still denies all extra overlays and specifically excludes live aircraft, vessels, CCTV, satellites, earthquake feeds and wildfire widgets. Earth imagery is distinct from orbit tracking, but must still pass its own explicit layer gate. Do not bypass this by renaming a layer. [R2, R3]

This revision proposes additional launch candidates; it is not authorization to weaken privacy, public projection or merge gates. A later implementation branch must describe the exact bounded policy change, preserve default-deny for everything else, and carry regression tests. Current main returned 75a9334 / merged PR #77 at the check; the source plan’s PR #41 note is historical, not a restart point. [R2, R3]

Verification scope: Official licensing/data documentation and selected repository files were reviewed. No MIP code was changed or deployed. Direct sample API requests from the working sandbox could not resolve external hosts, so end-to-end provider availability, browser CORS, credentials and performance remain unverified. That is a sandbox test limitation, not evidence of a provider outage.

Packages 01–06 | Foundation first

Engineering recommendations • no new paid data feed required

Package

Smallest useful implementation and completion check

01  Camera and navigation

Use existing Cesium camera APIs; adapt permitted donor patterns rather than replacing MIP. Preserve cancelable fly-to, globe reset, heading/pitch/altitude invariants and reliable restoration.Acceptance: navigation, restore, dateline/pole cases and touch controls pass regression/runtime checks. [R4, S1]

02  Marker legibility and decluttering

Reuse existing Cesium/MapLibre/deck.gl paths. Keep clusters, horizon visibility, hit-testing and zoom-dependent labels stable. Never adjust the underlying evidence coordinate for appearance.Acceptance: selection resolves to the same object/version across views; sparse and dense scenes remain readable. [R2, S1, S2]

03  Attribution and layer state

Add source/credit, dataset date, resolution, availability and error state to the layer UI. Distinguish contextual layers from admitted evidence. Retain required license/NOTICE material in distributions and exports.Acceptance: visible credits survive fullscreen, mobile, fallback rendering and permitted captures. [R4, S1, S2, S8, S25]

04  Shareable views and context presets

Persist investigation ID, assessment/observation version, selected time, camera, authorized layers and object selection. Restore the prior view after temporary context exploration.Acceptance: no access tokens or private evidence enter URLs; opening a link does not grant access or substitute current state for historical state.

05  Measurements and analyst annotations

Use Cesium geometry and, only as needed, permissively licensed Turf modules. Add distance, area, boundaries and analyst-drawn links; mark them as annotations rather than verified relationships.Acceptance: units, dateline behavior, coordinate precision and permissions are correct; derived measurements state their method. [S1, S3]

06  Open basemap and bounded terrain

Use a bundled Natural Earth overview as the no-provider fallback. Retain already-approved relief after checking its sources. For new U.S. relief, use a bounded public-domain USGS 3DEP subset, not a global replacement project. PMTiles is optional for suitable 2D tile delivery, not a drop-in Cesium terrain provider.Acceptance: fallback works without paid-provider tokens; preprocessing, datums, attribution and storage delivery are verified. [S4–S6, S28]

Foundation constraints

Do not replace functioning MIP modules merely to match the donor. Natural Earth is an overview dataset, not a street map. USGS relief requires conversion and geographic/vertical-datum handling. Start with existing delivery infrastructure and a small area; a new worldwide terrain pipeline is not a launch prerequisite. [S5, S6]

Keep package versions pinned for review and audit transitive dependencies, fonts, icons, styles and imagery separately. PMTiles software does not license whatever map data is stored inside it, and storage requests/bandwidth may still incur infrastructure charges. [S4, S28]

Packages 07–12 | No-fee contextual data

Available data routes • activation requires scoped integration and release gates

Package

Replacement, limitations and activation gate

07  Schematic 3D buildings

Source: Microsoft Global ML Building Footprints directly, under CDLA-Permissive-2.0. Do not substitute Overture’s ODbL building theme. Clip to the launch area and extrude only supported heights; missing height stays a footprint or visibly schematic geometry.Gate: measured/estimated/unknown height, source date and coverage are explicit. No Google textures or fabricated precision. [S7, S8, S10]

08  Institutional context

Source: Overture Places, preserving each record’s CDLA, Apache or CC0 source notices. Includes relevant religious organizations, hospitals and other institutions; it is not a complete ownership/history registry.Gate: resolve to MIP entities with uncertainty and valid dates. A place record proves neither current activity nor a causal relationship. No private-person or nearby-installation search. [S9, S10]

09  Event-time weather

Sources: NASA POWER hourly model/reanalysis context and NOAA GHCNh station observations where coverage fits. Both offer no-fee data routes. Preserve temperature, precipitation and wind speed/direction with the returned model/station, units, time basis and quality flags.Gate: missing data is not zero; grid estimates are not on-site measurements. GHCNh replaces the retired ISD route. [S11, S14–S19]

10  Dated Earth imagery

Source: individually reviewed NASA-origin GIBS products under the NASA data-use policy, not the entire mixed catalog. Start with one true-color product and a selected available date.Gate: display source, acquisition/composite interval, processing version, resolution and cloud/no-data limits. A mutable “best available” tile URL is not a frozen evidence record. [S11–S13]

11  Earthquake context

Source: USGS event catalog/GeoJSON, using USGS-authored data under its public-domain policy. Query a bounded investigation area/time interval, retain source IDs and revisions, and avoid unrestricted live-feed ingestion.Gate: a specific earthquake-context policy change passes; magnitude/time revisions remain traceable and geographic proximity never establishes causation. [S20, S21]

12  Fire / thermal detections

Source: reviewed NASA FIRMS products with a free MAP_KEY for automated API access. Retain sensor, detection time, confidence/quality fields and resolution. Historical availability is product-specific.Gate: credentials and throttling work server-side; a bounded fire-context policy change passes. A hotspot is not automatically a wildfire, burned-area boundary or attribution of responsibility. [S11, S22, S27]

What these replacements do not supply

Do not include Google photorealistic tiles, TeleGeography’s noncommercial cable snapshot, uncleared 3D models or managed paid feeds in this launch package. No verified equivalent is assumed for unrestricted global aircraft/AIS history, live CCTV or satellite tasking. Keep those outside the default scope. [R4, S26]

Voice/AI cockpit control and georeferenced third-party media are also not required for this no-fee slice. They need separate model/media rights, privacy and operating-capacity checks. Ordinary text controls and MIP-owned interface code do not require a new paid AI service.

Integration | Reuse the evidence system

Implementation design proposals, not claims about existing API routes

One source record, not one truth per screen

Extend existing versioned evidence/provider records instead of adding a parallel graph. Each context record should retain: provider and upstream origin; source object ID and dataset/release version; event/valid interval; publication, retrieval and MIP-recorded times; geometry and coordinate precision; observation/model/estimate type; units, quality flags and resolution; license/terms reference; attribution; retention/export permissions; and an exact retained-payload reference/hash when permitted.

A layer is context until it passes normal evidence admission. Linking a news article to the same USGS or FIRMS origin does not create independent corroboration. Date-specific reconstruction and as-known-then replay must remain distinct; current building/place data cannot silently become historical truth.

A small rights registry before new adapters

Record software, dataset and hosted-service terms separately, including the actual release checked, required notices and allowed operations: display, analysis, retention, export and redistribution. Store credentials only in approved backend secrets. Preserve full notices in the repository/distribution and add human-readable credits to the map, source inspector and permitted exports. Unknown permission means the operation is disabled, not silently assumed.

Three implementation waves

Wave 1: Reconcile current main, audit selected donor helpers and deliver packages 01–06 where needed. Build the source/rights registry and shared context contract in the same branch-sized sequence. Preserve the original evidence-core priority and 50% / 30% / 20% effort guide.

Wave 2: Implement package 09 as one retained event-time weather example, then one institution/place and building subset for the currently authorized geography. Add package 10 only with a reviewed product/date. These are small slices, not permission to ingest every place, building or image globally.

Wave 3: Implement packages 11–12 as opt-in, investigation-scoped context after explicit policy diffs and tests. Keep all other overlay restrictions in place. The owner’s request supports planning more launch capability, but does not waive the original merge, release, privacy or destructive-change gates.

Provider-specific correctness checks

Weather: request UTC explicitly where supported; distinguish station separation, sample interval and precipitation accumulation from instantaneous measurements. NASA POWER is model-derived, not a street-level observation service. For NOAA, use GHCNh and its quality metadata, not an assumption that ISD is still current. [S15–S19]

Imagery: record actual source/version and date range. If the product can change retrospectively, retain the permitted snapshot needed for reproducibility or label replay as non-frozen context. Quantitative analysis should use an appropriate underlying scientific product, not infer measurements from a decorative screenshot. [S11–S13]

Completion and cost gates

For each slice, test unavailable/late/corrected data, rate limits, revoked access, geographic/time gaps, attribution, sanitized deep links and synchronized selection. Verify the live-equivalent build and, after an authorized merge, the actual live page. Measure device memory, rendering and request volume before increasing coverage.

Source code stays in GitHub; durable backend/data state stays in Supabase. Never put MIP project datasets on the owner’s physical device. Use small remote/sandbox extracts; verify supported Range/CORS behavior before PMTiles, otherwise use a simpler bounded format. No new paid hosting, paid API, subscription or automatic overage commitment is authorized. Free licenses do not remove storage/compute/bandwidth costs. [S28]

Copy/paste | No-fee World View execution

Use with Campaigns 2 and 3 after read-only preflight

Task: Extend MIP World View using the 12-package no-fee plan in this document. Preserve the original algorithmic-core campaign, Investigation Context, exact evidence/assessment versions, temporal semantics and all review/merge gates. Work only in jkelsen13-tech/media-intelligence-platform-v2. Treat jkelsen13-tech/gods-eye-view as a reviewed source of optional patterns or selectively adapted MIT code, not a replacement application.

1. Reconcile the current system

Read current main, active branches, roadmap/research, package lock, spatial runtime/projection, weather contract, privacy lock and tests. Determine which work is already complete. The September 6 PR #41 snapshot is not current authority. Do not overwrite newer work or restart finished setup.

2. Establish rights before reuse

For every selected code module, dependency, dataset, model, font, icon or hosted service, record the exact source/version, license, notice requirements and allowed operations. Prefer public-domain/CC0 or permissive commercial-compatible inputs. No noncommercial-only sources, unknown rights, new paid services or paid trials. Do not assume attribution alone satisfies an ODbL/share-alike or other stronger license.

3. Build the smallest ready slices

Implement needed camera/marker fixes, attribution controls, versioned view sharing/presets, annotations and an open fallback first. Then implement one event-time weather slice using POWER/GHCNh; one Microsoft-footprint/Overture-Places region; and one licensed GIBS product/date. Add USGS/FIRMS context only after the specific feature’s policy gate and prerequisites are ready. Respect missing keys, source availability and existing authorized geography.

4. Preserve semantic and privacy boundaries

Do not promote context into evidence or infer causation from co-location. Retain observation/model type, coordinate/date precision, upstream dependence and historical versions. No person-search, face recognition, private-person location tracking, CCTV, generic nearby-installation search, or broad flight/vessel/satellite feed. Never rename a locked layer to evade its lock.

5. Propose bounded policy changes visibly

Current extra-overlay admission is default-deny. A new eligible context layer requires a narrowly scoped registry/policy diff and adversarial tests; unknown layers must stay denied. Do not relax publication gates or enable live access merely because a license is free. Stop and report any permission conflict, destructive migration or unproved licensing assumption.

6. Verify without hidden costs

Use temporary remote/sandbox storage, not the owner’s physical device. Keep durable source in GitHub and backend/data in Supabase. Cap geography, dates, objects and requests; use existing infrastructure within approved capacity. Do not commit secrets or large global datasets. Test build, integration, provider errors, attribution, deep links, time/version consistency and performance. Inspect visible changes before merge and on the actual live page after an authorized deployment.

Required return

Return: exact files/paths changed; source/license/NOTICE inventory; source and adapter smoke-test results; implemented slices versus blocked or deferred ones; narrow policy diffs; regression/integration/build results; visual/runtime evidence; infrastructure assumptions and remaining limits; and the next ready package. Use the standing flat Cursor handoff when needed. Do not merge, publish or activate a new provider without the applicable existing authorization.

Sources | Baseline, software and map data

Primary-source checks on 7 September 2026 • rights summaries are not a legal opinion

R1  Uploaded MIP Astra Extra High Work Plan, updated 6 September 2026Source document: MIP_Astra_Extra_High_Work_Plan_Updated_2026-09-06(1).docx. Original organization and substantive evidence roadmap preserved; dated setup/status notes explicitly qualified.

R2  MIP package.jsonRead-only dependency check: existing Cesium, MapLibre, deck.gl, React and Vite stack.

R3  MIP World View privacy lockRead-only overlay gate check. Commit listing returned 75a9334753e5d5b6a18d9a1e54229996596c56ff / PR #77; recheck main before implementation.

R4  God’s Eye View LICENSEMIT source-code grant; third-party data and models excluded. TeleGeography cable data is noncommercial/share-alike.

S1  CesiumJS official product and license overviewApache-2.0 engine; supports custom-source terrain, imagery, geometry and 3D Tiles. Commercial ion content/services are separate.

S2  MapLibre GL JS licenseBSD-3-Clause engine, with preserved third-party notices. It does not supply rights to map data.

S3  Turf source licenseMIT. Check only the required modules and their actual dependency tree before import.

S4  PMTiles source licenseBSD-3-Clause software. Data licensing and object-storage delivery are separate.

S5  Natural Earth terms of usePublic-domain vector/raster data; no permission or fee required. Useful for an overview, not street-level detail.

S6  USGS 3DEP 1 arc-second DEM collectionCollection states all 3DEP products are public domain. Conversion, datum handling and delivery remain implementation tasks.

S7  Microsoft Global ML Building FootprintsDirect Microsoft release states CDLA-Permissive-2.0. Machine-derived footprints and available height estimates are not photorealistic meshes.

S8  CDLA-Permissive-2.0 agreementSharing the data requires including the agreement. It does not impose ODbL-style database share-alike.

S9  Overture Places guidePlaces uses permissive source licenses and no OSM data; includes institutional and religious-organization categories.

S10  Overture attribution and licensing by source/themePlaces sources include CDLA, Apache and CC0; buildings are ODbL. Preserve Foursquare NOTICE/change information where applicable.

S11  NASA Earthdata data-use and citation guidanceNASA-led mission data defaults to CC0 unless restricted; non-NASA content retains its own terms. Do not imply endorsement.

S12  NASA GIBS API introductionStandards-based imagery delivery. Select and review individual products rather than approving the entire catalog.

Sources | Weather, events and operating limits

Use the exact product/release and current endpoint documentation when implementing

S13  GIBS advanced topicsExplains dataset versions, latency, resolution and mutable “best available” imagery selection.

S14  NASA POWER official homepageFree solar/meteorological data and programmatic access; model/observation provenance must remain visible.

S15  NASA POWER hourly APIHourly outputs, UTC/local-solar-time options and parameter/request limits. Verify current parameter metadata.

S16  NASA POWER meteorological methodologyMERRA-2-derived grid estimates; not a measurement made at the displayed street address.

S17  NOAA GHCNh product and accessCurrent hourly/synoptic station dataset, access routes and source quality flags.

S18  NOAA GHCNh catalog license recordCatalog identifies CC0; use the NCEI product page for actual access. Verify release metadata and any exceptions.

S19  NOAA ISD service change notice, 23 June 2026Old FTP/HTTPS retirement planned for 31 July 2026; directs current-data users to GHCNh.

S20  USGS copyrights and creditsUSGS-produced material is generally U.S. public domain; third-party works and identifiers require separate attention.

S21  USGS earthquake catalog APIDocumented event/time/geographic query interface and source fields.

S22  NASA FIRMS free MAP_KEY and request limitsFree registration for automated services; limits apply. Missing credentials block live activation, not the adapter design.

S23  OpenStreetMap copyright and service distinctionODbL includes database obligations beyond attribution; public map-server capacity is not an unlimited free entitlement.

S24  Open-Meteo hosted API termsFree hosted endpoint is noncommercial-only. Not the default weather dependency for this commercial-compatible plan.

S25  Creative Commons Attribution 4.0 deedAttribution, license reference and modification notice; no implied endorsement or additional restrictions.

S26  Google Map Tiles API policiesThird-party service/content restrictions are independent of God’s Eye’s MIT code. No Google photorealistic content imported here.

S27  NASA FIRMS thermal-anomaly interpretationThermal detections include natural and industrial sources, not only vegetation fires.

S28  Protomaps PMTiles cloud-storage guidanceRange/CORS delivery requirements and request/storage costs. No new storage provider is authorized by this plan.

## Source hyperlinks extracted from the attachment

1. https://github.com/jkelsen13-tech/media-intelligence-platform-v2/blob/main/package.json
2. https://github.com/jkelsen13-tech/media-intelligence-platform-v2/blob/main/src/lib/worldViewPrivacyLock.js
3. https://github.com/jkelsen13-tech/gods-eye-view/blob/main/LICENSE
4. https://cesium.com/platform/cesiumjs/
5. https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt
6. https://github.com/Turfjs/turf/blob/master/LICENSE
7. https://github.com/protomaps/PMTiles/blob/main/LICENSE
8. https://www.naturalearthdata.com/about/terms-of-use/
9. https://data.usgs.gov/datacatalog/data/USGS%3A35f9c4d4-b113-4c8d-8691-47c428c29a5b
10. https://github.com/microsoft/GlobalMLBuildingFootprints
11. https://cdla.dev/permissive-2-0/
12. https://docs.overturemaps.org/guides/places/
13. https://docs.overturemaps.org/attribution/
14. https://www.earthdata.nasa.gov/engage/open-data-services-software/data-use-policy
15. https://nasa-gibs.github.io/gibs-api-docs/
16. https://nasa-gibs.github.io/gibs-api-docs/access-advanced-topics/
17. https://power.larc.nasa.gov/
18. https://power.larc.nasa.gov/docs/services/api/temporal/hourly/
19. https://power.larc.nasa.gov/docs/methodology/meteorology/
20. https://www.ncei.noaa.gov/products/global-historical-climatology-network-hourly
21. https://catalog.data.gov/dataset/global-historical-climatology-network-hourly-ghcnh-version-1
22. https://www.nesdis.noaa.gov/news/service-location-change-integrated-surface-data-global-hourly
23. https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits
24. https://earthquake.usgs.gov/fdsnws/event/1/
25. https://firms.modaps.eosdis.nasa.gov/api/map_key/
26. https://www.openstreetmap.org/copyright
27. https://open-meteo.com/en/terms
28. https://creativecommons.org/licenses/by/4.0/deed.en
29. https://developers.google.com/maps/documentation/tile/policies
30. https://wiki.earthdata.nasa.gov/spaces/FIRMS/blog/2025/02/28/425855667/FIRMS%2Bincorporates%2Bstatic%2Bthermal%2Banomalies%2Bdata%2Bto%2Bhelp%2Busers%2Bdifferentiate%2Bbetween%2Bvegetation%2Band%2Bnon%2Bvegetation%2Bfires.
31. https://docs.protomaps.com/pmtiles/cloud-storage
