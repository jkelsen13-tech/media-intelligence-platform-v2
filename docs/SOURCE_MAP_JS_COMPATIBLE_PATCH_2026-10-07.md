# Compatible source-map-js security patch — 2026-10-07

The build dependency `source-map-js` is upgraded from 1.2.1 to the exact released
1.2.2 patch. This resolves the current indexed source-map denial-of-service
advisory without upgrading PostCSS, Vite, React tooling, or application packages.
The corrected full npm audit reports zero findings.

## Advisory and released fix

[GHSA-68fv-2mgg-jv7q / CVE-2026-93749](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)
affects `source-map-js >=1.0.0 <1.2.2` and identifies 1.2.2 as patched. The reviewed
record was updated on October 5. Large indexed-map section offsets can amplify
synchronous conversion work and block the event loop. This is a dependency
finding, separate from the qik provider and operational-readiness gates.

The maintainer's [1.2.2 release](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2)
explicitly includes the CVE fix. The [upstream repair](https://github.com/7rulnik/source-map-js/commit/cf76580)
validates section offsets, caps accumulated nested line offsets, avoids repeated
empty-line conversion after generated source is exhausted, and makes large
generator gaps less expensive. The release also fixes sorting under browser CSP
that forbids unsafe evaluation.

The [public npm metadata for 1.2.2](https://registry.npmjs.org/source-map-js/1.2.2)
was checked independently of the audit. Registry publication time is
`2026-09-30T14:08:09.382Z`; release `gitHead` is
`0a1d334fd1e55a47df97fcd60a7915d46df3b08a`. The package retains its three public
source-map APIs, no runtime dependencies, `node >=0.10.0`, and BSD-3-Clause license.
Both downloaded release tarballs matched registry SHA-512 integrity and SHA-1.

| Patched artifact | Exact value |
| --- | --- |
| Tarball | `https://registry.npmjs.org/source-map-js/-/source-map-js-1.2.2.tgz` |
| Tarball SHA-256 | `05c8cf8e7c3a6b56cada7668fe9342b10f4b625efc92aba9ba05b9e8fe4d71a3` |
| npm integrity | `sha512-KGj/8Y43x35aZVDtt+J4mK1hoLGHULMYfSkODJNQjNDC3oW1PqPoxMwo0pLUsWM/UEGzON/NxeHywEfNXNP3Vw==` |
| Unmodified LICENSE SHA-256 | `6cb0631f71c7749763fd3dd1d5bee52dd1070ec17f2edc1710079ad070bd2fbd` |

## Bounded dependency change

The starting integration commit is `9d84917dec7fbfd9776533368556ff68b497f7b1`,
tree `95e4b8e6dd298d35357030642522c4503aab6c72`. A separate clean worktree and
branch `codex/mip-qik-source-map-advisory-20261007` were used; the original
integration checkout and frozen source packages were not modified.

`package.json` adds only the exact `source-map-js: 1.2.2` override.
`package-lock.json` changes only that package's version, registry URL and integrity.
PostCSS 8.5.28 already requires `source-map-js ^1.2.1`, so 1.2.2 fits its existing
range. Vite 7.3.6, plugin-react 4.7.0, static-copy 3.4.0, and the existing
Chokidar 4 override remain unchanged. No blind `npm audit fix` or major upgrade
was used.

The lock was generated with `npm install --package-lock-only --ignore-scripts
--no-audit --no-fund`, then dependencies were installed in this worktree with
`npm ci --ignore-scripts --no-audit --no-fund`. Both used only the task cache
`/tmp/mip-qik-source-map-advisory-20261007-npm-cache` and public registry packages.
The installed 1.2.2 directory is local, not a symlink into a frozen checkout;
all 18 installed files equal the integrity-checked 1.2.2 tarball.

The original and patched BSD-3-Clause license bytes are identical. The exact
patched license is archived at
`docs/licenses/build-tools/source-map-js-1.2.2-LICENSE`. No application license
notice or unrelated historical dependency checkpoint needs alteration.

## Reachability

The lock marks source-map-js and PostCSS as development dependencies. PostCSS's
`previous-map.js` and `map-generator.js` instantiate `SourceMapConsumer` from
source-map-js while reading or applying CSS source maps. The affected operation
is therefore reachable in development/build processing when a supplied map
contains hostile indexed offsets. A development dependency label alone does not
remove that processing risk.

The existing application Vite configuration was built on Node 22 and 24 with a
qualification-only plugin recording emitted Rollup module IDs. Each build emitted
six application chunks covering 2,542 modules. Neither source-map-js nor PostCSS
appears in those module IDs. The complete 437-file output, including copied
Cesium assets, contains no `.map` files; Node 22 and 24 outputs are byte-identical.
This supports classifying this finding as a development/build tooling exposure
for the inspected static build. It does not authorize a release or deployment.

## Audit snapshots and qualification

Audit responses are recorded as distinct observations:

| Snapshot | Findings | Evidence SHA-256 |
| --- | --- | --- |
| Original parent integration audit, vulnerable 1.2.1 | Five HIGH nodes through source-map-js, PostCSS, Vite, plugin-react and static-copy; `fixAvailable:false` | `6101519c56ffbc07e7d5eee587c8ddca4e9391e22e6d90427ae777022733f6d4` |
| Fresh worker pre-fix audit, same original lock | One direct HIGH source-map-js finding; `fixAvailable:true` | `5e311cf12ce9e0180008700c349e4df7da48377b6601cffd8aa144a165a4605d` |
| Corrected full audit, patched 1.2.2 | Zero findings at every severity | `1771204320d17cbc46952c5535ef0a43b3eab50da8849205da8c6aaa7494445f` |

The fresh pre-fix file was recorded at `2026-10-07T15:42:25Z`; the corrected audit
at `2026-10-07T15:43:25Z`. Both use Node 24.19.0, npm 11.9.0, the same task cache,
and `npm audit --json --ignore-scripts`. The earlier five-node result is preserved
without claiming it was reproduced by the fresh read. Both pre-fix snapshots
identify the same vulnerable version and advisory. The original lock SHA-256 is
`db79ad5397419116931baaae4ad0dd3aaa14752e990415473aea74189ad18d36`;
the corrected lock SHA-256 is
`7ca4b11b9e5a8f491db3a94b06bfa624b1f30c82a5b2a719cbe1ea336fa05c84`.
The corrected `npm audit --omit=dev --json --ignore-scripts` also reports zero.

Bounded synthetic qualification passed on Node 22.23.3 and 24.19.0:

- The old constructor accepts an oversized indexed offset; the patched
  constructor promptly rejects it, invalid numeric/type offsets, and nested
  accumulated overflow. The expensive old vulnerable conversion was not run.
- Flat, indexed and nested-indexed maps retain matching positions and serialized
  mappings for valid bounded input.
- A valid large offset with exhausted generated text converts without repeated
  empty-line amplification.
- Sorting and generating ordinary mappings preserves the previous output.
- The genuinely installed PostCSS and patched source-map-js generate and consume
  a valid transformed CSS source map.

The two existing build-security and static-copy test files pass all four tests
on each Node version. They retain safe adjacent-map handling, out-of-directory
map refusal, bounded Nano ID behavior, nested copied asset bytes, and local
development asset/watch behavior. Both application builds pass with the existing
chunk-size warning; no application or Vite configuration changes were made.

Exact scripts, audit JSON, installed inventory, command logs and production
module/output inventories are retained in
`/workspace/mip-qik-source-map-advisory-20261007-evidence/` (with original execution
receipts also under the matching `/tmp` directory). No paid service, live qik
operation, provider probe, credential read, global dependency change, push,
CI dispatch, Cursor dispatch, merge, release or deployment was performed.


## Exact bounded compatibility probe

The following is the exact qualification source, also retained separately as
`/workspace/mip-qik-source-map-advisory-20261007-evidence/compatibility.mjs`.
Its SHA-256 is `29162883c8a96febda823e00f2a1b3ac8a1b875f48a9476e3a43b2f43bf29164`. Both Node-version JSON receipts have SHA-256
`7d27b406703f39ad93648ab38a669447bbfb2eaf77bc93dad2afb3889dae2ff8`.

Execution receipt context was the isolated project directory
`/workspace/mip-qik-source-map-advisory-20261007`, with the verified prior tarball
extracted beside the probe as `source-map-js-1.2.1/`. The recorded executor paths
below identify that environment; they are not general portable commands or
application entrypoints:

```text
node /tmp/mip-qik-source-map-advisory-20261007-evidence/compatibility.mjs
/workspace/mip-runtime22/node_modules/node/bin/node /tmp/mip-qik-source-map-advisory-20261007-evidence/compatibility.mjs
```

The probe itself accepts the project directory as its optional argument and
locates the previous tarball beside its own file. It is reproduced in this
review document without adding an executable source or production test adapter
to the application.

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
