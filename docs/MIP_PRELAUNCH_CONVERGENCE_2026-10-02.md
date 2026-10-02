# MIP whole-platform launch convergence

Current reconciliation: October 2, 2026, 08:45 UTC. Integrated source is `0d378f58ea732bbde2d3e8a1d5c66b70cf6a75a5`, tree `a126bbe48a75a950dcca44a705e94403899ae6be`, an explicit descendant of frozen `b8ac166`. The current candidate adds the original article fetched clock to the independently qualified intermediate `19bda934479331d7d217cefd6d25c19fc837d1d3`. This is a working launch matrix, not launch certification. Independent unfinished lanes and unapplied proposals are not counted as installed features.

## Current measured matrix

| Subsystem | Current classification | Evidence and remaining boundary |
|---|---|---|
| Ingestion | Implemented / partially qualified | Actual adapter → native SQL queue/capture → installed SDK readers → RLS → News journey passes eleven controlled checks. Collection authorization and all nine live ingest sources are disabled; no canonical producer cutover is claimed. |
| Article/source capture | Implemented / partially qualified | Native changed input preserves the original eligible row, retained capture and admitted claim, and creates a separate pending revision/capture. Original `fetched_at` is now exposed without inventing a latest revision clock. Public exact reviewed capture/hash binding remains absent. |
| Evidence candidates | Implemented / qualified at bounded source/fixture scope | Native pending candidates remain unpublished; exact retained spans and deterministic admission remain separate from candidate existence. |
| Evidence admission/publication | Implemented / partially qualified | Raw extracted claim leakage, inactive-source parity and ungrounded graph endpoints repaired. Current live identity/status views do not themselves bind immutable capture versions; privileged writer reachability and version contracts remain separate limitations. |
| Provenance | Implemented / partially qualified | Public News now consumes reviewed projection spans only. Retained history preserves before/after bytes. Legacy derived-provenance race is being repaired/qualified separately; no live substitution exploit is claimed. |
| Entities/Graph/relationships | Implemented / partially qualified | Eligible endpoints and failed/unsupported relationship withholding repaired; canonical selection passes controlled multi-surface navigation. Wider domain/asset typing and live admission remain bounded. |
| Story arcs | Implemented / partially qualified | Originating arc restoration no longer becomes an event ID. Published grouping is not a durable public story/version or Following contract. |
| Timeline/temporal intelligence/confidence | Implemented / partially qualified | Precise zoned recorded time, range restoration, subject-bound assessments and separate Evidence/Source/Temporal/Structural dimensions repaired/tested. No speculative post-launch temporal model added. |
| Investigation Context/deep links/return | Implemented / partially qualified | Late asynchronous navigation and stale cross-subject state repaired; Graph → Timeline → World View → Graph and external hash replacement pass actual controlled App journeys. |
| Explore/Search | Implemented / partially qualified | Native disabled semantics, responsive resize, keyboard search and return focus repaired; canonical committed subject remains distinct from preview. |
| Graph/Map/Split synchronization | Implemented / partially qualified | Map/Graph/Split, World View return, Inspector, exact recorded instant/range and existing modules exercised at 1280×900, 390×844 and 640×360 with zero browser errors/overflow. Controlled backend data is synthetic. |
| World View/spatial billboards | Implemented / qualified for bounded source gates | Existing city/ribbon/selected-reader gates preserved; newly reproduced mode-keyboard and Inspector focus defects repaired. Canonical geometry, precision floor and billing boundaries unchanged. Real source/device gates remain. |
| Environmental/weather/context | Implemented / partially qualified | Historical/current disclosure, optional absent-module semantics and normalized clocks repaired. No NWS current/historical observation, imagery or terrain bytes admitted; weather access and source rights remain gates. |
| Markets | Partial; required initial release | Existing typed-path and price-context validators remain. Dedicated route/source lookup implementation is active; no public asset directory, admitted quote rights or actual market bytes are assumed. |
| Account/auth/protected routes | Implemented / partially qualified | Auth/profile/logout races repaired and qualified; identity-only live profile/trigger foundation verified by parent metadata. Private gateway injects verified identity and still requires assignment. No real account/device session qualification claimed. |
| Supabase/RLS/security | Implemented / partially qualified | Current metadata confirms browser private-RPC denial, pending-only ingest INSERT and no service/ingest-owner existing-article UPDATE. Minimal profile ACL revoke proposal is unapplied; privileged claim writes remain a residual authority boundary. |
| Backend consolidation/recovery | Implemented / blocked at live gate | Frozen `1021d5c` SQL remains unchanged. Synthetic client successor separately models cancellation, rollback uncertainty and exact additive privileges; genuine wrapper/CA/TLS/log/owner authority and live authorization are missing. |
| Frontend deployment | Implemented / blocked at release gate | Main remains `39fdab7`, behind this candidate. Historical Pages deployment/basic verification succeeded but overall workflow was cancelled; current live HTML access returned 403. No merge/deploy occurred. Commercial hosting entitlement remains unresolved. |
| CI | Implemented / qualified intermediate; successor qualification in progress | Exact `19bda9` GitHub CI: 2,038 tests each Node22/24, zero failures/skips, both builds. Broader reader scope passed 61 checks per runtime; fetched-clock changed scope passed 11 checks per runtime, rerun sequentially. New lanes need coherent integration and new exact-head CI/review. |
| Observability/cost governance | Partial globally; qualified bounded local controls | Existing session lifecycle/resource controls preserved. No provider/account/global budget ledger or billing receipt authority. Preferred non-Supabase normal target ≈$100/month, ceiling $200 require adherence, not paid activation. Markets separately requires $0 incremental subscription/overage. |
| Mobile/accessibility | Implemented / partially qualified | Actual App controlled browser portrait/narrow-landscape/desktop journeys pass functional keyboard/focus/scroll checks. Historical cold-portrait RED retained; no physical-device FPS claim. |
| Dependencies/security | Implemented / qualified for bounded sanitizer repair | DOMPurify 3.4.16 override, reachable Cesium sanitizer regression and exact frontend CI audit report zero vulnerabilities. This is not whole-system security certification; separate backend fixture ancestry retains its historical low advisory. |
| Change briefings/evidence impact | Implemented / partially qualified | Exact relevant-input/dependency invalidation proposal qualified. Existing consumer rendering of additive relevance declarations is under inspection; declaration provenance must not disappear for already watched candidates. |
| Following | Partial | Transient panel pin is not Following. Separate private assigned-investigation source candidate `bf80877` has 17 new +33 existing targeted checks and a build; it remains unintegrated/uninstalled, with explicit declaration/materiality, server binding and public story/audience prerequisites. |
| Promise/outcome/competing explanations | Implemented / partially qualified | Existing versioned hypotheses/commitment stages and falsification branches retained. Matching a source span does not prove interpretation, fulfillment or complete evidence coverage. |
| Information lineage/institution history | Implemented / partially qualified | Existing retained roots/history/provenance reused. Wider typed workflows require actual supported evidence/identity rather than a second engine. |
| Collection-aware gaps | Partial | Declared not-run/partial/completed scopes are not measured coverage. Existing receipt-backed diagnostic consumer is being inspected; missing records remain unknown, never real-world absence. |
| Selective ingestion/religion/cross-domain | Partial; required foundation | Existing capture/candidate/observation owners support a bounded explicit-disposition source contract under development. No automatic editorial selection, domain silo, provider admission or durable deployment is claimed. |
| Documentation/configuration | Implemented / partially qualified | Complete selected Library requirements, workflow texts, Markets contract and source/rights/cost research are incorporated. Final coherent SHA/CI/review and shortest launch sequence will follow actual integration. |

