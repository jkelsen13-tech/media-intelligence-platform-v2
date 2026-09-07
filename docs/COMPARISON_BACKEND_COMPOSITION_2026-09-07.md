# Shared Source Comparison backend — 2026-09-07

Source Comparison now consumes `mipBackend.publicData.loadSourceComparisonView`, using the same browser Supabase client as the public workspace, News, and chronology. The view supports an injected backend for verification; replacing it resets prior results and ignores obsolete successes or failures. No extra client or cached token is created.

The reader still requests only the narrow `comparison_public` projection. Its existing pagination, multi-outlet display gate, opaque keys, publication boundary, explanations, correction records, and evidence dimensions are preserved. Explicit null now remains unconfigured instead of escaping to the global client; omitted overrides retain the legacy helper default. Comments now describe the public projection instead of the obsolete operational feature-flag read.

News links continue to carry the public article URL alongside the opaque comparison key. The shared root resolves that URL through an eligible News article; it never treats a hashed comparison key as an article ID. Arc and Timeline links retain their recorded identities. This batch changes neither database permissions nor source-independence judgments.

## Verification

- 24 focused tests passed, including five new SDK/frontend tests. The public-backend null-isolation test now includes Source Comparison.
- The installed SDK transport exercised 1,002 cards over 11 pages, exact returned identities, current-session headers, the projection column allowlist, and failure on a later page without partial results.
- Contract checks retain missing-extraction versus omission, thin-extraction markers, explanations, corrections, and eligible URL-based News navigation.
- Rendered component tests verify all three destination callbacks and backend replacement during pending requests.
- Browser preview used the real component and shared backend with synthetic public records: populated, empty, and unavailable states; provenance disclosure; News and Timeline destinations; no browser errors. No test data was written to production.
- Full Linux regression/build results are recorded in the pull request once CI completes. No dependency, schema, Edge Function, or migration changes.

## Previous release and next work

PR #63 merged as `47e74b99cbad42aa8e9f01a984fddaf939781b0e`. Main regression and Pages deployment succeeded. Live Timeline displayed the one published eclipse event; Arcs displayed its explicit empty state; no browser errors were recorded.

The next frontend reads to consolidate are in ArticlePanel, PolicyPanel, RelationshipPanel, and the Phase 3 view. The deployed spatial runtime and worker inventory still need reconciliation before their execution paths are consolidated. Public projections remain on browser-session access while private investigation operations use the unified gateway.
