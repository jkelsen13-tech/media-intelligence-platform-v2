#!/usr/bin/python3
"""Synthetic GDAL fixtures test the pipeline, not the acquired Ohio pixels."""
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

from osgeo import gdal, osr
import numpy as np
from PIL import Image
gdal.UseExceptions()
sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("real_imagery", ROOT / "scripts/realImageryDerivative.py")
pipeline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pipeline)


def synth(directory, width=80, height=60):
    """4 distinct byte bands with band4 explicitly Undefined."""
    path = directory / "synthetic.tif"
    ds = gdal.GetDriverByName("GTiff").Create(str(path), width, height, 4, gdal.GDT_Byte,
                options=["TILED=YES", "BLOCKXSIZE=16", "BLOCKYSIZE=16", "PHOTOMETRIC=RGB"])
    crs = osr.SpatialReference()
    crs.ImportFromEPSG(3753)
    ds.SetSpatialRef(crs)
    gt = [2187500, .25, 0, 633750, 0, -.25]
    ds.SetGeoTransform(gt)
    yy, xx = np.indices((height, width))
    values = [(xx + 3*yy) % 256, (5*xx + yy + 20) % 256, (xx + yy + 80) % 256, np.full((height, width), 13)]
    for index, value in enumerate(values, 1):
        ds.GetRasterBand(index).WriteArray(value.astype("uint8"))
        ds.GetRasterBand(index).SetColorInterpretation([gdal.GCI_RedBand, gdal.GCI_GreenBand, gdal.GCI_BlueBand, gdal.GCI_Undefined][index - 1])
    ds = None
    xml = b"<metadata><rights>PUBLIC DOMAIN SYNTHETIC TEST</rights><credit>SYNTHETIC TEST ONLY</credit><notice>Planning only; noncadastral SYNTHETIC TEST</notice><capture>20230307</capture></metadata>"
    xml_path = directory / "synthetic.xml"
    xml_path.write_bytes(xml)
    expected = json.loads((ROOT / "verifier/realImagery/ohio-BN18756325.expected.json").read_text())
    expected.pop("receivedDerivative", None)
    expected["source"].update(id="SYNTHETIC-TEST-NOT-OHIO", sha256=pipeline.digest(path.read_bytes()),
                              byteLength=path.stat().st_size, width=width, height=height,
                              bounds=pipeline.native_bounds(gt, width, height))
    expected["metadata"] = {"sha256": pipeline.digest(xml), "bindings": [
        {"id": "rights", "path": "./rights", "expectedText": "PUBLIC DOMAIN SYNTHETIC TEST"},
        {"id": "attribution", "path": "./credit", "expectedText": "SYNTHETIC TEST ONLY"},
        {"id": "use_constraints", "path": "./notice", "expectedText": "Planning only; noncadastral SYNTHETIC TEST"},
        {"id": "capture_start", "path": "./capture", "expectedText": "20230307"}]}
    expected["rightsInterpretation"] = {"classification": "SYNTHETIC TEST, no production rights", "applicationPermissionReceipt": None}
    return path, xml_path, expected, values


