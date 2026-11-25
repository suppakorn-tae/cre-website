-- name: AdminAdviceIndicatorExists :one
SELECT EXISTS (SELECT 1 FROM indicator WHERE code = @code);

-- name: AdminAdviceLock :exec
-- Serialises concurrent replaces of one indicator's advice (released at commit).
SELECT pg_advisory_xact_lock(hashtext(@key::text));

-- name: AdminListAdvice :many
-- Every advice item of one indicator with one row per locale of text, in list order.
-- updated_by_email is '' for seed items, which have no editor.
SELECT i.list, i.position, i.updated_at, COALESCE(a.email::text, '')::text AS updated_by_email, t.locale, t.text
FROM advice_item i
JOIN advice_item_text t ON t.item_id = i.id
LEFT JOIN account a ON a.id = i.updated_by
WHERE i.indicator_code = @indicator_code
ORDER BY i.list, i.position, t.locale;

-- name: AdminDeleteAdviceList :exec
-- Texts go with the items (ON DELETE CASCADE).
DELETE FROM advice_item
WHERE indicator_code = @indicator_code AND list = @list;

-- name: AdminInsertAdviceItem :one
INSERT INTO advice_item (id, indicator_code, list, position, updated_by, updated_at)
VALUES (@id, @indicator_code, @list, @position, @updated_by, now())
RETURNING updated_at;

-- name: AdminInsertAdviceText :exec
INSERT INTO advice_item_text (item_id, locale, text)
VALUES (@item_id, @locale, @text);

-- name: AdminAdviceAccountEmail :one
-- The e-mail of the signed-in admin, '' when the account has none.
SELECT COALESCE(email::text, '')::text FROM account WHERE id = @id;
