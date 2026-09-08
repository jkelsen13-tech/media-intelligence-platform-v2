# Shared workspace date precision

Graph Time's precision review exposed a second display inconsistency: the canonical
header and shared inspector converted date-only records into a UTC-labeled day.
Offset-qualified clocks could also shift calendar day while losing their clock.

The shared formatter now reuses retained-date display validation. Calendar-only
values remain date-only, supported clocks retain their precision and source offset,
unknown zones stay unknown, and malformed dates are distinct from absent time.
Canonical-subject selection rules, raw records and backend evidence remain unchanged.

Four regressions cover day/minute/microsecond precision, offset day boundaries,
missing zones, invalid calendars and selected-child isolation. The shared workspace
browser verifier checks the real public event's date-only label in both header and
inspector at five widths, in Chromium and WebKit before and after deployment.

Final verification and release evidence are recorded in the pull request.
Other view-specific date formatters remain separate follow-up work; this is not
a claim of a completed application-wide temporal audit.
