-- name: ListAuditLog :many
-- Newest first. Each filter is optional. The sort matches audit_log_time_ix,
-- the admin and target filters match audit_log_admin_ix and
-- audit_log_target_ix. The admin e-mail is '' (mapped to null by the service) once the account is
-- anonymised.
SELECT a.id, a.occurred_at, a.admin_id, COALESCE((SELECT x.email::text FROM account x WHERE x.id = a.admin_id), '')::text AS admin_email,
       a.action, a.target_type, a.target_id
FROM audit_log a
WHERE (sqlc.narg(admin_id)::uuid IS NULL OR a.admin_id = sqlc.narg(admin_id)::uuid)
  AND (sqlc.narg(action)::audit_action IS NULL OR a.action = sqlc.narg(action)::audit_action)
  AND (sqlc.narg(target_type)::text IS NULL OR a.target_type = sqlc.narg(target_type)::text)
  AND (sqlc.narg(target_id)::text IS NULL OR a.target_id = sqlc.narg(target_id)::text)
  AND (sqlc.narg(from_at)::timestamptz IS NULL OR a.occurred_at >= sqlc.narg(from_at)::timestamptz)
  AND (sqlc.narg(to_at)::timestamptz IS NULL OR a.occurred_at < sqlc.narg(to_at)::timestamptz)
ORDER BY a.occurred_at DESC, a.id DESC
LIMIT @page_size OFFSET @page_offset;

-- name: CountAuditLog :one
SELECT count(*)
FROM audit_log a
WHERE (sqlc.narg(admin_id)::uuid IS NULL OR a.admin_id = sqlc.narg(admin_id)::uuid)
  AND (sqlc.narg(action)::audit_action IS NULL OR a.action = sqlc.narg(action)::audit_action)
  AND (sqlc.narg(target_type)::text IS NULL OR a.target_type = sqlc.narg(target_type)::text)
  AND (sqlc.narg(target_id)::text IS NULL OR a.target_id = sqlc.narg(target_id)::text)
  AND (sqlc.narg(from_at)::timestamptz IS NULL OR a.occurred_at >= sqlc.narg(from_at)::timestamptz)
  AND (sqlc.narg(to_at)::timestamptz IS NULL OR a.occurred_at < sqlc.narg(to_at)::timestamptz);

-- name: GetAuditEntry :one
SELECT a.id, a.occurred_at, a.admin_id, COALESCE((SELECT x.email::text FROM account x WHERE x.id = a.admin_id), '')::text AS admin_email,
       a.action, a.target_type, a.target_id, a.old_value, a.new_value,
       a.request_id, a.ip_address
FROM audit_log a
WHERE a.id = @id;
