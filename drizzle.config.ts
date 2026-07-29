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

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
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
