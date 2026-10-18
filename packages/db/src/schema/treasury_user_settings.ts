import { pgTable, uuid, text, jsonb, timestamp, primaryKey } from "drizzle-orm/pg-core";
import type { TreasuryLimits } from "@whoxos/shared";
import { companies } from "./companies.js";
import { authUsers } from "./auth.js";

export const treasuryUserSettings = pgTable("treasury_user_settings", {
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  revision: uuid("revision").notNull(),
  limits: jsonb("limits").$type<TreasuryLimits>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ pk: primaryKey({ columns: [table.companyId, table.userId] }) }));
