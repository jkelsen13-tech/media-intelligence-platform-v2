# Browser compatibility dependency security patches — 9 September 2026

The next bounded step from CI_DEPENDENCY_ADVISOR_TRIAGE_2026-09-08.md updates
six existing development-only package records. No root manifest, production
package, application source, backend runtime or other lock record changes.

| Package | Previous | Candidate | License |
| --- | --- | --- | --- |
| baseline-browser-mapping | 2.10.40 | 2.11.21 | Apache-2.0 |
| browserslist | 4.28.4 | 4.28.9 | MIT |
| caniuse-lite | 1.0.30001800 | 1.0.30001810 | CC-BY-4.0 |
| electron-to-chromium | 1.5.383 | 1.5.425 | ISC |
| node-releases | 2.0.50 | 2.0.55 | MIT |
| update-browserslist-db | 1.2.3 | 1.3.2 | MIT |

npm generated this lock on an ephemeral GitHub runner with package-lock-only,
ignore-scripts and no-audit/no-fund. The preparation branch/workflow is isolated
and absent from this final tree. All six exact registry tarballs were inspected
in memory; SHA-512 bytes matched both registry metadata and the generated lock.
No files were saved on the owner's device. The machine-readable source/version,
integrity and notice receipt is verifier/browser-dependency-checkpoint-2026-09-09.json.

## Security behavior and qualification

Browserslist 4.28.9 incorporates the 4.28.7 bounded-cache and custom-statistics
fixes; baseline-browser-mapping 2.11.21 incorporates the 2.11.0 change from
process termination to recoverable library exceptions. Their compatible
dependency closure advances the four browser data/helper releases shown above.

Tests exercise conflicting Baseline options in a bounded subprocess, continued
successful historical-year lookup, JSON prototype-named statistics without a
crash or caller corruption, and result-cache eviction after bounded churn.
They do not make timing/RSS claims or certify every malformed input. Historical
Baseline queries fix the year; no current-time browser target is introduced.

Required qualification is the complete Node 22/24 test/build matrix, fresh audit
review and both existing built-app preview jobs. The same complete live suites
must pass against the exact merged deployment, including PR #130 dynamic
atmosphere and PR #129 terrain refinement. Actual results belong on the PR;
this document does not pre-claim them.

## Rights, attribution and use boundary

Exact unmodified tarball licenses are retained under docs/licenses/build-tools/.
MIT and ISC copyright/permission notices are retained; Apache 2.0 license and
attribution requirements and its limited patent grant remain applicable.
No package archive contained a separate NOTICE file. We have not modified any
upstream package or dataset; this is a selection of newer released versions.

The caniuse-lite browser compatibility data comes from [caniuse.com](https://caniuse.com/)
and the [caniuse-lite project](https://github.com/browserslist/caniuse-lite).
It is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
The full license, warranty disclaimer and source attribution are retained.
This does not imply endorsement or convey trademark, privacy or patent rights.

Baseline browser mapping is the existing Apache-2.0
[Web Platform DX package](https://github.com/web-platform-dx/baseline-browser-mapping).
Its upstream documentation distinguishes MDN browser compatibility data from
best-effort downstream mappings derived from useragents.io, including approximate
first-seen dates. The update preserves that provenance and uncertainty; it does
not turn those dates into precise release observations. The package includes
prepacked data. MIP neither accesses its private upstream API nor activates a
new provider. These data remain build-time compatibility inputs, not MIP event,
market, evidence or publication records.

Package use and notices remain within the existing ephemeral CI build workflow.
Any future distribution of package/data content must retain the applicable
licenses, attribution, source links, disclaimer and modification indications.
There is no new paid service, copyleft license or changed production SDK.
This review does not clear unrelated datasets, providers or uses.

## Remaining boundaries

Vite 5.4.21 and esbuild 0.21.5 are unchanged and retain separately tracked
findings pending coordinated Vite/plugin migration. Static Pages does not expose
their dev server, but that is not a patch or an audit-clean claim. Collector
semantic acknowledgement/cutover, legacy retirement, Markets source identities
and rights, uncleared weather sources, deferred rendering and physical-device
qualification remain separate.

## Primary references

- https://github.com/advisories/GHSA-c83g-rgw3-j3cx
- https://github.com/advisories/GHSA-73wf-gq98-2v4g
- https://github.com/advisories/GHSA-w5vr-8v7q-w6rv
- https://github.com/browserslist/browserslist/releases/tag/4.28.9
- https://github.com/web-platform-dx/baseline-browser-mapping/pull/137

## Browser qualification readiness

The first two attempts recorded WebKit access-control read errors. A subsequent
instrumented attempt proved the separate module error came from the old
incrementallyBuildTerrainPicker worker after beforeunload and before pagehide;
the new document then loaded successfully. The retained-timestamp verifier had
only waited for a camera/frozen clock, which can exist while terrain workers and
background reads are still pending. It now waits for globeTilesLoaded and network
idle before its deliberate reload. This qualifies retention from a settled view,
not arbitrary interruption of loading. All page-error assertions remain intact;
no fetch interception, ignored error or production behavior change is introduced.
The earlier access-control errors are not claimed fixed. Response/allowed-origin
and originating-document diagnostics are retained for any recurrence. Exact
failed runs and fresh final qualification are recorded on the PR.

The full preview in run 34359995561 passed every browser assertion through the
final WebKit comparison recovery but exceeded the 12-minute job allowance.
The full preview and full live jobs now allow 15 minutes; every required step and
assertion remains intact, and the independent focused job retains eight minutes.
This accommodates settled-readiness qualification and normal runner variability;
it does not change product or provider execution limits.
