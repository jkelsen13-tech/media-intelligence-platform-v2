# Qik source dependency advisory qualification — 2026-10-03

The isolated source repair removes the newly reported vulnerable `braces` dependency. The fresh full npm audit reports **0 vulnerabilities**. The production build, 1,789 tests, and the existing bundle isolation verifier pass on Node 24.19.0 / npm 11.9.0. This is source qualification; no merge, deployment, release, account operation, or database connection was performed.

## Exact starting point and scope

- Parent source: `0ddbed3319989d98788045a35cdc508e43ce902e`, tree `9b1d07e1ddec01d3d80414a30c31afbb90f976a2`.
- Isolated branch: `codex/mip-qik-new-dependency-advisory-20261003`.
- Worktree: `/workspace/mip-qik-new-dependency-advisory`.
- Receipt directory: `/workspace/mip-launch-receipts/qik-private-client-source/new-advisory`.
- Tracked changes: `package.json`, `package-lock.json`, `vite.config.js`, this report, and `tests/qualification/qik-new-dependency-advisory-20261003.test.mjs`.

The implementation worker did not edit the integration worktree or frozen `675654b` / `ca72a6d` source and lock files. The parent subsequently integrates this scoped repair into the original backend successor. Historical zero-audit receipts describe the advisory database available when those receipts were taken; they do not negate the newly observed advisory (published September18 and updated October2, 2026).

## Upstream facts and installed reachability

