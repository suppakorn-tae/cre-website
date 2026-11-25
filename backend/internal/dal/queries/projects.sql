-- Every query takes the owner id and hides soft-deleted rows. A project of
-- another user and a deleted project look the same: no row.

-- name: CreateProject :one
INSERT INTO project (id, owner_id, name, nickname, island_code, island_other,
                     type_code, type_other, start_date, end_date, value_baht,
                     progress_pct, description)
VALUES (@id, @owner_id, @name, @nickname, @island_code, @island_other,
        @type_code, @type_other, @start_date, @end_date,
        CAST(CAST(@value_baht AS text) AS numeric), @progress_pct, @description)
RETURNING id;

-- name: GetProject :one
SELECT p.id, p.name, p.nickname, p.island_code, p.island_other, p.type_code,
       p.type_other, p.start_date, p.end_date, p.value_baht::text AS value_baht,
       p.progress_pct, p.description, p.created_at, p.updated_at,
       (SELECT count(*) FROM assessment_version v
         WHERE v.project_id = p.id AND v.deleted_at IS NULL)::int AS version_count,
       (SELECT COALESCE(max(v.version_no), 0) FROM assessment_version v
         WHERE v.project_id = p.id AND v.deleted_at IS NULL)::int AS latest_version_no,
       lv.id AS latest_version_id
FROM project p
LEFT JOIN assessment_version lv ON lv.id = (
    SELECT v.id FROM assessment_version v
    WHERE v.project_id = p.id AND v.deleted_at IS NULL
    ORDER BY v.version_no DESC LIMIT 1)
WHERE p.id = @id AND p.owner_id = @owner_id AND p.deleted_at IS NULL;

-- name: ListProjects :many
-- @q is a LIKE pattern already escaped by the caller, or empty for all.
-- latest_version_no is 0 and latest_version_id NULL when the project has no
-- live version.
SELECT p.id, p.name, p.nickname, p.island_code, p.island_other, p.type_code,
       p.type_other, p.start_date, p.end_date, p.value_baht::text AS value_baht,
       p.progress_pct, p.description, p.created_at, p.updated_at,
       (SELECT count(*) FROM assessment_version v
         WHERE v.project_id = p.id AND v.deleted_at IS NULL)::int AS version_count,
       (SELECT COALESCE(max(v.version_no), 0) FROM assessment_version v
         WHERE v.project_id = p.id AND v.deleted_at IS NULL)::int AS latest_version_no,
       lv.id AS latest_version_id,
       count(*) OVER ()::int AS total
FROM project p
LEFT JOIN assessment_version lv ON lv.id = (
    SELECT v.id FROM assessment_version v
    WHERE v.project_id = p.id AND v.deleted_at IS NULL
    ORDER BY v.version_no DESC LIMIT 1)
WHERE p.owner_id = @owner_id AND p.deleted_at IS NULL
  AND (@q::text = ''
       OR p.name ILIKE @q::text
       OR p.nickname ILIKE @q::text
       OR p.island_code ILIKE @q::text
       OR replace(p.island_code, '_', ' ') ILIKE @q::text
       OR p.island_other ILIKE @q::text)
ORDER BY p.created_at DESC, p.id DESC
LIMIT @page_limit OFFSET @page_offset;

-- name: UpdateProject :execrows
UPDATE project
SET name = @name, nickname = @nickname, island_code = @island_code,
    island_other = @island_other, type_code = @type_code,
    type_other = @type_other, start_date = @start_date, end_date = @end_date,
    value_baht = CAST(CAST(@value_baht AS text) AS numeric), progress_pct = @progress_pct,
    description = @description, updated_at = now()
WHERE id = @id AND owner_id = @owner_id AND deleted_at IS NULL;

-- name: SoftDeleteProject :one
-- One statement, so the project and its versions are hidden together.
-- No row means not found (missing, not owned or already deleted).
WITH p AS (
    UPDATE project
    SET deleted_at = now(), updated_at = now()
    WHERE project.id = @id AND project.owner_id = @owner_id AND project.deleted_at IS NULL
    RETURNING id
), v AS (
    UPDATE assessment_version
    SET deleted_at = now()
    WHERE assessment_version.project_id IN (SELECT p.id FROM p) AND assessment_version.deleted_at IS NULL
)
SELECT p.id FROM p;
