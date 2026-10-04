#!/usr/bin/env python3
"""Verify retained source-body custody and pixels; no network or renderer execution."""
import argparse
import hashlib
import io
import json
import math
import platform
import stat
import struct
import xml.etree.ElementTree as ET
import zipfile
import zlib
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

NATIVE_SHA = 'd89425c07526811d0543d8b2e39d0db4ba1cea513d67113967870baf7397b5ab'
RGB_SHA = 'ebc0599832575409a56088af66c6d284993c69871331252291d1d743af5d862c'
NATIVE_HEAD = 'ca72a6df511bbb26c6b9e0a193a3e0baf01aa428'
NATIVE_TREE = 'cbcfc510a117101fd163f83b3c574dd979085b02'
BASE_HEAD = '0ebf51d80179130c2b05041663c02777c427fcf4'
BASE_TREE = 'aa2b71604f4fd782316b27bc340c88763db4eaad'
TILES = {
    'tile-0-0.png': (712043, '82d8d1b75f7a9702b9caa94f03badddd57437aff4aac13ebf118fd1fe32a1dea'),
    'tile-0-1.png': (710631, '334cf0fb048ce34d40641e672c268f6be59e36ed367909d7bd648b7ca03176bc'),
    'tile-1-0.png': (723958, '7bc9cea86f7569d5769d78e34cac5a79ad298a1da132852f7f03c437f2e63d35'),
    'tile-1-1.png': (725224, '88f4441ba10f82e511c521a934ddae07a2e347059d3ec020d196893d777d1766'),
}


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def sha(body):
    return hashlib.sha256(body).hexdigest()


def identity(body):
    return {'bytes': len(body), 'sha256': sha(body)}


def archive(body):
    """Validate the bounded archive and read members without extracting paths."""
    require(len(body) <= 10 * 1024 * 1024, 'archive encoded-size bound')
    with zipfile.ZipFile(io.BytesIO(body)) as source:
        infos = source.infolist()
        names = [info.filename for info in infos]
        require(len(names) == len(set(names)), 'duplicate ZIP member')
        require(len(names) <= 200 and sum(i.file_size for i in infos) <= 64 * 1024 * 1024,
                'archive count/decoded-size bound')
        for info in infos:
            name = PurePosixPath(info.filename)
            require(not name.is_absolute() and '..' not in name.parts and '\\' not in info.filename,
                    'unsafe ZIP member')
            require(not info.is_dir() and not stat.S_ISLNK(info.external_attr >> 16), 'nonfile ZIP member')
            require(not info.flag_bits & 1 and info.file_size <= 4 * 1024 * 1024,
                    'encrypted/oversized ZIP member')
        # zipfile.read checks each member's complete CRC before returning bytes.
        return {name: source.read(name) for name in names}


def png(body):
    """Decode exact RGB/RGBA scanlines, validating dimensions, CRCs and opacity."""
    require(body[:8] == b'\x89PNG\r\n\x1a\n', 'PNG signature')
    offset, chunks, compressed = 8, [], []
    width = height = channels = None
    while offset < len(body):
        require(offset + 12 <= len(body), 'truncated PNG chunk')
        length = struct.unpack('>I', body[offset:offset + 4])[0]
        name = body[offset + 4:offset + 8]
        end = offset + length + 12
        require(end <= len(body), 'truncated PNG payload')
        payload = body[offset + 8:offset + 8 + length]
        checksum = struct.unpack('>I', body[end - 4:end])[0]
        require(zlib.crc32(name + payload) & 0xffffffff == checksum, 'PNG CRC')
        chunks.append(name)
        if name == b'IHDR':
            require(len(chunks) == 1 and length == 13, 'PNG header order')
            width, height, depth, color, compression, filtering, interlace = struct.unpack('>IIBBBBB', payload)
            require(0 < width <= 1280 and 0 < height <= 900, 'PNG dimension bound')
            require(depth == 8 and color in (2, 6) and compression == filtering == interlace == 0,
                    'unsupported PNG semantics')
            channels = 3 if color == 2 else 4
        elif name == b'IDAT':
            compressed.append(payload)
        elif name == b'IEND':
            require(length == 0 and end == len(body), 'PNG trailing bytes')
        else:
            require(name[0] & 32, 'unsupported critical PNG chunk')
        offset = end
    require(chunks and chunks[-1] == b'IEND' and chunks.count(b'IHDR') == 1 and compressed, 'PNG structure')
    stride = width * channels
    expected_length = height * (stride + 1)
    decoder = zlib.decompressobj()
    scanlines = decoder.decompress(b''.join(compressed), expected_length + 1)
    require(len(scanlines) == expected_length and decoder.eof and not decoder.unused_data,
            'PNG decoded length')
    previous = bytearray(stride)
    rgb = bytearray()
    for y in range(height):
        start = y * (stride + 1)
        kind = scanlines[start]
        require(kind <= 4, 'PNG scanline filter')
        row = bytearray(scanlines[start + 1:start + 1 + stride])
        for x in range(stride):
            left = row[x - channels] if x >= channels else 0
            above = previous[x]
            upper_left = previous[x - channels] if x >= channels else 0
            if kind == 0:
                predictor = 0
            elif kind == 1:
                predictor = left
            elif kind == 2:
                predictor = above
            elif kind == 3:
                predictor = (left + above) // 2
            else:
                estimate = left + above - upper_left
                distances = [abs(estimate - v) for v in (left, above, upper_left)]
                predictor = (left, above, upper_left)[distances.index(min(distances))]
            row[x] = (row[x] + predictor) & 255
        if channels == 4:
            require(all(row[i] == 255 for i in range(3, stride, 4)), 'nonopaque PNG')
            rgb.extend(v for i, v in enumerate(row) if i % 4 != 3)
        else:
            rgb.extend(row)
        previous = row
    return {'width': width, 'height': height, 'channels': channels, 'rgb': rgb, 'sha256': sha(body)}


