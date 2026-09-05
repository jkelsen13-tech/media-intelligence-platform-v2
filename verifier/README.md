# Verifier index — 04-ADD Step 3 Arc-Grouped Timeline

Append-only. One entry per version.

## v1 (created 2026-08-10, ~09:20 UTC+8)
Measures:
- **Hard count** (acceptance gate): live DB canonical event groups = 362 = 271 direct (nodes.arc_id) + 26 article-derivable + 65 orphaned; each event exactly once across sections + Unclassified. Script: `v1/count-check.mjs` (read-only, publishable key via PostgREST, recomputes grouping the same way the app does).
- **Unit suite**: `node --test tests/` must stay green (123 baseline + new grouping tests).
- **Render legibility (accent removal)**: manual + screenshot — all arc-header/status/Unclassified meaning carried by labeled text on the live dark theme.
- **Performance**: live-measured load/render/interaction numbers captured at verification time (recorded in the run log).
Differs from prior version: first version.

## v2 (created 2026-08-10)
Measures: Arc sidebar search (title + category-label) and Source Comparison
title search — unit seam (`listFilters.js`, 10 tests), live filter-correctness
and honest-degradation checks with screenshots, CI at HEAD 7d67cd06.
Details: `v2/search-filters.md`. Run log: `runs/2026-08-10-part2-search-filters.md`.
Differs from prior version: adds search/filter verification; no grouping or
schema changes (read-path UI only). B(b) SC category filter skipped per owner —
`sc_events` has no category-equivalent field.

## v3 (created 2026-08-10)
Measures: Track B Step 2 Knowledge Graph band — owner-required BEFORE/AFTER
pair (label-box collision count, bounding-box area per node) via headless
fcose harness (`v3/measure-layout.mjs`), unit suite 157 green, live
production checks of the four care points (drag-reheat exclusion,
deterministic seed mode, restPositions-after-placement, portrait
adaptation), byte-verified pushes, CI at HEAD 9db34829.
Details: `v3/graph-band.md`. Run log: `runs/2026-08-10-trackb-step2-graph-band.md`.
Differs from prior version: first graph-layout verification; adds headless
fcose metrics harness. No schema changes; rendering only.

## v4 (created 2026-08-11)
Measures: Doc 13 scaling/pagination ceiling — every unpaginated .select()
that can exceed PostgREST's silent 1000-row cap. Criteria: limited read-path
change only (no algorithm/schema/UI); fixture-seeded >1000 proof with named
rows beyond position 1000 present; zero-count cleanup for temporary fixtures;
full npm test green in /tmp copy; one commit per site, byte-verified push.
Details: `v4/doc13-pagination.md`. Run log: `runs/2026-08-11-doc13-per-site.md`.
Differs from prior version: first backend/Edge-Function verification; adds
plain-ESM shared-helper pattern (Deno edge + node:test parity) and keyset
composite-PK pagination proof.

## v5 (created 2026-08-12)
Measures: 00_INDEX Doc 13 checkpoint closure — CLOSED status + nine-site
ledger + final commit 8d6f8ef, FRESH post-close live census (entities/nodes/
edges/articles), reconciliation of three stale working-document status fields
(04 addendum Step 3, 05, 07), session git-token destruction proof, and
byte-verified push. Details: `v5/index-doc13-checkpoint.md`. Run log:
`runs/2026-08-12-index-doc13-closure.md`.
Differs from prior version: doc/checkpoint verification rather than code
behavior; first criterion set that includes credential-destruction proof.

## v6 (created 2026-08-12)
Measures: Doc 15A atomic centroid + idempotent attach — four required tests
run before-state-first against the live DB with scratch fixtures (race loss
reproduced: 0.045 vs 0.06; double-count reproduced: 0.035 vs 0.03; orphan
reproduced), RPC after-state all exact; cleanup zero-delta census; static
drift-guard test (tests/atomicAttach15A.test.mjs) guarding both callers;
inherited re-parenting limitation documented (owner instruction). Details:
`v6/doc15a-atomic-attach.md`. Run log: `runs/2026-08-12-doc15a-atomic-attach.md`.
Differs from prior version: first concurrency/atomicity verification.

