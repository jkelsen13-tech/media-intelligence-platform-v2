# World View bounded Cursor corrections — 1 October 2026

This checkpoint continues the accepted realism candidate rather than reopening the completed program packages. Accepted main is `39fdab77fc75736c57f2eb3a9b8500456ea27eae`; the independently reviewed candidate was `bc96caab4d4bd5f7502e898ac665fc402183f1b4`, tree `76a6aa50fcbe9e4d6acb65e5127b0cab1dbeb40f`. The corrected commit/tree and its remote checks are pinned in the handoff generated after this document is committed.

The parent supplied a fresh Cursor review with zero blockers and two consequential nonblocking findings. [Review report](https://matvelt.slack.com/archives/D0C5P4EFJUT/p1790845974085019), [agent receipt](https://cursor.com/agents/bc-d7318215-c6e4-5da3-bd16-e5d4966242c4). That review covers the preceding candidate only. The corrections require targeted fresh independent review of the new SHA through the parent's verified route, with included allowance only.

## Imagery observation preserves the provider contract

Reproduction on the reviewed candidate returned a replacement Promise and changed a pre-success `AbortError` observation from loading to unavailable. The corrected wrapper returns the exact original Promise, thenable, synchronous result, null or scheduler deferral. It preserves the call receiver/arguments and synchronous or asynchronous caller error identity. Observer handlers update display metadata without replacing the provider result or swallowing a caller rejection.

Cancellation classification is grounded in the installed renderer's public request seam: the fourth `requestImage` argument, `Request.cancelled`, `RequestState.CANCELLED = 4`, the exact `RequestScheduler` cancellation `RuntimeError` message, and browser `AbortError`. Ordinary errors with similar text retain unavailable classification. Known cancellations, disposed lifetimes and late callbacks stay silent; genuine image success remains required for ACTIVE. A failed tile after genuine success does not erase observed active imagery. Throwing callbacks, lifetime/request probes and thenable probes cannot replace source results/errors. No vendor import crosses the existing lazy adapter boundary.

Thirteen direct runtime regression tests cover these contracts. The broader affected set also exercises source status, launch/closeout isolation guards, Explore interaction/restoration, spatial cards, resource policy and Cleveland bookmarks. A first full-suite run found vendor-specific comments outside the adapter boundary; the comments were corrected without weakening either existing guard or changing behavior.

## A short-landscape evidence is visibly readable

The reviewed 844×390 screenshot contained a Collapse button but no usable evidence body. An independent measurement of the built baseline found a 2px body holding 1,521px of content. Similar zero-height bodies reproduced at 667×375, 740×360 and 568×320.

The initial correction gives A a compact header and bounded sheet beside its existing interaction row, reserving a real scrolling body above native credits. Wider testing reproduced related narrow-landscape defects: B's two-row toolbar left an 83px globe at 568×320, its expanded evidence overflowed into the source footer, and Page could cover its controls. The minimal responsive repair gives both directions one toolbar row on narrow landscape, gives collapsed A a compact preview row, and reuses B's existing side-dock arrangement while narrow-landscape evidence is expanded. Page uses free toolbar space. Long previews retain their full text in their own bounded scroll area. The original four-viewport B layouts remain unchanged. Both directions remain gated prototypes awaiting the owner's choice; the correction does not select a direction.

The browser verifier now checks body height, bounded overflow, actual text rectangles within the viewport, hit-tested visibility, readable first/last values while scrolling, a substantial expanded globe viewport, and native credit visibility with expanded evidence. Interact, Options, Collapse, gesture release and Page are hit-tested while evidence is open. Inner text alone is no longer sufficient. The 64px minimum is a layout readability regression guard, not a physical-device or performance budget. It runs same-camera A/B journeys at 1180×900, 390×844, 834×900, 844×390, 667×375, 740×360 and 568×320.

Corrected pixels and geometry receipts accompany this checkpoint in [the correction evidence directory](world-view-evidence/2026-10-01/cursor-corrections/). The preceding evidence remains a historical record of the reviewed candidate.

At the local freeze, all 83 affected tests pass, production and isolated harness builds pass, actual bundle isolation passes with 12 self-tests, and all seven rebuilt browser journeys pass. A's body at the reviewed 844×390 viewport is now 116px. At 568×320, A/B bodies are 64px/74px, with respective 550×186px/264×186px map viewports. A separate direct rectangle inspection confirms the narrow B body ends at 239px, its dock/map end at 247px, and the source footer begins at 247px. Native credit and control hit-tests pass. The copied runtime receipt includes hashes of the source files used for qualification; its image paths are consumer-relative. Exact-head full-suite and remote Golden results are recorded in the post-commit handoff, rather than inferred from the earlier candidate's checks.

## Publication and authorization boundaries

The isolated branch route is unchanged. Repository metadata confirms a public repository; the unchanged Golden workflow uses standard `ubuntu-latest` runners for Node 22/24 and has no artifact/cache upload. Standard runners for public repositories are free under [GitHub's current billing documentation](https://docs.github.com/en/billing/concepts/product-billing/github-actions). A branch push triggers Golden; main-only deployment and path-dependent pull-request checks remain outside this route. No PR is created, no check is skipped, and no merge/deploy or paid provider activation is authorized.

PR191 remains the separate draft at `70aa6741b26156a4c1f0fc246c98e0704fd8ad0f`; its historical B1/N1 findings are unchanged. PR184 remains accepted. No backend-consolidation SQL, roles, ACLs, secrets, ingestion, publication, migration or cutover is modified. Two existing implementation workers retained their explicitly configured `gpt-6.1-sol` selection in nonoverlapping scopes; hidden coordinator/runtime telemetry is not claimed.

The harness remains an isolated, clearly labeled synthetic Cleveland display fixture. External imagery/source retrieval is still blocked by this executor's proxy. Screenshots do not qualify photographic imagery, genuine facades, Ohio asset coverage, live MIP, physical devices or background energy use. Session-local observation is still not an authoritative budget service. No Library upload is retried by this executor; the parent owns output delivery recovery.

## Exact continuation

1. Pin the corrected SHA/base/tree and publish it to the same verified isolated branch after passing local checks. Observe exact-head Golden Node 22/24 checks and retain receipts.
2. Parent requests targeted fresh Cursor/Grok review of the promise/cancellation correction and visible short-landscape evidence, then reconciles any consequential findings and retests repairs.
3. Parent presents the corrected comparable A/B pixels for the owner's layout choice. Do not infer a selection.
4. Continue the previously recorded source-admission, live/physical qualification and authoritative cost-control sequence when its concrete permissions/data prerequisites are available. No new provider or backend scope is added here.
5. Request exact-head release authorization only after the required independent review, owner choice and relevant qualification gates are satisfied.

This bounded repair is ready for handoff when corrected source/test/browser evidence, production build/isolation, exact-head remote receipts and the fresh-review request are complete. Overall photogrammetric realism and release are not claimed complete.
