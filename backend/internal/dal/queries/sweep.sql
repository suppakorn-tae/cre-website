-- name: ListExpiredExports :many
-- Done exports past their expiry. Served by job_expiry_ix.
SELECT id, object_key
FROM job
WHERE kind = 'export' AND status = 'done' AND expires_at <= @now::timestamptz
ORDER BY expires_at, id;
