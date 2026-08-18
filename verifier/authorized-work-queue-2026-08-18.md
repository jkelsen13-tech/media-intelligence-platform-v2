# Reconciled Authorized Work Queue — 2026-08-18

This queue reconciles the owner-supplied **Master Plan**, **Working Document 22**, the current repository `main` branch, the isolated Supabase sandbox, and the rendered GitHub Pages deployment. It is a working execution record, not a substitute for the governing documents.

## Authoritative boundaries

The owner has authorized completion of **feasible, document-authorized work** in the cloned v2 repository and isolated environments. The owner also explicitly excluded the main MIP repository, the production-linked Supabase project, and production Google Cloud resources.

| Boundary | Decision |
|---|---|
| GitHub repository | Work only in `jkelsen13-tech/media-intelligence-platform-v2` on its `main` branch after validation. |
| Supabase | Use only `mip-v2-manus-sandbox-20260818` (`yhbwnrtlqbjtcrrlpbge`). It contains the isolated eight-article corpus and RLS-enabled schema. |
| Google Cloud | Do **not** alter `mop-extraction`. Its ID is hard-coded by the existing Cloud Run deployment workflow and it already hosts the named extraction workload, so it is not demonstrably a fresh v2-only resource boundary. |
| Not authorized in this run | Document 07 extraction; cron reactivation; public Legal & Policy release; account-dependent personalization; historical-precedent implementation; civilian-reporting/media pipeline; non-v2 or production service/database changes. |

## Feasible sequence

| Order | Work item | Basis | Verified current state | Required completion condition |
|---:|---|---|---|---|
| 1 | Reconcile the light-theme deployment drift | Track B Step 1 is recorded as live in the master plan; owner supplied light card references. | Live GitHub Pages is connected to the isolated eight-article corpus but `track_b_light_theme=false`, so the build visibly renders the dark fallback. | Set the flag to the documented live value in the isolated sandbox, re-open the actual deployment, and validate the light rendering against the reference vocabulary. |
| 2 | Close Package 1 — context and semantic integrity | Working Document 22 actions 1–4; repository commits already contain the implementation. | The code and dedicated verifier exist; baseline suite is green (401 tests). | Run the Package 1 browser checks against the v2 base path and live sandbox; fix only demonstrated defects; retain desktop and mobile evidence. |
| 3 | Integrate the transparent 3D Möbius-strip logo | Owner’s direct request. | No repository asset or component has yet been confirmed. | Create transparent visual asset(s), validate alpha/background, add a conservative branded use that does not interfere with content reading, and confirm responsive behavior. |
| 4 | Finish Package 2 shared Timeline/Arc system and acceptance fixture | Working Document 22 Package 2; repository already has a preliminary shared component set. | Shared components exist in source, but package-level fixture and visual completion have not been independently revalidated in this run. | Audit/reuse shared primitives, complete only missing documented behavior and fixture coverage, then validate light mobile/desktop rendering. |
| 5 | Continue the focused Graph repair | Working Document 22 Package 3, after Package 1. | Some Track B graph work exists; confirmed review items 16–21 remain to be checked against current implementation. | Resolve only demonstrated gaps: no composite confidence display, node/relationship evidence separation, overlay exclusivity, isolated-node guidance, relationship wording/provenance distinction, and plain-language source-reliability label; validate mobile, 200% text, and dense states. |
| 6 | Prepare Source Independence / claim-lineage brief | Working Document 22 Package 4, read-only only; unlocked by Package 1 wording repair. | Wording repair exists in code; no data-model implementation should start. | Produce a standalone implementation brief covering lineage categories, data model, detection and persistence stages, read/write boundaries, rollback, and fixtures. |
| 7 | Deliver closure evidence and owner-only actions | Owner request. | Baseline testing is green; cloud boundary and live mismatch records exist. | Push only validated repository work, check the live deployment after each release, and deliver a concise actions and credential record. |

## Immediate findings

> **Light-theme drift is the first correct action.** The current GitHub Pages build has live access to the isolated v2 data but the isolated flag is `false`, which forces the intentional dark fallback. The updated master plan records the light theme as the intended live state. Correcting the isolated flag is therefore a safe configuration reconciliation, not a new product decision.

> **Google Cloud is blocked by isolation evidence, not by missing permission.** The owner granted access, but inspection showed the only available project is already coupled to the existing extraction service. The minimum safe cloud action is to preserve its current state and create no resource, key, or API activation until a project explicitly identified as v2-only exists.

## Baseline evidence

| Check | Result |
|---|---|
| Repository working state at clone | `main` and `origin/main` at `a2f7b66`; no pre-existing local code changes. |
| Regression suite | `401` passing, `0` failing. |
| Production build | Completed successfully. Bundle-size warnings are recorded but not a blocking build failure. |
| Live deployment | Loaded and displayed the isolated eight-article corpus, More sheet entry point, and account entry point. It remained in dark theme before reconciliation. |
| Isolated Supabase | Schema baseline is present; all discovered public tables report RLS enabled; only `ingest-rss` is deployed and active. |

## Reference treatment

The supplied white-card mobile screens are the authority for the content surfaces, hierarchy, status treatment, and light visual system. The owner explicitly excluded the blue outer background from this work because it will later become animated. This queue does not interpret the absence of that animation as a defect.
