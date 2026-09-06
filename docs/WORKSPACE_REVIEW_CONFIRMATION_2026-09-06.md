# Exact investigation review confirmation

This continues the versioned question and personal briefing baseline from the updated MIP work plan. It builds on the two published investigation review integrity commits. Main remains at `5ccabe5d22cbb0076fae453d3d87ed7c1fd6670b` at preflight.

The frontend previously treated any error-free mark-review response, including a null receipt, as confirmation. It cleared the frozen acknowledgement and refreshed the baseline without verifying the receipt. A mounted-component counterexample failed before the fix.

Confirmation now requires the exact receipt ID, investigation, displayed version and predecessor receipt, plus a recorded timestamp. A mismatch keeps the original acknowledgement available for an explicit retry and does not refresh the baseline. Existing access-denial and conflict handling remains in force.

The real SQL-to-handler-to-browser test also exercises two explicit review markers across a question revision. The new wording stays unreviewed until acknowledged; replaying the older receipt leaves the newer baseline intact; conflicting receipt reuse is rejected. Evidence relevance decisions do not implicitly mark the investigation reviewed. The deployed database and Edge Function already satisfy these invariants; this batch does not require a migration or deployment.

Verification before publication: the mounted workspace lifecycle suite passed 11 tests; the expanded real SQL contract test passed. The broader investigation run passed 157 tests, with two database test files aborting from process memory exhaustion on Windows. The local production build also aborted from memory exhaustion. These are incomplete verification results, not a green full suite. Golden CI now runs the production build after the full Linux test suite on branches and pull requests.

Live read-only preflight found zero investigations, versions and memberships. A first real populated investigation still requires the owner's question, bounded evidence scope and identified existing account. No synthetic live records or assignments were created. No merge or deployment is part of this batch.
