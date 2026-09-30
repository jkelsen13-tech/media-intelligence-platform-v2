# Sanitized excerpt of native job 103501954636 attempt 3

Disposable CI password redacted. GitHub tokens already masked. ResourceWarnings omitted.

```
concurrent-transactions	Set up job	﻿2026-09-12T05:02:23.8205015Z Current runner version: '2.337.0'
concurrent-transactions	Set up job	2026-09-12T05:02:23.8257721Z Image: ubuntu-24.04
concurrent-transactions	Set up job	2026-09-12T05:02:23.8267091Z ##[group]GITHUB_TOKEN Permissions
concurrent-transactions	Set up job	2026-09-12T05:02:23.8269861Z Contents: read
concurrent-transactions	Set up job	2026-09-12T05:02:24.2814216Z Complete job name: concurrent-transactions
concurrent-transactions	Initialize containers	2026-09-12T05:02:33.0903672Z Digest: sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929
concurrent-transactions	Initialize containers	2026-09-12T05:02:33.0914170Z Status: Downloaded newer image for postgres:17.6
concurrent-transactions	Initialize containers	2026-09-12T05:02:33.1009600Z ##[command]/usr/bin/docker create --name b27a1fbd3d43422ebfdf1bb1480e42ea_postgres176_722e31 --label 2f2249 --network github_network_5612a1623a1e4fab983ec32552c028fe --network-alias postgres -p 5432:5432 --health-cmd "pg_isready -U postgres" --health-interval 5s --health-timeout 5s --health-retries 10 -e "POSTGRES_PASSWORD=***REDACTED***" -e GITHUB_ACTIONS=true -e CI=true postgres:17.6
concurrent-transactions	Run actions/checkout@v7.0.1	2026-09-12T05:02:39.3972840Z [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +b7bccc24ce8987d1db50c24575ff67e01b24611c:refs/remotes/pull/151/merge
concurrent-transactions	Run actions/checkout@v7.0.1	2026-09-12T05:02:40.0897930Z  * [new ref]         b7bccc24ce8987d1db50c24575ff67e01b24611c -> pull/151/merge
concurrent-transactions	Run actions/checkout@v7.0.1	2026-09-12T05:02:40.1007794Z ##[group]Checking out the ref
concurrent-transactions	Run actions/checkout@v7.0.1	2026-09-12T05:02:40.1013978Z [command]/usr/bin/git checkout --progress --force refs/remotes/pull/151/merge
concurrent-transactions	Run actions/checkout@v7.0.1	2026-09-12T05:02:40.2234731Z Note: switching to 'refs/remotes/pull/151/merge'.
concurrent-transactions	Run actions/checkout@v7.0.1	2026-09-12T05:02:40.2239253Z HEAD is now at b7bccc2 Merge ddbbbd6dc878dcb38ea0904b6ee58895853b6c26 into 6c716619d3b312682dba2c4c8211936f7f911895
concurrent-transactions	Run actions/checkout@v7.0.1	2026-09-12T05:02:40.2302852Z [command]/usr/bin/git log -1 --format=%H
concurrent-transactions	Run actions/checkout@v7.0.1	2026-09-12T05:02:40.2334529Z b7bccc24ce8987d1db50c24575ff67e01b24611c
concurrent-transactions	Qualify independent PostgreSQL connections	﻿2026-09-12T05:02:40.2552606Z ##[group]Run python3 -B verifier/comparisonPostgresConcurrency.py
concurrent-transactions	Qualify independent PostgreSQL connections	2026-09-12T05:02:40.2553190Z python3 -B verifier/comparisonPostgresConcurrency.py
concurrent-transactions	Qualify independent PostgreSQL connections	2026-09-12T05:02:40.2599980Z shell: /usr/bin/bash -e {0}
concurrent-transactions	Qualify independent PostgreSQL connections	2026-09-12T05:02:40.2600543Z   MIP_DISPOSABLE_POSTGRES: comparison-qualification
concurrent-transactions	Qualify independent PostgreSQL connections	2026-09-12T05:02:40.4698005Z MIP_PG_VERSION=PostgreSQL 17.6 (Debian 17.6-2.pgdg13+1) on x86_64-pc-linux-gnu, compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit
concurrent-transactions	Qualify independent PostgreSQL connections	2026-09-12T05:02:41.1437676Z MIP_PG_LOCK_OBSERVED={"blocked": 81, "holder": 80}
concurrent-transactions	Qualify independent PostgreSQL connections	2026-09-12T05:02:41.3145085Z test_bound_release_rechecks_head_after_concurrent_withdrawal (__main__.ConcurrentContract.test_bound_release_rechecks_head_after_concurrent_withdrawal) ... ok
concurrent-transactions	Qualify independent PostgreSQL connections	2026-09-12T05:02:41.6646403Z test_claim_skips_locked_generation_and_rollback_preserves_budget (__main__.ConcurrentContract.test_claim_skips_locked_generation_and_rollback_preserves_budget) ... ok
concurrent-transactions	Qualify independent PostgreSQL connections	2026-09-12T05:02:41.9096160Z MIP_PG_LOCK_OBSERVED={"blocked": 106, "holder": 105}
concurrent-transactions	Qualify independent PostgreSQL connections	2026-09-12T05:02:42.0794028Z test_completion_commit_rejects_waiting_failure (__main__.ConcurrentContract.test_completion_commit_rejects_waiting_failure) ... ok
concurrent-transactions	Qualify independent PostgreSQL connections	2026-09-12T05:02:42.4064208Z MIP_PG_LOCK_OBSERVED={"blocked": 115, "holder": 114}
concurrent-transactions	Qualify independent PostgreSQL connections	2026-09-12T05:02:42.5421550Z test_completion_visibility_and_concurrent_exact_retry (__main__.ConcurrentContract.test_completion_visibility_and_concurrent_exact_retry) ... ok
concurrent-transactions	Qualify independent PostgreSQL connections	2026-09-12T05:02:42.7791292Z MIP_PG_LOCK_OBSERVED={"blocked": 125, "holder": 124}
concurrent-transactions	Qualify independent PostgreSQL connections	2026-09-12T05:02:42.9464040Z test_duplicate_enqueue_waits_and_converges (__main__.ConcurrentContract.test_duplicate_enqueue_waits_and_converges) ... ok
concurrent-transactions	Qualify independent PostgreSQL connections	2026-09-12T05:02:43.2648782Z MIP_PG_LOCK_OBSERVED={"blocked": 134, "holder": 133}
concurrent-transactions	Qualify independent PostgreSQL connections	2026-09-12T05:02:43.3407723Z MIP_PG_LOCK_OBSERVED={"blocked": 138, "holder": 134}
concurrent-transactions	Qualify independent PostgreSQL connections	2026-09-12T05:02:43.5226754Z test_failure_commit_blocks_completion_and_exact_report_converges (__main__.ConcurrentContract.test_failure_commit_blocks_completion_and_exact_report_converges) ... ok
concurrent-transactions	Qualify independent PostgreSQL connections	2026-09-12T05:02:43.7619261Z MIP_PG_LOCK_OBSERVED={"blocked": 155, "holder": 154}
concurrent-transactions	Qualify independent PostgreSQL connections	2026-09-12T05:02:43.9344010Z test_failure_rollback_allows_waiting_completion (__main__.ConcurrentContract.test_failure_rollback_allows_waiting_completion) ... ok
concurrent-transactions	Qualify independent PostgreSQL connections	2026-09-12T05:02:44.3537780Z test_locked_exhausted_row_does_not_block_independent_work (__main__.ConcurrentContract.test_locked_exhausted_row_does_not_block_independent_work) ... ok
concurrent-transactions	Qualify independent PostgreSQL connections	2026-09-12T05:02:44.6037438Z MIP_PG_LOCK_OBSERVED={"blocked": 173, "holder": 172}
concurrent-transactions	Qualify independent PostgreSQL connections	2026-09-12T05:02:44.7316159Z test_rolled_back_completion_has_no_visible_output_or_acknowledgement (__main__.ConcurrentContract.test_rolled_back_completion_has_no_visible_output_or_acknowledgement) ... ok
concurrent-transactions	Qualify independent PostgreSQL connections	2026-09-12T05:02:45.0952414Z MIP_PG_LOCK_OBSERVED={"blocked": 181, "holder": 180}
concurrent-transactions	Qualify independent PostgreSQL connections	2026-09-12T05:02:45.2248570Z test_selection_rechecks_predecessor_after_concurrent_commit (__main__.ConcurrentContract.test_selection_rechecks_predecessor_after_concurrent_commit) ... ok
concurrent-transactions	Qualify independent PostgreSQL connections	2026-09-12T05:02:45.5518143Z MIP_PG_LOCK_OBSERVED={"blocked": 192, "holder": 191}
concurrent-transactions	Qualify independent PostgreSQL connections	2026-09-12T05:02:45.5946927Z MIP_PG_LOCK_OBSERVED={"blocked": 192, "holder": 191}
concurrent-transactions	Qualify independent PostgreSQL connections	2026-09-12T05:02:45.7607640Z test_selection_rollback_and_concurrent_retry_preserve_withdrawal (__main__.ConcurrentContract.test_selection_rollback_and_concurrent_retry_preserve_withdrawal) ... ok
concurrent-transactions	Qualify independent PostgreSQL connections	2026-09-12T05:02:46.1259156Z MIP_PG_LOCK_OBSERVED={"blocked": 204, "holder": 203}
concurrent-transactions	Qualify independent PostgreSQL connections	2026-09-12T05:02:46.3765482Z test_source_capture_keeps_one_snapshot_during_committed_multi_table_correction (__main__.ConcurrentContract.test_source_capture_keeps_one_snapshot_during_committed_multi_table_correction) ... ok
concurrent-transactions	Qualify independent PostgreSQL connections	2026-09-12T05:02:46.8702340Z test_source_capture_retention_and_queue_rollback_are_invisible_to_observer (__main__.ConcurrentContract.test_source_capture_retention_and_queue_rollback_are_invisible_to_observer) ... ok
concurrent-transactions	Qualify independent PostgreSQL connections	2026-09-12T05:02:47.1483619Z MIP_PG_LOCK_OBSERVED={"blocked": 229, "holder": 228}
concurrent-transactions	Qualify independent PostgreSQL connections	2026-09-12T05:02:47.2394896Z test_stale_completion_rechecks_committed_replacement_lease (__main__.ConcurrentContract.test_stale_completion_rechecks_committed_replacement_lease) ... ok
concurrent-transactions	Qualify independent PostgreSQL connections	2026-09-12T05:02:47.2409579Z Ran 14 tests in 6.766s
concurrent-transactions	Qualify independent PostgreSQL connections	2026-09-12T05:02:47.2409839Z OK
concurrent-transactions	Reproduce frozen PR149 authority counterexamples	﻿2026-09-12T05:02:47.2559406Z ##[group]Run python3 -B verifier/pr149AuthorityOrdering.py --baseline
concurrent-transactions	Reproduce frozen PR149 authority counterexamples	2026-09-12T05:02:47.2559960Z python3 -B verifier/pr149AuthorityOrdering.py --baseline
concurrent-transactions	Reproduce frozen PR149 authority counterexamples	2026-09-12T05:02:47.2601776Z shell: /usr/bin/bash -e {0}
concurrent-transactions	Reproduce frozen PR149 authority counterexamples	2026-09-12T05:02:47.2602303Z   MIP_DISPOSABLE_POSTGRES: comparison-qualification
concurrent-transactions	Reproduce frozen PR149 authority counterexamples	2026-09-12T05:02:47.3210139Z MIP_AUTHORITY_MODE=frozen-543e423-counterexample
concurrent-transactions	Reproduce frozen PR149 authority counterexamples	2026-09-12T05:02:47.3242563Z test_completion_acceptance_first_delays_revocation_until_commit (__main__.AuthorityOrdering.test_completion_acceptance_first_delays_revocation_until_commit) ... skipped 'ordering fence exists only in corrected contract'
concurrent-transactions	Reproduce frozen PR149 authority counterexamples	2026-09-12T05:02:48.0379037Z MIP_PG_LOCK_OBSERVED={"blocked": 237, "holder": 236}
concurrent-transactions	Reproduce frozen PR149 authority counterexamples	2026-09-12T05:02:48.1572405Z MIP_AUTHORITY_REVOKE_COMMITTED_WHILE_COMPLETION_BLOCKED
concurrent-transactions	Reproduce frozen PR149 authority counterexamples	2026-09-12T05:02:48.2347488Z MIP_COUNTEREXAMPLE_REVOCATION_AFTER_INITIAL_AUTH=confirmed
concurrent-transactions	Reproduce frozen PR149 authority counterexamples	2026-09-12T05:02:48.2872903Z test_completion_paused_after_initial_authorization_then_revoke_commits (__main__.AuthorityOrdering.test_completion_paused_after_initial_authorization_then_revoke_commits) ... ok
concurrent-transactions	Reproduce frozen PR149 authority counterexamples	2026-09-12T05:02:48.2909924Z test_concurrent_foreign_claim_waits_then_denies_without_consuming_work (__main__.AuthorityOrdering.test_concurrent_foreign_claim_waits_then_denies_without_consuming_work) ... skipped 'cross-runtime first-use race'
concurrent-transactions	Reproduce frozen PR149 authority counterexamples	2026-09-12T05:02:48.2911735Z test_concurrent_identical_claim_retry_converges_without_second_lease (__main__.AuthorityOrdering.test_concurrent_identical_claim_retry_converges_without_second_lease) ... skipped 'new request serialization'
concurrent-transactions	Reproduce frozen PR149 authority counterexamples	2026-09-12T05:02:48.8698353Z MIP_COUNTEREXAMPLE_REPLAY_RETAINED_INPUT=confirmed
concurrent-transactions	Reproduce frozen PR149 authority counterexamples	2026-09-12T05:02:48.9133851Z MIP_COUNTEREXAMPLE_REPLAY_SUCCESS_WITHOUT_TOKEN=confirmed
concurrent-transactions	Reproduce frozen PR149 authority counterexamples	2026-09-12T05:02:49.0478093Z test_cross_runtime_claim_and_completion_replay (__main__.AuthorityOrdering.test_cross_runtime_claim_and_completion_replay) ... ok
concurrent-transactions	Reproduce frozen PR149 authority counterexamples	2026-09-12T05:02:49.7828519Z test_outstanding_lease_is_not_permission_after_revocation (__main__.AuthorityOrdering.test_outstanding_lease_is_not_permission_after_revocation) ... ok
concurrent-transactions	Reproduce frozen PR149 authority counterexamples	2026-09-12T05:02:49.7839052Z test_producer_retry_receipt_owner_and_new_session_same_owner (__main__.AuthorityOrdering.test_producer_retry_receipt_owner_and_new_session_same_owner) ... skipped 'producer ownership regression'
concurrent-transactions	Reproduce frozen PR149 authority counterexamples	2026-09-12T05:02:49.7843314Z Ran 7 tests in 2.459s
concurrent-transactions	Reproduce frozen PR149 authority counterexamples	2026-09-12T05:02:49.7843663Z OK (skipped=4)
concurrent-transactions	Verify corrected PR149 authority ordering and replay	﻿2026-09-12T05:02:49.8008855Z ##[group]Run python3 -B verifier/pr149AuthorityOrdering.py
concurrent-transactions	Verify corrected PR149 authority ordering and replay	2026-09-12T05:02:49.8009319Z python3 -B verifier/pr149AuthorityOrdering.py
concurrent-transactions	Verify corrected PR149 authority ordering and replay	2026-09-12T05:02:49.8049365Z shell: /usr/bin/bash -e {0}
concurrent-transactions	Verify corrected PR149 authority ordering and replay	2026-09-12T05:02:49.8049898Z   MIP_DISPOSABLE_POSTGRES: comparison-qualification
concurrent-transactions	Verify corrected PR149 authority ordering and replay	2026-09-12T05:02:49.8668043Z MIP_AUTHORITY_MODE=corrected-contract
concurrent-transactions	Verify corrected PR149 authority ordering and replay	2026-09-12T05:02:50.5114898Z MIP_PG_LOCK_OBSERVED={"blocked": 306, "holder": 296}
concurrent-transactions	Verify corrected PR149 authority ordering and replay	2026-09-12T05:02:50.6500864Z test_completion_acceptance_first_delays_revocation_until_commit (__main__.AuthorityOrdering.test_completion_acceptance_first_delays_revocation_until_commit) ... ok
concurrent-transactions	Verify corrected PR149 authority ordering and replay	2026-09-12T05:02:51.3074824Z MIP_PG_LOCK_OBSERVED={"blocked": 314, "holder": 313}
concurrent-transactions	Verify corrected PR149 authority ordering and replay	2026-09-12T05:02:51.4263806Z MIP_AUTHORITY_REVOKE_COMMITTED_WHILE_COMPLETION_BLOCKED
concurrent-transactions	Verify corrected PR149 authority ordering and replay	2026-09-12T05:02:51.6001499Z test_completion_paused_after_initial_authorization_then_revoke_commits (__main__.AuthorityOrdering.test_completion_paused_after_initial_authorization_then_revoke_commits) ... ok
concurrent-transactions	Verify corrected PR149 authority ordering and replay	2026-09-12T05:02:52.1999287Z MIP_PG_LOCK_OBSERVED={"blocked": 335, "holder": 334}
concurrent-transactions	Verify corrected PR149 authority ordering and replay	2026-09-12T05:02:52.2925178Z test_concurrent_foreign_claim_waits_then_denies_without_consuming_work (__main__.AuthorityOrdering.test_concurrent_foreign_claim_waits_then_denies_without_consuming_work) ... ok
concurrent-transactions	Verify corrected PR149 authority ordering and replay	2026-09-12T05:02:52.8967510Z MIP_PG_LOCK_OBSERVED={"blocked": 350, "holder": 349}
concurrent-transactions	Verify corrected PR149 authority ordering and replay	2026-09-12T05:02:53.0271160Z test_concurrent_identical_claim_retry_converges_without_second_lease (__main__.AuthorityOrdering.test_concurrent_identical_claim_retry_converges_without_second_lease) ... ok
concurrent-transactions	Verify corrected PR149 authority ordering and replay	2026-09-12T05:02:53.7879643Z test_cross_runtime_claim_and_completion_replay (__main__.AuthorityOrdering.test_cross_runtime_claim_and_completion_replay) ... ok
concurrent-transactions	Verify corrected PR149 authority ordering and replay	2026-09-12T05:02:54.5241845Z test_outstanding_lease_is_not_permission_after_revocation (__main__.AuthorityOrdering.test_outstanding_lease_is_not_permission_after_revocation) ... ok
concurrent-transactions	Verify corrected PR149 authority ordering and replay	2026-09-12T05:02:55.5442897Z test_producer_retry_receipt_owner_and_new_session_same_owner (__main__.AuthorityOrdering.test_producer_retry_receipt_owner_and_new_session_same_owner) ... ok
concurrent-transactions	Verify corrected PR149 authority ordering and replay	2026-09-12T05:02:55.5450893Z Ran 7 tests in 5.672s
concurrent-transactions	Verify corrected PR149 authority ordering and replay	2026-09-12T05:02:55.5451351Z OK
concurrent-transactions	Verify isolated mip candidate interfaces	﻿2026-09-12T05:02:55.5577236Z ##[group]Run python3 -B verifier/candidateInterfacesPostgres.py
concurrent-transactions	Verify isolated mip candidate interfaces	2026-09-12T05:02:55.5577746Z python3 -B verifier/candidateInterfacesPostgres.py
concurrent-transactions	Verify isolated mip candidate interfaces	2026-09-12T05:02:55.5617859Z shell: /usr/bin/bash -e {0}
concurrent-transactions	Verify isolated mip candidate interfaces	2026-09-12T05:02:55.5618383Z   MIP_DISPOSABLE_POSTGRES: comparison-qualification
concurrent-transactions	Verify isolated mip candidate interfaces	2026-09-12T05:02:56.8079593Z MIP_PG_LOCK_OBSERVED={"blocked": 451, "holder": 428}
concurrent-transactions	Verify isolated mip candidate interfaces	2026-09-12T05:02:56.9418922Z test_completion_acceptance_first_delays_revocation_until_commit (__main__.CandidateInterfaces.test_completion_acceptance_first_delays_revocation_until_commit) ... ok
concurrent-transactions	Verify isolated mip candidate interfaces	2026-09-12T05:02:58.1303635Z MIP_PG_LOCK_OBSERVED={"blocked": 459, "holder": 458}
concurrent-transactions	Verify isolated mip candidate interfaces	2026-09-12T05:02:58.2462202Z MIP_AUTHORITY_REVOKE_COMMITTED_WHILE_COMPLETION_BLOCKED
concurrent-transactions	Verify isolated mip candidate interfaces	2026-09-12T05:02:58.4173890Z test_completion_paused_after_initial_authorization_then_revoke_commits (__main__.CandidateInterfaces.test_completion_paused_after_initial_authorization_then_revoke_commits) ... ok
concurrent-transactions	Verify isolated mip candidate interfaces	2026-09-12T05:02:59.5710262Z MIP_PG_LOCK_OBSERVED={"blocked": 493, "holder": 492}
concurrent-transactions	Verify isolated mip candidate interfaces	2026-09-12T05:02:59.7398618Z test_concurrent_foreign_claim_waits_then_denies_without_consuming_work (__main__.CandidateInterfaces.test_concurrent_foreign_claim_waits_then_denies_without_consuming_work) ... ok
concurrent-transactions	Verify isolated mip candidate interfaces	2026-09-12T05:03:00.8837088Z MIP_PG_LOCK_OBSERVED={"blocked": 531, "holder": 530}
concurrent-transactions	Verify isolated mip candidate interfaces	2026-09-12T05:03:01.0870138Z test_concurrent_identical_claim_retry_converges_without_second_lease (__main__.CandidateInterfaces.test_concurrent_identical_claim_retry_converges_without_second_lease) ... ok
concurrent-transactions	Verify isolated mip candidate interfaces	2026-09-12T05:03:02.3682508Z test_cross_runtime_claim_and_completion_replay (__main__.CandidateInterfaces.test_cross_runtime_claim_and_completion_replay) ... ok
concurrent-transactions	Verify isolated mip candidate interfaces	2026-09-12T05:03:03.6566748Z test_outstanding_lease_is_not_permission_after_revocation (__main__.CandidateInterfaces.test_outstanding_lease_is_not_permission_after_revocation) ... ok
concurrent-transactions	Verify isolated mip candidate interfaces	2026-09-12T05:03:03.6578131Z Ran 6 tests in 8.034s
concurrent-transactions	Verify isolated mip candidate interfaces	2026-09-12T05:03:03.6578439Z OK
concurrent-transactions	Stop containers	2026-09-12T05:03:03.9532194Z  2026-09-12 05:02:41.144 UTC [81] ERROR:  unbound publication selection
concurrent-transactions	Stop containers	2026-09-12T05:03:03.9557067Z  2026-09-12 05:02:41.910 UTC [106] ERROR:  invalid or expired comparison lease
concurrent-transactions	Stop containers	2026-09-12T05:03:03.9566355Z  2026-09-12 05:02:43.341 UTC [134] ERROR:  invalid or expired comparison lease
concurrent-transactions	Stop containers	2026-09-12T05:03:03.9577620Z  2026-09-12 05:02:45.096 UTC [181] ERROR:  stale selection predecessor
concurrent-transactions	Stop containers	2026-09-12T05:03:03.9588675Z  2026-09-12 05:02:47.149 UTC [229] ERROR:  invalid or expired comparison lease
concurrent-transactions	Stop containers	2026-09-12T05:03:03.9597987Z  2026-09-12 05:02:49.647 UTC [280] ERROR:  mip_authz_revoked_session
concurrent-transactions	Stop containers	2026-09-12T05:03:03.9606851Z  2026-09-12 05:02:50.591 UTC [296] ERROR:  mip_authz_revoked_session
concurrent-transactions	Stop containers	2026-09-12T05:03:03.9615276Z  2026-09-12 05:02:51.427 UTC [314] ERROR:  mip_authz_revoked_session
concurrent-transactions	Stop containers	2026-09-12T05:03:03.9627277Z  2026-09-12 05:02:52.200 UTC [335] ERROR:  mip_request_replay_owner
concurrent-transactions	Stop containers	2026-09-12T05:03:03.9634247Z  2026-09-12 05:02:53.610 UTC [366] ERROR:  mip_request_replay_owner
concurrent-transactions	Stop containers	2026-09-12T05:03:03.9637133Z  2026-09-12 05:02:53.658 UTC [383] ERROR:  mip_request_replay_owner
concurrent-transactions	Stop containers	2026-09-12T05:03:03.9643727Z  2026-09-12 05:02:54.393 UTC [389] ERROR:  mip_authz_revoked_session
concurrent-transactions	Stop containers	2026-09-12T05:03:03.9652128Z  2026-09-12 05:02:55.451 UTC [406] ERROR:  mip_request_replay_owner
concurrent-transactions	Stop containers	2026-09-12T05:03:03.9657788Z  2026-09-12 05:02:56.886 UTC [428] ERROR:  mip_authz_revoked_session
concurrent-transactions	Stop containers	2026-09-12T05:03:03.9666011Z  2026-09-12 05:02:58.247 UTC [459] ERROR:  mip_authz_revoked_session
concurrent-transactions	Stop containers	2026-09-12T05:03:03.9677531Z  2026-09-12 05:02:59.571 UTC [493] ERROR:  mip_request_replay_owner
concurrent-transactions	Stop containers	2026-09-12T05:03:03.9684548Z  2026-09-12 05:03:02.189 UTC [562] ERROR:  mip_request_replay_owner
concurrent-transactions	Stop containers	2026-09-12T05:03:03.9687456Z  2026-09-12 05:03:02.237 UTC [584] ERROR:  mip_request_replay_owner
concurrent-transactions	Stop containers	2026-09-12T05:03:03.9693781Z  2026-09-12 05:03:03.526 UTC [590] ERROR:  mip_authz_revoked_session
```
