#!/usr/bin/env python3
"""Explicit bounded local qualification; no provider or production authority.

Build the complete pinned stock and reviewed fork as genuine PostgreSQL http
extensions. Run only synthetic network-none Docker HTTPS/HTTP fixtures. This
script never installs host trust or edits its input PG prefix or frozen source.
"""
import argparse
import difflib
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import tempfile

IMAGE = 'postgres@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826'
PIN = '5e2bd270a9ce2b0e8e1fdf8e46b85396bd4125cd'
BASELINE = '2082cadc2e31ada55db1ea06759c0e05cbef6847127b9c0df85eb395abfb4741'
STOCK_SHA = 'c5eab6bdf52a66c40bab1f6ad265303ef2a815a527e4f76f768192d34249e2c1'
NODE = '/workspace/mip-qik-http-adapter-20261012-evidence/tooling/node-v24.21.0-linux-x64/bin/node'

def digest(p):
    return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()

def run(args, timeout=45):
    p = subprocess.run([str(x) for x in args], capture_output=True, text=True, timeout=timeout)
    if p.returncode:
        raise RuntimeError(p.stderr[-4000:] or p.stdout[-4000:])
    return p.stdout.strip()

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--pg-prefix', required=True)
    p.add_argument('--evidence', required=True)
    p.add_argument('--node-path', default=NODE)
    p.add_argument('--sanitize', action='store_true')
    a = p.parse_args()
    prefix, evidence, node = [pathlib.Path(x).resolve() for x in [a.pg_prefix, a.evidence, a.node_path]]
    for path in [prefix, evidence.parent, node]:
        if not str(path).startswith('/workspace/') or path.stat().st_uid != os.getuid():
            raise SystemExit('user-owned /workspace inputs and evidence required')
    evidence.mkdir(parents=True, exist_ok=True)
    here = pathlib.Path(__file__).resolve().parent
    shutil.copy2(__file__, evidence/'transport_failure_harness.py')
    shutil.copy2(here/'transport_fixture.mjs', evidence/'transport_fixture.mjs')
    srcroot = here.parent / 'qik-http-source-proposal-20261007'
    receipt = dict(status='FAILED', scope='SYNTHETIC_NETWORK_NONE_ACTUAL_STOCK_FORK_HTTP',
                   productionAuthorized=False, providerQualified=False, durableCommitQualified=False,
                   qikExecuted=False, liveReady=False, actualHttpExecuted=False,
                   curlForkHttpExecuted=False, curlStockHttpExecuted=False,
                   hold='PROVIDER_SERVER_DBLINK_VERIFY_FULL_HOLD', checks={}, total=0,
                   stockCommit=PIN, image=IMAGE, harnessSha256=digest(__file__),
                   fixtureSha256=digest(here / 'transport_fixture.mjs'))
    receipt['sanitizers'] = a.sanitize
    container = None
    try:
        with tempfile.TemporaryDirectory(prefix='mip-transport-', dir='/tmp') as temp:
            stage = pathlib.Path(temp)
            pg = stage / 'pg'; shutil.copytree(prefix, pg)
            libs = stage / 'lib'; libs.mkdir()
            fixture = stage / 'fixture'; fixture.mkdir()
            trust = stage / 'trust'; trust.mkdir()
            public = 'https://raw.githubusercontent.com/pramsey/pgsql-http/' + PIN + '/http.c'
            source = (here/'stock-http-v1.6.1.c').read_bytes()
            assert hashlib.sha256(source).hexdigest() == STOCK_SHA
            (evidence / 'stock-http-v1.6.1.c').write_bytes(source)
            receipt.update(stockSourceUrl=public, stockSourceSha256=hashlib.sha256(source).hexdigest(),
                           stockSourceCustody='Vendored exact hash-pinned bytes; source URL identifies the declared upstream commit; this run does not fetch upstream.',
                           stockSqlSha256=digest(here/'stock-http--1.6.sql'))
            assert receipt['stockSqlSha256']=='96873193304e4c0adf288c219d7ae75bb6d64ac5d24b8e457a35c61e04ef3c48'
            shutil.copy2(here/'stock-http--1.6.sql', evidence/'stock-http--1.6.sql')
            fork = (srcroot / 'src/http-bounded-response.c').read_bytes()
            assert hashlib.sha256(fork).hexdigest() == BASELINE
            import sys
            sys.dont_write_bytecode = True
            sys.path.insert(0, str(srcroot / 'tests'))
            from component_support import function
            original = fork.decode(); strict = original
            strict = strict.replace(function(strict, 'header_string_to_array'),
                                    (here.parent / 'qik-architecture-20261012/strict_header_parser.c').read_text().strip())
            strict = strict.replace(function(strict, 'string_info_remove_cr'), '')
            strict = strict.replace('\t\tstring_info_remove_cr(&si_headers);',
                                    '\t\t/* Strict candidate parses original bytes without normalization. */')
            strict = strict.replace('\t\t/* Strip the carriage-returns, because who cares? */',
                                    '\t\t/* Admit only the bounded single-block response grammar. */')
            (evidence / 'strict-candidate-full-fork.c').write_text(strict)
            (evidence / 'strict-candidate.patch').write_text(''.join(difflib.unified_diff(
                original.splitlines(keepends=True), strict.splitlines(keepends=True),
                fromfile='a/http-bounded-response.c', tofile='b/http-bounded-response.c')))
            receipt.update(baselineForkSha256=BASELINE, forkSha256=hashlib.sha256(strict.encode()).hexdigest(),
                           strictParserSubstitutionOnly=True, postgres=run([prefix/'bin/postgres', '--version']),
                           node=run([node, '--version']), compiler=run(['gcc', '--version']).splitlines()[0])
            include = run([prefix/'bin/pg_config', '--includedir-server'])
            identity = '\nPG_FUNCTION_INFO_V1(mip_curl_identity);\nDatum mip_curl_identity(PG_FUNCTION_ARGS) {PG_RETURN_TEXT_P(cstring_to_text(curl_version()));}\n'
            for lane, data in [('stock', source), ('fork', strict.encode())]:
                c = stage / (lane+'.c'); c.write_bytes(data+identity.encode())
                so = pg/'lib/postgresql'/('transport_'+lane+'.so')
                flags = ['-fsanitize=address,undefined','-fno-sanitize-recover=all','-fno-omit-frame-pointer'] if a.sanitize else []
                receipt['compilerFlags']=['-shared','-fPIC','-O1','-g','-Wall','-Wextra',*flags]
                run(['gcc', '-shared', '-fPIC', '-O1', '-g', '-Wall', '-Wextra', *flags, '-I'+include,
                     '-I'+str(prefix/'include'), c, '-lcurl', '-o', so])
                receipt[lane+'TranslationUnitSha256'] = digest(c)
                receipt[lane+'BinarySha256'] = digest(so)
                receipt[lane+'ElfNeeded']=re.findall(r'Shared library: \[([^\]]+)\]',run(['readelf','-d',so]))
                ext = pg/'share/postgresql/extension'
                (ext/('http--transport_'+lane+'.sql')).write_text(extension_sql(lane))
                (evidence/('http--transport_'+lane+'.sql')).write_text(extension_sql(lane))
            (pg/'share/postgresql/extension/http.control').write_text("default_version = 'transport_stock'\nrelocatable = true\n")
            # Exact observed host dependency closure, including its own loader.
            dependencies = set()
            for binary in [node, *[pg/'bin'/n for n in ['postgres', 'initdb', 'pg_ctl', 'psql']],
                           pg/'lib/postgresql/transport_stock.so', pg/'lib/postgresql/transport_fork.so']:
                output = run(['ldd', binary])
                dependencies.update(re.findall(r'(?:=>\s+)?(/[^\s]+)', output))
            for dep in dependencies:
                shutil.copy2(dep, libs/pathlib.Path(dep).name, follow_symlinks=True)
            receipt['dependencySha256'] = {x.name:digest(x) for x in sorted(libs.iterdir())}
            shutil.copy2(node, stage/'node')
            receipt['nodeBinarySha256']=digest(stage/'node')
            receipt['postgresBinarySha256']=digest(pg/'bin/postgres')
            shutil.copy2(here/'transport_fixture.mjs', fixture/'run.mjs')
            for label in ['ca', 'other']:
                run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2',
                     '-subj', '/CN=MIP synthetic '+label, '-keyout', fixture/(label+'.key'), '-out', fixture/(label+'.pem')])
            for label, ca in [('server','ca'), ('untrusted','other')]:
                run(['openssl', 'req', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=audit.receiver.test',
                     '-keyout', fixture/(label+'.key'), '-out', fixture/(label+'.csr')])
                (fixture/'san.ext').write_text('subjectAltName=DNS:audit.receiver.test,DNS:other.receiver.test,DNS:untrusted.receiver.test\n')
                run(['openssl','x509','-req','-in',fixture/(label+'.csr'),'-CA',fixture/(ca+'.pem'),
                     '-CAkey',fixture/(ca+'.key'),'-CAcreateserial','-days','2','-extfile',fixture/'san.ext',
                     '-out',fixture/(label+'.pem')])
            ca_hash = digest(fixture/'ca.pem'); shutil.copy2(fixture/'ca.pem', trust/(ca_hash+'.pem'))
            receipt['syntheticCaSha256'] = ca_hash
            (fixture/'config.json').write_text(json.dumps({'ca':'/mip/trust/'+ca_hash+'.pem','sanitize':a.sanitize}))
            (fixture/'passwd').write_text('root:x:0:0:root:/root:/bin/sh\nfixture:x:'+str(os.getuid())+':'+str(os.getgid())+':synthetic fixture:/tmp:/bin/sh\n')
            (fixture/'group').write_text('root:x:0:\nfixture:x:'+str(os.getgid())+':\n')
            container = 'mip-transport-'+os.urandom(6).hex()
            args = ['docker','create','--name',container,'--pull=never','--network=none','--read-only',
                    '--user',str(os.getuid())+':'+str(os.getgid()),'--cap-drop','ALL','--security-opt','no-new-privileges',
                    '--memory','768m','--cpus','2','--pids-limit','96','--tmpfs','/tmp:rw,nosuid,nodev,size=256m,mode=1777',
                    '--tmpfs','/var/lib/postgresql/data:rw,nosuid,nodev,size=1m,mode=700',
                    '-e','LD_LIBRARY_PATH=/runtime/lib','-e','PATH=/runtime/pg/bin:/usr/bin:/bin','-e','LANG=C',
                    '-v',str(stage)+':/runtime:ro','-v',str(trust)+':/mip/trust:ro',
                    '-v',str(fixture/'passwd')+':/etc/passwd:ro','-v',str(fixture/'group')+':/etc/group:ro',
                    '-v',str(libs/'ld-linux-x86-64.so.2')+':/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2:ro']
            for name in ['audit.receiver.test','other.receiver.test','wrong.receiver.test','untrusted.receiver.test']:
                args += ['--add-host',name+':127.0.0.1']
            args += ['--entrypoint','/runtime/node',IMAGE,'/runtime/fixture/run.mjs']
            run(args)
            cfg = json.loads(run(['docker','inspect',container]))[0]
            receipt['actualImageId']=cfg['Image']
            assert cfg['Image']=='sha256:589f742565e4f6d22149176b032974f55f8201a8a37b71ed587ec5c6902e689f'
            assert cfg['HostConfig']['NetworkMode']=='none'
            assert cfg['HostConfig']['ReadonlyRootfs'] and not cfg['HostConfig']['Privileged']
            assert not cfg['HostConfig']['PortBindings']
            assert all(not m['RW'] for m in cfg['Mounts'] if m['Type']=='bind')
            assert all(m['Type'] in ['bind','tmpfs'] for m in cfg['Mounts'])
            receipt['isolation'] = {'network':'none','readonlyRoot':True,'unprivilegedUser':cfg['Config']['User'],
                                    'capDrop':cfg['HostConfig']['CapDrop'],'memoryBytes':cfg['HostConfig']['Memory'],
                                    'nanoCpus':cfg['HostConfig']['NanoCpus'],'pids':cfg['HostConfig']['PidsLimit'],
                                    'noPublishedPorts':True,'allHostMountsReadOnly':True}
            output = run(['docker','start','-a',container], timeout=180)
            result = json.loads(output.splitlines()[-1])
            receipt.update(result)
            (evidence/'transport-wire-receipts.json').write_text(json.dumps(result.get('wire',[]),indent=2)+'\n')
            receipt.pop('wire',None)
            if not receipt.get('allChecksPassed'):
                raise RuntimeError('one or more bounded fixture checks failed')
            receipt['status']='PASSED_LOCAL_SYNTHETIC_TRANSPORT'
    except Exception as err:
        receipt['failure']=str(err)[-4000:]
        if container:
            try:
                receipt['failedContainerLogs']=run(['docker','logs',container])[-8000:]
            except Exception:
                pass
    finally:
        if container:
            try:
                run(['docker','rm','-f',container]); receipt['ownedContainerRemoved']=True
            except Exception as err:
                receipt.update(status='FAILED',cleanupFailure=str(err))
        receipt['privateTlsFixturesRemoved']=not container or receipt.get('ownedContainerRemoved',False)
        receipt['receiptShaScope']='Receipt excludes private keys; all authentication markers are dummy synthetic strings.'
        (evidence/'transport-failure-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps(receipt,sort_keys=True))
    return 0 if receipt['status']=='PASSED_LOCAL_SYNTHETIC_TRANSPORT' else 1

def extension_sql(lane):
    return """
CREATE DOMAIN http_method AS text;
CREATE DOMAIN content_type AS text CHECK (VALUE ~ '^\\S+\\/\\S+');
CREATE TYPE http_header AS (field varchar,value varchar);
CREATE TYPE http_request AS (method http_method,uri varchar,headers http_header[],content_type varchar,content varchar);
CREATE TYPE http_response AS (status integer,content_type varchar,headers http_header[],content varchar);
CREATE FUNCTION http(http_request) RETURNS http_response AS '/runtime/pg/lib/postgresql/transport_%s.so','http_request' LANGUAGE C STRICT;
CREATE FUNCTION http_set_curlopt(text,text) RETURNS boolean AS '/runtime/pg/lib/postgresql/transport_%s.so','http_set_curlopt' LANGUAGE C STRICT;
CREATE FUNCTION http_reset_curlopt() RETURNS boolean AS '/runtime/pg/lib/postgresql/transport_%s.so','http_reset_curlopt' LANGUAGE C;
CREATE FUNCTION http_list_curlopt() RETURNS TABLE(curlopt text,value text) AS '/runtime/pg/lib/postgresql/transport_%s.so','http_list_curlopt' LANGUAGE C;
CREATE FUNCTION mip_curl_identity() RETURNS text AS '/runtime/pg/lib/postgresql/transport_%s.so','mip_curl_identity' LANGUAGE C;
""" % ((lane,)*5)

if __name__=='__main__':
    raise SystemExit(main())
