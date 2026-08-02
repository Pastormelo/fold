import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db, schema } from '@/db/client'

import {
  type PcAuth,
  planningCenterCredentials as fromEnvironment,
} from './config'
import {
  type PcTokens,
  isOAuthConfigured,
  oauthApp,
  refreshTokens,
} from './oauth'
import { decryptSecret, encryptSecret, secretHint } from './secrets'

/**
 * Where a Planning Center credential comes from, in order.
 *
 * 1. **The environment**, when both variables are set. A deployment that manages
 *    its own secrets should not have them silently overridden by a row somebody
 *    pasted into a form, and this order is also what keeps the client's tests
 *    honest — they set the variables and get exactly those.
 * 2. **The database**, which is either an OAuth connection or a pasted Personal
 *    Access Token. An OAuth access token lasts two hours, so it is refreshed here
 *    when it has expired — at the moment of use, rather than on a schedule, which
 *    means there is no background job to go wrong and a connection nobody has used
 *    for a month still works on the next click.
 * 3. **Nothing**, which is an ordinary state rather than an error.
 *
 * The secret never leaves the server: this module is `server-only`, the value is
 * decrypted at the moment of the call, and the read models built for the page
 * carry a four-character hint instead.
 */

export const PLANNING_CENTER = 'planning_center'

export type ResolvedCredentials = {
  /**
   * How to sign a request with this credential.
   *
   * Carried rather than derived by the caller. The two schemes are not
   * interchangeable — a Personal Access Token is Basic, an OAuth access token is
   * Bearer — and when the caller decided, it decided wrong: every OAuth request
   * went out as a Basic password and came back 401.
   */
  auth: PcAuth
  /** Which of the three it came from, for the screen to be honest about. */
  source: 'environment' | 'database' | 'oauth'
}

export type CredentialStatus =
  | { state: 'none'; oauthAvailable: boolean }
  | { state: 'environment' }
  | {
      state: 'stored'
      appId: string
      secretHint: string
      connectedByName: string
      connectedAt: Date
    }
  /** Connected by signing in. No credential for the church to see or manage. */
  | {
      state: 'oauth'
      connectedByName: string
      connectedAt: Date
      accessExpiresAt: Date | null
      /** True once the refresh has failed — they need to sign in again. */
      needsReauthorising: boolean
    }
  /** Stored but unreadable — almost always a rotated database password. */
  | { state: 'unreadable'; appId: string; connectedAt: Date }

export async function resolveCredentials(
  churchId: string
): Promise<ResolvedCredentials | null> {
  const environment = fromEnvironment()
  if (environment !== null) {
    return {
      auth: { kind: 'basic', ...environment },
      source: 'environment',
    }
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

  if (row.kind !== 'oauth') {
    return {
      auth: { kind: 'basic', appId: row.appId, secret },
      source: 'database',
    }
  }

  /*
   * An OAuth access token. `secret` is the access token here, not a client secret.
   *
   * Refreshed only when it has actually expired. Refreshing on every call would
   * work and would also mean every page view spends a round trip to Planning
   * Center and rewrites a row, for a token that is usually good for another
   * ninety minutes.
   */
  if (row.accessExpiresAt !== null && row.accessExpiresAt > new Date()) {
    return { auth: { kind: 'bearer', accessToken: secret }, source: 'oauth' }
  }

  const app = oauthApp()
  const storedRefresh =
    row.refreshEncrypted === null ? null : decryptSecret(row.refreshEncrypted)
  if (app === null || storedRefresh === null) return null

  const refreshed = await refreshTokens({ app, refreshToken: storedRefresh })
  if (!refreshed.ok) {
    // The refresh token has been revoked, or has expired unused. Nothing to do
    // here but report no credential; the Setup screen then shows the connection
    // as needing to be re-authorised, which is the truth.
    return null
  }

  await storeOAuthConnection({
    churchId,
    personId: row.connectedById,
    tokens: refreshed.value,
  })

  return {
    auth: { kind: 'bearer', accessToken: refreshed.value.accessToken },
    source: 'oauth',
  }
}

/**
 * Write an OAuth connection, replacing whatever was there.
 *
 * Both tokens are stored together and encrypted. Planning Center issues a new
 * refresh token every time one is used and invalidates the old one, so a write
 * that saved only the access token would leave the connection dead in two hours
 * with no way to revive it except reconnecting by hand.
 *
 * `appId` holds the OAuth client id rather than an Application ID. It is not a
 * secret, and keeping the column filled means the screen has something to show for
 * both kinds of connection.
 */
export async function storeOAuthConnection(input: {
  churchId: string
  personId: string
  tokens: PcTokens
}): Promise<void> {
  const app = oauthApp()
  const values = {
    churchId: input.churchId,
    provider: PLANNING_CENTER,
    appId: app?.clientId ?? 'planning-center-oauth',
    kind: 'oauth' as const,
    secretEncrypted: encryptSecret(input.tokens.accessToken),
    secretHint: secretHint(input.tokens.accessToken),
    refreshEncrypted: encryptSecret(input.tokens.refreshToken),
    accessExpiresAt: input.tokens.expiresAt,
    connectedById: input.personId,
  }

  await db
    .insert(schema.integrationCredentials)
    .values(values)
    .onConflictDoUpdate({
      target: [
        schema.integrationCredentials.churchId,
        schema.integrationCredentials.provider,
      ],
      set: {
        appId: values.appId,
        kind: values.kind,
        secretEncrypted: values.secretEncrypted,
        secretHint: values.secretHint,
        refreshEncrypted: values.refreshEncrypted,
        accessExpiresAt: values.accessExpiresAt,
        connectedById: values.connectedById,
        connectedAt: new Date(),
      },
    })
}

/** What the Setup screen shows, with no secret in it. */
export async function credentialStatus(
  churchId: string
): Promise<CredentialStatus> {
  if (fromEnvironment() !== null) return { state: 'environment' }

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

  // Nothing stored. Whether the screen can offer a sign-in button depends on
  // whether this deployment has an application registered, which is not the
  // church's business to fix but is very much their business to be told about.
  if (!row) return { state: 'none', oauthAvailable: isOAuthConfigured() }

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

  const connectedByName = person
    ? `${person.firstName} ${person.lastName}`
    : 'Someone'

  if (row.kind === 'oauth') {
    /*
     * Whether it still works, without spending a request to find out.
     *
     * An expired access token is normal — it lasts two hours and is refreshed on
     * next use. What is not recoverable is an expired access token with no usable
     * refresh token, which is the state after somebody revokes Fold's access in
     * Planning Center. That is the one worth showing.
     */
    const expired =
      row.accessExpiresAt !== null && row.accessExpiresAt <= new Date()
    const refreshable =
      row.refreshEncrypted !== null &&
      decryptSecret(row.refreshEncrypted) !== null &&
      isOAuthConfigured()

    return {
      state: 'oauth',
      connectedByName,
      connectedAt: row.connectedAt,
      accessExpiresAt: row.accessExpiresAt,
      needsReauthorising: expired && !refreshable,
    }
  }

  return {
    state: 'stored',
    appId: row.appId,
    secretHint: row.secretHint,
    connectedByName,
    connectedAt: row.connectedAt,
  }
}
