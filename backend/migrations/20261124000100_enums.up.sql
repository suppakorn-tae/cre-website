-- Enumerated types (Database Design v1.1, section 4.1).

CREATE TYPE user_role AS ENUM ('user', 'admin');
CREATE TYPE account_status AS ENUM ('active', 'deactivated', 'deleted');
CREATE TYPE indicator_direction AS ENUM ('normal', 'inverse');
CREATE TYPE impact_code AS ENUM ('RI_C', 'RI_T');
CREATE TYPE advice_list AS ENUM ('RL', 'RI_C', 'RI_T', 'RI_E');
CREATE TYPE version_status AS ENUM ('draft', 'submitted');
CREATE TYPE cost_unit AS ENUM ('baht', 'percent');
CREATE TYPE time_unit AS ENUM ('day', 'percent');
CREATE TYPE risk_level AS ENUM ('VL', 'L', 'M', 'H', 'VH');
CREATE TYPE risk_strategy AS ENUM ('REDUCE', 'TRANSFER', 'AVOID', 'ACCEPT');
CREATE TYPE job_kind AS ENUM ('report', 'export');
CREATE TYPE job_status AS ENUM ('queued', 'running', 'done', 'failed', 'expired');
CREATE TYPE export_scope AS ENUM ('all', 'selected');
CREATE TYPE audit_action AS ENUM (
    'user_role_change',
    'user_deactivate',
    'user_reactivate',
    'user_delete',
    'advice_edit',
    'rl_threshold_edit',
    'impact_table_edit',
    'export_request',
    'export_download'
);
