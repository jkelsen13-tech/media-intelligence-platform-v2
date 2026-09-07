# Shared curated backend — 2026-09-07

Legal & Policy and its application navigation gate now use `mipBackend.publicData.curated`. The two bound methods read the existing beta flag and curated view through the same browser Supabase client and current session as other public workspace reads. Review Status now reuses `mipBackend.publicData.evidence.loadExplanationReadView`, retaining its explicit 1,000-row limit and existing provenance gate.

All four growing curated tables use ID keyset pagination: legal cases, case evidence, policies, and policy transitions. Case and policy records retain creation-time ordering after pagination; evidence stays attached to its case and transitions to their policy. The existing field allowlists and presentation semantics remain intact.

Each section is complete or explicitly unavailable. A failed later page withholds that section instead of presenting partial records or claiming there are no records. A legal-case failure does not suppress readable policies, and vice versa. Disabled or unreadable beta flags withhold curated table reads. Explicitly unconfigured backends cannot fall back to another global client.

Both views reload when their supplied backend changes and ignore superseded results. Verdict attribution, recorded absence, unverified social material, policy source locators, and human versus automated review remain distinct. No schema, dependency, permission, production data, feature flag, or deployed function changes are included.

## Verification

- 32 focused tests passed, including seven new installed-SDK and rendered-frontend tests.
- All four tables were tested with more than 1,000 records and with a later-page failure. Tests verify ownership, chronology, current-session headers, strict flag gating, null isolation, and stale-result cancellation.
- Browser preview used the real views and shared backend with synthetic HTTP records. Expanded policy transitions displayed their recorded passages; failed cases showed unavailable while policies remained visible; disabled records were withheld; automated verification was explicitly not human review. No browser errors were recorded.
- Full Linux regression and production-build results are recorded in the pull request after CI.

## Release and remaining consolidation

PR #65 merged as `d1d1ec8ad906146af92c99221293096c11823736`. Main regression and Pages deployment passed. Live browser verification showed the current three-article feed and the published eclipse Graph node. Its Article panel opened with the recorded synthesis and explicit unavailable source records; no browser errors were recorded. Positive policy/relationship and curated-data states remain fixture-verified because the live corpus and access gates do not provide them for this signed-out session.

The shared root now covers core workspace, News, chronology, Source Comparison, evidence panels, curated Legal & Policy, and Review Status. Spatial/runtime and worker execution still require reconciliation of deployed source and inventory before consolidation. The existing explicit limits on other bounded panels remain a separate completeness audit. This batch does not claim all services have become one deployment.
