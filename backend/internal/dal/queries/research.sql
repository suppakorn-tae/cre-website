-- Research read path (IO-71). Used only by the export worker. It selects no
-- e-mail, password hash or Google id, and it may read soft-deleted rows when
-- the export asks for them.

-- name: GetExportJobOptions :one
SELECT scope, include_deleted FROM export_job WHERE job_id = @job_id;

-- name: ListResearchAccounts :many
-- All accounts, or only those chosen for the job. A deleted account stays: its
-- pseudonym still ties its projects together.
SELECT a.id, a.pseudonym, a.organisation
FROM account a
WHERE @all_accounts::boolean
   OR a.id IN (SELECT ja.account_id FROM export_job_account ja WHERE ja.job_id = @job_id)
ORDER BY a.pseudonym;

-- name: ListResearchProjects :many
SELECT p.id, p.name, p.nickname, p.island_code, p.island_other, p.type_code,
       p.type_other, p.start_date, p.end_date, p.value_baht, p.progress_pct,
       p.description, p.created_at, p.deleted_at
FROM project p
WHERE p.owner_id = @owner_id
  AND (@include_deleted::boolean OR p.deleted_at IS NULL)
ORDER BY p.created_at, p.id;

-- name: ListResearchVersions :many
SELECT v.id, v.version_no, v.status, v.submission_no, v.snap_value_baht,
       v.snap_start_date, v.snap_end_date, v.snap_score_decimals,
       v.snap_rm_decimals, v.progress_at_submit, v.created_at, v.submitted_at,
       v.deleted_at
FROM assessment_version v
WHERE v.project_id = @project_id
  AND (@include_deleted::boolean OR v.deleted_at IS NULL)
ORDER BY v.version_no;

-- name: ListResearchRlThresholds :many
SELECT t.version_id, t.indicator_code, t.a, t.b, t.c, t.d, t.e
FROM version_rl_threshold t
JOIN assessment_version v ON v.id = t.version_id
WHERE v.project_id = @project_id
  AND (@include_deleted::boolean OR v.deleted_at IS NULL)
ORDER BY t.version_id, t.indicator_code;

-- name: ListResearchImpactThresholds :many
SELECT t.version_id, t.impact_code, t.a, t.b, t.c, t.d, t.e
FROM version_impact_threshold t
JOIN assessment_version v ON v.id = t.version_id
WHERE v.project_id = @project_id
  AND (@include_deleted::boolean OR v.deleted_at IS NULL)
ORDER BY t.version_id, t.impact_code;

-- name: ListResearchIndicatorRows :many
-- One row per answered indicator of every version of the project. The result
-- and strategy columns are NULL while a version has no result yet.
SELECT an.version_id, an.indicator_code, it.unit AS x_unit,
       an.x, an.y1_value, an.y1_unit, an.y2_value, an.y2_unit,
       COALESCE((SELECT string_agg(y3.option_code, ',' ORDER BY y3.option_code)
                 FROM answer_y3 y3
                 WHERE y3.version_id = an.version_id
                   AND y3.indicator_code = an.indicator_code), '')::text AS y3_options,
       r.rl, r.ri_c, r.ri_t, r.ri_e, r.ri_max, r.rm, r.level, sc.strategy
FROM answer an
JOIN assessment_version v ON v.id = an.version_id
LEFT JOIN indicator_text it
       ON it.indicator_code = an.indicator_code AND it.locale = @locale
LEFT JOIN risk_result r
       ON r.version_id = an.version_id AND r.indicator_code = an.indicator_code
LEFT JOIN strategy_choice sc
       ON sc.version_id = an.version_id AND sc.indicator_code = an.indicator_code
WHERE v.project_id = @project_id
  AND (@include_deleted::boolean OR v.deleted_at IS NULL)
ORDER BY an.version_id, an.indicator_code;
