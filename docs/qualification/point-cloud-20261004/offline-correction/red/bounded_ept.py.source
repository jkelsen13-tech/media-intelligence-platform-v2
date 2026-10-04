#!/usr/bin/env python3
"""Read-only, capped Cleveland EPT research. No product admission or activation.

Standard library traversal works without a decoder. Actual point acquisition is
disabled until a coordinated decoder/header/live-buffer qualification exists.
"""
import argparse
import datetime
import hashlib
import importlib.util
import json
import math
import pathlib
import re
import resource
import sys
import time
import urllib.error
import urllib.request

ROOT = 'https://s3-us-west-2.amazonaws.com/usgs-lidar-public/OH_Statewide_Phase1_1_2019/'
MIB = 1024 * 1024
CAPS = {'initial_metadata_bytes': MIB, 'acquired_bytes': 32 * MIB,
        'decoded_points': 500_000, 'live_buffer_bytes': 96 * MIB,
        'requests': 32, 'hierarchy_pages': 16, 'depth': 18,
        'node_bytes': 8 * MIB, 'hierarchy_bytes': MIB}
FOOTPRINT_SHA = 'fe14f6d6472de92c67e34136db9a97a816e9e49e17208354523f683d10872735'
TERRAIN_LONLAT = [[-81.7056444732889, 41.4041379007024],
                  [-81.7055945869566, 41.3995263556271],
                  [-81.6994700323291, 41.3995637507443],
                  [-81.6995194857349, 41.4041753018473],
                  [-81.7056444732889, 41.4041379007024]]
FOOTPRINT_BOUNDS = [-81.6999051, 41.4004629, -81.6996735, 41.4008596]
KEY_RE = re.compile(r'^(\d+)-(\d+)-(\d+)-(\d+)$')


class Stop(RuntimeError):
    pass


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def mercator(lon, lat):
    if not (-180 <= lon <= 180 and -85 <= lat <= 85):
        raise Stop('Coordinate outside declared analytic EPSG:4326-to-3857 domain')
    return [6378137 * math.radians(lon),
            6378137 * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))]


def inside(point, ring):
    x, y = point
    hit = False
    for a, b in zip(ring, ring[1:]):
        if (a[1] > y) != (b[1] > y):
            if x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
                hit = not hit
    return hit


