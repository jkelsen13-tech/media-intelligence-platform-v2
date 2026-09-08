# Comparison worker release threshold — 8 September 2026

The live Manus source-comparison-run v9 was recovered in full before editing.
Its scorer converts autoApprovalThreshold with Number(). JavaScript converts
null, blank strings, booleans and some arrays into valid numbers; null becomes
zero. With the independent fixture/enable flags true, a missing threshold can
therefore authorize a candidate. The regression reproduces that exact failure
against the retained v9 scorer.

The observed release policies for model versions .4 and .5 both have
auto_approval_enabled=false and auto_approval_threshold=null. No incorrect
production approval is established by this audit. No policy values are changed.

The reviewed deployment package is
supabase/runtime-snapshots/source-comparison-run-v10/. It contains the complete
live entrypoint, scorer and lexicon, preserving scheduled/owner authorization,
membership scoring and current handler behavior. Only threshold admission is
changed: it requires an explicit number or nonblank numeric string, finite and
within [0,1]. Explicit zero remains valid. Fixture status, enablement and hard
rejections remain independent gates. All numerical scores and valid-threshold
results are unchanged.

The older supabase/functions/source-comparison-run directory is not a valid
replacement for the recovered live runtime. Do not deploy that older directory
as part of consolidation. Runtime deployment/readback evidence is recorded on
PR #117; deployment targets the existing Manus function, with JWT verification
retained, not a new survivor schedule.

Four tests cover the demonstrated null-to-zero bug and malformed thresholds,
valid-policy semantic parity, independent hard/fixture/enable gates, the full
existing membership counterexample suite, and byte equality of the unchanged
entrypoint and lexicon with the recovered live files.

This is hardening of a required legacy dependency, not collector cutover.
The broad pending-job acknowledgement race, mutable projection replacement,
version-bound input/output reconciliation, historical deltas, Auth, spatial and
external-runtime closure remain open. No project is SAFE TO RETIRE. The intended
survivor remains qikvmopbtijoebdqosyq; no data is promoted or published here.

Current Supabase auth guidance was checked:
https://supabase.com/docs/guides/functions/auth-headers
