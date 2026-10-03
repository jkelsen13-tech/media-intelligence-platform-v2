export const ENVELOPE_VERSION = 'qik-private-authority-envelope-1'
export const POLICY_VERSION = 'qik-candidate-verification-policy-1'
export const SOURCE_HEAD = '675654be5a778c3173e682c4013031cb7796ed36'
export const TARGET = Object.freeze({ project: 'qikvmopbtijoebdqosyq', database: 'postgres',
  table: 'mip_factual.audit_connection', predicate: 'id IS TRUE', column: 'connection_string',
  operationId: 'a382dcdbf2924852b711b6a8b0c713eb',
  installManifestSha256: '221fb2f848b1bbea11e80057b0ad21e5349c8370a35531e2bdc48b6f95449320' })
export const BINDING_NAMES = Object.freeze([
  'trustedEvidenceAuthorityBinding', 'freshManagedIdentityAndAllGrantorBaseline',
  'exactSourceValueAndUnrelatedRowsPrivateBaseline', 'preciseProviderSetAndMissingColumnUpdatePermission',
  'caPathDigestReadability', 'certificateChainHostnameAndDistinctAuditorTls',
  'dblinkDetailAndServerLogSecrecyEvidence', 'secureCaptureAndExecutorClientWindow',
  'boundedRollbackOnlyOwnerAuthorization', 'independentPostRollbackVerifier', 'exactReviewedSourceClientAndManifestHashes',
])
export const FORWARD_PHASES = Object.freeze([
  'connect', 'begin', 'capture_baseline', 'capture_primary_backend', 'inspect_public_row_counts',
  'verify_private_logging_guard', 'capture_private_security', 'inspect_private_row_guards', 'capture_private_rows',
  'grant_set_membership', 'set_owner_for_grant', 'grant_column_update', 'reset_role_for_operation',
  'set_statement_deadline', 'set_lock_deadline', 'observe_operation_context', 'guarded_operation',
  'verify_private_transformed_rows', 'set_owner_for_cleanup', 'revoke_introduced_column_update',
  'reset_role_after_cleanup', 'revoke_introduced_set_membership', 'restore_statement_deadline',
  'restore_lock_deadline', 'verify_authority_restored',
])
export const RECOVERY_PHASES = Object.freeze([
  'cancel_and_drain', 'terminate_primary', 'rollback', 'verify_primary_session_rollback',
  'verify_private_rollback_rows', 'verify_security_rollback', 'verify_primary_completion', 'verify_independently',
])
export const SOURCE_FIELDS = Object.freeze(['frozenHead', 'guardedOperationSha256', 'sourceLockSha256',
  'bundleSha256', 'manifestSha256', 'clientArtifactSha256', 'authorityArtifactSha256'])
export const GUARDED_SOURCE_SHA256 = '5be14204dbd68b44ccaba07222bd6a5b4f9d9f627ce4750fce596211e6d6fb46'
