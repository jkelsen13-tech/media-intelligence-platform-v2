# Native fence failure Atlas fallback — 2026-10-02

The corrected source owner already catches a native fence exception, clears
source authority and publishes the fixed `native-source-fence-failed` reason.
It retires registered native owners and retains a failed Viewer until scheduled
destruction succeeds. The mounted Canvas previously kept its native stack
selected even after retirement removed that stack's host. The result was a blank
map with the old renderer readiness still set.

This bounded successor changes only the `bindAttachment` snapshot subscriber in
`src/views/WorldMapCanvas.jsx`. After its existing live guard, that exact fixed
failure selects `FALLBACK_MAP_STACK_ID`, using the existing cheap Atlas map and
ordinary stack cleanup. Source disclosure clearing, access and inspection-time
guards, local resource accounting and source-owner retirement remain intact.

`tests/worldViewNativeFenceFallback.test.mjs` mounts the actual WorldView and
Canvas with the production source session, native facade, outer adapter and
bounded RGB transport. The new helper reuses the existing mounted disclosure
fixture with a separate input key and bundle filename, so its compile cannot
collide with the existing suite. Four genuine tiny PNG fixtures and controlled
native APIs, frame events and decoded bitmaps establish lifecycle ownership;
they do not establish native GPU or photographic pixel appearance.

The test confirms an ACTIVE attachment and its capture/credit disclosure before
injecting a public `postRender.addEventListener` exception and a separately
failing `Viewer.destroy`. An exact nanosecond inspection-time change triggers
the production fence. The fixed reason has no raw error or old source identity,
photographic disclosure clears, and Atlas replaces the detached native host.
Zero photo-layer/byte/bitmap counters still accompany one retained native owner
and `nativeTeardownPending: true`; zero photos do not establish Viewer
destruction. A single retry respects its 1-second deadline. After the faults
lift, scheduled destruction zeros the registry and all resource counters.
Retired callbacks and Graph→Map cannot restore old disclosure or construct a
new native renderer. Four GETs and one reservation remain unchanged, allowance
and session serial remain intact, and each bitmap closes exactly once.

The unchanged base is `cb091f3c75529204aa70081f8ab8759edf7da6ab`. Before the
Canvas patch, the mounted product regression failed on Node 22.23.3 and 24.19.0
only at the missing Atlas assertion, after its cleared-disclosure, retained
Viewer and resource/accounting preconditions passed. Original RED TAP and
source/test snapshots remain separate at
`/workspace/mip-native-fence-fallback-evidence`. Final focused qualification
passes 18/18 on each runtime: the new case, eight disclosure lifecycle cases and
nine Canvas lifecycle cases, with zero failures or skips. A single Node 24 Vite
build also passes. Exact commit/tree, source hashes and receipt hashes are in
the outside-source `qualification.json`.

The held `67b638df3e1f8afe690368e4765604f454da6961` candidate and its
`REPAIR_REQUIRED` review remain unchanged, as does the clean
`19700658c54de69e2540b2e97bda743158f9d0dc` source gate. This source-only
follow-up does not admit sources, use providers, modify protected backend/live
state, dispatch Cursor, perform a physical-device/browser qualification, merge,
deploy or release. Parent-owned manifest binding, full CI, actual-App pixel
evidence and targeted rereview remain separate gates.
