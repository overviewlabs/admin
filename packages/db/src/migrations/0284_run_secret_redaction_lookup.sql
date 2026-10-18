-- For large live instances, operators can build this identical index with
-- CREATE INDEX CONCURRENTLY before applying the migration.
CREATE INDEX IF NOT EXISTS "heartbeat_runs_company_legacy_issue_idx"
  ON "heartbeat_runs" USING btree
  ("company_id", (("context_snapshot" -> 'whoxosIssue') ->> 'id'));
