#!/usr/bin/python3
"""Offline, bounded RGB inspection derivatives. Never admits an application source.

Use the system Python with GDAL/pyproj. No network, source acquisition, archive
reassembly, provider activation, evidence coordinate writes, or raw Git assets.
The 16MiB guard bounds package/decoded runtime resources, not Python/GDAL RSS.
"""
import argparse
import datetime
import hashlib
import html
import io
import json
import math
import os
from pathlib import Path
import re
import stat
import struct
import xml.etree.ElementTree as ET
import zipfile
import zlib

SCHEMA = "mip.real-imagery-derivative.v1"
MAX_BYTES = 16 * 1024 * 1024
MAX_XML = 1024 * 1024
MAX_MANIFEST = 256 * 1024
MAX_EDGE = 1024
TILE_EDGE = 512
HASH_CHUNK = 1024 * 1024
SHA = re.compile(r"^[a-f0-9]{64}$")
FILE = re.compile(r"^(?:tile-[0-9]+-[0-9]+\.png|source-metadata\.xml|(?:upstream-)?provenance\.json)$")
REQUIRED_BINDINGS = {"rights", "attribution", "use_constraints", "capture_start"}


class Refusal(Exception):
    def __init__(self, code, detail):
        self.code, self.detail = code, detail
        super().__init__(f"{code}: {detail}")


def require(condition, code, detail):
    if not condition:
        raise Refusal(code, detail)


def canonical(value):
    return (json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def strict_json(data):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, "AMBIGUOUS_JSON", key)
            result[key] = value
        return result
    return json.loads(data, object_pairs_hook=unique,
                      parse_constant=lambda value: (_ for _ in ()).throw(Refusal("INVALID_JSON", value)))


def read_small(path, limit, code="INPUT_BYTES_MISSING"):
    path = Path(path)
    require(path.is_file() and not path.is_symlink(), code, "Readable regular input is required")
    require(path.stat().st_size <= limit, "INPUT_BOUND_EXCEEDED", path.name)
    with path.open("rb") as stream:
        data = stream.read(limit + 1)
    require(len(data) <= limit, "INPUT_BOUND_EXCEEDED", path.name)
    return data


def hash_file(path, expected, code="SOURCE_BYTES_MISSING"):
    path = Path(path)
    require(path.is_file() and not path.is_symlink(), code, "No source bytes were read; metadata is not qualification")
    require(path.stat().st_size == expected["byteLength"], "SOURCE_SIZE_MISMATCH", path.name)
    value = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(HASH_CHUNK):
            value.update(chunk)
    require(value.hexdigest() == expected["sha256"], "SOURCE_HASH_MISMATCH", path.name)
    return {"sha256": value.hexdigest(), "byteLength": expected["byteLength"], "verifiedByProducer": True}


def validate_expected(expected):
    source = expected.get("source", {})
    require(expected.get("schema") == "mip.real-imagery-source-expectations.v1", "INVALID_EXPECTATIONS", "schema")
    require(SHA.fullmatch(source.get("sha256", "")) and type(source.get("byteLength")) is int
            and source["byteLength"] > 0, "INVALID_EXPECTATIONS", "source identity")
    require(source.get("epsg") == 3753, "UNSUPPORTED_CRS", "This bounded qualification lane is EPSG:3753 only")
    require(all(type(source.get(key)) is int and 0 < source[key] <= 100000 for key in ["width", "height"]),
            "INVALID_EXPECTATIONS", "source dimensions")
    require(source.get("bandCount") == 4 and source.get("colorInterpretations") == ["Red", "Green", "Blue", "Undefined"]
            and source.get("dataTypes") == ["Byte"] * 4, "INVALID_EXPECTATIONS", "Exact RGB+Undefined byte bands required")
    gt = source.get("geotransform")
    require(isinstance(gt, list) and len(gt) == 6 and all(type(v) in [int, float] and math.isfinite(v) for v in gt)
            and gt[1] > 0 and gt[5] < 0 and gt[2] == gt[4] == 0, "INVALID_EXPECTATIONS", "north-up affine")
    require(source.get("bounds") == native_bounds(gt, source["width"], source["height"]),
            "INVALID_EXPECTATIONS", "source bounds/affine disagree")
    metadata = expected.get("metadata", {})
    require(SHA.fullmatch(metadata.get("sha256", "")), "INVALID_EXPECTATIONS", "metadata hash")
    capture = expected.get("capture", {})
    try:
        parsed = datetime.date.fromisoformat(capture.get("start", ""))
    except ValueError:
        raise Refusal("INVALID_EXPECTATIONS", "Exact recorded capture day required")
    require(capture.get("precision") == "day" and parsed.isoformat() == capture["start"], "INVALID_EXPECTATIONS", "capture day")
    point = expected.get("evidencePoint", {})
    require(point.get("synthetic") is True and point.get("datum") == "unknown", "INVALID_EXPECTATIONS", "Evidence point datum stays unknown")
    return expected


def native_bounds(gt, width, height):
    return [gt[0], gt[3] + height * gt[5], gt[0] + width * gt[1], gt[3]]


def verify_metadata(data, expected):
    require(len(data) <= MAX_XML and digest(data) == expected["metadata"]["sha256"], "METADATA_HASH_MISMATCH", "Exact XML bytes required")
    require(not re.search(br"<!\s*(?:DOCTYPE|ENTITY)\b", data, re.I), "UNSAFE_XML", "DTD/entity declarations refused")
    try:
        root = ET.fromstring(data)
    except ET.ParseError as error:
        raise Refusal("INVALID_XML", str(error))
    bindings = expected["metadata"].get("bindings", [])
    require(isinstance(bindings, list) and 0 < len(bindings) <= 32, "METADATA_POLICY_UNBOUND", "Exact XML rights/notice/capture bindings required")
    seen, facts = set(), []
    for binding in bindings:
        key, path = binding.get("id"), binding.get("path")
        require(isinstance(key, str) and key not in seen and isinstance(path, str) and path.startswith("./")
                and ".." not in path and len(path) <= 256, "INVALID_METADATA_BINDING", "Ambiguous or invalid field binding")
        seen.add(key)
        try:
            nodes = root.findall(path)
        except (KeyError, SyntaxError) as error:
            raise Refusal("INVALID_METADATA_BINDING", str(error))
        require(len(nodes) == 1, "METADATA_BINDING_MISMATCH", f"{key} must identify exactly one XML field")
        original = "".join(nodes[0].itertext())
        normalized = " ".join(original.split())
        require(normalized and normalized == binding.get("expectedText"), "METADATA_BINDING_MISMATCH", key)
        facts.append({"id": key, "path": path, "text": original, "normalizedText": normalized})
    require(REQUIRED_BINDINGS <= seen, "METADATA_POLICY_UNBOUND", "Rights, attribution, notice and recorded capture required")
    capture_text = next(f["normalizedText"] for f in facts if f["id"] == "capture_start")
    require(capture_text in [expected["capture"]["start"], expected["capture"]["start"].replace("-", "")],
            "CAPTURE_BINDING_MISMATCH", "Recorded XML day differs; no event/fetch time substitution")
    return {"sha256": digest(data), "byteLength": len(data), "xmlBindings": facts,
            "rightsInterpretation": expected.get("rightsInterpretation"),
            "grantsApplicationAdmission": False}


