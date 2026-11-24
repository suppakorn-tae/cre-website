-- Database roles (Architecture v2.3, Database (Roles) and Audit log).
--
-- Schema owner: the login that runs the migrations (migrate). It owns every
-- table and is the only role that may change audit_log.
-- Application: cre_app, used by the api and worker. It has no password here;
-- deployment sets one with ALTER ROLE.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cre_app') THEN
        CREATE ROLE cre_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
    END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO cre_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cre_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cre_app;

-- Tables created later by the schema owner get the same grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cre_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO cre_app;

-- Append-only audit log: INSERT and SELECT only (no UPDATE, DELETE, TRUNCATE).
REVOKE ALL ON audit_log FROM cre_app;
GRANT SELECT, INSERT ON audit_log TO cre_app;
