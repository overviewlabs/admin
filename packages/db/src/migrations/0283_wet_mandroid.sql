CREATE TABLE "mobile_push_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"company_id" uuid,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_status" integer,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mobile_push_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"endpoint_hash" text NOT NULL,
	"subscription" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mobile_push_deliveries" ADD CONSTRAINT "mobile_push_deliveries_device_id_mobile_push_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."mobile_push_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mobile_push_delivery_event_idx" ON "mobile_push_deliveries" USING btree ("device_id","event_key");--> statement-breakpoint
CREATE INDEX "mobile_push_delivery_pending_idx" ON "mobile_push_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mobile_push_devices_endpoint_idx" ON "mobile_push_devices" USING btree ("endpoint_hash");--> statement-breakpoint
CREATE INDEX "mobile_push_devices_user_idx" ON "mobile_push_devices" USING btree ("user_id");