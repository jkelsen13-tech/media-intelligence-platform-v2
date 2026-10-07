# Offline native-summary integrity

This source-only utility reads an explicit caller-pinned set of public source
and whitelisted derived summaries. It performs no network, Docker, database,
worker, authority import or credential-handoff action. It checks the original
18 source pins, four unchanged native source pins and fixed case classifications.

The new source summaries are deterministic allowlisted projections of the
remote fixture receipts. They contain names, boolean outcomes, fixed refusal
codes and public source hashes. They omit connection strings, credentials,
private config, SQL traces, runtime handoff and artifact binaries. They are
marked `WHITELISTED_DERIVED_SUMMARY_NOT_RAW_NATIVE_RECEIPT`. Original detailed
evidence remains in the remote private MIP workspace for parent review.

```sh
node verify.mjs --root /absolute/source/checkout \
  --manifest docs/qualification/qik-native-source-summary-20261007/source-summary-manifest.json \
  --manifest-sha256 <exact-summary-manifest-sha256>
```

All arguments are required. Paths must be relative, normalized regular files
inside the absolute root; symlinks, traversal, duplicates, missing files and
byte/hash mismatch are refused. Final open uses O_NOFOLLOW. This does not
protect against a hostile concurrent filesystem administrator or attest a host.
The source root defaults to the checkout; metadata identifies the exercised
frozen6b55/tree95a source, not a complete recomputed Git tree of the successor.

Output `EVIDENCE_INTEGRITY_VERIFIED` means only that named bytes, pins and fixed
summary classifications agree. It does not authenticate who made a summary,
prove native execution, qualify vendor privacy/current installed qik, or grant
execution authority. Production/live flags remain false and provider HOLD stays.
The 23 client cases include21 native boundaries plus guard/input checks, while
four pipe cases are separate. DO counts distinguish24 stub,11 real exact DO,
one actual lock, one instrumented CAS predicate and two historical audit cases.

Eight attack tests use fabricated public data to exercise integrity refusals.
A ninth verifies the committed credential-free summary/source package. No test
replays native fixtures. Detailed native qualification is attributed separately.
