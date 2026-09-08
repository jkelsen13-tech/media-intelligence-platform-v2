# Saved evidence dates preserve recorded precision

The saved evidence trail previously used Date.parse plus ISO conversion for all
retained values. A source date of 2024-04-08 therefore displayed an invented UTC
midnight and milliseconds; 2024-02-30 could normalize into March. Browser-local
interpretation could also turn an unqualified clock into a claimed UTC time.
This violates the governing plan's separation of source/recorded clocks and precision.

## Change and invariant

The display adapter validates supported calendar/clock components directly and
retains date-only, minute, second or fractional-second precision. It never shifts
the recorded calendar day or pads/truncates source fractions. Explicit numeric
offsets are displayed with the original clock; compact PostgreSQL-style offsets
normalize punctuation only. Date-only values are labeled as such.

Unqualified clocks say “time zone not recorded” and emit no machine-readable
instant. The explicit -00:00 convention retains known UTC time while labeling
the local offset unknown, per [RFC 3339 section 4.3](https://www.rfc-editor.org/rfc/rfc3339.html#section-4.3).
This is different from a missing offset. No geographic time zone or daylight-saving
rule is inferred from an offset. The source value remains available as the time
element's title when a supported date/time is rendered.

Only the saved evidence trail date rows change. Publication, capture, record
version and queue times remain separately labeled, and absent fields never borrow
another clock. Raw inputs, immutable observations, assessment outcomes, review
receipts and temporal query behavior are unchanged.

## Supported display scope

Four-digit Gregorian years 0001..9999; ISO dates; uppercase T or space separator;
minute/second clocks with optional 1..6 fractional digits; uppercase Z or numeric
hour/hour-minute offsets. Impossible calendars and out-of-range clocks are
unrecognized. Leap seconds, named zones, expanded years, locale-formatted dates,
more than six fractional digits and other formats remain explicitly unsupported,
rather than being guessed or silently normalized. This is a retained-record
display adapter, not a universal ISO/RFC parser or evidence-time validator.

Six new regressions cover day precision, minute-to-microsecond clocks, offset
preservation, missing/unknown offsets, calendar rejection and missing fields.
Existing date-row expectations now preserve supplied second precision.
The ephemeral browser harness renders the production component with labeled
synthetic records at 320/390/1280px; the full built-app weather/camera/recent-history
preview and saved-version form checks also run.

Required before merge: Node 22/24 full suites/builds, browser/visual review and
clean scoped diff review. After Pages, inspect live NASA retained date rows and
existing phone Account and synchronized saved/public navigation. No new dependency,
dataset, provider or backend migration is introduced. POWER remains inactive.
