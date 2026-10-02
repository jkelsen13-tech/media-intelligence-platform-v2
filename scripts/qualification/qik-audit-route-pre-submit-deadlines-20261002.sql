-- PROPOSAL-ONLY client submission fragment, not authority or live authorization.
-- In an already-open transaction, submit EACH SET command and wait for completion
-- BEFORE submitting the unchanged guarded DO. After any error, ROLLBACK explicitly.
SET LOCAL statement_timeout = '7000ms';
SET LOCAL lock_timeout = '500ms';
