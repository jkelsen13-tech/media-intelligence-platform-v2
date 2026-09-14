# Owner-supervised Stage 1 handoff — verified synthetic round trip

Stage 1 is controlled by the owner through the existing Codex controller thread. No new protected GitHub identity is required for this supervised process. Stage 2 remains separate.

## Start or resume
Open the existing controller task 01a09de0-e6e1-70a3-9773-15fc35ed6876 in Codex and send:
> Run supervised Stage 1 handoffs. Obtain the next frozen request from the implementation task, use only its already authorized disclosure scope, and return the independent result to that task. Stop for genuine owner decisions.

For an interrupted review:
> Resume the supervised handoff from its GitHub reservation. Reconcile the existing Cursor agent/run; do not launch a duplicate.

Keep Codex open with this controller task active while handoffs are wanted. The owner may need to press Continue or send the resume instruction after a turn, app shutdown, or interruption. This is a supervised conversational process, not an installed shell daemon or unattended schedule. No Cursor CLI command is claimed: agent/cursor/cursor-agent were not found on PATH, in normal user directories, registry installation entries, or running processes. The implementation task also knew no CLI path.

## Actual architecture used
GitHub connector reads exact frozen commit/path into memory. The controller calls Cursor Cloud Agents API with the owner-authorized key only in TLS request headers. Windows trusted certificates were added to Node's normal trust list; verification stayed enabled. No key was written to a local file, repository, review packet, or log output.
Each review has a fresh no-repository Grok 4.6 cloud session (effort high; fast false), no inline MCP servers, no passed environment secrets, and autoCreatePR=false. No local workspace, desktop access or worker was exposed.
A reservation with client-chosen agent ID is committed before launch. Lost acknowledgements were recovered using that ID; no duplicate session was minted.
The controller reads the authenticated provider terminal response, checks frozen identity/digest and result shape, writes provider response and verbatim result as NEW GitHub files, verifies exact readback, and sends the immutable result link directly to implementation.
GitHub candidate/result commit IDs and SHA256 hashes are the acceptance anchors, not mutable branch tips or an implementer's restatement. Original FAIL/BLOCKED is never edited into PASS. A corrected candidate gets a new independent session and new result.
These owner-supervised operational boundaries do not claim tamper resistance against a compromised owner account. Neither agent was granted new permissions. The implementation task was instructed to preserve all request/result artifacts and was given no controller credential.

## Observed end-to-end evidence
1. Implementation froze request 98c5a49ec46d46bdbe2e05db1e0e7aba79d5daf8 / synthetic-review/request.json.
   Grok agent bc-28411385-8707-4eb5-832a-65a5c9bc37c2, run run-2b04dd37-b83b-4c4f-ba88-11b40c3d8ce6 returned FAIL, finding AGE_EQ_18_EXCLUDED.
   Complete result: https://github.com/jkelsen13-tech/media-intelligence-platform-v2/blob/10da84f1a629cf5e479e21af7d2bc8992a6bf043/synthetic-review/result-1.json
   Result SHA256: 1523fe57bf343d93535ab3fe033ebf9f53f0bfec1105882be871ef98a9a3f835.
2. Implementation received the link, acknowledged it and produced correction f0df651313b74ebc285de03b57fbe7d247359f8a / synthetic-review/request-correction-1.json on a new branch.
   Fresh Grok agent bc-eea7e698-8d6c-458d-afc6-549521330edb, run run-d5992fae-daa3-494c-939f-16b303887339 returned PASS.
   Complete result: https://github.com/jkelsen13-tech/media-intelligence-platform-v2/blob/7bbd86837d8242e8c655fd07b8d429a9f40d5230/synthetic-review/result-2.json
   Result SHA256: f0e24170ac2431be1b129c7e6eeca9c90a6bf201649edbdef4513d4d1c5e237f.
   PASS was delivered back to implementation. Original FAIL remained unchanged.
3. Separate synthetic missing-owner-threshold request at 245ca9e6007faad15dd45f82a2663e0de92d9dc5 / synthetic-review/request-blocked-1.json returned BLOCKED with owner_decision and missing_evidence retained.
   Grok agent bc-08f40f3f-3f82-470e-a758-25b0271bedfd, run run-df983925-6b11-4249-a63f-86b2ef418c03.
   Complete result: https://github.com/jkelsen13-tech/media-intelligence-platform-v2/blob/92950703b1fa8a07e9de3d7869f809e0aade3c10/synthetic-review/result-3.json
   Result SHA256: 0b50e37d3650c088e13114b0971d7e0f1819b2e441475b55882ef42b8890c50c.
   Controller surfaced the simulated owner dependency and informed implementation; it did not invent the threshold. This fixture needs no real owner decision.

All three results are artifact_inspection. They do not claim executed application tests or qualify real MIP. Provider JSON responses are adjacent to each result as result-N.provider.json. Eight additional in-memory adversarial adapter checks passed: mismatched candidate, packet and request; unknown top-level field; contradictory PASS; unsupported FAIL/BLOCKED; attached repository rejection.

## Real handoffs and remaining manual work
The transport round trip is tested on synthetic packets. A real MIP request still needs an exact frozen, bounded disclosure packet under existing owner authority. Do not infer new disclosure rights from repository publicity or this synthetic test. If coverage is missing, return BLOCKED and continue unrelated authorized work. Do not re-review already accepted evidence unless changed dependencies invalidate it.
The supplied supervised-stage1.mjs is a synthetic transport adapter, loaded into memory for this test; it is not a general MIP packet-builder or a standalone GitHub/Codex daemon. For a real packet the controller must use the existing MIP manifest/evidence model and verify its authorized scope before transport, preserving the same identity/readback sequence.
Start/continue the controller, handle actual owner decisions, and re-authenticate if existing credentials expire. No message copying is required between the two agent tasks. No production change, merge, real disclosure expansion or automatic approval was performed.

## Stage 2
Unattended scheduling and wakeup, isolated credential custody and protected controller/publisher principal, durable delivery queue/deduplication independent of this active task, enforced spending/disclosure policy, and adversarial authority hardening. These are not prerequisites for repeating this supervised synthetic process.

Official API reference: https://cursor.com/docs/cloud-agent/api/endpoints
