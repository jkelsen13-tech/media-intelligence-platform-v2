# Same-camera terrain / ortho research comparison

This is an offline scientific rendering protocol, separate from the release-candidate UI. A is terrain alone. B is photographic ortho plus the same DEM. C remains unavailable as true 3D: the acquired Overture material contains provenance, not geometry or heights; the later two OSM building outlines have no verified heights. No roofs, deck heights or extruded buildings may be inferred from the bare-earth DEM.

The supplied record is **NOT_EXECUTED**. Parent attempted one new official USGS header reacquisition; the tunnel returned 403 before any bytes. It stopped without a second range request, retry or bypass. Supported Library transfer is also blocked. Its actual USGS native512 TIFF is unbound in this executor. The Ohio RGB package and four resident tiles are verified local research bytes, with source authority **UNAPPROVED**. They are prior resident derivatives, not a new Library transfer or app admission. Historical native browser permission fixtures were simulated QA authority. The retained final-native-proof Library ZIP is not substituted with screenshots.

## Inputs and custody

Use `terrain-comparison-20261003.template.json` as the owner-fillable record. The exact terrain candidate is 591,155 bytes, SHA256 `cd684d9d5311092ef90d4e8c34a1b5de8b842ccf03633b6858424dbf8b652f3a`, with canonical row-major little-endian Float32 pixel SHA256 `4fe0e9051b735037549842cbf1e5540d62d96949550855c827932157711a59f0`. Its native EPSG:26917 bounds are `[441017.99997115403,4583350.000010459,441529.99997115403,4583862.000010459]`; the requested grid is immutable, 512 × 512 at one metre.

The header says generic NAD83 / UTM17N, with no exact realization or epoch. NAVD88 and metre elevations are catalogue claims, not vertical GeoKeys; the exact geoid remains unresolved. GEOID12B advertised for original delivery is not a validated transform for this standard1m representation. NOAA Block1's 2019-11-09–2020-05-02 project window is not an exact local capture day. The TNM Phase1_8/Lorain lineage anomaly remains open. The full 335,471,207-byte source is not acquired or hashed; an HTTP multipart ETag is not its SHA256.

The resident photographic derivative's package SHA256 is `ebc0599832575409a56088af66c6d284993c69871331252291d1d743af5d862c`. Capture is 2023-03-07, day precision, from the exact retained XML. Every intended tile's encoded bytes, dimensions and **band-planar contiguous RGB** hash match the original runtime provenance. Pillow's interleaved RGB hash has a different layout, also recorded; it does not indicate different pixels. PNGs contain no GeoKeys. Their assigned EPSG:4326 bounds come from hash-bound derivative provenance, not a new original-TIFF measurement.

The original TIFF's 0.25 US survey foot pixel is approximately 0.07620 m; that original was not decoded by this consumer. The received native RGB derivative uses 1.220703125 US survey feet, approximately 0.37207 m, before its reduced EPSG:4326 warp. The app reference's 0.38 m is nominal. Do not label the actual derivative or rendered face colours 7.6 cm. Exact angular tile steps, source footprint and all upstream identities are in the record. The inherited detached EPSG:3753→4326 operation reports 1 m accuracy; it does not measure registration against this DEM. Original accuracy-class specifications likewise do not supply a measured residual.

`terrain-comparison-20261003.evidence.json` records resident custody and capabilities, not an A/B result. Installed CLI GDAL is 3.10.3; Python osgeo, rasterio and pyproj are absent. The helper uses existing GDAL CLI, numpy, Pillow and matplotlib. It never installs packages, acquires source bytes, activates a provider or contacts a service.

## Execution gate and common camera

