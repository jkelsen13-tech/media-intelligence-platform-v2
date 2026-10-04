# Static release URL-to-body preflight — 4 October 2026

**PASS for the bounded provider-independent model; actual hosting and rollback acceptance remain held.** This adds a portable, read-only URL-to-body qualification to the existing frozen release inventory. It does not change the application, Vite base, emitted files, governed security policy or prior receipts.

The existing `scripts/launchReleaseArtifact20261003.mjs` already measures actual emitted bodies and compares canonical Cesium assets. Bounded searches of scripts, tests, qualification documents and hosting configuration found no equivalent request-target-to-body/header/rollback preflight. This tool consumes that existing `mip-launch-release-artifact-inventory-v1` contract and the retained export manifest rather than replacing either harness or inventory.

The product source remains `0ebf51d80179130c2b05041663c02777c427fcf4`, tree `aa2b71604f4fd782316b27bc340c88763db4eaad`. The implementation branch adds only this tool, focused tests and new evidence. Current handoff/review v20, requirements/plans v8 and Owner Decisions `libfile_720892b4771c8191a3216a89362f7028` continue to govern the separate launch gates. No applicable AGENTS.md was found in this checkout or its workspace parent.

| Observation | Fresh qualification |
| --- | --- |
| Actual frozen dist | All **442** bodies independently rehashed, **23,634,201** bytes |
| Canonical Cesium | All **389** inventory-bound package-equivalent bodies independently rehashed, **7,101,061** bytes; zero noncanonical outputs |
| Direct compiled prefix | **442/442** actual-body URL mappings, GET/HEAD, MIME, ETag and matching conditional responses pass |
| Root redirect plus explicit prefix layout | **442/442** mappings pass; root has an explicit 308 to the compiled prefix |
| Root-only mount of unchanged dist | **HOLD**: root HTML returns 200 but both absolute compiled entry URLs return 404; no HTML rewriting is proposed |
| Hash navigation refresh | Entry server path returns the exact index body; fragments remain client state; no server-side Story/event route or route data is invented |
| Missing/denied requests | Missing JS/CSS/worker/WASM/tile, API/private/source paths and unknown server paths fail without SPA HTML; malformed paths fail before normalization; mutation methods return 405 |
| Focused checks | **14/14** on Node **22.23.3** and **24.19.0**, including ephemeral `127.0.0.1` actual HTTP fixture requests |
| Actual rollback predecessor | **HOLD**: no real previous deployable body set or deployed pointer supplied; distinct fixture selection and mixed/missing body refusal pass |

The actual bodies were read from `/workspace/mip-oct03-card-qualification-node24/dist`; they were neither rebuilt nor rewritten. Both runtimes independently reread them against the same pinned Node24 inventory and portable export manifest. The previous identical Node22 inventory remains unchanged. The portable archive was also independently read: 446 members, CRC clean, all 445 manifested payloads rehashed. Archive identity is `MIP_Card_Correction_Qualified_Dist_2026-10-03.zip`, **9,798,738** bytes, SHA256 `e0fbf5017d8d75f28c68c7a0df64cb984917387fda5df3dc09137eed7b6afb96`.

The largest body remains `assets/index.es-Du2UdQLy.js`, **4,975,628** bytes, SHA256 `30c8a723713be16f9bab0974b4b33ccba849dc465191abae889c302309ec0694`. [Archive custody](archive-custody.json), byte-identical [export manifest](MANIFEST.json) and [retained inventory](release-artifact-inventory.json) preserve the frozen source/body bindings. [Source bindings](source-bindings.json) also compare the current package, lock, Vite, App and hash-route source bytes with exact product Git blobs; tool/test hashes are separate.

The qualification is deliberately named **SYNTHETIC_STATIC_ROUTING_MODEL**. [Node24 actual-body report](actual-body-node24.json) and [Node22 actual-body report](actual-body-node22.json) contain all 442 mappings and every negative request result. [Node24 TAP](focused-node24.tap) and [Node22 TAP](focused-node22.tap) qualify disposable fixture bodies through the real Node HTTP boundary; they are not deployed-host requests or a browser/App run. Font MIME checks use fixtures because this frozen dist contains no font files. [Execution evidence](execution-evidence.json) records commands, runtimes, input digest, file hashes and report reconciliation.

