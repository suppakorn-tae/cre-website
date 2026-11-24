-- name: InsertAuditLog :exec
-- Append-only: the application role has INSERT and SELECT on audit_log only.
INSERT INTO audit_log (admin_id, action, target_type, target_id, old_value, new_value, request_id, ip_address)
VALUES (@admin_id, @action, @target_type, @target_id, @old_value, @new_value, @request_id, @ip_address);
