import { pgTable, uuid, text, timestamp, jsonb, integer, uniqueIndex, index } from "drizzle-orm/pg-core";
export const mobilePushDevices = pgTable("mobile_push_devices", {
  id: uuid("id").primaryKey().defaultRandom(), userId: text("user_id").notNull(),
  endpointHash: text("endpoint_hash").notNull(), subscription: jsonb("subscription").$type<{endpoint: string; keys: {auth: string; p256dh: string}}>().notNull(),
  createdAt: timestamp("created_at", {withTimezone:true}).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", {withTimezone:true}).notNull().defaultNow(),
}, t => ({endpoint: uniqueIndex("mobile_push_devices_endpoint_idx").on(t.endpointHash), user: index("mobile_push_devices_user_idx").on(t.userId)}));
export const mobilePushDeliveries = pgTable("mobile_push_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(), deviceId: uuid("device_id").notNull().references(() => mobilePushDevices.id, {onDelete:"cascade"}),
  eventKey: text("event_key").notNull(), companyId: uuid("company_id"),
  payload: jsonb("payload").$type<Record<string,unknown>>().notNull(), status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0), lastStatus: integer("last_status"),
  nextAttemptAt: timestamp("next_attempt_at", {withTimezone:true}).notNull().defaultNow(),
  createdAt: timestamp("created_at", {withTimezone:true}).notNull().defaultNow(),
}, t => ({event: uniqueIndex("mobile_push_delivery_event_idx").on(t.deviceId,t.eventKey),pending:index("mobile_push_delivery_pending_idx").on(t.status,t.nextAttemptAt)}));
