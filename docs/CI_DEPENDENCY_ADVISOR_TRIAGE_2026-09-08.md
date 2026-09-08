# Node 22/24 CI and dependency/advisor triage

Golden regression tests and production builds run on Node 22 and 24. Pages tests/build use Node 24 and locked npm ci installation. checkout 7.0.1 and setup-node 7.0.0 use the Node 24 action runtime. No runtime dependencies are upgraded in this initial change.

A Node 24 npm audit JSON report is diagnostic (continue-on-error), separately from the mandatory regression and build steps. It does not imply vulnerable packages are approved; findings are being triaged by direct/transitive dependency and production/build exposure before remediation.

Supabase security baseline: 70 INFO, 10 WARN, 6 ERROR findings. Six ERRORs concern owner-context views: spatial_projection_v1, authors_public, arc_milestones_public, graph_coverage_public, news_detail_public and comparison_public. Two WARNs concern mutable search_path on trigger functions. Six WARN entries concern anon/authenticated execute grants on three trigger functions. The remaining WARNs concern vector in public and leaked-password protection. These are existing findings, not findings introduced by PR74. Triage must inspect predicates, underlying grants and trigger return types before changing access or labeling a finding exploitable.

References: [Node release support](https://nodejs.org/en/about/previous-releases), [Supabase view advisor](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view).

## Triage result

Node 22 and Node 24 each passed all 1,312 tests and the production build. Audit reported five affected packages: four high and one moderate, zero critical. All five are marked dev:true in the lockfile: browserslist 4.28.4 (Babel build tooling), nanoid 3.3.15 (PostCSS), postcss 8.5.16 (Vite), esbuild 0.21.5 and Vite 5.4.21. They are build/development-server dependencies, not installed as a production server by GitHub Pages. Static hosting does not expose a Vite/esbuild dev server; this is exposure triage, not a claim that the vulnerable packages are fixed.

Priority: update the compatible browserslist/PostCSS/nanoid transitive versions in a tested lockfile refresh, then migrate Vite and compatible plugins together to a maintained version that resolves the esbuild and Vite advisories. npm proposes Vite 8.2.2 as a major upgrade; do not use npm audit fix --force without reviewing that migration. No dependency versions changed in this CI-only batch.

| Package | Severity | Advisory |
|---|---|---|
| browserslist | high | [GHSA-c83g-rgw3-j3cx](https://github.com/advisories/GHSA-c83g-rgw3-j3cx), [GHSA-73wf-gq98-2v4g](https://github.com/advisories/GHSA-73wf-gq98-2v4g) |
| esbuild | moderate | [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) |
| nanoid | high | [GHSA-28wg-ghj8-5hjv](https://github.com/advisories/GHSA-28wg-ghj8-5hjv), [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8) |
| postcss | high | [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp), [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) |
| vite | high | [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9), [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3), [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) |

### Database findings

- The six owner-context views use explicit publication projection contracts. Five have security_barrier=true and security_invoker=false; spatial_projection_v1 also has a security barrier and defaults to owner context. Inspected filters include active/eligible articles, approved claim surfaces, approved arc membership and operative/released public spatial scopes. authors_public exposes id/name; graph_coverage_public includes aggregate pending-candidate counts. Review these two disclosure contracts explicitly. Switching all views to invoker mode without underlying grants/policies would risk breaking intended read paths; do not silence the advisor by widening base-table access.
- The three warned SECURITY DEFINER functions all return trigger, so they are not ordinary callable RPCs. Their PUBLIC/anon/authenticated EXECUTE grants are unnecessary exposure to remove in a tested hardening migration, preserving trigger behavior.
- The two mutable-search-path trigger bodies use qualified public.nodes and can be hardened with empty search_path after trigger regression checks.
- vector relocation requires a dependency inventory; do not move/drop it solely to clear the warning.
- Leaked-password protection is an existing Auth configuration recommendation, separate from the current magic-link flow.
- Performance baseline: 73 unindexed-foreign-key findings, 3 auth RLS initplan findings, 27 unused-index findings and one absolute Auth connection setting. Prioritize indexes by actual join/write workload and EXPLAIN; do not drop unused indexes based on this small corpus or create 73 indexes blindly.
- 70 RLS-without-policy INFO notices describe intentionally private tables; no browser policy is required merely to remove the notice.

The findings remain open remediation work with the scope above. This batch adds no database grants, policy changes, dependency downgrades or bypass of mandatory test/build gates.