def pixel(image, x, y):
    require(0 <= x < image['width'] and 0 <= y < image['height'], 'pixel outside image')
    offset = (y * image['width'] + x) * 3
    return tuple(image['rgb'][offset:offset + 3])


def region(image, rectangle):
    x0, y0, x1, y1 = rectangle
    return [pixel(image, x, y) for y in range(y0, y1) for x in range(x0, x1)]


def average(values):
    return sum(values) / len(values)


def metrics(source, baseline, active, tile, coverage, footprint):
    west, south, east, north = coverage
    tw, ts, te, tn = tile['bounds']
    left = footprint['left'] + (tw - west) / (east - west) * (footprint['right'] - footprint['left'])
    right = footprint['left'] + (te - west) / (east - west) * (footprint['right'] - footprint['left'])
    top = footprint['top'] + (north - tn) / (north - south) * (footprint['bottom'] - footprint['top'])
    bottom = footprint['top'] + (north - ts) / (north - south) * (footprint['bottom'] - footprint['top'])
    rectangle = [math.ceil(left) + 2, math.ceil(top) + 2, math.floor(right) - 2, math.floor(bottom) - 2]
    require(rectangle[2] - rectangle[0] >= 8 and rectangle[3] - rectangle[1] >= 8, 'quadrant too small')
    before, after = region(baseline, rectangle), region(active, rectangle)
    expected, observed = [], []
    for y in range(rectangle[1], rectangle[3]):
        for x in range(rectangle[0], rectangle[2]):
            sx = (x + .5 - left) / (right - left) * source['width']
            sy = (y + .5 - top) / (bottom - top) * source['height']
            rx = max(1, round(source['width'] / (right - left) / 2))
            ry = max(1, round(source['height'] / (bottom - top) / 2))
            area = region(source, (max(0, int(sx) - rx), max(0, int(sy) - ry),
                                   min(source['width'], int(sx) + rx), min(source['height'], int(sy) + ry)))
            expected.append(average(tuple(average([p[c] for p in area]) for c in range(3))))
            observed.append(average(pixel(active, x, y)))
    ma, mb = average(observed), average(expected)
    numerator = sum((a - ma) * (b - mb) for a, b in zip(observed, expected))
    denominator = math.sqrt(sum((a - ma) ** 2 for a in observed) * sum((b - mb) ** 2 for b in expected))
    require(denominator > 0, 'constant quadrant')
    return {
        'rect': rectangle,
        'changedFraction': sum(a != b for a, b in zip(before, after)) / len(after),
        'meanChannelDifferenceFromBaseline': average([abs(a[c] - b[c]) for a, b in zip(before, after) for c in range(3)]),
        'distinctColors': len(set(after)),
        'northUpLuminanceCorrelationWithReceivedTile': numerator / denominator,
        'meanLuminanceError': average([abs(a - b) for a, b in zip(observed, expected)]),
    }


