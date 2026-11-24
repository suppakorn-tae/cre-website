-- name: AccountEmailExists :one
-- Sign-up start and verify: is the e-mail taken? Deleted accounts have no
-- e-mail, so they never match.
SELECT EXISTS (SELECT 1 FROM account WHERE email = $1)::boolean AS taken;

-- name: CreateRegisteredAccount :one
-- Created only after the OTP was verified. Role and status take their
-- defaults (user, active); the e-mail counts as verified.
INSERT INTO account (id, email, password_hash, organisation, pseudonym, terms_accepted_at)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, email, organisation, session_version, terms_accepted_at, created_at;
