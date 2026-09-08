# Timeline connection availability

The shared chronology readers already preserve public relationship read failures.
Timeline nevertheless treated their empty fallback as proof of zero connections,
offered a “No links” filter, and displayed a numeric zero in its footer.

The invariant is that a count or absence statement requires a successful read of
the accessible public projection. Loading, denied/schema-gap, and failed reads
remain distinct from a successfully empty result. This does not claim the accessible
projection contains every real-world relationship.

A shared chronology state adapter now drives the Timeline count, connection panel,
and link-filter availability. Explicit retry rereads the global chronology or just
the selected arc's connections. Existing arc evidence is retained during its connection
retry; effect cancellation excludes obsolete responses. Unavailable link predicates
fall back to All events until the read succeeds.

Regression scope: installed-SDK denied/missing/server-error and recovery contracts;
real React view loading/unavailable/empty behavior in global and arc scopes; built
Chromium/WebKit public-read outage/recovery checks, canonical subject continuity,
and existing responsive checks. Results are recorded in the PR after execution.

Backend preflight confirmed the existing application project qikvmopbtijoebdqosyq and RLS on
the public base tables involved. No schema, policy, evidence record, worker, provider,
or dependency is changed. Supabase's current select contract preserves data/error
separately: https://supabase.com/docs/reference/javascript/select.

Remaining scope: this does not complete the Graph/Timeline visual destination.
Attached-article and grouped-timeline availability need their own bounded audit.
Existing provider/rights holds and producer qualification gates remain in force.

The Pages workflow now follows successful deployment with an anonymous live browser
check. It first matches the actual hosted JS/CSS filenames to this release's build,
then verifies the shared responsive workspace, Account access, public navigation,
weather restrictions and Timeline behavior in Chromium/WebKit. Synthetic response
replacement stays within the disposable browser. No database writes or real user
sessions are involved. Private saved-version contents still require an authorized
signed-in browser session; synthetic exact-version tests do not claim that coverage.
