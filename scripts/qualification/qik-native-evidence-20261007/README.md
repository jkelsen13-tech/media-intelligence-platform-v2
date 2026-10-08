# Offline derived-summary integrity

This source-only utility reads an explicit caller-pinned set of public source
and whitelisted derived summaries. It performs no network, Docker, database,
worker, authority import or credential-handoff action. It hashes the actual
public bytes for the original 18 source pins, source-lock and four unchanged
native source pins. It also checks fixed declared case/outcome profiles and
required package coverage.

The committed summaries describe allowlisted projections of private fixture
receipts. Their provenance and projection from those receipts cannot be
independently verified from this public package. Exact field allowlists and
credential-pattern checks apply to all three summaries, including every DO row.
Allowed data consists of fixed names, boolean outcomes, refusal codes, public
source hashes and declared private references. All summaries must carry
`WHITELISTED_DERIVED_SUMMARY_NOT_RAW_NATIVE_RECEIPT`.

```sh
node verify.mjs --root /absolute/source/checkout \
  --manifest docs/qualification/qik-native-source-summary-20261007/source-summary-manifest.json \
  --manifest-sha256 <exact-summary-manifest-sha256>
```

All arguments are required. Paths must be relative, normalized regular files
inside the absolute root; symlinks, traversal, duplicates, missing files and
byte/hash mismatch are refused. Final open uses O_NOFOLLOW. This does not
protect against a hostile concurrent filesystem administrator or attest a host.
The source root defaults to the checkout. Frozen metadata preserves the declared
6b55/tree95a source binding; it is not a recomputed Git tree of the successor.
`ORIGINAL_REQUIRED_PACKAGE_PATHS` preserves the original 13 summary, HTTP and
catalog paths. `REQUIRED_PACKAGE_PATHS` adds the committed repair tests. Every
required path must be indexed; missing paths, duplicate paths, alternative
summary paths and extra unapproved paths are refused before package entries are
read. Changing a proposal's bytes and both caller pins creates another public
package; it does not qualify that proposal or prove that its tests ran.

Output status and qualification `DERIVED_SUMMARY_INTEGRITY_VERIFIED` mean only
that caller-pinned public bytes, frozen source pins and declared summary profiles
agree. A caller's manifest pin does not authenticate a producer. Self-consistent
fabricated summaries can satisfy this bounded check; they receive the same
explicit limitations, with `producerAuthenticated: false` and
`nativeExecutionVerified: false`. Claims that promote absent native bytes or
authentication proof are refused. No trusted issuer or authority registry is
created by this utility.

Client `originalReceiptSha256` (`2a16a07c…`) and pipe `originalReceiptSha256`
(`55d6f27a…`) must match their declared private references. The library SHA256
(`973ef2a8…`) and libpq version must match the declared library profile. No raw
receipt preimage or library blob is supplied or hashed, so output always carries
`originalReceiptBytesVerified: false` and `libraryBytesVerified: false`. The bare
39-row DO array has no single supplied original receipt preimage; none is
invented. Public transport/inventory/worker hashes are separately bound to actual
frozen public source bytes and must not be confused with the library digest.

Counts describe declared summaries: 23 client cases (21 native boundary labels,
one production guard and one input check), four separate pipe cases, 24 stub DO
cases, 11 real exact-DO labels (four successes and seven refusal codes), one lock
case, one instrumented CAS predicate and two historical audit cases. All stub
refusal codes, CAS row count and audit retention counts are enforced. Production
and live flags remain false; `PROVIDER_SERVER_DBLINK_VERIFY_FULL_HOLD` remains.

The tests preserve the original integrity attacks and add repinning, declared
metadata, stub refusal, source-binding, package coverage, proof-claim and
all-summary credential attacks. The committed-package test hashes the current
manifest and independently checks its required membership and every listed file;
this dynamic caller pin is not producer authentication. No test replays native
fixtures. Missing raw native custody remains a separate unresolved requirement.
