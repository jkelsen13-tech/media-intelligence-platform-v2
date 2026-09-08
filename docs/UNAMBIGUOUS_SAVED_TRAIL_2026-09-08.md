# Unambiguous saved evidence lookup

The saved trail used a last-row-wins Map for assessments and inputs, while its
selected-context user list used first-row-wins lookup. Duplicate saved identities
could therefore resolve to conflicting records on the same screen. A malformed
string context list could also match a position by substring.

The invariant is now: a saved identity must resolve to exactly one record before
the trail can display its payload or reasoning. Duplicate selected assessments
make the trail unavailable. Duplicate linked assessments or input positions retain
the link but expose no arbitrary record. Even identical duplicate rows are
ambiguous; the reader does not repair or rewrite the saved snapshot. Unrelated
unique records remain usable and lookup is independent of row ordering.

Context/extra membership accepts arrays with exact decimal-string positions,
without numeric coercion, substrings or trailing control characters. Malformed
collections and null rows degrade to unavailable. An empty context-user result
says no unambiguous link is available, rather than claiming proved absence.

Five regression tests cover reversed duplicate rows, partial ambiguity,
substring membership, malformed collections and snapshot preservation. The
production-component browser harness verifies the unavailable state at
320/390/1280px, alongside the existing retained-date and full-app checks.
Normal valid observations must retain exact source dates and reasoning.

This is a defensive saved-trail display fix, not a claim that the live database
contains duplicates. It does not establish semantic support, source independence,
counterfactual sensitivity or a new assessment. Other workspace readers are
outside this bounded change; this is not global snapshot admission validation.
No backend migration, raw evidence edit, dependency, dataset or provider activation.
POWER remains inactive and the existing rights/dependency holds remain open.

Merge requires full Node 22/24 tests/builds, browser/visual review and a clean
scoped review. After deployment verify the normal NASA evidence trail and prior
phone Account, exact-version and shared-view behavior.
