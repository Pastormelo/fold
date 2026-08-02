import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

/**
 * `.env.local` first, because that is where Next.js puts secrets and where the
 * setup instructions tell people to paste `DATABASE_URL`. Plain `dotenv/config`
 * reads only `.env`, so `npm run db:migrate` reported "url: undefined" on a
 * machine that was correctly configured — the command in the README did not
 * work. Earlier values win, so `.env` stays a fallback.
 */
config({ path: ['.env.local', '.env'] })

/**
 * Migrations may connect as a different role than the app does.
 *
 * `fold_app` holds every privilege on every table, but ALTER TABLE requires
 * *ownership* rather than privileges, and `postgres` owns the 22 tables created by
 * pasting migrations 0000–0007 into the Supabase SQL editor. So a migration that
 * alters one of those fails with `42501: must be owner of table …` — and
 * drizzle-kit swallows it: no message, nothing recorded, exit 1. A migration
 * appears to run and silently does not, which is the worst way for a schema change
 * to fail.
 *
 * Two ways out, and this supports both:
 *
 * 1. Hand ownership to `fold_app` — `drizzle/0012a_hand_over_table_ownership.sql`,
 *    pasted into the SQL editor as `postgres`. Then `DATABASE_URL` alone is enough
 *    and nothing else changes.
 * 2. Set `MIGRATION_DATABASE_URL` to a connection string for a role that owns the
 *    tables (Supabase's `postgres` user, from Settings → Database). The app keeps
 *    connecting as `fold_app`; only this command uses the privileged role. This is
 *    the ordinary shape — migrations run privileged, the application does not — and
 *    it leaves table ownership, and therefore who bypasses row-level security,
 *    exactly as it is.
 *
 * The app never reads this variable: `src/db/client.ts` uses `DATABASE_URL` only,
 * so a privileged string here cannot leak into a request path.
 */
const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: url!,
    /** Supabase requires TLS. */
    ssl: 'require',
  },
  /**
   * Not Drizzle's default `drizzle.__drizzle_migrations`.
   *
   * Supabase runs an event trigger that enables row-level security on every new
   * table. The default ledger got created by `postgres` in the SQL editor, which
   * left it RLS-enabled, owned by `postgres`, and with no policy — so `fold_app`
   * could read it and could not write to it, and `drizzle-kit migrate`
   * consequently recorded nothing it did. Naming the table here means `fold_app`
   * creates it and owns it, and an owner is not subject to RLS.
   */
  migrations: {
    table: 'fold_migrations',
    schema: 'drizzle',
  },
  strict: true,
  verbose: true,
})
