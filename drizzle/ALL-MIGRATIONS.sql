-- Fold — full schema, migrations 0000 through 0005

-- Generated from the drizzle/ folder. Paste into the Supabase SQL Editor and Run.

-- Safe to run once on an empty project.


-- ═══════════════ 0000_happy_thanos.sql ═══════════════

CREATE TYPE "public"."confidentiality_tier" AS ENUM('all_leaders', 'staff_and_elders', 'elders_only');
CREATE TYPE "public"."provenance" AS ENUM('confirmed', 'imported', 'inferred');
CREATE TYPE "public"."role_name" AS ENUM('administrator', 'pathway_designer', 'reviewer_approver', 'connection_team_leader', 'pastor_elder', 'lead_pastor', 'executive_assistant', 'pastoral_staff', 'staff', 'deacon', 'group_leader', 'care_volunteer');
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

CREATE TABLE "church_profile_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"field" text NOT NULL,
	"value" text NOT NULL,
	"provenance" "provenance" NOT NULL,
	"source_note" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "churches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

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

CREATE TABLE "folds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"name" text NOT NULL,
	"elder_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"name" text NOT NULL,
	"planning_center_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "leader_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" "role_name" NOT NULL,
	"granted_by_id" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL
);

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

ALTER TABLE "care_notes" ADD CONSTRAINT "care_notes_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "care_notes" ADD CONSTRAINT "care_notes_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "care_notes" ADD CONSTRAINT "care_notes_author_id_people_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "care_notes" ADD CONSTRAINT "care_notes_restoration_case_id_restoration_cases_id_fk" FOREIGN KEY ("restoration_case_id") REFERENCES "public"."restoration_cases"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "change_log" ADD CONSTRAINT "change_log_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "change_log" ADD CONSTRAINT "change_log_actor_id_people_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "church_profile_entries" ADD CONSTRAINT "church_profile_entries_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "clearance_grants" ADD CONSTRAINT "clearance_grants_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "clearance_grants" ADD CONSTRAINT "clearance_grants_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "clearance_grants" ADD CONSTRAINT "clearance_grants_granted_by_id_people_id_fk" FOREIGN KEY ("granted_by_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "clearance_grants" ADD CONSTRAINT "clearance_grants_revoked_by_id_people_id_fk" FOREIGN KEY ("revoked_by_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "folds" ADD CONSTRAINT "folds_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "folds" ADD CONSTRAINT "folds_elder_id_people_id_fk" FOREIGN KEY ("elder_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "households" ADD CONSTRAINT "households_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "leader_roles" ADD CONSTRAINT "leader_roles_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "leader_roles" ADD CONSTRAINT "leader_roles_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "leader_roles" ADD CONSTRAINT "leader_roles_granted_by_id_people_id_fk" FOREIGN KEY ("granted_by_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "people" ADD CONSTRAINT "people_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "people" ADD CONSTRAINT "people_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "people" ADD CONSTRAINT "people_fold_id_folds_id_fk" FOREIGN KEY ("fold_id") REFERENCES "public"."folds"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "permission_grants" ADD CONSTRAINT "permission_grants_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "permission_grants" ADD CONSTRAINT "permission_grants_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "permission_grants" ADD CONSTRAINT "permission_grants_granted_by_id_people_id_fk" FOREIGN KEY ("granted_by_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "permission_grants" ADD CONSTRAINT "permission_grants_revoked_by_id_people_id_fk" FOREIGN KEY ("revoked_by_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "restoration_cases" ADD CONSTRAINT "restoration_cases_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "restoration_cases" ADD CONSTRAINT "restoration_cases_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "restoration_cases" ADD CONSTRAINT "restoration_cases_lead_elder_id_people_id_fk" FOREIGN KEY ("lead_elder_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "restoration_cases" ADD CONSTRAINT "restoration_cases_second_elder_id_people_id_fk" FOREIGN KEY ("second_elder_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;
CREATE INDEX "care_notes_person_idx" ON "care_notes" USING btree ("person_id","occurred_at");
CREATE INDEX "care_notes_church_idx" ON "care_notes" USING btree ("church_id");
CREATE INDEX "care_notes_case_idx" ON "care_notes" USING btree ("restoration_case_id");
CREATE INDEX "change_log_entity_idx" ON "change_log" USING btree ("entity","entity_id");
CREATE INDEX "change_log_church_idx" ON "change_log" USING btree ("church_id","occurred_at");
CREATE UNIQUE INDEX "church_profile_field_idx" ON "church_profile_entries" USING btree ("church_id","field");
CREATE UNIQUE INDEX "clearance_grants_live_idx" ON "clearance_grants" USING btree ("person_id","tier") WHERE "clearance_grants"."revoked_at" is null;
CREATE INDEX "clearance_grants_person_idx" ON "clearance_grants" USING btree ("person_id");
CREATE INDEX "clearance_grants_granted_by_idx" ON "clearance_grants" USING btree ("granted_by_id");
CREATE INDEX "folds_church_idx" ON "folds" USING btree ("church_id");
CREATE INDEX "households_church_idx" ON "households" USING btree ("church_id");
CREATE UNIQUE INDEX "households_pc_id_idx" ON "households" USING btree ("church_id","planning_center_id") WHERE "households"."planning_center_id" is not null;
CREATE UNIQUE INDEX "leader_roles_person_role_idx" ON "leader_roles" USING btree ("person_id","role");
CREATE INDEX "leader_roles_church_idx" ON "leader_roles" USING btree ("church_id");
CREATE INDEX "people_church_idx" ON "people" USING btree ("church_id");
CREATE INDEX "people_fold_idx" ON "people" USING btree ("fold_id");
CREATE INDEX "people_unfolded_idx" ON "people" USING btree ("church_id") WHERE "people"."fold_id" is null and "people"."is_member";
CREATE UNIQUE INDEX "people_pc_id_idx" ON "people" USING btree ("church_id","planning_center_id") WHERE "people"."planning_center_id" is not null;
CREATE UNIQUE INDEX "permission_grants_live_idx" ON "permission_grants" USING btree ("person_id","permission") WHERE "permission_grants"."revoked_at" is null;
CREATE INDEX "permission_grants_person_idx" ON "permission_grants" USING btree ("person_id");
CREATE INDEX "permission_grants_granted_by_idx" ON "permission_grants" USING btree ("granted_by_id");
CREATE INDEX "restoration_church_idx" ON "restoration_cases" USING btree ("church_id");
CREATE INDEX "restoration_person_idx" ON "restoration_cases" USING btree ("person_id");
CREATE INDEX "restoration_lead_idx" ON "restoration_cases" USING btree ("lead_elder_id");
CREATE INDEX "restoration_second_idx" ON "restoration_cases" USING btree ("second_elder_id");


-- ═══════════════ 0001_mean_ikaris.sql ═══════════════




-- ═══════════════ 0002_steep_grandmaster.sql ═══════════════

CREATE TYPE "public"."care_window" AS ENUM('same_day', 'within_48_hours', 'week_1', 'week_2', 'month_1', 'month_3', 'month_6');
CREATE TYPE "public"."completion_kind" AS ENUM('done', 'skipped');
CREATE TABLE "journey_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"owner_id" uuid NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_reason" text,
	CONSTRAINT "journey_closed_has_reason" CHECK ("journey_instances"."closed_at" is null or "journey_instances"."closed_reason" is not null)
);

CREATE TABLE "journey_step_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"by_id" uuid NOT NULL,
	"kind" "completion_kind" NOT NULL,
	"outcome" text,
	"skip_reason" text,
	CONSTRAINT "completion_is_documented" CHECK (("journey_step_completions"."kind" = 'done' and "journey_step_completions"."outcome" is not null and "journey_step_completions"."outcome" <> '')
        or ("journey_step_completions"."kind" = 'skipped' and "journey_step_completions"."skip_reason" is not null and "journey_step_completions"."skip_reason" <> ''))
);

CREATE TABLE "journey_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"window" "care_window" NOT NULL,
	"owner_role" "role_name" NOT NULL,
	"guidance_note" text DEFAULT '' NOT NULL
);

