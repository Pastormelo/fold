-- Deny-by-default row-level security on every table.
--
-- Why this exists: Supabase exposes the `public` schema through PostgREST using
-- the publishable key, which is public by design and ships in the browser
-- bundle. Tables created by a plain migration have RLS *off*, so before this ran
-- a stranger with that key could read care_notes and restoration_cases over
-- HTTP. Confirmed by request: every table answered 200.
--
-- RLS is enabled with NO POLICIES, which denies everything through the Data API.
-- That is deliberate rather than unfinished: Fold does not use PostgREST. Its
-- server connects over direct Postgres as the table owner, which bypasses RLS,
-- and its authorization lives in src/data/ where it is tested. Adding policies
-- here would mean two authorization systems that could disagree — and §3 is hard
-- enough to get right once.
--
-- The DO block covers every table in the schema rather than naming them, so a
-- table added later cannot be forgotten.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    -- ENABLE, never FORCE. FORCE would apply RLS to the table owner as well,
    -- and the owner is exactly who Fold's server connects as — with no policies
    -- that would deny the application everything. ENABLE leaves the owner able
    -- to read while closing the door on anon and authenticated.
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

-- Belt and braces: take the schema away from the API roles entirely, so even a
-- future table created without RLS is not reachable through PostgREST.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE USAGE ON SCHEMA public FROM anon, authenticated;

-- And for tables created from here on.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
