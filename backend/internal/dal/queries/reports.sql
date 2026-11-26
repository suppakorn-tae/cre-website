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

-- name: FindLatestReportJob :one
-- The newest live report job of a version with what decides whether it is
-- still current (architecture decisions v2.14): the submission it was asked
-- for and the last change to what the PDF shows that is not a submission
-- (project fields, chosen strategies). A failed job does not count, so the
-- user may ask again and the previous done job stays the one to download.
SELECT j.id, j.status, j.created_at, rj.submission_no,
    GREATEST(
        p.updated_at,
        (SELECT max(sc.updated_at) FROM strategy_choice sc WHERE sc.version_id = rj.version_id)
    )::timestamptz AS inputs_changed_at
FROM job j
JOIN report_job rj ON rj.job_id = j.id
JOIN assessment_version v ON v.id = rj.version_id
JOIN project p ON p.id = v.project_id
WHERE rj.version_id = @version_id
  AND j.requested_by = @requested_by
  AND j.status IN ('queued', 'running', 'done')
ORDER BY j.created_at DESC, j.id DESC
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

-- name: ListReplacedReports :many
-- Done reports of the same version as a report job that a newer done report
-- of that version replaces (one current PDF per version, v2.14). The job
-- itself is listed when a newer one finished first. A row stays listed until
-- it is marked expired, so a failed delete is retried on the next run.
SELECT o.id, o.object_key::text AS object_key, ro.version_id
FROM report_job rn
JOIN report_job ro ON ro.version_id = rn.version_id
JOIN job o ON o.id = ro.job_id
WHERE rn.job_id = @job_id
  AND o.status = 'done'
  AND EXISTS (
      SELECT 1
      FROM report_job nr
      JOIN job n ON n.id = nr.job_id
      WHERE nr.version_id = ro.version_id
        AND n.status = 'done'
        AND (n.created_at, n.id) > (o.created_at, o.id)
  )
ORDER BY o.created_at, o.id;

-- name: MarkReportReplaced :execrows
-- The row stays for history; its object is gone. expired is the status of a
-- job whose file was removed (no new enum value).
UPDATE job SET status = 'expired'
WHERE id = @id AND kind = 'report' AND status = 'done';
