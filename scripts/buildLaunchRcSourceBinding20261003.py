"""Bind current integrated bytes while retaining exact qualified predecessor blobs.
Run only in the remote RC checkout before its final qualification. No network,
target access, mutation authority or qualification verdict is produced.
"""
import hashlib, json, pathlib, re, subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = 'ca72a6df511bbb26c6b9e0a193a3e0baf01aa428'
OUTPUT = 'docs/MIP_LAUNCH_RC_SOURCE_2026-10-03.json'
PATH_MAPPINGS = json.loads((ROOT/'scripts/launchRcHistoricalSourcePaths20261003.json').read_text())
QUALIFIED = [
    ('ca72', BASE, 'docs/MIP_NATIVE_REVIEW_CORRECTIONS_SOURCE_2026-10-02.json', ['sources']),
    ('release-dependency', '4cf2b0b33673e3c56979e288c4aed9261fa4f7cd', 'docs/qualification/release-dependency-20261003-source.json', ['sources']),
    ('protected-install', '9f907b44d453231896171228104a5bdd6d50bf70', 'docs/MIP_LAUNCH_INSTALL_PACKAGES_SOURCE_2026-10-03.json', ['sources']),
    ('news-calibration', '78d8b3e992609b121289994a44cc089bb762d8da', 'docs/MIP_RETAINED_NEWS_CALIBRATION_SOURCE_2026-10-03.json', ['candidate_files','unchanged_dependencies']),
    ('selective-completion', '84e1987bd7022a5d7e2e948bb6cd93d0af07a25d', 'verifier/selective_intake_completion_qualification_2026-10-03.json', ['source_files']),
    ('selective-completion-artifact', '694aeb4f9635438b4836e0da0194e4d141730edd', 'docs/qualification/selective-completion-artifact-20261003.json', ['source_artifacts']),
    ('markets-contract', '5eae5c69c26099dd3566f40210398f8b30357831', 'docs/qualification/markets-provider-contract-20261003.json', ['sourceAndFixtureHashes']),
    ('terrain-v1', '7ec5e6235fc0a562a0a6c302dcdd6dbc6ca310dc', 'docs/qualification/terrain-composition-20261003.json', ['file_sha256']),
    ('terrain-comparison', 'd1827d23f2f8f97011b10671dbdde6cb4b5a5be0', 'docs/qualification/terrain-comparison-20261003.evidence.json', ['sourceProof.files']),
    ('binding-portability', '5bd71b362e46049cbe66da6a23506da333d51235', 'docs/qualification/markets-provider-contract-portability-20261003.json', ['source_files']),
    ('terrain-v2', '70aad6bbb91f38537dcd5ca394c43d60a4772045', 'docs/qualification/terrain-composition-20261003.operation-grid.json', ['file_sha256']),
    ('card-containment', 'f65610b25d35489e5c707de6d8f0af201ab0184e', 'docs/qualification/card-containment-20261003-source.json', ['source_files']),
]

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)

def digest(content):
    return hashlib.sha256(content).hexdigest()

def identity(path):
    content = (ROOT/repository_path(path)).read_bytes()
    return {'path': path, 'bytes': len(content), 'sha256': digest(content)}

def repository_path(path):
    if not isinstance(path,str) or not re.fullmatch(r'[A-Za-z0-9_./-]+',path) or any(part in ('','.','..') for part in path.split('/')):
        raise RuntimeError('source path must stay repository relative')
    target = (ROOT/path).resolve()
    if not target.is_relative_to(ROOT.resolve()):
        raise RuntimeError('source path resolves outside repository')
    return path

def historical_source_path(manifest_path, manifest_sha256, source_path):
    path = source_path
    if manifest_path == PATH_MAPPINGS['manifest_path'] and manifest_sha256 == PATH_MAPPINGS['manifest_sha256']:
        path = next((entry['path'] for entry in PATH_MAPPINGS['entries'] if entry['source_path'] == source_path),source_path)
    return repository_path(path)

def main():
    historical, qualified = [], []
    for lane, head, manifest_path, keys in QUALIFIED:
        original_manifest = git('show', f'{head}:{manifest_path}')
        if original_manifest != (ROOT/manifest_path).read_bytes():
            raise RuntimeError('historical manifest changed: '+manifest_path)
        manifest = json.loads(original_manifest)
        qualified.append({'lane':lane,'head':head,'tree':git('rev-parse',head+'^{tree}').decode().strip(),
                          'path':manifest_path,'sha256':digest(original_manifest),'source_keys':keys})
        for key in keys:
            entries = manifest
            for component in key.split('.'):
                entries = entries[component]
            if isinstance(entries, dict):
                entries = [{'path':path,'sha256':sha} for path,sha in entries.items()]
            for entry in entries:
                path, expected = entry['path'], entry['sha256']
                current_path = historical_source_path(manifest_path,digest(original_manifest),path)
                if digest((ROOT/current_path).read_bytes()) == expected:
                    continue
                predecessor = git('show', f'{head}:{current_path}')
                if digest(predecessor) != expected:
                    raise RuntimeError('qualified commit does not match its retained pin: '+path)
                retained = f'docs/qualification/launch-rc-20261003-predecessor/{lane}/{current_path}'
                dest = ROOT/retained
                dest.parent.mkdir(parents=True,exist_ok=True)
                if dest.exists() and dest.read_bytes() != predecessor:
                    raise RuntimeError('refusing to overwrite historical snapshot: '+retained)
                if not dest.exists():
                    dest.write_bytes(predecessor)
                historical.append({'manifest_path':manifest_path,'source_path':path,'path':retained,
                                   'lane':lane,'source_commit':head,'sha256':expected,'bytes':len(predecessor)})

    changed = set(git('diff','--name-only','-z',BASE).decode().split('\0'))
    changed.update(git('ls-files','--others','--exclude-standard','-z').decode().split('\0'))
    changed.discard('');changed.discard(OUTPUT)
    sources = [identity(path) for path in sorted(changed) if (ROOT/path).is_file()]
    manifest = {'contract':'mip-launch-rc-source-v1','date':'2026-10-03',
                'status':'CURRENT_BYTES_BINDING_NOT_A_QUALIFICATION_RECEIPT','live_operations':0,
                'predecessor':{'head':BASE,'tree':git('rev-parse',BASE+'^{tree}').decode().strip()},
                'qualified_manifests':qualified,'qualified_source_path_mappings':PATH_MAPPINGS,'historical_snapshots':historical,'sources':sources,
                'self_hash':'omitted to avoid circular binding; final remote receipt binds this manifest and candidate head/tree',
                'authority':'source integrity only; no historical verdict extends to new integrated source or live/device/release gates'}
    (ROOT/OUTPUT).write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({'sources':len(sources),'historical_snapshots':len(historical),'manifest_sha256':digest((ROOT/OUTPUT).read_bytes())}))


if __name__ == '__main__':
    main()
