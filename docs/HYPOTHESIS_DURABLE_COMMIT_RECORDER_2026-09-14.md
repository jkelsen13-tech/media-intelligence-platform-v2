# Isolated durable commit metadata recorder — September 14, 2026

This extends the disposable logical-decoding experiment without enabling historical-time reads. It changes no production schema, role, credential, stream, schedule or publication gate.

## Contract implemented

`supabase/qualification/hypothesis-assessments/commitRecorder.mjs` admits an explicit metadata-only envelope: configured source UUID and stream incarnation, canonical full-width commit LSN, decimal transaction ID, separate commit clock time, and revision/observation-epoch/full-transaction identifiers. Unknown fields, decoded bodies, duplicate revision identifiers, mismatched transaction IDs and malformed metadata deny. Positions and transaction identifiers never pass through JavaScript Number.

The recorder detaches the envelope before awaiting storage, writes via the existing exact-content encrypted journal, requires a committed receipt, then verifies exact readback before calling the source acknowledgement adapter. Conflicts do not replace retained records. Lost write/read/acknowledgement responses require exact replay under current authority; no cancellation, reset or inferred success is introduced.

## Verification scope

Four ordinary regression tests exercise strict metadata binding, exact ordering and fail-closed uncertain storage. Six native subtests plus their enclosing test exercise the established disposable PostgreSQL encrypted journal, conflicting replay, cross-runtime read exclusion, absence of application enqueue capability, actual network-disabled read-only container termination after put/read/acknowledgement, fresh-session replay, and current mapping revocation preserving stranded records.

All material and acknowledgements in these new tests are explicitly synthetic. The acknowledgement fixture persists a synthetic source receipt; it does not acknowledge a live PostgreSQL replication slot. Existing native decoding tests separately establish actual committed-output and replay behavior. Connecting the two safely remains an engineering requirement.

The fixture uses a separate synthetic runtime, session and encryption key, with no source/application capability, using the existing producer principal vocabulary. This is not an approved production consumer identity or proof that the final consumer authority model is complete. Workers cannot use their runtime journal to qualify temporal evidence.

## Remaining requirements and authority

Still required: a bounded production-shaped decoder adapter; consistent snapshot/stream bootstrap; durable contiguous coverage/checkpoint and gap detection; source incarnation and restore invalidation; independently controlled temporal-consumer custody; and source acknowledgement serialized with current consumer authority. A recorded commit alone establishes none of these. Commit clock time is not global read visibility. `historical_time_qualified` remains false.

Owner authorization will be needed for exact production source/runtime identity, a dedicated least-privilege consumer mapping, remote custody and approved restore/epoch operations, plus any live bounded trial. No credential is needed for these disposable synthetic tests. The current policy, rights, F2, D4/D5, publication and cutover gates remain unchanged. CC remains closed at 3/3; no fetch is added.

This component is not yet independently reviewed. The coherent review boundary has not been reached solely by implementing it. CI results must be recorded against the actual candidate after execution; this document does not predeclare a PASS.
