#!/usr/bin/env python3
"""Independent full-viewport first/second attachment pixel witness; no image edits or renderer."""
import argparse,hashlib,io,json,math,platform,struct,xml.etree.ElementTree as ET,zipfile,zlib
from datetime import datetime,timezone
from pathlib import Path

def require(condition, reason):
    if not condition:
        raise ValueError(reason)

def sha(body):
    return hashlib.sha256(body).hexdigest()

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


TILES = {
    'tile-0-0.png': (712043, '82d8d1b75f7a9702b9caa94f03badddd57437aff4aac13ebf118fd1fe32a1dea'),
    'tile-0-1.png': (710631, '334cf0fb048ce34d40641e672c268f6be59e36ed367909d7bd648b7ca03176bc'),
    'tile-1-0.png': (723958, '7bc9cea86f7569d5769d78e34cac5a79ad298a1da132852f7f03c437f2e63d35'),
    'tile-1-1.png': (725224, '88f4441ba10f82e511c521a934ddae07a2e347059d3ec020d196893d777d1766'),
}


def source_pixels(directory, reference):
    result = {}
    for tile in reference['tiles']:
        name = tile['name']
        body = (Path(directory) / name).read_bytes()
        require((len(body), sha(body)) == TILES[name], 'exact retained tile identity: ' + name)
        require(tile['sha256'] == TILES[name][1] and tile['byteLength'] == TILES[name][0], 'reference body identity')
        image = png(body)
        require((image['width'], image['height'], image['channels']) == (512, 512, 3), '512x512 opaque RGB tile')
        raw = image['rgb']
        planar = sha(b''.join(bytes(raw[channel::3]) for channel in range(3)))
        require(planar == tile['rgbSha256'], 'producer north-up planar hash')
        stride = image['width'] * 3
        upload = sha(b''.join(raw[y * stride:(y + 1) * stride] for y in range(image['height'] - 1, -1, -1)))
        result[name] = {'image': image, 'exactEncodedSha256': image['sha256'],
                        'rawNorthUpBandPlanarRgbSha256': planar,
                        'rawNorthUpInterleavedRgbSha256': sha(raw),
                        'browserUploadPreflippedInterleavedRgbSha256': upload}
    require(set(result) == set(TILES), 'four source tiles required')
    return result


def footprint(stage):
    native = stage['usage']['nativeSourceImagery']
    require(native['nativeFrameObserved'] and native['creditsVisible'] and not native['visibilityFenced'], 'actual native readiness/credits')
    require(native['ownedPhotoLayerCount'] == 4 and len(native['successfulTileKeys']) == 4, 'four actual native provider successes')
    value, rectangle = native['screenFootprint'], stage['canvasRect']
    require(stage['viewport'] == {'width': 1280, 'height': 900, 'devicePixelRatio': 1}, 'whole viewport/DPR')
    require(rectangle['width'] == value['width'] and rectangle['height'] == value['height'], 'canvas footprint dimensions')
    return {**value, 'left': value['left'] + rectangle['x'], 'right': value['right'] + rectangle['x'],
            'top': value['top'] + rectangle['y'], 'bottom': value['bottom'] + rectangle['y']}


