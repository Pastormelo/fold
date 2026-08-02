import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db, schema } from '@/db/client'

import { planningCenterCredentials as fromEnvironment } from './config'
import { decryptSecret } from './secrets'

/**
 * Where a Planning Center credential comes from, in order.
 *
 * 1. **The environment**, when both variables are set. A deployment that manages
 *    its own secrets should not have them silently overridden by a row somebody
 *    pasted into a form, and this order is also what keeps the client's tests
 *    honest — they set the variables and get exactly those.
 * 2. **The database**, entered on the Setup screen and decrypted here.
 * 3. **Nothing**, which is an ordinary state rather than an error.
 *
 * The secret never leaves the server: this module is `server-only`, the value is
 * decrypted at the moment of the call, and the read models built for the page
 * carry a four-character hint instead.
 */

export const PLANNING_CENTER = 'planning_center'

export type ResolvedCredentials = {
  appId: string
  secret: string
  /** Which of the two places it came from, for the screen to be honest about. */
  source: 'environment' | 'database'
}

export type CredentialStatus =
  | { state: 'none' }
  | { state: 'environment' }
  | {
      state: 'stored'
      appId: string
      secretHint: string
      connectedByName: string
      connectedAt: Date
    }
  /** Stored but unreadable — almost always a rotated database password. */
  | { state: 'unreadable'; appId: string; connectedAt: Date }

export async function resolveCredentials(
  churchId: string
): Promise<ResolvedCredentials | null> {
  const environment = fromEnvironment()
  if (environment !== null) {
    return { ...environment, source: 'environment' }
  }

  const [row] = await db
    .select()
    .from(schema.integrationCredentials)
    .where(
      and(
        eq(schema.integrationCredentials.churchId, churchId),
        eq(schema.integrationCredentials.provider, PLANNING_CENTER)
      )
    )
    .limit(1)

  if (!row) return null

  const secret = decryptSecret(row.secretEncrypted)
  // A credential that cannot be decrypted is not a credential. Returning null
  // rather than an empty secret means the caller reports "not connected" instead
  // of sending an empty password to Planning Center and reporting a 401.
  if (secret === null) return null

  return { appId: row.appId, secret, source: 'database' }
}

/** What the Setup screen shows, with no secret in it. */
export async function credentialStatus(
  churchId: string
): Promise<CredentialStatus> {
  if (fromEnvironment() !== null) return { state: 'environment' }

  const [row] = await db
    .select({
      appId: schema.integrationCredentials.appId,
      secretEncrypted: schema.integrationCredentials.secretEncrypted,
      secretHint: schema.integrationCredentials.secretHint,
      connectedAt: schema.integrationCredentials.connectedAt,
      connectedById: schema.integrationCredentials.connectedById,
    })
    .from(schema.integrationCredentials)
    .where(
      and(
        eq(schema.integrationCredentials.churchId, churchId),
        eq(schema.integrationCredentials.provider, PLANNING_CENTER)
      )
    )
    .limit(1)

  if (!row) return { state: 'none' }

  if (decryptSecret(row.secretEncrypted) === null) {
    return {
      state: 'unreadable',
      appId: row.appId,
      connectedAt: row.connectedAt,
    }
  }

  const [person] = await db
    .select({
      firstName: schema.people.firstName,
      lastName: schema.people.lastName,
    })
    .from(schema.people)
    .where(eq(schema.people.id, row.connectedById))
    .limit(1)

  return {
    state: 'stored',
    appId: row.appId,
    secretHint: row.secretHint,
    connectedByName: person
      ? `${person.firstName} ${person.lastName}`
      : 'Someone',
    connectedAt: row.connectedAt,
  }
}
