-- Dashboard read models (UC-20, BR-26). Every query is scoped by owner_id and
-- hides deleted projects and versions. They read stored risk_result rows;
-- nothing is recalculated. "Latest submitted" is the submitted, non-deleted
-- version with the highest version_no of a project; drafts never count.

-- name: DashboardKpis :one
WITH p AS (
    SELECT id, island_code, value_baht
    FROM project
    WHERE owner_id = @owner_id AND deleted_at IS NULL
), latest AS (
    SELECT DISTINCT ON (v.project_id) v.id
    FROM assessment_version v
    JOIN p ON p.id = v.project_id
    WHERE v.deleted_at IS NULL AND v.status = 'submitted'
    ORDER BY v.project_id, v.version_no DESC
)
SELECT
    (SELECT count(*) FROM p)::int AS project_count,
    (SELECT count(*) FROM assessment_version v JOIN p ON p.id = v.project_id
      WHERE v.deleted_at IS NULL)::int AS version_count,
    (SELECT count(*) FROM risk_result r JOIN latest l ON l.id = r.version_id
      WHERE r.level IN ('H', 'VH'))::int AS h_vh_indicator_count,
    (SELECT count(DISTINCT island_code) FROM p)::int AS island_count,
    (SELECT COALESCE(sum(value_baht), 0) FROM p)::text AS total_value_baht;

-- name: DashboardLevelCounts :many
WITH latest AS (
    SELECT DISTINCT ON (v.project_id) v.id
    FROM assessment_version v
    JOIN project p ON p.id = v.project_id
    WHERE p.owner_id = @owner_id AND p.deleted_at IS NULL
      AND v.deleted_at IS NULL AND v.status = 'submitted'
    ORDER BY v.project_id, v.version_no DESC
)
SELECT r.level, count(*)::int AS n
FROM latest l
JOIN risk_result r ON r.version_id = l.id
GROUP BY r.level;

-- name: DashboardProjectRisks :many
WITH latest AS (
    SELECT DISTINCT ON (v.project_id) v.id, v.project_id, v.version_no
    FROM assessment_version v
    JOIN project p ON p.id = v.project_id
    WHERE p.owner_id = @owner_id AND p.deleted_at IS NULL
      AND v.deleted_at IS NULL AND v.status = 'submitted'
    ORDER BY v.project_id, v.version_no DESC
)
SELECT p.id AS project_id, p.name, p.nickname, l.id AS version_id, l.version_no,
       (count(*) FILTER (WHERE r.level = 'H'))::int AS h_count,
       (count(*) FILTER (WHERE r.level = 'VH'))::int AS vh_count
FROM latest l
JOIN project p ON p.id = l.project_id
LEFT JOIN risk_result r ON r.version_id = l.id
GROUP BY p.id, p.name, p.nickname, l.id, l.version_no
ORDER BY (count(*) FILTER (WHERE r.level IN ('H', 'VH'))) DESC, p.name, p.id;
