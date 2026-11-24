-- name: GetAccountSession :one
-- The record the session middleware checks on every request. Role, status
-- and session version come from here, never from the token.
SELECT id, role, status, session_version
FROM account
WHERE id = $1;

-- name: BumpSessionVersion :one
-- Ends every session of the account (password reset, deactivate, delete).
UPDATE account
SET session_version = session_version + 1, updated_at = now()
WHERE id = $1
RETURNING session_version;
