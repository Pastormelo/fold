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

/**
 * Whether this connection string points at Supabase's transaction pooler.
 *
 * Read from the port rather than the hostname, because both poolers share a
 * hostname and only the port distinguishes them. Anything unparseable is treated
 * as a transaction pooler: the wrong guess in that direction is merely slow,
 * while the wrong guess in the other direction hangs a query until a timeout
 * kills it.
 */
export function isTransactionPooler(url: string): boolean {
  try {
    return new URL(url).port === '6543'
  } catch {
    return true
  }
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
     * Prepared statements, on everything except the transaction pooler.
     *
     * This was `prepare: false` unconditionally, with a comment claiming it
     * "costs a little planning time and is harmless on a direct connection".
     * That was wrong, and it was the reason the app felt slow to move around in.
     *
     * Without a prepared statement, postgres.js cannot pipeline: each
     * parameterised query needs its own describe round trip before its
     * parameters can be sent, so a page's queries go one after another even
     * inside a single `Promise.all`. Measured against this project's own
     * database from a laptop, one round trip being 105ms:
     *
     *   query with a parameter   prepare:false  213ms   prepare:true  108ms
     *   six queries, one page    prepare:false 1535ms   prepare:true  118ms
     *
     * Thirteen times, on the exact shape of a real page render. `EXPLAIN` puts
     * execution at 0.03ms — none of it was the database doing work.
     *
     * The original reason was real, though, and still is: prepared statements
     * genuinely do not survive Supabase's transaction pooler. Turning them on
     * against port 6543 here failed with `57014 canceling statement due to
     * statement timeout` — it hangs rather than erroring cleanly, which is the
     * miserable debugging the old comment was trying to avoid. So this is
     * derived from the port rather than turned on everywhere:
     *
     *   6543  transaction pooler (Supabase's advice for serverless) — off
     *   5432  session pooler, and any direct connection                — on
     *
     * Both were tested against this database rather than reasoned about.
     */
    prepare: !isTransactionPooler(url),
    /**
     * One connection, everywhere.
     *
     * The serverless half of this was always right — every lambda opening its own
     * pool of ten exhausts the database's connection limit under any real load.
     * The "locally a larger pool is useful" half was an assumption, and measuring
     * it found the opposite, for the same reason prepared statements matter above:
     * postgres.js pipelines a page's queries down one connection as a single round
     * trip, and a pool defeats that by spreading them across connections that each
     * pay their own.
     *
     * Six queries, one page, prepared statements on, against this database:
     *
     *   max:1   109ms, steady
     *   max:5   227ms
     *   max:10  237ms, and erratic — 119ms to 570ms as connections churn
     *
     * So this is not a concession to serverless; it is faster. The trade is that
     * one slow query blocks the others behind it on that connection, which in
     * serverless cannot cross requests anyway and locally means an import can hold
     * up a page load. Worth raising only for a long-running deployment serving
     * many people at once, which this is not.
     */
    max: 1,
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
