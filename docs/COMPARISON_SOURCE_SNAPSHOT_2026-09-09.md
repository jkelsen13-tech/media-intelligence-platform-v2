# Comparison source snapshot qualification

The retained v16 worker reads events, membership, article outlets, detailed article
rows and configuration using separate requests. Even exact per-request readback
does not establish one source state across those requests.

This isolated package reads the four source relations under one PostgreSQL STABLE
function snapshot and retains the resulting payload plus its job atomically.
It preserves the established approved, non-timeline, multi-outlet eligibility.
Selected events, articles and membership rows are retained in full; raw config
rows, the supplied lexicon and implementation reference are included. Ordered
arrays make row ordering explicit. PostgreSQL JSONB text preserves numeric
precision; timestamp serialization uses UTC without inventing source precision.
Missing configuration stays absent; malformed configuration stays malformed and
must fail the existing consumer validator. No automatic repair or approval occurs.

The wrapper uses the literal qualification-source namespace. It is not deployed,
a production source attestation, an evaluated caller authorization, or a real
producer activation. Test fixtures model the relevant source columns; production
relations, vector types, privileges, rights and full-corpus sizing still require
integration qualification. The caller-supplied lexicon/reference are retained
bindings, not independently verified build or evaluation receipts.

Snapshot metadata is diagnostic: statement start and the MVCC snapshot string are
not source event time, an historical as-of reconstruction, a commit-order cursor
or a proof that all later changes were observed. Retention/observation occurs after
capture. A later correction creates a separate input; no old generation is changed
and no legacy queue is acknowledged. Retention remains limited to 2 MiB and fails
atomically if exceeded. No truncation, partial success or automatic sharding.

Four PGlite tests cover exact retained precision/provenance and actual projection,
later independent generations, eligibility/config semantics, rollback/bounds and
browser denial. Two native PostgreSQL tests cover observer invisibility/rollback
and a fixture-only advisory-lock barrier: the capture starts and blocks, another
connection commits coordinated event/article/membership/config changes, then the
capture resumes and must retain all old values. A subsequent capture must retain
all new values. The actual blocking PID is observed before the correction commits.

Read-only live catalog checks on 10 September 2026 UTC confirmed the relevant
column sets on Manus and survivor. At 01:05:29–30 UTC, sizing found Manus four
eligible events / eleven distinct articles / 33,034 selected article JSON bytes,
and survivor one / three / 2,516 bytes. These omit envelope, repeated membership,
full-row extras and lexicon costs; they are not final capture-size certification,
corpus parity or historical receipts. No source text or private rows were exported.

This completes only source-snapshot transaction qualification. Real producer
deployment, evaluated authority and artifact identity, operational recovery policy,
delta/backlog reconciliation and immutable public projection selection remain
required before cutover. Other existing Auth, Markets rights/evidence, physical
device and external runtime gates remain pending. No legacy backend is SAFE TO
RETIRE. All edits and tests are remote; final receipts are on the PR.

Reference: [PostgreSQL function snapshot semantics](https://www.postgresql.org/docs/17/xfunc-volatility.html).
