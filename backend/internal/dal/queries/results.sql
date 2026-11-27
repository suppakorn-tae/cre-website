-- name: GetResultsVersion :one
-- A submitted, non-deleted version of an owned project. Another account's
-- version, a draft and a deleted one look absent. editable is true only for
-- the highest number ever created, deleted rows included (BR-11). The average
-- uses the rounding frozen in the version.
SELECT v.id, v.submitted_at,
    (v.version_no = (SELECT max(m.version_no) FROM assessment_version m
                     WHERE m.project_id = v.project_id))::boolean AS editable,
    COALESCE((SELECT round(avg(r.rm), v.snap_rm_decimals::int)
              FROM risk_result r WHERE r.version_id = v.id), 0)::float8 AS average_rm
FROM assessment_version v
JOIN project p ON p.id = v.project_id
WHERE v.id = @version_id AND v.project_id = @project_id AND p.owner_id = @owner_id
    AND p.deleted_at IS NULL AND v.deleted_at IS NULL AND v.status = 'submitted';

-- name: ListStoredResults :many
-- Stored scores of a version with the chosen strategy, in catalogue order.
SELECT r.indicator_code, r.x::float8 AS x, r.y1_pct::float8 AS y1_pct, r.y2_pct::float8 AS y2_pct,
    r.rl::float8 AS rl, r.ri_c::float8 AS ri_c, r.ri_t::float8 AS ri_t, r.ri_e::float8 AS ri_e,
    r.ri_max::float8 AS ri_max, r.rm::float8 AS rm, r.level,
    s.strategy AS strategy, s.updated_at AS strategy_updated_at
FROM risk_result r
JOIN indicator i ON i.code = r.indicator_code
JOIN factor f ON f.code = i.factor_code
LEFT JOIN strategy_choice s ON s.version_id = r.version_id AND s.indicator_code = r.indicator_code
WHERE r.version_id = @version_id
ORDER BY f.sort_no, i.f_code;

-- name: ListFactorAverages :many
-- Mean stored RM per factor of a version, rounded with the rounding frozen in
-- the version, in catalogue order. Only factors with a stored result appear.
SELECT i.factor_code, count(*)::int AS scored_count,
    round(avg(r.rm), v.snap_rm_decimals::int)::float8 AS average_rm
FROM risk_result r
JOIN assessment_version v ON v.id = r.version_id
JOIN indicator i ON i.code = r.indicator_code
JOIN factor f ON f.code = i.factor_code
WHERE r.version_id = @version_id
GROUP BY i.factor_code, f.sort_no, v.snap_rm_decimals
ORDER BY f.sort_no;

-- name: ListResultAdvice :many
-- Current advice text of the lists stored at submission, in admin-defined
-- order. The text is read now, not copied at submission. A missing locale
-- falls back to th, which every item has.
SELECT l.indicator_code, l.list, COALESCE(tl.text, th.text)::text AS text
FROM result_advice_list l
JOIN advice_item a ON a.indicator_code = l.indicator_code AND a.list = l.list
LEFT JOIN advice_item_text tl ON tl.item_id = a.id AND tl.locale = @locale::text
JOIN advice_item_text th ON th.item_id = a.id AND th.locale = 'th'
WHERE l.version_id = @version_id
ORDER BY l.indicator_code, l.list, a.position;

-- name: GetResultLevel :one
-- Level and editability of one stored result of an owned, submitted version.
SELECT r.level,
    (v.version_no = (SELECT max(m.version_no) FROM assessment_version m
                     WHERE m.project_id = v.project_id))::boolean AS editable
FROM risk_result r
JOIN assessment_version v ON v.id = r.version_id
JOIN project p ON p.id = v.project_id
WHERE r.version_id = @version_id AND r.indicator_code = @indicator_code
    AND v.project_id = @project_id AND p.owner_id = @owner_id
    AND p.deleted_at IS NULL AND v.deleted_at IS NULL AND v.status = 'submitted';

-- name: UpsertStrategy :one
-- Saves the choice only while the version is still the latest and the result
-- is H or VH, so a concurrent new version cannot slip past the earlier
-- check. No row back means the version stopped being the latest.
INSERT INTO strategy_choice (version_id, indicator_code, strategy, updated_at)
SELECT r.version_id, r.indicator_code, @strategy::risk_strategy, clock_timestamp()
FROM risk_result r
JOIN assessment_version v ON v.id = r.version_id
WHERE r.version_id = @version_id AND r.indicator_code = @indicator_code
    AND r.level IN ('H', 'VH')
    AND v.version_no = (SELECT max(m.version_no) FROM assessment_version m
                        WHERE m.project_id = v.project_id)
ON CONFLICT (version_id, indicator_code)
DO UPDATE SET strategy = EXCLUDED.strategy, updated_at = clock_timestamp()
RETURNING indicator_code, strategy, updated_at;
