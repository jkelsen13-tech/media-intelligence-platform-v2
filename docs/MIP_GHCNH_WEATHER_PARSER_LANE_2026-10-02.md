# Bounded GHCNh historical weather parser — 2026-10-02

This lane implements deterministic interpretation of the owner-provided historical Library sample. It produces **qualification candidates and unadmitted station-scoped context proposals**. It does not fetch observations, grant source rights, publish weather, or enable a provider. The existing `noaa-ghcnh-hourly` source permission remains pending and denies display. Current observations and forecasts remain unavailable.

Base: `7f778e2e75163c16194f30e070b42f9b351c99e4`. Branch: `codex/mip-launch-weather-20261002`. New files only: `ghcnhWeatherParser.js`, `ghcnhWeatherContext.js`, their synthetic tests, the genuine-byte qualification verifier, and this dated evidence. No existing World View, acquisition, rights, App, or provider file changed.

## Source and byte qualification

Library file `libfile_1910aada38288191858b01715183bbc0`, version 0, is materialized at `/workspace/mip-real-source-evidence/weather`. The parent independently verified ZIP CRC and all 33 archive members; its reported ZIP SHA256 is `d542e39070bd062e80240310b43db917ebcf9bc4f693e2bdc1898a1be6fa9e1e`. This lane independently pins the materialized 19,523-byte manifest (`18224394cd125137317142f1f699d40e2239ff032374a845e9e04cd594e068c2`) and verifies **all 28 files listed in that manifest**. Archive verification and local parser verification are separate receipts.

| Qualified input | Bytes | SHA256 |
| --- | ---: | --- |
| Explicit 30-field API JSON | 53,689 | `4a32a5fc4283ca9c4f8f28f52ee2ca271e6ac0c0f19bbb5df686b32aea5f2129` |
| Locally derived native day PSV | 77,806 | `6e402ab7504c6fa4646743c85461447c4f2a86a80cb2bb6b47005c39e441798b` |
| Capped annual PSV range | 131,072 | `b1da491eff9b53b7b184049224b2a8e733b9bf99671cac6ba3c7e667b1078ce1` |
| Official format 1.1.0 PDF | 423,879 | `df5694efdc2d498f006a343165bae65701d14809174b9bed660149bd4fe591b7` |

The raw API request URL and source URLs are preserved in the [qualification receipt](MIP_GHCNH_WEATHER_QUALIFICATION_RECEIPT_2026-10-02.json). No mixed source 223/343 raw observation file is copied into this repository. CI fixtures are explicitly invented rows, not an evidence substitute.

The annual range is HTTP 206, bytes `0–131071/12147342`, not an annual download or full-object hash. The verifier accepts 125 complete 329-column records and explicitly discards its incomplete terminal record. The 69-row day file is an exact local derivation of the original header and complete records whose DATE begins `2025-01-01`; its independent hash matches that derivation. The verifier compares 2,070 core fields and all four variables' interpreted semantics against the API projection, with zero mismatches. API absence and native blank are equivalent missing values, while their native presence metadata remains distinct.

## Genuine results and interpretation

The station is `USW00014820`, CLEVELAND, at the supplied approximate station point `41.4133, -81.86`, elevation `262.1 m`. Horizontal and elevation datums remain unverified. Elevation is station metadata, never terrain/ellipsoid height. This point observation does not establish citywide, neighborhood, or subject-location weather.

| Genuine 2025-01-01 day | Result |
| --- | --- |
| Raw records | 69, from 00:00:00 through 23:51:00 UTC |
| Record candidates with at least one usable variable | 58; no records admitted |
| Temperature | 43 usable source 343/QC5; 15 source 343/QC7 rejected; 11 source 223 excluded |
| Wind speed / direction | 58 usable source 343/QC5 each; 11 source 223 excluded each |
| Precipitation | 24 usable: 13 positive, 5 explicit dry zeros, 6 traces; 45 missing |
| Duration-specific precipitation fields | All missing in this day; no substitution |

