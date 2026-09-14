# Cursor PR155 remediation: synthetic transport only

This candidate corrects the six findings retained at [18b6d632/result.json](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/blob/18b6d63285821d816ae26d5d184b068fd5aabb5e/verifier/independent-pr155/result.json). The original PR155 candidate c6dd9ed689f51d90c54f9319a9ea3fa92f389fbd and its request/result are unchanged.

## Evidence meaning and boundaries

A controller v2 request embeds its UTF-8 evidence inventory. Each entry has a unique ID and path, exact byte length and SHA-256, explicit requirement IDs, declared layer role, and content. The packet digest covers the entire inventory; the request digest binds the candidate, inventory, requirements and identities. Packet tokens must resolve to these entries. Invalid UTF-8 round trips, stale bytes/hashes, duplicate identities, unknown references, omitted requirements and references to another requirement are rejected.

Protocol file entries carry the same path/byte/hash/role/requirement association, additionally bound to the independently supplied authority object and actual Buffer map. Backend paths are limited to supabase/functions, supabase/migrations, supabase/qualification; frontend paths to src/docs; cross-layer paths to tests. All required layers must have declared evidence; each PASS row must cite its own declared evidence.

These checks prove association and integrity of supplied artifacts only. Paths and declared roles do not prove semantic adequacy, runtime behavior, data access safety, or independent reproduction. An artifact_inspection PASS remains artifact inspection; an independently_reproduced_this_run label remains a synthetic fixture assertion until an authenticated independent transport and verifiable execution receipts are implemented. Nothing here certifies actual MIP frontend/backend behavior.

Controller schema version 2 is intentionally incompatible with v1 token-only requests. Existing frozen requests/results and Stage1 evidence remain historical artifacts; they must never be rewritten into v2. New requests use new IDs/candidates.

## Seven review requirements and findings

| Review requirement | Implementation/evidence |
|---|---|
| Frontend/backend/cross-layer coverage | validation.mjs binds declared requirement IDs and layer roles to exact artifacts and PASS references; adversarial omission, wrong-path and wrong-requirement cases cover f1/f2. |
| Bounded Supabase paths | Shared allowlist plus config.toml, seed.sql, .env, traversal, AGENTS exclusions and functions/qualification positive cases cover f6. |
| Candidate/authority/result binding | Existing immutable candidate bindings retained; controller packet now binds embedded inventory; protocol authority includes all new file metadata. |
| PASS/FAIL/BLOCKED and concrete findings | Both validators use exact finding/blocker schemas, evidence references and row status; every failed/blocked row needs its own details. f4 corrected. |
| Immutable evidence and no self-approval | Exact nested protocol schemas reject approval/unknown fields before persistence (f5). Detached snapshots fix controller mutation between validation, adapter awaits, serialization and delivery digest. |
| Real activation fail-closed | Controller synthetic v2/test-double and protocol synthetic-only gates remain. Returns never grant merge/approve/publish. No credentials, real provider, wakeup or live database wiring. |
| Material regression tests and CI provenance | Exact baseline modules from c6dd9ed are retained solely for executable counterexamples. regression.test.mjs demonstrates original acceptance; adversarial.test.mjs demonstrates corrected rejection. Tests run on GitHub-hosted CI. f3 corrected by explicit SHA separation. |

The failed run 34829897401 checked intermediate a500ef1, not c6dd9ed. Run 34829990489 passed c6dd9ed's 61 tests but did not test the defects above. Neither is evidence that this correction passed. Use this candidate's own commit/run IDs and logs.

## Remaining activation gates

Real transport, authenticated provider identity, independently protected controller/authority/publisher, protected refs/rulesets, disclosure authorization and runtime reproduction receipt verification remain unconfigured. Synthetic PASS proposes authorized engineering continuation only. No automatic approval, merge, publication or production authorization exists. Real reviews require a fresh independent review of this new frozen candidate; this implementation note is not that review.
