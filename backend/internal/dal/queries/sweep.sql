-- name: ListExpiredExports :many
-- Done exports past their expiry. Served by job_expiry_ix.
SELECT id, object_key
FROM job
WHERE kind = 'export' AND status = 'done' AND expires_at <= @now::timestamptz
ORDER BY expires_at, id;

-- name: FailStuckJobs :many
-- Ends jobs a dead worker left behind: running past the cutoff of their kind,
-- or queued since before the queued cutoff. A job that finished meanwhile is
-- not touched, because the status is checked in the same statement.
UPDATE job
SET status = 'failed', error = 'timed out', finished_at = @now::timestamptz
WHERE (status = 'running' AND started_at < CASE kind
          WHEN 'report' THEN @report_cutoff::timestamptz
          ELSE @export_cutoff::timestamptz END)
   OR (status = 'queued' AND created_at < @queued_cutoff::timestamptz)
RETURNING id, kind, started_at;
