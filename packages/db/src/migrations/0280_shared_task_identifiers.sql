ALTER TABLE "issues" ADD COLUMN "legacy_identifier" text;
--> statement-breakpoint
DROP INDEX "issues_identifier_idx";
--> statement-breakpoint
WITH company_max AS (
  SELECT c.id AS company_id,
    greatest(c.issue_counter, coalesce(max(i.issue_number), 0)) AS max_number
  FROM companies c LEFT JOIN issues i ON i.company_id = c.id
  GROUP BY c.id
), missing AS (
  SELECT i.id, i.company_id,
    row_number() OVER (PARTITION BY i.company_id ORDER BY i.created_at, i.id) AS ordinal
  FROM issues i WHERE i.issue_number IS NULL
)
UPDATE issues i SET issue_number = company_max.max_number + missing.ordinal
FROM missing JOIN company_max ON company_max.company_id = missing.company_id
WHERE i.id = missing.id;
--> statement-breakpoint
UPDATE issues
SET legacy_identifier = identifier,
    identifier = 'TASK-' || issue_number
WHERE issue_number IS NOT NULL AND identifier IS DISTINCT FROM 'TASK-' || issue_number;
--> statement-breakpoint
UPDATE issue_tree_hold_members members
SET issue_identifier = task.identifier
FROM issues task
WHERE members.issue_id = task.id
  AND members.issue_identifier IS DISTINCT FROM task.identifier;
--> statement-breakpoint
UPDATE companies c SET issue_counter = greatest(c.issue_counter, numbered.max_number)
FROM (
  SELECT company_id, max(issue_number) AS max_number
  FROM issues GROUP BY company_id
) numbered
WHERE c.id = numbered.company_id AND c.issue_counter < numbered.max_number;
--> statement-breakpoint
CREATE UNIQUE INDEX "issues_identifier_idx" ON "issues" ("company_id", "identifier");
--> statement-breakpoint
CREATE UNIQUE INDEX "issues_legacy_identifier_idx" ON "issues" ("legacy_identifier");