def distance_to_ring(point, ring):
    x, y = point
    best = float('inf')
    for a, b in zip(ring, ring[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        denom = dx * dx + dy * dy
        t = max(0, min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / denom)) if denom else 0
        best = min(best, math.hypot(x - a[0] - t * dx, y - a[1] - t * dy))
    return best


def key_parts(key):
    match = KEY_RE.fullmatch(key)
    if not match:
        raise Stop('Invalid EPT key')
    d, x, y, z = map(int, match.groups())
    if d > CAPS['depth'] or any(v >= 2 ** d for v in (x, y, z)):
        raise Stop('EPT key outside bounded depth/index domain')
    return d, x, y, z


def node_bounds(bounds, key):
    d, x, y, z = key_parts(key)
    steps = [(bounds[i + 3] - bounds[i]) / 2 ** d for i in range(3)]
    low = [bounds[i] + v * steps[i] for i, v in enumerate((x, y, z))]
    return low + [low[i] + steps[i] for i in range(3)]


def intersects(bounds, xy, zrange):
    return (bounds[0] < xy[2] and bounds[3] > xy[0] and
            bounds[1] < xy[3] and bounds[4] > xy[1] and
            bounds[2] < zrange[1] and bounds[5] > zrange[0])


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise Stop('Redirect refused; acquisition stopped without alternate URL')


class Acquisition:
    """Persist each attempt; denial and any unverified cap terminate this run."""
    def __init__(self, output, opener=None):
        self.output = pathlib.Path(output)
        self.output.mkdir(parents=True, exist_ok=True)
        if (self.output / 'acquisition.json').exists():
            raise Stop('Existing acquisition ledger: do not retry or silently reuse a run directory')
        self.opener = opener or urllib.request.build_opener(NoRedirect())
        self.ledger = {'schema': 'mip.bounded-ept-acquisition.v1', 'started_at': utc_now(),
                       'root': ROOT, 'caps': CAPS, 'bytes': 0, 'requests': [],
                       'stopped': False, 'denied': False}
        self.persist()

    def persist(self):
        (self.output / 'acquisition.json').write_text(json.dumps(self.ledger, indent=2) + '\n')

    def get(self, relative, limit, initial=False):
        if self.ledger['stopped']:
            raise Stop('Acquisition already stopped')
        if not (relative == 'ept.json' or re.fullmatch(r'ept-hierarchy/\d+-\d+-\d+-\d+\.json', relative)):
            raise Stop('URL outside exact approved EPT root/pattern')
        if len(self.ledger['requests']) >= CAPS['requests']:
            self.ledger.update(stopped=True, stop_reason='Request cap reached')
            self.persist()
            raise Stop('Request cap reached')
        budget = min(limit, CAPS['acquired_bytes'] - self.ledger['bytes'])
        if initial:
            budget = min(budget, CAPS['initial_metadata_bytes'] - self.ledger['bytes'])
        entry = {'url': ROOT + relative, 'at': utc_now(), 'limit_bytes': budget, 'received_bytes': 0}
        self.ledger['requests'].append(entry)
        self.persist()
        try:
            req = urllib.request.Request(entry['url'], headers={'Accept-Encoding': 'identity',
                                          'User-Agent': 'MIP-bounded-point-cloud-research/1.0'})
            with self.opener.open(req, timeout=20) as response:
                entry['status'] = response.status
                entry['headers'] = {k.lower(): v for k, v in response.headers.items()
                                    if k.lower() in ('content-length', 'content-type', 'content-encoding',
                                                       'etag', 'last-modified', 'x-amz-request-id')}
                length = response.headers.get('Content-Length')
                if response.status != 200 or length is None or not length.isdecimal():
                    raise Stop('Successful exact response length could not be verified before body read')
                expected = int(length)
                entry['expected_bytes'] = expected
                if response.headers.get('Content-Encoding', 'identity') != 'identity':
                    raise Stop('Encoded transport body refused: decoded cap cannot be established')
                if expected > budget or budget <= 0:
                    raise Stop('Response exceeds preverified remaining byte cap; body not read')
                path = self.output / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                digest = hashlib.sha256()
                with path.open('xb') as out:
                    while entry['received_bytes'] < expected:
                        chunk = response.read(min(65536, expected - entry['received_bytes']))
                        if not chunk:
                            raise Stop('Truncated response')
                        entry['received_bytes'] += len(chunk)
                        self.ledger['bytes'] += len(chunk)
                        digest.update(chunk)
                        out.write(chunk)
                    # Content-Length frames this identity response; no unbounded trailing read.
                entry.update(sha256=digest.hexdigest(), local_path=relative, complete=True)
                self.persist()
                return path
        except Exception as exc:
            if isinstance(exc, urllib.error.HTTPError):
                entry['status'] = exc.code
                if exc.code in (401, 403):
                    self.ledger['denied'] = True
                exc.close()  # Never download a denied error body or try an alternate route.
            elif isinstance(exc, urllib.error.URLError) and re.search(
                    r'Tunnel connection failed: (?:401|403)\b', str(exc.reason)):
                self.ledger['denied'] = True
                entry['denial_layer'] = 'executor_tunnel; origin HTTP status unknown'
            entry['error'] = str(exc)
            self.ledger.update(stopped=True, stop_reason=str(exc), stopped_at=utc_now())
            self.persist()
            raise Stop(str(exc)) from exc


def validate_metadata(meta):
    if meta.get('dataType') != 'laszip' or meta.get('hierarchyType') != 'json':
        raise Stop('Only documented LAZ and JSON EPT supported')
    if meta.get('version') not in ('1.0.0', '1.1.0') or meta.get('span') != 128:
        raise Stop('Unqualified EPT version/span')
    if meta.get('srs', {}).get('authority') != 'EPSG' or str(meta['srs'].get('horizontal')) != '3857':
        raise Stop('Unqualified horizontal CRS')
    for name in ('bounds', 'boundsConforming'):
        b = meta.get(name, [])
        if len(b) != 6 or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in b):
            raise Stop('Invalid EPT bounds')
        if any(b[i] >= b[i + 3] for i in range(3)):
            raise Stop('Empty or reversed EPT bounds')
    fields = {x['name']: x for x in meta.get('schema', [])}
    needed = {'X', 'Y', 'Z', 'GpsTime', 'PointSourceId', 'Classification',
              'ReturnNumber', 'NumberOfReturns', 'ClassFlags'}
    if not needed <= fields.keys():
        raise Stop('Expected LAS fields absent')
    return fields


def sample_window():
    low = mercator(*FOOTPRINT_BOUNDS[:2])
    high = mercator(*FOOTPRINT_BOUNDS[2:])
    # 15 physical metres using local Mercator scale approximation for research selection.
    pad = 15 / math.cos(math.radians(41.40066))
    return [low[0] - pad, low[1] - pad, high[0] + pad, high[1] + pad]


