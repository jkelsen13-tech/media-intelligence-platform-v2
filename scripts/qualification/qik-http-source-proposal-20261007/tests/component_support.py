"""Extract only the repaired fork for offline, explicit-adapter C components."""
from pathlib import Path
import difflib
import hashlib
import shutil
import subprocess

UPSTREAM_SHA256 = '20f27b859c1ed7bae3eb35e01db17a6855ff428dbcf1192d1c504a71e5d51d03'
LICENSE_SHA256 = '115c0f245f92e1a6a486407e9a08301c65d724209c35dcae4df2836dac9128a8'
FLAGS = ['-std=c11', '-Wall', '-Wextra', '-Werror', '-fsanitize=address,undefined',
         '-fno-omit-frame-pointer', '-fno-pie', '-no-pie', '-O1']


def sha256(value):
    return hashlib.sha256(value).hexdigest()


def function(source, name):
    """Functions in this source use a closing brace on its own, unindented line."""
    marker = '\n' + name + '('
    if marker in source:
        start = source.rfind('\n', 0, source.index(marker)) + 1
    else:
        # SQL-callable entrypoints put their return type and name on one line.
        marker = 'Datum ' + name + '(PG_FUNCTION_ARGS)\n{'
        start = source.index(marker)
    end = source.index('\n}\n', start) + 3
    return source[start:end]


def check_patch(root, work):
    old = (root / 'src/upstream-http-v1.6.3.c').read_bytes()
    new = (root / 'src/http-bounded-response.c').read_bytes()
    assert sha256(old) == UPSTREAM_SHA256, 'immutable upstream preimage changed'
    assert sha256((root / 'src/LICENSE.pgsql-http.md').read_bytes()) == LICENSE_SHA256
    patch = ''.join(difflib.unified_diff(
        old.decode().splitlines(keepends=True), new.decode().splitlines(keepends=True),
        fromfile='a/http.c', tofile='b/http.c'))
    assert (root / 'src/pgsql-http-bounded-response.patch').read_text() == patch
    target = work / 'http.c'
    target.write_bytes(old)
    tool = shutil.which('patch')
    assert tool, 'qualification requires patch; refusing to silently skip'
    subprocess.run([tool, '--silent', '-p1', '-i', str(root / 'src/pgsql-http-bounded-response.patch')],
                   cwd=work, check=True, capture_output=True)
    assert target.read_bytes() == new, 'patch does not reproduce the fork exactly'
    return new.decode(), {'forkSha256': sha256(new), 'patchSha256': sha256(patch.encode()),
                         'upstreamSha256': sha256(old), 'patchAppliesExactly': True}


def policy_header(source):
    constants = '\n'.join(line for line in source.splitlines()
                          if (line.startswith('#define HTTP_') and 'MAX_' in line)
                          or line.startswith('#define CURL_MIN_VERSION '))
    methods_start = source.index('typedef enum {\n\tHTTP_GET,')
    methods_end = source.index('} http_method;', methods_start) + len('} http_method;')
    options_start = source.index('typedef enum {\n\tCURLOPT_STRING,')
    options_end = source.index('\n};', source.index('static http_curlopt settable_curlopts[]', options_start)) + 3
    names = ['http_error', 'request_type', 'http_text_to_cstring', 'http_ascii_alnum',
             'http_request_header_valid', 'http_optional_header_allowed',
             'http_append_request_header', 'http_uri_allowed', 'http_cainfo_allowed',
             'http_curlopt_value_valid', 'http_apply_transport_policy',
             'http_check_curl_version', 'set_curlopt', 'http_get_handle',
             'http_reset_curlopt', 'http_list_curlopt', 'http_set_curlopt']
    result = constants + '\n' + source[methods_start:methods_end] + '\n' + source[options_start:options_end]
    result += '\nstatic CURL *g_http_handle = NULL;\n'
    result += '\n'.join(function(source, name) for name in names)
    return result + '\n', names


def compile_run(root, work, name, extra_flags=()):
    compiler = shutil.which('gcc')
    assert compiler, 'qualification requires gcc and ASan/UBSan; refusing to silently skip'
    executable = work / name
    command = [compiler, *FLAGS, *extra_flags, '-I', str(work),
               str(root / 'tests' / (name + '.c')), '-o', str(executable)]
    build = subprocess.run(command, capture_output=True, text=True)
    assert build.returncode == 0, build.stderr
    # No HTTP or PostgreSQL library is linked. Adapter stubs cannot perform I/O.
    run = subprocess.run([str(executable)], capture_output=True, text=True,
                         env={'PATH': '/usr/bin:/bin', 'ASAN_OPTIONS': 'detect_leaks=1:halt_on_error=1',
                              'UBSAN_OPTIONS': 'halt_on_error=1:print_stacktrace=1'})
    assert run.returncode == 0, run.stderr
    return run.stdout, subprocess.run([compiler, '--version'], capture_output=True,
                                      check=True, text=True).stdout.splitlines()[0]
