# MIP production cutover review packet — 10 September 2026

**Packet id:** `MIP_PRODUCTION_CUTOVER_REVIEW_v1`  
**Production cutover:** ON HOLD  
**Independent review:** not performed (Grok not contacted; no credentials, write privileges, or release authority supplied)  
**Owner acceptance:** `verifier/mip-production-cutover-review-v1/OWNER_ACCEPTANCE.json` remains `NOT_SUBMITTED`

This is the proposed disclosure packet for the owner to supply to a separate Grok technical-review track. This implementation agent does not transmit it.

Start with `verifier/mip-production-cutover-review-v1/README.md` for the final exact-candidate receipt and `verification-history.json` for superseded versus current evidence. GitHub reports the repository as public; disclosure rights require owner review.

## Frozen candidates (do not mix)

| Candidate | Commit | Meaning |
|---|---|---|
| Operational baseline | `1dc317200b7a928fad85d06b43351b60e2a50d92` | `main` after PR #146. GitHub `main` still pointed here when this packet was prepared. |
| Review packet tree | SHA-256 list in `verifier/mip-production-cutover-review-v1/disclosure-manifest.json` | Isolated capability work plus secret-free docs/JSON. `review_packet_commit` is stamped to the git commit that contains this tree. A later stamp supersedes an earlier one; do not mix hashes across stamps. |

If a file’s bytes differ from the manifest, it is a different candidate. Candidate `3b810b538e409ad023e66deb83299d6092462636` is superseded by the current stamp after the native-concurrency waiter-session cleanup fix. Live inventory in `runtime-inventory.json` is dated evidence from this run, not from the baseline commit’s wall-clock.

## Evidence classes (reviewer must keep them distinct)

| Class | What it is | In this packet |
|---|---|---|
| Artifact inspection | Reading checked-in source/docs | Qualification SQL, v16 snapshot, workflows, this packet |
| Implementation-agent live inventory | Fresh live metadata the packet-preparation agent collected; not independent reviewer reproduction | Project status, Edge Function version/`verify_jwt`/`ezbr_sha256`, cron active flags, Auth **counts**, qualification schema **absent** |
| Supplied implementation-agent results | Tests this agent ran in disposable PGlite | `tests/comparisonCapabilitySeparation.test.mjs` and sibling qualification tests when CI/local Node runs them |
| Missing evidence / NOT TESTED / BLOCKED | Unperformed or excluded | See `known-limitations.json` |

Unperformed checks stay **NOT TESTED** or **BLOCKED**. A favorable design review of isolated SQL is **not** production approval.

## Disclosure

Proposed machine-readable manifest: `verifier/mip-production-cutover-review-v1/disclosure-manifest.json`.

**Included:** qualification SQL and tests; repo snapshot `source-comparison-run-v16`; evaluation harness; operator/comparison docs already in GitHub; packet JSON; `package.json` / `package-lock.json`; comparison Postgres and Cloud Run workflow files (secret **names** only).

**Excluded:** credentials and tokens; Vault values; Auth emails and session IP/user-agent/refresh-token material; private investigations; raw production payloads; live Edge Function **bodies**; `cron.job` command text; golden/third-party article bodies; the unrecovered 10 September owner-decision-brief body.

Redaction is omission of whole classes. Test assertions were not rewritten to hide failures.

Where excluded material is required for a conclusion (byte-compare of live v15, identity merge, secret-holder inventory), the resulting limitation is recorded in `known-limitations.json`.

## What was qualified in isolation

Load `contract.sql` → `selection.sql` → `capability.sql` in disposable Postgres only. Exact RPC signatures, grants, RLS, diagnosis, revocation, request correlation, publication follow, and pending-as-pending parity: `docs/COMPARISON_CAPABILITY_SEPARATION_2026-09-10.md` and `rpc-signatures.json`.

Publication release and membership auto-approval stay **disabled** (default gates false). Automatic membership approval has no isolated release path.

Unbound `service_role` `enqueue`/`claim`/`complete`/`select_output` remain ambient authority. That hole is demonstrated, not closed, on live projects.

## Semantic evaluation (proposal only)

`evaluation-policy.json` / `docs/MIP_SEMANTIC_EVALUATION_POLICY_PROPOSAL_2026-09-10.md`.

Thresholds are **null**. They were not chosen to fit held-out performance. Owner must freeze the policy and split **before** final evaluation. Implementation-agent labels and model agreement are **not** ground truth.

## Runtime / permission proposal

`runtime-permission-proposal.json`. Design starting point only — not authorization to create live roles, grant EXECUTE, or bind workers. Unresolved bindings (Auth mapping, live `service_role`, `verify_jwt=false` functions, v15 vs v16) need owner decisions listed in `remaining-dependencies.json`.

## Staging

`docs/MIP_CUTOVER_STAGING_PROPOSAL_2026-09-10.md`. Isolated qualification (this packet) ≠ proposed later shadow/canary ≠ cutover. This prompt authorizes none of the later stages.

## How to run the disclosed tests (no production)

```text
npm ci
node --test tests/comparisonGenerationTransaction.test.mjs \
  tests/comparisonSelection.test.mjs \
  tests/comparisonSourceSnapshot.test.mjs \
  tests/comparisonCapabilitySeparation.test.mjs \
  tests/cutoverReviewPacket.test.mjs \
  tests/recordCandidateEvaluation.test.mjs
```

Native concurrency (`verifier/comparisonPostgresConcurrency.py`) runs only in GitHub Actions with `MIP_DISPOSABLE_POSTGRES=comparison-qualification`. Locally it is **NOT TESTED**.

Do not apply these SQL files as migrations. Do not deploy Edge Functions from this packet. Do not enable publication.

## Retained review result

`verifier/mip-production-cutover-review-v1/REVIEW_RESULT.json` is the machine-readable slot for the eventual independent review. `status` is `PACKET_PREPARED_REVIEW_NOT_PERFORMED`. `outcome`, `pass`, `fail`, and `owner_acceptance` are **null**. Do not treat this file as a completed review.
