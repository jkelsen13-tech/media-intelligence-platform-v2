# MIP convergence: investigation and navigation semantics

Date: 2026-10-02. Isolated implementation lane: `codex/mip-convergence-semantics-20261002`. Frozen input: `b8ac1663fa75c4c7a26d653a288f745070bafcae`. Integration remains with the parent coordinator; this lane does not merge, deploy, promote backend release gates, create accounts, or change renderer geometry.

The owner-authorized scope follows the Investigation Context & Global Discovery contract, particularly §§4–7, 10–13 and 17. The extracted Library contract was read from `/workspace/mip-convergence-inputs/libfile_59a9b2df0e208191bcefc73487e4dfc0.txt`. Repository search found no applicable `AGENTS.md` in this worktree or its containing directory.

## Reproduced failures and repaired behavior

The production `App` is mounted in `convergenceAppNavigation.test.mjs`; expensive UI renderers and the network composition root are controlled probes. State, effects and navigation helpers remain the actual implementation. Each original regression below fails against the frozen source and passes with the repair.

| Trigger | Frozen result | Repaired result |
| --- | --- | --- |
| Open Event A with Entity A selected; explicitly select Event B in Explore | Old URL/entity state restores Entity A in the Event B Graph inspector | Subject, inspector, sub-selection and URL converge on Event B |
| Change the hash to another canonical event | Prior inspector/place/focus state can remain active | Clear prior overlays/focus; install and validate the new route state |
| Open Event B Timeline from its originating Arc | Arc ID is written into `parent_event_id` | Preserve the named Arc independently of event parent identity |
| Request a slow article resolution, then choose another subject or lens | Late article result overwrites the newer choice | Intent generation rejects superseded resolution; failed lookup preserves current investigation |
| Navigate from a Graph inspector to a policy endpoint | Policy inspector opens while canonical context retains the prior subject | Canonical policy identity updates; return restores one policy inspector |
| Reinspect a recorded event after selecting another inspection instant/range | `occurred_at` replaces the active inspection time | Same canonical identity retains the selected time and range; new identities establish their own recorded scope |
| Open malformed time query before graph catalogs exist | Arbitrary text becomes canonical time | Validate calendar, explicit-zone instant, interval shape and ordering before canonical commit |

Further regressions verify a direct Graph subject pick clears an old Timeline focus, same-subject Source Comparison → Timeline retains a scrub, policy return does not stack Article and Policy inspectors, and reversed micro/nanosecond bounds cannot pass after millisecond truncation.

## Retained contracts

Canonical timestamp text retains its original offset and fractional precision. Date-only scopes remain dates. `time=` carries the selected range/legacy time scope; `at=` independently carries a qualified inspection instant. Calendar-invalid, local-zone-free, multi-separator and reversed intervals fall back to the named parent subject with a time disclosure. There is no new time source, model, release gate or coordinate conversion.

Entity catalogs now derive from the selected canonical node, direct retained graph relationships and explicitly retained `parent_event_id` joins. Corpus presence alone is insufficient. Place keys derive from the same normalized recorded geography model used by Graph controls, scoped to those joined nodes. No graph relationship, place, source or claim is invented. Current Graph catalogs still expose empty claim/source lists; unsupported source/claim joins remain honest fallbacks.

Originating Timeline Arc scope uses `selected_arc_or_stage_id` and the optional `arc=` hash selection. A canonical event node's retained `arc_id` validates this join. Valid Arc scope survives serialization, independent hydration, ordinary view changes and bounded recent restoration. Foreign/unavailable Arc IDs fall back with disclosure, preserving the canonical event. No Arc ID is treated as an event parent. This lane does not synthesize timeline/graph identity mappings.

New-subject handlers clear incompatible per-surface focuses and link selections. Ordinary lens navigation preserves identity and time. Explore open/browse/dismiss does not invoke subject commits; discovery filters remain local to News/Explore. About and More sheets now declare modal state, enter focus, wrap keyboard Tab and restore their opening control on dismissal using the existing dialog helper.

## Verification and receipts

Raw receipts remain outside the source tree at `/workspace/mip-lane-semantics-receipts`:

- `baseline-regressions.tap`: three original helper regressions fail against frozen helper blobs.
- `baseline-app-navigation.tap`: all five original mounted App regressions fail against frozen App/helpers, with cleanup between tests.
- `final-regressions.tap`: 16 focused regressions pass (nine mounted App, seven helper), including deterministic absence of time when loading a URL into the same existing subject.
- `final-targeted.tap`: 89 relevant navigation, time, context, Explore and recent-history tests pass.
- `full-suite-final.log`: 1,965 / 1,965 tests pass, captured after all source and regression changes.
- `build-final.log`: production Vite build passes. Existing large-chunk warnings and `node:crypto` browser externalization warning remain; this lane makes no bundle-performance closure claim.
- `browser-semantics.json` / `browser-final.log`: six actual local browser checks pass.
- `graph-selected-context.png`, `explore-preserved-context.png`, `mobile-preserved-context.png`: controlled browser screenshots.

The previous full-suite run passed 1,956 of 1,957 tests. Its sole mismatch was an existing assertion that a later-loaded `occurred_at` should overwrite a user's scrub. That assertion was corrected to the contract's same-subject inspection-time preservation; the test still verifies initial/new-subject recorded occurrence behavior elsewhere.

The browser verifier is `verifier/runConvergenceSemanticsBrowser.mjs`. Start the isolated worktree Vite server at port 4317 and run `node verifier/runConvergenceSemanticsBrowser.mjs`; environment variables allow another local origin, receipt directory, Chromium executable and Playwright module. It uses the actual App and bundled unconfigured demo corpus at 1440×1000 and 390×844. It reconstructs an event/entity plus exact SQL timestamp and separate range, dismisses Explore with focus return, cycles Graph → Timeline → World View → Graph, applies an external event deep link, exercises About focus/Tab/Escape and repeats Explore on mobile. All nonlocal browser requests are blocked; the only observed blocked request is a Google Fonts stylesheet.

## Limits

These are local semantic and UI checks. They do not attest live Supabase RLS, realtime correction propagation, provider data, release eligibility, authorization to publicly expose private objects, source/claim joins absent from current catalogs, full Graph/Map/Split renderer acceptance, or launch readiness. No backend, account, credential, spend, merge, deployment or release action was performed. Parent integration, independent review and the combined acceptance matrix remain outside this lane.
