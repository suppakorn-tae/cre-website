-- name: AdminListUsers :many
-- Users with project and version counts only (BR-21): never any project or
-- version content. Soft-deleted projects and versions are not counted.
SELECT a.id, a.email, a.organisation, a.role, a.status,
       (a.password_hash IS NOT NULL)::boolean AS has_password,
       (a.google_sub IS NOT NULL)::boolean AS has_google,
       a.created_at, a.updated_at,
       (SELECT count(*) FROM project p
         WHERE p.owner_id = a.id AND p.deleted_at IS NULL)::int AS project_count,
       (SELECT count(*) FROM assessment_version v
          JOIN project p ON p.id = v.project_id
         WHERE p.owner_id = a.id AND p.deleted_at IS NULL AND v.deleted_at IS NULL)::int AS version_count
FROM account a
WHERE (sqlc.narg('q')::text IS NULL
       OR a.email::text ILIKE sqlc.narg('q')::text
       OR a.organisation ILIKE sqlc.narg('q')::text)
  AND (sqlc.narg('role')::user_role IS NULL OR a.role = sqlc.narg('role')::user_role)
  AND (sqlc.narg('status')::account_status IS NULL OR a.status = sqlc.narg('status')::account_status)
ORDER BY a.created_at DESC, a.id
LIMIT @page_limit OFFSET @page_offset;

-- name: AdminCountUsers :one
SELECT count(*)::int
FROM account a
WHERE (sqlc.narg('q')::text IS NULL
       OR a.email::text ILIKE sqlc.narg('q')::text
       OR a.organisation ILIKE sqlc.narg('q')::text)
  AND (sqlc.narg('role')::user_role IS NULL OR a.role = sqlc.narg('role')::user_role)
  AND (sqlc.narg('status')::account_status IS NULL OR a.status = sqlc.narg('status')::account_status);

-- name: AdminGetUser :one
SELECT a.id, a.email, a.organisation, a.role, a.status,
       (a.password_hash IS NOT NULL)::boolean AS has_password,
       (a.google_sub IS NOT NULL)::boolean AS has_google,
       a.created_at, a.updated_at,
       (SELECT count(*) FROM project p
         WHERE p.owner_id = a.id AND p.deleted_at IS NULL)::int AS project_count,
       (SELECT count(*) FROM assessment_version v
          JOIN project p ON p.id = v.project_id
         WHERE p.owner_id = a.id AND p.deleted_at IS NULL AND v.deleted_at IS NULL)::int AS version_count
FROM account a
WHERE a.id = $1;

-- name: AdminLockAccount :one
-- Locks the target row for the rest of the transaction.
SELECT id, role, status FROM account WHERE id = $1 FOR UPDATE;

-- name: AdminLockActiveAdmins :many
-- Locks every active admin row so two concurrent demotions cannot both pass
-- the last-admin check.
SELECT id FROM account WHERE role = 'admin' AND status = 'active' ORDER BY id FOR UPDATE;

-- name: AdminSetRole :exec
UPDATE account SET role = @role, updated_at = now() WHERE id = @id;

-- name: AdminSetStatus :exec
-- Deactivate or reactivate. Deleted accounts are never touched here.
UPDATE account SET status = @status, updated_at = now()
WHERE id = @id AND status <> 'deleted';

-- name: AdminAnonymiseAccount :exec
-- Anonymising delete (UC-04 1b, BR-13): e-mail, password hash and Google id
-- removed, status deleted. Pseudonym, organisation and projects stay.
-- IO-39 (user self-delete) should reuse this query.
UPDATE account
SET email = NULL, password_hash = NULL, google_sub = NULL,
    status = 'deleted', deleted_at = now(), updated_at = now()
WHERE id = $1 AND status <> 'deleted';
