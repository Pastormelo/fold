CREATE TYPE "public"."fold_list" AS ENUM('family', 'guest');--> statement-breakpoint
CREATE TYPE "public"."mapping_state" AS ENUM('mapped', 'fold_only', 'unmapped');--> statement-breakpoint
CREATE TYPE "public"."owning_system" AS ENUM('fold', 'planning_center');--> statement-breakpoint
CREATE TYPE "public"."sync_category" AS ENUM('people_and_households', 'new_profiles', 'attendance_and_checkin', 'forms_and_registrations', 'membership_status', 'groups_and_serving', 'ordinary_care_notes', 'confidential_pastoral_notes');--> statement-breakpoint
CREATE TABLE "fold_list_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"list" "fold_list" NOT NULL,
	"state" "mapping_state" NOT NULL,
	"external_field_id" text,
	"fold_only_reason" text,
	CONSTRAINT "list_mapped_has_a_target" CHECK ("fold_list_mappings"."state" <> 'mapped' or "fold_list_mappings"."external_field_id" is not null),
	CONSTRAINT "list_fold_only_has_a_reason" CHECK ("fold_list_mappings"."state" <> 'fold_only' or ("fold_list_mappings"."fold_only_reason" is not null and "fold_list_mappings"."fold_only_reason" <> ''))
);
--> statement-breakpoint
CREATE TABLE "integration_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"milestone_key" text NOT NULL,
	"state" "mapping_state" NOT NULL,
	"external_field_id" text,
	"external_value" text,
	"owning_system" "owning_system",
	"fold_only_reason" text,
	"decided_by_id" uuid,
	"decided_at" timestamp with time zone,
	CONSTRAINT "mapped_has_a_target" CHECK ("integration_mappings"."state" <> 'mapped' or ("integration_mappings"."external_field_id" is not null and "integration_mappings"."owning_system" is not null)),
	CONSTRAINT "fold_only_has_a_reason" CHECK ("integration_mappings"."state" <> 'fold_only' or ("integration_mappings"."fold_only_reason" is not null and "integration_mappings"."fold_only_reason" <> ''))
);
--> statement-breakpoint
CREATE TABLE "possible_duplicates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"other_person_id" uuid NOT NULL,
	"matched_on" text NOT NULL,
	"surfaced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_id" uuid,
	"resolution" text,
	CONSTRAINT "duplicate_is_two_people" CHECK ("possible_duplicates"."person_id" <> "possible_duplicates"."other_person_id"),
	CONSTRAINT "resolution_is_attributed" CHECK ("possible_duplicates"."resolved_at" is null or ("possible_duplicates"."resolved_by_id" is not null and "possible_duplicates"."resolution" is not null))
);
--> statement-breakpoint
CREATE TABLE "sync_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"category" "sync_category" NOT NULL,
	"enabled" boolean NOT NULL,
	"changed_by_id" uuid NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "confidential_notes_never_sync" CHECK ("sync_settings"."category" <> 'confidential_pastoral_notes' or "sync_settings"."enabled" = false)
);
--> statement-breakpoint
ALTER TABLE "fold_list_mappings" ADD CONSTRAINT "fold_list_mappings_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_mappings" ADD CONSTRAINT "integration_mappings_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_mappings" ADD CONSTRAINT "integration_mappings_decided_by_id_people_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "possible_duplicates" ADD CONSTRAINT "possible_duplicates_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "possible_duplicates" ADD CONSTRAINT "possible_duplicates_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "possible_duplicates" ADD CONSTRAINT "possible_duplicates_other_person_id_people_id_fk" FOREIGN KEY ("other_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "possible_duplicates" ADD CONSTRAINT "possible_duplicates_resolved_by_id_people_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_settings" ADD CONSTRAINT "sync_settings_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_settings" ADD CONSTRAINT "sync_settings_changed_by_id_people_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fold_list_mappings_list_idx" ON "fold_list_mappings" USING btree ("church_id","list");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_mappings_key_idx" ON "integration_mappings" USING btree ("church_id","milestone_key");--> statement-breakpoint
CREATE INDEX "possible_duplicates_open_idx" ON "possible_duplicates" USING btree ("church_id") WHERE "possible_duplicates"."resolved_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "sync_settings_category_idx" ON "sync_settings" USING btree ("church_id","category");