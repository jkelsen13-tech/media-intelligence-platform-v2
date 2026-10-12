# Isolated original-trigger and HTTP qualification

This harness is a separate qualification successor to reviewed commit `3b76cd4696fd2aeed650a4c0a6b084c0ab8bc481`. It does not change the frozen HTTP proposal or authorize a provider installation, qik connection, rehearsal, credential delivery, merge or deployment.

The fixtures use synthetic data, keys and credentials inside disposable local runtimes. Actual HTTPS/curl observations establish behavior only for the recorded local extension, libcurl and TLS backend. Receiver durability means independently committed local events surviving the tested parent rollback/restart; it does not qualify hosted receipt authenticity, provider trust, logging custody or all unobserved failure paths.

The original publication guard and logger are traced to the recovered historical `009_factual_enforcement.sql`. Any synthetic dependencies or transport substitutions must be identified in the receipt, rather than described as unchanged installed source. The preserved production sender still raises `mip_http_commit_unqualified`.

Keep failed-run receipts alongside successful ones. Cancellation or lost acknowledgement cannot prove rollback or remote non-commit. No automatic replay is permitted; uncertain delivery is reported as UNKNOWN.

Full repository checks do not run these native/container fixtures unless their explicit qualification environment is supplied. A skipped fixture is not an executed HTTP or durability test.

The original-trigger harness executes the full byte-pinned historical SQL with disposable dependency models. Its synthetic extension named `dblink` is a fixed-INSERT parser and HTTP shim; it is not the provider dblink extension or a dblink network connection. The separate qualification sender can return after a verified response so the original guard can reject. The unchanged production sender is exercised separately and continues to refuse, even after a local receiver side effect.

The stock/fork transport harness uses complete C translation units and official upstream SQL types. It records the exact linked curl/TLS libraries. Its optional `--sanitize` mode instruments both extensions and records active backend mappings for ASan/UBSan. The protected stock wrapper fixture tests private synthetic credential storage and client DEBUG2 suppression; server DEBUG2 still emits marker-bearing stock diagnostics. This does not establish hosted credential containment.

Run either Python harness with an explicit `--evidence` directory under `/workspace`. Supply the already-acquired PostgreSQL 17 prefix with `--pg-prefix`; the original-trigger harness also accepts `--postgrest-path`, and the transport harness accepts `--node-path`. No tool installation occurs in the input prefix.

The registered Node tests require `MIP_COMPOSITION_PG_PREFIX`, `MIP_COMPOSITION_POSTGREST_PATH`, `MIP_COMPOSITION_NODE_PATH`, and `MIP_COMPOSITION_EVIDENCE_DIRECTORY` as applicable. Docker and the selected Node runtime must be available on PATH; the original-trigger harness stages Node from PATH and records its identity. They preserve run evidence and assert actual execution, successful cleanup and default-deny flags. The transport test enables sanitizers. Without those explicit inputs they skip; full ordinary repository checks do not establish native execution.

Lost acknowledgement after dispatch remains UNKNOWN at the sender. An independent exact synthetic observer can separately establish that the local receiver committed; it does not grant rollback acknowledgement or retry authority. Clean restart and immediate PostgreSQL crash recovery are tested, not power-loss durability or hosted-provider recovery.
