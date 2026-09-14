# Auth initialization ordering — isolated correction, 2026-09-14

At candidate7c6ce6a06fa47b519f9e738e8721e9d8beb72ff3, useAuthSession started getSession and independently accepted provider callbacks. A late initial lookup could replace a newer logout or account-change event. The event callback also did not settle loading, and lookup rejection was unhandled.

The correction subscribes first, records whether a provider event occurred, and accepts the initial result only before any such event. Events settle loading. Lookup failure settles signed-out when no newer event exists. Cleanup rejects both callback and lookup updates after unmount. No provider permissions, Auth settings, credentials, source rights or production endpoint are changed.

tests/authSessionOrdering.test.mjs compiles the current hook against an in-process synthetic provider and retains the exact prior hook as a labelled negative counterexample. It tests logout/account ordering, normal initialization, rejection, synchronous callback, unmount, and the actual optional hypothesis client remaining retired after late credentials arrive. The prior counterexample deliberately reproduces the old failure; it is not a passing security implementation.

These tests prove client event ordering under the stated callback contract, not real provider attestation or a production Auth migration. Existing server token verification, current access checks and all cutover/credential gates remain required. No network or real credentials are used by these tests. Exact-candidate CI results belong in PR153; this document does not predeclare a PASS.
