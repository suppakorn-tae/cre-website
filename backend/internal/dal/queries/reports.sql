-- name: GetVersionForReport :one
-- Owner and deletion checks live in the query: a version of another
-- account, or a deleted version or project, looks absent.
SELECT v.id, v.status, v.submission_no
FROM assessment_version v
JOIN project p ON p.id = v.project_id
WHERE v.id = @version_id
  AND p.id = @project_id
  AND p.owner_id = @owner_id
  AND v.deleted_at IS NULL
  AND p.deleted_at IS NULL;

-- name: LockReportRequest :exec
-- Serialises report requests for one version, so that two requests for the
-- same submission cannot both insert a job.
SELECT pg_advisory_xact_lock(hashtextextended(@version_id::text, 0));

-- name: FindReportJob :one
-- The live job for a submission; a failed job does not count, so the user
-- may ask again.
SELECT j.id
FROM job j
JOIN report_job rj ON rj.job_id = j.id
WHERE rj.version_id = @version_id
  AND rj.submission_no = @submission_no
  AND j.requested_by = @requested_by
  AND j.status IN ('queued', 'running', 'done')
ORDER BY j.created_at DESC
LIMIT 1;

-- name: InsertReportJob :exec
INSERT INTO report_job (job_id, version_id, submission_no)
VALUES (@job_id, @version_id, @submission_no);

-- name: GetReportForDownload :one
-- Owner check in SQL (admins get no access); absent when the version or its
-- project is deleted.
SELECT j.status, j.object_key, v.version_no, p.nickname
FROM job j
JOIN report_job rj ON rj.job_id = j.id
JOIN assessment_version v ON v.id = rj.version_id
JOIN project p ON p.id = v.project_id
WHERE j.id = @job_id
  AND j.kind = 'report'
  AND j.requested_by = @requested_by
  AND v.deleted_at IS NULL
  AND p.deleted_at IS NULL;
