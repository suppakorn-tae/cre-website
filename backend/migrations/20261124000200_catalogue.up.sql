-- Indicator catalogue (Database Design v1.1, section 4.2).
--
-- The updated_by columns reference account(id). The account table is created
-- by a later migration (IO-10), which must add the three foreign keys
-- (indicator, impact_table, advice_item) with ON DELETE RESTRICT.

CREATE TABLE locale (
    code       text PRIMARY KEY,
    is_default boolean NOT NULL DEFAULT false,
    CONSTRAINT locale_code_ck CHECK (code ~ '^[a-z]{2}$')
);
-- Exactly one default: at most one row may be true (the seed provides th).
CREATE UNIQUE INDEX locale_default_ux ON locale (is_default) WHERE is_default;

CREATE TABLE dimension (
    code    text PRIMARY KEY,
    sort_no smallint NOT NULL,
    CONSTRAINT dimension_sort_no_uq UNIQUE (sort_no),
    CONSTRAINT dimension_code_ck CHECK (code IN ('EC', 'SO', 'EV'))
);

CREATE TABLE dimension_text (
    dimension_code text NOT NULL REFERENCES dimension (code) ON DELETE RESTRICT,
    locale         text NOT NULL REFERENCES locale (code) ON DELETE RESTRICT,
    name           text NOT NULL,
    PRIMARY KEY (dimension_code, locale)
);

CREATE TABLE factor (
    code           text PRIMARY KEY,
    dimension_code text NOT NULL REFERENCES dimension (code) ON DELETE RESTRICT,
    sort_no        smallint NOT NULL,
    CONSTRAINT factor_sort_no_uq UNIQUE (sort_no)
);

CREATE TABLE factor_text (
    factor_code text NOT NULL REFERENCES factor (code) ON DELETE RESTRICT,
    locale      text NOT NULL REFERENCES locale (code) ON DELETE RESTRICT,
    name        text NOT NULL,
    PRIMARY KEY (factor_code, locale)
);

CREATE TABLE indicator (
    code        text PRIMARY KEY,
    factor_code text NOT NULL REFERENCES factor (code) ON DELETE RESTRICT,
    f_code      text NOT NULL,
    direction   indicator_direction NOT NULL,
    a           numeric,
    b           numeric,
    c           numeric,
    d           numeric,
    e           numeric,
    updated_by  uuid,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT indicator_f_code_uq UNIQUE (f_code),
    -- Pattern: all of a..e, only a,b,c, or only c,d,e are set.
    CONSTRAINT indicator_threshold_pattern_ck CHECK (
        (a IS NOT NULL AND b IS NOT NULL AND c IS NOT NULL AND d IS NOT NULL AND e IS NOT NULL)
        OR (a IS NOT NULL AND b IS NOT NULL AND c IS NOT NULL AND d IS NULL AND e IS NULL)
        OR (a IS NULL AND b IS NULL AND c IS NOT NULL AND d IS NOT NULL AND e IS NOT NULL)
    ),
    -- A comparison with NULL is unknown, which a check accepts, so only the
    -- thresholds that are set are compared.
    CONSTRAINT indicator_threshold_nonneg_ck CHECK (
        a >= 0 AND b >= 0 AND c >= 0 AND d >= 0 AND e >= 0
    ),
    CONSTRAINT indicator_threshold_order_ck CHECK (
        (direction = 'normal' AND a < b AND b < c AND c < d AND d < e)
        OR (direction = 'inverse' AND a > b AND b > c AND c > d AND d > e)
    )
);

CREATE TABLE indicator_text (
    indicator_code text NOT NULL REFERENCES indicator (code) ON DELETE RESTRICT,
    locale         text NOT NULL REFERENCES locale (code) ON DELETE RESTRICT,
    name           text NOT NULL,
    unit           text NOT NULL,
    question_x     text,
    question_y1    text,
    question_y2    text,
    question_y3    text,
    PRIMARY KEY (indicator_code, locale)
);

CREATE TABLE ri_e_option (
    code         char(1) PRIMARY KEY,
    score        smallint NOT NULL,
    is_exclusive boolean NOT NULL,
    CONSTRAINT ri_e_option_code_ck CHECK (code ~ '^[A-I]$'),
    CONSTRAINT ri_e_option_score_ck CHECK (score BETWEEN 1 AND 5)
);

CREATE TABLE ri_e_option_text (
    option_code char(1) NOT NULL REFERENCES ri_e_option (code) ON DELETE RESTRICT,
    locale      text NOT NULL REFERENCES locale (code) ON DELETE RESTRICT,
    label       text NOT NULL,
    PRIMARY KEY (option_code, locale)
);

CREATE TABLE impact_table (
    code       impact_code PRIMARY KEY,
    a          numeric NOT NULL,
    b          numeric NOT NULL,
    c          numeric NOT NULL,
    d          numeric NOT NULL,
    e          numeric NOT NULL,
    updated_by uuid,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT impact_table_order_ck CHECK (0 <= a AND a < b AND b < c AND c < d AND d < e)
);

CREATE TABLE advice_item (
    id             uuid PRIMARY KEY,
    indicator_code text NOT NULL REFERENCES indicator (code) ON DELETE RESTRICT,
    list           advice_list NOT NULL,
    position       smallint NOT NULL,
    updated_by     uuid,
    updated_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT advice_item_position_ck CHECK (position BETWEEN 1 AND 5),
    CONSTRAINT advice_item_position_uq UNIQUE (indicator_code, list, position)
        DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE advice_item_text (
    item_id uuid NOT NULL REFERENCES advice_item (id) ON DELETE CASCADE,
    locale  text NOT NULL REFERENCES locale (code) ON DELETE RESTRICT,
    text    text NOT NULL,
    PRIMARY KEY (item_id, locale),
    CONSTRAINT advice_item_text_not_blank_ck CHECK (btrim(text) <> '')
);
