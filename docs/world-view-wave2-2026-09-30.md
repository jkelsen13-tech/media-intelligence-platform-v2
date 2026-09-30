# World View Wave 2 — clustering and relationship legibility

## Source and authority checkpoint

The September 30 successor plan's front release checkpoint and Wave 2 brief were read before implementation. Current main was refreshed and remained `39fdab77fc75736c57f2eb3a9b8500456ea27eae`, the completed PR #184 release. Its reviewed head was `58a39c245390fe963346c17da06f419bb870f853`. The successor branch is `codex/world-view-wave2-20260930`. PR #184 was not reopened.

Before state: marker and label arbitration existed; projection rows and geometry positions survived label suppression. There was no measured display clustering. Existing `loadWorldViewGraph` supplied directed original graph records, but no relationship valid-time bounds or top-level evidence fields. Those limitations are retained explicitly.

The inspection classified clustering as NEW over the existing arbitration; marker and renderer behavior as EXTEND; relationship display as EXTEND over the current graph reader. No new reader, discovery algorithm, canonical spatial state, provider, or dependency was introduced.

## Baseline and chosen limits

The existing Cleveland fixture has 500 geometry positions on ONE projection row. An in-memory 960×480 layout baseline at 1,600 pixels per degree placed those locations in about 3×4 pixels: 124,750 overlapping 14px marker pairs, up to 500 possible nearby pick targets, and one retained label. A sparse four-near-side-location scene had zero overlapping marker pairs and two labels. These are deterministic layout observations, not a new browser or GPU measurement. The fifth sparse position is on the far hemisphere.

Integrated clustering uses a 64 CSS-pixel seed radius with deterministic nearest-seed grouping and no transitive chains. Badges have a 32px visual circle and a 44×44px hit target. A separation above sqrt(2)×44 (62.23px) bounds diagonal hit-box overlap. Runtime measurements must confirm actual DOM targets; the exported pure clustering helper retains its configurable 36px default. Labels reserve badge bounds. Original points, object/version identities, temporal filtering, coordinates, precision, and provenance are not changed.

Rows and display locations are counted separately. Wrapped copies deduplicate by original object/version and geometry-position index. Membership depends on current admitted, on-screen, near-side inputs. Automatic grouping does not move the camera or choose a member.

Directed relationship lines use exact supplied original edges and original currently visible endpoints. The maximum is 80 lines, prioritizing documented selected-object relations. Stored hypotheses are inspectable but excluded from documented map lines. Missing, hidden, coincident, invalid, and budget-limited endpoints/records have explicit dispositions. Every original edge remains inspectable, including original direction/type and supplied metadata. The graph reader's missing historical validity is disclosed; no line is silently attributed to the selected recorded time.

## Implementation and orchestration checkpoint

Three implementation specialists were explicitly configured through the session's model selector as GPT-6.1 Sol with high effort. Per-agent runtime model telemetry was not returned. Non-overlapping writable packages covered the cluster helper and tests, relationship/group UI and tests, and synthetic fixtures/browser verifiers. The parent owns the shared renderer/selection contracts and integration.

The parent integrates Cesium, MapLibre/deck.gl, and atlas fallback. Renderer-owned projection passes publish plain display data only. Cluster badges inspect a group; a separate original-row action revalidates current membership and the current input row before selecting. Single rows remain keyboard-accessible for deliberate repeated picks. Stale membership, version changes, remounts, and renderer failure cannot silently replace canonical selection.

Repeated deliberate group inspection has an action revision so a manually collapsed inspector can reopen. Automatic regrouping does not replay focus. Mobile overlays match actual renderer dimensions rather than the taller parent containing attribution. Explicit new relationship snapshots refresh original edge references even when display positions and IDs do not change. Relationship text reserves all drawn marker labels. Atlas preserves measured two-line labels and reserves badge bounds; relationship types remain available in the original-edge inspector rather than adding overlapping atlas text.

The supplied Library workflow filenames were searched in accessible Pages with no matches; this bounded search does not prove absence. Current official OpenAI multi-agent documentation was read: https://developers.openai.com/api/docs/guides/responses-multi-agent. Existing session delegation tools were used; no paid API integration was created.

## Qualification ledger — first integrated checkpoint

- In-memory V8 checks: cluster and relationship helpers, randomized clustering oracle, presentation integration, and fixture syntax/identity logic were exercised. These are not Node or browser PASS receipts.
- First exact integrated candidate `17b9d357e553f162bdf59b38ad418ae544114dd7`, draft PR #191: Golden run `36758755840` exercised Node22/24; each passed 1,720 of 1,722 tests. Two new React panel text assertions incorrectly compared split text children as serialized JSON. Test repairs preserve the exact rendered directions, counts and actions; actual build and combined qualification remain PENDING.
- Exact-candidate representative remote browser build: PENDING via the existing World View Actions jobs. Draft-PR opening did not queue the PR browser workflow; a push trigger restricted to this successor branch reuses its existing four jobs and unchanged budgets.
- Hosted candidate preview: NOT EXERCISED; no preview service is created.
- Independent non-implementing Cursor review: REQUIRED / NOT EXERCISED. Browser/Computer/Cursor execution controls are not exposed in this session, so the existing outside review route is unavailable. Internal implementation checks do not substitute for it.
- Live deployment: NOT EXERCISED. Wave 2 merge/deployment is not authorized.

The isolated fixture remains opt-in and restricted to the disposable loopback browser origin. It validates exact existing reader columns/order/limit and a real authorized GET200 before substituting deterministic test rows. Graph fixtures preserve unsuccessful reads. No production authentication is bypassed and no synthetic rows or edges are written to any backend. Fixture truth is distinguished from real admitted evidence and from deployed behavior.

## Isolation and retained release limitations

No backend consolidation, qik SQL, database object/role/ACL/secret, audit connection, receipt, ingestion/publication/history/caller-cutover, held branch, retirement, or known reader401 remedy is in this diff. No paid provider, terrain admission expansion, or dependency change is included. All project files, blobs, builds, and evidence remain remote; local attachments and skills were read in memory.

Wave 1 limitations remain: companion Pages automation CANCELLED; separate actual-live-origin terrain/atmosphere checks passed; intermittent WebKit ResizeObserver warning remains recorded without a proven cause; reader401s remain separate; physical iPad/GPU, WebKit drag, and WebKit MapLibre wheel are unqualified; detailed terrain remains within approved Ohio coverage.

## Remaining concrete sequence

1. Publish the coherent successor source/test/browser delta and inspect the exact diff.
2. Run combined regression and existing browser jobs; diagnose and repair only affected failures.
3. Inspect actual interaction receipts, screenshots, requests, target bounds, and software-browser timing.
4. Obtain fresh outside Cursor review of the exact consequential delta when the existing route is available; reconcile valid findings and recheck affected behavior.
5. Update this ledger with exact candidate/run identities and honest limitations.
6. Stop at one bounded exact-head release decision. Main, merge, deployment, and backend state remain unchanged until separately authorized.
