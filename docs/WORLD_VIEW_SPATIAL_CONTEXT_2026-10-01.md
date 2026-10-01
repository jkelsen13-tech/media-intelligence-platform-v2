# World View spatial context cards — 2026-10-01

This bounded implementation provides a renderer-neutral display model and one selected context card, following section 20.4 of the October 1 World View work plan. The coordinator owns World View integration and camera projection. The component remains a prototype pending the owner's layout selection and browser verification.

## Delivered interfaces

`src/lib/worldViewSpatialContext.js` exports:

- `WORLD_VIEW_CONTEXT_FAMILIES`: ordered `{key, label}` entries for `events`, `people`, `markets`, `population`, `weather`, `infrastructure`, `hazards`, and `relationships`.
- `DEFAULT_WORLD_VIEW_CONTEXT_LAYERS`: all eight family visibility preferences enabled. Enabling a preference does not manufacture data or an icon.
- `normalizeWorldViewContextLayers(value)`: a new frozen visibility object; only literal `true` enables a supplied key.
- `worldViewSpatialContextKey({visibleRow, investigationContext})`: canonical subject, row version and snapshot, inspection time, and selected time range identity. View and layer changes do not change this key.
- `buildWorldViewSpatialContext({visibleRow = null, selected = null, investigationContext = null, admittedContext = {}, weather = null, layerVisibility = DEFAULT_WORLD_VIEW_CONTEXT_LAYERS})`: an immutable detached display model.
- `positionWorldViewSpatialContextCard(anchor, viewport, options)`: clamped container-pixel layout with a leader. Invalid, invisible, or off-container anchors return `null`.

The model contains `{key, subjectId, title, available, reason, families, indicator, modules}`. A family has independent `eligible`, `available`, and `moduleCount` fields. `indicator.exists` requires supplied, plottable geography under the existing `plotDecision` privacy rules; `indicator.eligible` reflects the selected object's primary family preference. Modules contain `{id, family, title, classification, status, fields, references, provenance}`. The evidence module has `family: null`, remains relevant across family preferences, and preserves supplied reference objects, ancestry arrays, native provenance and recorded timestamp text. It uses the existing `labeledG2Dimensions` and `confidenceTextDimension` helpers to preserve six separate G2 dimensions, their exact unavailable labels, textual confidence and recorded `confidence_status`; it calculates no score. Modules keep structured references and raw source timestamps accessible to any caller, including the coordinator's Explore summary.

`src/components/WorldViewSpatialContextCard.jsx` exports:

```jsx
import WorldViewSpatialContextCard, {
  WorldViewContextLayerControls,
} from '../components/WorldViewSpatialContextCard.jsx'

const model = buildWorldViewSpatialContext({
  visibleRow, selected, investigationContext, weather,
  layerVisibility,
})

<WorldViewContextLayerControls value={layerVisibility} onChange={setLayerVisibility} />
<WorldViewSpatialContextCard
  model={model}
  anchor={{ x, y, visible }}
  viewport={{ width, height }}
  onClose={closeCard}
  onInspect={openExistingInspector}
  compact={false}
/>
```

`onInspect(model)` lets the caller open the existing investigation inspector; no route or investigation link is invented. `onClose()` dismisses the card UI. Neither callback requires clearing canonical selection. Mount the card inside a `position: relative` map container and supply coordinates relative to that same container. The renderer must update the anchor when its camera or selected geometry changes, including visibility behind the globe. Optional viewport measurement observes the immediate parent when `viewport` is omitted.

## Sourced intake seam

`admittedContext` is an object of family arrays. Its records must already be authorized and sourced by the caller; `admitted: true` is a required intake assertion, not an admission process implemented here. Every optional record requires:

```js
{
  admitted: true,
  subjectId: canonicalSubjectId,
  id: suppliedRecordId,          // optional stable source identity
  version: suppliedVersion,     // optional source version
  source: { label, url, referenceId }, // at least one nonempty source identifier
  referenceTime: recordedDateOrExplicitOffsetInstant,
  geography: { label, precision },
  classification: 'context',    // or supplied 'evidence' classification
  status: 'available',          // or 'unavailable' with unavailableReason
  fields: { /* supplied family fields */ },
  references: suppliedReferences,
  provenance: suppliedProvenance,
}
```

Dates retain date precision. Instants require the existing explicit-offset timestamp parser. A record for a different subject, invalid date, missing source/geography, missing classification, or undocumented family relevance is omitted. An unavailable record is accepted only with its source, reference time, geography and explicit unavailable reason. Optional module identities derive from supplied source identity, version, date and admitted field values; repeated identical records are displayed once. Raw supplied provenance and references remain detached from canonical inputs.