## v7 (created 2026-08-15)
Measures: Track B Step 1 shared light-theme tokens — flag withhold unit
test (`tests/themeFlag.test.mjs`, withhold posture for every non-true value),
before/after screenshots of header + all four tabs in both themes with
programmatic body-background assertion, accent-removal test on Header and
News Feed, WCAG AA contrast on all light-theme text pairs (22/22 >= 4.5:1;
three marginal values fixed during verification), live rollback drill
(flag true -> live light, flag false -> instant dark revert), byte-verified
pushes, CI at final HEAD. Owner adjustment: 13px -> 16–18px body-text change
held out of this pass (open item; affects layout/density, not just color).
Details: `v7/trackb-step1-tokens.md`. Run log:
`runs/2026-08-15-trackb-step1.md`.
Differs from prior version: first styling/theme verification; adds
token-level contrast measurement and a live feature-flag rollback drill.

## v8 — 2026-08-15 — Track B card-radius 20px
Measures: token value change 8px → 20px, radius audit (23 hardcoded card
radii onto the token), untouched-scope confirmation, tests/build, byte-
verified push, 6-tab visual regression check, CI, and live bundle
confirmation. Details: `v8/trackb-radius-20px.md`. Run log:
`runs/2026-08-15-trackb-step1.md` (appended).
Differs from prior version: first purely cosmetic token-value change; adds
a card-vs-control radius classification audit and a live-bundle CSS check.

## v9 — 2026-08-16 — Track B nav restructure (6 tabs -> 5 + More sheet)
Measures: nav structure 4 core tabs + More (phase3/compare never top-level),
More-sheet order and per-flag gating, '(Beta)' suffix removal, withhold
posture (both flags off => no More, no disabled trace), unchanged view keys
for cross-jump stability (tests/navViews.test.mjs, 7 tests); 390px
before/after screenshots (live truncation -> 5 tabs, no ellipsis); live
click-through of both cross-jump paths (News 'Compare sources' -> compare;
Graph policy node -> PolicyPanel, structurally unaffected); byte-verified
pushes; both CI workflows green on final commit.
Details: `v9/trackb-nav-restructure.md`. Run log:
`runs/2026-08-16-trackb-nav-restructure.md`.
Differs from prior version: first navigation-structure change; adds live
cross-jump click-through and production before/after screenshot criteria.

## v10 — 2026-08-16 — Source Comparison in-page de-beta
Measures: presentational-only copy change in SourceComparisonView.jsx — h2
reads exactly "Source Comparison"; no user-facing "beta" string anywhere on
that screen (header, disabled notice, subtitle, tooltips, aria-labels);
diff limited to two copy strings (no logic/routing/data); suite 240/240;
build clean; byte-verified push (commit 90cdc79, blob 19d2a0dd, MATCH);
CI green; live mobile (390px) and desktop screenshots. Out-of-scope
observation recorded: Phase3View's own header still reads
"Legal & Policy — internal closed beta".
Details: `v10/source-comparison-debeta.md`. Run log:
`runs/2026-08-16-sc-debeta.md`.
Differs from prior version: first single-screen copy-alignment pass; adds
a full-screen "beta" absence scan on live body text as a criterion.

## v11 — 2026-08-16 — Legal & Policy in-page de-beta
Measures: presentational-only copy change in Phase3View.jsx — h2 reads
exactly "Legal & Policy"; no user-facing "beta" string anywhere on that
screen (header, subtitle, disabled notice, error notice, tooltips,
aria-labels); diff limited to three copy strings (no logic/routing/data);
suite 240/240 rerun against the exact deployed file; build clean;
byte-verified push (commit fe4d0e7, blob e0674b76, MATCH after adopting
remote &amp; entity as canonical); CI green; live mobile (390px) and
desktop screenshots with programmatic h2 confirmation.
Details: `v11/phase3-debeta.md`. Run log: `runs/2026-08-16-phase3-debeta.md`.
Differs from prior version: same criterion set as v10, applied to the
Legal & Policy screen; closes the observation v10 flagged.

