# Separate context-rights layers — 8 September 2026 UTC

This independent shared-context batch advances the owner's requirement to review software, API/service, exact dataset/product release and upstream rights separately. It changes only the offline, project-owned contract and synthetic tests. No dependency update, provider request, backend migration, ingestion, publication, qualification or scheduler is introduced.

## Contract 2

`retained-point-context-2` retains the existing bounded JSON, exact payload/rights/snapshot hashes, clocks, UTC rules, geometry precision, units, sampling intervals and explicit missing values. Its rights record additionally requires:
- Software and service reviews, or explicit referenced not-applicable declarations.
- A dataset review bound to the exact provider, product and release.
- A nonempty, distinct upstream inventory with exact product/releases, the declared source origin and an explicit completeness assertion.
- Separate commercial-use, patent/license-compatibility and terms checks for every active layer.
- Known display, analysis, retention, cache, export and redistribution permissions in each active layer. Overall operation assertions cannot exceed any active layer's permission.
- A bounded API request count/window, records-per-request, concurrency and supporting terms reference whenever a service applies.
- Each declared attribution, citation, NOTICE, retention, redistribution or other obligation has a statement and implementation reference.

A permissive dataset or top-level approval cannot override pending API/upstream rights, absent limits, unresolved layer checks or a restrictive retention permission. Reasonable attribution obligations are accepted when their implementation is explicitly recorded. Cache permissions are retained separately; this module never caches or authorizes a cache operation.

These remain operator assertions. References are retained strings, not fetched or independently verified; an implementation reference is not proof of fulfillment, and the completeness flag does not discover omitted sources. Live use still requires a protected rights registry, current authoritative review, revocation checks, adapter identity binding and runtime enforcement of limits/retention/export. No record becomes evidence or publicly eligible, and no real source is approved by these fixtures.

Contract 1 has no production persistence or frontend consumer in this slice. New construction uses contract 2; comparison rejects an explicitly tagged contract-1 snapshot instead of silently changing its identity. Existing historical contract documentation remains an archived specification, with this change recorded alongside it. No immutable evidence or NASA version is rewritten.

## Deferred dependency component

The metadata-only Browserslist candidate resolved to 4.28.9 with Baseline mapping 2.11.21, caniuse-lite 1.0.30001810, electron-to-chromium 1.5.423, node-releases 2.0.54 and update-browserslist-db 1.3.2. The candidate lock was generated without package scripts in ephemeral CI, but is not integrated.

Baseline's [release README](https://github.com/web-platform-dx/baseline-browser-mapping/blob/v2.11.21/README.md) identifies bundled mappings derived from MDN data and a private useragents.io feed. Its [Apache license](https://github.com/web-platform-dx/baseline-browser-mapping/blob/v2.11.21/LICENSE.txt) does not by itself resolve the separate upstream-feed terms required by the owner's constraint. Applicable upstream commercial/retention/redistribution scope remains pending review. This is an unresolved review, not a claim that reuse is prohibited.

The existing production lockfile remains unchanged. Browserslist, Vite and esbuild findings therefore remain open as recorded in PR #82. The candidate preparation branch is not a release. POWER also remains pending its separate API, exact product/release and upstream review.

## Verification

Synthetic adversarial cases cover independent pending layers, source/release mismatch, unknown or conflicting permissions, incomplete/duplicate upstream declarations, unbounded/unknown API limits, missing obligation implementation references, immutable rights identity and explicit contract-version handling. Existing semantic and before/after cases continue to apply.

Required gates are full Node 22/24 tests and builds, followed by post-merge live verification of existing Account and saved investigation navigation. There is no new UI design or production behavior to preview. Results are recorded on the batch PR.
