-- Give `fold_app` ownership of the objects it cannot alter.
--
-- MUST BE RUN AS `postgres`, in the Supabase SQL editor. Paste the whole file and
-- run it. It replaces the DO-block version, which silently did nothing: the loops
-- were dollar-quoted and contained semicolons, and a statement splitter that is
-- not dollar-quote aware chops such a block into fragments. Only the GRANT on the
-- first line survived. These are plain statements — nothing to mis-split.
--
-- WHY THIS IS NEEDED
-- Migrations 0000-0007 were applied by pasting them into the SQL editor, so
-- `postgres` owns the objects they created. `fold_app` has every privilege on
-- them but ALTER TABLE requires *ownership*, not privileges. So
-- `npm run db:migrate` fails on those objects with
--
--     42501: must be owner of table ai_recommendations
--
-- and drizzle-kit swallows that error: prints nothing, records nothing, exits 1.
-- A migration appears to run and silently does not.
--
-- WHAT THIS CHANGES ABOUT SECURITY
-- A table owner bypasses row-level security, so afterwards `fold_app` bypasses RLS
-- on all 32 tables rather than the 10 it already owns. That does not widen what the
-- application can reach: `fold_app` already holds an ALL policy on every table, so
-- RLS was never restricting it. `anon` and `authenticated` still have no policy and
-- no grants, so the publishable key still gets nothing. Confidentiality in Fold is
-- enforced in the application — the tier model, the permission checks, and every
-- query scoped by church_id — not by RLS.
--
-- Re-running is harmless: ALTER ... OWNER TO on an object already owned by that
-- role succeeds and does nothing.

GRANT fold_app TO postgres;

-- 22 tables
ALTER TABLE public.ai_audit_log OWNER TO fold_app;
ALTER TABLE public.ai_recommendations OWNER TO fold_app;
ALTER TABLE public.care_notes OWNER TO fold_app;
ALTER TABLE public.change_log OWNER TO fold_app;
ALTER TABLE public.church_profile_entries OWNER TO fold_app;
ALTER TABLE public.churches OWNER TO fold_app;
ALTER TABLE public.clearance_grants OWNER TO fold_app;
ALTER TABLE public.fold_list_mappings OWNER TO fold_app;
ALTER TABLE public.folds OWNER TO fold_app;
ALTER TABLE public.households OWNER TO fold_app;
ALTER TABLE public.integration_mappings OWNER TO fold_app;
ALTER TABLE public.journey_instances OWNER TO fold_app;
ALTER TABLE public.journey_step_completions OWNER TO fold_app;
ALTER TABLE public.journey_steps OWNER TO fold_app;
ALTER TABLE public.journey_templates OWNER TO fold_app;
ALTER TABLE public.leader_roles OWNER TO fold_app;
ALTER TABLE public.people OWNER TO fold_app;
ALTER TABLE public.permission_grants OWNER TO fold_app;
ALTER TABLE public.possible_duplicates OWNER TO fold_app;
ALTER TABLE public.recommendation_verdicts OWNER TO fold_app;
ALTER TABLE public.restoration_cases OWNER TO fold_app;
ALTER TABLE public.sync_settings OWNER TO fold_app;

-- 11 enum types. A migration adding a value to one — a new role, a
-- new milestone kind — needs ownership of the type for the same reason.
ALTER TYPE public.ai_audit_event OWNER TO fold_app;
ALTER TYPE public.care_window OWNER TO fold_app;
ALTER TYPE public.completion_kind OWNER TO fold_app;
ALTER TYPE public.confidentiality_tier OWNER TO fold_app;
ALTER TYPE public.fold_list OWNER TO fold_app;
ALTER TYPE public.mapping_state OWNER TO fold_app;
ALTER TYPE public.owning_system OWNER TO fold_app;
ALTER TYPE public.provenance OWNER TO fold_app;
ALTER TYPE public.role_name OWNER TO fold_app;
ALTER TYPE public.sync_category OWNER TO fold_app;
ALTER TYPE public.verdict_kind OWNER TO fold_app;

-- No sequences need transferring: every key in this schema is a uuid.

-- Then check. This should come back empty:
--
--   SELECT c.relname, pg_get_userbyid(c.relowner) AS owner
--   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND c.relkind = 'r'
--     AND pg_get_userbyid(c.relowner) <> 'fold_app';
--
-- Then, back in a terminal:  npm run db:migrate
