# Terminal output rejection regression — synthetic only

This test-only candidate adds ten table-driven regressions over the existing accept and receive APIs. It does not change their parser assumptions, exact schemas, controller, lifecycle, persistence contract, provider integration or authority.

Each API receives five synthetic nonconforming values twice: narrative, narrative containing a complete otherwise-valid and request-bound PASS report, an unfilled template, truncated JSON, and a FINISHED provider wrapper containing an otherwise-valid report. Tests require schema/object rejection before result-store access/write and before any accepted outcome, remediation proposal or delivery key can be returned. The controller retains only its pre-existing reservation; the protocol never calls putOnce.

The complete embedded PASS object makes this more than an invalid-placeholder test: future narrative extraction or provider-wrapper unwrapping at this boundary would violate the regression. No actual review output or packet is copied, parsed for a verdict, normalized, retried, resumed or transmitted. Provider completion is not evidence acceptance. Existing separate valid-result exact-delivery and conflicting-result tests remain responsible for accepted report idempotency.

This qualifies only the existing pure synthetic acceptance boundary. It does not implement or prove a raw-response quarantine, authenticated provider lifecycle, durable real publisher/dispatcher, downstream exactly-once remediation, or real terminal callback.

The existing protocol binds per-file UTF-8 byte lengths/hashes and packet digests. This regression neither invents a token/context threshold nor infers why any provider produced narrative. Per-file integrity metadata is not a model context-admission policy; any future capacity contract requires verified provider limits and separately scoped design. The frozen base and its accepted audit remain unchanged; this new test candidate requires its own verification and does not inherit independent acceptance.
