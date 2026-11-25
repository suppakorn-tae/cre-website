-- Version compare, trend and per-indicator RM (UC-21, FR-45, FR-46). Every
-- query is scoped by owner_id and hides deleted projects and versions. They
-- read stored risk_result rows; nothing is recalculated.

-- name: CompareProjectOwned :one
SELECT id FROM project
WHERE id = @id AND owner_id = @owner_id AND deleted_at IS NULL;

-- name: CompareVersionMetrics :one
-- One non-deleted version of an owned project with its figures. Drafts come
-- back too (status tells them apart); their figures are ignored.
SELECT v.id, v.version_no, v.status, v.submitted_at,
    COALESCE(v.progress_at_submit, 0)::int AS progress_at_submit,
    s.scored_count::int AS scored_count, s.h_vh_count::int AS h_vh_count,
    COALESCE(round(s.avg_rm, v.snap_rm_decimals::int), 0)::float8 AS avg_rm
FROM assessment_version v
JOIN project p ON p.id = v.project_id
CROSS JOIN LATERAL (
    SELECT count(*) AS scored_count,
        count(*) FILTER (WHERE r.level IN ('H', 'VH')) AS h_vh_count,
        avg(r.rm) AS avg_rm
    FROM risk_result r WHERE r.version_id = v.id
) s
WHERE v.id = @id AND v.project_id = @project_id AND p.owner_id = @owner_id
    AND p.deleted_at IS NULL AND v.deleted_at IS NULL;

-- name: ComparePreviousSubmitted :one
-- The submitted, non-deleted version just before version_no.
SELECT id FROM assessment_version
WHERE project_id = @project_id AND version_no < @version_no
    AND status = 'submitted' AND deleted_at IS NULL
ORDER BY version_no DESC
LIMIT 1;

-- name: CompareLevelChanges :many
-- Indicators scored in both versions whose level differs.
SELECT b.indicator_code, i.factor_code, b.level AS base_level, t.level AS target_level,
    b.rm::float8 AS base_rm, t.rm::float8 AS target_rm
FROM risk_result b
JOIN risk_result t ON t.indicator_code = b.indicator_code AND t.version_id = @target_id
JOIN indicator i ON i.code = b.indicator_code
WHERE b.version_id = @base_id AND b.level <> t.level
ORDER BY i.factor_code, b.indicator_code;

-- name: TrendPoints :many
-- All non-deleted versions of an owned project, ascending by number, with the
-- level counts of each one.
SELECT v.id, v.version_no, v.status, v.submitted_at,
    COALESCE(round(s.avg_rm, v.snap_rm_decimals::int), 0)::float8 AS avg_rm,
    s.vl::int AS vl, s.l::int AS l, s.m::int AS m, s.h::int AS h, s.vh::int AS vh
FROM assessment_version v
JOIN project p ON p.id = v.project_id
CROSS JOIN LATERAL (
    SELECT avg(r.rm) AS avg_rm,
        count(*) FILTER (WHERE r.level = 'VL') AS vl,
        count(*) FILTER (WHERE r.level = 'L') AS l,
        count(*) FILTER (WHERE r.level = 'M') AS m,
        count(*) FILTER (WHERE r.level = 'H') AS h,
        count(*) FILTER (WHERE r.level = 'VH') AS vh
    FROM risk_result r WHERE r.version_id = v.id
) s
WHERE v.project_id = @project_id AND p.owner_id = @owner_id
    AND p.deleted_at IS NULL AND v.deleted_at IS NULL
ORDER BY v.version_no;

-- name: IndicatorRmValues :many
-- RM of every indicator in the submitted, non-deleted versions of an owned
-- project, narrowed by factor and indicator codes (empty arrays keep all).
SELECT r.version_id, r.indicator_code, i.factor_code, r.rm::float8 AS rm, r.level
FROM risk_result r
JOIN assessment_version v ON v.id = r.version_id
JOIN project p ON p.id = v.project_id
JOIN indicator i ON i.code = r.indicator_code
WHERE v.project_id = @project_id AND p.owner_id = @owner_id
    AND p.deleted_at IS NULL AND v.deleted_at IS NULL AND v.status = 'submitted'
    AND (cardinality(@factor_codes::text[]) = 0 OR i.factor_code = ANY(@factor_codes::text[]))
    AND (cardinality(@indicator_codes::text[]) = 0 OR r.indicator_code = ANY(@indicator_codes::text[]))
ORDER BY i.factor_code, r.indicator_code;
