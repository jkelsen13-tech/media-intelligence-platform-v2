# MIP independent review controller preparation — 2026-09-13

Status: NOT ACTIVATED. This draft adds a synthetic controller and adversarial tests. It does not claim an independent Cursor review or an authenticated transport.

## Existing evidence
The previous synthetic protocol at 22cec397b8165df3bc72999d28f7ae23fb26301b passed 21/21 tests in GitHub Actions run 34801440307, job 103844762758 (reported by the implementation task; verify linked logs).
Historical PR151 native PostgreSQL PASS and existing manifests are preserved. The cutover packet builder still marks its disclosure as proposed_not_transmitted. Do not promote that status by inference.
References:
- https://github.com/jkelsen13-tech/media-intelligence-platform-v2/actions/runs/34801440307
- https://cursor.com/docs/cli/headless
- https://cursor.com/docs/cli/reference/permissions
- https://cursor.com/docs/cloud-agent/api/endpoints

## Smallest intended deployment
Use disposable GitHub-hosted runners and a separately protected controller revision. Keep agents outside the credential-bearing publisher boundary. Avoid adding a separate database or production Supabase integration.

1. Implementation agent commits a frozen candidate and bounded request/manifest to GitHub. Request includes exact candidate SHA, packet digest, requirement IDs and authorized disclosure reference.
2. Trusted controller resolves the owner-approved allowlist independently of candidate code; fetches exact bytes at the SHA; validates hashes, file types, size and exclusions. Do not execute repository scripts to construct a credential-bearing packet. Strip repository metadata, agent rules and MCP configuration.
3. Fresh reviewer session sees only authorized packet and a fixed review contract. No implementation-agent conversation or writable source checkout. Pin actual available Grok model and CLI version; no silent fallback, force, resume, or continue. CLI permissions supplement process/filesystem/network isolation. Shell reproduction, when needed, occurs in a separate secret-free sandbox. Candidate scripts never receive model or publisher credentials.
4. A separate publisher validates provider-origin receipts, exact request/candidate/packet/model binding, complete evidence coverage, disclosure and detailed findings. A model statement or verified=true field is not origin authentication. Retain raw response privately if disclosure is unresolved; never automatically publish arbitrary model output into this public repository.
5. Publisher writes immutable result artifacts through GitHub create-only/CAS operations using a short-lived repository-specific token, then records durable delivery state. Runtime should have contents write only where needed and no administration, Actions write, secrets, deployment or approval authority. GitHub contents permissions are not path-scoped; controller code plus protected refs enforce result-only writes.
6. Deliver the immutable result link to the implementation agent with an idempotency key. Reconcile ambiguous completion instead of starting another reviewer. Result persistence precedes wakeup; duplicate delivery cannot start duplicate remediation. Remediation creates a new candidate, never rewrites the reviewed one.

PASS permits only previously authorized engineering. FAIL routes to remediation and retains findings. BLOCKED distinguishes engineering/missing evidence (continue other work) from owner, permission, disclosure, production or spending decisions. None confers merge, publication, production, or self-approval authority.

## What is implemented here
controller.mjs rejects unknown structured fields, model substitution, unfrozen candidate identity, wrong reviewer/request, unsupported PASS, and unbound evidence-reference syntax. Findings have severity, requirement, explanation, evidence and remediation fields. Reservation/result interfaces require atomic create and exact-byte retries. Deterministic delivery keys support downstream deduplication.
Tests cover concurrent reservation and acceptance, lost acknowledgement, conflicting overwrite, owner versus engineering routing, and non-activation. They use memory test doubles: neither real GitHub transactional persistence nor provider authentication nor wakeup is qualified.
Packet evidence references are syntactically bound only; a real adapter must resolve them against the retained evidence inventory and verified test receipts before any real PASS.
All real requests and real transport are rejected. Do not remove these gates merely because synthetic tests pass.

## Inspected access and blockers
The authenticated Cursor page displayed Pro+ and Grok 4.6 High/Extra High, including prior MIP review sessions. This is UI availability evidence, not an API model identifier or a verified spending limit.
GitHub rulesets GET returned an empty list. Classic branch and environment protections have not been verified. Chrome disconnected during environment inspection.
The owner authorized use of the supplied Cursor API key for setup. No key was written to this repository, workflow, local file, or secret store in this work. No broad repository secret should be added before a protected controller boundary exists.
No real reviewer invocation, key validation, durable publisher, independent origin verifier, cloud dispatcher, or automatic implementation-agent wakeup is configured.

## Activation decisions and remaining work
Choose/protect the controller ref and credential custody outside either agent's write authority. The same owner identity currently accessible to tooling must not be able to approve its own controller or review; an independent principal or platform-enforced boundary is required.
Verify account-specific CLI/API model ID and spending cap, establish the bounded disclosure authorization for each real candidate, and qualify provider receipt authentication, durable create-only publishing and delivery recovery with synthetic provider output.
Owner authorization already covers setup and synthetic testing. Reconfirmation of that general permission is unnecessary. Real disclosure expansion, new privileged principal, spending expansion, and production remain owner decisions.
The existing Codex task can receive a link through app tooling (tested by coordination), but this is not a deployed cloud wakeup endpoint. Do not claim unattended delivery while it depends on an active local app/thread; do not create local automations under the no-local-files constraint.
