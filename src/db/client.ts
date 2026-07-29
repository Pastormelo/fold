import 'server-only'

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

/**
 * The only place in the app that reads `DATABASE_URL`, per the Next.js data
 * security guidance: secrets stay inside the data access layer.
 *
 * `server-only` at the top of this file makes importing it from a Client
 * Component a build error rather than a runtime leak.
 */
declare global {
  var __foldSql: ReturnType<typeof postgres> | undefined
}

/** Serverless gives each invocation its own process, so pools must not be big. */
function isServerless(): boolean {
  return process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined
}

function connection() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env.local and point it at a Postgres database.'
    )
  }

  // Reused across hot reloads in development so a dev session does not exhaust
  // the connection pool.
  globalThis.__foldSql ??= postgres(url, {
    /**
     * Supabase's transaction pooler (port 6543) does not support prepared
     * statements, and postgres.js uses them by default — the failure is an
     * opaque error on the *second* query with the same shape, which is a
     * miserable thing to debug. Disabling them costs a little planning time and
     * is harmless on a direct connection, so it is unconditional rather than
     * guessed from the host.
     */
    prepare: false,
    /**
     * One connection per invocation in serverless: every lambda would otherwise
     * open its own pool of ten and exhaust the database's limit under any real
     * load. Locally a larger pool is useful.
     */
    max: isServerless() ? 1 : 10,
    /** Supabase requires TLS; this is the setting its own guides use. */
    ssl: 'require',
  })
  return globalThis.__foldSql
}

/**
 * The database handle, connected lazily on first use.
 *
 * An earlier version called `connection()` at module scope, which meant merely
 * *importing* this file opened a connection — and `next build` imports every
 * route to collect page data. The build therefore required a reachable database
 * and a `DATABASE_URL`, and failed on Vercel where neither exists at build time.
 *
 * A build should never need a live database. The proxy defers everything to the
 * first actual query, so importing stays free and a missing `DATABASE_URL` is
 * reported when something tries to read, not when something tries to compile.
 */
let instance: ReturnType<typeof drizzle<typeof schema>> | null = null

function database() {
  instance ??= drizzle(connection(), { schema })
  return instance
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, property) {
    const real = database()
    const value = Reflect.get(real, property) as unknown
    // Bound, because Drizzle's methods rely on `this` and would otherwise be
    // called against the empty proxy target.
    return typeof value === 'function' ? value.bind(real) : value
  },
})

export { schema }
