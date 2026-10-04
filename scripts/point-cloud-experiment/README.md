# Cleveland bounded EPT research

This isolated tool implements exact-root metadata acquisition, spatially bounded
EPT hierarchy traversal, additive node selection, a persistent stop ledger, and
an offline conservative surface-summary function. It has no application/provider
integration. No package installation is performed.

The actual 2026-10-04 acquisition stopped on the first metadata request with an
executor tunnel `403 Forbidden`. The origin's HTTP status is unknown. Zero bytes
were acquired; no hierarchy or LAZ node was requested. This dataset request must
remain stopped; the commands below explain the tool and are not authorization to
repeat the denied acquisition in another output folder or executor.

```sh
# Offline checks only; no provider requests.
PYTHONDONTWRITEBYTECODE=1 node --test tests/pointCloudExperiment20261004.test.mjs
```

The actual command was:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 scripts/point-cloud-experiment/bounded_ept.py \
  --output /workspace/mip-oct04-launch-readiness/point-cloud/metadata-attempt-1
```

`--acquire-points` is a fail-closed prerequisite check. It always refuses before
requests in this version: no installed decoder/header/live-buffer qualification
exists. The acquisition class only accepts `ept.json` and numeric hierarchy JSON
paths under the one fixed public EPT root; it refuses LAZ paths. Package presence
cannot enable point fetching. Future point work needs coordinated supported
access, exact unchanged footprint bytes, measured existing decoder behavior,
verified LAS header point counts/record format/GPS semantics, and buffer limits.

Controls: 64 KiB `ept.json`; 1 MiB combined initial metadata/root hierarchy;
1 MiB per hierarchy page; 32 MiB total received bodies; 32 requests; 16 hierarchy
pages; depth 18; 16,384 intersecting nodes; 4,096 queued pages. The metadata
process has a 96 MiB whole-process virtual-memory ceiling, stricter than its
96 MiB live-buffer allowance. Content-Length and identity encoding must be
verified before body reads. Every received partial byte is counted. All HTTP
redirects are refused. Any request error or unverifiable cap stops the run;
an existing ledger/report cannot be retried or overwritten.
Invalid relative paths also persist a terminal stop, and exhausted initial/total
budgets refuse before any opener call. Preflight failures never log unapproved
URL contents or count as attempted network requests. Only the verified EPT
1.0.0 metadata version is accepted; duplicate schema names and Boolean bounds
are refused.

The planner selects at most eight dense nodes whose summed hierarchy count is
at most 500,000 points. This is a hypothetical upper bound, not decoded evidence.
EPT levels are additive; omitted ancestor nodes are recorded and the sample is
never described as full density. Request/page/depth caps bound engineering work,
not a guarantee that the dataset's relevant branches can be completed.

The selected window surrounds the preserved manifest's two OSM footprint
bounding boxes with approximately 15 physical metres for a ground ring. The
prior 512 m terrain boundary, its generic NAD83-to-WGS84 operation and the
analytic EPSG:4326-to-3857 projection are research selection controls only.
They are not accepted registration, datum-operation accuracy, or source geometry.
`read_footprints` requires the unchanged 3,117-byte GeoJSON's SHA256; no footprint
ring is reconstructed from semantic metadata. Raw rings were unavailable.

The offline surface function preserves class 1 as unclassified. It excludes
noise/water/bridge/ignored ground and all four classification flags from candidate
heights, compares first-return candidates against class-2 local ground, and labels
any estimate as an unclassified surface that may be roof or vegetation. Its unit
test uses synthetic points solely to check these semantics. It is not real roof
evidence, a vegetation classification, authoritative building class 6, independent
height verification, an admitted 3D model, or a roof mesh. Source flight periods
and LAS creation dates cannot establish a local capture date. GPS values cannot
be interpreted without verified header semantics.

Exact source/rights references, raw attempt receipts, hashes, caps, and result
limitations are in `docs/qualification/point-cloud-20261004/`.