## v12 — 2026-08-17 — Graph chrome overlap fix (Track B Step 2 item 1)
Measures: graph chrome in normal flow (toolbar / rail / stage), retired
floating `.edge-list-toggle`, docked TopicBrowser; clip-aware geometry
verifier across 8 browser states (desktop 1280×800 + mobile 390×844:
baseline, topics-open, edge-list-open, review-status-open, search-open,
legend-expanded) with zero chrome-on-canvas overlaps; suite 240/240;
byte-verified pushes (App.jsx final blob 9aae9338, commit 4a98d402 —
includes fix for a one-commit bottom-nav onClick regression at 657c6f08,
caught by the mobile Playwright run); live screenshots desktop + mobile.
Details: `v12/graph-chrome-overlap-fix.md`. Run log:
`runs/2026-08-17-trackb-step2-item1.md`. Verifier script:
`v12/check_overlap.py`.
Differs from prior version: first layout-geometry criterion set; introduces
the clip-aware overlap checker (ancestor overflow clipping, so scrollable
rail content is not misreported as overlay).

## v13 — 2026-08-17 — Graph canvas/token restyle (Track B Step 2 item 2)
Measures: plain view controls (+/−/Fit/Reset, zero joystick DOM, desktop
+ mobile); light canvas live with --graph-grid ink rgba(26, 26, 23, 0.08);
white node fill with type colored borders; neutral edges at rest with
type color on selection (programmatic proof: selected sequence edge
computed line-color rgb(109,40,217), width 2.5px); EDGE_TYPES extended
to the live 2026-08-17 vocabulary (sequence, constrained_by) so selection
coloring fires on real data; v7 accent-removal bar extended to Graph
(grayscale screenshot + 20 labeled legend rows); suite 240/240; byte-
verified pushes (four commits, tip 43bca1b0); CI green on all tips.
Blob SHAs: criteria 30c4ad76, checker 687601ab, run log 8e45fb89.
Details: `v13/graph-canvas-restyle.md`. Run log:
`runs/2026-08-17-trackb-step2-item2.md`. Verifier script:
`v13/check_item2.py`.
Differs from prior version: first canvas-visual-encoding criterion set;
adds computed-style assertions on cytoscape elements and extends the v7
accent-removal bar to the Graph tab.

## v14 — 2026-08-17 — Desktop default to focused subgraph (Track B Step 2 item 3)
Measures: desktop first paint renders the top hub's depth-2 focused
subgraph (20 of 750 nodes live), not the full graph; full graph is an
explicit, discoverable opt-in ("Show full graph (750 nodes)" in the
focus trail) with a discoverable toolbar return ("Focused view: Middle
East"); user focus semantics unchanged (search still pushes a real
crumb); mobile unchanged (hub-list entry, no synthetic focus) with two
side effects disclosed (stale-fit fix also repairs mobile openHub
fitting; trail label now "Show full graph (N nodes)" on all viewports);
stale-fit fix verified live (pre-fix zoom 2.54 static, post-fix 0.526
vs Fit 0.544); suite 246/246; v12/v13 suites re-run green; byte-
verified pushes (four commits, tip 916bd7db — includes fixup 524c3de2
for two transcription slips in 4e9c2e5c, caught by post-push hash
verification); CI green on all tips.
Blob SHAs: criteria 17bfa9a5, checker 7a0c604b.
Details: `v14/desktop-focused-subgraph-default.md`. Run log:
`runs/2026-08-17-trackb-step2-item3.md`. Verifier script:
`v14/check_item3.py`.
Differs from prior version: first navigation-default criterion set;
asserts rendered-graph cardinality via the cytoscape registry (no debug
globals) and adds the first mobile-unchanged invariant with explicit
side-effect disclosure.

