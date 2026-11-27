-- name: LockSubmitVersion :one
-- Owner check and the lock that serialises submits of one version. Another
-- account's version, a deleted one or a deleted project looks absent. latest
-- is true only for the highest number ever created, deleted rows included.
SELECT v.id, v.snap_value_baht::float8 AS value_baht, v.snap_start_date, v.snap_end_date,
    v.snap_score_decimals, v.snap_rm_decimals,
    (v.version_no = (SELECT max(m.version_no) FROM assessment_version m
                     WHERE m.project_id = v.project_id))::boolean AS latest
FROM assessment_version v
JOIN project p ON p.id = v.project_id
WHERE v.id = @version_id AND v.project_id = @project_id AND p.owner_id = @owner_id
    AND p.deleted_at IS NULL AND v.deleted_at IS NULL
FOR UPDATE OF v;

-- name: ListCompleteAnswers :many
-- Complete indicators (BR-09): x, y1, y2 and at least one y3 option.
SELECT a.indicator_code, a.x::float8 AS x, a.y1_value::float8 AS y1_value,
    a.y1_unit AS y1_unit, a.y2_value::float8 AS y2_value, a.y2_unit AS y2_unit,
    array_agg(y.option_code::text ORDER BY y.option_code)::text[] AS y3
FROM answer a
JOIN answer_y3 y ON y.version_id = a.version_id AND y.indicator_code = a.indicator_code
WHERE a.version_id = @version_id
    AND a.x IS NOT NULL AND a.y1_value IS NOT NULL AND a.y2_value IS NOT NULL
GROUP BY a.indicator_code, a.x, a.y1_value, a.y1_unit, a.y2_value, a.y2_unit
ORDER BY a.indicator_code;

-- name: ListSnapshotRL :many
-- Raw numerics: a missing threshold stays NULL.
SELECT indicator_code, a, b, c, d, e
FROM version_rl_threshold
WHERE version_id = @version_id;

-- name: ListSnapshotImpact :many
SELECT impact_code, a::float8 AS a, b::float8 AS b, c::float8 AS c,
    d::float8 AS d, e::float8 AS e
FROM version_impact_threshold
WHERE version_id = @version_id;

-- name: UpsertRiskResults :exec
-- Upserted, not replaced, so a chosen strategy survives a resubmission.
-- Parallel arrays, one element per scored indicator (codes are distinct).
INSERT INTO risk_result (version_id, indicator_code, x, y1_pct, y2_pct,
    rl, ri_c, ri_t, ri_e, ri_max, rm, level)
SELECT @version_id::uuid, (@codes::text[])[g.i], (@x::float8[])[g.i], (@y1_pct::float8[])[g.i],
    (@y2_pct::float8[])[g.i], (@rl::float8[])[g.i], (@ri_c::float8[])[g.i],
    (@ri_t::float8[])[g.i], (@ri_e::float8[])[g.i], (@ri_max::float8[])[g.i],
    (@rm::float8[])[g.i], (@levels::text[])[g.i]::risk_level
FROM generate_series(1, cardinality(@codes::text[])) AS g(i)
ON CONFLICT (version_id, indicator_code) DO UPDATE SET
    x = EXCLUDED.x, y1_pct = EXCLUDED.y1_pct, y2_pct = EXCLUDED.y2_pct,
    rl = EXCLUDED.rl, ri_c = EXCLUDED.ri_c, ri_t = EXCLUDED.ri_t, ri_e = EXCLUDED.ri_e,
    ri_max = EXCLUDED.ri_max, rm = EXCLUDED.rm, level = EXCLUDED.level;

-- name: DeleteResultsAdvice :exec
DELETE FROM result_advice_list
WHERE version_id = @version_id AND indicator_code = ANY(@codes::text[]);

-- name: InsertResultsAdvice :exec
-- Parallel arrays: one element per (indicator, advice list) pair.
INSERT INTO result_advice_list (version_id, indicator_code, list)
SELECT @version_id::uuid, (@codes::text[])[g.i], (@lists::text[])[g.i]::advice_list
FROM generate_series(1, cardinality(@codes::text[])) AS g(i);

-- name: DeleteStaleResults :exec
-- Results of indicators that are no longer complete; advice lists and
-- strategies cascade.
DELETE FROM risk_result
WHERE version_id = @version_id AND indicator_code <> ALL(@kept::text[]);

-- name: DeleteLowRiskStrategies :exec
-- A strategy only exists for H and VH results.
DELETE FROM strategy_choice s
USING risk_result r
WHERE s.version_id = @version_id AND r.version_id = s.version_id
    AND r.indicator_code = s.indicator_code AND r.level NOT IN ('H', 'VH');

-- name: MarkVersionSubmitted :one
UPDATE assessment_version v
SET status = 'submitted', submission_no = v.submission_no + 1,
    submitted_at = now(), progress_at_submit = p.progress_pct
FROM project p
WHERE v.id = @version_id AND p.id = v.project_id
RETURNING v.submitted_at;
