-- Projects and assessments (Database Design v1.1, sections 4.3 and 4.5).
--
-- Also adds report_job_version_id_fk, left open by the accounts and jobs
-- migration (IO-10). report_job_version_ix already exists there.

CREATE TABLE island (
    code    text PRIMARY KEY,
    sort_no smallint NOT NULL,
    CONSTRAINT island_sort_no_uq UNIQUE (sort_no)
);

CREATE TABLE project_type (
    code    text PRIMARY KEY,
    sort_no smallint NOT NULL,
    CONSTRAINT project_type_sort_no_uq UNIQUE (sort_no)
);

INSERT INTO island (code, sort_no) VALUES
    ('koh_tao', 1), ('koh_samui', 2), ('koh_phangan', 3), ('koh_phi_phi', 4),
    ('koh_lanta', 5), ('koh_chang', 6), ('koh_kood', 7), ('other', 8);

INSERT INTO project_type (code, sort_no) VALUES
    ('building', 1), ('pier', 2), ('road', 3), ('utilities', 4),
    ('coastal', 5), ('other', 6);

CREATE TABLE project (
    id            uuid PRIMARY KEY,
    owner_id      uuid NOT NULL REFERENCES account (id) ON DELETE RESTRICT,
    name          text NOT NULL,
    nickname      varchar(4) NOT NULL,
    island_code   text NOT NULL REFERENCES island (code) ON DELETE RESTRICT,
    island_other  text,
    type_code     text NOT NULL REFERENCES project_type (code) ON DELETE RESTRICT,
    type_other    text,
    start_date    date NOT NULL,
    end_date      date NOT NULL,
    value_baht    numeric(15, 2) NOT NULL,
    progress_pct  smallint NOT NULL DEFAULT 0,
    description   text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    deleted_at    timestamptz,
    CONSTRAINT project_name_ck CHECK (btrim(name) <> ''),
    CONSTRAINT project_nickname_ck CHECK (char_length(nickname) BETWEEN 3 AND 4),
    CONSTRAINT project_island_other_ck CHECK (
        (island_code = 'other') = (island_other IS NOT NULL)
    ),
    CONSTRAINT project_type_other_ck CHECK (
        (type_code = 'other') = (type_other IS NOT NULL)
    ),
    CONSTRAINT project_dates_ck CHECK (end_date > start_date),
    CONSTRAINT project_value_ck CHECK (value_baht > 0),
    CONSTRAINT project_progress_ck CHECK (progress_pct BETWEEN 0 AND 100)
);

CREATE TABLE assessment_version (
    id                  uuid PRIMARY KEY,
    project_id          uuid NOT NULL REFERENCES project (id) ON DELETE RESTRICT,
    version_no          int NOT NULL,
    status              version_status NOT NULL DEFAULT 'draft',
    submission_no       int NOT NULL DEFAULT 0,
    snap_value_baht     numeric(15, 2) NOT NULL,
    snap_start_date     date NOT NULL,
    snap_end_date       date NOT NULL,
    snap_score_decimals smallint NOT NULL,
    snap_rm_decimals    smallint NOT NULL,
    progress_at_submit  smallint,
    created_at          timestamptz NOT NULL DEFAULT now(),
    submitted_at        timestamptz,
    deleted_at          timestamptz,
    CONSTRAINT assessment_version_no_uq UNIQUE (project_id, version_no),
    CONSTRAINT assessment_version_no_ck CHECK (version_no >= 1),
    CONSTRAINT assessment_version_value_ck CHECK (snap_value_baht > 0),
    CONSTRAINT assessment_version_dates_ck CHECK (snap_end_date > snap_start_date),
    CONSTRAINT assessment_version_score_decimals_ck CHECK (snap_score_decimals BETWEEN 0 AND 6),
    CONSTRAINT assessment_version_rm_decimals_ck CHECK (snap_rm_decimals BETWEEN 0 AND 6),
    CONSTRAINT assessment_version_progress_ck CHECK (
        progress_at_submit IS NULL OR progress_at_submit BETWEEN 0 AND 100
    ),
    CONSTRAINT assessment_version_state_ck CHECK (
        (status = 'draft' AND submission_no = 0
            AND submitted_at IS NULL AND progress_at_submit IS NULL)
        OR (status = 'submitted' AND submission_no > 0
            AND submitted_at IS NOT NULL AND progress_at_submit IS NOT NULL)
    )
);

CREATE TABLE version_rl_threshold (
    version_id     uuid NOT NULL REFERENCES assessment_version (id) ON DELETE RESTRICT,
    indicator_code text NOT NULL REFERENCES indicator (code) ON DELETE RESTRICT,
    a              numeric,
    b              numeric,
    c              numeric,
    d              numeric,
    e              numeric,
    PRIMARY KEY (version_id, indicator_code),
    -- Same pattern as indicator: all of a..e, only a,b,c, or only c,d,e.
    CONSTRAINT version_rl_threshold_pattern_ck CHECK (
        (a IS NOT NULL AND b IS NOT NULL AND c IS NOT NULL AND d IS NOT NULL AND e IS NOT NULL)
        OR (a IS NOT NULL AND b IS NOT NULL AND c IS NOT NULL AND d IS NULL AND e IS NULL)
        OR (a IS NULL AND b IS NULL AND c IS NOT NULL AND d IS NOT NULL AND e IS NOT NULL)
    )
);

