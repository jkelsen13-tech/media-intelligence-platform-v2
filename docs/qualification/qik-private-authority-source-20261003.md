# Qik private authority verifier source — 2026-10-03

This branch adds real Ed25519 verification source for a bounded **candidate**
authority contract. It does not establish an accepted authority, accepted owner
attestation, qualified live client, or permission to connect. The production
registry has no roots and no clock, revocation-delivery or checkpoint-store
bindings. Every production phase authorization is refused.

Base: `675654be5a778c3173e682c4013031cb7796ed36`. The inherited rehearsal package,
original DO, target, eleven input names, and frozen source-lock files are unchanged.
No private baseline, credential, provider log, account, grant or database operation
is used. Signing keys generated in the tests are ephemeral **TEST FIXTURES ONLY**;
their private material is neither saved nor returned as a receipt.

## Source APIs

`scripts/qualification/backend-private-authority/production.mjs` exports
`loadProductionAuthorityVerifier()`. It takes no arguments and reads only the
fixed checked-in empty `trust-registry.json`, requiring its exact source bytes.
The result has `ready: false`, `acceptedRootCount: 0`, and
`code: TRUST_ROOT_UNBOUND`. Its `authorizePhase()` always returns fixed refusal
codes and `cryptographicValid`, `contextValid`, `trusted`, `liveAuthorized` all
false. Extra loader arguments, changed registry source and missing registry source
also refuse. Candidate policies and caller callbacks cannot activate this path.

`verifier.mjs` exports the pure, synchronous source/test API:

```js
verifyCandidateAuthority({
  authorizationEnvelope, // exact canonical JSON string
  bindingEnvelopes,      // one to eleven exact canonical JSON strings
  revocationEnvelope,   // exact canonical JSON string
  candidatePolicy,      // inert public key/issuer/usage/time proposal
  context,              // inert exact expected context and caller time
  checkpoint,           // inert private prior revocation/time observation
})
```

Even complete mathematical success returns only:

```json
{"code":"CANDIDATE_CRYPTOGRAPHIC_CONTEXT_VALID","cryptographicValid":true,"contextValid":true,"trusted":false,"liveAuthorized":false}
```

Failures return a fixed code, the cryptographic verification flag, and false
context/trust/live flags. They do not return exceptions, signatures, signed
evidence, issuer IDs, authorization IDs, nonce, private baseline, or hashes derived
from signed evidence. The candidate result must never satisfy a production gate.

## Proposed candidate encoding

This format is an inspectable implementation proposal, **not an already accepted
trust route or an instruction for an owner to create eleven keys or eleven manual
receipts**. One evidence authority key may cover all eleven names in one signed
batch. Several keys may cover disjoint explicitly assigned names. Actual acceptance
and the evidence delivery route remain external decisions.

Each envelope has exactly `version`, `kind`, `keyId`, `payload`, `signature`.
Version is `qik-private-authority-envelope-1`; kind is `authorization`, `bindings`,
or `revocation`. Signature is strict unpadded base64url encoding of 64 Ed25519 bytes.
Signed bytes are the ASCII domain `MIP-QIK-PRIVATE-AUTHORITY-1`, a NUL byte, then
the UTF-8 canonical encoding of the envelope's four non-signature fields. Thus the
domain, version, kind, key ID and complete payload are signed. The exported
`authoritySigningBytes()` gives these exact public-message bytes for source tests
and a future separately reviewed issuer implementation; it does not sign anything.

The candidate policy has exactly:

- `version: qik-candidate-verification-policy-1`, `audience`,
  `authorizationKeyId`, `revocationKeyId`, and exact eleven-name `bindingKeyIds`.
- `keys`: one to sixteen entries, each with exact `keyId`, `issuer`,
  `publicKeySpkiBase64url`, `usages`, `notBeforeMs`, `notAfterMs`. Only canonical
  44-byte Ed25519 DER SPKI public keys are accepted. Usages are `authorization`,
  `revocation`, or an exact `binding:<inputName>`. Key IDs are unique. No key
  delegation, wildcard issuer, embedded key discovery, certificate trust inference,
  alternate algorithm, private key input or runtime callback is admitted.