[Official format 1.1.0, updated March 10, 2026](https://www.ncei.noaa.gov/oa/global-historical-climatology-network/hourly/doc/ghcnh_DOCUMENTATION.pdf), Section III(A), explicitly establishes UTC. The parser requires that version/document-hash/section/date-basis binding before appending `Z` to the supplied zoneless DATE. It validates calendars and preserves the original native timestamp plus exact fractional digits. A missing suffix alone never establishes UTC. The source metadata's broader version-family label does not override the qualified format.

Native temperature `8.0` means **8 °C**, approximately 2 m AGL dry bulb, with no additional division by ten. Wind speed is m/s; direction is whole degrees from true north. 360 is north; native 000 is calm, with no heading. Raw per-variable measurement/QC/report/source/source-station attributes survive independently. This declared conservative policy accepts only source 343 QC1 or QC5 for supported METAR/SPECI report families. QC7 is erroneous NCEI-origin data; gross-limit-only, suspect, edited, lowercase/general and unknown QC flags are unavailable. Source 223 is excluded before applying source 343 QC meanings.

Base precipitation is mm of nominal report accumulation, **not mm/hour or an instantaneous rate**. Trace (`T` in the actual sample; source 343 documented `2` supported by synthetic tests) has unknown amount and retains the native `0.0` without exposing a dry-zero value. Explicit blank-code `0.0` is dry zero; absent/blank is missing. Nominal 60 minutes has no inferred exact start or end. The parser retains each FM15/FM16 report independently and sums nothing. It neither substitutes a duration-specific field nor assigns a civil-hour total from a `:51` report.

The genuine day proves normal wind, trace/dry-zero/missing, source separation, and QC7 rejection. Calm, variable wind, wind averaging codes, contradictory wind values, source-specific sentinels, and overlapping/incomplete accumulated periods are **synthetic contract tests only**. C/000 calm and V variable produce no fabricated heading; wind T means 180-minute speed averaging, independently of precipitation T. Unknown or unsupported codes remain unavailable. Source 382 assumed-zero/sentinel/accumulation rules never apply to source 343. Explicit duration fields, including source 343 5-minute precipitation's separate QC semantics, remain outside this first qualified scope with raw flags preserved.

## Existing context seam

`ghcnhWeatherContextProposal` returns the existing `admittedContext.weather` record shape with `admitted:false`. Its default is an honest **station-only diagnostic**, with no invented station radius, nearby-station cutoff, temporal tolerance, or subject weather claim. `bounded-station-context` requires an explicit target, maximum station distance in meters, maximum time offset in whole seconds, and inspection instant. Distance is disclosed as approximate spherical point distance with unverified horizontal datum. Signed observation offset is preserved in nanoseconds.

The proposal preserves the actual report instant as `referenceTime`; it never retimes an observation to the selected event instant. Passing a supplied time tolerance does not satisfy the existing intake's exact instant and row-validity checks. Synthetic integration tests show the existing World View builder rejects every proposal, accepts an explicitly supplied synthetic external admission at the exact instant, and rejects subject mismatch, a different fractional instant, the exclusive validity end, or a 2024 event against the 2025 sample. The adapter does not implement an admission authority or replace the context engine.

Provider, policy/version, source URL/hash/byte count, exact observation/native times, all variable flags, station metadata, scope and limits are retained. The parser explicitly labels supplied hashes as requiring an external byte verifier. The actual sample does not establish exact client retrieval time, so `retrievedAt` is null. Server `Date: Fri, 02 Oct 2026 15:22:22 GMT` and evidence-bundle time `2026-10-02T15:31:03.325705+00:00` remain separate. Neither becomes an invented retrieval timestamp.

## Validation and remaining gates

Both Node **22.23.3** and **24.19.0** pass the genuine-byte qualification and **43 focused checks** (21 new synthetic parser/adapter regressions plus existing event-time weather, source-rights, and World View context checks); zero failures, skips or cancellations. Same-length mutation of a copied genuine API body is rejected by its SHA256 pin, with the original Library evidence unchanged. Both runtime production builds pass; the pre-existing large-chunk advisory remains. The new modules are offline candidate tools and are not activated in the app bundle.

Reproduce genuine qualification:

```sh
node verifier/runGhcnhWeatherQualification.mjs /workspace/mip-real-source-evidence/weather /tmp/ghcnh-receipt.json
```

Reproduce focused synthetic and existing-contract checks:

```sh
node --test tests/ghcnhWeatherParser.test.mjs tests/ghcnhWeatherContext.test.mjs tests/weatherSourceRights.test.mjs tests/eventTimeWeather.test.mjs tests/worldViewSpatialContext.test.mjs
```

Run the same commands with `/workspace/mip-runtime22/node_modules/node/bin/node` for Node 22. Builds use each runtime with `node_modules/vite/bin/vite.js build`. Detailed local logs are `/tmp/mip-ghcnh-{tests,verifier,build}-node{22,24}.log`.

[The source policy catalog](https://www.ncei.noaa.gov/oa/global-historical-climatology-network/hourly/doc/ghcnh-source-list.pdf) identifies source 343 NCEI/ASOS/AWOS as Open Access and source 223 as WMO Resolution 40. Dataset-level NOAA dedication is positive evidence; this lane does not assert source 223 commercial eligibility or revise the permission registry. Publication still requires explicit source-rights/admission review, byte verification attached to the actual candidate, subject station relevance and approved spatial/temporal limits or station-only scope, and exact event-time/row-validity binding. Genuine examples remain needed before claiming demonstrated calm/variable/sentinel/accumulated-period coverage. No current NWS route was retried, no forecast/current weather acquired, no provider paid service activated, and no deployment or protected mutation occurred.
