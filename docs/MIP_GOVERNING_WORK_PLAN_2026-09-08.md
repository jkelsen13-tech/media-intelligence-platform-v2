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
