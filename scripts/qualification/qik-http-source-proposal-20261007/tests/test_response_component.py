"""Offline repaired-fork components, with explicit PG/curl adapters and sanitizers.

No old/preimage code is compiled. No extension, HTTP, database, provider telemetry,
trust consumer, ABI, or durable commit qualification is inferred from these checks.
"""
from pathlib import Path
import argparse
import json
import tempfile
from component_support import check_patch, compile_run, function, policy_header, sha256, FLAGS

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--evidence', required=True, type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
out = args.evidence
out.mkdir(parents=True, exist_ok=True)

with tempfile.TemporaryDirectory(prefix='mip-repaired-components-', dir='/tmp') as directory:
    work = Path(directory)
    source, pins = check_patch(root, work)
    callback = function(source, 'http_writeback')
    component = (root / 'tests/response_component.c').read_text()
    assert function(component, 'http_writeback') == callback
    stdout, compiler = compile_run(root, work, 'response_component')
    response_checks = json.loads(stdout)['checksPassed']
    assert response_checks == 10
    response = {
        **pins, 'scope': 'host-native-exact-callback-component-with-PostgreSQL-append-adapter',
        'checksPassed': response_checks, 'exactCallbackSha256': sha256(callback.encode()),
        'componentSourceSha256': sha256(component.encode()), 'bufferCapBytes': 65536,
        'headerAndBodyBuffersSeparate': True,
        'cases': ['at-cap accepted', 'cumulative over-cap refused', 'single oversized refused',
                  'multiplication overflow refused before multiplication', 'zero-size chunk',
                  'invalid prior lengths', 'remaining-byte boundary'],
    }

    start = source.index('\t\t/* Reserve the terminator')
    end = source.index('\n\n\t\t/* Move forward', start)
    block = source[start:end]
    header_component = (root / 'tests/header_component.c').read_text()
    assert block in header_component and header_component.count(block) == 1
    assert '#define RVSZ 8192' in source and '#define RVSZ 8192' in header_component
    stdout, _ = compile_run(root, work, 'header_component')
    header_checks = json.loads(stdout)['checksPassed']
    assert header_checks == 14
    header = {
        **pins, 'scope': 'host-native-exact-guard-copy-component-with-PostgreSQL-error-adapter',
        'checksPassed': header_checks, 'exactExtractedForkBlockSha256': sha256(block.encode()),
        'componentSourceSha256': sha256(header_component.encode()),
        'fullRegexParserExecuted': False,
        'cases': ['8191 field accepted', '8191 value accepted', '8192/8193 field refused',
                  '8192/8193 value refused', 'negative and reversed spans refused',
                  'match beyond input refused', 'invalid cursor/fullmatch refused'],
    }

    extracted, names = policy_header(source)
    (work / 'curl_policy_extracted.h').write_text(extracted)
    policy_component = (root / 'tests/curl_policy_component.c').read_bytes()
    stdout, _ = compile_run(root, work, 'curl_policy_component')
    policy_checks = json.loads(stdout)['checksPassed']
    assert policy_checks == 192
    stdout, _ = compile_run(root, work, 'curl_policy_component',
                            ['-DCOMPONENT_OLD_PROTOCOL_API', '-Wno-deprecated-declarations'])
    legacy_policy_checks = json.loads(stdout)['checksPassed']
    assert legacy_policy_checks == policy_checks
    policy = {
        **pins, 'scope': 'exact-repaired-functions-with-minimal-PostgreSQL-and-curl-adapters',
        'checksPassed': policy_checks, 'legacyProtocolApiChecksPassed': legacy_policy_checks,
        'legacyProtocolApiIsCompileBranchAdapterOnly': True,
        'exactExtractedFunctionsSha256': sha256(extracted.encode()), 'extractedFunctions': names,
        'componentSourceSha256': sha256(policy_component),
        'actualLibcurlExecuted': False, 'actualPostgreSQLExecuted': False,
        'cases': ['POST only', 'HTTPS DNS endpoint shape', 'bounded safe literal path',
                  'CAINFO hash-name namespace', 'bounded exact decimal timeouts',
                  'all removed unsafe option names refused including PROXY_CAINFO',
                  'immutable proxy/TLS/redirect/protocol settings', 'option names only list ABI',
                  'reset and reapply policy', 'embedded NUL refusal', 'header token and control guards',
                  'content-type shares header value guard', 'header count/byte budget',
                  'fixed errors never echo public sentinels', 'curl failures refuse'],
    }

common = {
    'compiler': compiler, 'compileFlags': FLAGS, 'sanitizers': ['address', 'undefined'],
    'nativeExtensionExecuted': False, 'httpExecuted': False, 'databaseExecuted': False,
    'qualifiedReplacement': False, 'oldUnsafeCodeExecuted': False, 'providerPrivacyProven': False,
    'durableCommitProven': False,
}
for filename, receipt in [('bounded-response-component-results.json', response),
                          ('header-bounds-component-results.json', header),
                          ('curl-policy-component-results.json', policy)]:
    receipt.update(common)
    (out / filename).write_text(json.dumps(receipt, indent=2) + '\n')
result = {
    **pins, 'scope': 'offline-repaired-C-components-only',
    'writebackChecksPassed': response_checks, 'headerGuardCopyChecksPassed': header_checks,
    'curlPolicyChecksPassed': policy_checks, 'legacyProtocolApiChecksPassed': legacy_policy_checks,
    'sanitizers': ['address', 'undefined'], 'nativeExtensionExecuted': False,
    'httpExecuted': False, 'databaseExecuted': False, 'oldUnsafeCodeExecuted': False,
    'qualifiedReplacement': False,
}
print(json.dumps(result))
