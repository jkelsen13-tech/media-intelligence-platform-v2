# Mounted native-source disclosure cleanup — 2026-10-02

The source observation shown by WorldView belongs to its mounted map and current access/context. Graph mode removes the Canvas and its native attachment. The prior WorldView retained an ACTIVE photographic-overlay snapshot under the same access key because Canvas marked its ordinary subscriber inactive before source-session unbind emitted the cleared observation.

The mounted production regression first reproduced this on frozen commit `67b638df3e1f8afe690368e4765604f454da6961`: after the actual Graph tab click, one photographic capture/attribution disclosure remained while the source owner had already cleared its active source. The red TAP is retained outside the source checkout at `/workspace/mip-native-disclosure-receipts/red-node24.tap`. An earlier harness-resolution error is stored separately and is not the reproduction witness.

WorldView now withholds source observations during Graph rendering. Canvas independently publishes `null` to its latest parent source-status callback in layout cleanup, so a later Map remount cannot reuse the old observation. Ordinary subscriber and renderer callbacks keep their existing inactive/cancelled guards. This clear does not discard the retained App-local resource owner or renew its allowance.

Canvas also integrates the source owner's native retirement API. It registers each facade before assigning or mounting it, retires the current facade before dropping its reference, and refuses new native construction while retirement or owner capacity prevents allocation. A registration refusal destroys only the still-unmounted facade and chooses the cheap overview. Failed native cleanup remains with the source owner, which exposes detached aggregate retained-resource counters and retries cleanup independently of UI callbacks. The native adapter, facade, source owner and source-status resolver repairs are owned by the separate native teardown lane.

`tests/worldViewNativeDisclosureLifecycle.test.mjs` mounts the actual WorldView and Canvas with the production source controller and source-status resolver. Its helper injects explicit simulated services as child input; only native/vendor lifecycle observations and the unrelated Graph rendering surface are doubled. The tests cover:

- Map → Graph → Map under the same access key; return waits for a fresh current attachment.
- Layout cleanup clears the latest parent callback exactly once; obsolete native callbacks cannot republish.
- Aborted late source completion cannot attach or disclose through a replacement Canvas.
- Atlas fallback, Graph departure and return with no stale photographic capture or attribution.
- Actor switch, logout/unready, same-actor re-entry and exact nanosecond inspection-time change with no old source-ID publication or allowance reset.
- Actual production transport-branded four-tile handles, native manager, facade and source retirement owner across a mounted Graph departure. Failed native removal/destruction retain the lease and aggregate counters while disclosure clears; return chooses the overview before new native construction. After faults lift, scheduled cleanup destroys the Viewer, zeros retained counters and closes each bitmap once.
- Production owner capacity refusal before construction, and reentrant registration refusal before native mount.

The four-tile ownership case uses four tiny genuine PNG byte fixtures, a controlled bitmap decoder, Viewer, layer collection and frame events. It proves decoded-lease ownership and mounted lifecycle behavior; it does not claim actual photographic pixels, real GPU consumption, source admission, provider access or activation. The separate primary-worker actual-App four-PNG browser witness remains separate. No prior Cursor gate is extended by these tests.

Final commit, exact source hashes, Node 22/24 focused results and build results are recorded in the outside-source qualification receipt. The held candidate and historical manifests remain unchanged.
