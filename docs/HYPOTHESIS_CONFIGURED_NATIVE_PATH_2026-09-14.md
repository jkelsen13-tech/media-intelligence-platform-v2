# Configured internal hypothesis path — synthetic native integration

This test connects the shipped hypothesis client, Request/Response handler, parameterized store and durable worker to real disposable PostgreSQL gateway functions. It uses server PREPARE/EXECUTE with the store's fixed SQL and separately quoted argument values. Each database call executes under mip_hypothesis_gateway, with no direct table access. The existing durable worker uses its distinct runtime role and encrypted journal.

It exercises configured retained authoring reads, exact generation capture retry, ledger inspection, durable computation, history/backlog contract validation, lost review response after commit, exact acknowledgement retry/readback, unchanged assessment, cross-investigation denial, permission revocation and membership revocation. Wrong synthetic authentication, caller identity injection and wrong origin are denied before a database query.

The fixture transport now preserves the PostgreSQL SQLSTATE on its sanitized exception so the actual handler maps permission rejection to access_denied. It still emits no SQL, values, source content or credentials in errors.

Authentication is explicitly a synthetic callback. This is not a provider-token verification, browser-to-live-network test, live gateway deployment, external workload identity qualification, production credential or model evaluation. Browser interactions have separate synthetic tests. Production-shaped transport/Auth/custody and trustworthy historical visibility remain open.

Exact candidate CI must pass before these new assertions are reported as verified. No new source capture, CC retrieval, production database change, schedule, external disclosure or local project storage is involved. PR153 remains draft and cutover remains ON HOLD.