def verify(directory):
    directory = Path(directory)
    native_body = (directory / 'preserved/native-proof.zip').read_bytes()
    rgb_body = (directory / 'preserved/wgs84-research.zip').read_bytes()
    require(identity(native_body) == {'bytes': 5657470, 'sha256': NATIVE_SHA}, 'native proof identity')
    require(identity(rgb_body) == {'bytes': 2918432, 'sha256': RGB_SHA}, 'runtime RGB identity')
    native, rgb = archive(native_body), archive(rgb_body)
    manifest = json.loads(native['MANIFEST.json'])
    require(manifest['candidate'] == NATIVE_HEAD and manifest['tree'] == NATIVE_TREE, 'native source binding')
    entries = manifest['entries']
    require(len(entries) == 178 and len(native) == 179, 'native proof count')
    require(set(native) == {'MANIFEST.json', *(entry['path'] for entry in entries)}, 'native manifest member set')
    for entry in entries:
        require(identity(native[entry['path']]) == {'bytes': entry['bytes'], 'sha256': entry['sha256']},
                'native member mismatch: ' + entry['path'])
    require(set(rgb) == {'provenance.json', 'source-metadata.xml', 'upstream-provenance.json', *TILES}, 'runtime member set')
    binding = json.loads((directory / 'source-binding.json').read_text())
    require(binding['baseSource'] == {'head': BASE_HEAD, 'tree': BASE_TREE}, 'supplement base binding')
    require(binding['browserExecutedSource'] == {'head': NATIVE_HEAD, 'tree': NATIVE_TREE}, 'executed source binding')
    reference = json.loads((directory / 'payload-reference.json').read_text())
    expected = json.loads((directory / 'ohio.expected.json').read_text())
    browser = json.loads(native['actual-app/browser-receipt.json'])
    witness = json.loads(native['actual-app/pixel-receipt.json'])
    require(browser['candidate'] == witness['candidate'] == NATIVE_HEAD and not browser['dirty'] and not witness['dirty'], 'clean historical browser source')
    require(sha(native['actual-app/browser-receipt.json']) == witness['browserReceiptSha256'], 'pixel/browser receipt binding')
    require(sha(native['receipts/run-native-correction-App.mjs']) == browser['harnessSha256'], 'historical harness identity')
    require(sha(native['receipts/qualifyWorldViewNativeRgbPixels.py']) == browser['pixelVerifierSha256'], 'historical pixel verifier identity')
    require(browser['sourceFileHashes'] == witness['sourceFileHashes'] == binding['currentBaseProductionFileHashes'], 'eight production hashes across sources')
    require(browser['payloadPackageSha256'] == RGB_SHA and reference['package']['sha256'] == RGB_SHA, 'RGB/native payload binding')
    require(browser['originalDescriptorSha256BeforeAfter'] == ['21ea5338c49d6b2ae127c420ead3920d260dece13ea09f0fed9889db34aa1e15'] * 2, 'original descriptor preservation')
    descriptor_body = (directory / 'preserved/unapproved-descriptor.json').read_bytes()
    descriptor = json.loads(descriptor_body)
    require(sha(descriptor_body) == browser['originalDescriptorSha256BeforeAfter'][0], 'genuine descriptor body')
    require(not descriptor['applicationAdmitted'] and not descriptor['source']['admission']['approved'], 'genuine descriptor unapproved')
    require(browser['originalUnapproved'] and not browser['genuineApplicationAdmitted'] and not witness['genuineApplicationAdmitted'], 'genuine source authority remains closed')
    require(witness['authority'] == 'SIMULATED_TEST_AUTHORITY_ONLY', 'simulated authority attribution')
    actual = next(item for item in browser['receipts'] if item['scenario'] == 'positive-remount')
    require(actual['authority'] == 'SIMULATED_TEST_AUTHORITY_ONLY' and actual['genuinePayload'] and not actual['genuineApplicationAdmitted'], 'genuine pixels/simulated authority distinction')
    require(sha(rgb['source-metadata.xml']) == expected['metadata']['sha256'] == reference['sourceMetadataXml']['sha256'], 'metadata identity')
    xml = ET.fromstring(rgb['source-metadata.xml'])
    xml_checks = []
    for item in expected['metadata']['bindings']:
        node = xml.find(item['path'])
        text = ' '.join(''.join(node.itertext()).split()) if node is not None else None
        require(text == ' '.join(item['expectedText'].split()), 'metadata selector mismatch: ' + item['id'])
        xml_checks.append(item['id'])
    require(sha(rgb['provenance.json']) == reference['runtimeProvenance']['sha256'], 'runtime provenance identity')
    provenance = json.loads(rgb['provenance.json'])
    require(not provenance['admission']['approved'] and not provenance['increasesEvidencePrecision'], 'metadata cannot grant admission/precision')
    tiles = []
    baseline = png(native['actual-app/positive-remount-baseline.png'])
    active = png(native['actual-app/positive-remount-active.png'])
    baseline_full = png(native['actual-app/positive-remount-baseline-full-app.png'])
    active_full = png(native['actual-app/positive-remount-active-full-app.png'])
    # The actual full viewport retains the same native canvas at this origin.
    # Bind that translation to real source pixels, then recompute directly from
    # the full viewport bytes. This creates no cropped/composited image file.
    canvas_origin = (52, 88)
    footprint = actual['active']['nativeSourceImagery']['screenFootprint']
    full_footprint = {**footprint, 'left': footprint['left'] + canvas_origin[0],
                      'right': footprint['right'] + canvas_origin[0],
                      'top': footprint['top'] + canvas_origin[1],
                      'bottom': footprint['bottom'] + canvas_origin[1]}
    require((baseline['width'], baseline['height']) == (1176, 752) == (active['width'], active['height']), 'native canvas dimensions')
    require(baseline['sha256'] == witness['screenshots']['positive-remount-baseline.png'] and active['sha256'] == witness['screenshots']['positive-remount-active.png'], 'screenshot identity')
    for index, tile in enumerate(reference['tiles']):
        name = tile['name']
        require(identity(rgb[name]) == {'bytes': TILES[name][0], 'sha256': TILES[name][1]}, 'raw tile identity')
        require(tile['sha256'] == TILES[name][1] and tile['byteLength'] == TILES[name][0], 'tile reference identity')
        image = png(rgb[name])
        require((image['width'], image['height'], image['channels']) == (512, 512, 3), 'tile dimensions/RGB semantics')
        pixels = image['rgb']
        stride = image['width'] * 3
        hashes = {
            'exactEncodedSha256': image['sha256'],
            'rawNorthUpBandPlanarRgbSha256': sha(b''.join(bytes(pixels[channel::3]) for channel in range(3))),
            'rawNorthUpInterleavedRgbSha256': sha(pixels),
            'browserUploadPreflippedInterleavedRgbSha256': sha(b''.join(pixels[y * stride:(y + 1) * stride] for y in range(image['height'] - 1, -1, -1))),
        }
        old = witness['tiles'][index]
        require(old['tile'] == name and tile['rgbSha256'] == hashes['rawNorthUpBandPlanarRgbSha256'], 'tile order/planar hash')
        require(all(old[key] == value for key, value in hashes.items()), 'encoded/decoded witness identity')
        for load in (0, 1):
            decoded = actual['events']['decodeWitness'][load * 4 + index]
            require(decoded['width'] == decoded['height'] == 512 and decoded['alphaOpaque'] and decoded['rgbSha256'] == hashes['browserUploadPreflippedInterleavedRgbSha256'], 'first/second decode witness binding')
        measured = metrics(image, baseline, active, tile, reference['coverage']['bounds'], actual['active']['nativeSourceImagery']['screenFootprint'])
        for key, value in measured.items():
            require(value == old[key] if isinstance(value, (list, int)) else abs(value - old[key]) < 1e-12,
                    'recomputed metric mismatch: ' + name + '/' + key)
        require(measured['changedFraction'] > .95 and measured['meanChannelDifferenceFromBaseline'] > 20 and measured['distinctColors'] > 30 and measured['northUpLuminanceCorrelationWithReceivedTile'] > .35 and measured['meanLuminanceError'] < 35, 'original pixel threshold')
        translated = [value + canvas_origin[index % 2] for index, value in enumerate(measured['rect'])]
        require(region(active, measured['rect']) == region(active_full, translated)
                and region(baseline, measured['rect']) == region(baseline_full, translated), 'canvas/full viewport quadrant pixel equality')
        full_measured = metrics(image, baseline_full, active_full, tile, reference['coverage']['bounds'], full_footprint)
        require(full_measured['rect'] == translated, 'full viewport quadrant translation')
        for key, value in measured.items():
            if key != 'rect':
                require(abs(full_measured[key] - value) < 1e-10, 'full viewport recomputation mismatch: ' + name + '/' + key)
        tiles.append({'name': name, 'bytes': len(rgb[name]), 'width': 512, 'height': 512, **hashes, **measured,
                      'firstFullViewportRecomputation': full_measured, 'status': 'PASS_RECOMPUTED_FROM_RETAINED_BYTES'})
    outside = []
    for band in witness['outsideFootprint']:
        before, after = region(baseline, band['rect']), region(active, band['rect'])
        changed = sum(a != b for a, b in zip(before, after))
        require(changed == band['changedPixels'] == 0 and len(after) == band['pixels'], 'outside baseline preservation')
        translated = [value + canvas_origin[index % 2] for index, value in enumerate(band['rect'])]
        require(before == region(baseline_full, translated) and after == region(active_full, translated), 'canvas/full viewport outside-band equality')
        outside.append({'rect': band['rect'], 'fullViewportRect': translated, 'pixels': len(after), 'changedPixels': changed})
    frames = []
    for name, body in native.items():
        if name.startswith('actual-app/') and name.endswith('-full-app.png'):
            frame = png(body)
            require((frame['width'], frame['height']) == (1280, 900), 'full viewport dimensions')
            frames.append({'path': name, **identity(body), 'width': 1280, 'height': 900})
    require(len(frames) == 7, 'seven original viewport frames')
    active_budget = actual['active']['localSourceResource']['localBudget']
    remount_budget = actual['remounted']['localSourceResource']['localBudget']
    require((active_budget['requests'], active_budget['allowanceConsumedBytes']) == (1, 7112736), 'first cumulative charge')
    require((remount_budget['requests'], remount_budget['allowanceConsumedBytes']) == (2, 14225472), 'second cumulative charge')
    require(actual['remounted']['nativeSourceImagery']['adapterGeneration'] != actual['active']['nativeSourceImagery']['adapterGeneration'] and len(actual['gets']) == 8, 'remount receipt generation/eight GETs')
    camera = json.loads(actual['cameraBefore'])
    require(camera['heightMeters'] == 8660.254037844763, 'original native precision floor')
    require(binding['secondAttachmentFrame']['available'] is False, 'unavailable second frame must stay explicit')
    return {
        'schema': 'mip.imagery-custody-recomputation.v1',
        'recordedAtUtc': datetime.now(timezone.utc).isoformat(),
        'status': 'PASS_SOURCE_BODY_CUSTODY_AND_FIRST_ATTACHMENT_RECOMPUTATION',
        'runtime': {'python': platform.python_version(), 'zlib': zlib.ZLIB_RUNTIME_VERSION},
        'recomputationScriptSha256': sha(Path(__file__).read_bytes()),
        'baseSource': binding['baseSource'], 'browserExecutedSource': binding['browserExecutedSource'],
        'browserRerun': False, 'nativeProof': {**identity(native_body), 'members': len(native), 'manifestPayloadsVerified': len(entries), 'crc': 'PASS_ALL_MEMBERS'},
        'runtimeRgbPackage': {**identity(rgb_body), 'members': len(rgb), 'crc': 'PASS_ALL_MEMBERS'},
        'rawTileEncodedBytes': sum(tile['bytes'] for tile in tiles), 'metadataSelectorsVerified': xml_checks,
        'tiles': tiles, 'outsideFootprint': outside, 'fullViewportFrames': frames,
        'canvasOriginInFirstFullViewport': list(canvas_origin),
        'historicalNativePrecisionFloorMetres': camera['heightMeters'],
        'secondAttachment': {'receiptBound': True, 'adapterGenerationChanged': True, 'cumulativeGets': 8, 'requests': 2, 'allowanceConsumedBytes': 14225472, 'fullViewportFrameAvailable': False, 'pixelRecomputationAvailable': False},
        'authority': 'GENUINE_RECEIVED_PIXELS_WITH_SIMULATED_TEST_AUTHORITY_ONLY',
        'genuineApplicationAdmitted': False, 'originalTiffDecoded': False, 'measuredGroundRegistration': False,
        'limits': witness['limits'] + ['second-attachment frame not retained; receipt proof only', 'custody supplement does not rerun or replace historical browser/CI baselines'],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', required=True, type=Path)
    parser.add_argument('--report', type=Path, help='New output only; existing receipts are never overwritten')
    args = parser.parse_args()
    report = verify(args.directory)
    if args.report:
        with args.report.open('x') as target:
            target.write(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'status': report['status'], 'tiles': len(report['tiles']), 'correlations': [tile['northUpLuminanceCorrelationWithReceivedTile'] for tile in report['tiles']], 'secondAttachmentFrameAvailable': False}))


if __name__ == '__main__':
    main()