def geospatial_runtime():
    os.environ["PROJ_NETWORK"] = "OFF"
    from osgeo import gdal, osr
    from pyproj import network
    network.set_network_enabled(False)
    gdal.UseExceptions()
    gdal.SetConfigOption("PROJ_NETWORK", "OFF")
    gdal.SetConfigOption("GDAL_NUM_THREADS", "1")
    gdal.SetConfigOption("GDAL_PAM_ENABLED", "NO")
    gdal.SetCacheMax(2 * 1024 * 1024)
    return gdal, osr


def verify_raster(path, expected, *, received_derivative=False):
    gdal, osr = geospatial_runtime()
    src = expected["receivedDerivative"]["raster"] if received_derivative else expected["source"]
    dataset = gdal.OpenEx(str(path), gdal.OF_RASTER | gdal.OF_READONLY, allowed_drivers=["GTiff"])
    require(dataset is not None, "SOURCE_DECODE_FAILED", "Readable GeoTIFF required")
    require((dataset.RasterXSize, dataset.RasterYSize, dataset.RasterCount) == (src["width"], src["height"], src["bandCount"]),
            "RASTER_METADATA_MISMATCH", "Dimensions/bands")
    gt = list(dataset.GetGeoTransform(can_return_null=True) or [])
    require(gt == src["geotransform"], "RASTER_METADATA_MISMATCH", "Exact affine")
    crs = dataset.GetSpatialRef()
    canonical_crs = osr.SpatialReference()
    canonical_crs.ImportFromEPSG(3753)
    require(crs is not None and bool(crs.IsSame(canonical_crs)), "RASTER_CRS_MISMATCH", "Asset bytes must establish EPSG:3753")
    bands = []
    for index in range(1, src["bandCount"] + 1):
        band = dataset.GetRasterBand(index)
        interp, dtype = gdal.GetColorInterpretationName(band.GetColorInterpretation()), gdal.GetDataTypeName(band.DataType)
        require((interp, dtype) == (src["colorInterpretations"][index - 1], "Byte"), "RASTER_BAND_MISMATCH", str(index))
        bands.append({"index": index, "colorInterpretation": interp, "dataType": dtype,
                      "usedForRgb": index <= 3, "alpha": False, "nearInfrared": False})
    for index in range(1, 4):
        band = dataset.GetRasterBand(index)
        require(band.GetNoDataValue() is None and band.GetMaskFlags() == gdal.GMF_ALL_VALID,
                "RASTER_VALIDITY_UNQUALIFIED", "No implicit fill/nodata or unqualified coverage holes")
    return dataset, {"width": src["width"], "height": src["height"], "bandCount": src["bandCount"],
                     "bands": bands, "assetCrs": "EPSG:3753", "assetCrsWkt": crs.ExportToWkt(),
                     "horizontalUnits": "US-survey-foot", "nativeGeotransform": gt,
                     "nativeBounds": src["bounds"], "pixelConvention": "affine pixel corners; resampling selects source pixel centres",
                     "colorProfile": "unknown; byte samples retained without inferred sRGB/ICC"}


def version_receipt():
    from osgeo import gdal
    from pyproj import __version__, proj_version_str
    return {"gdal": gdal.VersionInfo("RELEASE_NAME"), "pyproj": __version__, "proj": proj_version_str,
            "zlib": zlib.ZLIB_RUNTIME_VERSION, "network": "disabled", "gdalCacheBytes": 2 * 1024 * 1024,
            "gdalThreads": 1}


def transformation_receipt(expected, tolerance, policy_reference):
    from pyproj import CRS, Transformer
    from pyproj.aoi import AreaOfInterest
    from pyproj.transformer import TransformerGroup
    from pyproj.enums import TransformDirection
    require(type(tolerance) in [int, float] and math.isfinite(tolerance) and 0 < tolerance <= 10
            and isinstance(policy_reference, str) and policy_reference.strip(), "TRANSFORM_POLICY_UNBOUND", "Explicit background-operation tolerance/reference required")
    tolerance = float(tolerance)
    source = CRS.from_epsg(3753)
    target = CRS.from_epsg(4326)
    b = expected["source"]["bounds"]
    inverse_projection = Transformer.from_crs(source, source.geodetic_crs, always_xy=True, allow_ballpark=False)
    # Explicit XY samples avoid relying on transform_bounds axis heuristics for
    # this projected→geodetic-only operation in installed PROJ/pyproj versions.
    approximate_points = []
    for i in range(129):
        x, y = b[0] + (b[2] - b[0]) * i / 128, b[1] + (b[3] - b[1]) * i / 128
        approximate_points.extend(inverse_projection.transform(px, py, errcheck=True)
                                  for px, py in [(b[0], y), (b[2], y), (x, b[1]), (x, b[3])])
    require(all(math.isfinite(v) for p in approximate_points for v in p), "TRANSFORM_BOUNDS_UNKNOWN", "Finite geographic edge points required")
    approximate = [min(p[0] for p in approximate_points), min(p[1] for p in approximate_points),
                   max(p[0] for p in approximate_points), max(p[1] for p in approximate_points)]
    # This AOI locates operations, not evidence registration or admitted coverage.
    aoi = AreaOfInterest(approximate[0] - .001, approximate[1] - .001, approximate[2] + .001, approximate[3] + .001)
    group = TransformerGroup(source, target, always_xy=True, allow_ballpark=False, area_of_interest=aoi)
    unavailable = [{"name": op.name, "accuracyMetres": op.accuracy,
                    "grids": [{"name": g.short_name, "available": g.available} for g in op.grids]}
                   for op in group.unavailable_operations]
    require(group.best_available and group.transformers, "TRANSFORM_BEST_OPERATION_UNAVAILABLE", json.dumps(unavailable))
    chosen = group.transformers[0]
    require(chosen.accuracy >= 0 and chosen.accuracy <= tolerance, "TRANSFORM_TOLERANCE_EXCEEDED", f"Best operation reports {chosen.accuracy}m; policy {tolerance}m")
    require(chosen.operations and all(not op.has_ballpark_transformation for op in chosen.operations),
            "BALLPARK_TRANSFORM_REFUSED", "No ballpark operation")
    grids = [{"name": grid.short_name, "available": grid.available, "package": grid.package_name}
             for op in chosen.operations for grid in op.grids]
    require(all(g["available"] for g in grids), "TRANSFORM_GRID_UNAVAILABLE", "No network grid acquisition")
    area = chosen.area_of_use
    require(area is not None and source.area_of_use is not None, "TRANSFORM_BOUNDS_UNKNOWN", "Operation/CRS areas required")
    for allowed in [area.bounds, source.area_of_use.bounds]:
        require(allowed[0] <= approximate[0] < approximate[2] <= allowed[2]
                and allowed[1] <= approximate[1] < approximate[3] <= allowed[3], "OUTSIDE_TRANSFORM_AREA", "Native extent is outside known bounds")
    # Native projected rectangle is not an exact geographic rectangle. Crop to
    # the intersection of edge constraints, then verify dense inverse edges.
    count = 128
    left, right, bottom, top = [], [], [], []
    for i in range(count + 1):
        x, y = b[0] + (b[2] - b[0]) * i / count, b[1] + (b[3] - b[1]) * i / count
        left.append(chosen.transform(b[0], y, errcheck=True)[0])
        right.append(chosen.transform(b[2], y, errcheck=True)[0])
        bottom.append(chosen.transform(x, b[1], errcheck=True)[1])
        top.append(chosen.transform(x, b[3], errcheck=True)[1])
    crop = [max(left), max(bottom), min(right), min(top)]
    # One original pixel inset is conservative for the sampling/edge model.
    dx, dy = (crop[2] - crop[0]) / expected["source"]["width"], (crop[3] - crop[1]) / expected["source"]["height"]
    crop = [crop[0] + dx, crop[1] + dy, crop[2] - dx, crop[3] - dy]
    require(crop[0] < crop[2] and crop[1] < crop[3], "TRANSFORM_CROP_EMPTY", "No bounded rectangle")
    for i in range(count + 1):
        x, y = crop[0] + (crop[2] - crop[0]) * i / count, crop[1] + (crop[3] - crop[1]) * i / count
        for lon, lat in [(crop[0], y), (crop[2], y), (x, crop[1]), (x, crop[3])]:
            px, py = chosen.transform(lon, lat, direction=TransformDirection.INVERSE, errcheck=True)
            require(b[0] < px < b[2] and b[1] < py < b[3], "TRANSFORM_COVERAGE_REFUSED", "Reduced target boundary must map inside original pixels")
    receipt = {"status": "qualified-operation-for-detached-derivative", "sourceCrs": "EPSG:3753", "targetCrs": "EPSG:4326",
               "alwaysXY": True, "networkEnabled": False, "ballparkAllowed": False, "bestAvailable": True,
               "operation": chosen.description, "pipeline": chosen.definition, "pipelineSha256": digest(chosen.definition.encode()),
               "gdalCoordinateOperation": chosen.definition + " step proj=axisswap order=2,1",
               "gdalCoordinateOperationSha256": digest((chosen.definition + " step proj=axisswap order=2,1").encode()),
               "axisConvention": "pyproj alwaysXY lon/lat; GDAL explicit final swap to EPSG:4326 official lat/lon axes",
               "reportedOperationAccuracyMetres": chosen.accuracy, "toleranceMetres": tolerance, "policyReference": policy_reference,
               "areaOfUse": {"name": area.name, "bounds": list(area.bounds)}, "grids": grids, "unavailableOperations": unavailable,
               "nativeBounds": b, "rendererBounds": crop, "coverage": "explicit reduced inscribed rectangle; one native pixel inset",
               "edgeSamples": count + 1, "warpApproximationErrorPixels": 0,
               "sourceAccuracySpecification": expected.get("accuracySpecification"), "measuredRegistrationAccuracyMetres": None,
               "evidencePointRegistered": False, "verticalTransformation": None}
    return chosen, receipt


