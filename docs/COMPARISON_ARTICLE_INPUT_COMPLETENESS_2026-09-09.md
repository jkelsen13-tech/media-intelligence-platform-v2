# Complete requested article input reads

The live comparison worker's chunked detail reader accepted successful short
responses. Both projection and membership builders then filtered out missing
articles and proceeded with an incomplete member set. A two-outlet event could
therefore become a one-article input without an input-read error. This is a
code-level counterexample, not evidence of observed production loss: a read-only
Manus catalog/data check at 2026-09-09 19:47:46 UTC found zero orphan event/article
references. Concurrent reads are not an atomic retained snapshot.

The v15 runtime package adds an exact requested-ID check to the shared article
detail reader. Each chunk must return every requested ID exactly once, with no
unexpected identity or malformed row. Failure returns an input-read error before
projection cleanup or membership policy/scoring persistence. A failed later chunk
cannot return an earlier partial result. Complete reads retain original values,
member order, null semantics and timestamps without conversion or mutation.

Tests reproduce the old behavior through the actual worker input builders,
exercise both write entrypoints, cover short/duplicate/foreign/malformed results
and later-chunk failures, and verify complete 201-article reads. A source-delta
check protects unrelated authorization, scoring, release policy and queue logic.
No provider, publication permission, scheduler or schema changes are introduced.

This bounded guard does not prove complete initial pagination, coherent
cross-query generations, output atomicity or acknowledgement fencing. The legacy
broad pending-job acknowledgement race remains a cutover blocker. Reconciliation
must still bind durable semantic output to immutable input generations before
collector migration. Auth, Markets rights/evidence and physical-device gates
remain independently pending; no legacy backend is SAFE TO RETIRE.

All files are authored remotely. Qualification, deployed version/readback and
postmerge live evidence are recorded on the associated PR.