CREATE TABLE "journey_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"name" text NOT NULL,
	"trigger" text NOT NULL,
	"visibility_tier" "confidentiality_tier" NOT NULL,
	"is_system_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "journey_instances" ADD CONSTRAINT "journey_instances_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "journey_instances" ADD CONSTRAINT "journey_instances_template_id_journey_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."journey_templates"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "journey_instances" ADD CONSTRAINT "journey_instances_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "journey_instances" ADD CONSTRAINT "journey_instances_owner_id_people_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "journey_step_completions" ADD CONSTRAINT "journey_step_completions_instance_id_journey_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."journey_instances"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "journey_step_completions" ADD CONSTRAINT "journey_step_completions_step_id_journey_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."journey_steps"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "journey_step_completions" ADD CONSTRAINT "journey_step_completions_by_id_people_id_fk" FOREIGN KEY ("by_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "journey_steps" ADD CONSTRAINT "journey_steps_template_id_journey_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."journey_templates"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "journey_templates" ADD CONSTRAINT "journey_templates_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;
CREATE INDEX "journey_instances_person_idx" ON "journey_instances" USING btree ("person_id");
CREATE INDEX "journey_instances_owner_idx" ON "journey_instances" USING btree ("owner_id");
CREATE INDEX "journey_instances_church_idx" ON "journey_instances" USING btree ("church_id");
CREATE UNIQUE INDEX "journey_step_once_idx" ON "journey_step_completions" USING btree ("instance_id","step_id");
CREATE UNIQUE INDEX "journey_steps_order_idx" ON "journey_steps" USING btree ("template_id","position");
CREATE INDEX "journey_templates_church_idx" ON "journey_templates" USING btree ("church_id");