CREATE TABLE version_impact_threshold (
    version_id  uuid NOT NULL REFERENCES assessment_version (id) ON DELETE RESTRICT,
    impact_code impact_code NOT NULL REFERENCES impact_table (code) ON DELETE RESTRICT,
    a           numeric NOT NULL,
    b           numeric NOT NULL,
    c           numeric NOT NULL,
    d           numeric NOT NULL,
    e           numeric NOT NULL,
    PRIMARY KEY (version_id, impact_code),
    CONSTRAINT version_impact_threshold_order_ck CHECK (0 <= a AND a < b AND b < c AND c < d AND d < e)
);

CREATE TABLE answer (
    version_id     uuid NOT NULL REFERENCES assessment_version (id) ON DELETE RESTRICT,
    indicator_code text NOT NULL REFERENCES indicator (code) ON DELETE RESTRICT,
    x              numeric,
    y1_value       numeric,
    y1_unit        cost_unit,
    y2_value       numeric,
    y2_unit        time_unit,
    updated_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (version_id, indicator_code),
    CONSTRAINT answer_x_ck CHECK (x >= 0),
    CONSTRAINT answer_y1_ck CHECK (
        y1_value >= 0 AND (y1_unit IS DISTINCT FROM 'percent' OR y1_value <= 100)
    ),
    CONSTRAINT answer_y2_ck CHECK (
        y2_value >= 0 AND (y2_unit IS DISTINCT FROM 'percent' OR y2_value <= 100)
    ),
    CONSTRAINT answer_y1_pair_ck CHECK ((y1_value IS NULL) = (y1_unit IS NULL)),
    CONSTRAINT answer_y2_pair_ck CHECK ((y2_value IS NULL) = (y2_unit IS NULL))
);

CREATE TABLE answer_y3 (
    version_id     uuid NOT NULL,
    indicator_code text NOT NULL,
    option_code    char(1) NOT NULL REFERENCES ri_e_option (code) ON DELETE RESTRICT,
    PRIMARY KEY (version_id, indicator_code, option_code),
    CONSTRAINT answer_y3_answer_fk FOREIGN KEY (version_id, indicator_code)
        REFERENCES answer (version_id, indicator_code) ON DELETE CASCADE
);

CREATE TABLE risk_result (
    version_id     uuid NOT NULL,
    indicator_code text NOT NULL,
    x              numeric NOT NULL,
    y1_pct         numeric NOT NULL,
    y2_pct         numeric NOT NULL,
    rl             numeric NOT NULL,
    ri_c           numeric NOT NULL,
    ri_t           numeric NOT NULL,
    ri_e           numeric NOT NULL,
    ri_max         numeric NOT NULL,
    rm             numeric NOT NULL,
    level          risk_level NOT NULL,
    PRIMARY KEY (version_id, indicator_code),
    CONSTRAINT risk_result_answer_fk FOREIGN KEY (version_id, indicator_code)
        REFERENCES answer (version_id, indicator_code) ON DELETE RESTRICT,
    CONSTRAINT risk_result_scores_ck CHECK (
        rl BETWEEN 1 AND 5 AND ri_c BETWEEN 1 AND 5
        AND ri_t BETWEEN 1 AND 5 AND ri_e BETWEEN 1 AND 5
    ),
    CONSTRAINT risk_result_ri_max_ck CHECK (ri_max = GREATEST(ri_c, ri_t, ri_e)),
    CONSTRAINT risk_result_rm_ck CHECK (rm BETWEEN 1 AND 5),
    CONSTRAINT risk_result_level_ck CHECK (
        level = CASE
            WHEN rm < 1.5 THEN 'VL'::risk_level
            WHEN rm < 2.5 THEN 'L'::risk_level
            WHEN rm < 3.5 THEN 'M'::risk_level
            WHEN rm < 4.5 THEN 'H'::risk_level
            ELSE 'VH'::risk_level
        END
    )
);

CREATE TABLE result_advice_list (
    version_id     uuid NOT NULL,
    indicator_code text NOT NULL,
    list           advice_list NOT NULL,
    PRIMARY KEY (version_id, indicator_code, list),
    CONSTRAINT result_advice_list_result_fk FOREIGN KEY (version_id, indicator_code)
        REFERENCES risk_result (version_id, indicator_code) ON DELETE CASCADE
);

CREATE TABLE strategy_choice (
    version_id     uuid NOT NULL,
    indicator_code text NOT NULL,
    strategy       risk_strategy NOT NULL,
    updated_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (version_id, indicator_code),
    CONSTRAINT strategy_choice_result_fk FOREIGN KEY (version_id, indicator_code)
        REFERENCES risk_result (version_id, indicator_code) ON DELETE CASCADE
);

-- Indexes (section 4.5).
CREATE INDEX project_owner_ix ON project (owner_id) WHERE deleted_at IS NULL;

-- Foreign key left open by the accounts and jobs migration (IO-10).
ALTER TABLE report_job
    ADD CONSTRAINT report_job_version_id_fk
    FOREIGN KEY (version_id) REFERENCES assessment_version (id) ON DELETE RESTRICT;
