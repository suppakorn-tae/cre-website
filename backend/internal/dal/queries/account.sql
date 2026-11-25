-- name: AccountGetOwn :one
-- The signed-in user's own account (UC-04 1). Never takes an id from the
-- request: the handler passes the session's account id.
SELECT id, email, organisation, role, status,
       (password_hash IS NOT NULL)::boolean AS has_password,
       (google_sub IS NOT NULL)::boolean AS has_google,
       terms_accepted_at, created_at
FROM account
WHERE id = $1;

-- name: AccountLockOwn :one
-- Locks the row for the rest of the transaction and returns the hash for
-- re-authentication.
SELECT id, status, password_hash FROM account WHERE id = $1 FOR UPDATE;

-- name: AccountSetOrganisation :exec
UPDATE account SET organisation = @organisation, updated_at = now()
WHERE id = @id AND status = 'active';

-- name: AccountSetOwnPassword :exec
UPDATE account SET password_hash = @password_hash, updated_at = now()
WHERE id = @id AND status = 'active';
