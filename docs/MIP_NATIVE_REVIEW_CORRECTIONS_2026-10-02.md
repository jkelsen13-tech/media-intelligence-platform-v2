# Native source review corrections — October 2, 2026

The reviewed predecessor `67b638df3e1f8afe690368e4765604f454da6961`, tree
`36d3ad4d7eb1f397c4001a3dd5e6e2f5d686c7c3`, remains preserved with passing
2,539-test Node 22/24 CI and the independent verdict **REPAIR REQUIRED**.
The clean corrected `19700658c54de69e2540b2e97bda743158f9d0dc` source gate
is unchanged. This successor addresses the two consequential findings in the
[fresh source review](https://matvelt.slack.com/archives/D0C5P4EFJUT/p1790977988472309?thread_ts=1790977290.202499&cid=D0C5P4EFJUT).

Map→Graph previously detached the photographic renderer while the mounted
World View retained an ACTIVE capture/attribution snapshot. The changed
component lifecycle must clear that disclosure immediately and refuse old
callbacks; returning to Map requires a current confirmed attachment.

Native layer removal and Viewer destruction can both fail. The predecessor
then discarded the surviving manager and retry handle. The changed production
adapter, facade and existing App source owner must retain detached ownership,
stop drawing, expose only aggregate resources and retry native teardown until
safe release is verified. Pending cleanup cannot confer ACTIVE status or admit
another photographic attachment. Healthy removal closes images exactly once.

Independent changed-seam qualification also reproduced a fence callback throwing
before terminal App disposal reached registered retirement. The corrected
source owner clears private/publication state, continues cancellation and
retirement despite that exception, and emits the fixed redacted
`native-source-fence-failed` reason. Its live Canvas chooses the cheap Atlas
overview after that failure. The same exception boundary covers scope/access,
unbind and App-owner release; pending requests still abort and late images close.
No provider request, allowance reset or native reallocation can follow the
failed fence. The historical RED and corrected qualification stay separate.

Cartographic/elevation capture-unknown wording is explicitly scoped to that
baseline; a separately verified photographic capture remains its own dated
background observation and never becomes the selected event time.

The new chronological source manifest preserves the predecessor's two source
bindings and all earlier qualified manifests/SQL receipts byte-for-byte. Its
status is a source binding, not a qualification or clean review verdict. Exact
successor identity, changed-scope tests, CI and targeted independent rereview
belong in separate remote receipts. No broad audit is restarted.

Actual App behavioral and photographic evidence uses controlled reads and
SIMULATED_TEST_AUTHORITY_ONLY source admission. It does not authorize genuine
source activation, installed backend/auth, physical-device performance, final
appearance, paid use, merge, deployment or release. The original backend
authority package remains paused until these repairs and rereview complete;
its eventual rollback-only rehearsal and later COMMIT require separate owner
authorization. Operational consolidation and predecessor retirement remain
separate gates.
