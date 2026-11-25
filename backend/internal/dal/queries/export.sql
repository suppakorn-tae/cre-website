-- name: InsertExportJob :exec
INSERT INTO export_job (job_id, scope, include_deleted)
VALUES (@job_id, @scope, @include_deleted);

-- name: InsertExportJobAccounts :exec
INSERT INTO export_job_account (job_id, account_id)
SELECT @job_id, unnest(@account_ids::uuid[]);

-- name: ListExistingAccountIDs :many
SELECT id FROM account WHERE id = ANY(@ids::uuid[]);

-- name: GetExportJob :one
-- Any admin may fetch any export; the handler sits behind RequireAdmin.
SELECT j.id, j.status, j.expires_at
FROM job j
JOIN export_job e ON e.job_id = j.id
WHERE j.id = @job_id;
