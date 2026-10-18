CREATE TABLE "treasury_user_settings" (
	"company_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"revision" uuid NOT NULL,
	"limits" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "treasury_user_settings_company_id_user_id_pk" PRIMARY KEY("company_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "treasury_user_settings" ADD CONSTRAINT "treasury_user_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treasury_user_settings" ADD CONSTRAINT "treasury_user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;