- `minRevocationGeneration`, `maxAuthorizationAgeMs`, `maxBindingAgeMs`,
  `maxRevocationAgeMs`, `maxForwardWindowMs`, `maxRecoveryWindowMs`. All are safe
  nonnegative integer bounds; duration bounds are positive, at most one hour except
  recovery at most one day. These are proposal caps, not approved execution times.

Authorization payload has exactly `issuer`, `audience`, `authorizationId`,
`executorId`, `clientId`, `independentVerifierId`, `target`, `source`, `issuedAtMs`,
`notBeforeMs`, `notAfterMs`, `recoveryNotAfterMs`, `revocationGeneration`, `nonce`,
and `scope`. The verifier ID must differ from the primary executor ID. Target is
the exact inherited qik project/database/table/predicate/column/operation/installed
manifest tuple. Public source fields are `frozenHead`, `guardedOperationSha256`,
`sourceLockSha256`, `bundleSha256`, `manifestSha256`, `clientArtifactSha256`, and
`authorityArtifactSha256`. Frozen head and original DO hash are fixed in source;
other public pins must exactly match the expected context. Caller-selected pins
in this test API are not a review or an accepted artifact binding.

Scope has exactly `mode: single-attempt-single-transaction-rollback-only`,
`forwardPhaseIds`, `recoveryPhaseIds`, and exact eleven-name `bindingIds` with
distinct identifiers. Phase arrays are unique subsets of the fixed source lists.
They include only the inherited protocol plus explicit connect and termination
control points. Unknown phases, COMMIT, grant enlargement, or a forward phase
presented as recovery refuse. The scope label is checked mathematically; this
stateless API does not enforce attempt counting or transactional execution.

A binding batch has the same common fields as authorization and replaces `scope`
with `bindings`, an array of exact `{inputName, bindingId}` records. Across batches,
each inherited input name must occur exactly once, use its designated key/issuer,
and reference its authorization's exact binding ID. All common context, windows,
nonce and revocation generation match authorization. Each batch has independently
bounded issuance freshness. A verified signature proves that a candidate key signed
this exact scoped assertion; it does **not** prove actual CA/TLS/logging/grant,
private-baseline or owner facts. The genuine evidence assessment remains external.

The current eleven names are copied exactly from
`backend-live-rehearsal/required-inputs.json` and checked against it in tests.
No populated string, boolean claim, nonnull object or LLM output is treated as a
signature or an accepted evidence authority.

Revocation payload has exactly `issuer`, `audience`, `generation`, `issuedAtMs`,
`notBeforeMs`, `notAfterMs`, `revokedKeyIds`, `revokedAuthorizationIds`,
`revokedBindingIds`. It is separately signed by the designated revocation key.
Generation must meet both policy minimum and authorization generation. All used
keys, authorization ID and every binding ID are checked for revocation; this also
applies to recovery. Missing, stale, revoked or unverified revocation information
cannot be replaced by cached authorization success.

## Canonical parsing and temporal checks

The canonical profile is deliberately narrower than general JSON/JCS: sorted ASCII
field names, no whitespace, ordinary JSON string escaping without Unicode
normalization, valid Unicode scalar strings, null/boolean/string and nonnegative
safe integer numbers. Negative zero, fractions, exponent alternatives, unsafe
integers, duplicate keys, unknown schema fields and noncanonical escapes refuse.
Objects must have ordinary or null prototype; arrays must be dense ordinary arrays.
Proxies, getters, setters, symbols, hidden fields, custom prototypes, cycles and
`toJSON` behavior refuse before user code executes.

Maximum canonical size is 65,536 UTF-8 bytes, string size 16,384 UTF-8 bytes,
depth 16, visited value count 2,048, own-key count 128 and array length 64. Envelope
inputs are immutable strings. Exact parse-and-encode equality protects the signed
bytes; schema validation further restricts every admitted field.

