# World View recorded-time reconciliation

The live control previously returned to its first marker immediately after End.
WorldView reset a local array index whenever projection/selection arrays changed,
then published the reset index back into shared Investigation Context.
The chosen instant was also lost on reload when a time range took precedence
in the existing time= query parameter.

This batch makes shared as_of_time authoritative. Data loading and rerendering
never publish a replacement time. Only the explicit recorded-time control writes
a choice. Matching markers restore by timestamp rather than array position.
A precise between-marker instant remains the actual inspected instant; outside
valid coverage no historical state is borrowed. An unmatched instant has an
explicit marker chooser rather than a slider falsely indicating the first marker.

Date-only scope remains date-only. The default inspection marker, if present,
comes from that UTC date and is labelled separately; there is no midnight
coercion or writeback of an invented precise selection. Missing/invalid times
remain unavailable. Link and spatial readers share calendar/offset validation.

Links keep the original time= scope and add optional at= only when the precise
inspection instant differs from the scope's start. Old links retain their meaning.
Duplicate or invalid at= values cannot override the scoped time. Serialization
derives at= from current context, preventing an older query value from reappearing.

Tests cover refreshed/reordered/empty arrays, exclusive endpoints, between-marker
and outside instants, date precision, exact offset/fraction retention, invalid
calendar dates, duplicate query values and independent scope/instant restoration.
The existing remote browser verifier now exercises End, view round-trip, reload,
outside-time unavailable state and Home recovery against public released data.

Source strings are preserved. The existing spatial comparison clock is millisecond
resolution; this batch does not certify submillisecond runtime ordering or turn
valid-time projection lookup into an as-known-then historical reconstruction.
No backend data, policy, collector or evaluation/publication gate is changed.
The backend consolidation final gate remains INCOMPLETE.
Release evidence is recorded on PR #111, including postmerge live verification.
