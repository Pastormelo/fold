CREATE TYPE "public"."care_window" AS ENUM('same_day', 'within_48_hours', 'week_1', 'week_2', 'month_1', 'month_3', 'month_6');--> statement-breakpoint
CREATE TYPE "public"."completion_kind" AS ENUM('done', 'skipped');--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "journey_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"window" "care_window" NOT NULL,
	"owner_role" "role_name" NOT NULL,
	"guidance_note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journey_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"name" text NOT NULL,
	"trigger" text NOT NULL,
	"visibility_tier" "confidentiality_tier" NOT NULL,
	"is_system_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "journey_instances" ADD CONSTRAINT "journey_instances_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_instances" ADD CONSTRAINT "journey_instances_template_id_journey_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."journey_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_instances" ADD CONSTRAINT "journey_instances_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_instances" ADD CONSTRAINT "journey_instances_owner_id_people_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_step_completions" ADD CONSTRAINT "journey_step_completions_instance_id_journey_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."journey_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_step_completions" ADD CONSTRAINT "journey_step_completions_step_id_journey_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."journey_steps"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_step_completions" ADD CONSTRAINT "journey_step_completions_by_id_people_id_fk" FOREIGN KEY ("by_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_steps" ADD CONSTRAINT "journey_steps_template_id_journey_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."journey_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_templates" ADD CONSTRAINT "journey_templates_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "journey_instances_person_idx" ON "journey_instances" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "journey_instances_owner_idx" ON "journey_instances" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "journey_instances_church_idx" ON "journey_instances" USING btree ("church_id");--> statement-breakpoint
CREATE UNIQUE INDEX "journey_step_once_idx" ON "journey_step_completions" USING btree ("instance_id","step_id");--> statement-breakpoint
CREATE UNIQUE INDEX "journey_steps_order_idx" ON "journey_steps" USING btree ("template_id","position");--> statement-breakpoint
CREATE INDEX "journey_templates_church_idx" ON "journey_templates" USING btree ("church_id");