## v15 — 2026-08-17 — Plain-language edge labels (Track B Step 2 item 4)
Measures: every edge-relationship surface (canvas, legend, evidence
popover, relationship list, flat + grouped timelines, article panel)
uses a plain-language phrase from a single helper
(edgePlainLabel); the causal-vs-sequence distinction is stated in words
("Causal claims one event led to another. Sequence claims only that one
happened before the other — no causation is claimed.") and survives
accent removal (grayscale(1)); sequence canvas labels read "happened
before" with zero machine vocabulary ("<type>: ..."); evidence popover
keeps the raw DB label as extraction detail ("Relation"); unknown
types humanize rather than leak machine vocabulary; suite 253/253
(246 + 7 new); v14/v12/v13 suites re-run green; cytoscape stylesheet-
ordering bug found and fixed (edge.lbl must follow the base edge rule
or base label:'' wins); byte-verified pushes (three commits, tip
078b2499); CI green on all tips.
Blob SHAs: criteria 485c0111, checker 78309b0e.
Details: `v15/plain-language-edge-labels.md`. Run log:
`runs/2026-08-17-trackb-step2-item4.md`. Verifier script:
`v15/check_item4.py`.
Differs from prior version: first language/semantics criterion set;
asserts meaning carried by words under accent removal rather than by
color or line style, and documents the first cytoscape stylesheet-
ordering defect.

## v16 — 2026-08-17 — Docked relationship panel with honest empty states (Track B Step 2 item 5)
Measures: the floating edge-evidence popover is replaced by a docked
panel (desktop flex sibling — no canvas overlap, stage 960px + panel
320px; mobile fixed 60vh bottom sheet) showing named sources, grounding
excerpt, and all six G2 axes with explicit toned states
(value/unverified/unavailable). Sourced edge renders real data
("Federal Register", grounding blockquote, "Reviewed — human
confirmed", falsification, corrections); unsourced edge renders honest
states ("No sources documented yet", "Awaiting review", "Not archived —
authentication not yet available"); no-explanation edge renders "No
provenance recorded yet"; every section carries visible content
(intentional, not broken); popover fully retired (no .edge-evidence,
relationship list opens the same docked panel, Escape closes); item-4
meaning line + raw Relation preserved in-panel; locked corrections in
the pure seam (count never strength, independence always unverified
without lineage, missing != contradicting); suite 264/264 (253 + 11
new); v14/v13/v12 suites re-run green; v15 six pre-popover checks PASS
(popover-era checks superseded, substance re-verified here); disclosed
fixes: provenance-fetch timing race in the checker, corrected axis
expectation, one transcription slip (29bfbb03, fixed de2c7b3b);
byte-verified pushes (four commits, tip de2c7b3b); CI green on tips.
Blob SHAs: criteria bd4acfce, checker 15b124d7.
Details: `v16/docked-relationship-panel.md`. Run log:
`runs/2026-08-17-trackb-step2-item5.md`. Verifier script:
`v16/check_item5.py`.
Differs from prior version: first docked-panel criterion set; supersedes
v15's popover-era checks while preserving v15 unchanged as history; adds
the first async-loading timing-race disclosure and the first honest-
tones (three-tone) assertion pattern.

## trackb3-v1 — 2026-08-18 — Shared epistemic component kit (Track B Step 3 item 1)
Measures: addendum system conventions extracted once as shared components —
three-state badge distinguishable without color (icon + dash + label,
dashed load-bearing on Inferred), contested never derivable from
confidence, locked seven-type pill vocabulary with humanized fallback,
evidence-state counts exactly three and frozen (static drift guard forbids
any addition operator or aggregate label in EvidenceStateBar.jsx),
guardrail-4 missing-scope requirement, no fabricated review dates, zero
hardcoded hex across the kit (Step 1 token bar). Suite 284/284 (270 + 14
new); build clean. Details: `trackb3-v1/trackb3-step3-item1.md`. Run log:
`runs/2026-08-18-trackb-step3-item1.md`.
Differs from prior version: first entry under the prefixed Step 3
namespace (flat integers abandoned 2026-08-17); first component-extraction
criterion set with no user-facing surface change (kit consumed from item 2).

## trackb3-v2 — 2026-08-18 — Policy Arc screen (Track B Step 3 item 2)
Measures: ArcsView detail panel rebuilt to the addendum's Screen 4
structure on the item-1 kit — eyebrow logic ("POLICY ARC" only for policy
categories), status line with real updated-date, standing explanation,
Overview/Evidence tabs (Timeline tab deferred to the item-3/4 engine),
Explore-connections CTA behind its root-node join, static lifecycle strip
with hardcoded "Orientation only. Not a score." caption (no caption prop,
no progress vocabulary, static-guarded), key developments with honest
neutral icon fallback for unmapped live categories, verbatim chronology
banner, evidence-state bar with documented-zero contested (probe-swept
across the confidence vocabulary) and live guardrail-4 missing-scope copy,
remaining-uncertainty block derived from pending milestones, sources line
from attached-article outlets only, trust footer with no fabricated review
date, zero hardcoded hex in new files. Suite 301/301 (284 + 17 new);
build clean. Details: `trackb3-v2/trackb3-step3-item2.md`. Run log:
`runs/2026-08-18-trackb-step3-item2.md`.
Differs from prior version: first user-facing Screen 4 surface; the
pre-existing §2.5.4 elements (milestone checklist, coverage-gap bar,
arc-age bar, attached-articles list) are folded into the Evidence tab per
owner delegation 2026-08-18, not retired.

## trackb3-v3 — 2026-08-18 — Timeline connector + expanded-detail engine (Track B Step 3 item 3)
Measures: the connector rule made precise and unit-pinned — "Source-
supported causal link" iff type causal + direction earlier→later +
doc_strength documented/corroborated, else "Sequence only" (circum-
stantial, absent strength, backward direction, non-causal types all
withhold); exactly n−1 connectors for n entries, never dropped; verbatim
locked copy (both labels + closing footnote) static-guarded; expanded
detail card on the shared AXIS_TONES vocabulary with article excerpt
rendered only when attribution legs (outlet + date) resolve; zero
hardcoded hex in new/changed files. Live-data basis (read-only,
2026-08-18): 411 edges, ZERO causal; arc_events are not nodes so arc
timelines honestly render "Sequence only" on every connector. Suite
315/315 (301 + 14 new); build clean; byte-verified pushes (blobs
5fbfd49d, cb6d883d, fe786344, 645afe5f, 1d409245; criteria c88aeac5).
Disclosed: commit f8a080d4 (seam + components + tests) failed CI because
the CSS static guard landed one commit later in b5cb22b9 (split-push
error, reproduced locally: exactly the line-treatment guard fails against
the pre-css tree); HEAD b5cb22b9 green on both workflows, full suite
re-run green against the pushed tree.
Details: `trackb3-v3/trackb3-step3-item3.md`. Run log:
`runs/2026-08-18-trackb-step3-item3.md`.
Differs from prior version: first shared timeline engine (no screen
wiring yet — items 4/5 consume it); first causal-branch proof carried
entirely by fixtures because the live corpus has zero causal edges; first
CI failure disclosure inside a step (split commit, root-caused and
closed within the same item).

## trackb3-v4 — 2026-08-18 — Timeline screen, Screen 5 (Track B Step 3 item 4)
Measures: TimelineView rebuilt as the addendum's Screen 5 on the item-1
kit + item-3 engine, arc-scoped by default (owner delegation 2026-08-18)
with the global corpus behind an explicit "All events" opt-in — eyebrow /
arc title / standing subtitle, arc selector, Timeline/Connections/
Evidence tabs, date-range + event-type filter pills (real selects,
data-derived options), verbatim epistemic banner, the shared ArcTimeline
renderer (date axis, spine icon, pill, badge only for mapped confidence,
source line only with a real outlet, chevron/caret expansion into the
item-3 detail card with on-demand excerpt), connector between EVERY
adjacent pair in BOTH scopes (arc scope honestly all "Sequence only" —
arc_events are not nodes; global scope passes remapped edges with
doc_strength so the causal branch can fire), footer links with LIVE
counts navigating to their tabs, item-3 closing footnote via TrustFooter
left slot, reviewedAt never fabricated. Reuse-not-rebuild: ArcsView's
Evidence tab extracted verbatim into ArcEvidencePanel, consumed by both
screens (static-guarded single source). Read-path only: doc_strength on
both timeline edge selects; new loadArcConnections (both endpoints
labeled, no raw-uuid leaks) and loadArticleExcerpt (null-safe). App
wiring simplified — Flat/Grouped chips + grouped-beta flag moved inside
TimelineView's global scope. Suite 332/332 (315 + 17 new); build clean;
live-data smoke (dist + Chromium): arc scope renders 49-arc selector,
footer counts live (e.g. 3 articles / 9 connections on the default arc),
guardrail-4 missing-scope copy verbatim, global scope 337 events / 14
pages / footer 336 articles / 80 connections, grouped mode behind its
flag, mobile 390px, zero console errors. Byte-verified pushes (blobs
1ee728f1, e808b916, 17eb0f70, 4a67cd29, 109def35, 6b319a5d, 58bca3d0,
d60491d7, 623dbc09, 00cf9408, d7af1e04; criteria 1cab2fde).
Disclosed: (1) commit 9fd5b843 carried ONLY the updated pagination guard
under a message describing the full data layer, and landed one commit
before the arcGroupedTimeline.js it guards — CI red on both workflows at
that commit, green from 27b65923 onward; the item-3 rule (a test and
every file it guards ride the SAME commit) was re-violated in the
transcription pipeline and is now extended: the COMMIT MESSAGE must also
be re-read against the actual file list before pushing. (2) commit
e60ebeca carried two transcription slips in loadSkyVerificationForNode
(spread on the Set constructor; .in('id') instead of .in('article_id'))
caught by byte verification and corrected in fixup 49bbd2f1 (v14
precedent); the slipped path is flag-gated off and unexercised by tests,
which is why e60ebeca's CI was green despite the slip.
Details: `trackb3-v4/trackb3-step3-item4.md`. Run log:
`runs/2026-08-18-trackb-step3-item4.md`.
Differs from prior version: first Screen 5 surface; first cross-screen
component extraction (ArcEvidencePanel consumed by two views); first
screen where the default scope is an arc rather than the global corpus.

## trackb3-v5 — 2026-08-18 — ArcsView Timeline tab (Track B Step 3 item 5, final)
Measures: the addendum's third tab (Overview / Timeline / Evidence)
shipped on Screen 4 consuming the shared ArcTimeline renderer and the
item-3 connector engine through the item-4 seams — zero reimplementation
(static-guarded: no buildConnectors, no TimelineConnector, no
TimelineEntryDetail, no ep-tl-* class definitions in ArcsView); entries
via normalizeArcEvent over the SAME arc_events detail the Overview tab
lists, so Screen 4 and Screen 5 can never disagree about an arc's
chronology; edges={[]} by construction, every connector between every
adjacent pair honestly "Sequence only" (behavior-pinned via the item-3
engine over the normalized shape); closing footnote imported via the
timelineScreenModel seam (never re-typed) in the TrustFooter left slot,
gated on the Timeline tab; stale "tab deferred" comments removed.
Acceptance pass: grayscale/accent-removal legibility verified on BOTH
screens (Confirmed/Contested/Inferred states carry icon + text label,
never color alone; sequence-vs-causal is structural — dashed chip +
"Sequence only" label vs solid line + link icon + "Source-supported
causal link"); AA contrast audit on all touched pairs (tab active
16.25, tab inactive 6.28, connector label 5.15, footnote 6.28, date
4.87, title 16.25, description 9.86, Confirmed badge 5.79 — all ≥ 4.5);
live smoke: 12 entries / 11 connectors all "Sequence only" on the
China — military escalation arc, footnote present only on the Timeline
tab, zero console errors; mobile 390px + desktop capture set. Suite
338/338 (332 + 6 new); build clean. One code commit (6c03efae:
ArcsView.jsx + its guard test together, item-3 rule; message re-read
against the actual two-file list BEFORE pushing per the trackb3
disclosure-1 rule — match confirmed, no hold needed); byte-verified
blobs (5e30010d, a5380567); CI green per commit on both workflows.
Details: `trackb3-v5/trackb3-step3-item5.md`. Run log:
`runs/2026-08-18-trackb-step3-item5.md`.
Differs from prior version: completes Track B Step 3 — both addendum
screens now ship the shared timeline engine; first footer slot gated on
tab state; first item closed with the disclosure-1 pre-push rule
active (message-vs-file-list re-read) and zero disclosures needed.

## trackb2b-v1 — 2026-08-18 — Step 2b pre-build clearance (three outstanding 2026-08-08 tests)
Measures: card-node + dashed-region-boundary design modeled headlessly against
the live 750-node corpus BEFORE any implementation, per the owner's gate.
T1 mobile reflow (390/360px viewports, focused depth-1/2), T2 200% text
scaling (canvas-vs-DOM decision forced with numbers), T3 dense states
(full-corpus card feasibility + zoom-gated reading model). Fixed pass
criteria in `trackb2b-v1/README.md` set before first run; findings +
owner-ruling adjustments in `trackb2b-v1/findings-2026-08-18.md`.
Differs from prior version: first PRE-BUILD design-clearance verifier (no
production code exists to test); first use of a deterministic
rect-separation pass (`relaxCards`) as a measured design element; first
experimental proof that cytoscape-fcose 2.2.0 ignores nodeSeparation.
Run log: `runs/2026-08-18-trackb-step2b-prebuild.md`. Prefixed namespace per
the 2026-08-17 collision fix; no schema or source changes.

## trackb2b-v2 — 2026-08-18 — Step 2b final-implementation re-confirmation
Measures: the same three tests (T1 mobile reflow, T2 200% text scaling,
T3 dense states) re-run against the ACTUAL shipped modules
(`src/graph/cardRegions.js`, `src/lib/desktopFocus.js`,
`src/graph/GraphView.jsx`) per the owner's re-confirmation rule — 11 checks
T1.a–T3.d, fixed criteria in `trackb2b-v2/README.md` set before first run.
Plus browser smoke (puppeteer, live preview): six scenarios incl. grayscale
accent-removal review.
Differs from prior version: v1 cleared a DESIGN pre-build; v2 verifies the
SHIPPED implementation (imports production modules directly, no re-model).
Includes root-cause record of a smoke-script artifact (fixed 3-press zoom
straddling CARD_ZOOM_MIN=1.0 from fit ≈0.578) resolved by adaptive zoom —
no app code change.
Run log: `runs/2026-08-18-trackb-step2b-final.md`. No schema or source changes.

## trackb2b-v3 — 2026-08-18 — entity_type mapping correction (post-Step-2b)
Measures: the owner-ruled correction track — 12 live nodes with
metadata.entity_type='person' contradicting their canonical entities ('other')
corrected with guarded writes + rollback drills (census proof: 750 nodes
unchanged, mismatches 12→0); cardTypeInfo/regionOf read entity_type honestly
(institution → "Institution", other → "Other", both UNGROUPED); loadGraph
nodes select extended with metadata (root cause: the app never saw the stored
value). 11 checks re-run against corrected live data; T3.c re-framed for the
ungrouped-node regime (foreign-region hull violations hard-gated at 0;
ungrouped enclosures recorded, disambiguated by card labels). Suite 352/352;
browser smoke: Middle East "Other"/ungrouped, Supreme Court
"Institution"/ungrouped, grayscale accent-removal PASS.
Details: `trackb2b-v3/README.md`. Run log:
`runs/2026-08-18-trackb-step2b-mapping-fix.md`.
Differs from prior version: v2 verified the shipped Step 2b build; v3 verifies
the post-correction mapping against corrected data and re-frames T3.c —
criterion change forced by the owner's ungrouped ruling, not by a failure
sweep under the rug (v2's failing T3.c against the new mapping is preserved
in this run log's trajectory).

## trackb4-v1 (2026-08-18)
Track B Step 4 — News Feed (addendum Screen 1). 25/25 PASS. Title block with
browser-local last-visit count, epistemic banner, inert Region/Evidence/Topic
pills beside wired chips, restructured cards with per-article provenance from
the real cited_type discriminator, event grouping, live-corpus header with
honest static-corpus date, grayscale + AA contrast, mobile 390px.
Details: `trackb4-v1/README.md`. Run log:
`runs/2026-08-18-trackb-step4-news-feed.md`.

---

## pkg1-v1 — Package 1: Context and Semantic Integrity Repair (2026-08-18)

22_NOTE_DEEP_READINESS_REVIEW Package 1 items 1–4, implement order 1→4→3→2:
Graph jump-reset seam (Arc→Graph leaves no stale relationship panel / focus
stack), lineage-safe Source Comparison wording ("Also reported by … lineage
not verified", E2 multi-outlet), truthful Timeline footer tab labels
("Open Evidence"/"Open Connections"), and the explicit
arcId/eventKey/nodeId/relationshipId/articleId navigation contract including
the News→Timeline return-to-origin case (lands on the originating arc, never
the global corpus when an arc is known).
Details: `pkg1-v1/README.md`. Run log:
`runs/2026-08-18-pkg1-context-semantic-repair.md`.

---

## stage-d-visual-repair-v1 — Stage D terrain visual-continuity repair (2026-09-05)

Bounded owner-authorized repair: live World View terrain around the
Cleveland node was technically active but not visibly legible at the
enforced city camera floor, and CDEM-mixed Lake Erie-adjacent tiles were
fail-closed rejected, punching a seam into the approved coverage. Measures:
live preflight evidence (terrain status, accepted/rejected tile counts,
exact source headers, same-camera terrain-vs-ellipsoid captures, exact
34,641.016151377546 m floor); evidenced diagnosis inside the authorization's
enumerated causes; CDEM admitted to the display-only allowlist only after
primary-source Open Government Licence – Canada 2.0 verification with the
required attribution sentence carried in the UI disclosure; a restrained,
labeled, height-derived relief-shading treatment with no vertical
exaggeration; full suite green (723/723); branch byte-verified against the
tested tree; PR-only merge after checks pass; post-deploy 10-item live
acceptance walk; Stage D closeout addendum last, prior defect history
preserved.
Details: `stage-d-visual-repair-v1/ACCEPTANCE.md`. Run logs:
`runs/run_2026-09-05T02-10Z_v1.md`, `runs/run_2026-09-05T05-40Z_v1.md`,
`runs/run_2026-09-05T22-05Z_v1.md`, `runs/run_2026-09-05T23-55Z_v1.md`.
Differs from prior version: first version for this goal; no schema, source,
or canonical-state changes — display-only renderer repair.

---

## mip-legacy-graph-staging — private graph staging dry-run (2026-09-05)

Private staging/reconciliation path for the legacy graph and evidence
dependencies after the Original→Manus ledger completed (3,818 mappings,
1,504 conflicts). Production `nodes`/`edges` remain publicly readable, so
unreviewed graph rows are not inserted there. Read-only inventory: Manus
949 nodes / 451 edges; production 1 node / 0 edges. Migration is additive
and not applied live in this revision.
Details: `docs/MIP_LEGACY_GRAPH_STAGING_2026-09-05.md`.
Verifier: `mip_legacy_graph_staging_2026-09-05.json`.
