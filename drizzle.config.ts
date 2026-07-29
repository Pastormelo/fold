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
  strict: true,
  verbose: true,
})