1. Materialize the already-authorized exact native512 TIFF in the producer's byte environment. Independently verify the complete file and canonical pixel hashes. Set only its binding path/status; retain source metadata and capture uncertainty. Never use the historical sparse decoder scaffold as a complete source.
2. Bind an explicitly reviewed **ortho EPSG:4326→DEM EPSG:26917** coordinate-operation pipeline with its literal SHA256, source/target axes, reported accuracy (or null), exact required grid names/files/hashes and local availability. Keep `PROJ_NETWORK=OFF`. Do not reuse the upstream EPSG:3753→4326 operation as if it were this operation. No implicit best/ballpark operation or arbitrary alignment offset is allowed. Nonzero `xoff/yoff/zoff` inside the pipeline are refused; zero-translation identity affine is permitted. Nonidentity affine and Helmert/grid datum steps require `operation.reviewedMethod` containing an exact authoritative method/name and hash-bound evidence references. CRS false eastings (`x_0/y_0`) and reviewed Helmert datum parameters are not rejected as cosmetic offsets.
3. Until horizontal registration and the source height basis are qualified, select `LOCAL_COORDINATE_RELATIVE_HEIGHT_RESEARCH`, keep global-registration claim false and use source-relative metre heights. Subtract only the minimum finite non-nodata source DEM value; use vertical exaggeration 1. No guessed constant geoid correction, ellipsoidal relabeling or canonical coordinate movement is allowed. `GEOGRAPHIC_RESEARCH` additionally requires exact source/target horizontal bases, measured control residuals/evidence and the exact qualified source height basis. Neither mode admits a source to the app.
4. Run the ready gate and offline helper in a new evidence directory. It warps RGB using only the explicit operation onto the immutable native DEM grid, with bilinear resampling, zero warp-approximation error and explicit alpha coverage. It selects the largest fully valid axis-aligned common DEM/ortho rectangle. Both A and B use that **actual overlap only**: no extrapolation, zero-fill, guessed stretch, screenshot texture or missing-data terrain is shown.
5. Record both PNGs and the resulting receipt. A/B share the same overlap footprint, pixel-centre mesh, orthographic camera angles, metre-proportional box aspect, light azimuth/altitude, source-relative origin, canvas and DPI. Source grid corners and mesh centre extents are distinct. Face colour means and mesh decimation determine the actual rendered resolution, recorded in metres; source pixel size is not a promise of visible detail. C remains an unavailable text record.

Run from a clean checkout containing the helper:

```sh
node scripts/terrain-comparison/validate.mjs /producer/comparison-record.json --ready
python3 scripts/terrain-comparison/render.py --record /producer/comparison-record.json --output /producer/new-comparison-evidence
node scripts/terrain-comparison/validate.mjs /producer/new-comparison-evidence/record.json --ready --verify-artifacts
```

The artifact check recomputes local input/output byte hashes, PNG dimensions and this harness/contract's source hashes. Execution records include UTC time, Git commit/tree/dirty state when available (exported helpers retain exact file hashes), source metadata, commands, effective mesh/colour spacing, missingness counts and the common valid window. Preserve every previous receipt. A changed source, operation, grid, camera, light or render setting requires a new record/run; do not relabel an earlier execution with a later commit.

Custody inspection without executing A/B:

```sh
python3 scripts/terrain-comparison/render.py --record docs/qualification/terrain-comparison-20261003.template.json --output /producer/new-ortho-custody --inspect-ortho-only
```

Synthetic mechanics proof, clearly separate from actual-data results:

```sh
python3 scripts/terrain-comparison/synthetic-proof.py --output /producer/new-synthetic-proof
node --test tests/terrainComparisonContract20261003.test.mjs
```

The synthetic surface/colours are mathematical fixtures, use identity coordinates and cannot establish local source registration, geographic quality, source admission, visual acceptance, native-app qualification, physical-device FPS, memory or thermals. This source preparation preserves the historical cold-portrait RED; its unrecovered original trace/budget units remain unknown.

## Observation sheet and acceptance

Fill `terrain-comparison-20261003.observations.csv` only after viewing actual A/B. Record bank, road, grade and bridge controls in the declared coordinate basis, the source pixels/control coordinates, horizontal or vertical residual with units, uncertainty/method and exact artifact/evidence references. Leave unknown values blank. An apparent visual offset is an observation, never authority to translate the source. Report original/source, operation and measured-registration errors separately; do not combine them as a new accuracy claim without a method.

Bare-earth terrain may omit bridge decks, buildings, roofs and vegetation; hydroflattening, seams, nodata and differing 2019/2020 versus 2023 capture can explain disagreement. Road/grade judgement must distinguish terrain grade from elevated structures and shadows. No height-derived roofs or inference of facade imagery is permitted. Parent verified two official read-only Overpass OSM outlines (ways 1511440097/98 at version 1; GeoJSON 3,117 bytes, SHA256 `fe14f6d6472de92c67e34136db9a97a816e9e49e17208354523f683d10872735`). Their portable Library identifiers and full-ring bounds are recorded as semantic metadata only; raw consumer bytes remain unbound. Their ODbL rights are conditional; public-compliance design remains unqualified, with no small-extract exemption assumed. These outlines with `building=yes` and Microsoft source tags still do not supply heights or roofs; any later 2D outline analysis needs independently verified geometry/overlap/rights, distinct from C true 3D.

Keep **functional mechanics**, **visual research observations** and **performance measurements** separate. The helper can prove deterministic input decoding, guarded overlap and identical A/B settings. Actual A/B visual observations remain pending until genuine bytes are available and executed. Final product visual acceptance still needs admitted real imagery/terrain/geometry and exact source/provider provenance. Provider-side evidence, consumer-side local custody, source qualification and admission are separate records. The canonical event anchor and precision floor remain unchanged throughout.
