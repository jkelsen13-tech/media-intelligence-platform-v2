# Governing work plan — 8 September 2026

The owner supplied `MIP_Astra_Extra_High_Work_Plan_No_Fee_World_View_Visual_Fidelity_2026-09-08.docx` and explicitly stated that it supersedes the old plan. This adoption record summarizes the execution constraints; the supplied document remains the full specification. `MIP_GOVERNING_WORK_PLAN_2026-09-07.md` is retained as historical context, not the current governing plan.

## Preserved scope and gates

- Keep the three evidence-first campaigns, six accepted additions, Question / Evidence / Change framework, and twelve no-fee World View packages. Use the flexible 50% evidence architecture / 30% evidence-to-World-View integration / 20% globe navigation, rendering and verification allocation.
- Inspect the relevant architecture and existing work first. Preserve evidence independence, provenance, immutable history, confidence semantics, publication gates, identities and security boundaries. Every confirmed failure or important invariant receives meaningful regression/adversarial coverage without duplicate tests.
- Work on dedicated branches. The owner separately granted conditional merge approval only after required verification passes, no material findings remain in the batch, and merge is recommended. Verify visible changes in the representative build before merge and on the deployed site afterward.
- No paid licenses, new paid APIs, paid trials, hidden paid dependencies or new hosting assumptions. Use compatible licensing and preserve notices; review data/service rights separately. No local project files or datasets: durable work goes to GitHub/Supabase.
- The final backend-consolidation gate remains mandatory. Frontend unification does not establish backend consolidation. See [the ten-part gate report](BACKEND_CONSOLIDATION_FINAL_GATE_2026-09-08.md). Do not delete or destructively modify legacy projects; even SAFE TO RETIRE requires explicit owner authorization for actual retirement.

## Added Visual Fidelity sequence

Visual Fidelity is cross-cutting Campaign 3 / Package 06 work, not a thirteenth data package. It generalizes the existing terrain-relief control and does not imply deployed new effects. No DLSS/neural reconstruction, server-rendered frames, local daemon or new backend is required.

1. **VF-1:** Reconcile current main and baseline World View behavior. Add a session-only, renderer-neutral profile and deterministic Performance / Balanced / Maximum / Custom presets. Provide a Photoreal master control, category gates/expansion/mixed states, and capability-aware leaves. Move existing relief into Terrain > Relief. Keep existing relief enabled and all newly introduced effects OFF. Preserve child/preset memory through master/category OFF/ON; manual edits select Custom. Keep profile state at World View level across renderer remounts, outside Investigation Context. Unsupported/fallback controls must be honest about availability.
2. **VF-2:** Wire verified Cesium built-ins for sun lighting, atmosphere, FXAA and bounded resolution scale. Terrain refinement requires request-volume tests before enabling profiles. Verify same-camera differences and fallback behavior.
3. **VF-3:** Terrain shadows and ambient occlusion require capability and representative-device measurements before preset membership is tuned.
4. **VF-4:** Optional restrained sharpening only after demonstrated benefit, artifact checks and correct disposal; OFF by default until approved.
5. **VF-5:** Optional separately authorized persistence through the existing safe settings contract. No private state/tokens in URLs and no local MIP dataset cache. Not required for the rendering controls to ship.

Visual preferences must not recreate the viewer, move the camera, change time/selection, alter coordinates or precision, weaken source/publication/privacy gates, or disable request-render mode. Measure performance on desktop and touch-class devices and preserve same-camera before/after evidence. Confirm APIs against the actual locked Cesium version. Deferred data-dependent features must not be represented as available controls.

## Reconciliation checkpoint

PR #117 merged the release-threshold guard and its regression coverage. Its Supabase deployment remains pending while the connector is unavailable; a fresh package comparison and JWT-preserving deployment/readback are still required. PR #118 addresses a concrete post-merge timestamp verifier race without removing assertions. The previous graph dismissal/selection/zoom and article-identity fixes are on main; the complete post-merge browser sequence must pass before the live verification checkpoint is closed.

The intended surviving Supabase project remains `qikvmopbtijoebdqosyq`. Legacy projects `yhbwnrtlqbjtcrrlpbge`, `niejaejtbxgakyrsntxm`, and `jfnzyvzthzqtczlxhjll` still require reconciliation. No legacy project is currently proven SAFE TO RETIRE. SINGLE-BACKEND CONSOLIDATION COMPLETE must not be declared. VF-1 is planned, not yet implemented by this checkpoint.

## Markets revision and current reconciliation

The owner supplied MIP_Astra_Work_Plan_World_View_Visual_Fidelity_Markets_2026-09-08.pdf
in the continuing implementation request. Its Markets addition is required
initial-release work alongside the preserved campaigns/packages and Visual Fidelity.

Markets must reuse retained reporting, canonical typed/dated identities,
assessments, roots and publication rules. Deliver a dedicated workspace,
reusable asset card, direct reporting/connected developments/broader context,
and two-way supported event/asset discovery. Tickers are aliases, not IDs.
Every essential relationship hop needs exact dated evidence; co-location,
similar names and price movement cannot manufacture a relationship or cause.
Corrections invalidate current dependents while preserving recorded history.

MK-0 reconciles existing contracts and rights; MK-1 delivers the shared
evidence slice independently of quotes; MK-2 adds only permission-cleared
no-fee price displays; MK-3 verifies discovery in both directions; MK-4
re-audits identity, historical behavior, privacy, failures and all surfaces.
TradingView displays remain separate from numerical data and require actual
site/symbol/privacy/attribution qualification. CoinMarketCap native data remains
off pending account-specific commercial/history/retention rights and hard
quota proof. No new subscription, trial, overage or paid fallback is authorized.
No provider is enabled by this record. Stock and crypto end-to-end completion,
including a supported indirect path, remain outstanding.

Fresh reconciliation at main d3d0066010a7166ccdc546f6d0167e693a268801:
Golden 34283862244 and Pages 34283862230 completed successfully, including
postmerge live verification. Manus source-comparison-run is now v11 with JWT
verification enabled; index.ts, lib.js and loadedLanguageLexicon.json exactly
match the reviewed runtime-snapshots/source-comparison-run-v10 files.
This supersedes the earlier pending-deployment statement above.
Both Manus five-minute schedules remain active. Survivor queue counts are
dependency_lookup completed 7/pending 2 and new_candidate_search completed
1/pending 8. These transport counts do not certify semantic discovery.

Draft PR #37 is historical: its migration, fixture, evaluation contract and
verification receipt are already exact blobs on main; its report, smoke SQL
and tests have newer main versions. Do not merge/reapply the old draft over
current work. No legacy retirement or worker cutover is established here.
See VISUAL_FIDELITY_VF1_2026-09-08.md for the current frontend batch.
