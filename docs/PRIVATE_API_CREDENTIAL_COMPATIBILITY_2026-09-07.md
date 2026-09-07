# Private investigation credential compatibility

This follow-up to PR #69 keeps the current unified investigation API compatible with opaque Supabase server keys. The hosted capture-retrieval check proved that this project's SUPABASE_SERVICE_ROLE_KEY environment value is an opaque sb_secret_ credential rather than a legacy JWT.

The historical workspace, evidence-check and evidence-review transports put that value in both apikey and Authorization. The consolidated composition now removes the invalid opaque bearer only for those three exact server RPC URLs. It preserves apikey, JSON input, verified user injection, redirect rejection, timeouts and each domain's response handling. Auth user requests and legacy JWT server transport are unchanged. Original domain handlers and the historical version-1 deployment manifest remain byte-identical.

This is a server transport repair under the authoritative September 6 consolidation work plan. It does not add UI controls, assignments, public access, queue processing or publication. It takes priority over additional workers because previously consolidated private reads use the same credential format.

## Verification boundary

Two added regression cases exercise all three RPC transports with opaque and legacy credentials, including an endpoint simulator that rejects opaque bearer tokens. Existing integration tests retain real SDK dispatch and isolated database assignment/version/reviewer checks. The new release manifest records ACTIVE version 2 and exact nine-file readback; the old manifest records the historical version-1 deployment only. Live preflight returned 204 and valid-shaped anonymous reads returned authentication_required with 401 across all five routes. Positive signed-in production verification completed on 7 September 2026; see the live verification below.

The implementation passed 1,295 tests and the production build in GitHub. The full run exposed a pre-existing race between two review recovery suites writing the same compiled module; their outputs now have distinct names. Before merge: retain passing current-head checks and complete positive signed-in production verification. A Supabase administrator session is not an MIP investigation-user session. Do not create user assignments or manufacture an authenticated user to bypass that boundary.


## Positive live verification

Using the owner's normal MIP magic-link session, the assigned NASA/Cleveland investigation loaded revision 1. Exact retained-input inspection returned the saved NASA summary, capture identity and separate publication/capture/queue times. One explicit bounded evidence-check run saved a report: three inputs, four text fields, one capture, zero comparable pairs and zero returned review targets. A database read confirmed the durable report and its saved version. Refreshing the view reads the saved report; it does not run it again. Review progress loads the honest zero-target state. No relevance decision or personal review acknowledgement was written.

The deployed API remains ACTIVE version 2 with JWT verification enabled and bundle SHA-256 `9ff9ea55734344a1b508b232ad0354a0d5df11954b23598c6dfaeb79a1a42adb`. This verifies normal user authentication plus workspace, evidence-check and empty review read paths. It does not establish non-empty review-decision or source-span comparison behavior in production; those remain covered by isolated integration tests. The collection has only one capture and is not a semantic-quality benchmark. No external retrieval, assignment, source edit, semantic assessment, queue claiming or publication occurred.