def synthetic_transfer(directory, original, xml, expected):
    directory.mkdir()
    raster_name, preview_name, xml_name = "native-rgb.tif", "native-rgb.png", "original.xml"
    native = gdal.Translate(str(directory / raster_name), str(original), options=gdal.TranslateOptions(bandList=[1, 2, 3]))
    planar = native.ReadRaster(band_list=[1, 2, 3])
    (directory / preview_name).write_bytes(pipeline.png_rgb(planar, native.RasterXSize, native.RasterYSize))
    native = None
    (directory / xml_name).write_bytes(xml.read_bytes())
    for index in range(11):
        (directory / f"synthetic-proof-{index}.txt").write_text("SYNTHETIC TEST: no source authority\n")
    files = [{"name": p.name, "bytes": p.stat().st_size, "sha256": pipeline.digest(p.read_bytes())}
             for p in sorted(directory.iterdir())]
    upstream = {"files": files, "original_files": [
        {"name": "BN18756325.tif", "sha256": expected["source"]["sha256"], "bytes": expected["source"]["byteLength"]},
        {"name": "BN18756325.zip", "sha256": expected["originalArchive"]["sha256"], "bytes": expected["originalArchive"]["byteLength"]},
        {"name": "BN18756325.tif.xml", "sha256": expected["metadata"]["sha256"]}]}
    (directory / "manifest.json").write_bytes(pipeline.canonical(upstream))
    files.append({"name": "manifest.json", "bytes": (directory / "manifest.json").stat().st_size,
                  "sha256": pipeline.digest((directory / "manifest.json").read_bytes())})
    source = expected["source"]
    raster = {**source, "memberName": raster_name, "bandCount": 3, "colorInterpretations": ["Red", "Green", "Blue"], "dataTypes": ["Byte"] * 3,
              "sha256": pipeline.digest((directory / raster_name).read_bytes()), "byteLength": (directory / raster_name).stat().st_size}
    expected["receivedDerivative"] = {"library_file_id": "SYNTHETIC libfile", "file_id": "SYNTHETIC backing", "version": 0,
         "received_bytes": 1000, "received_sha256": "1" * 64, "manifestSha256": files[-1]["sha256"],
         "previewName": preview_name, "xmlName": xml_name, "raster": raster}
    transfer = {**{key: expected["receivedDerivative"][key] for key in ["library_file_id", "file_id", "version", "received_bytes", "received_sha256"]},
          "crc_and_safe_paths": "pass", "payloads": [{"path": f["name"], "bytes": f["bytes"], "sha256": f["sha256"]} for f in files]}
    receipt_path = directory.parent / "synthetic-transfer.json"
    receipt_path.write_bytes(pipeline.canonical(transfer))
    return receipt_path


def rewrite_package(package, modify):
    with zipfile.ZipFile(io.BytesIO(package)) as archive:
        entries = {i.filename: archive.read(i) for i in archive.infolist()}
    modify(entries)
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED) as archive:
        for name, data in entries.items():
            archive.writestr(name, data)
    return output.getvalue()


class DerivativeTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="mip-synthetic-imagery-")
        self.directory = Path(self.temp.name)
        self.tiff, self.xml, self.expected, self.samples = synth(self.directory)

    def tearDown(self):
        self.temp.cleanup()

    def produce(self, **options):
        return pipeline.producer(self.tiff, self.xml, self.expected, **options)

    def consume(self, package, expected=None):
        path = self.directory / "received.zip"
        path.write_bytes(package)
        return pipeline.consumer(path, expected or self.expected, pipeline.digest(package))

    def assert_refused(self, code, fn):
        with self.assertRaises(pipeline.Refusal) as context:
            fn()
        self.assertEqual(context.exception.code, code)

    def test_missing_official_bytes_refuses_without_output_or_metadata_admission(self):
        expected_path = ROOT / "verifier/realImagery/ohio-BN18756325.expected.json"
        output = self.directory / "must-not-exist.zip"
        result = subprocess.run([sys.executable, str(ROOT / "scripts/realImageryDerivative.py"), "produce", "--expected", str(expected_path),
            "--source-tiff", str(self.directory / "absent-official.tif"), "--source-xml", str(self.directory / "absent-official.xml"), "--output", str(output)],
            text=True, capture_output=True)
        self.assertEqual(result.returncode, 2, result.stderr)
        receipt = json.loads(result.stdout)
        self.assertEqual(receipt["code"], "SOURCE_BYTES_MISSING")
        self.assertFalse(receipt["applicationAdmitted"])
        self.assertFalse(receipt["originalTiffBytesVerifiedLocally"])
        self.assertFalse(output.exists())

    def test_exact_rgb_values_and_fourth_band_semantics_preserved(self):
        package, manifest = self.produce()
        with zipfile.ZipFile(io.BytesIO(package)) as archive:
            with Image.open(io.BytesIO(archive.read("tile-0-0.png"))) as image:
                self.assertEqual(image.mode, "RGB")
                for x, y in [(0, 0), (23, 19), (79, 59)]:
                    self.assertEqual(image.getpixel((x, y)), tuple(int(self.samples[i][y, x]) for i in range(3)))
        self.assertEqual(manifest["source"]["metadata"]["bands"][3], {"index": 4, "colorInterpretation": "Undefined", "dataType": "Byte", "usedForRgb": False, "alpha": False, "nearInfrared": False})
        self.assertEqual(manifest["tiles"][0]["geotransform"], self.expected["source"]["geotransform"])
        self.assertFalse(manifest["admission"]["approved"])
        self.assertFalse(manifest["suppliesBuildingHeights"])
        self.assertFalse(manifest["suppliesTerrain"])
        self.assertFalse(manifest["suppliesFacades"])

    def test_same_input_and_environment_yield_identical_package(self):
        first, _ = self.produce(max_edge=20)
        second, _ = self.produce(max_edge=20)
        self.assertEqual(first, second)
        self.assertEqual(pipeline.digest(first), pipeline.digest(second))
        first, _ = self.produce(transform_tolerance=1, transform_policy="SYNTHETIC 1m")
        second, _ = self.produce(transform_tolerance=1.0, transform_policy="SYNTHETIC 1m")
        self.assertEqual(first, second)

    def test_nearest_decimation_preserves_native_coverage_and_records_real_window(self):
        package, manifest = self.produce(max_edge=20)
        self.assertEqual((manifest["derivation"]["width"], manifest["derivation"]["height"]), (20, 15))
        tile = manifest["tiles"][0]
        self.assertEqual(tile["sampleWindow"], [0, 0, 80, 60])
        self.assertEqual(tile["bounds"], self.expected["source"]["bounds"])
        self.assertEqual(tile["geotransform"][1], 1)
        self.assertEqual(tile["geotransform"][5], -1)
        with zipfile.ZipFile(io.BytesIO(package)) as archive:
            with Image.open(io.BytesIO(archive.read(tile["name"]))) as image:
                self.assertEqual(image.getpixel((3, 2)), tuple(int(self.samples[i][10, 14]) for i in range(3)))

    def test_multitile_grid_retains_adjacent_windows_and_total_runtime_ceiling(self):
        tiff, xml, expected, _ = synth(self.directory, 1025, 1025)
        package, manifest = pipeline.producer(tiff, xml, expected)
        self.assertEqual(len(manifest["tiles"]), 4)
        self.assertEqual(manifest["derivation"]["width"], 513)
        tiles = manifest["tiles"]
        self.assertEqual(tiles[0]["bounds"][2], tiles[1]["bounds"][0])
        self.assertEqual(tiles[0]["bounds"][1], tiles[2]["bounds"][3])
        self.assertLessEqual(len(package) + manifest["resource"]["decodedRgbaBytes"], pipeline.MAX_BYTES)

    def test_hash_crs_affine_band_type_and_hole_mismatches_fail_closed(self):
        changed = copy.deepcopy(self.expected)
        changed["source"]["sha256"] = "0" * 64
        self.assert_refused("SOURCE_HASH_MISMATCH", lambda: pipeline.producer(self.tiff, self.xml, changed))
        for mutation, code in [(lambda ds: ds.SetGeoTransform([2187500, .5, 0, 633750, 0, -.25]), "RASTER_METADATA_MISMATCH"),
                               (lambda ds: ds.GetRasterBand(4).SetColorInterpretation(gdal.GCI_AlphaBand), "RASTER_BAND_MISMATCH"),
                               (lambda ds: ds.GetRasterBand(1).SetNoDataValue(0), "RASTER_VALIDITY_UNQUALIFIED")]:
            self.tiff, self.xml, self.expected, _ = synth(self.directory)
            ds = gdal.Open(str(self.tiff), gdal.GA_Update)
            mutation(ds)
            ds = None
            self.expected["source"].update(sha256=pipeline.digest(self.tiff.read_bytes()), byteLength=self.tiff.stat().st_size)
            self.assert_refused(code, self.produce)
        self.tiff, self.xml, self.expected, _ = synth(self.directory)
        ds = gdal.Open(str(self.tiff), gdal.GA_Update)
        crs = osr.SpatialReference()
        crs.ImportFromEPSG(4326)
        ds.SetSpatialRef(crs)
        ds = None
        self.expected["source"].update(sha256=pipeline.digest(self.tiff.read_bytes()), byteLength=self.tiff.stat().st_size)
        self.assert_refused("RASTER_CRS_MISMATCH", self.produce)

    def test_actual_xml_hash_exact_fields_notices_and_capture_are_required(self):
        original = self.xml.read_bytes()
        self.xml.write_bytes(original + b" ")
        self.assert_refused("METADATA_HASH_MISMATCH", self.produce)
        self.xml.write_bytes(original)
        self.expected["metadata"]["bindings"] = []
        self.assert_refused("METADATA_POLICY_UNBOUND", self.produce)
        self.tiff, self.xml, self.expected, _ = synth(self.directory)
        self.expected["metadata"]["bindings"][0]["expectedText"] = "IMPLICIT RIGHTS"
        self.assert_refused("METADATA_BINDING_MISMATCH", self.produce)
        self.tiff, self.xml, self.expected, _ = synth(self.directory)
        self.expected["capture"]["start"] = "2023-03-08"
        self.assert_refused("CAPTURE_BINDING_MISMATCH", self.produce)
        self.expected["capture"]["start"] = "2023-02-30"
        self.assert_refused("INVALID_EXPECTATIONS", self.produce)

    def test_xml_dtd_and_duplicate_binding_are_refused(self):
        data = b'<!DOCTYPE metadata [<!ENTITY x "test">]><metadata />'
        self.expected["metadata"]["sha256"] = pipeline.digest(data)
        self.assert_refused("UNSAFE_XML", lambda: pipeline.verify_metadata(data, self.expected))
        self.tiff, self.xml, self.expected, _ = synth(self.directory)
        self.expected["metadata"]["bindings"].append(self.expected["metadata"]["bindings"][0])
        self.assert_refused("INVALID_METADATA_BINDING", self.produce)

    def test_transform_refuses_unbound_policy_and_stricter_than_reported_accuracy(self):
        self.assert_refused("TRANSFORM_POLICY_UNBOUND", lambda: self.produce(transform_tolerance=1))
        self.assert_refused("TRANSFORM_TOLERANCE_EXCEEDED", lambda: self.produce(transform_tolerance=.1, transform_policy="SYNTHETIC background tolerance"))

    def test_nonballpark_pinned_transform_is_explicit_reduced_rgb_not_registration(self):
        package, manifest = self.produce(transform_tolerance=1, transform_policy="SYNTHETIC 1m operation background policy")
        receipt = manifest["derivation"]["transformation"]
        self.assertFalse(receipt["networkEnabled"])
        self.assertFalse(receipt["ballparkAllowed"])
        self.assertTrue(receipt["bestAvailable"])
        self.assertEqual(receipt["reportedOperationAccuracyMetres"], 1)
        self.assertEqual(receipt["pipelineSha256"], pipeline.digest(receipt["pipeline"].encode()))
        self.assertFalse(receipt["evidencePointRegistered"])
        self.assertIsNone(receipt["measuredRegistrationAccuracyMetres"])
        self.assertEqual(manifest["capture"], {"start": "2023-03-07", "precision": "day"})
        self.assertEqual(manifest["evidencePoint"]["datum"], "unknown")
        self.assertTrue(manifest["derivation"]["sourceCoverageReduced"])
        self.assertEqual(manifest["tiles"][0]["crs"], "EPSG:4326")
        self.assertFalse(manifest["admission"]["approved"])
        self.assertLess(len(package), pipeline.MAX_BYTES)
        self.assertTrue(manifest["tiles"][0]["pixelChecks"]["allOutputCentresInsideOriginal"])
        self.assertEqual(manifest["tiles"][0]["pixelChecks"]["checkedOutputCentres"], 80 * 60)
        self.assertEqual(len(manifest["tiles"][0]["pixelChecks"]["inverseRgbSamples"]), 9)
        self.assertEqual(receipt["gdalCoordinateOperation"], receipt["pipeline"] + " step proj=axisswap order=2,1")
        self.assertTrue(self.consume(package)["declaredExtentTransformationReproducedLocally"])

    def test_best_operation_grid_unknown_accuracy_ballpark_and_area_refuse(self):
        from types import SimpleNamespace as O
        area = O(bounds=(-124.79, 24.41, -66.91, 49.38))
        operation = O(has_ballpark_transformation=False, grids=[])
        chosen = O(accuracy=1, operations=[operation], area_of_use=area)
        group = O(best_available=True, transformers=[chosen], unavailable_operations=[])
        for mutate, code in [
            (lambda: setattr(group, "best_available", False), "TRANSFORM_BEST_OPERATION_UNAVAILABLE"),
            (lambda: setattr(chosen, "accuracy", -1), "TRANSFORM_TOLERANCE_EXCEEDED"),
            (lambda: setattr(operation, "has_ballpark_transformation", True), "BALLPARK_TRANSFORM_REFUSED"),
            (lambda: setattr(operation, "grids", [O(short_name="absent-grid", available=False, package_name="none")]), "TRANSFORM_GRID_UNAVAILABLE"),
            (lambda: setattr(chosen, "area_of_use", None), "TRANSFORM_BOUNDS_UNKNOWN")]:
            group.best_available, chosen.accuracy, chosen.area_of_use = True, 1, area
            operation.has_ballpark_transformation, operation.grids = False, []
            mutate()
            with patch("pyproj.transformer.TransformerGroup", return_value=group):
                self.assert_refused(code, lambda: self.produce(transform_tolerance=1, transform_policy="SYNTHETIC policy"))

    def test_consumer_rejects_changed_original_lineage_grid_and_transform_provenance(self):
        package, _ = self.produce()
        for edit in [lambda m: m["originalArchive"].update(sha256="0" * 64),
                     lambda m: m["source"]["metadata"].update(assetCrs="EPSG:4326"),
                     lambda m: m["tiles"][0]["bounds"].__setitem__(0, 0),
                     lambda m: m["tiles"][0]["sampleWindow"].__setitem__(0, 1),
                     lambda m: m["derivation"].update(nearInfrared=True),
                     lambda m: m["admission"].update(approved=True)]:
            def mutate(entries):
                manifest = json.loads(entries["provenance.json"])
                edit(manifest)
                entries["provenance.json"] = pipeline.canonical(manifest)
            self.assert_refused("PROVENANCE_MISMATCH", lambda: self.consume(rewrite_package(package, mutate)))
        package, _ = self.produce(transform_tolerance=1, transform_policy="SYNTHETIC policy")
        def mutate_transform(entries):
            manifest = json.loads(entries["provenance.json"])
            manifest["derivation"]["transformation"]["pipeline"] = "proj=noop"
            entries["provenance.json"] = pipeline.canonical(manifest)
        self.assert_refused("TRANSFORM_PROVENANCE_MISMATCH", lambda: self.consume(rewrite_package(package, mutate_transform)))

    def test_received_transfer_adapter_verifies_every_artifact_and_all_actual_rgb_samples(self):
        directory = self.directory / "received"
        receipt_path = synthetic_transfer(directory, self.tiff, self.xml, self.expected)
        package, manifest, verification = pipeline.received_derivative(directory, receipt_path, self.expected,
                                    transform_tolerance=1, transform_policy="SYNTHETIC background policy")
        self.assertEqual(len(verification["receivedArtifactsVerified"]), 15)
        self.assertEqual(verification["nativePreviewSamplesCompared"], 80 * 60 * 3)
        self.assertEqual(verification["nativePreviewSampleMismatches"], 0)
        self.assertFalse(verification["originalTiffBytesVerifiedLocally"])
        self.assertFalse(manifest["source"]["verifiedByProducer"])
        self.assertEqual(manifest["receivedDerivative"]["metadata"]["bandCount"], 3)
        self.assertTrue(self.consume(package)["declaredExtentTransformationReproducedLocally"])
        again, _, _ = pipeline.received_derivative(directory, receipt_path, self.expected,
                                    transform_tolerance=1, transform_policy="SYNTHETIC background policy")
        self.assertEqual(package, again)

    def test_received_adapter_missing_extra_hash_and_changed_transfer_refuse(self):
        directory = self.directory / "received"
        receipt_path = synthetic_transfer(directory, self.tiff, self.xml, self.expected)
        def invoke():
            return pipeline.received_derivative(directory, receipt_path, self.expected)
        extra = directory / "unbound.txt"
        extra.write_text("not authorized")
        self.assert_refused("UNBOUND_RECEIVED_ARTIFACT", invoke)
        extra.unlink()
        proof = directory / "synthetic-proof-0.txt"
        saved = proof.read_bytes()
        proof.write_bytes(bytes(b ^ 1 for b in saved))
        self.assert_refused("SOURCE_HASH_MISMATCH", invoke)
        proof.write_bytes(saved)
        transfer = json.loads(receipt_path.read_text())
        transfer["received_sha256"] = "0" * 64
        receipt_path.write_bytes(pipeline.canonical(transfer))
        self.assert_refused("TRANSFER_RECEIPT_MISMATCH", invoke)

    def test_research_export_keeps_rights_day_and_precision_gates_and_never_overwrites(self):
        package, _ = self.produce(transform_tolerance=1, transform_policy="SYNTHETIC policy")
        path = self.directory / "runtime.zip"
        path.write_bytes(package)
        output = self.directory / "private-inspection"
        summary = pipeline.export_research(path, self.expected, pipeline.digest(package), output)
        self.assertFalse(summary["applicationAdmitted"])
        self.assertFalse(summary["geographicRendererQualified"])
        self.assertFalse(summary["evidencePointRegistered"])
        self.assertEqual(summary["capture"], {"start": "2023-03-07", "precision": "day"})
        text = (output / "index.html").read_text()
        self.assertIn("noncadastral SYNTHETIC TEST", text)
        self.assertIn("day precision", text)
        self.assertIn("unknown datum", text)
        self.assertIn("default-src 'none'", text)
        self.assertNotIn("https://", text)
        self.assertEqual({p.name for p in output.iterdir()}, {"tile-0-0.png", "index.html", "consumer-receipt.json"})
        self.assert_refused("OUTPUT_EXISTS_OR_PARENT_MISSING", lambda: pipeline.export_research(path, self.expected, pipeline.digest(package), output))

    def test_consumer_only_qualifies_received_derivative_not_originals_or_authority(self):
        package, manifest = self.produce()
        receipt = self.consume(package)
        self.assertTrue(receipt["derivativePixelsVerifiedLocally"])
        self.assertTrue(receipt["metadataXmlVerifiedLocally"])
        self.assertFalse(receipt["originalTiffBytesVerifiedLocally"])
        self.assertFalse(receipt["originalArchiveBytesVerifiedLocally"])
        self.assertFalse(receipt["sourceAuthorityVerifiedLocally"])
        self.assertFalse(receipt["coverageAdmitted"])
        self.assertIsNone(receipt["rendererObservation"])
        self.assertEqual(receipt["producerSourceClaim"]["sha256"], manifest["source"]["sha256"])

    def test_consumer_tampered_package_unbound_source_and_rgb_refused(self):
        package, _ = self.produce()
        path = self.directory / "received.zip"
        path.write_bytes(package)
        self.assert_refused("PACKAGE_HASH_MISMATCH", lambda: pipeline.consumer(path, self.expected, "0" * 64))
        self.assert_refused("PACKAGE_IDENTITY_UNBOUND", lambda: pipeline.consumer(path, self.expected, ""))
        changed = copy.deepcopy(self.expected)
        changed["source"]["sha256"] = "0" * 64
        self.assert_refused("PROVENANCE_MISMATCH", lambda: self.consume(package, changed))
        def mutate(entries):
            data = bytearray(entries["tile-0-0.png"])
            data[50] ^= 1
            entries["tile-0-0.png"] = bytes(data)
        self.assert_refused("TILE_HASH_MISMATCH", lambda: self.consume(rewrite_package(package, mutate)))

    def test_consumer_archive_paths_extras_duplicate_entries_and_compression_are_refused(self):
        package, _ = self.produce()
        for bad_name in ["../escape", "folder/tile-0-0.png", "unexpected.txt"]:
            self.assert_refused("INVALID_PACKAGE", lambda: self.consume(rewrite_package(package, lambda e: e.update({bad_name: b"x"}))))
        output = io.BytesIO()
        with zipfile.ZipFile(io.BytesIO(package)) as old, zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as new:
            for info in old.infolist():
                new.writestr(info.filename, old.read(info))
        self.assert_refused("INVALID_PACKAGE", lambda: self.consume(output.getvalue()))

    def test_resource_oversize_source_dimension_and_output_cannot_silently_expand(self):
        self.assert_refused("RESOURCE_BOUND_EXCEEDED", lambda: self.produce(max_edge=1025))
        package, _ = self.produce()
        def expand_manifest(entries):
            manifest = json.loads(entries["provenance.json"])
            manifest["tiles"][0]["width"] = 1000000
            entries["provenance.json"] = pipeline.canonical(manifest)
        self.assert_refused("RESOURCE_BOUND_EXCEEDED", lambda: self.consume(rewrite_package(package, expand_manifest)))
        output = self.directory / "existing.zip"
        output.write_bytes(b"retained")
        self.assert_refused("OUTPUT_EXISTS_OR_PARENT_MISSING", lambda: pipeline.write_new(output, package))
        self.assertEqual(output.read_bytes(), b"retained")


if __name__ == "__main__":
    unittest.main(verbosity=2)
