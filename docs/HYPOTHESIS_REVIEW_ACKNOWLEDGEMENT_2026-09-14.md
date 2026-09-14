# Exact-version hypothesis review acknowledgement

Status: isolated implementation; exact-candidate verification is required. This is not a production migration, source-admission decision, factual verdict or publication approval.

## Governing behavior

The existing [workspace contract](INVESTIGATION_WORKSPACE_BLUEPRINT_2026-09-06.md#observation-and-review-semantics) records explicit review of an exact version, an expected prior receipt, identical retries and a baseline that cannot move backward. [Review integrity](INVESTIGATION_REVIEW_INTEGRITY_2026-09-06.md) separates relevance decisions, factual verdicts, confidence, publication and workspace review receipts. The owner's versioned-assessment requirement also keeps human review distinct from likelihood and publication. This extension records the same kind of per-user acknowledgement for a hypothesis revision; it does not invent a policy for approving the underlying assessment.

## Implementation

014_review_acknowledgements.sql adds an append-only, FORCE-RLS table owned by the existing NOLOGIN/NOBYPASSRLS hypothesis owner. The execute-only trusted gateway may call acknowledge_review and review_history but cannot read or write the table directly. Workers and public roles receive no access. The verified Auth UUID comes only from the trusted handler; browser JSON and GitHub identities cannot designate a database principal.

An acknowledgement binds investigation, immutable revision, submitting reviewer, request identity, expected preceding receipt and a monotonically increasing per-user receipt sequence. A repeated identical request returns its original receipt after current membership and evidence permissions are checked again. New requests cannot move the baseline backward or create a second acknowledgement for the same revision. An older readable revision may be acknowledged while a newer revision exists; that does not cover the newer revision. Source changes and pending reassessment remain visible and unresolved.

The function obtains the current history permission/membership fences, then the question serialization lock, and rechecks permission-checked history after any wait. A missing serialization fence fails closed. Revocation-first rejects acknowledgement; acknowledgement-first can commit while revocation waits. Append-only receipts and their predecessor links survive restart/replay without modifying the saved assessment or the existing workspace review pointer. Receipt recorded_at is not proof of historical commit visibility; that separate feature remains open.

The history reader returns only the current user's receipts and whether each target remains available under current evidence permissions. It returns no other reviewer identity, rationale, source text or new approval state. A withdrawn permission does not erase an old receipt or turn that receipt into continuing authority.

The optional private-history interface offers an explicit acknowledgement action. It freezes uncertain requests for identical retry, requires explicit refresh after a baseline conflict, checks returned request/revision/sequence bindings, and reads the history back before displaying the result as confirmed. Scope changes, logout and unmount invalidate late responses. The saved panel labels its immutable review field as the saved review state, distinct from the user's later acknowledgement.

## Verification scope

Native PostgreSQL additions cover explicit/non-mutating behavior, concurrent identical and conflicting requests, old-version/new-version ordering, cross-user request reuse, viewer/revoked access, revocation ordering, process loss, RLS/grants, missing targets/fence and source-change preservation. The full worker fixture loads the extension and proves the worker cannot call it or read its table. Frontend/transport tests cover identity injection, receipt tampering, exact retry, missing readback, baseline conflicts, backward movement, duplicate clicks and late logout responses. Chromium/WebKit tests add a synthetic acknowledgement after the actual authoring flow and verify that the assessment remains unchanged.

All native and browser data are synthetic. The browser receipt fixture is in memory and is not durability evidence; native PostgreSQL/process-loss tests provide that separate evidence. No live Auth, provider, source retrieval, credential, schedule, deployment or publication is introduced. CC remains closed 3/3. Production cutover stays ON HOLD.

Technical reference: PostgreSQL [row security](https://www.postgresql.org/docs/17/ddl-rowsecurity.html) requires FORCE RLS to subject a normal owner to policies; table-wide mutation guards are separate from RLS. Existing isolated ownership and immutability controls are retained.
