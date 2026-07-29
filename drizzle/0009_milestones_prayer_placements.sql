CREATE TYPE "public"."milestone_kind" AS ENUM('birthday', 'wedding_anniversary', 'baptism', 'membership', 'loss', 'new_baby', 'sobriety', 'moved_away');--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"kind" "milestone_kind" NOT NULL,
	"occurred_on" date NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"recorded_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pathway_placements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"connector_id" uuid,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"exited_at" timestamp with time zone,
	"exit_reason" text,
	CONSTRAINT "pathway_placements_exit_is_complete" CHECK (("pathway_placements"."exited_at" IS NULL) = ("pathway_placements"."exit_reason" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "prayed_for" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"times" integer DEFAULT 1 NOT NULL,
	"last_prayed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prayed_for_within_cap" CHECK ("prayed_for"."times" BETWEEN 1 AND 100)
);
--> statement-breakpoint
CREATE TABLE "prayer_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"asked_by_id" uuid NOT NULL,
	"body" text NOT NULL,
	"visibility_tier" "confidentiality_tier" NOT NULL,
	"asked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone,
	"answered_by_id" uuid,
	"outcome" text,
	CONSTRAINT "prayer_answered_is_complete" CHECK (("prayer_requests"."answered_at" IS NULL) = ("prayer_requests"."outcome" IS NULL)
          AND ("prayer_requests"."answered_at" IS NULL) = ("prayer_requests"."answered_by_id" IS NULL)),
	CONSTRAINT "prayer_outcome_not_blank" CHECK ("prayer_requests"."outcome" IS NULL OR btrim("prayer_requests"."outcome") <> '')
);
--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_recorded_by_id_people_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pathway_placements" ADD CONSTRAINT "pathway_placements_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pathway_placements" ADD CONSTRAINT "pathway_placements_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pathway_placements" ADD CONSTRAINT "pathway_placements_stage_id_pathway_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."pathway_stages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pathway_placements" ADD CONSTRAINT "pathway_placements_connector_id_people_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prayed_for" ADD CONSTRAINT "prayed_for_request_id_prayer_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."prayer_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prayed_for" ADD CONSTRAINT "prayed_for_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prayer_requests" ADD CONSTRAINT "prayer_requests_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prayer_requests" ADD CONSTRAINT "prayer_requests_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prayer_requests" ADD CONSTRAINT "prayer_requests_asked_by_id_people_id_fk" FOREIGN KEY ("asked_by_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prayer_requests" ADD CONSTRAINT "prayer_requests_answered_by_id_people_id_fk" FOREIGN KEY ("answered_by_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "milestones_church_idx" ON "milestones" USING btree ("church_id");--> statement-breakpoint
CREATE INDEX "milestones_person_idx" ON "milestones" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "milestones_unique_idx" ON "milestones" USING btree ("person_id","kind","occurred_on");--> statement-breakpoint
CREATE INDEX "pathway_placements_church_idx" ON "pathway_placements" USING btree ("church_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pathway_placements_live_idx" ON "pathway_placements" USING btree ("person_id") WHERE "pathway_placements"."exited_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "prayed_for_unique_idx" ON "prayed_for" USING btree ("request_id","person_id");--> statement-breakpoint
CREATE INDEX "prayer_requests_church_idx" ON "prayer_requests" USING btree ("church_id","asked_at");--> statement-breakpoint
CREATE INDEX "prayer_requests_person_idx" ON "prayer_requests" USING btree ("person_id");--> statement-breakpoint
-- Supabase's event trigger enables RLS on new tables but writes no policy, so a
-- new table is unreachable by the app until one exists. Scoped to tables the
-- running role owns, because only an owner may enable RLS. Same block as 0008.
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
