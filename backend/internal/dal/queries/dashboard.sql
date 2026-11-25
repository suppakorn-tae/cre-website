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

-- name: DashboardTopIndicators :many
-- Indicators ranked by the number of projects with H or VH in the latest
-- submitted version. Ties: more VH first, then indicator code (BR-26).
WITH latest AS (
    SELECT DISTINCT ON (v.project_id) v.id
    FROM assessment_version v
    JOIN project p ON p.id = v.project_id
    WHERE p.owner_id = @owner_id AND p.deleted_at IS NULL
      AND v.deleted_at IS NULL AND v.status = 'submitted'
    ORDER BY v.project_id, v.version_no DESC
)
SELECT r.indicator_code, i.factor_code,
       (count(*) FILTER (WHERE r.level = 'H'))::int AS h_count,
       (count(*) FILTER (WHERE r.level = 'VH'))::int AS vh_count
FROM latest l
JOIN risk_result r ON r.version_id = l.id AND r.level IN ('H', 'VH')
JOIN indicator i ON i.code = r.indicator_code
GROUP BY r.indicator_code, i.factor_code
ORDER BY count(*) DESC, (count(*) FILTER (WHERE r.level = 'VH')) DESC, r.indicator_code
LIMIT 10;

-- name: DashboardProjectsPanel :many
-- @q is a LIKE pattern already escaped by the caller, or empty for all. It
-- matches name, nickname, the island code (read with spaces, "koh samui"),
-- the free-text island, and the islands in @island_codes, which the caller
-- picked by Thai name (the island table holds codes only).
-- Columns of the submitted version are zero values when submitted is false
-- (sqlc cannot mark lateral join columns nullable); avg_rm is '' when no
-- indicator is scored. Projects without a live version are not listed: the
-- contract needs a latest version id.
SELECT p.id, p.name, p.nickname, p.island_code, p.island_other, p.type_code,
       p.type_other, p.value_baht::text AS value_baht, p.progress_pct,
       (SELECT count(*) FROM assessment_version c
         WHERE c.project_id = p.id AND c.deleted_at IS NULL)::int AS version_count,
       la.id AS latest_version_id, la.version_no AS latest_version_no,
       la.status AS latest_version_status,
       (ls.id IS NOT NULL)::bool AS submitted,
       COALESCE(ls.id, '00000000-0000-0000-0000-000000000000'::uuid) AS latest_submitted_version_id,
       COALESCE(s.h_vh_count, 0)::int AS h_vh_count,
       COALESCE(s.avg_rm, '')::text AS avg_rm,
       count(*) OVER ()::int AS total
FROM project p
CROSS JOIN LATERAL (
    SELECT v.id, v.version_no, v.status FROM assessment_version v
    WHERE v.project_id = p.id AND v.deleted_at IS NULL
    ORDER BY v.version_no DESC LIMIT 1
) la
LEFT JOIN LATERAL (
    SELECT v.id, v.snap_rm_decimals FROM assessment_version v
    WHERE v.project_id = p.id AND v.deleted_at IS NULL AND v.status = 'submitted'
    ORDER BY v.version_no DESC LIMIT 1
) ls ON true
LEFT JOIN LATERAL (
    SELECT (count(*) FILTER (WHERE r.level IN ('H', 'VH')))::int AS h_vh_count,
           round(avg(r.rm), ls.snap_rm_decimals::int)::text AS avg_rm
    FROM risk_result r WHERE r.version_id = ls.id
) s ON ls.id IS NOT NULL
WHERE p.owner_id = @owner_id AND p.deleted_at IS NULL
  AND (@q::text = ''
       OR p.name ILIKE @q::text
       OR p.nickname ILIKE @q::text
       OR replace(p.island_code, '_', ' ') ILIKE @q::text
       OR p.island_other ILIKE @q::text
       OR p.island_code = ANY(@island_codes::text[]))
ORDER BY p.created_at DESC, p.id DESC
LIMIT @page_limit OFFSET @page_offset;

-- name: DashboardIslands :many
-- Projects with a live version, by island order then name.
SELECT p.island_code, p.id AS project_id, p.name, p.nickname, p.progress_pct,
       la.id AS latest_version_id, (ls.id IS NOT NULL)::bool AS submitted,
       COALESCE(s.h_vh_count, 0)::int AS h_vh_count
FROM project p
JOIN island isl ON isl.code = p.island_code
CROSS JOIN LATERAL (
    SELECT v.id FROM assessment_version v
    WHERE v.project_id = p.id AND v.deleted_at IS NULL
    ORDER BY v.version_no DESC LIMIT 1
) la
LEFT JOIN LATERAL (
    SELECT v.id FROM assessment_version v
    WHERE v.project_id = p.id AND v.deleted_at IS NULL AND v.status = 'submitted'
    ORDER BY v.version_no DESC LIMIT 1
) ls ON true
LEFT JOIN LATERAL (
    SELECT (count(*) FILTER (WHERE r.level IN ('H', 'VH')))::int AS h_vh_count
    FROM risk_result r WHERE r.version_id = ls.id
) s ON ls.id IS NOT NULL
WHERE p.owner_id = @owner_id AND p.deleted_at IS NULL
ORDER BY isl.sort_no, p.name, p.id;
