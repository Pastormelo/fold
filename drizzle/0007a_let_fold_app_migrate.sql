-- One-time: let `npm run db:migrate` work from a terminal.
--
-- Applied by hand through the Supabase SQL editor as `postgres`, because it
-- grants privileges the app role cannot grant itself. Recorded here so a future
-- environment ends up in the same place.
--
-- The problem it solves: 0000 through 0007 were pasted into the SQL editor, so
-- Drizzle's migration ledger was never created and `drizzle-kit migrate` saw an
-- empty database — it would have tried to apply 0000 against tables that already
-- existed. And `fold_app` had USAGE on `public` but not CREATE, so it could read
-- and write every row and yet not create a table. Every schema change was
-- therefore a manual copy-paste, which is slow and easy to get half-right.
--
-- The trade-off, stated plainly: `fold_app` is the credential the running app
-- uses, and this lets it run DDL. That is a real widening. It is a small one next
-- to what the role already has — ALL PRIVILEGES on every table, which is read and
-- write access to every care note in the database — and the alternative is a
-- second password for the church to keep track of. A separate migration role is
-- the textbook answer and is worth revisiting if Fold is ever run by someone
-- other than the person who deploys it.
--
-- Tables `fold_app` creates from here on are owned by `fold_app`, which means
-- Supabase's `anon` and `authenticated` roles get no grant on them at all — the
-- default privileges that would have granted it belong to `postgres`. New tables
-- are therefore closed to the REST API more firmly than the ones 0007 had to
-- write policies for.

GRANT CREATE ON SCHEMA public TO fold_app;

-- Drizzle keeps its ledger in a `drizzle` schema and issues
-- `CREATE SCHEMA IF NOT EXISTS drizzle` on every run. Postgres checks the
-- privilege before the existence clause, so creating the schema here is not
-- enough on its own — the grant is needed even though the schema already exists
-- by the time Drizzle asks. Tested, rather than assumed.
GRANT CREATE ON DATABASE postgres TO fold_app;

CREATE SCHEMA IF NOT EXISTS drizzle;
GRANT ALL ON SCHEMA drizzle TO fold_app;

CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id serial PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);
GRANT ALL ON drizzle.__drizzle_migrations TO fold_app;
GRANT ALL ON SEQUENCE drizzle.__drizzle_migrations_id_seq TO fold_app;

-- The migrations that were applied by hand, marked as applied without being run
-- again. The hashes are sha256 of each file's contents, which is what
-- drizzle-orm's `readMigrationFiles` computes; if a file is edited after this
-- point the hash will not match and `drizzle-kit migrate` will say so.
--
-- 0006 and 0007 are absent on purpose: they are hand-written SQL that is not in
-- Drizzle's journal, so Drizzle never looks for them.
INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
VALUES
  ('5235ac710818d82994e20a59fe91d04202d6663f1a8a425ed288125231f3226e', 1785083284491),
  ('3bac0db1c057afd8bd0accd20d3c0e2af2e6dec8e8ae1ddba432d4efdf5472ec', 1785101021771),
  ('b2055e0fa3d33cf08080c5a852417554b9c980c6c4295b4037d77f0ca738160f', 1785101391211),
  ('abf558c7a6bf370f32606245ce8a5d44e092902cad704295fad353d1fd19bbed', 1785102067940),
  ('eb8144d6ec46a166da5de11d85040f4ed2003f39d71c18bb4a278a2117eb2378', 1785104172027),
  ('0a0a1720a113639bd61fa881d52de532effc6ba8342c66dd1f65d55d5f950b9b', 1785105801965)
ON CONFLICT DO NOTHING;

-- Should print 6.
SELECT count(*) AS migrations_marked_applied FROM drizzle.__drizzle_migrations;
