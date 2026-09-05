# Investigation workspace redesign (2026-09-05)

Frontend-only presentation change. Graph, Timeline, Arcs, Source Comparison, and World View now share one light investigation workspace. Main remains the publication review point; this document does not authorize a merge.

## Scope

- Persistent left navigation on desktop, with a phone drawer (Escape, focus trap, focus restore).
- Top search opens the existing Explore flow. Opening Explore is not a view change and does not replace the subject.
- Canonical investigation header: recorded title, location, time, and description. A selected child record does not replace that header.
- Five separate evidence dimensions. No aggregate truth or bias score.
- Cross-view tabs for Graph, Timeline, Arcs, World View, and Source Comparison.
- Right-hand investigation inspector. Graph node / policy / relationship panels still occupy their existing dock when open.
- Timeline: horizontal recorded-order chronology plus a list alternative. Spacing is not elapsed time. The existing connector engine is unchanged.
- Arcs: development-card styling. Honest unavailable copy when released arc records are absent. No mock arcs.
- Source Comparison: column styling. Honest unavailable copy when schema or validated comparison data is absent.
- World View: inspector chrome only. Cesium / MapLibre / atlas renderer adapters, Map / Graph / Split behavior, `CESIUM_BASE_URL`, and precision ceilings stay in place.
- Light presentation at boot (owner-selected). No new backend feature flag.

## Reliability

- Optional denied or missing arc metadata must not block an otherwise valid global timeline read. Unexpected server errors still reject.
- Failed assessment hashing withholds with `hash_unavailable`. Integrity is still enforced when the digest succeeds.
- Graph disposal destroys the renderer first, then removes leftover cards. Updates ignore a destroyed instance.
- Graph inspector dismissal stays dismissed until an explicit selection or a different canonical subject.

## Hard locks

- No Supabase schema, RLS, policy, release, or ingest writes.
- No invented evidence, arcs, sources, weather, support scores, or claims.
- Identity, release gates, lineage, causal boundaries, location precision, Investigation Context, and deep links are preserved.
- World View globe product scope is not reopened beyond UI chrome.

## Validation

Full `npm test` and `npm run build` must stay green. Missing backend records remain explicit availability states.
