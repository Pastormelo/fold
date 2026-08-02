ALTER TABLE "integration_credentials" ADD COLUMN "kind" text DEFAULT 'token' NOT NULL;--> statement-breakpoint
ALTER TABLE "integration_credentials" ADD COLUMN "refresh_encrypted" text;--> statement-breakpoint
ALTER TABLE "integration_credentials" ADD COLUMN "access_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "integration_credentials" ADD CONSTRAINT "credential_kind" CHECK ("integration_credentials"."kind" IN ('token', 'oauth'));--> statement-breakpoint
ALTER TABLE "integration_credentials" ADD CONSTRAINT "oauth_credential_is_complete" CHECK ("integration_credentials"."kind" <> 'oauth' or ("integration_credentials"."refresh_encrypted" is not null and "integration_credentials"."access_expires_at" is not null));