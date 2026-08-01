ALTER TABLE "ai_recommendations" DROP CONSTRAINT "recommendation_offers_an_option";--> statement-breakpoint
ALTER TABLE "ai_recommendations" DROP CONSTRAINT "recommendation_cites_the_church";--> statement-breakpoint
ALTER TABLE "ai_recommendations" ADD CONSTRAINT "recommendation_offers_an_option" CHECK (cardinality("ai_recommendations"."options") >= 1);--> statement-breakpoint
ALTER TABLE "ai_recommendations" ADD CONSTRAINT "recommendation_cites_the_church" CHECK (cardinality("ai_recommendations"."cited_answer_ids") >= 1);