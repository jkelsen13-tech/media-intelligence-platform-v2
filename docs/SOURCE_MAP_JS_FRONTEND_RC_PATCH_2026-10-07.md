# Frontend RC source-map-js patch — 2026-10-07

This frontend RC pins the compatible `source-map-js` 1.2.2 security patch. The
starting App commit is `06833f99de62877182305eda6fb034800b905f1e`, tree
`fd3a2889251a4ac3e16132b682eef128171cec1c`. Qualification uses this application
and its retained tests, rather than extending a verdict from a different tree.
The fresh corrected full npm audit exits successfully with zero findings.

## Advisory and package artifact

[GHSA-68fv-2mgg-jv7q / CVE-2026-93749](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)
was rechecked on October 7. Its reviewed record was updated October 5, affects
`source-map-js >=1.0.0 <1.2.2`, and identifies 1.2.2 as patched. Unvalidated
indexed source-map section offsets can amplify synchronous conversion work.

The [public npm 1.2.2 metadata](https://registry.npmjs.org/source-map-js/1.2.2)
and release tarball were fetched independently. The bytes match registry
SHA-512 integrity and SHA-1. `gitHead` is
`0a1d334fd1e55a47df97fcd60a7915d46df3b08a`; the package has no runtime
dependencies and retains `node >=0.10.0` and BSD-3-Clause licensing.

| Artifact | Exact value |
| --- | --- |
| Tarball | `https://registry.npmjs.org/source-map-js/-/source-map-js-1.2.2.tgz` |
| Tarball SHA-256 | `05c8cf8e7c3a6b56cada7668fe9342b10f4b625efc92aba9ba05b9e8fe4d71a3` |
| Registry integrity | `sha512-KGj/8Y43x35aZVDtt+J4mK1hoLGHULMYfSkODJNQjNDC3oW1PqPoxMwo0pLUsWM/UEGzON/NxeHywEfNXNP3Vw==` |
| Unmodified LICENSE SHA-256 | `6cb0631f71c7749763fd3dd1d5bee52dd1070ec17f2edc1710079ad070bd2fbd` |
| Corrected package.json SHA-256 | `66a811921b5e2c58da41f08155d60e43e07346c61c61749bc8683f86f19387ac` |
| Corrected package-lock.json SHA-256 | `7ca4b11b9e5a8f491db3a94b06bfa624b1f30c82a5b2a719cbe1ea336fa05c84` |

All 18 installed 1.2.2 files match the integrity-checked release tarball on both
clean installs. The installed directory belongs to this isolated checkout and
is not a symlink into another worktree. The original and patched upstream
LICENSE bytes are identical; the released license is retained unchanged at
`docs/licenses/build-tools/source-map-js-1.2.2-LICENSE`.

## Dependency change and current source binding

`package.json` adds only the exact `source-map-js: 1.2.2` override.
`package-lock.json` changes only the version, resolved registry URL and integrity
in `node_modules/source-map-js`. PostCSS 8.5.28 already requests `^1.2.1`, which
accepts this patch. Vite 7.3.6, plugin-react 4.7.0, static-copy 3.4.0, Nano ID
3.3.18, DOMPurify 3.4.16 and the Chokidar 4.0.3 override retain their installed
versions. Application code, tests, UI, logos and assets retain the App baseline
bytes. No backend or maintenance branch tree is imported.

The unchanged existing builder,
`scripts/buildLaunchRcSourceBinding20261003.py`, preserves historical qualified
manifests and refreshes the current binding in
`docs/MIP_LAUNCH_RC_SOURCE_2026-10-03.json`. Its four additional historical
snapshots retain the original `package.json` and `package-lock.json` in the
`release-dependency/` and `selective-completion-artifact/` lanes under
`docs/qualification/launch-rc-20261003-predecessor/`. Those snapshot bytes were
independently checked against App 068 and their respective qualified commits,
`4cf2b0b33673e3c56979e288c4aed9261fa4f7cd` and
`694aeb4f9635438b4836e0da0194e4d141730edd`:

| Retained original | SHA-256 |
| --- | --- |
| package.json | `70dffb0db54b52489b2450e8ed6d52ad66ef56dc824504a2deeaad5666588dd2` |
| package-lock.json | `db79ad5397419116931baaae4ad0dd3aaa14752e990415473aea74189ad18d36` |

`docs/qualification/release-dependency-20261003-source.json` remains unchanged
at SHA-256 `95b2e752c8b954b7bef7418c2ad8e631b5914847fcbbe29aa3dc63e367e6d63f`.
All 12 qualified manifests and the 16 existing historical snapshots retain
their original bytes. The unchanged builder also includes current hashes for
110 engineering supplement files already tracked in App 068. This metadata
refresh changes no source bytes or historical verdict. The current binding has
status `CURRENT_BYTES_BINDING_NOT_A_QUALIFICATION_RECEIPT`; historical receipts
and verdicts retain their original scope. Its current inventory grows from
254 to 370 entries: two existing package entries change, 110 unchanged App 068
files receive current pins, and six new document/license/snapshot entries are
added. Its historical snapshot inventory grows from 16 to 20.

## Local qualification

Both clean installs used npm 11.9.0 with `npm ci --ignore-scripts --no-audit
--no-fund`, the public registry, and the task-owned cache under the evidence
directory. No global dependencies or other worktree modules were changed.

| Check | Node 22.23.3 | Node 24.19.0 |
| --- | --- | --- |
| Integrity-checked installed source-map-js files | 18/18 match | 18/18 match |
| Bounded source-map compatibility groups | 5 pass | 5 pass |
| Inherited build-tool tests | 4 pass, 0 fail/skip | 4 pass, 0 fail/skip |
| Full App regression suite after binding repair | 2,747 pass, 0 fail/skip/cancel | 2,747 pass, 0 fail/skip/cancel |
| Full configured production build | Pass | Pass |

The bounded compatibility probe checks prompt refusal of malformed, oversized
and nested-overflow indexed offsets; equivalent valid flat, indexed and nested
mapping output; bounded conversion when generated text is exhausted; ordinary
sorting/generation; and installed PostCSS CSS-map generation and consumption.
Only the old constructor is observed for the oversized offset. Its expensive
vulnerable conversion is never executed.

The four inherited tests are in
`tests/security/buildDependencyPatches.test.mjs` and
`tests/qualification/release-dependency-20261003.test.mjs`. They check adjacent
CSS maps and outside-directory refusal, bounded Nano ID cases, nested Cesium
copied paths and bytes, and literal-directory asset serving/watch behavior.

The first Node 22 full-suite attempt produced 2,747 tests, with 2,745 passing and
two failing, and no skips or cancellations. The intended new lock hash failed
an old source binding; the portability fixture failed because its temporary
copy was under `/workspace`, a prefix its guard deliberately denies. The exact
failed log and command receipts are retained with an `initial` suffix. The
existing binding builder preserves the old bytes and binds the new ones;
ordinary self-cleaning `/tmp` fixtures correct the relocation environment.
No test assertions, thresholds, runtime helpers or application code are changed.
The final full suites pass all 2,747 tests on each runtime, with zero failures,
skips, cancellations or TODO cases. The exact test command exits 0 on each
runtime. Their complete logs have these SHA-256 values:

| Final full-suite log | SHA-256 |
| --- | --- |
| Node 22.23.3 | `4deef1c241776e096c9b78fd75def8c1a0c2e6850533b9a12ea3e3d9d238c657` |
| Node 24.19.0 | `b08df29224db954cbaf697b4bb7666b3a90fea47600e20c501b996f60d1b18c9` |

Node 24 uses the spec reporter while Node 22 emits TAP. The initially loaded
evidence parser assumed TAP and failed after storing Node 24's successful test
command receipt. The corrected parser validates the same preserved spec log;
no application test is rerun or changed. This separate evidence-processing
repair is recorded in `node24-summary-parser-repair.json`.

## Build reachability and emitted artifacts

The installed PostCSS `previous-map.js` and `map-generator.js` load
`source-map-js` and construct consumers while processing CSS maps. The development
dependency therefore has actual development/build reachability.

Each configured App production build records 10 chunks containing 7,106 Rollup
module entries. Neither source-map-js nor PostCSS is bundled. Both Node versions
emit the same 442 files (23,634,316 bytes), including the existing Cesium static
assets and application bundle graph, with no `.map` files. The output lists are
byte-identical across Node versions. The SHA-256 of the compact sorted list of
relative file paths, byte counts and per-file SHA-256 values is
`0c729a8cbbe238aacb6f057ea5d238073abf676e2814cbdc288efa893dd889ff`.
The existing large-chunk warning remains. There is no before/after baseline
build comparison claim.

The qualification build calls Vite's full `build()` API with the unchanged App
configuration. It adds a reporting-only module observer and directs output to
the evidence directory; it does not alter the runtime graph or Vite source.
The exact observer is reproduced below for review.

## Actual audit observations and evidence

| Snapshot | Runtime / npm | Exit | Findings | JSON SHA-256 |
| --- | --- | --- | --- | --- |
| App original 1.2.1 lock, 2026-10-07T17:56:44Z | 24.19.0 / 11.9.0 | 1 | One HIGH source-map-js | `5e311cf12ce9e0180008700c349e4df7da48377b6601cffd8aa144a165a4605d` |
| App corrected 1.2.2 lock, 2026-10-07T18:09:52Z | 24.19.0 / 11.9.0 | 0 | Zero at all severities | `1771204320d17cbc46952c5535ef0a43b3eab50da8849205da8c6aaa7494445f` |

The corrected result comes from actual `npm audit --json --ignore-scripts`
with the patched lock. Its JSON has an empty vulnerabilities object and
`metadata.vulnerabilities.total: 0`; a successful exit is required.

Evidence is retained at
`/workspace/mip-frontend-source-map-patch-20261007-evidence/`, including exact
commands, runtime versions, initial and final test logs, registry and tarball
verification, installed inventories, audit JSON, build module/output inventories
and the local commit/tree receipt. Repository source work remains on isolated
branch `codex/mip-frontend-source-map-patch-20261007`.

This local qualification does not supply the final exact-commit remote CI or
independent review verdict. Native attachment, live provider, installation,
release and deployment gates retain their existing boundaries. No merge,
deployment, PR, provider operation, paid service or credential use is performed.

## Exact bounded compatibility probe

Probe SHA-256: `29162883c8a96febda823e00f2a1b3ac8a1b875f48a9476e3a43b2f43bf29164`.
Both runtime JSON result files have SHA-256
`7d27b406703f39ad93648ab38a669447bbfb2eaf77bc93dad2afb3889dae2ff8`.
The preserved 1.2.1 tarball SHA-256 is
`f126a6f9fca487a43219d8cb8c3a955279187a966119d548eb5cd47e999d4853`.
Extract that verified package beside this probe as `source-map-js-1.2.1/`.
Run the probe from this checkout, passing its project directory as the argument.
This is qualification-only source, not an application entrypoint.

```javascript
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const projectRoot = resolve(process.argv[2] || process.cwd());
const evidenceRoot = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(projectRoot, 'package.json'));
const patched = require('source-map-js');
const previous = require(join(evidenceRoot, 'source-map-js-1.2.1/source-map.js'));
const postcss = require('postcss');
assert.equal(require('source-map-js/package.json').version, '1.2.2');
assert.deepEqual(Object.keys(patched).sort(), Object.keys(previous).sort());
const checks = [];
const flat = { version: 3, sources: ['input.js'], names: [], sourcesContent: ['let x=1;'], mappings: 'AAAA' };
const indexed = (line=0,column=0,map=flat) => ({ version: 3, sections: [{ offset: { line, column }, map }] });
const start = performance.now();
// Constructor-only observation on 1.2.1; do not execute its expensive conversion.
assert.doesNotThrow(() => new previous.SourceMapConsumer(indexed(1e7+1)));
assert.throws(() => new patched.SourceMapConsumer(indexed(1e7+1)), /must not exceed/);
assert.throws(() => new patched.SourceMapConsumer(indexed(6e6,0,indexed(6e6))), /including offsets of nested sections/);
for (const value of [-1, 1.5, NaN, Infinity, -Infinity, 9007199254740992, '1', null, undefined, {}]) {
  for (const field of ['line','column']) {
    const offset = { line: 0, column: 0 }; offset[field] = value;
    assert.throws(() => new patched.SourceMapConsumer({ version: 3, sections: [{ offset, map: flat }] }), /non-negative integers/);
  }
}
assert.ok(performance.now()-start < 1000, 'invalid indexed maps are refused promptly');
checks.push('old constructor accepts oversized indexed offset; patched constructor promptly rejects oversized/invalid/nested-overflow offsets without running old DoS conversion');
for (const sample of [flat,indexed(2,3),indexed(2,3,indexed(1,1))]) {
  const before = new previous.SourceMapConsumer(sample), after = new patched.SourceMapConsumer(sample);
  for (let line=1;line<7;line++) for (let column=0;column<8;column++) {
    assert.deepEqual(after.originalPositionFor({line,column}),before.originalPositionFor({line,column}));
  }
  const serialize = (api,consumer) => {
    const generator = new api.SourceMapGenerator();
    consumer.eachMapping(m => generator.addMapping({generated:{line:m.generatedLine,column:m.generatedColumn},original:{line:m.originalLine,column:m.originalColumn},source:m.source,name:m.name}));
    for(const source of consumer.sources)generator.setSourceContent(source,consumer.sourceContentFor(source));
    return generator.toJSON();
  };
  assert.deepEqual(serialize(patched,after),serialize(previous,before));
}
checks.push('normal flat, indexed and nested-indexed mappings retain identical positions and serialized maps');
const large = new patched.SourceMapConsumer(indexed(1e7));
const node = patched.SourceNode.fromStringWithSourceMap('x;', large);
assert.equal(node.toString(),'x;');
checks.push('valid large offset with exhausted source text converts without per-line amplification');
for (const api of [previous,patched]) {
  const generated = new api.SourceMapGenerator({file:'out.js'});
  for (let line=20;line>0;line--) generated.addMapping({generated:{line,column:line%4},original:{line:line+1,column:0},source:'input.js'});
  generated.setSourceContent('input.js','let x=1;');
  if (api===previous) globalThis.normalMap=generated.toJSON();
  else assert.deepEqual(generated.toJSON(),globalThis.normalMap);
}
checks.push('unsorted valid mappings preserve generator output after quick-sort CSP repair');
const processed = await postcss([{postcssPlugin:'bounded-qualification',Declaration(decl){if(decl.prop==='color')decl.value='blue';}}]).process('a { color: red }',{from:'input.css',to:'output.css',map:{inline:false,annotation:false,sourcesContent:true}});
assert.equal(processed.css,'a { color: blue }');
assert.ok(processed.map);
const cssMap = new patched.SourceMapConsumer(processed.map.toJSON());
assert.ok(cssMap.sources.some(source=>source.endsWith('input.css')));
assert.ok(cssMap.originalPositionFor({line:1,column:0}).source.endsWith('input.css'));
checks.push('installed PostCSS 8.5.28 generates and consumes a valid CSS map using installed patched source-map-js');
console.log(JSON.stringify({scope:'BOUNDED SYNTHETIC SOURCE-MAP COMPATIBILITY ONLY',installedVersion:'1.2.2',checkGroups:checks.length,checks},null,2));
```

## Exact full-build observer

Execute this evidence-only observer with each Node runtime and the isolated
project directory argument. Source configuration and plugins are imported from
that directory. Emitted files and module inventories stay beside the observer.

```javascript
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = resolve(process.argv[2]);
const evidenceRoot = dirname(fileURLToPath(import.meta.url));
const require = createRequire(root + '/package.json');
const { build } = await import(pathToFileURL(require.resolve('vite')).href);
const { default: config } = await import(pathToFileURL(root + '/vite.config.js').href);
const tag = process.versions.node.startsWith('22.') ? 'node22' : 'node24';
let inventory;
await build({ ...config, configFile: false, root,
  build: { ...config.build, outDir: evidenceRoot + '/dist-' + tag },
  plugins: [ ...config.plugins, { name: 'qualification-only-module-inventory',
    generateBundle(_options, bundle) {
      inventory = { runtime: process.version,
        installedSourceMapJsVersion: require('source-map-js/package.json').version,
        installedSourceMapJsRealPath: require.resolve('source-map-js'),
        chunks: Object.values(bundle).filter(x => x.type === 'chunk')
          .map(x => ({ fileName: x.fileName, moduleIds: Object.keys(x.modules) })) };
    }
  } ] });
const modules = inventory.chunks.flatMap(x => x.moduleIds);
inventory.sourceMapJsBundled = modules.some(x => /node_modules[/]source-map-js[/]/.test(x));
inventory.postcssBundled = modules.some(x => /node_modules[/]postcss[/]/.test(x));
await writeFile(evidenceRoot + '/production-module-inventory-' + tag + '.json', JSON.stringify(inventory, null, 2) + '\n');
assert.equal(inventory.installedSourceMapJsVersion, '1.2.2');
assert.equal(inventory.sourceMapJsBundled, false);
assert.equal(inventory.postcssBundled, false);
console.log(JSON.stringify({ runtime: process.version,
  installedSourceMapJsVersion: inventory.installedSourceMapJsVersion,
  chunkCount: inventory.chunks.length, moduleCount: modules.length,
  sourceMapJsBundled: false, postcssBundled: false }));
```
