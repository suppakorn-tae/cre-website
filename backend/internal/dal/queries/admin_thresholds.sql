-- name: AdminListRlThresholds :many
-- Thresholds of every indicator with the display unit in Thai, in catalogue
-- order.
SELECT i.code, i.direction, t.unit,
       i.a, i.b, i.c, i.d, i.e,
       i.updated_at
FROM indicator i
JOIN factor f ON f.code = i.factor_code
JOIN indicator_text t ON t.indicator_code = i.code AND t.locale = 'th'
ORDER BY f.sort_no, i.f_code;

-- name: AdminGetRlThreshold :one
SELECT i.code, i.direction, t.unit,
       i.a, i.b, i.c, i.d, i.e,
       i.updated_at
FROM indicator i
JOIN indicator_text t ON t.indicator_code = i.code AND t.locale = 'th'
WHERE i.code = @code;

-- name: AdminLockRlThreshold :one
-- Locks the indicator row for the edit and returns its current thresholds.
SELECT i.direction, i.a, i.b, i.c, i.d, i.e
FROM indicator i
WHERE i.code = @code
FOR UPDATE;

-- name: AdminUpdateRlThreshold :exec
-- Writes the catalogue row only. Version snapshots (version_rl_threshold)
-- are separate tables and are never touched.
UPDATE indicator
SET a = sqlc.narg('a')::float8, b = sqlc.narg('b')::float8, c = sqlc.narg('c')::float8,
    d = sqlc.narg('d')::float8, e = sqlc.narg('e')::float8,
    updated_by = @updated_by, updated_at = now()
WHERE code = @code;
