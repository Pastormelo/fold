-- Row-level security for `discovery_questions`, and a guard so the next new
-- table cannot miss it the way this one did.
--
-- `0007_app_role_and_policies.sql` enabled RLS and added the `fold_app_full_access`
-- policy to every table that existed at the time, by looping over `pg_tables`.
-- A table created afterwards gets neither, which is what happened here:
-- `discovery_questions` was the only table in the schema with RLS off.
--
-- What was actually protecting it was the *absence of a grant* — the anon key gets
-- a 401 on it, where the older tables return `[]` because RLS filters the rows to
-- nothing. So this was not an open door; it was a door held shut by a second lock
-- while the first one was missing. Worth closing anyway: the next person to add a
-- grant would reasonably assume RLS was doing the work, and discovery answers are
-- a church describing its own membership and pastoral practice.
--
-- Two statements, then the same loop 0007 used, run again. Re-running is harmless:
-- ENABLE is idempotent and the policy is dropped before it is created.

ALTER TABLE public.discovery_questions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      -- Only tables this role owns. A postgres-owned table cannot be altered
      -- from the app connection; those are handled by
      -- `0012a_hand_over_table_ownership.sql`, applied as postgres.
      AND pg_get_userbyid(c.relowner) = current_user
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    EXECUTE format('DROP POLICY IF EXISTS fold_app_full_access ON public.%I', r.tablename);
    EXECUTE format(
      'CREATE POLICY fold_app_full_access ON public.%I FOR ALL TO fold_app USING (true) WITH CHECK (true)',
      r.tablename);
  END LOOP;
END $$;
