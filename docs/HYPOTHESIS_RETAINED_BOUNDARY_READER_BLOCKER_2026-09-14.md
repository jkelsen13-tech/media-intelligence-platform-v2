# Internal retained-boundary prefix dependency — reader blocked

Frozen base:208e160684407e5856ad04209cbe45ba8e05b865. This candidate does not complete historical reading or the user addendum Phase A. It contains no application route, UI/scoring change, SQL migration, role/grant or production configuration.

## Concrete integration blockers

The registered custody envelope binds source/stream/binding/incarnation/contract. The existing application store independently queries permission-checked history using verified user and investigation IDs. No existing contract attests that those two configured adapters refer to the same current source incarnation. Matching logical UUIDs or an injected fixture database name is not an attestation and cannot establish equivalence after clone/restore.

Likewise, existing custody exclusion and a separate completed history query do not constitute one admitted source-authority/current-user-permission fence through combined delivery. A new trusted coordinator or explicitly authorized source-side combined interface is needed; this candidate does not invent one. Current authorized history is not acquired by the prefix verifier.

## Reusable internal work

The prior consumer verifies and acknowledges individual deliveries; it does not assemble a retained bootstrap-to-target read prefix. retainedBoundaryPrefix.mjs now verifies an explicitly supplied ordered capture-ID chain against retained bootstrap/pages, strict decoded typed deliveries, immutable revision commit records, exact coverage receipts and contiguous LSN endpoints. The terminal capture must be the expected marker. Missing, swapped, duplicate, omitted, conflicting or mismatched identity evidence rejects. Work is bounded to256captures,4096retained objects,64MiBserialized reads and100000revision IDs. Limits fail closed; they do not truncate a successful result.

The returned revision IDs are source-wide INTERNAL metadata. They are not an investigation response and must never be passed to the browser or interpreted as user authorization. The module performs reads only; it issues no marker, permit, source acknowledgement, history query or grant.

Every successful result explicitly returns source_authority_qualified=false, user_history_qualified=false and historical_time_qualified=false. proof_integrity_verified means consistency of the supplied retained artifacts only, not authenticity of arbitrary caller storage or continued source authority. In particular, valid retained integrity after source revocation must not restore reader permission.

Final exact readback detects observed loss/change; it does not promise atomic cross-store retention or protection against rollback between checks. Actual physical custody independence, authenticated same-incarnation adapter admission and joint permission fencing remain external requirements.

## Tests and untouched requirements

Hosted native tests reuse actual208narrow issuance/capture/consumer/advance and authenticated encrypted journal fixture. They cover fixed-prefix exclusion of later revisions, missing/swapped/omitted deliveries, pages and receipts, late basis loss, registration scope/incarnation mismatch, source revocation without fabricated authority, and actual journal mapping revocation. Existing native clone/restart tests remain inherited regressions, not proof of a newly implemented reader restore adapter.

The as_known_then selector still refuses arbitrary wall-clock requests. PostgreSQL marker/commit WAL positions and recorded commit clocks are not an admitted arbitrary-time visibility contract. Reconstructed-now remains an actual saved reassessment. No later inputs are substituted into saved records.

Independent review is parent-coordinated after exact candidate verification. No real data, new credentials, live Supabase operation, local project file, deployment or merge is authorized.
