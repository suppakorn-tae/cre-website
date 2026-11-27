-- name: LockOwnedProject :one
-- Owner check and the lock that serialises version creation per project.
-- Another account's project, or a deleted one, looks absent.
SELECT id
FROM project
WHERE id = @id AND owner_id = @owner_id AND deleted_at IS NULL
FOR UPDATE;

-- name: OwnedProjectExists :one
-- Owner check without a lock, for reads. Another account's project, or a
-- deleted one, looks absent.
SELECT EXISTS (
    SELECT 1 FROM project
    WHERE id = @id AND owner_id = @owner_id AND deleted_at IS NULL
)::boolean AS owned;

-- name: InsertVersion :one
-- The number counts deleted versions too, so it is never reused.
INSERT INTO assessment_version (id, project_id, version_no, snap_value_baht,
    snap_start_date, snap_end_date, snap_score_decimals, snap_rm_decimals)
SELECT @id, p.id,
    COALESCE((SELECT max(v.version_no) FROM assessment_version v WHERE v.project_id = p.id), 0) + 1,
    p.value_baht, p.start_date, p.end_date, @score_decimals, @rm_decimals
FROM project p
WHERE p.id = @project_id
RETURNING id;

-- name: SnapshotRLThresholds :execrows
INSERT INTO version_rl_threshold (version_id, indicator_code, a, b, c, d, e)
SELECT @version_id, code, a, b, c, d, e FROM indicator;

-- name: SnapshotImpactThresholds :execrows
INSERT INTO version_impact_threshold (version_id, impact_code, a, b, c, d, e)
SELECT @version_id, code, a, b, c, d, e FROM impact_table;

-- name: ListVersions :many
-- Non-deleted versions of an owned project, newest first; version_id narrows
-- it to one. editable is true only for the highest number ever created,
-- deleted rows included (BR-11). Stats are 0 for a draft; callers ignore them.
SELECT v.id, v.project_id, v.version_no, v.status, v.submission_no,
    (v.version_no = (SELECT max(m.version_no) FROM assessment_version m
                     WHERE m.project_id = v.project_id))::boolean AS editable,
    v.snap_value_baht::float8 AS value_baht, v.snap_start_date, v.snap_end_date,
    v.created_at, v.submitted_at, v.progress_at_submit,
    COALESCE(s.high_count, 0)::int AS high_count,
    COALESCE(s.very_high_count, 0)::int AS very_high_count,
    COALESCE(s.average_rm, 0)::float8 AS average_rm,
    COALESCE(s.scored_count, 0)::int AS scored_count,
    COALESCE(s.vl_count, 0)::int AS vl_count,
    COALESCE(s.l_count, 0)::int AS l_count,
    COALESCE(s.m_count, 0)::int AS m_count,
    COALESCE(s.strategies_chosen, 0)::int AS strategies_chosen
FROM assessment_version v
JOIN project p ON p.id = v.project_id
LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE r.level = 'H') AS high_count,
        count(*) FILTER (WHERE r.level = 'VH') AS very_high_count,
        count(*) AS scored_count,
        count(*) FILTER (WHERE r.level = 'VL') AS vl_count,
        count(*) FILTER (WHERE r.level = 'L') AS l_count,
        count(*) FILTER (WHERE r.level = 'M') AS m_count,
        count(c.indicator_code) FILTER (WHERE r.level IN ('H', 'VH')) AS strategies_chosen,
        round(avg(r.rm), v.snap_rm_decimals::int) AS average_rm
    FROM risk_result r
    LEFT JOIN strategy_choice c ON c.version_id = r.version_id AND c.indicator_code = r.indicator_code
    WHERE r.version_id = v.id
) s ON v.status = 'submitted'
WHERE v.project_id = @project_id AND p.owner_id = @owner_id
    AND p.deleted_at IS NULL AND v.deleted_at IS NULL
    AND (sqlc.narg('version_id')::uuid IS NULL OR v.id = sqlc.narg('version_id'))
ORDER BY v.version_no DESC;

-- name: CountLiveVersions :one
-- Live versions of a project, read inside the delete transaction after the
-- project row is locked.
SELECT count(*)::int FROM assessment_version
WHERE project_id = @project_id AND deleted_at IS NULL;

-- name: SoftDeleteVersion :execrows
UPDATE assessment_version v SET deleted_at = now()
FROM project p
WHERE v.id = @id AND v.project_id = @project_id AND p.id = v.project_id
    AND p.owner_id = @owner_id AND p.deleted_at IS NULL AND v.deleted_at IS NULL;
