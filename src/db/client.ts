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

function connection() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env.local and point it at a Postgres database.'
    )
  }
  // Reused across hot reloads in development so a dev session does not exhaust
  // the connection pool.
  globalThis.__foldSql ??= postgres(url, { max: 10 })
  return globalThis.__foldSql
}

export const db = drizzle(connection(), { schema })

export { schema }