def verify_warp_pixels(original, transform, rgb, width, height, tile_gt, source_gt, source_bounds):
    from pyproj.enums import TransformDirection
    # All bounded output centres must inverse-map within the real original.
    # This does not register the independently synthetic evidence point.
    xs = [tile_gt[0] + (x + .5) * tile_gt[1] for x in range(width)]
    for y in range(height):
        ys = [tile_gt[3] + (y + .5) * tile_gt[5]] * width
        native_x, native_y = transform.transform(xs, ys, direction=TransformDirection.INVERSE, errcheck=True)
        require(all(source_bounds[0] < x < source_bounds[2] for x in native_x)
                and all(source_bounds[1] < y < source_bounds[3] for y in native_y),
                "WARP_PIXEL_OUTSIDE_SOURCE", "No synthetic border fill or enlarged coverage")
    samples = []
    for y in sorted({0, height // 2, height - 1}):
        for x in sorted({0, width // 2, width - 1}):
            nx, ny = transform.transform(xs[x], tile_gt[3] + (y + .5) * tile_gt[5],
                                         direction=TransformDirection.INVERSE, errcheck=True)
            sx, sy = math.floor((nx - source_gt[0]) / source_gt[1]), math.floor((ny - source_gt[3]) / source_gt[5])
            expected_rgb = original.ReadRaster(sx, sy, 1, 1, band_list=[1, 2, 3])
            actual_rgb = bytes(rgb[channel * width * height + y * width + x] for channel in range(3))
            require(expected_rgb == actual_rgb, "WARP_SAMPLE_MISMATCH", "Pinned XY/inverse original pixels disagree")
            samples.append({"outputPixel": [x, y], "sourcePixel": [sx, sy], "rgb": list(actual_rgb)})
    return {"allOutputCentresInsideOriginal": True, "checkedOutputCentres": width * height, "inverseRgbSamples": samples}


def png_rgb(planar, width, height):
    require(len(planar) == width * height * 3, "RGB_DECODE_FAILED", "Exact three byte bands required")
    pixels, compressor, pieces = width * height, zlib.compressobj(9), []
    for y in range(height):
        row = bytearray(1 + width * 3)
        for x in range(width):
            index = y * width + x
            row[1 + 3*x:4 + 3*x] = bytes((planar[index], planar[pixels + index], planar[2*pixels + index]))
        pieces.append(compressor.compress(row))
    pieces.append(compressor.flush())
    def chunk(kind, payload):
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) + chunk(b"IDAT", b"".join(pieces)) + chunk(b"IEND", b"")


def producer(source_path, xml_path, expected, *, max_edge=MAX_EDGE, transform_tolerance=None, transform_policy=None, original_zip=None,
             _received_receipt=None, _upstream_manifest_bytes=None):
    validate_expected(expected)
    require(type(max_edge) is int and 1 <= max_edge <= MAX_EDGE, "RESOURCE_BOUND_EXCEEDED", "Derivative max edge must be <=1024")
    processing_source = expected["receivedDerivative"]["raster"] if _received_receipt else expected["source"]
    verified_input = hash_file(source_path, processing_source, "DERIVATIVE_BYTES_MISSING" if _received_receipt else "SOURCE_BYTES_MISSING")
    verified_source = {"sha256": expected["source"]["sha256"], "byteLength": expected["source"]["byteLength"],
                       "verifiedByProducer": False} if _received_receipt else verified_input
    xml = read_small(xml_path, MAX_XML, "METADATA_BYTES_MISSING")
    metadata = verify_metadata(xml, expected)
    original = dict(expected.get("originalArchive", {}))
    original["verifiedByProducer"] = False
    if original_zip is not None:
        original = hash_file(original_zip, original, "ORIGINAL_ARCHIVE_BYTES_MISSING")
    dataset, raster = verify_raster(source_path, expected, received_derivative=_received_receipt is not None)
    original_dataset = dataset
    gdal, _ = geospatial_runtime()
    source_width, source_height = dataset.RasterXSize, dataset.RasterYSize
    stride = max(1, math.ceil(max(source_width, source_height) / max_edge))
    output_width, output_height = math.ceil(source_width / stride), math.ceil(source_height / stride)
    transform, receipt = None, None
    if transform_tolerance is not None or transform_policy is not None:
        transform, receipt = transformation_receipt({**expected, "source": processing_source}, transform_tolerance, transform_policy)
        dataset = gdal.Warp("", dataset, options=gdal.WarpOptions(format="VRT", srcBands=[1, 2, 3],
                    dstSRS="EPSG:4326", coordinateOperation=receipt["gdalCoordinateOperation"],
                    outputBounds=receipt["rendererBounds"], width=output_width, height=output_height,
                    resampleAlg="near", errorThreshold=0, warpMemoryLimit=2,
                    multithread=False, srcAlpha=False, dstAlpha=False, overviewLevel="NONE"))
        require(dataset is not None and dataset.RasterCount == 3, "WARP_FAILED", "Exact RGB VRT required")
    entries, tiles = {"source-metadata.xml": xml}, []
    if _received_receipt:
        entries["upstream-provenance.json"] = _upstream_manifest_bytes
    for row, oy in enumerate(range(0, output_height, TILE_EDGE)):
        for col, ox in enumerate(range(0, output_width, TILE_EDGE)):
            w, h = min(TILE_EDGE, output_width - ox), min(TILE_EDGE, output_height - oy)
            require(w * h * 4 <= MAX_BYTES, "RESOURCE_BOUND_EXCEEDED", "decoded tile")
            if transform is not None:
                x, y, sw, sh = ox, oy, w, h
                gt = list(dataset.GetGeoTransform())
                tile_gt = [gt[0] + x * gt[1], gt[1], 0, gt[3] + y * gt[5], 0, gt[5]]
            else:
                x, y = ox * stride, oy * stride
                sw, sh = min(w * stride, source_width - x), min(h * stride, source_height - y)
                gt = processing_source["geotransform"]
                tile_gt = [gt[0] + x * gt[1], gt[1] * sw / w, 0, gt[3] + y * gt[5], 0, gt[5] * sh / h]
            rgb = dataset.ReadRaster(x, y, sw, sh, buf_xsize=w, buf_ysize=h, buf_type=gdal.GDT_Byte,
                                     band_list=[1, 2, 3], resample_alg=gdal.GRIORA_NearestNeighbour)
            require(rgb is not None, "RGB_DECODE_FAILED", "Source RGB read failed")
            pixel_checks = verify_warp_pixels(original_dataset, transform, rgb, w, h, tile_gt,
                                processing_source["geotransform"], processing_source["bounds"]) if transform else None
            name = f"tile-{row}-{col}.png"
            entries[name] = png_rgb(rgb, w, h)
            tiles.append({"name": name, "sha256": digest(entries[name]), "byteLength": len(entries[name]),
                          "width": w, "height": h, "rgbSha256": digest(rgb), "pixelOrder": "planar RGB",
                          "grid": {"row": row, "column": col, "outputX": ox, "outputY": oy},
                          "sampleWindow": [x, y, sw, sh], "geotransform": tile_gt,
                          "bounds": native_bounds(tile_gt, w, h), "crs": "EPSG:4326" if transform else "EPSG:3753",
                          "pixelChecks": pixel_checks})
    # Recheck the actual member after decode, refusing changed source bytes.
    require(hash_file(source_path, processing_source) == verified_input, "SOURCE_CHANGED_DURING_DERIVATION", "Actual processing input byte binding changed")
    if _received_receipt:
        source_metadata = {"width": expected["source"]["width"], "height": expected["source"]["height"], "bandCount": 4,
            "bands": [{"index": i, "colorInterpretation": expected["source"]["colorInterpretations"][i - 1],
                       "dataType": "Byte", "usedForRgb": i <= 3, "alpha": False, "nearInfrared": False} for i in range(1, 5)],
            "assetCrs": "EPSG:3753", "horizontalUnits": "US-survey-foot", "nativeGeotransform": expected["source"]["geotransform"],
            "nativeBounds": expected["source"]["bounds"], "verificationScope": "upstream producer claim; original not decoded by this consumer"}
    else:
        source_metadata = raster
    manifest = {"schema": SCHEMA, "sourceId": expected["source"].get("id"),
                "purpose": "detached reduced photographic RGB inspection; no application admission",
                "source": {**verified_source, "metadata": source_metadata}, "originalArchive": original,
                "outerLibrary": expected.get("outerLibrary"), "metadata": metadata, "capture": expected["capture"],
                "evidencePoint": {**expected["evidencePoint"], "registered": False}, "contentKind": "photographic-orthophoto",
                "suppliesTerrain": False, "suppliesBuildingHeights": False, "suppliesFacades": False,
                "increasesEvidencePrecision": False, "admission": {"approved": False, "reference": None},
                "derivation": {"resampling": "nearest", "rgbBands": [1, 2, 3], "ignoredBands": [4],
                               "alpha": False, "nearInfrared": False, "width": output_width, "height": output_height,
                               "maxEdge": max_edge, "nativeStride": None if transform else stride,
                               "targetCrs": "EPSG:4326" if transform else "EPSG:3753",
                               "sourceCoverageReduced": transform is not None, "transformation": receipt},
                "tiles": tiles, "runtime": version_receipt(), "resource": {"maxBytes": MAX_BYTES,
                               "decodedRgbaBytes": sum(t["width"] * t["height"] * 4 for t in tiles),
                               "encodedArtifactBytes": sum(map(len, entries.values())), "packageBytes": None,
                               "scope": "bounded transport artifacts plus retained decoded RGBA; not process RSS or provider billing"}}
    if _received_receipt:
        manifest["receivedDerivative"] = {**_received_receipt, "metadata": raster,
                                          "inputRaster": processing_source, "upstreamProvenanceSha256": digest(_upstream_manifest_bytes)}
    entries["provenance.json"] = canonical(manifest)
    require(len(entries["provenance.json"]) <= MAX_MANIFEST, "RESOURCE_BOUND_EXCEEDED", "manifest")
    require(sum(map(len, entries.values())) + manifest["resource"]["decodedRgbaBytes"] <= MAX_BYTES,
            "RESOURCE_BOUND_EXCEEDED", "Package plus decoded RGBA exceeds 16MiB")
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED) as archive:
        for name in sorted(entries):
            info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            info.compress_type, info.create_system, info.external_attr = zipfile.ZIP_STORED, 3, 0o100644 << 16
            archive.writestr(info, entries[name])
    package = output.getvalue()
    require(len(package) + manifest["resource"]["decodedRgbaBytes"] <= MAX_BYTES,
            "RESOURCE_BOUND_EXCEEDED", "ZIP plus decoded RGBA exceeds 16MiB")
    return package, manifest


def validate_provenance_geometry(manifest, expected):
    source = expected["source"]
    metadata = manifest["source"].get("metadata", {})
    require(all(metadata.get(key) == value for key, value in {
        "width": source["width"], "height": source["height"], "bandCount": 4,
        "assetCrs": "EPSG:3753", "nativeGeotransform": source["geotransform"],
        "nativeBounds": source["bounds"], "horizontalUnits": "US-survey-foot"}.items()),
        "PROVENANCE_MISMATCH", "Exact producer-declared source geometry must match retained expectations")
    require(metadata.get("bands") == [{"index": i, "colorInterpretation": source["colorInterpretations"][i - 1],
                    "dataType": "Byte", "usedForRgb": i <= 3, "alpha": False, "nearInfrared": False} for i in range(1, 5)],
            "PROVENANCE_MISMATCH", "RGB/Undefined semantics")
    archive = manifest.get("originalArchive", {})
    require(all(archive.get(key) == expected.get("originalArchive", {}).get(key) for key in ["sha256", "byteLength"])
            and type(archive.get("verifiedByProducer")) is bool, "PROVENANCE_MISMATCH", "Original archive identity is separate from member/library")
    processing_source = source
    received = manifest.get("receivedDerivative")
    if received:
        require(received.get("inputRaster") == expected.get("receivedDerivative", {}).get("raster")
                and received.get("upstreamProvenanceSha256") == expected["receivedDerivative"]["manifestSha256"]
                and received.get("originalTiffBytesVerifiedLocally") is False
                and received.get("receivedNativeTiffBytesVerifiedLocally") is True
                and received.get("nativePreviewSamplesCompared") == expected["receivedDerivative"]["raster"]["width"] * expected["receivedDerivative"]["raster"]["height"] * 3
                and received.get("nativePreviewSampleMismatches") == 0,
                "PROVENANCE_MISMATCH", "Received derivative lineage and local pixel comparison")
        processing_source = received["inputRaster"]
        require(received["metadata"].get("nativeGeotransform") == processing_source["geotransform"]
                and received["metadata"].get("nativeBounds") == processing_source["bounds"]
                and received["metadata"].get("assetCrs") == "EPSG:3753", "PROVENANCE_MISMATCH", "Received native CRS/affine")
    derivation = manifest.get("derivation", {})
    edge = derivation.get("maxEdge")
    require(type(edge) is int and 1 <= edge <= MAX_EDGE, "RESOURCE_BOUND_EXCEEDED", "Declared derivative dimensions")
    stride = max(1, math.ceil(max(processing_source["width"], processing_source["height"]) / edge))
    width, height = math.ceil(processing_source["width"] / stride), math.ceil(processing_source["height"] / stride)
    require(derivation.get("width") == width and derivation.get("height") == height
            and derivation.get("rgbBands") == [1, 2, 3] and derivation.get("ignoredBands") == [4]
            and derivation.get("alpha") is False and derivation.get("nearInfrared") is False
            and derivation.get("resampling") == "nearest", "PROVENANCE_MISMATCH", "Bounded RGB derivation")
    target = derivation.get("targetCrs")
    require(target in ["EPSG:3753", "EPSG:4326"], "PROVENANCE_MISMATCH", "Target CRS")
    transform_verified = False
    if target == "EPSG:4326":
        geospatial_runtime()
        claim = derivation.get("transformation", {})
        _, local = transformation_receipt({**expected, "source": processing_source}, claim.get("toleranceMetres"), claim.get("policyReference"))
        require(claim == local and derivation.get("sourceCoverageReduced") is True
                and derivation.get("nativeStride") is None, "TRANSFORM_PROVENANCE_MISMATCH", "Installed operation/pipeline/crop must reproduce producer receipt")
        crop = local["rendererBounds"]
        gt = [crop[0], (crop[2] - crop[0]) / width, 0, crop[3], 0, -(crop[3] - crop[1]) / height]
        transform_verified = True
    else:
        require(derivation.get("transformation") is None and derivation.get("sourceCoverageReduced") is False
                and derivation.get("nativeStride") == stride, "PROVENANCE_MISMATCH", "Native derivative has no geographic coverage grant")
        gt = processing_source["geotransform"]
    expected_tiles = []
    for row, oy in enumerate(range(0, height, TILE_EDGE)):
        for col, ox in enumerate(range(0, width, TILE_EDGE)):
            w, h = min(TILE_EDGE, width - ox), min(TILE_EDGE, height - oy)
            if target == "EPSG:4326":
                x, y, sw, sh = ox, oy, w, h
                tile_gt = [gt[0] + x * gt[1], gt[1], 0, gt[3] + y * gt[5], 0, gt[5]]
            else:
                x, y = ox * stride, oy * stride
                sw, sh = min(w * stride, processing_source["width"] - x), min(h * stride, processing_source["height"] - y)
                tile_gt = [gt[0] + x * gt[1], gt[1] * sw / w, 0, gt[3] + y * gt[5], 0, gt[5] * sh / h]
            expected_tiles.append({"name": f"tile-{row}-{col}.png", "width": w, "height": h,
                 "grid": {"row": row, "column": col, "outputX": ox, "outputY": oy},
                 "sampleWindow": [x, y, sw, sh], "geotransform": tile_gt, "bounds": native_bounds(tile_gt, w, h), "crs": target})
    tiles = manifest.get("tiles", [])
    require(len(tiles) == len(expected_tiles), "PROVENANCE_MISMATCH", "Complete bounded tile grid required")
    for actual, declared in zip(tiles, expected_tiles):
        require(all(actual.get(key) == value for key, value in declared.items()), "PROVENANCE_MISMATCH", "Exact tile grid/window/affine/bounds")
        if target == "EPSG:4326":
            checks = actual.get("pixelChecks", {})
            require(checks.get("allOutputCentresInsideOriginal") is True
                    and checks.get("checkedOutputCentres") == actual["width"] * actual["height"]
                    and isinstance(checks.get("inverseRgbSamples"), list) and 0 < len(checks["inverseRgbSamples"]) <= 9,
                    "PROVENANCE_MISMATCH", "Producer inverse pixel checks required")
        else:
            require(actual.get("pixelChecks") is None, "PROVENANCE_MISMATCH", "Native pixel checks")
    return transform_verified


def consumer(package_path, expected, expected_package_sha256):
    validate_expected(expected)
    require(SHA.fullmatch(expected_package_sha256 or ""), "PACKAGE_IDENTITY_UNBOUND", "Expected package SHA from supported transfer required")
    package = read_small(package_path, MAX_BYTES, "DERIVATIVE_BYTES_MISSING")
    require(digest(package) == expected_package_sha256, "PACKAGE_HASH_MISMATCH", "Received runtime package differs")
    try:
        archive = zipfile.ZipFile(io.BytesIO(package))
    except zipfile.BadZipFile as error:
        raise Refusal("INVALID_PACKAGE", str(error))
    with archive:
        infos = archive.infolist()
        require(2 <= len(infos) <= 18 and len({i.filename for i in infos}) == len(infos), "INVALID_PACKAGE", "Bounded unique entries required")
        require(all(FILE.fullmatch(i.filename) and i.compress_type == zipfile.ZIP_STORED and not i.flag_bits & 1
                    and stat.S_IFMT(i.external_attr >> 16) in [0, stat.S_IFREG] for i in infos),
                "INVALID_PACKAGE", "Flat regular stored RGB/XML/provenance entries only; no extraction")
        require(sum(i.file_size for i in infos) <= MAX_BYTES, "RESOURCE_BOUND_EXCEEDED", "Declared package bytes")
        sizes = {i.filename: i.file_size for i in infos}
        require(0 < sizes.get("provenance.json", 0) <= MAX_MANIFEST and 0 < sizes.get("source-metadata.xml", 0) <= MAX_XML,
                "INVALID_PACKAGE", "Bounded provenance and original XML required")
        manifest = strict_json(archive.read("provenance.json"))
        require(manifest.get("schema") == SCHEMA and manifest.get("sourceId") == expected["source"].get("id"), "PROVENANCE_MISMATCH", "schema/source")
        source = manifest.get("source", {})
        require(source.get("sha256") == expected["source"]["sha256"] and source.get("byteLength") == expected["source"]["byteLength"],
                "PROVENANCE_MISMATCH", "Producer original-member identity differs")
        require(manifest.get("capture") == expected["capture"] and manifest.get("evidencePoint") == {**expected["evidencePoint"], "registered": False}
                and manifest.get("admission") == {"approved": False, "reference": None}
                and all(manifest.get(key) is False for key in ["suppliesTerrain", "suppliesBuildingHeights", "suppliesFacades", "increasesEvidencePrecision"]),
                "PROVENANCE_MISMATCH", "No admission, geometry, registration or precision grant")
        require(manifest.get("outerLibrary") == expected.get("outerLibrary"), "PROVENANCE_MISMATCH", "Outer retained identity")
        xml = archive.read("source-metadata.xml")
        require(verify_metadata(xml, expected) == manifest.get("metadata"), "PROVENANCE_MISMATCH", "XML/rights/capture bindings")
        tiles = manifest.get("tiles")
        require(isinstance(tiles, list) and 0 < len(tiles) <= 16, "INVALID_PACKAGE", "Bounded tiles required")
        for tile in tiles:
            require(type(tile.get("width")) is int and type(tile.get("height")) is int
                    and 0 < tile["width"] <= TILE_EDGE and 0 < tile["height"] <= TILE_EDGE,
                    "RESOURCE_BOUND_EXCEEDED", "Tile decoded dimensions")
        transform_verified = validate_provenance_geometry(manifest, expected)
        if manifest.get("receivedDerivative"):
            require(0 < sizes.get("upstream-provenance.json", 0) <= MAX_MANIFEST
                    and digest(archive.read("upstream-provenance.json")) == expected["receivedDerivative"]["manifestSha256"],
                    "PROVENANCE_MISMATCH", "Original bounded-transfer producer provenance retained")
        require(set(sizes) == {"provenance.json", "source-metadata.xml", *(t.get("name") for t in tiles),
                               *(["upstream-provenance.json"] if manifest.get("receivedDerivative") else [])}
                and len({t.get("name") for t in tiles}) == len(tiles), "INVALID_PACKAGE", "No omitted/unbound/duplicate tiles")
        decoded = 0
        from PIL import Image
        Image.MAX_IMAGE_PIXELS = MAX_EDGE * MAX_EDGE
        for tile in tiles:
            width, height = tile.get("width"), tile.get("height")
            require(type(width) is int and type(height) is int and 0 < width <= TILE_EDGE and 0 < height <= TILE_EDGE,
                    "RESOURCE_BOUND_EXCEEDED", "Tile decoded dimensions")
            decoded += width * height * 4
            require(len(package) + decoded <= MAX_BYTES, "RESOURCE_BOUND_EXCEEDED", "ZIP plus retained decoded RGBA")
            data = archive.read(tile["name"])
            require(len(data) == tile.get("byteLength") and digest(data) == tile.get("sha256"), "TILE_HASH_MISMATCH", tile["name"])
            with Image.open(io.BytesIO(data)) as image:
                require(image.format == "PNG" and image.mode == "RGB" and image.size == (width, height)
                        and not getattr(image, "is_animated", False), "RGB_DECODE_FAILED", "Bounded opaque RGB PNG only")
                image.load()
                planar = b"".join(band.tobytes() for band in image.split())
                require(digest(planar) == tile.get("rgbSha256"), "RGB_SAMPLE_MISMATCH", tile["name"])
                # Verification hashes pixels; it does not retain all decoded images.
        require(manifest.get("resource", {}).get("decodedRgbaBytes") == decoded
                and manifest["resource"].get("maxBytes") == MAX_BYTES
                and manifest["resource"].get("encodedArtifactBytes") == sum(size for name, size in sizes.items() if name != "provenance.json"),
                "PROVENANCE_MISMATCH", "Resource bound")
    return {"schema": "mip.real-imagery-consumer-receipt.v1", "status": "bounded-derivative-bytes-verified",
            "packageSha256": digest(package), "packageBytes": len(package), "decodedRgbaBytes": decoded,
            "resourceCeilingBytes": MAX_BYTES, "derivativePixelsVerifiedLocally": True,
            "metadataXmlVerifiedLocally": True, "originalTiffBytesVerifiedLocally": False,
            "originalArchiveBytesVerifiedLocally": False, "producerSourceClaim": source,
            "producerTransformationClaim": manifest["derivation"].get("transformation"),
            "declaredExtentTransformationReproducedLocally": transform_verified,
            "sourceAuthorityVerifiedLocally": False, "coverageAdmitted": False,
            "admission": {"approved": False, "reference": None}, "rendererObservation": None,
            "physicalDeviceQualified": False, "increasesEvidencePrecision": False,
            "evidencePoint": manifest["evidencePoint"], "manifest": manifest}


def received_derivative(directory, transfer_receipt, expected, *, transform_tolerance=None, transform_policy=None):
    """Bound actual supported-transfer artifacts; never execute received scripts."""
    validate_expected(expected)
    contract = expected.get("receivedDerivative", {})
    raster = contract.get("raster", {})
    require(raster.get("bandCount") == 3 and raster.get("colorInterpretations") == ["Red", "Green", "Blue"]
            and raster.get("dataTypes") == ["Byte"] * 3 and raster.get("epsg") == 3753
            and 0 < raster.get("width", 0) <= MAX_EDGE and 0 < raster.get("height", 0) <= MAX_EDGE
            and raster.get("bounds") == expected["source"]["bounds"]
            and raster.get("bounds") == native_bounds(raster["geotransform"], raster["width"], raster["height"]),
            "INVALID_RECEIVED_CONTRACT", "Exact bounded RGB derivative raster required")
    directory = Path(directory)
    require(directory.is_dir() and not directory.is_symlink(), "DERIVATIVE_BYTES_MISSING", "Received local derivative directory")
    receipt = strict_json(read_small(transfer_receipt, MAX_MANIFEST))
    require(all(receipt.get(key) == contract.get(key) for key in ["library_file_id", "file_id", "version", "received_bytes", "received_sha256"])
            and receipt.get("crc_and_safe_paths") == "pass", "TRANSFER_RECEIPT_MISMATCH", "Exact supported Library derivative transfer")
    files = receipt.get("payloads", [])
    require(isinstance(files, list) and len(files) == 15 and len({f.get("path") for f in files}) == 15,
            "TRANSFER_RECEIPT_MISMATCH", "All15 unique artifact identities required")
    actual_names = {p.name for p in directory.iterdir()}
    require(actual_names == {f["path"] for f in files}, "UNBOUND_RECEIVED_ARTIFACT", "No extra/unbound/missing artifacts")
    total, verified_files = 0, []
    for file in files:
        name = file.get("path")
        require(isinstance(name, str) and re.fullmatch(r"[A-Za-z0-9_.-]+", name), "UNSAFE_RECEIVED_PATH", "Flat regular artifact names only")
        identity = {"byteLength": file["bytes"], "sha256": file["sha256"]}
        require(type(identity["byteLength"]) is int and 0 < identity["byteLength"] <= MAX_BYTES
                and SHA.fullmatch(identity["sha256"]), "INVALID_RECEIVED_CONTRACT", "Artifact identity")
        total += identity["byteLength"]
        require(total + raster["width"] * raster["height"] * 4 <= MAX_BYTES, "RESOURCE_BOUND_EXCEEDED", "Received artifacts plus decoded RGBA")
        hash_file(directory / name, identity, "DERIVATIVE_BYTES_MISSING")
        verified_files.append({"name": name, **identity})
    upstream_bytes = read_small(directory / "manifest.json", MAX_MANIFEST)
    require(digest(upstream_bytes) == contract.get("manifestSha256"), "PROVENANCE_MISMATCH", "Exact upstream producer manifest")
    upstream = strict_json(upstream_bytes)
    listed = upstream.get("files", [])
    require({f["name"] for f in listed} == actual_names - {"manifest.json"}
            and len(listed) == 14, "PROVENANCE_MISMATCH", "All upstream manifest artifact identities")
    for artifact in listed:
        local = next(f for f in verified_files if f["name"] == artifact["name"])
        require(artifact["sha256"] == local["sha256"] and artifact["bytes"] == local["byteLength"],
                "PROVENANCE_MISMATCH", "Manifest/transfer artifact identity differs")
    for name, identity in [("BN18756325.tif", expected["source"]), ("BN18756325.zip", expected["originalArchive"]),
                           ("BN18756325.tif.xml", expected["metadata"])]:
        candidates = [f for f in upstream.get("original_files", []) if f.get("name") == name]
        require(len(candidates) == 1 and candidates[0]["sha256"] == identity["sha256"], "PROVENANCE_MISMATCH", "Original lineage claim differs")
        if "byteLength" in identity:
            require(candidates[0]["bytes"] == identity["byteLength"], "PROVENANCE_MISMATCH", "Original lineage size differs")
    native_path, preview_path = directory / raster["memberName"], directory / contract["previewName"]
    hash_file(native_path, raster, "DERIVATIVE_BYTES_MISSING")
    native, metadata = verify_raster(native_path, expected, received_derivative=True)
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = MAX_EDGE * MAX_EDGE
    compared, mismatches = 0, 0
    with Image.open(preview_path) as preview:
        require(preview.mode == "RGB" and preview.format == "PNG" and preview.size == (raster["width"], raster["height"]),
                "RGB_DECODE_FAILED", "Received RGB PNG must match native dimensions")
        preview.load()
        for y in range(0, raster["height"], TILE_EDGE):
            for x in range(0, raster["width"], TILE_EDGE):
                w, h = min(TILE_EDGE, raster["width"] - x), min(TILE_EDGE, raster["height"] - y)
                actual = native.ReadRaster(x, y, w, h, band_list=[1, 2, 3])
                crop = preview.crop((x, y, x+w, y+h))
                planar = b"".join(band.tobytes() for band in crop.split())
                compared += len(actual)
                mismatches += sum(a != b for a, b in zip(actual, planar))
    require(mismatches == 0, "RECEIVED_PIXEL_MISMATCH", "Actual received TIFF/PNG pixels differ")
    verification = {"schema": "mip.received-native-imagery-verification.v1", "libraryTransfer": {
        key: receipt[key] for key in ["library_file_id", "file_id", "version", "received_bytes", "received_sha256"]},
        "transferReceiptSha256": digest(read_small(transfer_receipt, MAX_MANIFEST)), "receivedArtifactsVerified": verified_files,
        "receivedEncodedArtifactBytes": total, "receivedDecodedRgbaBytes": raster["width"] * raster["height"] * 4,
        "receivedNativeTiffBytesVerifiedLocally": True, "nativePreviewSamplesCompared": compared,
        "nativePreviewSampleMismatches": mismatches, "originalTiffBytesVerifiedLocally": False,
        "originalArchiveBytesVerifiedLocally": False, "originalNearestSampleProof": "upstream producer claim only",
        "nativeMetadataVerifiedLocally": metadata, "applicationAdmitted": False}
    package, manifest = producer(native_path, directory / contract["xmlName"], expected,
                                 transform_tolerance=transform_tolerance, transform_policy=transform_policy,
                                 _received_receipt=verification, _upstream_manifest_bytes=upstream_bytes)
    return package, manifest, verification


def export_research(package_path, expected, package_sha256, output_directory):
    """Export validated bounded PNGs into a new private inspection directory.

    The HTML is a planar pixel inspection, not an App/provider/GIS renderer.
    It makes no active-source or admitted geographic coverage assertion.
    """
    receipt = consumer(package_path, expected, package_sha256)
    output = Path(output_directory)
    require(output.parent.is_dir() and not output.exists(), "OUTPUT_EXISTS_OR_PARENT_MISSING", "New private inspection directory required")
    manifest = receipt["manifest"]
    notice = next(f["text"] for f in manifest["metadata"]["xmlBindings"] if f["id"] == "use_constraints")
    credit = next(f["text"] for f in manifest["metadata"]["xmlBindings"] if f["id"] == "attribution")
    received = manifest.get("receivedDerivative", {}).get("metadata", {})
    spacing = received.get("nativeGeotransform", manifest["source"]["metadata"]["nativeGeotransform"])[1]
    native_resolution = f"Native input spacing: {spacing} US survey feet ({spacing * 1200 / 3937:.9f} metres)."
    transformation = manifest["derivation"].get("transformation")
    operation_notice = (f"Pinned operation reports {transformation['reportedOperationAccuracyMetres']} metre accuracy; "
                        "source 11cm RMSEx/RMSEy and 27.6cm at 95% are specifications, not measured registration. "
                        "The synthetic evidence point keeps its unknown datum.") if transformation else "No renderer WGS84 transformation receipt."
    images = "".join(f'<img src="{t["name"]}" alt="Photographic RGB research tile {t["grid"]["row"]}, {t["grid"]["column"]}" '
                     f'width="{t["width"]}" height="{t["height"]}" style="left:{t["grid"]["outputX"]}px;top:{t["grid"]["outputY"]}px">'
                     for t in manifest["tiles"])
    summary = {"sourceId": manifest["sourceId"], "packageSha256": package_sha256,
               "capture": manifest["capture"], "originalTiffBytesVerifiedLocally": False,
               "applicationAdmitted": False, "browserImageDecodeComplete": False,
               "geographicRendererQualified": False, "evidencePointRegistered": False,
               "terrain": False, "buildingHeights": False, "facades": False}
    script_value = json.dumps(summary, ensure_ascii=True).replace("<", "\\u003c")
    document = f'''<!doctype html><html lang="en"><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Bounded Ohio RGB research pixels</title>
<style>body{{font:16px system-ui,sans-serif;background:#111;color:#eee;margin:24px}}main{{max-width:1050px}}p{{line-height:1.5}}.pixels{{position:relative;width:{manifest['derivation']['width']}px;height:{manifest['derivation']['height']}px}}img{{position:absolute;display:block}}.scroll{{overflow:auto;max-width:100%}}code{{overflow-wrap:anywhere}}a{{color:#a9d2ff}}</style>
<main><h1>Bounded photographic RGB research pixels</h1>
<p>Recorded ground condition: {html.escape(manifest['capture']['start'])}, day precision. Reduced derivative for private inspection. Application source admission remains closed. Original TIFF was not decoded by this consumer.</p>
<p>CRS of these derived tiles: {html.escape(manifest['derivation']['targetCrs'])}. This planar image inspection does not qualify a geographic renderer, evidence registration, current coverage, terrain, building heights or facades.</p>
<p>{html.escape(native_resolution)} {html.escape(operation_notice)}</p>
<p>Package SHA-256: <code>{package_sha256}</code>. Encoded package plus decoded RGBA: {receipt['packageBytes'] + receipt['decodedRgbaBytes']} bytes / 16777216.</p>
<p>{html.escape(credit)}</p><p>{html.escape(notice)}</p>
<div class="scroll"><div class="pixels">{images}</div></div>
<p id="decode">Bounded images awaiting decode.</p><a href="consumer-receipt.json">Exact consumer provenance and remaining gates</a></main>
<script>window.__MIP_REAL_IMAGERY_RESEARCH_OBSERVATION__={script_value};
Promise.all([...document.images].map(image=>image.decode())).then(()=>{{window.__MIP_REAL_IMAGERY_RESEARCH_OBSERVATION__.browserImageDecodeComplete=true;document.getElementById('decode').textContent='All bounded RGB images decoded; no App source admission or geographic renderer qualification.'}}).catch(()=>{{document.getElementById('decode').textContent='Image decode unavailable; research input remains unqualified.'}});</script></html>'''.encode()
    require(receipt["packageBytes"] + receipt["decodedRgbaBytes"] + len(document) + len(canonical(receipt)) <= MAX_BYTES,
            "RESOURCE_BOUND_EXCEEDED", "Inspection document and provenance included")
    output.mkdir(mode=0o700)
    with zipfile.ZipFile(package_path) as archive:
        for tile in manifest["tiles"]:
            write_new(output / tile["name"], archive.read(tile["name"]))
    write_new(output / "consumer-receipt.json", canonical(receipt))
    write_new(output / "index.html", document)
    return summary


def write_new(path, data):
    path = Path(path)
    require(path.parent.is_dir() and not path.exists(), "OUTPUT_EXISTS_OR_PARENT_MISSING", "Use a new workspace output path")
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
    except BaseException:
        path.unlink(missing_ok=True)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    produce = commands.add_parser("produce", help="Run only where actual lawfully acquired TIFF/XML bytes exist")
    produce.add_argument("--expected", required=True)
    produce.add_argument("--source-tiff", required=True)
    produce.add_argument("--source-xml", required=True)
    produce.add_argument("--output", required=True)
    produce.add_argument("--max-edge", type=int, default=MAX_EDGE)
    produce.add_argument("--original-zip")
    produce.add_argument("--transform-tolerance-metres", type=float)
    produce.add_argument("--transform-policy-reference")
    consume = commands.add_parser("verify", help="Verify only a received bounded derivative, never original source claims")
    consume.add_argument("--expected", required=True)
    consume.add_argument("--package", required=True)
    consume.add_argument("--package-sha256", required=True)
    consume.add_argument("--receipt", required=True)
    received = commands.add_parser("prepare-received", help="Verify supported bounded native RGB derivative transfer, then generate detached runtime tiles")
    received.add_argument("--expected", required=True)
    received.add_argument("--directory", required=True)
    received.add_argument("--transfer-receipt", required=True)
    received.add_argument("--output", required=True)
    received.add_argument("--receipt", required=True)
    received.add_argument("--transform-tolerance-metres", type=float)
    received.add_argument("--transform-policy-reference")
    research = commands.add_parser("export-research", help="Export only validated PNG pixels and a private planar inspection; no App activation")
    research.add_argument("--expected", required=True)
    research.add_argument("--package", required=True)
    research.add_argument("--package-sha256", required=True)
    research.add_argument("--output-directory", required=True)
    args = parser.parse_args()
    try:
        expected = strict_json(read_small(args.expected, MAX_MANIFEST))
        if args.command == "produce":
            package, manifest = producer(args.source_tiff, args.source_xml, expected, max_edge=args.max_edge,
                                         transform_tolerance=args.transform_tolerance_metres,
                                         transform_policy=args.transform_policy_reference, original_zip=args.original_zip)
            write_new(args.output, package)
            result = {"status": "bounded-detached-derivative-produced", "packageSha256": digest(package),
                      "packageBytes": len(package), "decodedRgbaBytes": manifest["resource"]["decodedRgbaBytes"],
                      "originalTiffVerifiedByProducer": True, "applicationAdmitted": False,
                      "evidencePointRegistered": False}
        elif args.command == "prepare-received":
            package, manifest, verification = received_derivative(args.directory, args.transfer_receipt, expected,
                transform_tolerance=args.transform_tolerance_metres, transform_policy=args.transform_policy_reference)
            require(not Path(args.output).exists() and not Path(args.receipt).exists(), "OUTPUT_EXISTS_OR_PARENT_MISSING", "New receipt and package required")
            write_new(args.output, package)
            verification.update(packageSha256=digest(package), packageBytes=len(package),
                                generatedDecodedRgbaBytes=manifest["resource"]["decodedRgbaBytes"])
            write_new(args.receipt, canonical(verification))
            result = verification
        elif args.command == "export-research":
            result = export_research(args.package, expected, args.package_sha256, args.output_directory)
        else:
            result = consumer(args.package, expected, args.package_sha256)
            write_new(args.receipt, canonical(result))
            result = {key: value for key, value in result.items() if key != "manifest"}
        print(canonical(result).decode(), end="")
        return 0
    except (Refusal, ValueError, KeyError, TypeError, OSError, RuntimeError, zipfile.BadZipFile) as error:
        result = {"status": "refused", "code": getattr(error, "code", "MALFORMED_OR_UNREADABLE_INPUT"),
                  "detail": getattr(error, "detail", str(error)), "applicationAdmitted": False,
                  "originalTiffBytesVerifiedLocally": False, "evidencePointRegistered": False}
        print(canonical(result).decode(), end="")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
