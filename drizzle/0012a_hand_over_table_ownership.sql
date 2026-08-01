-- Give `fold_app` ownership of the tables it cannot alter.
--
-- MUST BE RUN AS `postgres`, in the Supabase SQL editor. `fold_app` cannot run it
-- on itself, which is the whole problem.
--
-- The problem this fixes
-- ----------------------
-- 22 of the 32 tables are owned by `postgres`, because migrations 0000–0007 were
-- applied by pasting them into the Supabase SQL editor. `fold_app` has every
-- privilege on them — it can insert, update, delete, read — but ALTER TABLE
-- requires *ownership*, not privileges. So `npm run db:migrate` can create new
-- tables and can alter the ten it owns, and fails on the other 22 with
--
--     42501: must be owner of table ai_recommendations
--
-- and drizzle-kit swallows that error: it prints nothing, records nothing, and
-- exits 1. A migration appears to run and silently does not. That is the worst
-- possible failure mode for a schema change, and it will happen to every future
-- migration that touches any of those 22 tables.
--
-- Why ownership rather than more grants
-- -------------------------------------
-- There is no grant that confers ALTER; ownership is the only mechanism. Note that
-- `0007_app_role_and_policies.sql` wanted ownership in the first place and settled
-- for a policy because "ALTER TABLE ... OWNER TO repeatedly terminated the editor's
-- connection". If that happens again, run the loop in batches — the DO block below
-- is idempotent, so re-running it finishes the job.
--
-- What this changes about security
-- --------------------------------
-- A table owner bypasses row-level security. After this, `fold_app` bypasses RLS on
-- all 32 tables rather than on the ten it already owns. That does not widen what
-- the *application* can reach: `fold_app` already holds an ALL policy on every
-- table, so RLS was never restricting it. What matters for the anon key is
-- unchanged — `anon` and `authenticated` still have no policy and no grants, so
-- Supabase's REST API returns nothing to the publishable key either way. Verify
-- that yourself after running this; it is one curl per table.
--
-- Confidentiality in Fold is enforced in the application — the tier model, the
-- permission checks, and every query being scoped by `church_id` — not by RLS.
-- RLS here is a second lock on the door, and it stays in place.

GRANT fold_app TO postgres;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND pg_get_userbyid(c.relowner) <> 'fold_app'
  LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO fold_app', r.tablename);
  END LOOP;
END $$;

-- The enum types too. A migration that adds a value to one — a new role, a new
-- milestone kind — needs ownership of the type for the same reason.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT t.typname
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typtype = 'e'
      AND pg_get_userbyid(t.typowner) <> 'fold_app'
  LOOP
    EXECUTE format('ALTER TYPE public.%I OWNER TO fold_app', r.typname);
  END LOOP;
END $$;

-- Then, back in a terminal:
--
--     npm run db:migrate
--
-- which applies the pending 0011 (replacing two CHECK constraints that never
-- checked anything) and everything after it.
--
-- Check it worked — this should return no rows:
--
--     SELECT c.relname, pg_get_userbyid(c.relowner) AS owner
--     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--     WHERE n.nspname = 'public' AND c.relkind = 'r'
--       AND pg_get_userbyid(c.relowner) <> 'fold_app';
