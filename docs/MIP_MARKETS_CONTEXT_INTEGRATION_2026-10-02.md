# Markets and Investigation Context integration — 2026-10-02

Qualification baseline: `80b0b6286cd5885c5e8edebc5f684a149edd9915`, including the dedicated Markets App route (`91b3564`) and exact inspection-time navigation (`ecc37e8`). Isolated branch: `codex/mip-markets-context-integration-20261002`. This bounded follow-on adds one integration test file and this document. No production source defect was reproduced; no App, temporal owner, source projection, provider, backend, dependency, schema, or admission change was made.

## Existing qualified owners and the missing combined cases

`tests/marketsAppNavigation.test.mjs` already exercises the actual App and Markets view: typed selection, preview without commit, asset → Timeline → Graph → Markets, direct recorded-event return, source/range preservation, cached-remount hash hydration, and suppression of the default event assessment for assets. Its range uses microseconds. `verifier/runMarketsSourceBrowser.mjs` independently covers actual browser initialization/reload and desktop/portrait/landscape navigation with a synthetic supplied source snapshot and every nonlocal request blocked. See [Markets route qualification](MIP_CONVERGENCE_MARKETS_SOURCE_ROUTE_2026-10-02.md).

The exact-time owner tests in `tests/worldViewTimeDeepLink.test.mjs`, `tests/recordedTimestampCompatibility.test.mjs`, and `tests/deepLinks.test.mjs` qualify recorded clocks and navigation independently. `tests/privateWorkspacePublicHandoff.test.mjs` qualifies the exact public identity and saved-version disclosure helper. No former World View geometry, accessibility, runtime, or source audit was repeated.

The missing combined mounted-App checks were an offset-qualified nanosecond range with a selected connected-reporting capture, inspection-clock refusal at a one-nanosecond difference, and Markets return state interacting with account change and private/public handoff. `tests/marketsContextIntegration.test.mjs` now covers those seams using the committed production App and actual Markets renderer.

## New integration regressions

| Case | Evidence checked |
| --- | --- |
| Asset/source/range → Timeline → Graph → World → Markets → connected event → analytical views → asset return → fresh module bootstrap | Exact equity ID and type, capture-selection URL, offset-qualified nine-digit range and inspection clock survive. The synthetic supply relationship preserves its distinct asset/event endpoints and supporting source URL. Selecting its recorded event commits only that event and its own retained occurrence clock, clears the asset source selection, and gives the exact event to the inspector. Return restores the original asset/time/source and identical reporting path. A fresh App module evaluation independently initializes from the resulting hash. |
| Adjacent inspection instant | Moving from `.000001123` to `.000001124` retains the typed asset and exact requested clock while withholding reporting and source selection for the other clock. The source fallback is explicit. Graph, Timeline and World tab changes preserve that inspection context. Prices remain unavailable throughout; no quote/history/sample is introduced. |
| Account and private/public context boundary | An account change clears a stored Markets return target. Entering Investigations then Graph commits only the private owner's exact already-loaded public event, with that event's retained clock and no prior asset range/source. The saved-version disclosure disappears after a version change. A private subject absent from the loaded public graph produces empty public Investigation Context and no selected World object, source link, fabricated public ID, or saved-version disclosure. |

The fixture retains canonical typed asset IDs and the existing relationship/source validator. Assets never enter the synthetic canonical graph as events or locations. Domain identity, source selection, relationship endpoints, occurrence time, inspection time, and publication/observation clocks retain their existing owners; the tests introduce no second identity or time engine.

## Execution and limits

Both target runtime runs passed **36/36 tests**, including the three new integration cases, with no failures or skips:

```
node --test --test-concurrency=1 \
  tests/marketsContextIntegration.test.mjs tests/marketsAppNavigation.test.mjs \
  tests/marketSourceLookup.test.mjs tests/marketPriceContext.test.mjs \
  tests/deepLinks.test.mjs tests/worldViewTimeDeepLink.test.mjs \
  tests/recordedTimestampCompatibility.test.mjs tests/privateWorkspacePublicHandoff.test.mjs
```

Runtimes: Node `22.23.3` at `/workspace/mip-node22/node_modules/node/bin/node` and Node `24.19.0` at `/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node`. Runs were sequential in the isolated worktree using the existing shared dependency symlink. Raw receipts and exact source/runtime/dependency hashes are in `/workspace/mip-lane-markets-context-receipts/manifest.json`. `git diff --check` passed.

The new tests render the actual production App, navigation helpers, and Markets view. Heavy Graph/Timeline/World renderers, auth, private hook, and network composition root are controlled inert probes. Private ready state and account IDs are synthetic owner assertions, not live authorization or RLS proof. Fresh module evaluation qualifies the App's initialization seam, not an additional browser reload; the existing actual-browser qualification remains separately referenced above. No provider, live auth/backend, source acquisition, quote, production-data admission, full-suite rerun, build rerun, browser rerun, or release claim is made. Parent combined-candidate checks and fresh independent review remain separate.
