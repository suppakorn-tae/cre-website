-- name: AdminGetImpactTables :many
SELECT code, a::float8 AS a, b::float8 AS b, c::float8 AS c, d::float8 AS d, e::float8 AS e, updated_at
FROM impact_table
ORDER BY code;

-- name: AdminLockImpactTables :many
-- Locks both rows, in key order, for the edit.
SELECT code, a::float8 AS a, b::float8 AS b, c::float8 AS c, d::float8 AS d, e::float8 AS e, updated_at
FROM impact_table
ORDER BY code
FOR UPDATE;

-- name: AdminUpdateImpactTable :exec
-- Writes the catalogue row only, never version_impact_threshold.
UPDATE impact_table
SET a = @a::float8, b = @b::float8, c = @c::float8, d = @d::float8, e = @e::float8,
    updated_by = @updated_by, updated_at = now()
WHERE code = @code;
