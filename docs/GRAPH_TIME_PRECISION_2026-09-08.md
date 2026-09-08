# Graph Time: recorded precision and comparable clocks

The Time view previously sorted raw date strings and displayed only their first
ten characters. For example, 2026-01-01T01:00:00+02:00 precedes
2026-01-01T00:30:00Z in UTC, but the text sort reversed them and both displayed
the same date. Invalid calendars were also displayed as ordinary recorded dates.

This batch reuses the retained evidence date display adapter. Full supported
calendar/clock precision and source offsets stay visible; raw values remain
available on each date. Impossible or unsupported dates are labeled unrecognized,
separately from missing dates. The shared adapter's documented format limits remain.

Qualified clocks sort by UTC whole seconds and separate fractional microseconds.
The precision interval's start is only a display key, not proof of ordering inside
overlapping intervals. Calendar dates sort in their own group, without invented
midnight instants. Unqualified clocks and invalid/missing records are separate,
label-ordered groups. Equal keys use label/identity solely for stable display.
No backend evidence, source timestamp, assessment, or navigation identity is changed.

Every record, including invalid/unknown dates, retains its existing exact evidence
action. Group headings and responsive rows advance Graph composition without
fabricated records, trend lines, confidence values or new dependencies.

Regressions cover reversed offset order, microseconds, equivalent offsets,
minute/day precision, unknown local offsets, invalid calendars/clocks, immutable
inputs, and exact selection. Production and deployed Graph checks run both browser
engines across desktop/tablet/phone sizes. Final check results, screenshots and
post-deployment release evidence are recorded in the pull request.

Richer Graph canvas/minimap, Timeline lanes and the remaining five-view reference
destination remain open. No provider activation, rights changes or private-session
live verification is included.
