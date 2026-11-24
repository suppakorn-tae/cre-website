ALTER TABLE advice_item DROP CONSTRAINT advice_item_updated_by_fk;
ALTER TABLE impact_table DROP CONSTRAINT impact_table_updated_by_fk;
ALTER TABLE indicator DROP CONSTRAINT indicator_updated_by_fk;

DROP TABLE audit_log;
DROP TABLE export_job_account;
DROP TABLE export_job;
DROP TABLE report_job;
DROP TABLE job;
DROP TABLE account;
