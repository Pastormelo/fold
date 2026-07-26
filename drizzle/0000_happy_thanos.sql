CREATE TYPE "public"."confidentiality_tier" AS ENUM('all_leaders', 'staff_and_elders', 'elders_only');--> statement-breakpoint
CREATE TYPE "public"."provenance" AS ENUM('confirmed', 'imported', 'inferred');--> statement-breakpoint
CREATE TYPE "public"."role_name" AS ENUM('administrator', 'pathway_designer', 'reviewer_approver', 'connection_team_leader', 'pastor_elder', 'lead_pastor', 'executive_assistant', 'pastoral_staff', 'staff', 'deacon', 'group_leader');--> statement-breakpoint
CREATE TABLE "care_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"visibility_tier" "confidentiality_tier" NOT NULL,
	"body" text NOT NULL,
	"restoration_case_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "restoration_notes_are_elders_only" CHECK ("care_notes"."restoration_case_id" is null or "care_notes"."visibility_tier" = 'elders_only')
);
--> statement-breakpoint
CREATE TABLE "change_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"from_state" text,
	"to_state" text,
	"detail" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "church_profile_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"field" text NOT NULL,
	"value" text NOT NULL,
	"provenance" "provenance" NOT NULL,
	"source_note" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "churches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clearance_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"tier" "confidentiality_tier" NOT NULL,
	"granted_by_id" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_id" uuid,
	CONSTRAINT "clearance_grants_revocation_is_complete" CHECK (("clearance_grants"."revoked_at" is null) = ("clearance_grants"."revoked_by_id" is null))
);
--> statement-breakpoint
CREATE TABLE "folds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"name" text NOT NULL,
	"elder_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"name" text NOT NULL,
	"planning_center_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leader_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" "role_name" NOT NULL,
	"granted_by_id" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"household_id" uuid,
	"fold_id" uuid,
	"is_member" boolean DEFAULT false NOT NULL,
	"planning_center_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permission_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"permission" text NOT NULL,
	"granted_by_id" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_id" uuid,
	CONSTRAINT "permission_grants_revocation_is_complete" CHECK (("permission_grants"."revoked_at" is null) = ("permission_grants"."revoked_by_id" is null))
);
--> statement-breakpoint
CREATE TABLE "restoration_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lead_elder_id" uuid NOT NULL,
	"second_elder_id" uuid NOT NULL,
	"step" integer DEFAULT 1 NOT NULL,
	"step_label" text NOT NULL,
	"status" text NOT NULL,
	"plan" text[] DEFAULT '{}'::text[] NOT NULL,
	"decision_question" text,
	"knows" text[] DEFAULT '{}'::text[] NOT NULL,
	"does_not_know" text[] DEFAULT '{}'::text[] NOT NULL,
	"closed_at" timestamp with time zone,
	"outcome" text,
	CONSTRAINT "restoration_two_distinct_elders" CHECK ("restoration_cases"."lead_elder_id" <> "restoration_cases"."second_elder_id"),
	CONSTRAINT "restoration_closed_has_outcome" CHECK ("restoration_cases"."closed_at" is null or "restoration_cases"."outcome" is not null)
);
--> statement-breakpoint
ALTER TABLE "care_notes" ADD CONSTRAINT "care_notes_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_notes" ADD CONSTRAINT "care_notes_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_notes" ADD CONSTRAINT "care_notes_author_id_people_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_notes" ADD CONSTRAINT "care_notes_restoration_case_id_restoration_cases_id_fk" FOREIGN KEY ("restoration_case_id") REFERENCES "public"."restoration_cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_log" ADD CONSTRAINT "change_log_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_log" ADD CONSTRAINT "change_log_actor_id_people_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "church_profile_entries" ADD CONSTRAINT "church_profile_entries_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clearance_grants" ADD CONSTRAINT "clearance_grants_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clearance_grants" ADD CONSTRAINT "clearance_grants_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clearance_grants" ADD CONSTRAINT "clearance_grants_granted_by_id_people_id_fk" FOREIGN KEY ("granted_by_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clearance_grants" ADD CONSTRAINT "clearance_grants_revoked_by_id_people_id_fk" FOREIGN KEY ("revoked_by_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folds" ADD CONSTRAINT "folds_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folds" ADD CONSTRAINT "folds_elder_id_people_id_fk" FOREIGN KEY ("elder_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leader_roles" ADD CONSTRAINT "leader_roles_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leader_roles" ADD CONSTRAINT "leader_roles_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leader_roles" ADD CONSTRAINT "leader_roles_granted_by_id_people_id_fk" FOREIGN KEY ("granted_by_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_fold_id_folds_id_fk" FOREIGN KEY ("fold_id") REFERENCES "public"."folds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_grants" ADD CONSTRAINT "permission_grants_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_grants" ADD CONSTRAINT "permission_grants_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_grants" ADD CONSTRAINT "permission_grants_granted_by_id_people_id_fk" FOREIGN KEY ("granted_by_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_grants" ADD CONSTRAINT "permission_grants_revoked_by_id_people_id_fk" FOREIGN KEY ("revoked_by_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restoration_cases" ADD CONSTRAINT "restoration_cases_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restoration_cases" ADD CONSTRAINT "restoration_cases_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restoration_cases" ADD CONSTRAINT "restoration_cases_lead_elder_id_people_id_fk" FOREIGN KEY ("lead_elder_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restoration_cases" ADD CONSTRAINT "restoration_cases_second_elder_id_people_id_fk" FOREIGN KEY ("second_elder_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "care_notes_person_idx" ON "care_notes" USING btree ("person_id","occurred_at");--> statement-breakpoint
CREATE INDEX "care_notes_church_idx" ON "care_notes" USING btree ("church_id");--> statement-breakpoint
CREATE INDEX "care_notes_case_idx" ON "care_notes" USING btree ("restoration_case_id");--> statement-breakpoint
CREATE INDEX "change_log_entity_idx" ON "change_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "change_log_church_idx" ON "change_log" USING btree ("church_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "church_profile_field_idx" ON "church_profile_entries" USING btree ("church_id","field");--> statement-breakpoint
CREATE UNIQUE INDEX "clearance_grants_live_idx" ON "clearance_grants" USING btree ("person_id","tier") WHERE "clearance_grants"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "clearance_grants_person_idx" ON "clearance_grants" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "clearance_grants_granted_by_idx" ON "clearance_grants" USING btree ("granted_by_id");--> statement-breakpoint
CREATE INDEX "folds_church_idx" ON "folds" USING btree ("church_id");--> statement-breakpoint
CREATE INDEX "households_church_idx" ON "households" USING btree ("church_id");--> statement-breakpoint
CREATE UNIQUE INDEX "households_pc_id_idx" ON "households" USING btree ("church_id","planning_center_id") WHERE "households"."planning_center_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "leader_roles_person_role_idx" ON "leader_roles" USING btree ("person_id","role");--> statement-breakpoint
CREATE INDEX "leader_roles_church_idx" ON "leader_roles" USING btree ("church_id");--> statement-breakpoint
CREATE INDEX "people_church_idx" ON "people" USING btree ("church_id");--> statement-breakpoint
CREATE INDEX "people_fold_idx" ON "people" USING btree ("fold_id");--> statement-breakpoint
CREATE INDEX "people_unfolded_idx" ON "people" USING btree ("church_id") WHERE "people"."fold_id" is null and "people"."is_member";--> statement-breakpoint
CREATE UNIQUE INDEX "people_pc_id_idx" ON "people" USING btree ("church_id","planning_center_id") WHERE "people"."planning_center_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "permission_grants_live_idx" ON "permission_grants" USING btree ("person_id","permission") WHERE "permission_grants"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "permission_grants_person_idx" ON "permission_grants" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "permission_grants_granted_by_idx" ON "permission_grants" USING btree ("granted_by_id");--> statement-breakpoint
CREATE INDEX "restoration_church_idx" ON "restoration_cases" USING btree ("church_id");--> statement-breakpoint
CREATE INDEX "restoration_person_idx" ON "restoration_cases" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "restoration_lead_idx" ON "restoration_cases" USING btree ("lead_elder_id");--> statement-breakpoint
CREATE INDEX "restoration_second_idx" ON "restoration_cases" USING btree ("second_elder_id");