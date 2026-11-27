-- name: GetAnswerVersionAccess :one
-- Owner and editability live in the query: a version of another account, of a
-- deleted project or of a deleted version looks absent (no row). A version is
-- editable only while it is the highest version_no ever created for the
-- project (deleted versions count, BR-11). The row lock keeps the version
-- from being superseded while the answers are written.
SELECT (v.version_no = (
    SELECT max(m.version_no) FROM assessment_version m WHERE m.project_id = v.project_id
))::boolean AS editable
FROM assessment_version v
JOIN project p ON p.id = v.project_id
WHERE v.id = @version_id
  AND v.project_id = @project_id
  AND p.owner_id = @owner_id
  AND p.deleted_at IS NULL
  AND v.deleted_at IS NULL
FOR SHARE OF v;

-- name: ListExistingIndicatorCodes :many
SELECT code FROM indicator WHERE code = ANY(@codes::text[]);

-- name: UpsertAnswers :exec
-- Replaces the stored answers of many indicators in one statement; NULL
-- columns are cleared. Arrays are parallel (picked by index, see below); an empty string stands for NULL.
-- Numbers travel as text so they are stored exactly as entered. Codes must be
-- distinct (ValidateAnswers rejects duplicates).
INSERT INTO answer (version_id, indicator_code, x, y1_value, y1_unit, y2_value, y2_unit)
SELECT @version_id::uuid, (@codes::text[])[g.i], NULLIF((@x::text[])[g.i], '')::numeric,
    NULLIF((@y1_values::text[])[g.i], '')::numeric,
    NULLIF((@y1_units::text[])[g.i], '')::cost_unit,
    NULLIF((@y2_values::text[])[g.i], '')::numeric,
    NULLIF((@y2_units::text[])[g.i], '')::time_unit
FROM generate_series(1, cardinality(@codes::text[])) AS g(i)
ON CONFLICT (version_id, indicator_code) DO UPDATE
SET x = EXCLUDED.x,
    y1_value = EXCLUDED.y1_value,
    y1_unit = EXCLUDED.y1_unit,
    y2_value = EXCLUDED.y2_value,
    y2_unit = EXCLUDED.y2_unit,
    updated_at = now();

-- name: DeleteAnswersY3 :exec
DELETE FROM answer_y3 WHERE version_id = @version_id AND indicator_code = ANY(@codes::text[]);

-- name: InsertAnswersY3 :exec
-- Parallel arrays: one element per (indicator, option) pair. sqlc cannot type a
-- multi-argument unnest, so rows are picked by index instead.
INSERT INTO answer_y3 (version_id, indicator_code, option_code)
SELECT @version_id::uuid, (@codes::text[])[g.i], (@options::text[])[g.i]
FROM generate_series(1, cardinality(@codes::text[])) AS g(i);

-- name: ListAnswers :many
SELECT * FROM answer WHERE version_id = @version_id ORDER BY indicator_code;

-- name: ListAnswerY3 :many
SELECT * FROM answer_y3 WHERE version_id = @version_id ORDER BY indicator_code, option_code;
