import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const harness = fileURLToPath(new URL('../../scripts/qualification/qik-composition-20261012/original_trigger_harness.py', import.meta.url));

test('qualification provenance binds harness checkout and working bytes separately from historical input', () => {
  const run = spawnSync('python3', ['-c', String.raw`
import hashlib, importlib.util, json, os, pathlib, subprocess, sys, tempfile
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('qualification',sys.argv[1])
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

def git(root,*args):
 return subprocess.check_output(['git','-C',str(root),*args],text=True).strip()
with tempfile.TemporaryDirectory(prefix='mip-provenance-') as d:
 root=pathlib.Path(d)/'checkout';root.mkdir()
 git(root,'init','-q')
 source=root/'scripts/harness.py';source.parent.mkdir();source.write_text('first\n')
 git(root,'add','scripts/harness.py')
 git(root,'-c','user.name=Qualification Fixture','-c','user.email=fixture@example.invalid','commit','-qm','first')
 first=git(root,'rev-parse','HEAD');tree=git(root,'rev-parse','HEAD^{tree}')
 # Ambient cwd deliberately points at a DIFFERENT repo with a different HEAD.
 unrelated=pathlib.Path(d)/'ambient';unrelated.mkdir();git(unrelated,'init','-q')
 (unrelated/'other').write_text('unrelated')
 git(unrelated,'add','other')
 git(unrelated,'-c','user.name=Qualification Fixture','-c','user.email=fixture@example.invalid','commit','-qm','ambient')
 os.chdir(unrelated)
 identity=module.checkout_identity(source)
 assert identity=={'root':str(root),'headCommit':first,'committedTree':tree,'parents':[],'dirty':False,'porcelainStatus':[]},identity
 before=module.source_input_manifest([source],root)
 source.write_text('changed working bytes\n')
 (root/'untracked').write_text('not in committed tree')
 dirty=module.checkout_identity(source)
 assert dirty['headCommit']==first and dirty['committedTree']==tree and dirty['dirty']
 assert dirty['porcelainStatus']==subprocess.check_output(['git','-C',str(root),'status','--porcelain=v1','--untracked-files=all'],text=True).rstrip('\n').splitlines()
 assert ' M scripts/harness.py' in dirty['porcelainStatus']
 assert any('scripts/harness.py' in x for x in dirty['porcelainStatus'])
 assert any('?? untracked' in x for x in dirty['porcelainStatus'])
 after=module.source_input_manifest([source],root)
 assert before!=after and after['checkout:scripts/harness.py']['sha256']==hashlib.sha256(source.read_bytes()).hexdigest()
 git(root,'add','scripts/harness.py','untracked')
 staged=module.checkout_identity(source);assert staged['dirty'] and staged['headCommit']==first
 assert 'M  scripts/harness.py' in staged['porcelainStatus']
 git(root,'-c','user.name=Qualification Fixture','-c','user.email=fixture@example.invalid','commit','-qm','second')
 second=module.checkout_identity(source)
 assert second['headCommit']!=first and second['parents']==[first] and not second['dirty']
 assert second['headCommit']!=module.HISTORICAL_COMMIT
 external=pathlib.Path(d)/'external009.sql';external.write_text('external fixture')
 manifest=module.source_input_manifest([source,external],root)
 assert manifest['external:'+str(external)]['bytes']==len(external.read_bytes())
 # A non-Git export fails closed; it cannot silently borrow cwd or historical948.
 exported=pathlib.Path(d)/'exported';exported.mkdir();(exported/'harness.py').write_text('export')
 try:module.checkout_identity(exported/'harness.py');raise AssertionError('non-Git provenance accepted')
 except subprocess.CalledProcessError:pass
 historical=module.HERE/'original009_factual_enforcement.sql'
 assert module.sha(historical)==module.ORIGINAL_SHA
 git_blob=hashlib.sha1(b'blob '+str(len(historical.read_bytes())).encode()+b'\0'+historical.read_bytes()).hexdigest()
 assert git_blob==module.HISTORICAL_BLOB
 print(json.dumps({'nonCwdCheckout':True,'changingHead':True,'dirtyAndStagedBytes':True,
  'untrackedStatus':True,'externalInput':True,'missingGitFailsClosed':True,
  'historicalCommitSeparate':True,'historicalBlobMatches':True}))
`, harness], { encoding: 'utf8', timeout: 30000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const checks = JSON.parse(run.stdout);
  assert.equal(Object.keys(checks).length, 8);
  assert.ok(Object.values(checks).every(value => value === true));
});