-- ═══════════════ 0003_rare_lester.sql ═══════════════

CREATE TYPE "public"."fold_list" AS ENUM('family', 'guest');
CREATE TYPE "public"."mapping_state" AS ENUM('mapped', 'fold_only', 'unmapped');
CREATE TYPE "public"."owning_system" AS ENUM('fold', 'planning_center');
CREATE TYPE "public"."sync_category" AS ENUM('people_and_households', 'new_profiles', 'attendance_and_checkin', 'forms_and_registrations', 'membership_status', 'groups_and_serving', 'ordinary_care_notes', 'confidential_pastoral_notes');
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

CREATE TABLE "sync_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"category" "sync_category" NOT NULL,
	"enabled" boolean NOT NULL,
	"changed_by_id" uuid NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "confidential_notes_never_sync" CHECK ("sync_settings"."category" <> 'confidential_pastoral_notes' or "sync_settings"."enabled" = false)
);

ALTER TABLE "fold_list_mappings" ADD CONSTRAINT "fold_list_mappings_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "integration_mappings" ADD CONSTRAINT "integration_mappings_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "integration_mappings" ADD CONSTRAINT "integration_mappings_decided_by_id_people_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "possible_duplicates" ADD CONSTRAINT "possible_duplicates_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "possible_duplicates" ADD CONSTRAINT "possible_duplicates_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "possible_duplicates" ADD CONSTRAINT "possible_duplicates_other_person_id_people_id_fk" FOREIGN KEY ("other_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "possible_duplicates" ADD CONSTRAINT "possible_duplicates_resolved_by_id_people_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "sync_settings" ADD CONSTRAINT "sync_settings_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "sync_settings" ADD CONSTRAINT "sync_settings_changed_by_id_people_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;
CREATE UNIQUE INDEX "fold_list_mappings_list_idx" ON "fold_list_mappings" USING btree ("church_id","list");
CREATE UNIQUE INDEX "integration_mappings_key_idx" ON "integration_mappings" USING btree ("church_id","milestone_key");
CREATE INDEX "possible_duplicates_open_idx" ON "possible_duplicates" USING btree ("church_id") WHERE "possible_duplicates"."resolved_at" is null;
CREATE UNIQUE INDEX "sync_settings_category_idx" ON "sync_settings" USING btree ("church_id","category");


-- ═══════════════ 0004_naive_starbolt.sql ═══════════════

CREATE TYPE "public"."ai_audit_event" AS ENUM('prompt_sent', 'recommendation_made', 'verdict_recorded', 'manual_edit', 'publication_decision');
CREATE TYPE "public"."verdict_kind" AS ENUM('accepted', 'modified', 'saved', 'rejected');
CREATE TABLE "ai_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"event" "ai_audit_event" NOT NULL,
	"actor_id" uuid NOT NULL,
	"detail" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "ai_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"noticed" text NOT NULL,
	"why_it_matters" text NOT NULL,
	"consequence" text NOT NULL,
	"options" text[] NOT NULL,
	"human_judgment" text NOT NULL,
	"cited_answer_ids" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recommendation_offers_an_option" CHECK (array_length("ai_recommendations"."options", 1) >= 1),
	CONSTRAINT "recommendation_cites_the_church" CHECK (array_length("ai_recommendations"."cited_answer_ids", 1) >= 1),
	CONSTRAINT "human_judgment_is_not_blank" CHECK (btrim("ai_recommendations"."human_judgment") <> '')
);

CREATE TABLE "recommendation_verdicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recommendation_id" uuid NOT NULL,
	"verdict" "verdict_kind" NOT NULL,
	"reason" text NOT NULL,
	"decided_by_id" uuid NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verdict_has_a_reason" CHECK (btrim("recommendation_verdicts"."reason") <> '')
);

ALTER TABLE "ai_audit_log" ADD CONSTRAINT "ai_audit_log_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "ai_audit_log" ADD CONSTRAINT "ai_audit_log_actor_id_people_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "ai_recommendations" ADD CONSTRAINT "ai_recommendations_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "recommendation_verdicts" ADD CONSTRAINT "recommendation_verdicts_recommendation_id_ai_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."ai_recommendations"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "recommendation_verdicts" ADD CONSTRAINT "recommendation_verdicts_decided_by_id_people_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;
CREATE INDEX "ai_audit_church_idx" ON "ai_audit_log" USING btree ("church_id","occurred_at");
CREATE INDEX "ai_recommendations_church_idx" ON "ai_recommendations" USING btree ("church_id");
CREATE UNIQUE INDEX "recommendation_verdict_idx" ON "recommendation_verdicts" USING btree ("recommendation_id");


-- ═══════════════ 0005_brave_amphibian.sql ═══════════════

ALTER TABLE "people" ADD COLUMN "auth_user_id" uuid;
CREATE UNIQUE INDEX "people_auth_user_idx" ON "people" USING btree ("auth_user_id") WHERE "people"."auth_user_id" is not null;
