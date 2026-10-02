# Search and Following review dispositions — 2 October 2026

These bounded assessments address the independent review of frozen source `670efb8ebd6b4d7fb09368d399fe5a2afbc03a77`, tree `de8b46f03beba9ec3d7d2424f292c5ff0580e6b4`. They preserve that candidate's **REPAIR REQUIRED** verdict for its separate consequential findings. Neither assessment edits source, grants publication authority or qualifies a live installation. Uncertainty definitions remain in [the single-source vocabulary](UNCERTAINTY_VOCABULARY.md).

## Reviewed Search: no consequential defect

Nonempty production News/Explore queries first use the canonical reviewed-public Search RPC over frozen reviewed titles, summaries and exact authorized evidence spans, then intersect its IDs with the current public projection. The disabled `body_text.ilike` branch is not the complete Search path. Search and source metrics share this implementation.

Actual disposable SQL and the installed SDK confirm that a token present only in an admitted span is found, while private capture remainder, mutable article body, pending captures, unreviewed candidates, withdrawn versions and revoked nested evidence are excluded. A withdrawn source between Search and projection reads produces no result. A superseding Source Report provides its permitted frozen title/summary without exposing the earlier body as current. Bounded overflow refuses with empty IDs and an incomplete-scope status.

Both runtimes pass 32/32 focused tests. The external reproduction supplements unchanged production Search tests and pins the frozen candidate. This proves the bounded authorized public corpus, not full-capture text search, reporting completeness or an atomic snapshot across separate RPC/projection requests.

Assessment manifest SHA256: `9669bae0c9e0531ff7d42cfd700af768c268fd624c36905701d52f08eddcd73b`. Node22 TAP SHA256: `cf9b881a73465d4b4048402c7f23eeecc1bd18dcfea01a643131b5591f80f21c`. Node24 TAP SHA256: `6bfece83b70d3149c52985a5dcfae78a89fd544c6fb750d1c9b5562c46960451`.

## Following replay: historical receipt is not current state

An exact retry of an earlier successful subscribe returns its immutable historical write receipt after a later unsubscribe. It does not renew Following, append an event, advance acknowledgement or change the current CAS cursor. A fresh current-state read remains unsubscribed, and the list excludes it. Reusing the old cursor for a new mutation conflicts; changing the event payload conflicts; another account cannot replay the foreign receipt.

Production controls withhold personal payload while saving, verify the actor/event/subject/displayed-version receipt, and then confirm with a foreground current-state read. Mounted production controls through actual proposed SQL, the gateway and installed SDK show only the confirmation state while that read is pending; they do not paint the historical active receipt. Account switch, logout and late confirmation tests retain isolation. Same-account re-entry issues a fresh read. Source restoration plus receipt replay does not resume revoked Following.

Both runtimes pass 10/10 focused tests. The gateway remains private/no-store and there is no personal cache, automatic mutation retry or background polling in this path. A completed foreground read can become outdated after a later action in another session; this is not an absolute real-time freshness claim or hosted-account qualification. External push/email remains post-launch.

## Durable evidence and limits

The unchanged complete assessments, external tests, raw receipts and hashes are retained in Library `libfile_861bfc128c188191b2c1a5c74faa1a3a`, ZIP SHA256 `62f78086f3066cd3c63bde061ce9a65a3e54fcae032dc94c231b9bb5abf57b1e`. Disposable PGlite/SDK and mounted application qualification is distinct from native PostgreSQL17, independent connections, live Auth/PostgREST, protected installation, source admission and release. No review dispatch, protected mutation, paid provider, merge or deployment occurred in these assessments.
