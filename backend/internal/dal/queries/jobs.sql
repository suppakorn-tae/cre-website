-- name: InsertJob :one
INSERT INTO job (id, kind, requested_by)
VALUES (@id, @kind, @requested_by)
RETURNING *;

-- name: GetJob :one
SELECT * FROM job WHERE id = @id;

-- name: GetJobForRequester :one
-- The owner check lives in the query: another account's job looks absent.
SELECT * FROM job WHERE id = @id AND requested_by = @requested_by;

-- name: MarkJobRunning :one
-- A job left running by a crashed worker may be claimed again.
UPDATE job
SET status = 'running', started_at = now()
WHERE id = @id AND status IN ('queued', 'running')
RETURNING *;

-- name: MarkJobDone :execrows
UPDATE job
SET status = 'done', object_key = @object_key, finished_at = now(), expires_at = @expires_at
WHERE id = @id AND status = 'running';

-- name: MarkJobFailed :execrows
UPDATE job
SET status = 'failed', error = @error, finished_at = now()
WHERE id = @id AND status IN ('queued', 'running');

-- name: MarkJobExpired :execrows
UPDATE job SET status = 'expired' WHERE id = @id AND status = 'done';

-- name: ListUnfinishedJobs :many
SELECT * FROM job WHERE status IN ('queued', 'running') ORDER BY created_at;
