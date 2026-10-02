# World View source admission seams — 2026-10-02

Base: `dde42b88b52c43f253c1b7fd8d4fab79371f0a01`. This packet adds a pure detached adapter over existing source-status, module and resource-policy contracts. It performs no fetching, provider activation, credentials, backend changes or source acquisition. Synthetic test receipts establish contract behavior only; no Cleveland imagery, terrain, building or 3D Tiles asset is admitted by this packet.

## Integration API

- `evaluateWorldViewRealismAdmission(source, {kind, bounds, level})` returns `{approved, reason, metadata}`. `bounds` are geographic `[west,south,east,north]`, not asset coordinates. Failure metadata is null.
- `planWorldViewRealismRequest({kind, sources, bounds, level, preferHigh, highCostAccess, failedSourceIds, ancestor})` returns `{request, reason, rejected}`. The descriptor does not create a provider or request bytes. Supply the existing authoritative resource-policy result as `highCostAccess`; preference alone cannot authorize activation. High sources also require their own explicit activation receipt. Failed IDs stay excluded until caller deliberately clears them. Cheap eligible sources remain available as fallback.
- `resolveWorldViewRealismLayer({kind, sources, observation, requestedSourceId})` reports the actual observed source separately from preference. Observation requires actual rendered source ID, positive integer successes, visible attribution, geographic bounds, actual level and direct/approved-parent ancestry. Renderer readiness, attempts and stale success alone cannot establish ACTIVE. An active bounded tile does not certify every viewport pixel. Ellipsoid/atlas/cartographic fallback remains FALLBACK.
- `admitWorldViewContextModules(record, {admittedSourceIds})` consumes explicit `suppliedModules` using the existing allowlist. It preserves exact content and scope. Wire the independently admitted source registry, not imagery IDs inferred as contextual evidence.

Callers own acquisition, verified receipts, authoritative security/cost enforcement, provider lifecycle and runtime observations. These client-consumable objects are display/planning inputs, not a security boundary. The original detached packet wired no existing source file. In deb45e2, WorldMapCanvas reports observed cartographic/Atlas fallback through resolveWorldViewRealismLayer with an empty qualified registry. WorldView calls admitWorldViewContextModules with an empty admitted-source list. The released spatial_projection_v1 column contract does not contain supplied_modules, so optional domain modules are deliberately unreachable; core Evidence/Context/Sources remain active. planWorldViewRealismRequest has no runtime caller or fetch adapter. These are framework-qualified, failclosed seams, not activated photographic/terrain/building layers. No backend columns or supplied facts have been fabricated.

## Source receipt

Required source fields: unique `id`; `kind` imagery/terrain/building/3d-tiles; nonempty `contentKind`; `costTier` cheap/high; `admission:{approved:true,reference}`; rights reference and explicit true commercial/publicWeb/cache/redistribution/derivatives/analyticalUse/attribution permissions; nonempty attribution records with text; coverage `{crs:'EPSG:4326',bounds}`; integer bounded `lod:{min,max}`.

`qualification` requires bytesVerified, SHA-256 of actual asset, reference, assetCrsVerified plus actual assetCrs, decodedVerified and coverageVerified. Imagery and photographic/photogrammetric content also require pixelsVerified; building/3D Tiles require geometryVerified. Synthetic sources fail admission. Imagery/terrain require positive resolutionMeters. Optional accuracy stays explicitly unknown unless supplied; display never improves canonical evidence precision.

Photographic/photogrammetric capture requires verified recorded start and declared precision `day` (YYYY-MM-DD) or `instant` (timestamp with recorded offset). Optional end must use matching precision and not precede start. Original strings are retained: day precision gains no invented UTC time. Cartographic capture can remain unknown. No event, inspection or current date substitutes for capture time.

Terrain additionally requires verticalDatum, horizontalUnits and verticalUnits. `rendererTransform` requires approved true, reference, exact fromDatum/fromUnits matching the source, toDatum `WGS84-ellipsoid`, toUnits `metre`, method and pinned ancestry. This includes identity transformations: explicit qualification remains required. NAVD88 US survey feet cannot silently become ellipsoid metres. Transformation implementation is outside this adapter; the caller must verify the actual transformation receipt.

Building metadata retains supplied heightSource and heightProvenance (including modelled/measured basis and any unknown sentinel). Bare-earth DEM content, heightSource or explicit DEM height derivation cannot admit building/3D Tiles height. No facade rights or heights are inferred from terrain. `suppliesBuildingHeights` only describes explicitly supplied building geometry, never measured accuracy.

Over-max LOD uses only explicit `ancestor:{sourceId,verified:true,loaded:true,level,bounds}` with real parent level inside the source band, bounds containing the requested bounds, and all parent bounds inside qualified source coverage. Below-min requests fail. No root ellipsoid becomes real dataset ancestry.

## Contextual module receipt

Each supplied module requires eligible true, admission approved/reference, and nonempty sourceRefs whose sourceId exists in the externally admitted registry. Noncore modules also require temporalScope reference and valid asOf or start, optional valid end, plus spatialScope geographyId and precision. Population is only an explicit place module with domain population, temporalScope period and populationBasis. Duplicate IDs remain ambiguous even if one duplicate is ineligible. Images, event coordinates and dates cannot manufacture population or other domain facts.

## Remaining qualification gates

The October 2 public GET diagnosis was CONNECT tunnel 403 before PostgREST/auth, so this packet does not claim a reader/RLS fault or apply credentials/config changes. Source-specific official ISO metadata reported EPSG:6346 while tile STAC reported EPSG:26917; both remain provenance observations, not a verified TIFF CRS. Actual TIFF bytes/hash/pixels/CRS, coverage, source rights and terrain transformation remain external gates. No acquisition denial is bypassed.

## Validation

`node --test tests/worldViewRealismAdmission.test.mjs tests/worldViewSourceStatus.test.mjs tests/worldViewBillboardModules.test.mjs tests/worldViewResourcePolicy.test.mjs` — 26/26 passed, including eight new contract tests. Tests cover asset qualification, all rights, terrain units/transformation, capture precision, building provenance, cheap/high/failing-source planning, real parent LOD, truthful active source and scoped supplied population modules. No browser/provider/live data behavior is claimed.
