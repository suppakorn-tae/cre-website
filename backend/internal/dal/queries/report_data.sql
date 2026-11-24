-- name: ReportDataHead :one
-- Project and snapshot fields of the version a report job is for.
SELECT v.id AS version_id, v.version_no, v.submitted_at,
    COALESCE(v.progress_at_submit, 0)::int AS progress_pct,
    v.snap_score_decimals::int AS score_decimals, v.snap_rm_decimals::int AS rm_decimals,
    v.snap_value_baht::float8 AS value_baht, v.snap_start_date, v.snap_end_date,
    p.name, p.nickname, p.island_code, COALESCE(p.island_other, '')::text AS island_other,
    p.type_code, COALESCE(p.type_other, '')::text AS type_other
FROM report_job r
JOIN assessment_version v ON v.id = r.version_id
JOIN project p ON p.id = v.project_id
WHERE r.job_id = @job_id;

-- name: ReportDataResults :many
-- Stored results with the chosen strategy, in factor order.
SELECT rr.indicator_code, it.name, rr.rl::float8 AS rl, rr.ri_c::float8 AS ri_c,
    rr.ri_t::float8 AS ri_t, rr.ri_e::float8 AS ri_e, rr.ri_max::float8 AS ri_max,
    rr.rm::float8 AS rm, rr.level::text AS level, COALESCE(sc.strategy::text, '')::text AS strategy
FROM risk_result rr
JOIN indicator i ON i.code = rr.indicator_code
JOIN factor f ON f.code = i.factor_code
JOIN indicator_text it ON it.indicator_code = i.code AND it.locale = @locale
LEFT JOIN strategy_choice sc
    ON sc.version_id = rr.version_id AND sc.indicator_code = rr.indicator_code
WHERE rr.version_id = @version_id
ORDER BY f.sort_no, i.f_code;

-- name: ReportDataAdvice :many
-- Advice items of the lists stored with each H or VH result.
SELECT ral.indicator_code, ral.list::text AS list, t.text
FROM result_advice_list ral
JOIN risk_result rr
    ON rr.version_id = ral.version_id AND rr.indicator_code = ral.indicator_code
JOIN advice_item ai ON ai.indicator_code = ral.indicator_code AND ai.list = ral.list
JOIN advice_item_text t ON t.item_id = ai.id AND t.locale = @locale
WHERE ral.version_id = @version_id AND rr.level IN ('H', 'VH')
ORDER BY ral.indicator_code, ral.list, ai.position;
