# Device acceptance preparation

This package prepares the owner-required iPad, iPhone and Desktop acceptance.
The scope is responsive web; no native-app qualification is claimed.
It operates only in source and local browsers. It has no physical-device result,
FPS/thermal measurement, real Auth/SQL qualification or final visual acceptance.
The qualified source baseline is `ca72a6df511bbb26c6b9e0a193a3e0baf01aa428`,
tree `cbcfc510a117101fd163f83b3c574dd979085b02`, CI `37076657031`.

The owner decision record `libfile_720892b4771c8191a3216a89362f7028` §1/§4,
current convergence register `libfile_953c9013cec08191be2e9bef847b753f` v6,
handoff `libfile_90ebe4e040b48191ac4838f42b0d99dd` v19 and World View plans
`libfile_249b861f9e84819193b8fa1ba925cc7f` /
`libfile_faf64a8bf8608191902d59c249926ffa` v7 govern this preparation.
Complete coordinator extraction manifest:
`/workspace/mip-oct03-launch-readiness/requirements/current-library-read-manifest.json`.
Earlier source/browser receipts retain their original source attribution.

Run the exact checked-out candidate from its repository root with already
installed dependencies and Playwright; no installation or build publishing is needed:

```sh
node --test tests/deviceAcceptanceContract.test.mjs
MIP_DEVICE_OUTPUT=/tmp/mip-device-acceptance node scripts/device-acceptance/run-browser.mjs
```

Default profiles are iPad 834×1194↔1194×834, iPhone 390×844↔844×390,
narrow coarse 500×360↔360×500, and Desktop 1440×1000↔1000×1440.
They are browser emulations. `MIP_DEVICE_PROFILES=ipad,desktop` selects a
bounded subset. `MIP_DEVICE_BROWSER=webkit` selects an already available WebKit
runtime; an unavailable runtime is a blocker, never a Safari/device pass.
`MIP_DEVICE_PLAYWRIGHT_MODULE` may name an existing absolute module path.
The default Chromium executable is `/usr/bin/chromium`.

The isolated Vite configuration mounts the real App, views, hooks, renderers and
styles. Only the backend composition and session input are deterministic doubles.
Production source files are never rewritten. Environment files are excluded;
the real configured browser client is null. Every nonlocal browser HTTP(S)
request is blocked and recorded. Geometry, account identity, publication and
network failure authority are **SYNTHETIC_BACKEND_AND_SESSION_ONLY**.
This is a development-transform qualification, not the production static build.

The runner requires a committed clean head. A development check may explicitly
use `MIP_DEVICE_ALLOW_DIRTY=1`; that fact is written into every record. Receipts
pin actual head/tree, harness hash, production file hashes, Node/browser version,
viewport/input profile, calls, observed camera/context, blocked requests and
hashed PNGs. Final reports retain failed attempts separately. Functional status
stays partial where owner-only judgments or physical journeys remain.

Use [checklist.md](checklist.md) and a copy of [record-template.json](record-template.json)
for each future owner-operated device/orientation/input/network/account/source
baseline. Validate filled records with:

```sh
node scripts/device-acceptance/contract.mjs /absolute/path/to/record.json
```

The strict [JSON schema](record.schema.json) checks record topology. The bundled
validator additionally prevents synthetic-to-physical promotion, unsupported
selection without disclosure, ungrounded passes, historical RED rewriting and
final appearance acceptance without exact admitted real imagery/terrain/geometry
versions and provider provenance. Physical performance requires an exact accepted
measurement contract, measured observations and thermal provenance. Unknown
measurements remain null with limitations.

The historical **portrait cold 14 to 26** failed the unchanged
**delta-under-12 budget**. Its unit, original executable trace, timing window and
readiness boundary remain unrecovered. No new numeric threshold, replacement
benchmark or passing result is inferred. Recovery or an explicitly approved
replacement contract remains a separate owner gate; the RED history remains.

Supabase skill boundary: only existing interface/normalizer fixture behavior is
used. Current [initialization](https://supabase.com/docs/reference/javascript/initializing)
and [RPC](https://supabase.com/docs/reference/javascript/rpc) documentation was
checked; changelog markdown fetch returned unsupported content type. No new
Supabase feature, schema, credentialed call or backend change is made.
