ALTER TABLE "fold_list_mappings" DROP CONSTRAINT "list_mapped_has_a_target";--> statement-breakpoint
ALTER TABLE "fold_list_mappings" ADD COLUMN "external_field_ids" text[];--> statement-breakpoint
ALTER TABLE "fold_list_mappings" ADD CONSTRAINT "list_mapped_has_a_target" CHECK ("fold_list_mappings"."state" <> 'mapped' or cardinality("fold_list_mappings"."external_field_ids") >= 1);