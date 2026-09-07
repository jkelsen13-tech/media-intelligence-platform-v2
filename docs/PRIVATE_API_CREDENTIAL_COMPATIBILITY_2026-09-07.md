# Private investigation credential compatibility

This follow-up to PR #69 keeps the current unified investigation API compatible with opaque Supabase server keys. The hosted capture-retrieval check proved that this project's SUPABASE_SERVICE_ROLE_KEY environment value is an opaque sb_secret_ credential rather than a legacy JWT.

The historical workspace, evidence-check and evidence-review transports put that value in both apikey and Authorization. The consolidated composition now removes the invalid opaque bearer only for those three exact server RPC URLs. It preserves apikey, JSON input, verified user injection, redirect rejection, timeouts and each domain's response handling. Auth user requests and legacy JWT server transport are unchanged. Original domain handlers and the historical version-1 deployment manifest remain byte-identical.

This is a server transport repair under the authoritative September 6 consolidation work plan. It does not add UI controls, assignments, public access, queue processing or publication. It takes priority over additional workers because previously consolidated private reads use the same credential format.

## Verification boundary

Two added regression cases exercise all three RPC transports with opaque and legacy credentials, including an endpoint simulator that rejects opaque bearer tokens. Existing integration tests retain real SDK dispatch and isolated database assignment/version/reviewer checks. The new release manifest records pending deployment; the old manifest records the historical deployment only.

Before merge: pass current-head tests/build; deploy the exact nine-file bundle to current v2 only with JWT verification enabled; verify source readback and live route/auth denials; assess the remaining positive signed-in production verification requirement. A Supabase administrator session is not an MIP investigation-user session. Do not create user assignments or manufacture an authenticated user to bypass that boundary.
