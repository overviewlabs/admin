import { pgTable, uuid, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { issues } from "./issues.js";

/** Durable admission receipt: ambiguous dispatch is never automatically replayed. */
export const decisionEvaluations = pgTable("decision_evaluations", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  callerAgentId: uuid("caller_agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  callerRunId: uuid("caller_run_id").notNull(),
  responsibleUserId: text("responsible_user_id"),
  issueId: uuid("issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
  engineAgentId: uuid("engine_agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  idempotencyKey: text("idempotency_key").notNull(),
  inputHash: text("input_hash").notNull(),
  runId: uuid("run_id"),
  status: text("status").notNull().default("dispatching"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => ({ requestUnique: uniqueIndex("decision_evaluations_request_uq").on(table.companyId, table.callerAgentId, table.idempotencyKey) }));