The current high-value lanes continue independently: dedicated Markets route; existing relevance/collection diagnostics; private Following source; explicit selective intake declarations; legacy reviewed-source writer guards; and the targeted synthetic backend client correction. No provider-rights blocker is used to stop provider-independent source work.

## Preserved initial inventory

The table below records the starting `b8ac166` inventory. Its “under repair” wording is historical; the measured matrix above is current.

| Subsystem | Current classification | Existing owner and material boundary |
|---|---|---|
| Ingestion | Implemented / partially qualified | `scripts/evidencePipeline.mjs`, private intake RPC; retained-job semantics exist, canonical producer/cutover remains separately gated |
| Article/source capture | Implemented / partially qualified | Exact versioned captures, retrieval and rights contracts; public-reader source availability needs parity checks |
| Evidence candidates | Implemented / qualified at source/fixture scope | Existing candidate/excerpt contracts, deterministic checks; candidate existence does not admit evidence |
| Evidence admission/publication | Implemented / partially qualified | Default-deny database projections and review rules; browser predicate and raw-claim seams are under repair |
| Provenance | Implemented / partially qualified | Explanation eligibility and source history; unsupported/missing-source grounding must remain withheld |
| Entities | Implemented / partially qualified | Canonical graph identity and private history; publication and typed asset identity remain distinct |
| Graph | Implemented / partially qualified | Existing public graph loader/rendering; endpoint eligibility and navigation selections under repair |
| Relationships | Implemented / partially qualified | Existing edge types/provenance; failed/under-review grounding cannot become public evidence |
| Story arcs | Implemented / partially qualified | Published arcs and retained membership; page grouping is not persistent story coverage |
| Timeline | Implemented / partially qualified | Shared normalization distinguishes reporting/event clocks; originating arc is not a parent event |
| Temporal intelligence/confidence | Implemented / partially qualified | Shared temporal assessment and separated dimensions; key/subject binding and precise source clocks under repair |
| Investigation Context | Implemented / partially qualified | Existing canonical store; stale overlays and asynchronous navigation under repair |
| Explore/Search | Implemented / partially qualified | Shared News/discovery foundation; preview versus committed subject and keyboard behavior under repair |
| Deep links/return | Implemented / partially qualified | ID-only restoration and bounded recent context; invalid time/selection state under repair |
| Graph/Map/Split synchronization | Implemented / partially qualified | Existing shared selection/camera contracts; full controlled multi-surface journey remains required |
| World View | Implemented / qualified for bounded gates | Preserved b8ac source/lifecycle/resource receipts; live source/provider/device qualification absent |
| Spatial billboards | Implemented / qualified for city/ribbons/reader | Canonical anchors/floor preserved; full-App near plaques unsupported |
| Environmental/context layers | Implemented / partially qualified | Supplied scoped modules and event-time weather; absent real modules must stay absent |
| Markets | Partial; required initial release | Existing private identity/path validator; public typed directory, admitted paths and account-specific quote rights absent |
| Account/auth | Implemented / partially qualified | Current profile/trigger/session/UI foundation present; session/profile/logout races under repair |
| Protected routes | Implemented / partially qualified | User-verifying private gateway and assigned workspace; sign-in does not grant assignment |
| Supabase/RLS/security | Implemented / partially qualified | Parent current metadata pass; excess profile ACL source proposal and actual consumer transport remain separate |
| Backend consolidation | Implemented / blocked at live gate | Frozen1021 source/synthetic gate; exact live wrapper/CA/TLS/log/provider authority missing |
| Recovery/rollback | Implemented / partially qualified | Existing native preservation and proposal recovery; no rollback rehearsal or COMMIT authorized |
| Frontend deployment | Implemented / blocked at release gate | Main-only Pages trigger inspected; candidate unmerged; current live HTML transport refused |
| CI | Implemented / qualified baseline | Golden Node22/24; final combined candidate will receive new exact-head CI |
| Observability | Partial | Retained jobs/receipts and bounded local observations; no authenticated global/provider ledger |
| Cost/resource governance | Implemented / qualified local, blocked global | Preserved local counters/lifecycle; approximately100 target/200 ceiling are constraints, not spending permission |
| Mobile/responsive | Implemented / partially qualified | Existing WV synthetic hardening; new controlled whole-product portrait/landscape checks in progress |
| Accessibility | Implemented / partially qualified | Objective keyboard/disabled/modal defects under repair; external chart/hardware not certified |
| Dependency/security posture | Implemented / partially qualified | Compatible DOMPurify3.4.16 repair under qualification; no whole-system security certification |
| Documentation/configuration | Implemented / partially qualified | Current Library inputs and repository composition; exact integrated handoff/release sequence pending |
| Change briefings/evidence impact | Implemented / partially qualified | Retained private observations/dependency causes; newly relevant evidence outside old watch set under source-only qualification |
| Promise/outcome and competing explanations | Implemented / partially qualified | Versioned investigation hypotheses/commitment stages; matching source span is not proof of interpretation |
| Information lineage/institution history | Implemented / partially qualified | Retained roots/history/provenance foundation; wider typed domain workflows not assumed complete |
| Collection-aware gaps | Partial | Existing coverage declarations distinguish searched/retained scope; no missing result proves real-world absence |
| Selective ingestion/religion/cross-domain | Partial | Reuse existing deterministic intake/evidence foundations; required scope cannot be silently labelled post-launch |

## Current repair priorities

1. Repair public/evidence false-positive seams, stale cross-subject state, authentication races and objective accessibility barriers.
2. Repair temporal identity/precision failures while preserving separate clocks and dimensions.
3. Qualify minimal profile privilege source proposal and exact newly-relevant evidence invalidation source proposal without changing production.
4. Integrate a single descendant of b8ac; execute combined Node22/24 suites/builds and controlled browser journeys; parent requests fresh targeted independent review.
5. Retain external data/rights/provider/security/performance gates, verify deployment drift where accessible, and prepare the shortest safe launch sequence.

The historical cold-portrait RED remains. Original executable trace/timing/readiness boundary is unavailable in these retained sources, so no replacement benchmark or budget change is claimed. Legacy/dead paths remain KEEP UNTIL CUTOVER or UNKNOWN until caller/data/recovery evidence establishes safe removal. No backend retirement is authorized.
