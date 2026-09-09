# Comparison input fingerprint correction — 2026-09-09

The recovered Manus source-comparison-run v11 package exactly matches the retained v10 snapshot. Its old membership key includes only event ID and each member's ID, publication timestamp, title and URL. Summary or canonical event-title corrections can change the existing scorer result while retaining that key. The existing ignore-duplicates insert can consequently suppress the revised result.

The complete v12 candidate retains the previous metadata and adds the independently versioned mip-membership-input-v2 contract and a SHA-256 digest of all selected event/article values and the normalized release gate actually consumed by the scorer. Object keys are canonicalized; array order and timestamp strings are preserved. Invalid, cyclic, sparse or unsafe JSON values fail before score persistence. This binds consumed JavaScript values, not a canonical raw PostgreSQL representation or an authenticity claim. Additional article bodies, summaries and embeddings are not copied into fingerprint metadata.

The scorer library, lexicon, model version, authorization, projection, approval and queue code are unchanged. Historical score/audit rows are not rewritten. Corrected inputs receive distinct keys through the existing score/audit association. This is not immutable input capture, a publication decision, a queue generation contract, or a fix for the broad pending-row acknowledgement race.

Before this candidate, both deployed release policies had fixture_passed=true, auto_approval_enabled=false and a null threshold (read at 2026-09-09 04:11:58.285822+00). Deployment requires successful exact-head tests/build/browser checks and normal merge, followed by complete package deployment with JWT verification retained and exact source/policy readback. Production deployment is pending at this commit.

The generation-bound output/acknowledgement contract, collector cutover, legacy retirement, Markets authority and existing polar coverage gap remain separate pending work.
