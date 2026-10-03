# Launch source-binding portability repair — 3 October 2026

The frozen coherent candidate `096693a4f62eb4e3f918ae03eb4525f0232e4e54`, tree `0fc1637ec8a6d78a006b41ae91892836f2f495f9`, failed public [GitHub run 37099754666](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/37099754666). Node 24 ran 2,686 tests: 2,685 passed and one failed, with zero cancelled, skipped or todo. Build/audit did not qualify that candidate. The failed receipt remains historical; this repair creates no fresh CI run or review verdict.

The failure was in `tests/investigationApi.test.mjs`'s integrated source-binding reader, not the provider regression test. The historical Markets receipt retains three absolute paths under the original worker checkout. `new URL(absolutePath, currentRoot)` escaped the current repository and attempted to read an unavailable worker file. The Python generator's `ROOT / absolutePath` had the same dependency: a locally present old worker could mask changed or missing current files. Production Markets policy and its original regression are unchanged.

The repair has one explicit shared mapping, `scripts/launchRcHistoricalSourcePaths20261003.json`. It binds exactly three original source paths to their repository-relative locations, only for `docs/qualification/markets-provider-contract-20261003.json` with SHA256 `3868bbda45bdf46b2990db9f293f7363540dbb794dfd5c091bf8ec2d6fedf8d2`. Both the reader and generator use that mapping. Other absolute paths, URLs, empty/dot/traversal segments, URL escapes, query/fragment syntax and outside-root symlinks are refused. The reader derives its repository root from `import.meta.url`; the generator derives its root from `__file__`. Neither falls back to the original worker.

The integrated current manifest exposes `qualified_source_path_mappings` and binds the changed helper, generator, test and evidence bytes. All historical manifests remain byte-for-byte equal to the frozen candidate. Its 12 historical snapshot identities and keys remain intact. If a mapped current file changes, the generator reads its current bytes and can retain the original qualified Git blob under the canonical repository-relative snapshot path; its historical `source_path` key remains the exact original receipt text. Historical qualification never silently extends to changed current bytes.

Evidence is retained beside this report:

- `before-node24.tap` reproduces the actual frozen reader's ENOENT in an archived `/tmp` checkout, with test-level interception making every original `/workspace` read unavailable. Established directories were not renamed, removed or modified.
- `failed-ci.txt` preserves the failed public counts and exact reader stack, plus the SHA256 of the parent's complete failed Node 24 log.
- The new portability regression runs the actual repaired source-binding test from a relocated copy of current tracked and manifest-bound files. It denies old-workspace reads, confirms success, then confirms a changed current Markets file fails its hash comparison and a removed current file raises ENOENT. The old worker remains untouched, so it cannot mask either failure.
- The same regression checks Python path normalization without executing full Git-history regeneration. It requires only `git ls-files`, current source files and Python, so a GitHub Actions `fetch-depth: 1` checkout does not need qualified predecessor commit objects. Full generator regeneration remains a separate local operation with the real qualified objects.
- Node 22.23.3 and Node 24.19.0 each pass 23 targeted checks: 13 actual gateway/binding tests, seven unchanged provider tests and three new portability tests. Commands and exact code/log hashes are in the JSON receipt. A final read-only run follows regeneration of the complete current binding.

Reproduce from the candidate checkout:

```sh
node --test --test-reporter=tap tests/launchRcSourcePortability20261003.test.mjs tests/investigationApi.test.mjs tests/marketsProviderPolicy20261003.test.mjs
```

This is a test/tooling source repair. It changes no production runtime, provider policy, historical qualified manifest, account entitlement, database, deployed route or live authority. Root owns coherent integration, final freeze and one final full public CI run. No Cursor/PR dispatch or duplicate CI was created.