def qualify(directory):
    directory = Path(directory)
    receipt_body = (directory / 'browser-receipt.json').read_bytes()
    receipt = json.loads(receipt_body)
    require(receipt['status'] == 'PASS_BROWSER_OBSERVATIONS_PENDING_SECOND_PIXEL_COMPARISON', 'successful fresh browser journey required')
    require(receipt['dirty'] is False and receipt['candidate'] == receipt['sourceHeadAfter'] and receipt['tree'] == receipt['sourceTreeAfter'], 'exact clean source before/after')
    require(receipt['sourceFileHashes'] == receipt['sourceFileHashesAfter'], 'unchanged production source')
    require(receipt['pixelVerifierSha256'] == sha(Path(__file__).read_bytes()), 'executed pixel verifier identity')
    require(receipt['authority'] == 'SIMULATED_TEST_AUTHORITY_ONLY' and receipt['genuineApplicationAdmitted'] is False, 'simulated authority only')
    reference_body = (directory / 'payload-reference.json').read_bytes()
    require(sha(reference_body) == receipt['payloadReferenceSha256'], 'payload reference binding')
    reference = json.loads(reference_body)
    sources = source_pixels(directory / 'source-bodies', reference)
    runtime_body = (directory / 'source-bodies/wgs84-research.zip').read_bytes()
    require(sha(runtime_body) == receipt['payloadPackageSha256'] == reference['package']['sha256'], 'runtime package identity')
    require(len(runtime_body) == reference['package']['bytes'], 'runtime package length')
    with zipfile.ZipFile(io.BytesIO(runtime_body)) as archive:
        require(set(archive.namelist()) == {'provenance.json', 'source-metadata.xml', 'upstream-provenance.json', *TILES}
                and len(archive.namelist()) == 7 and archive.testzip() is None, 'original seven-member runtime package')
        for name in TILES:
            require(archive.read(name) == (directory / 'source-bodies' / name).read_bytes(), 'preserved package/source body equality')
        require(sha(archive.read('source-metadata.xml')) == reference['sourceMetadataXml']['sha256'], 'source XML binding')
        require(sha(archive.read('provenance.json')) == reference['runtimeProvenance']['sha256'], 'runtime provenance binding')
        provenance = json.loads(archive.read('provenance.json'))
        require(provenance['admission']['approved'] is False and provenance['increasesEvidencePrecision'] is False, 'real admission/precision remain closed')
    descriptor_body = (directory / 'source-bodies/unapproved-descriptor.json').read_bytes()
    descriptor = json.loads(descriptor_body)
    require(sha(descriptor_body) == '21ea5338c49d6b2ae127c420ead3920d260dece13ea09f0fed9889db34aa1e15', 'genuine unapproved descriptor body')
    require(receipt['originalDescriptorSha256BeforeAfter'] == [sha(descriptor_body)] * 2
            and not descriptor['applicationAdmitted'] and not descriptor['source']['admission']['approved'], 'genuine descriptor unchanged/unapproved')
    require(len(receipt['gets']) == 8 and receipt['errors'] == [], 'exact two-load GETs/no page errors')
    stages = receipt['stages']
    require(stages['firstActive']['usage']['nativeSourceImagery']['adapterGeneration'] != stages['secondActive']['usage']['nativeSourceImagery']['adapterGeneration'], 'fresh second adapter generation')
    require(stages['secondActive']['usage']['localSourceResource']['localBudget']['requests'] == 2
            and stages['secondActive']['usage']['localSourceResource']['localBudget']['allowanceConsumedBytes'] == 14225472, 'unchanged cumulative second charge')
    for key in ['firstActive', 'secondBaseline', 'secondActive', 'secondCleanup']:
        require(stages[key]['context'] == stages['firstBaseline']['context'] and stages[key]['precisionText'] == stages['firstBaseline']['precisionText'] and stages[key]['camera'] == stages['firstBaseline']['camera'], 'canonical/time/context/precision/camera unchanged')
    require(json.loads(stages['firstBaseline']['camera'])['heightMeters'] == 8660.254037844763, 'existing native precision floor')
    frames = {item['name']: item for item in receipt['frames']}
    require(len(frames) == len(receipt['frames']) == 7, 'seven separately captured whole viewport frames')
    images = {}
    for name, frame in frames.items():
        body = (directory / name).read_bytes()
        require(sha(body) == frame['sha256'] and len(body) == frame['bytes'], 'captured frame byte binding')
        require(frame['fullViewport'] and frame['cropResizeComposite'] is False, 'whole viewport capture contract')
        images[name] = png(body)
        require((images[name]['width'], images[name]['height']) == (1280, 900), 'actual full viewport dimensions')
    results = []
    for label, baseline_name, active_name, active_stage, decode_start in [
            ('first-control', '01-first-baseline-full-viewport.png', '02-first-active-full-viewport.png', 'firstActive', 0),
            ('fresh-second-attachment', '05-second-baseline-full-viewport.png', '06-second-active-full-viewport.png', 'secondActive', 4)]:
        baseline, active = images[baseline_name], images[active_name]
        f = footprint(stages[active_stage])
        require(frames[active_name]['observation'] == stages[active_stage], 'frame captured at its recorded attachment stage')
        require(frames[baseline_name]['observation']['canvasRect'] == stages[active_stage]['canvasRect'], 'baseline/active canvas geometry unchanged')
        tiles = []
        for index, tile in enumerate(reference['tiles']):
            source = sources[tile['name']]
            decoded = stages[active_stage]['events']['decodeWitness'][decode_start + index]
            require(decoded['alphaOpaque'] and decoded['width'] == decoded['height'] == 512 and decoded['rgbSha256'] == source['browserUploadPreflippedInterleavedRgbSha256'], 'actual corresponding attachment decode identity')
            measured = metrics(source['image'], baseline, active, tile, reference['coverage']['bounds'], f)
            require(measured['changedFraction'] > .95 and measured['meanChannelDifferenceFromBaseline'] > 20 and measured['distinctColors'] > 30 and measured['northUpLuminanceCorrelationWithReceivedTile'] > .35 and measured['meanLuminanceError'] < 35, 'original photographic threshold: ' + label + '/' + tile['name'])
            tiles.append({'name': tile['name'], **{key: value for key, value in source.items() if key != 'image'}, **measured, 'status': 'PASS'})
        bands = [(math.floor(f['left']) - 50, math.ceil(f['top']) + 3, math.floor(f['left']) - 10, math.floor(f['bottom']) - 3),
                 (math.ceil(f['right']) + 10, math.ceil(f['top']) + 3, math.ceil(f['right']) + 50, math.floor(f['bottom']) - 3)]
        outside = []
        for rectangle in bands:
            before, after = region(baseline, rectangle), region(active, rectangle)
            count = sum(a != b for a, b in zip(before, after))
            require(count == 0, 'outside-footprint baseline pixels: ' + label)
            outside.append({'rect': rectangle, 'pixels': len(after), 'changedPixels': count})
        results.append({'attachment': label, 'baselineFrame': baseline_name, 'activeFrame': active_name,
                        'adapterGeneration': stages[active_stage]['usage']['nativeSourceImagery']['adapterGeneration'],
                        'fullViewportFootprint': f, 'tiles': tiles, 'outsideFootprint': outside, 'status': 'PASS'})
    cleanup = stages['secondCleanup']
    require(cleanup['usage']['nativeSourceImagery']['ownedPhotoLayerCount'] == cleanup['usage']['nativeSourceImagery']['retainedRgbaBytes'] == cleanup['usage']['nativeSourceImagery']['bitmapLeaseCount'] == 0, 'actual second native cleanup')
    require(len(cleanup['events']['images']) == 8 and all(image['width'] == image['height'] == 0 for image in cleanup['events']['images']), 'eight real ImageBitmaps closed')
    return {'schema': 'mip.imagery-remount-full-viewport-pixels.v1', 'status': 'PASS_FRESH_SECOND_ATTACHMENT_FULL_VIEWPORT_PIXELS',
            'recordedAtUtc': datetime.now(timezone.utc).isoformat(), 'candidate': receipt['candidate'], 'tree': receipt['tree'],
            'browserReceiptSha256': sha(receipt_body), 'pixelVerifierSha256': sha(Path(__file__).read_bytes()),
            'sourceFileHashes': receipt['sourceFileHashes'], 'runtime': {'python': platform.python_version(), 'zlib': zlib.ZLIB_RUNTIME_VERSION},
            'authority': receipt['authority'], 'genuineReceivedPixels': True, 'genuineApplicationAdmitted': False,
            'historicalFramesRelabeled': False, 'freshSecondFrame': '06-second-active-full-viewport.png',
            'secondNativeCleanup': 'PASS_EIGHT_BITMAPS_CLOSED_ZERO_PHOTO_RGBA_LEASES', 'attachments': results,
            'frames': [{'name': name, 'sha256': frame['sha256'], 'bytes': frame['bytes'], 'width': 1280, 'height': 900} for name, frame in frames.items()],
            'limits': receipt['limits']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path)
    parser.add_argument('--validate-inputs', type=Path)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    if args.validate_inputs:
        reference = json.loads((Path(__file__).parent / 'payload-reference.json').read_text())
        sources = source_pixels(args.validate_inputs, reference)
        report = {'status': 'PASS_RAW_SOURCE_PNG_DECODE_ONLY', 'browserLaunched': False,
                  'scriptSha256': sha(Path(__file__).read_bytes()), 'tiles': [{key: value for key, value in {'name': name, **source}.items() if key != 'image'} for name, source in sources.items()],
                  'runtime': {'python': platform.python_version(), 'zlib': zlib.ZLIB_RUNTIME_VERSION}}
    else:
        require(args.directory is not None, 'fresh evidence directory required')
        report = qualify(args.directory)
    if args.report:
        with args.report.open('x') as output:
            output.write(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'status': report['status'], 'report': str(args.report) if args.report else None}))


if __name__ == '__main__':
    main()