[GHSA-vfj7-8cjw-p6xm / CVE-2026-93687](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) lists `braces <=3.0.3` as affected and lists no patched version. Deeply nested brace patterns can exhaust recursive AST walkers and terminate a Node process. The [upstream issue](https://github.com/micromatch/braces/issues/70) identifies the compile and expansion paths.

Fresh registry reads on 2026-10-03 show `braces` latest `3.0.3` and `vite-plugin-static-copy` latest `4.1.1`; even that latest plugin retains `chokidar ^3.6.0`. Registry receipts are `registry-braces.json`, `registry-static-copy.json`, `registry-chokidar.json`, and `registry-chokidar4.json`. The [maintainer package manifest](https://raw.githubusercontent.com/sapphi-red/vite-plugin-static-copy/main/package.json) also retains the Chokidar 3 dependency.

At the starting lock, the only installed chain is the development dependency `vite-plugin-static-copy@3.4.0 → chokidar@3.6.0 → braces@3.0.3`. Vite itself does not depend on this external Chokidar 3 installation. The plugin imports Chokidar at configuration load and creates its watcher in its `apply: 'serve'` plugin. Its build plugin uses `tinyglobby` and filesystem copying rather than the Chokidar watcher. These installed upstream artifacts are preserved as `installed-static-copy-index.js` and `installed-static-copy-index.d.ts` for review.

MIP supplies four fixed, brace-free Cesium directory globs from `vite.config.js`. No application user pattern is passed to this watcher. In Chokidar 3, the `braces.expand()` call is conditional on the configured glob containing `{`; these four configured inputs do not contain that character. The stack-exhaustion sink therefore has no identified attacker-controlled input through this MIP configuration. The affected package is nevertheless installed and audited, so the repair removes it instead of accepting or suppressing the finding. This tooling chain is absent from the browser application module graph.

`baseline-audit.json` records three HIGH affected dependency nodes, all for this one advisory. At this observation npm offered a semver-major downgrade to static-copy `0.2.0`; the earlier parent observation reported `fixAvailable: false`. Neither receipt was rewritten, and that old-plugin downgrade was not used.

## Repair and compatibility boundary

The root package uses npm's [documented scoped override](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#overrides) to select `chokidar@4.0.3` only below `vite-plugin-static-copy@3.4.0`. Chokidar 4 depends only on `readdirp`; the lock changes Chokidar `3.6.0 → 4.0.3`, changes readdirp `3.6.0 → 4.1.2`, and removes twelve obsolete packages, including `braces`. Every unrelated locked package record is unchanged (`lock-delta.json`).

[Chokidar 4's migration instructions](https://github.com/paulmillr/chokidar/blob/4.0.3/README.md#upgrading) replace recursive directory globs with literal directory inputs because version 4 removed glob support. Accordingly, MIP now supplies the four literal `Workers`, `ThirdParty`, `Assets`, and `Widgets` directories to the existing static-copy plugin and uses `dest: 'cesium'`. The [plugin's path input contract](https://github.com/sapphi-red/vite-plugin-static-copy) and installed copy implementation support directory trees. Copying each directory preserves its name and all nested paths beneath the same deployment base.

This is a tested, application-specific compatibility override outside the plugin's declared Chokidar 3 range. It is not an upstream claim that every plugin configuration supports Chokidar 4. The override is tied to plugin version `3.4.0`; a later plugin upgrade must requalify or retire it. No audit ignore, advisory suppression, severity threshold change, or custom parser was added.

## Asset output differences and URL qualification

The new output contains exactly the **389 canonical package files**, all with matching SHA-256 bytes: Workers 110, ThirdParty 7, Assets 205, Widgets 67. `cesium-asset-parity.json` enumerates the canonical paths and hashes. All non-Cesium emitted build files are byte-identical to an old-glob-configuration reference build. That reference used the same static-copy `3.4.0` implementation with the repaired installation; its build hook does not execute Chokidar.

This is **not** byte parity with all 892 files in the old configuration's output:

- The old recursive globs copied directories and also copied their nested children again at shorter paths. The new directory inputs remove **503 flattened aliases**. Every removed alias had bytes matching a retained canonical package file. `asset-url-references-and-removed-aliases.json` explicitly enumerates all 503 removed paths and their previous hashes.
- The old copy overwrote canonical `Widgets/lighter.css` with `Widgets/Timeline/lighter.css`. Its previous SHA-256 was `454d14e1ad03bb6cef04b7250c159922815b1607363d965a11e9869b0ef8a3c1`. The repaired file matches package `Widgets/lighter.css`, SHA-256 `92e9b28deeb10aa256c7227c85bf79946a6ce1def3cbc0ffd04cb47dee506d03`. The Timeline file retains its own canonical path and bytes. MIP imports `Widgets/widgets.css`, whose emitted application stylesheet is unchanged.

The alias removal was checked against actual MIP and installed Cesium sources. MIP sets `CESIUM_BASE_URL` to the Vite deployment base plus `cesium/` before importing Cesium, and imports its canonical `Widgets/widgets.css`. Cesium's `Core/buildModuleUrl.js` appends complete resource paths to that base. Its resource literals retain `Assets/Textures/`, `Assets/IAU2006_XYS/`, `Widgets/Images/`, and `ThirdParty/Workers/`; its dynamic templates retain those same directories. TaskProcessor uses its default `Workers/` prefix and canonical `ThirdParty/*` WASM option values.

The recorded AST inspection parsed 1,667 MIP/Cesium JavaScript files, checked 55 resource literals, six resource templates, and 1,323 relative worker/ThirdParty import references. No removed alias appears in a resource literal or template, no canonical resource literal or worker import is missing, and static CSS resource URLs are embedded data rather than references to removed files. Dynamic TaskProcessor arguments were also inspected at their default prefix and WASM option definitions. These checks establish that the installed package's default resource paths and current MIP configuration use canonical paths, rather than the accidental aliases; they do not promise compatibility for arbitrary future custom asset URLs.

Finally, the installed Cesium `buildModuleUrl()` generated the actual MIP-base URLs for every one of the 389 canonical files. Each URL was fetched from the actual repaired Vite development server and returned HTTP 200 with the expected SHA-256 bytes. `actual-cesium-dev-http.json` records every URL, status, and hash. This is narrow asset URL qualification, not a new imagery or visual audit.

## Validation receipts

| Check | Result | Receipt |
| --- | --- | --- |
| Clean isolated install | `npm ci --ignore-scripts`, 194 packages installed | `ci-install.log` |
| Complete npm audit | 0 info/low/moderate/high/critical vulnerabilities | `repaired-audit.json` |
| Installed chain | static-copy 3.4.0 → overridden Chokidar 4.0.3; no braces | `dependency-tree.json` |
| Focused real-plugin regressions | 2 passed | `focused-tests.log` |
| Complete existing suite plus regressions | 1,789 passed; 0 failed/skipped/cancelled | `full-tests.log` |
| Production build | Passed; inherited large-chunk warning remains | `build.log` |
| Bundle isolation | Passed; 12 verifier self-tests passed | `bundle-isolation.log` |
| Canonical asset build parity | 389/389 paths and bytes match; no missing/extra paths | `cesium-asset-parity.json` |
| Actual development HTTP | 389/389 canonical URLs return 200 and matching bytes | `actual-cesium-dev-http.json` |
| Asset reference / alias inspection | Passed; all 503 removed aliases enumerated | `asset-url-references-and-removed-aliases.json` |

The focused regressions exercise the actual repository Vite configuration and installed plugin with an isolated synthetic Cesium tree. They verify nested paths, repeated basenames, binary bytes and dot files in builds; development HTTP reads; the plugin's actual literal-directory watcher; add/change/unlink events; newly added and changed file content; deleted-file 404; and watcher closure on server shutdown. There is no database or external application dependency in these tests.

The build and full suite ran after the repaired configuration was restored. Transient reference build output is excluded from the retained compact receipts; its hashes and differences remain recorded. `environment-and-package-hashes.json` binds the starting commit, tool versions, observation time, primary source URLs, and final package/config SHA-256 hashes. The final commit/tree and complete changed-file hashes are in `final-manifest.json` after committing.

## Subsequent native frontend integration

The native `ca72a6d` frontend has independent qualified differences: a `dompurify: 3.4.16` override and the `browserKeyBuildGate` import/plugin in `vite.config.js`. A later frontend port must **merge this scoped Chokidar override into the existing overrides object** and **apply only the four Cesium target changes while retaining that build gate**. Do not replace either complete native file with this source worktree's file. The parent owns integration and CI; this lane made no native frontend edits.
