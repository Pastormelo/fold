CREATE TYPE "public"."discovery_section" AS ENUM('church_and_context', 'what_happens_now', 'membership_and_theology', 'people_and_capacity', 'discipleship', 'communication', 'review_and_governance');--> statement-breakpoint
CREATE TABLE "discovery_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"section" "discovery_section" NOT NULL,
	"question" text NOT NULL,
	"why" text NOT NULL,
	"answer" text,
	"answered_by_id" uuid,
	"answered_at" timestamp with time zone,
	"asked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discovery_answer_is_complete" CHECK (("discovery_questions"."answer" IS NULL AND "discovery_questions"."answered_by_id" IS NULL AND "discovery_questions"."answered_at" IS NULL)
          OR (btrim("discovery_questions"."answer") <> '' AND "discovery_questions"."answered_by_id" IS NOT NULL AND "discovery_questions"."answered_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "discovery_questions" ADD CONSTRAINT "discovery_questions_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_questions" ADD CONSTRAINT "discovery_questions_answered_by_id_people_id_fk" FOREIGN KEY ("answered_by_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discovery_church_idx" ON "discovery_questions" USING btree ("church_id","section");