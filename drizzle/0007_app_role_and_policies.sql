-- The application role, and row-level security that lets it through.
--
-- Recorded here because it was applied by hand through the Supabase SQL editor,
-- and a future environment needs the same shape.
--
-- Why a dedicated role rather than `postgres`: Supabase does not allow altering
-- privileged roles from the SQL editor, so the postgres password could not be
-- set reliably — and an application should not connect as the superuser anyway.
--
-- Why a policy rather than table ownership: owners bypass RLS, which would have
-- been tidier, but ALTER TABLE ... OWNER TO repeatedly terminated the editor's
-- connection. An explicit policy reaches the same place: the app has full
-- access, and anon and authenticated have no policy at all, so Supabase's REST
-- API returns nothing to the publishable key. Verified against real rows.
--
-- The password is supplied per environment, never committed.

-- CREATE ROLE fold_app LOGIN PASSWORD '<from the environment>';

GRANT USAGE ON SCHEMA public TO fold_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO fold_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO fold_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO fold_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO fold_app;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    EXECUTE format('DROP POLICY IF EXISTS fold_app_full_access ON public.%I', r.tablename);
    EXECUTE format(
      'CREATE POLICY fold_app_full_access ON public.%I FOR ALL TO fold_app USING (true) WITH CHECK (true)',
      r.tablename);
  END LOOP;
END $$;
