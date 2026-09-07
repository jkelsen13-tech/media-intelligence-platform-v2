# Shared evidence backend — 2026-09-07

ArticlePanel, PolicyPanel, and RelationshipPanel now consume `mipBackend.publicData.evidence`. Its eight methods cover node sources, backing articles, category, actor derivation, node location corroboration, policy facts, relationship source resolution, and explanation reads. All use the same browser Supabase client as the other public workspace reads. No additional client, token cache, service-role route, or database is introduced.

The helper overrides distinguish omitted clients from explicit null. The default legacy helpers retain their existing behavior; the composed backend cannot escape to another configured client. Explanation options cannot replace the bound client. Existing public/role permissions, feature flags, review eligibility, query limits, and error contracts remain in force. In particular, private explanations stay withheld when ordinary browser access cannot read them.

Panel effects refresh when the supplied backend changes and retain selection cancellation. A superseded relationship explanation no longer triggers a follow-up source lookup. Named article and policy-document sources retain their order; unresolved IDs remain visible as gaps.

Browser verification also exposed two misleading missing-data labels. Policy reliability now displays only recorded integer tiers 1–4, avoiding a fabricated Tier 0 for null. Empty archive arrays/objects now display authentication unavailable rather than claiming an archived source record exists.

## Verification

- 51 focused tests passed across evidence composition, rendered panels, publication/null isolation, location gates, News, chronology, comparison, and provenance semantics.
- Nine added tests cover the installed SDK, all eight capabilities, current-session headers, current assertion selection, review exclusions, disabled/unavailable access, visible panel content, stale selection results, policy tiers, and empty archive containers.
- The existing explicit-null test now exercises all evidence methods against a configured global-client spy. The SDK fixture supports the existing quoted source-ID lookup syntax.
- Browser preview used the real three panels and composed backend against synthetic HTTP records. Verified source headlines, backing articles, policy jurisdiction, relationship grounding and named sources, unresolved identifiers, and the corrected labels. No browser errors were recorded.
- Full Linux regression and production-build results are recorded in the pull request after CI. No dependencies, migrations, permissions, production data, feature flags, or deployed functions were changed.

## Release and remaining consolidation

PR #64 merged as `425ef11fa3b1d3f849cd27cb0794581f97272bc1`. Main regression and Pages deployment passed. Live Source Comparison displayed the current three-outlet comparison, with source framing and lineage uncertainty preserved.

The shared root now supplies the core workspace, News, chronology, Source Comparison, and these evidence panels. Phase 3 and spatial/runtime reads still require consolidation. Reconcile the deployed spatial source and worker inventory before changing execution paths; this batch does not claim those services have already become one deployment. Existing bounded panel queries also remain candidates for a separate completeness audit.
