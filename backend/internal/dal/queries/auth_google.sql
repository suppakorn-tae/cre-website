-- name: GetAccountByGoogleSub :one
-- Google sign-in: the account linked to this Google id. Deleted accounts
-- have no Google id, so they never match.
SELECT id, status, session_version, (password_hash IS NOT NULL)::boolean AS has_password,
       (google_sub IS NOT NULL)::boolean AS has_google
FROM account
WHERE google_sub = $1;

-- name: GetAccountForGoogleByEmail :one
-- Google sign-in with a verified e-mail that is not linked yet (BR-16).
SELECT id, status, session_version, (password_hash IS NOT NULL)::boolean AS has_password,
       (google_sub IS NOT NULL)::boolean AS has_google
FROM account
WHERE email = $1;

-- name: GetAccountForGoogleByID :one
-- Link, unlink and re-authentication of the signed-in account.
SELECT id, status, session_version, (password_hash IS NOT NULL)::boolean AS has_password,
       (google_sub IS NOT NULL)::boolean AS has_google
FROM account
WHERE id = $1;

-- name: LinkGoogleSub :execrows
-- Stores the Google id on an active account that has none yet. A Google id
-- used by another account fails on account_google_sub_uq.
UPDATE account
SET google_sub = $2, updated_at = now()
WHERE id = $1 AND status = 'active' AND google_sub IS NULL;

-- name: UnlinkGoogleSub :execrows
-- Removes the Google id, only while a password remains to sign in with.
UPDATE account
SET google_sub = NULL, updated_at = now()
WHERE id = $1 AND status = 'active' AND google_sub IS NOT NULL AND password_hash IS NOT NULL;

-- name: CreateGoogleAccount :one
-- Created when a new Google user accepts the retention notice and terms. No
-- password; Google has verified the e-mail.
INSERT INTO account (id, email, google_sub, organisation, pseudonym, terms_accepted_at)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, email, organisation, session_version, terms_accepted_at, created_at;