Requests are parsed as raw HTTP origin-form targets before WHATWG URL normalization can erase dot segments. Path segments decode once; dot/traversal, encoded separators, backslash, controls, residual percent/repeated encodings, double slash and unsafe file names are refused. Safe encodings such as `%61ssets` or `%40scope` map to the corresponding exact inventory file. Query is opaque and cannot select another body. Browser fragments are removed by a separate navigation helper because they never reach HTTP; literal fragments in server targets are refused. Only mount entry/index and existing exact files serve 200; there is no blanket SPA fallback, external request, API proxy or dynamically executed route.

Successful GET/HEAD responses emit a **quoted strong SHA256 ETag** of the actual body. GET/HEAD If-None-Match uses weak comparison; wildcard matches only an existing exact body. Wrong/untyped/malformed validators cannot produce 304, missing paths still deny, HEAD carries representation length without body, and 304 omits body and Content-Length. The CLI model concerns identity bytes; deployed compression/representation validators still need host verification.

Only inventory-bound assets with emitted hash filename suffixes receive `public, max-age=31536000, immutable`. HTML, bundle metadata, notices, unhashed logo and all unhashed Cesium paths receive `public, max-age=0, must-revalidate`. Cesium extensions do not justify indefinite caching. An accepted host layout must coordinate the entire exact release, prior hashed chunks, unchanged worker URLs, validators and browser/CDN caches. The preflight does not prove atomic cutover or purge behavior.

The model introduces no CSP, HSTS or other security policy. Its optional header-preservation seam accepts source-referenced values and preserves them without overriding MIME/cache/ETag/length, adding cookies or permitting control characters. The reference is an input assertion, not proof of policy approval. No governed header source was supplied for this actual release run, so **HOLD_GOVERNED_HOST_HEADER_ACCEPTANCE** remains explicit. Existing governed header requirements must be separately reconciled and verified on an approved host; this tool does not weaken them.

Rollback qualification selects a complete independently verified previous body set and compares its exact source, retained-inventory digest and canonical body-set fingerprint with an explicitly expected identity. Same-release selection, wrong identity, mixed files, new manifest with missing bodies, extra bodies and symlinks refuse. This proves a fixture artifact-selection contract only. Actual previous artifact custody, deployed pointer, compatibility, atomic restoration and cache coordination remain unqualified; no copy/restore/deploy action occurs.

To rerun portably, supply an already trusted local extraction of the retained archive under `qualified-dist/`, preserve the independently pinned manifest/inventory digests, and adjust only the local paths in [input.example.json](../../../scripts/static-release-preflight/input.example.json). All paths resolve from the command's working directory. Node built-ins are the only dependencies:

```sh
node --test --test-reporter=tap tests/staticReleasePreflight.test.mjs
node scripts/static-release-preflight/run.mjs scripts/static-release-preflight/input.example.json /tmp/new-static-preflight-report.json
```

The report is created exclusively with `wx`; an existing output file is refused. Optional `previousRelease` takes the same verified-artifact input structure, plus `expectedPreviousIdentity`; omitting a real predecessor keeps the rollback hold. The held host/root/predecessor conditions are reported separately from a successful model check, so the CLI's zero exit status is **not deployment approval**. No hardcoded original worker directory exists inside the portable implementation.

No full application suite, new build or browser suite was run. This evidence does not qualify commercial entitlement, account limits, domain/DNS/TLS, provider activation/spend, actual security headers/CDN/cache/observability, real Auth/RLS/evidence/source admission, backend compatibility, physical-device function/performance, final appearance or owner release acceptance. Approved host layout and recovery acceptance, merge/deploy/release authority and all current genuine launch gates remain separate. No original qik, eight-stage package, Supabase, public admission, environment key, dynamic cloud function or canonical Library document was touched.
