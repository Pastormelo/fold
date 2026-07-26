CREATE TYPE "public"."ai_audit_event" AS ENUM('prompt_sent', 'recommendation_made', 'verdict_recorded', 'manual_edit', 'publication_decision');--> statement-breakpoint
CREATE TYPE "public"."verdict_kind" AS ENUM('accepted', 'modified', 'saved', 'rejected');--> statement-breakpoint
CREATE TABLE "ai_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"event" "ai_audit_event" NOT NULL,
	"actor_id" uuid NOT NULL,
	"detail" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "recommendation_verdicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recommendation_id" uuid NOT NULL,
	"verdict" "verdict_kind" NOT NULL,
	"reason" text NOT NULL,
	"decided_by_id" uuid NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verdict_has_a_reason" CHECK (btrim("recommendation_verdicts"."reason") <> '')
);
--> statement-breakpoint
ALTER TABLE "ai_audit_log" ADD CONSTRAINT "ai_audit_log_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_audit_log" ADD CONSTRAINT "ai_audit_log_actor_id_people_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_recommendations" ADD CONSTRAINT "ai_recommendations_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_verdicts" ADD CONSTRAINT "recommendation_verdicts_recommendation_id_ai_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."ai_recommendations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_verdicts" ADD CONSTRAINT "recommendation_verdicts_decided_by_id_people_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_audit_church_idx" ON "ai_audit_log" USING btree ("church_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ai_recommendations_church_idx" ON "ai_recommendations" USING btree ("church_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recommendation_verdict_idx" ON "recommendation_verdicts" USING btree ("recommendation_id");