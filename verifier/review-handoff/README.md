# Independent review handoff — isolated mechanism

Status: synthetic protocol only; real Cursor invocation, authenticated result origin, durable remote result publisher and automatic implementation-agent wakeup are NOT configured or qualified.

The existing scripts/buildCutoverReviewPacket.mjs and historical manifests remain unchanged. Their disclosure status is not promoted into approval. Public repository presence does not authorize external-model disclosure; raw logs, publisher bodies, CC capture text, private records and credentials remain excluded.

## Implemented

protocol.mjs binds an immutable candidate SHA, exact file bytes/hashes, request, disclosure record and complete requirement coverage. Results retain PASS/FAIL/BLOCKED and existing evidence classes. Supplied implementation results cannot alone establish independent PASS. Mismatched candidate/packet/reviewer, missing coverage and contradictory PASS are rejected. Synthetic results never route as real approval. Real packets are rejected unconditionally until transport integration exists. Exact-result retries use an injected putOnce contract; the synthetic Map test is NOT durable-store qualification.

The read-only GitHub-hosted workflow runs synthetic tests only. It has no secrets, model calls, publisher token, deployment, merge or approval step. No project files are stored on the owner's device.

## Required real integration

1. Freeze an approved disclosure allowlist at exact candidate SHA. A separately protected controller verifies its authority and constructs a packet without .git, agent rules, MCP configuration or undeclared files. Do not execute candidate scripts in a credential-bearing job.
2. Run a fresh Cursor session over only the packet in a disposable remote boundary, with no GitHub token, production access or implementer conversation. Pin and verify CLI version and chosen available Grok model. No --force, resume or continue. Proposed invocation: agent -p --mode ask --model <verified-model> --output-format json <fixed-review-prompt>. CLI permission rules supplement OS/network isolation; a prompt is not a security boundary.
3. Keep reviewer output quarantined until strict validation and disclosure checks succeed. Detailed findings and independently reproduced test receipts still require a bound schema/adapter; the current finding IDs alone are not a full review report.
4. A distinct trusted publisher gets only repository-specific contents/PR permissions. Agents get no publisher credential. GitHub permissions are not path-scoped: enforce result-only branch/path writes in trusted controller code and protected rules. Never trust a candidate-edited workflow to authenticate its own review. Real transport verification and protection configuration remain unimplemented; JSON verified=true is only a test injection, never evidence of identity.
5. Persist request reservation and exact result atomically/durably; recover ambiguous publish/create-PR acknowledgement by exact request and bytes. Result branch review-results/<request> and draft PR; no overwrite, merge, review approval or production authority. These GitHub mutations are proposed, not performed by the synthetic test.
6. Codex consumes authenticated findings from GitHub. PASS means continue existing authorized engineering. FAIL means a separate correction branch linked to findings. Owner/policy/disclosure/production blockers require owner input; other work continues. No automatic retry on an unknown reviewer completion. A durable dispatcher and Codex wakeup remain to implement; GITHUB_TOKEN pushes do not ordinarily trigger another push workflow.

## Activation dependencies

Owner has authorized setup of reviewer authentication, but no usable CI credential has been configured or verified by this agent. Do not use credentials pasted into chat. Protected custody, the actual account's Grok model availability and spending boundary, the approved packet disclosure, and protected controller/publisher execution must be resolved before real activation. Do not create a paid service or broaden source disclosure. Browser control currently fails before connection; GitHub connector cannot manage secrets.

Recommend existing disposable GitHub-hosted execution with a protected review environment and separate publisher job, rather than granting a cloud agent write access to the whole application repository. Establish that protection outside candidate-editable configuration before attaching secrets. An owner-configured trusted controller revision is needed; PRs149–153 stay draft/unmerged.

References inspected: https://cursor.com/docs/cli/github-actions ; https://cursor.com/docs/cli/headless ; https://cursor.com/docs/cli/reference/permissions ; https://cursor.com/docs/cli/reference/parameters ; https://docs.github.com/en/actions/reference/security/secure-use ; https://docs.github.com/en/actions/concepts/security/github_token . Documentation supports headless operation, not proof that this account or boundary is configured.

Production cutover ON HOLD. Feature implementation goal remains active; this mechanism is not independent certification or coherent-candidate review completion.
