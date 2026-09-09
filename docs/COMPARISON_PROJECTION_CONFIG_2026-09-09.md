# Comparison projection configuration boundary

The projection HTTP handler previously coerced the stored claim-group confidence
floor with Number(...). A blank string, false or empty array becomes zero.
Since groupClaims unions any pair whose similarity is at least the floor, zero
can join unrelated text. Nonfinite and out-of-range values also passed into the
rebuild. This is a reproduced code-level failure, not a claim of production loss:
the observed Manus setting at 2026-09-09 20:22:05 UTC was the expected numeric 0.6.

The runtime now accepts one explicit finite numeric floor in [0,1], including
ordinary decimal/exponent strings. An absent setting still uses the existing
0.6 default. Explicit null, blanks, booleans, arrays, objects, nonfinite values,
out-of-range values and ambiguous result rows fail before projection rebuilding
or scheduled acknowledgement. Errors do not echo stored values. Explicit zero
remains valid configuration; this patch does not retune the algorithm.

Tests execute the actual old/new HTTP callback and actual groupClaims to
reproduce blank-to-zero grouping, check write/acknowledgement denial, and preserve
valid/default behavior. The source-delta test confirms authorization, scoring,
article-input completeness, membership release gates and queue logic are unchanged.
No configuration value, policy, schema or schedule is edited.

This closes configuration coercion only. Cross-query immutable generations,
durable projection output, atomic publication and generation-fenced acknowledgement
remain separate integration requirements. A successful scheduled HTTP dispatch is
not semantic output proof. No legacy backend is SAFE TO RETIRE.

Files and tests are created remotely; exact deployment/readback, final-head and
postmerge live evidence are recorded on the associated PR. No local files.
