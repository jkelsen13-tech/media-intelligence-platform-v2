# Supervised review delivery reliability diagnostic — 2026-09-14

This is an evidence-only diagnostic on the existing review branch. It changes no frozen candidate, review outcome, operational callback, schema, configuration or authority.

| Review | Controller acceptance | Immutable evidence |
| --- | --- | --- |
| PR161 | BLOCKED | [Raw result](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/blob/9ffb1d287f10978e6f58ff636944e92c2076b84a/verifier/independent-pr161/result.txt) · [Provider](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/blob/c8b2a2676c25cd81b9545a67eb6733770eeb7f04/verifier/independent-pr161/result.provider.json) · [Receipt](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/blob/48a45efc75ba6fee3f77f2c42933c6f2d8e53a63/verifier/independent-pr161/receipt.json) |
| PR163 | Bounded PASS | [Raw result](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/blob/320be4ebc697bd13fccc03d3ccb516c4c834120d/verifier/independent-pr163/result.json) · [Provider](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/blob/fb27dbaba92342f6de9f51639d0f93d6c9bf4ccb/verifier/independent-pr163/result.provider.json) · [Receipt](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/blob/bb5d399dd214dbe496032c12ee0db9dda85bb185/verifier/independent-pr163/receipt.json) |
| PR164 | BLOCKED | [Raw result](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/blob/70f2a11acddabcdbab14b62527ab4c114a2961d9/verifier/independent-pr164/result.txt) · [Provider](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/blob/2ef069b1b28663c17b6399cd5b82d4c4a89fbdc0/verifier/independent-pr164/result.provider.json) · [Receipt](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/blob/205796b42967d0ae76c10eee24150a5450695392/verifier/independent-pr164/receipt.json) |
| PR165 | BLOCKED | [Raw result](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/blob/cb24fbc967f2fcce29105680600414aa3a64e14b/verifier/independent-pr165/result.txt) · [Provider](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/blob/cffa7c96ed0e33694b61c2b9baac2d7969ce2c56/verifier/independent-pr165/result.provider.json) · [Receipt](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/blob/6191bdd1d54bb1da2f09332f04327bd05085bbc8/verifier/independent-pr165/receipt.json) |

PR163 returned conforming JSON with seven PASS rows, no findings/blockers, and retained limitations. Acceptance is bounded artifact inspection of a private backend prerequisite, not approval, independent runtime execution, HTTP/browser qualification, production admission or full Markets certification. PR161 returned an incomplete narrative handoff; PR164 and PR165 returned prose plus nonconforming BLOCKED fragments reporting unavailable packet evidence. All original provider outputs were preserved verbatim and exact GitHub/provider readback equality was verified.

Each of these four agents received exactly one authorized initial submission. No followups, continuations, recoveries or retries were sent for these runs. Transport timeouts were resolved by GET of the reserved agent/run, without repeating POST. All four original runs are terminal. Further review launches are held.

The reviewer claims about packet loss, continuation, a second handoff message, and workspace contents are unverified model statements. Available pinned-run and list-runs metadata do not establish their cause or prove an additional owner/controller message or filesystem inspection. Context compaction is a possible explanation, not a finding. These incomplete outcomes establish an operational reliability gap regardless of cause; terminal FINISHED does not mean a completed review.

## PR161 size and usage facts

The exact UTF-8 packet is 1,747,767 bytes; the complete instruction prefix plus packet is 1,752,994 bytes. The artifact class is 72 candidate sources, two base sources, four complete logs, metadata and the output contract/template.

The provider usage endpoint reported inputTokens=840896, outputTokens=11063, cacheReadTokens=512, cacheWriteTokens=0, totalTokens=852471 for pinned run run-c3975cac-9ae5-4a47-8352-cfa24fdf16e2. These are aggregate run usage, not a single context-window measurement. Bytes are not tokens. No documented model context limit was verified. Pinned-run metadata exposes no stop/finish reason, context-compaction flag, input truncation flag or user-message history. List-runs returned this one run. [Detailed read-only diagnostic](https://github.com/jkelsen13-tech/media-intelligence-platform-v2/blob/069886de976b7f495c9dfb0d4410680f235dc291/verifier/independent-pr161/provider-diagnostic.json).

## Documented capability boundary

The [official Cursor Cloud Agents OpenAPI](https://cursor.com/docs-static/cloud-agents-openapi.yaml) declares OpenAPI 3.0.3, API info.version 1.0.0. Retrieved 2026-09-14T11:57:37.834Z; Last-Modified: Mon, 14 Sep 2026 05:42:51 GMT; ETag: W/"c5af6997bf1334dfee41ae1184073920"; exact document SHA256: fef3a8b7272a8b1d0eb8abbc12a4f8a9745f3d56531f86566e60d926cc0dd35f. This is a version-labelled documentation snapshot, not a claim that its URL is immutable.

CreateAgentRequest and CreateRunRequest document prompt.text and optional image inputs (up to five images), but no arbitrary input-file upload/attachment or allowlisted immutable artifact-input API with a persistence guarantee across context changes. The artifacts and artifacts/download endpoints list/download agent-produced outputs; they are not input-upload mechanisms. There is no currently verified cloud-only arbitrary-input artifact persistence path under the current no-repository, no-MCP and no-tool restrictions.

Session envVars are shell environment secrets, limited to 4096 bytes per value, documented as beta and potentially silently ignored; they also conflict with a caller-reserved agentId. They are not a packet transport workaround and were not used for these packets. Named environments, repository attachment and MCP are separate capabilities; none was enabled or expanded to solve this problem. No documented forced JSON response-schema option was established.

## Authority and next state

Protected always-on execution and publishing remain owner-gated Stage 2 work, alongside credential custody, spending/disclosure policy and unattended operation. This diagnostic authorizes none of them. No new runtime, identity, service, permission, packet workaround or reviewer access was configured. No local files were written. GitHub remains the durable evidence store.

Owner interruption is not currently required while independently authorized engineering and tests continue. Any future delivery redesign or additional review launch must receive its applicable authorization; existing BLOCKED outcomes stay unchanged.