| Family | Available record requirements and allowed fields |
| --- | --- |
| Events | Supplied `description` or `status`; optional explicitly sourced `occurredAt` is labeled Event time. The projection's base Event module displays its recorded subject and **Spatial record valid from/to**. Spatial revision validity does not establish when an event happened. Release status is not turned into event status. |
| People | `name` and `documentedRole`. No identity, role or location is inferred from proximity. |
| Markets | `company`, `ticker`, `documentedRelevance`; optional `value`, `unit`. Supplied reference time remains visible. No price cause, historical fill or trading implication is generated. |
| Population | `place` and `population`; optional `unit`. The supplied population reference date remains visible, including zero when actually supplied. |
| Weather | Explicit `temporalMode: 'current'` or `'event-time'`; supplied temperature, precipitation, wind speed or direction. Optional observation type, resolution and model. CURRENT and EVENT-TIME labels remain separate. |
| Infrastructure | `name` and `documentedRelevance`; optional `type`, `description`. No facilities or detail are derived from map backgrounds. |
| Hazards | `name` and `type`; optional `description`, `status`. The source's time and geography remain visible. |
| Relationships | `from`, `to`, `documentedRelationship`. No edge is created from co-location, chronology or module availability. |

Event-time weather additionally requires a recorded instant inside the row's valid range. For an exact inspection instant it must match that instant; a date-only inspection requires the same UTC date. The seam does not interpolate weather or assign an earlier observation to a later inspection instant. Legacy `weather.status: 'unavailable'` contributes only the existing explicit source-path availability state, without retaining stale weather fields.

The inspected `eventTimeWeather.js` successful parser contract has `status: 'ok'`, the four core weather fields and provenance `{provider, timestamp, resolution, observationType, model}`. It describes event-time reanalysis but does **not** return observation geography, subject binding, intake admission or context/evidence classification. The active loader presently returns unavailable. A raw successful parser result therefore remains absent: its geography must not be inferred from the selected spatial row, and missing fields must not be invented.

The legacy result bridge accepts an explicitly enriched `weather` object only when the caller supplies `admitted: true`, matching `subjectId`, `classification`, and `geography: {label, precision}`. It preserves the supplied provider as source label, supplied observation timestamp as reference time, and the parser's observation type, resolution and model. Supplied `source` and `references` are retained if available. It then applies the same strict admission and temporal checks as every optional weather record. Only the existing contract's `reanalysis` observation type is eligible for this bridge. Unsupported timestamp precision is not silently rewritten to an invented precise instant. No feed calls are made.

## Interaction and state

Desktop shows one selected anchored card with a geographic leader; the content scrolls within the card. Mobile at 640px and below, or `compact={true}`, shows a compact anchored preview and expandable bottom sheet bounded to 48% of the map container, capped at 360px. The overlay passes gestures through outside its controls. It introduces no camera updates, storage, auth behavior or canonical-data mutation.

Global family visibility and individual card section expansion use separate state. Layer changes hide eligible family sections without erasing their remembered expansion. Evidence stays available. Canonical subject, version, snapshot, inspection time or range changes reset the card state immediately and clear old state, including when returning to an earlier subject. Native buttons, checkboxes, focus outlines, `aria-expanded`, `aria-controls`, valid hidden targets and Escape handling support keyboard use. Escape collapses an expanded mobile sheet first; a subsequent Escape calls the close callback. The sheet is a nonmodal region so map interactions can continue.

An invisible anchor suppresses the anchored preview. If `onInspect` is supplied, the explicit “Inspect selected context” affordance remains available. A selected row with absent geometry can still supply sourced evidence to the existing inspector without creating a spatial indicator. A precise private-person row is withheld entirely. Subject mismatch and unavailable recorded time preserve canonical identity and produce no replacement card facts.

## Validation and remaining limits

`node --test tests/worldViewSpatialContext.test.mjs` passes 15 tests covering immutable provenance, honest absence, separate G2/confidence dimensions, spatial validity versus explicitly supplied event occurrence, family intake gating, current/event-time weather distinction, strict legacy weather provenance requirements, privacy and time guards, identity resets, anchor bounds, module-state separation, keyboard collapse/close and invisible-anchor inspector access. Existing spatial projection and Investigation Context tests also pass alongside these tests (40 total at this stage). Component tests use the repository's esbuild/React test renderer harness.

Camera projection, actual browser layout, camera occlusion, gestures, focus return after a parent dismissal, runtime source loading, and screenshot comparison require coordinator integration and browser verification. The backend's externally observed 401 remains outside this implementation; no auth repair was attempted. Population, market, people, hazard, infrastructure and relationship data are absent unless explicitly supplied through the sourced intake seam. Background source status is a separate renderer model and does not upgrade evidence precision or claim historical background correspondence.
