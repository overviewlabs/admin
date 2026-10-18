CREATE TABLE "decision_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"caller_agent_id" uuid NOT NULL,
	"caller_run_id" uuid NOT NULL,
	"responsible_user_id" text,
	"issue_id" uuid NOT NULL,
	"engine_agent_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"input_hash" text NOT NULL,
	"run_id" uuid,
	"status" text DEFAULT 'dispatching' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "decision_evaluations" ADD CONSTRAINT "decision_evaluations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_evaluations" ADD CONSTRAINT "decision_evaluations_caller_agent_id_agents_id_fk" FOREIGN KEY ("caller_agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_evaluations" ADD CONSTRAINT "decision_evaluations_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_evaluations" ADD CONSTRAINT "decision_evaluations_engine_agent_id_agents_id_fk" FOREIGN KEY ("engine_agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "decision_evaluations_request_uq" ON "decision_evaluations" USING btree ("company_id","caller_agent_id","idempotency_key");