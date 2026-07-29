CREATE TYPE "public"."migration_choice" AS ENUM('existing_stay', 'only_new_enter', 'migrate_everyone', 'decide_person_by_person');--> statement-breakpoint
CREATE TYPE "public"."pathway_action" AS ENUM('begin_draft', 'submit_for_review', 'request_changes', 'approve', 'schedule', 'publish', 'edit_stage');--> statement-breakpoint
CREATE TYPE "public"."pathway_state" AS ENUM('discovery', 'draft', 'internal_review', 'changes_requested', 'approved', 'scheduled', 'active', 'archived');--> statement-breakpoint
CREATE TABLE "pathway_health_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pathway_id" uuid NOT NULL,
	"category" text NOT NULL,
	"severity" text NOT NULL,
	"evidence" text NOT NULL,
	"why" text NOT NULL,
	"options" text[] DEFAULT '{}' NOT NULL,
	"blocks_publishing" boolean NOT NULL,
	"dismissed_by_id" uuid,
	"dismissal_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pathway_findings_dismissal_shape" CHECK (("pathway_health_findings"."dismissed_by_id" IS NULL) = ("pathway_health_findings"."dismissal_reason" IS NULL)),
	CONSTRAINT "pathway_findings_severity" CHECK ("pathway_health_findings"."severity" IN ('low', 'medium', 'high'))
);
--> statement-breakpoint
CREATE TABLE "pathway_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pathway_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"approved_at" timestamp with time zone,
	"objection_raised_at" timestamp with time zone,
	"objection_note" text,
	"objection_addressed_at" timestamp with time zone,
	"objection_addressed_by_id" uuid,
	CONSTRAINT "pathway_reviews_objection_shape" CHECK (("pathway_reviews"."objection_raised_at" IS NULL) = ("pathway_reviews"."objection_note" IS NULL)),
	CONSTRAINT "pathway_reviews_addressed_shape" CHECK (("pathway_reviews"."objection_addressed_at" IS NULL) = ("pathway_reviews"."objection_addressed_by_id" IS NULL)),
	CONSTRAINT "pathway_reviews_addressed_needs_objection" CHECK ("pathway_reviews"."objection_addressed_at" IS NULL OR "pathway_reviews"."objection_raised_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "pathway_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pathway_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"public_name" text DEFAULT '' NOT NULL,
	"subtitle" text DEFAULT '' NOT NULL,
	"purpose" text DEFAULT '' NOT NULL,
	"outcome" text DEFAULT '' NOT NULL,
	"entry_condition" text DEFAULT '' NOT NULL,
	"required_actions" text[] DEFAULT '{}' NOT NULL,
	"optional_actions" text[] DEFAULT '{}' NOT NULL,
	"owner_role" text DEFAULT '' NOT NULL,
	"completion_condition" text DEFAULT '' NOT NULL,
	"stopping_rule" text DEFAULT '' NOT NULL,
	"reactivation_rule" text DEFAULT '' NOT NULL,
	"escalation_rule" text DEFAULT '' NOT NULL,
	"milestones" text[] DEFAULT '{}' NOT NULL,
	"intentionally_absent" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pathway_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pathway_id" uuid NOT NULL,
	"action" "pathway_action" NOT NULL,
	"from_state" "pathway_state" NOT NULL,
	"to_state" "pathway_state" NOT NULL,
	"actor_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"detail" text
);
--> statement-breakpoint
CREATE TABLE "pathways" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"state" "pathway_state" NOT NULL,
	"internal_name" text DEFAULT '' NOT NULL,
	"public_name" text DEFAULT '' NOT NULL,
	"philosophy" text DEFAULT '' NOT NULL,
	"disciple_definition" text DEFAULT '' NOT NULL,
	"migration_choice" "migration_choice",
	"published_at" timestamp with time zone,
	"published_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pathways_published_attribution" CHECK (("pathways"."published_at" IS NULL) = ("pathways"."published_by_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "pathway_health_findings" ADD CONSTRAINT "pathway_health_findings_pathway_id_pathways_id_fk" FOREIGN KEY ("pathway_id") REFERENCES "public"."pathways"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pathway_health_findings" ADD CONSTRAINT "pathway_health_findings_dismissed_by_id_people_id_fk" FOREIGN KEY ("dismissed_by_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pathway_reviews" ADD CONSTRAINT "pathway_reviews_pathway_id_pathways_id_fk" FOREIGN KEY ("pathway_id") REFERENCES "public"."pathways"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pathway_reviews" ADD CONSTRAINT "pathway_reviews_reviewer_id_people_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pathway_reviews" ADD CONSTRAINT "pathway_reviews_objection_addressed_by_id_people_id_fk" FOREIGN KEY ("objection_addressed_by_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pathway_stages" ADD CONSTRAINT "pathway_stages_pathway_id_pathways_id_fk" FOREIGN KEY ("pathway_id") REFERENCES "public"."pathways"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pathway_transitions" ADD CONSTRAINT "pathway_transitions_pathway_id_pathways_id_fk" FOREIGN KEY ("pathway_id") REFERENCES "public"."pathways"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pathway_transitions" ADD CONSTRAINT "pathway_transitions_actor_id_people_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pathways" ADD CONSTRAINT "pathways_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pathways" ADD CONSTRAINT "pathways_published_by_id_people_id_fk" FOREIGN KEY ("published_by_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pathway_findings_pathway_idx" ON "pathway_health_findings" USING btree ("pathway_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pathway_reviews_reviewer_idx" ON "pathway_reviews" USING btree ("pathway_id","reviewer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pathway_stages_order_idx" ON "pathway_stages" USING btree ("pathway_id","position");--> statement-breakpoint
CREATE INDEX "pathway_transitions_pathway_idx" ON "pathway_transitions" USING btree ("pathway_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pathways_version_idx" ON "pathways" USING btree ("church_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "pathways_one_active_idx" ON "pathways" USING btree ("church_id") WHERE "pathways"."state" = 'active';--> statement-breakpoint
-- New tables arrive with row-level security off and no policy, which for a
-- Supabase project means the publishable key can read them over the REST API.
-- The pathway is not confidential the way a care note is, but "not secret" is
-- not the same as "public", and the default has to be closed.
--
-- The same idempotent block as 0007, so this migration leaves the database in
-- the state 0007 describes rather than a partial version of it.
--
-- Scoped to tables the running role owns, because only an owner may enable RLS.
-- Run as `postgres` that is every table; run as `fold_app` from
-- `npm run db:migrate` it is exactly the tables this migration just created,
-- which is the set that needs it. Guarded on the role existing so an environment
-- that has not created `fold_app` yet fails loudly at 0007 rather than here.
DO $$
DECLARE r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fold_app') THEN
    RAISE NOTICE 'fold_app does not exist; see 0007_app_role_and_policies.sql';
    RETURN;
  END IF;
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tableowner = current_user
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    EXECUTE format('DROP POLICY IF EXISTS fold_app_full_access ON public.%I', r.tablename);
    EXECUTE format(
      'CREATE POLICY fold_app_full_access ON public.%I FOR ALL TO fold_app USING (true) WITH CHECK (true)',
      r.tablename);
  END LOOP;
END $$;
