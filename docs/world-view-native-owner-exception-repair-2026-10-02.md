# Native owner fence exception correction — 2026-10-02

Independent qualification of core `583d9c18a976486e808a5074240bfcf7dd727ede`
(tree `cf3b79a20c2f69dad7c2d518a0c92eddb2cf531c`) found a reachable cleanup
interruption. App disposal marked the owner terminal, then called the bound native
fence before controller cancellation or registered-owner retirement. A fence error
left a registered Viewer with no retirement timer; repeated disposal returned
immediately. A public native `postRender.addEventListener` error reproduced the
same interruption through the actual production outer adapter and facade. The
same call order interrupted scope/account invalidation, unbinding and App release.

This successor changes only the existing source session in
`src/lib/worldViewRealismController.js`. A fence exception records the fixed
`bridgeFailure: 'native-source-fence-failed'` before cancellation publishes. The
source session remains fail-closed: snapshots expose fallback with null source,
descriptor, observation and pending-source fields; raw exception text is not
published. New native allocation is denied immediately, including subscriber
reentry before registered-owner retirement. Controller invalidation still aborts
pending requests and releases its loaded/render references. Every registered
native owner enters the existing strict destruction-proof/backoff path; unknown or
failed native destruction does not release its handle or bitmap lease.

Terminal disposal clears the private subscriber, access, scope and attachment
before calling the fence, always reaches registered-owner retirement after
controller disposal, and cannot bind new private state afterward. Repeated
disposal preserves the one cleanup timer without bypassing its deadline. The
existing 1/2/4/8/16/30-second backoff, maximum registry of 32, strict native boolean
and zero-counter proof, resource accounting and public facade APIs are unchanged.
The failed source bridge remains unavailable after native cleanup. The parent owns
the separate Canvas subscriber response using the existing cheap Atlas fallback;
this package does not change Canvas or qualify that composed UI behavior.

`tests/worldViewNativeOwnerExceptionSafety.test.mjs` adds 10 actual-owner
regressions for the confirmed exception family, active and pending controller
cleanup, late transport settlement, redacted publications, terminal private-state
clear, multiple registered owners and reentrant allocation refusal. Two cases use
the actual production outer adapter/facade with the public native event fault,
including a separately failing Viewer destructor. Synthetic native API, decoder
and frame controls establish ownership behavior, not native GPU or pixel proof.

Retained evidence is outside source at
`/workspace/mip-native-retirement-independent-qa/qualification.json`. Original
core independent qualification is RED: 26/28 on both Node 22 and 24, with exactly
the two cleanup exceptions failing. The exception-family baseline is RED: all
nine original cases fail at the confirmed fence interruption. A tenth case then
adds explicit multi-owner/reentrant allocation coverage. The final repaired
focused suite passes 145/145 on each runtime, zero failures/skips, including the
new 10-case suite and the existing mounted Canvas lifecycle regression. The
independent 28-case successor matrix passes on both runtimes. The original core
worktree, four core file hashes and historical held candidate remain unchanged.

Final controller SHA256:
`64169b677a089e265bb5e5bfe77052d032f5ddb62b335cb567c659a9b91d5b34`.
Final regression SHA256:
`38b81b70e4881a3b5529b62f7e553407acd6eb92310176407966652dd200b2fc`.

No provider request, source admission, rights change, protected backend operation,
deployment, paid action, Cursor dispatch or native browser qualification occurs in
this package. Fresh composed UI/browser qualification and parent review remain
separate from these source-only lifecycle receipts.
