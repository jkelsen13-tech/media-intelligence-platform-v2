# Cleveland point-cloud experiment — 4 October 2026

Outcome: an actual bounded metadata acquisition was attempted once and stopped
at an executor tunnel `403 Forbidden`. No source bytes, hierarchy pages, LAZ
nodes or decoded points were acquired. Actual height estimation remains blocked.

The new isolated standard-library tool implements stream accounting, an exact
public EPT root allowlist, redirects refusal, persistent no-retry run ledgers,
bounded hierarchy traversal and additive sample planning. It refuses point
acquisition before requests because no measured existing LAZ decoder/header/buffer
qualification exists. Production viewer, terrain-comparison contract and existing
scripts are unchanged.

## Source and rights

[NOAA item 69581](https://www.fisheries.noaa.gov/inport/item/69581), updated
19 August 2026, directly identifies the USGS Ohio Phase1_1 public EPT product.
Its lineage describes horizontal EPSG:3857 and NAVD88/GEOID12B elevations converted
to metres. This is a distinct point-cloud product, independent of earlier denied
TIFF/Library transfers. Its listed classes include unclassified, ground, noise,
water, bridges and ignored ground; they do not identify authoritative buildings.
Phase1_1's documented acquisition period is 9 November 2019–2 May 2020; a local
flight date remains unknown. No LAS GPS header was observed.

[AWS's official registry](https://registry.opendata.aws/usgs-lidar/) identifies
US Government Public Domain rights and account-free public EPT access. Its
separate original LAZ bucket uses Requester Pays and is forbidden here.
[USGS products guidance](https://www.usgs.gov/3d-elevation-program/about-3dep-products-services)
states that 3DEP products are free without use restrictions and distinguishes
point-cloud, source-resolution DEM and standard DEM products. The earlier NOAA
80072 original 1.25-foot DEM is therefore not relabeled as a standard 1-metre DEM.

These primary pages were successfully read through the web tool. Their raw
webpage bytes were not materialized or hashed. The exact EPT source JSON was
not obtained in this executor; no EPT count/schema/bounds/hash is claimed from
this attempt. `primary-source-checks.json` records the provenance of those facts.

## Actual attempt and controls

At 17:17:49 UTC, the tool requested exactly:

`https://s3-us-west-2.amazonaws.com/usgs-lidar-public/OH_Statewide_Phase1_1_2019/ept.json`

The HTTP CONNECT tunnel returned `403 Forbidden`; the origin HTTP status is
unknown. The tool received zero body bytes and stopped after one request. No
alternate URL, executor, mirror, retry, Requester Pays or previously denied route
was used. Measured elapsed acquisition was 0.01809 seconds and whole-process peak
RSS was 18,087,936 bytes. Its metadata process had a 100,663,296-byte virtual
memory ceiling. These measurements describe this failed attempt, not successful
hierarchy or decoding performance.

Limits are 64 KiB root JSON, 1 MiB combined initial metadata/root hierarchy,
32 MiB total source bodies, 32 requests, 16 hierarchy pages, depth 18 and at most
500,000 hypothetical selected points. Identity response encoding and exact
Content-Length are required before reads; partial bodies are counted. The planner
does not promise complete traversal or full-density points within those limits.
The metadata process ceiling prevents unconstrained JSON memory allocation.

Both initial raw receipts remain byte-for-byte unchanged. The first code version
marked `denied: false` because it classified `HTTPError` but omitted the tunnel's
`URLError` case. The later tested code classifies the tunnel denial correctly;
`qualification.json` explicitly corrects that interpretation without rerunning
or rewriting the retained receipt. The original `stopped: true` and zero-byte
accounting were correct.

## Existing source custody and limitations

The existing footprint manifest binds two OSM ways 1511440097/1511440098 at version
1 to a 3,117-byte unchanged 2D GeoJSON, SHA256
`fe14f6d6472de92c67e34136db9a97a816e9e49e17208354523f683d10872735`.
Its raw bytes were unavailable. No rings were reconstructed or height inferred
from semantic metadata. The preserved OSM/ODbL attribution obligations remain.

The planner's hypothetical window uses the manifest bounding box plus an
approximately 15-metre local ground ring inside the prior 512-metre terrain area.
The existing generic NAD83 UTM17N transformation and area/epoch uncertainty,
approximate geographic boundary and analytic Mercator selection are explicitly
research-only. They do not prove accepted registration, an owner AOI, datum
operation accuracy, or evidence-coordinate precision.

No installed laspy/lazrs/pdal/lazperf/LAStools capability was found in the bounded
PATH/module and workspace/opt/lib/bin inspection; numpy/scipy were available.
No package or security/environment setup occurred. The remaining prerequisites
are supported source access, exact footprint custody, an already available
measured decoder, verified LAS counts/format/flags/GPS semantics and accepted
registration. No request to bypass the denied route is implied.

## Verification and authority

Two Node tests pass, wrapping eleven offline Python adversarial/semantics cases
and a CLI point-acquisition refusal. The tests exercise terminal origin/tunnel
denial, actual urllib redirect processing, unknown/oversized/truncated bodies,
cumulative/initial byte caps, request caps, subtree containment, additive sample
counting, and explicit roof/vegetation uncertainty using synthetic points. They
do not establish real heights or a decoded point sample.

Starting source is `0ebf51d80179130c2b05041663c02777c427fcf4`, tree
`aa2b71604f4fd782316b27bc340c88763db4eaad`, on the isolated
`codex/mip-point-cloud-experiment-20261004` branch. This source-only experiment
does not alter that application's source-CLEAN verdict or clear admission,
precision, rights, physical/final appearance, source transfer, protected/live
operations, provider activation, spending, merge, deployment or release gates.
No push was performed.
