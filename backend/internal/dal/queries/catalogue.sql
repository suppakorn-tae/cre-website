-- name: ListCatalogueDimensions :many
-- Dimensions with one row per locale of text, in display order.
SELECT d.code, d.sort_no, t.locale, t.name
FROM dimension d
JOIN dimension_text t ON t.dimension_code = d.code
ORDER BY d.sort_no, t.locale;

-- name: ListCatalogueFactors :many
SELECT f.code, f.dimension_code, f.sort_no, t.locale, t.name
FROM factor f
JOIN factor_text t ON t.factor_code = f.code
ORDER BY f.sort_no, t.locale;

-- name: ListCatalogueIndicators :many
-- Indicators with thresholds and one row per locale of text. Display order
-- follows the factor, then the f_code.
SELECT i.code, i.factor_code, i.f_code, i.direction, i.a, i.b, i.c, i.d, i.e,
       t.locale, t.name, t.unit, t.question_x, t.question_y1, t.question_y2, t.question_y3
FROM indicator i
JOIN factor f ON f.code = i.factor_code
JOIN indicator_text t ON t.indicator_code = i.code
ORDER BY f.sort_no, i.f_code, t.locale;

-- name: ListCatalogueRiEOptions :many
SELECT o.code::text AS code, o.score, o.is_exclusive, t.locale, t.label
FROM ri_e_option o
JOIN ri_e_option_text t ON t.option_code = o.code
ORDER BY o.code, t.locale;

-- name: ListCatalogueImpactTables :many
SELECT code, a, b, c, d, e
FROM impact_table
ORDER BY code;

-- name: ListCatalogueAdvice :many
-- Advice items with one row per locale of text, in list order.
SELECT i.id, i.indicator_code, i.list, i.position, t.locale, t.text
FROM advice_item i
JOIN advice_item_text t ON t.item_id = i.id
ORDER BY i.indicator_code, i.list, i.position, t.locale;

-- name: ListCatalogueIslands :many
SELECT code FROM island ORDER BY sort_no;

-- name: ListCatalogueProjectTypes :many
SELECT code FROM project_type ORDER BY sort_no;
