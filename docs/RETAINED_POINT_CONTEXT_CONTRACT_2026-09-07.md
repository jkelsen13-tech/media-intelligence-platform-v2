# Retained point-context contract

Baseline: main `e7f70fd87edc0077c14d3cb1738032f1e19ae4f6`, after the verified no-fee weather backfill (#79).
Governing plan: [owner plan and embedded prompt](MIP_GOVERNING_WORK_PLAN_2026-09-07.md).
This is the next shared-context foundation slice, not a new live data source.

## Scope and exact paths

- `scripts/retainedContextObservation.mjs`: offline, in-memory point-context snapshot,
  exact payload and snapshot hashes, bounded field validation and before/after receipts.
- `tests/retainedContextObservation.test.mjs`: synthetic counterexamples and mutation tests.
- This document and the updated [backfill tracker](NO_FEE_WORLD_VIEW_BACKFILL_2026-09-07.md).

No frontend import, backend route, database schema, migration, ingestion, queue claim,
scheduler, model, dependency or release policy is changed. No provider is fetched.
No new software/data/service/license/NOTICE inventory entry is introduced: implementation
is project-owned code using the existing Node runtime's built-in crypto module. No donor
code, third-party model or dataset is copied. NASA POWER/GHCNh remain pending rights review.

## Why this contract comes before an adapter

A future point-weather adapter must not collapse these distinct facts:

- A historical modeled hour and the much later retrieval/recording time.
- A day-precision publication date and a precise UTC publication instant.
- A real numeric zero, a missing value, a string and an invalid number.
- An instantaneous measurement, an interval mean and accumulated precipitation.
- A provider's wrapper and its shared upstream origin.
- Changed source bytes, changed metadata, changed rights and a changed conclusion.

The existing private capture-context proposal was read before this slice. Its
`source_article_snapshot` identity, raw Unicode spans and typed annotations remain
unchanged; this context contract does not cast its records into graph nodes, captures,
comparison events, private assessment candidates or queue positions.

## Input and identity

Contract: `retained-point-context-1`. One input contains exactly `source`, `clocks`,
`geometry`, `measurement_kind`, `measurements`, `payload` and `rights`.
The executable synthetic fixture in the test file is the complete shape example;
it is explicitly not a real source approval.

Source identity includes provider, product, release, record ID and a declared upstream
origin (or null). Rights assertions bind the same provider/product/release, plus a review
ID, version and exact review time. An unknown review check or operation permission fails.

The snapshot retains original strings and values; it does not convert units, smooth,
interpolate, round, geocode, infer heights or parse provider payloads. Payload hash is
SHA-256 of the exact retained well-formed UTF-8 text, including whitespace. Snapshot hash
covers the contract, full source/context metadata, payload text/hash and rights record.
Rights have a separate hash. Input object-key order does not alter identity; changes to
payload bytes, source release, clocks, measurements, geometry or rights do.

Returned snapshots are deep-frozen copies. Later caller edits cannot mutate them.
The before/after comparator reconstructs and revalidates both snapshots from their raw
inputs, never trusting a supplied snapshot hash, public eligibility flag or review result.

## Time and measurement boundaries

This first slice supports historical point observations, models and estimates. Forecast
mode, polygons, rasters, provider-specific missing sentinels and mixed temporal calendars
require explicit future contract work rather than silent fallback.

All precise times require explicit UTC seconds, optionally milliseconds, and valid
calendar dates. Local/offset strings are rejected rather than implicitly reinterpreted.
Publication keeps its explicit `day`, `instant` or `unknown` precision; null publication
never becomes a retrieval timestamp. Valid time is a nonempty half-open interval.
Retrieval cannot precede the end of that historical interval, and recording cannot
precede retrieval. Older valid data arriving later is allowed and labeled reconstruction.

A sample starts inside the valid interval. An instantaneous sample has no fabricated
end; means and accumulations have explicit positive intervals within the record interval.
A stale preceding hour cannot be carried forward. Numeric values require a unit and a
quality state. Missing values must be null with a reason; blank strings, booleans, NaN,
Infinity and undefined do not become zero. Known zero remains zero.
Point coordinates have numeric longitude/latitude bounds and explicit grid/station/
reported-point precision, resolution and method. These validate shape, not real accuracy.

## Rights gate and authority limitation

The owner's commercial-use, redistribution, attribution, patent/license compatibility
and service-terms checks must each be explicitly `confirmed`, with software/data/service/
notices references and a no-fee assertion. Each operation permission must be known;
retention and analysis must be permitted to construct this retained analysis context.
Known restrictions on display/export/redistribution can remain false and are preserved.
A notices reference can document why no notices apply; an empty reference array cannot
silently make that determination.

**These are operator-supplied assertions, not authenticated registry decisions.**
The validator does not determine legal permission, review source documents, authenticate
a reviewer, check revocation, enforce grants or activate a provider. Passing a synthetic
fixture does not qualify any real source. No operation executes based on these flags.
Live integration remains blocked until a protected registry resolves the exact reviewed
source/release and permissions, including revocation/current-service checks.

Likewise, provider values and normalized measurements are operator supplied. The module
does not prove a number was parsed faithfully from payload text, establish measurement
accuracy, validate semantic evidence or certify source independence. A qualified adapter
must prove exact payload-to-field mapping with provider-specific tests before live use.

## Evidence, lineage and history

Every output is `context_only`, `publicly_eligible: false`, with null independent-source
count and explicit unverified operator authority. Two wrappers declaring the same upstream
receive `same_declared_upstream`; different or missing origin IDs yield
`independence_unknown`, never independently corroborating evidence.

All snapshots say `reconstruction`. Caller-recorded clocks are not an authenticated
MIP ledger, so historical/as-of and activation options are refused. An as-known-then
read path requires trusted server timestamps, authorization and ledger integration.

Comparison binds exact before/after snapshot hashes for the same provider/product/record,
and separately reports payload, rights and metadata changes. It always returns
`reassessment: not_run` and `conclusion_change: not_evaluated`. It neither changes a
NASA assessment nor marks a version reviewed. Existing evidence admission and review
receipts remain the only path for those actions.

## Bounds, validation and next ready work

One record: at most 128 KiB JSON, 64 KiB exact payload, 24 measurements, 16 quality flags
per measurement, 16 references per rights category, nesting depth 12 and 10,000 traversed
values. No network, disk write or global collection exists in this module. Callers must
keep future private inputs outside public logs and enforce retention/export authorization.

Required validation: full Node 22/24 suites and production builds, plus the new adversarial
fixtures for time separation, invalid dates, stale samples, precision, missing/zero,
rights uncertainty, exact release binding, shared upstream, immutable snapshots and
explicit non-reassessment. There is no UI change requiring a new visual design; the
deployed app must still be checked after merge and its bundle compared with Pages output.

Next ready: source-specific review for one bounded POWER/GHCNh example and a protected
rights registry integration design; independent dependency/advisor maintenance may
proceed. No weather activation or pending-job qualification is implied by this contract.