Context has exactly `audience`, `authorizationId`, `executorId`, `clientId`,
`independentVerifierId`, `target`, `source`, `nonce`, `nowMs`, `phaseId`, `mode`,
and `executionWindow: {startMs,endMs,recoveryEndMs}`. Expected window equals the
three signed window bounds. Every invocation verifies all signatures and checks
the requested dependent phase again. Time intervals and freshness maxima are
inclusive. Immediately beyond the forward end, forward work refuses. An explicitly
listed recovery phase may remain context-valid through the separate signed recovery
end, provided every key, binding, revocation, freshness and context gate still holds.
There is no fallback that converts expired forward permission into more forward work.

Checkpoint has exactly `nowMs` and `revocationPayload`, initially null or the full
private prior revocation payload. The function checks no backwards caller time,
consistent prior validity, no backwards revocation generation or issuance time,
identical payload at an unchanged generation, strictly increasing issuance time for
a new generation, and continuity of all previous revocations. This checks supplied
mathematical values only. It does not authenticate that a caller's checkpoint was
actually stored, that its clock is trustworthy, or that the newest revocation was
delivered. The checkpoint and signed artifacts belong in a private delivery lane,
outside generalized receipts.

## Remaining production acceptance and replay requirements

Real signature verification does not establish root governance. Production remains
closed until an externally accepted, reviewed, immutable/pinned issuer/key registry,
reviewed host/client/artifact mapping, fresh authenticated revocation delivery,
trusted clock binding, durable monotonic checkpoint storage, genuine eleven-input
evidence, exact window and owner authorization are present through the accepted
private handoff route. This source does not invent any of those. Merely editing the
registry or supplying a candidate key causes refusal, not activation. A future
production implementation and acceptance review are necessary before opening it.

The nonce is an exact signed context binding, not persistent anti-replay protection.
A future host would need durable atomic consumption of authorization ID and nonce,
an operation-bound attempt journal, monotonic revocation checkpoint commits, and
crash/recovery rules before claiming replay resistance across processes. This source
has no persistence and makes no exactly-once, monotonic-storage or real-time deadline
claim. General receipts must never serialize candidate requests/checkpoints or hash
signed evidence, secrets, credentials or private baseline values.

## Validation and receipts

Run targeted and inherited regression checks with Node 22 and Node 24:

```sh
node --test tests/qikPrivateAuthorityVerifier.test.mjs tests/qikRollbackClientPackage.test.mjs tests/qikRollbackSqlBoundary.test.mjs tests/qualification/backend-client-contract-20261002.test.mjs
/workspace/mip-runtime22/node_modules/node/bin/node --test tests/qikPrivateAuthorityVerifier.test.mjs tests/qikRollbackClientPackage.test.mjs tests/qikRollbackSqlBoundary.test.mjs tests/qualification/backend-client-contract-20261002.test.mjs
node scripts/qualification/backend-private-authority/inspect.mjs --inspect
```

The tests exercise actual ephemeral Ed25519 signatures and wrong-signature refusal,
domain/key/issuer binding, single and several evidence issuers, every exact context
field, eleven-input completeness, each phase, inclusive forward/recovery boundaries,
freshness, revocation, checkpoint rollback/equivocation, canonical adversarial input,
empty/drifted/missing registry refusal and offline-only inspection. Existing package
files are tested without altering their locks or manifests.

Validation on Node `v22.23.3` and `v24.19.0`: the four-file targeted/regression
suite passes **77 tests per runtime**, including 22 authority tests. An initial
regression attempt lacked the isolated worktree's dependency path and failed only
to import `@electric-sql/pglite`; those logs are retained. The corrected runs use
the authorized ignored worker-only `node_modules` symlink to the existing frozen
package's installed dependencies. No dependency was installed or modified.

External receipts belong in
`/workspace/mip-launch-receipts/qik-private-client-source/authority`. Offline
`inspect.mjs --inspect` inventories only **public source** hashes and fixed flags.
It does not accept signed evidence or live connection input. Hash equality is local
source integrity, not external approval.

Node documents `crypto.verify(null, data, publicKey, signature)` for Ed25519 in the
[Node 22 crypto API](https://nodejs.org/docs/latest-v22.x/api/crypto.html#cryptoverifyalgorithm-data-key-signature)
and [Node 24 crypto API](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptoverifyalgorithm-data-key-signature).
These establish API behavior only; they do not certify this candidate contract,
root governance or live authority.
