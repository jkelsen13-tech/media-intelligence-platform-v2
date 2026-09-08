# Cancel obsolete World View camera flights

Package 01 backfill: when selected geometry is cleared or withdrawn during a
subject flight, framing now asks the active renderer to cancel that flight.
An accepted cancellation is recorded once; ordinary refreshes preserve manual
navigation. If the renderer is temporarily unavailable, cancellation remains
pending. Replacing the renderer discards its obsolete framing receipt.

Both Cesium and MapLibre expose cancellation through the existing dispatcher,
gated on readiness and lifecycle. Restoring a valid camera explicitly cancels
the prior flight before applying the new position. Invalid restores retain the
existing fail-safe path. Precision floors, coordinates, selection, time and
projection records are unchanged.

The project uses the existing renderer APIs:
[Cesium cancelFlight](https://cesium.com/learn/cesiumjs/ref-doc/Camera.html#cancelFlight)
leaves the camera where it is; [MapLibre stop](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/#stop)
stops an animated transition. No completion-to-destination is requested.

## Scope and rights

Only MIP-owned coordination, adapter calls, regressions and preview wiring change.
No donor code, dependency version, map dataset, tile route, provider, notice or
license is added or changed. Existing source attributions remain in the rendered
map. No overlay policy diff, backend change, ingestion or publication occurs.
POWER and the Browserslist candidate remain held for independent rights review.

This closes the in-progress cancellation gap, not the entire navigation or
shareable-view package. Persistent authorized view presets and wider touch,
dateline/pole and performance acceptance remain separate work.

## Required verification

Seven new regressions cover accepted cancellation, retry, renderer replacement,
both engine stop methods, restore ordering and dispatcher lifecycle. The existing
framing fixture implements the new cancellation seam. Existing camera precision,
dateline/pole and subject/time tests remain required, with full Node 22/24 builds.

The existing bounded anonymous GitHub runner preview now includes camera changes.
It restores a camera during a subject flight, waits beyond the flight duration,
checks the restored position and unchanged route, then returns to the selected
location and captures the map. Existing phone/desktop weather screenshots and
zero restricted-provider/error assertions remain. No auth storage is inspected.

Source stays on GitHub and ephemeral runners. After conditional merge and Pages
deployment, verify phone Account, NASA saved revision/report and synchronized
Graph/Timeline/World View with return navigation. Actual CI and live results are
recorded in the pull request, not claimed here in advance.
