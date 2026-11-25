-- name: GetAccountForLogin :one
-- Looks an account up by e-mail for log in and password reset. A deleted
-- account has no e-mail, so it never matches.
SELECT id, password_hash, (google_sub IS NOT NULL)::boolean AS has_google,
       status, session_version
FROM account
WHERE email = $1;

-- name: SetAccountPasswordHash :execrows
-- Stores the new password hash after a reset. Only an active account changes.
UPDATE account
SET password_hash = $2, updated_at = now()
WHERE id = $1 AND status = 'active';