def traverse(acquisition, meta, xy, min_depth=10):
    queue = ['0-0-0-0']
    seen = set()
    nodes = {}
    pages = []
    zrange = [meta['boundsConforming'][2], meta['boundsConforming'][5]]
    while queue:
        key = queue.pop(0)
        if key in seen:
            raise Stop('Repeated hierarchy page or cycle')
        if len(seen) >= CAPS['hierarchy_pages']:
            raise Stop('Hierarchy page cap reached before traversal completed')
        seen.add(key)
        path = acquisition.get('ept-hierarchy/' + key + '.json', CAPS['hierarchy_bytes'], initial=(key == '0-0-0-0'))
        page = json.loads(path.read_text())
        if not isinstance(page, dict) or len(page) > 50000:
            raise Stop('Invalid or oversized hierarchy map')
        pages.append({'key': key, 'entries': len(page)})
        if page.get(key, -1) <= 0:
            raise Stop('Hierarchy page does not resolve its own sentinel')
        for child, count in page.items():
            d, x, y, z = key_parts(child)
            pd, px, py, pz = key_parts(key)
            if d < pd or any(v // 2 ** (d - pd) != p for v, p in zip((x, y, z), (px, py, pz))):
                raise Stop('Hierarchy key escapes requested subtree')
            if type(count) is not int or count < -1 or count == 0:
                raise Stop('Invalid hierarchy count')
            if not intersects(node_bounds(meta['bounds'], child), xy, zrange):
                continue
            if count == -1:
                if child == key:
                    raise Stop('Self-referencing hierarchy sentinel')
                if child not in seen and child not in queue:
                    queue.append(child)
            else:
                if child in nodes and nodes[child] != count:
                    raise Stop('Conflicting additive node counts')
                nodes[child] = count
                if len(nodes) > 16384 or len(queue) > 4096:
                    raise Stop('Hierarchy accumulator memory cap reached')
    candidates = [{'key': key, 'points': count, 'bounds': node_bounds(meta['bounds'], key)}
                  for key, count in nodes.items() if key_parts(key)[0] >= min_depth]
    # Deepest nodes favor a bounded dense sample; ancestors are explicitly omitted.
    candidates.sort(key=lambda n: (-key_parts(n['key'])[0], n['key']))
    selected, count = [], 0
    for node in candidates:
        if count + node['points'] <= CAPS['decoded_points']:
            selected.append(node)
            count += node['points']
        if len(selected) >= 8:
            break
    return {'pages': pages, 'intersecting_additive_nodes': len(nodes),
            'selected_nodes': selected, 'selected_point_upper_bound': count,
            'omitted_nodes': len(nodes) - len(selected), 'full_density': False,
            'sample_xy_bounds_3857': xy, 'minimum_selected_depth': min_depth}


def decoder_info():
    found = {n: importlib.util.find_spec(n) is not None for n in ('laspy', 'lazrs', 'numpy')}
    # Package presence is never sufficient proof of LAZ decode or internal memory.
    found['usable'] = False
    found['qualification'] = 'No measured installed decoder/header/live-buffer qualification; point fetch disabled'
    return found


def read_footprints(path):
    data = pathlib.Path(path).read_bytes()
    if len(data) != 3117 or sha256(data) != FOOTPRINT_SHA:
        raise Stop('Footprint source-byte custody does not match preserved manifest')
    obj = json.loads(data)
    features = obj.get('features', [])
    if len(features) != 2:
        raise Stop('Expected exactly two preserved footprint rings')
    output = []
    for feature in features:
        geom = feature['geometry']
        if geom['type'] != 'Polygon' or len(geom['coordinates']) != 1:
            raise Stop('Only preserved simple polygon rings supported')
        ring = geom['coordinates'][0]
        if ring[0] != ring[-1] or any(len(p) != 2 for p in ring):
            raise Stop('Expected unchanged closed 2D footprint ring')
        props = feature.get('properties', {})
        output.append({'properties': props, 'ring': [mercator(*p) for p in ring]})
    return output


def quantile(values, p):
    if not values:
        return None
    a = sorted(values)
    idx = (len(a) - 1) * p
    low = int(idx)
    return a[low] + (a[min(low + 1, len(a) - 1)] - a[low]) * (idx - low)


def analyze_sample(records, footprints):
    """Conservative research summary; class 1 never becomes building class 6."""
    terrain = [mercator(*p) for p in TERRAIN_LONLAT]
    scale = math.cos(math.radians(41.40066))
    clipped = [r for r in records if inside((r['x'], r['y']), terrain)]
    classes, flags, source_ids = {}, {}, {}
    for r in clipped:
        for table, value in ((classes, r['classification']), (flags, r['class_flags']),
                             (source_ids, r['point_source_id'])):
            table[str(value)] = table.get(str(value), 0) + 1
    summaries = []
    for feature in footprints:
        ring = feature['ring']
        roof, ground = [], []
        inside_count = 0
        for r in clipped:
            pt = (r['x'], r['y'])
            in_any = any(inside(pt, f['ring']) for f in footprints)
            in_this = inside(pt, ring)
            inside_count += int(in_this)
            # Synthetic, key, withheld and overlap flags all excluded for this first experiment.
            if r['class_flags'] & 15:
                continue
            if in_this and r['classification'] == 1 and r['return_number'] == 1:
                roof.append(r['z'])
            if not in_any and r['classification'] == 2 and distance_to_ring(pt, ring) * scale <= 15:
                ground.append(r['z'])
        roof90, ground50 = quantile(roof, .90), quantile(ground, .50)
        supported = len(roof) >= 20 and len(ground) >= 20
        summaries.append({'source_properties': feature['properties'], 'inside_points': inside_count,
                          'unclassified_first_return_candidates': len(roof), 'ground_ring_points': len(ground),
                          'surface_z_p90_metres_NAVD88_GEOID12B': roof90,
                          'local_ground_z_median_metres_NAVD88_GEOID12B': ground50,
                          'surface_above_local_ground_metres_estimate': roof90 - ground50 if supported else None,
                          'candidate_vertical_spread_p10_p90_metres': quantile(roof, .90) - quantile(roof, .10) if roof else None,
                          'ground_spread_p10_p90_metres': quantile(ground, .90) - quantile(ground, .10) if ground else None,
                          'height_status': 'estimated_unclassified_surface_roof_or_vegetation' if supported else 'insufficient_sample',
                          'authoritative_building_class': False, 'verified_registration': False,
                          'independently_verified_height': False, 'admitted_3d': False})
    return {'terrain_clipped_points': len(clipped), 'classification_counts': classes,
            'class_flags_counts': flags, 'point_source_id_counts': source_ids,
            'footprints': summaries, 'flight_date': None,
            'date_limit': 'GPS values are recorded only; per-node LAS header semantics must be verified before any time interpretation.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True)
    parser.add_argument('--footprints')
    parser.add_argument('--acquire-points', action='store_true')
    args = parser.parse_args()
    # The current metadata-only experiment has a stricter whole-process virtual
    # memory ceiling than the live-buffer cap. It also bounds hostile JSON parses.
    if not args.acquire_points:
        soft, hard = resource.getrlimit(resource.RLIMIT_AS)
        cap = CAPS['live_buffer_bytes']
        resource.setrlimit(resource.RLIMIT_AS, (min(soft, cap) if soft > 0 else cap, hard))
    started = time.monotonic()
    output = pathlib.Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    if (output / 'experiment.json').exists():
        parser.error('Existing experiment report: retained evidence cannot be overwritten or retried')
    report = {'schema': 'mip.cleveland-bounded-point-cloud-experiment.v1', 'started_at': utc_now(),
              'scope': 'Independent public EPT point-cloud research; no source admission or production change',
              'caps': CAPS, 'decoder': decoder_info(), 'admitted': False, 'active': False,
              'crs': {'xy': 'EPSG:3857 metres', 'z': 'NAVD88 / GEOID12B metres per NOAA lineage',
                      'registration': 'UNVERIFIED; analytic projection and prior approximate terrain ring are research selection only'},
              'footprint_custody_sha256': FOOTPRINT_SHA,
              'source_date_range_Phase1_1': ['2019-11-09', '2020-05-02'], 'local_capture_date': None}
    try:
        if args.acquire_points and not report['decoder']['usable']:
            raise Stop('LAZ decoder/header/live-buffer qualification unavailable: point acquisition refused before any request')
        footprints = read_footprints(args.footprints) if args.footprints else None
        if args.acquire_points and footprints is None:
            raise Stop('Exact preserved footprint bytes required before point acquisition')
        acquisition = Acquisition(output)
        path = acquisition.get('ept.json', 65536, initial=True)
        meta = json.loads(path.read_text())
        fields = validate_metadata(meta)
        report['metadata'] = {'points': meta['points'], 'bounds': meta['bounds'],
                              'boundsConforming': meta['boundsConforming'], 'srs': meta['srs'],
                              'schema_fields': list(fields), 'version': meta['version'], 'span': meta['span']}
        report['plan'] = traverse(acquisition, meta, sample_window())
        report['status'] = 'METADATA_HIERARCHY_SAMPLE_PLANNED'
        report['point_acquisition'] = 'DISABLED; coordinated measured decoder qualification and exact footprint bytes are prerequisites'
    except (Stop, ValueError, KeyError, OSError, MemoryError) as exc:
        report.update(status='STOPPED', error=str(exc))
        if 'acquisition' in locals() and not acquisition.ledger['stopped']:
            acquisition.ledger.update(stopped=True, stop_reason=str(exc), stopped_at=utc_now())
            acquisition.persist()
    report.update(finished_at=utc_now(), elapsed_seconds=time.monotonic() - started,
                  process_peak_rss_bytes=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024)
    (output / 'experiment.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'status': report['status'], 'error': report.get('error'),
                      'report': str(output / 'experiment.json')}))
    return 1 if report['status'] == 'STOPPED' else 0


if __name__ == '__main__':
    sys.exit(main())
