CREATE TABLE "integration_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"app_id" text NOT NULL,
	"secret_encrypted" text NOT NULL,
	"secret_hint" text NOT NULL,
	"connected_by_id" uuid NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credential_app_id_not_blank" CHECK (btrim("integration_credentials"."app_id") <> ''),
	CONSTRAINT "credential_secret_not_blank" CHECK (btrim("integration_credentials"."secret_encrypted") <> '')
);
--> statement-breakpoint
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_connected_by_id_people_id_fk" FOREIGN KEY ("connected_by_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_credentials_provider_idx" ON "integration_credentials" USING btree ("church_id","provider");