# Retrieval generation readback — bounded qualification

A deterministic malformed-response counterexample at main
8e219cf63c4ebc9438f838eca83c49996f0f1a92 returned `completed` after the initial
two-target manifest was replaced by a zero-target manifest with the same run ID,
a different source capture and a different snapshot hash. This is a reproduced
adapter validation failure, not observed production corruption or a claim that
ordinary database writes can modify a frozen manifest.

The shared runner now checks manifest identities, ordering, uniqueness, source
exclusion and hash shape. It copies the initial manifest and binds final readback
to the same job, source, contract, snapshot hash, target sequence and refresh flag.
Progress may advance but cannot regress; an observed completion timestamp cannot
be rewritten. Malformed initial state cannot be converted to success by a later
valid response. An unavailable initial transport response can still recover the
explicitly requested run through a valid durable read. Lost committed page
responses remain recoverable without synthetic queue finish/fail calls.

Hash comparison detects a changed database-issued hash. It neither recomputes
PostgreSQL JSONB hashing nor establishes source authenticity. Completion retains
its existing meaning: private lexical enumeration of a bounded retained-capture
manifest, not semantic correctness, independent corroboration or publication.
No source timestamp, evidence payload, assessment, identity or release gate changes.

## Qualification

The actual current retrieval SQL emits the required fields and sorted unique
target UUIDs. Existing PGlite integration tests exercise the shared runner,
hosted handler, immutable SQL outputs, lease recovery and lost responses.
New tests cover source/job/hash/target/refresh substitution, shared-object
mutation, malformed initial responses, regressed progress/completion and
unchanged-generation recovery. Hosted and operator fixtures now include the
source and hash fields present in real database responses.

Read-only observation on 9 September 2026 found live capture-retrieval v5 with
JWT verification enabled; its complete five-file package exactly matched main.
The patched runner read existing run ac8f46a7-455b-4e77-b859-f71101351a93
through the actual read RPC twice and returned completed with zero pages and
zero targets. This is compatibility evidence for the existing empty manifest,
not nonempty production processing or a new authenticated hosted request.

Exact CI, deployment and postmerge live receipts belong in PR #128. No release
is claimed by this document before those gates pass. The full browser preview
trigger includes this worker change so prior visible behavior is checked.

## Remaining pathway

This closes only the runner's observed-generation readback invariant after
qualification. It does not add a comparison worker/output contract, validate
every generic work_ref, migrate schedules or repair the live legacy broad
pending-job acknowledgement. Generation-bound comparison outputs with atomic
acknowledgement, multi-connection interleavings, operational/history/Auth/external
runtime parity and positive production operator journeys remain required.
No legacy backend is safe to retire. Markets identity/rights and remaining
Visual Fidelity qualifications remain pending independently.

Work is performed directly in GitHub and Supabase with remote CI; no local
project files are created. No migration, schedule, credential, publication or
provider setting is changed. Existing authentication remains as documented by
[Supabase's function authorization guidance](https://supabase.com/docs/guides/functions/auth).
