-- Accounts, jobs and audit (Database Design v1.1, sections 4.4 and 4.5).
--
-- report_job.version_id references assessment_version(id). That table is
-- created by the project and assessment migration (IO-11), which must add the
-- foreign key report_job_version_id_fk with ON DELETE RESTRICT.

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE account (
    id                uuid PRIMARY KEY,
    email             citext,
    password_hash     text,
    google_sub        text,
    organisation      text,
    role              user_role NOT NULL DEFAULT 'user',
    status            account_status NOT NULL DEFAULT 'active',
    pseudonym         text NOT NULL,
    session_version   int NOT NULL DEFAULT 1,
    terms_accepted_at timestamptz NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    deleted_at        timestamptz,
    CONSTRAINT account_email_uq UNIQUE (email),
    CONSTRAINT account_google_sub_uq UNIQUE (google_sub),
    CONSTRAINT account_pseudonym_uq UNIQUE (pseudonym),
    CONSTRAINT account_session_version_ck CHECK (session_version >= 1),
    CONSTRAINT account_deleted_ck CHECK ((status = 'deleted') = (deleted_at IS NOT NULL)),
    -- Anonymised: no credentials or e-mail remain.
    CONSTRAINT account_anonymised_ck CHECK (
        status <> 'deleted'
        OR (email IS NULL AND password_hash IS NULL AND google_sub IS NULL)
    ),
    -- Not deleted: an e-mail and at least one way to sign in.
    CONSTRAINT account_live_ck CHECK (
        status = 'deleted'
        OR (email IS NOT NULL AND (password_hash IS NOT NULL OR google_sub IS NOT NULL))
    )
);

CREATE TABLE job (
    id           uuid PRIMARY KEY,
    kind         job_kind NOT NULL,
    requested_by uuid NOT NULL REFERENCES account (id) ON DELETE RESTRICT,
    status       job_status NOT NULL DEFAULT 'queued',
    object_key   text,
    error        text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    started_at   timestamptz,
    finished_at  timestamptz,
    expires_at   timestamptz,
    -- Target of the subtype foreign keys.
    CONSTRAINT job_id_kind_uq UNIQUE (id, kind),
    CONSTRAINT job_times_ck CHECK (
        (status = 'queued' AND started_at IS NULL AND finished_at IS NULL)
        OR (status = 'running' AND started_at IS NOT NULL AND finished_at IS NULL)
        OR (status IN ('done', 'failed', 'expired') AND finished_at IS NOT NULL)
    ),
    CONSTRAINT job_object_key_ck CHECK (
        (status IN ('done', 'expired')) = (object_key IS NOT NULL)
    ),
    CONSTRAINT job_object_key_format_ck CHECK (
        object_key IS NULL
        OR (kind = 'report' AND object_key = 'reports/' || id::text || '.pdf')
        OR (kind = 'export' AND object_key = 'exports/' || id::text || '.zip')
    ),
    CONSTRAINT job_error_ck CHECK ((status = 'failed') = (error IS NOT NULL)),
    -- Only exports expire; the time is set once an export is done or expired.
    CONSTRAINT job_expires_at_ck CHECK (
        (kind = 'export' AND status IN ('done', 'expired')) = (expires_at IS NOT NULL)
    )
);

CREATE TABLE report_job (
    job_id        uuid PRIMARY KEY,
    kind          job_kind NOT NULL DEFAULT 'report',
    version_id    uuid NOT NULL,
    submission_no int NOT NULL,
    CONSTRAINT report_job_kind_ck CHECK (kind = 'report'),
    CONSTRAINT report_job_job_fk FOREIGN KEY (job_id, kind)
        REFERENCES job (id, kind) ON DELETE RESTRICT
);

CREATE TABLE export_job (
    job_id          uuid PRIMARY KEY,
    kind            job_kind NOT NULL DEFAULT 'export',
    scope           export_scope NOT NULL,
    include_deleted boolean NOT NULL,
    CONSTRAINT export_job_kind_ck CHECK (kind = 'export'),
    CONSTRAINT export_job_job_fk FOREIGN KEY (job_id, kind)
        REFERENCES job (id, kind) ON DELETE RESTRICT
);

CREATE TABLE export_job_account (
    job_id     uuid NOT NULL REFERENCES export_job (job_id) ON DELETE RESTRICT,
    account_id uuid NOT NULL REFERENCES account (id) ON DELETE RESTRICT,
    PRIMARY KEY (job_id, account_id)
);

CREATE TABLE audit_log (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    admin_id    uuid NOT NULL REFERENCES account (id) ON DELETE RESTRICT,
    action      audit_action NOT NULL,
    target_type text NOT NULL,
    target_id   text NOT NULL,
    old_value   jsonb,
    new_value   jsonb,
    request_id  text NOT NULL,
    ip_address  inet
);

-- Indexes (section 4.5) for these tables.
CREATE INDEX job_requester_ix ON job (requested_by, created_at DESC);
CREATE INDEX job_expiry_ix ON job (expires_at) WHERE status = 'done';
CREATE INDEX report_job_version_ix ON report_job (version_id, submission_no);
CREATE INDEX audit_log_time_ix ON audit_log (occurred_at DESC);
CREATE INDEX audit_log_admin_ix ON audit_log (admin_id, occurred_at DESC);
CREATE INDEX audit_log_target_ix ON audit_log (target_type, target_id);

-- Foreign keys left open by the catalogue migration (IO-9).
ALTER TABLE indicator
    ADD CONSTRAINT indicator_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES account (id) ON DELETE RESTRICT;
ALTER TABLE impact_table
    ADD CONSTRAINT impact_table_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES account (id) ON DELETE RESTRICT;
ALTER TABLE advice_item
    ADD CONSTRAINT advice_item_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES account (id) ON DELETE RESTRICT;
