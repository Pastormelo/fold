/**
 * Credentials for Planning Center, and what to say when there are none.
 *
 * **A Personal Access Token, not OAuth.** Planning Center offers both. OAuth is
 * what you need when many churches each authorise a hosted product; a token is
 * what you need when one church is reading its own data. Fold is the second case
 * today, and the difference is not small: OAuth means a callback route, an
 * authorisation code exchange, access and refresh tokens stored per church,
 * refresh-before-expiry logic, and a decision about encrypting tokens at rest.
 * A token is two environment variables and no stored secrets at all.
 *
 * If Fold ever serves churches other than this one, this is the module that
 * changes, and it will need all of the above.
 *
 * Neither variable carries the `NEXT_PUBLIC_` prefix. A Planning Center token
 * reads the church's entire directory, and Next inlines anything so prefixed
 * into the browser bundle.
 */

export const PC_APP_ID_VAR = 'PLANNING_CENTER_APP_ID'
export const PC_SECRET_VAR = 'PLANNING_CENTER_SECRET'

/** The People API. Versioned by Planning Center in the path, not a header. */
export const PC_PEOPLE_API = 'https://api.planningcenteronline.com/people/v2'

export type PlanningCenterCredentials = {
  appId: string
  secret: string
}

/**
 * Both halves or nothing.
 *
 * An empty string is not a credential — a platform that writes empty values for
 * variables added without one would otherwise produce a 401 at the API instead
 * of an explanation here.
 */
export function planningCenterCredentials(): PlanningCenterCredentials | null {
  const appId = process.env[PC_APP_ID_VAR]?.trim()
  const secret = process.env[PC_SECRET_VAR]?.trim()
  if (!appId || !secret) return null
  return { appId, secret }
}

export function isPlanningCenterConfigured(): boolean {
  return planningCenterCredentials() !== null
}

export const PC_NOT_CONFIGURED = `Planning Center is not connected. Create a Personal Access Token at api.planningcenteronline.com/oauth/applications, then set ${PC_APP_ID_VAR} and ${PC_SECRET_VAR} in the environment. Fold reads your directory; it never writes to Planning Center.`

/** For a disabled button, where the paragraph above would not be read. */
export const PC_NOT_CONFIGURED_SHORT = 'Planning Center is not connected.'

/* ────────────────────────── How a request is signed ────────────────────────── */

/**
 * The two ways to authenticate against Planning Center, and they are not
 * interchangeable.
 *
 * A **Personal Access Token** is an Application ID and Secret sent as HTTP Basic
 * auth. An **OAuth access token** is a single bearer token sent as
 * `Authorization: Bearer`. Sending an access token as a Basic password gets a 401
 * that looks exactly like a wrong credential — which is what happened, and why
 * this is now a discriminated type rather than two strings and a convention. The
 * scheme travels with the credential instead of being decided at the call site.
 */
export type PcAuth =
  | { kind: 'basic'; appId: string; secret: string }
  | { kind: 'bearer'; accessToken: string }

export function authorizationHeader(auth: PcAuth): string {
  if (auth.kind === 'bearer') return `Bearer ${auth.accessToken}`
  const encoded = Buffer.from(`${auth.appId}:${auth.secret}`).toString('base64')
  return `Basic ${encoded}`
}

/** What a 401 means, which depends on which kind of credential was sent. */
export function rejectedCredentialNote(auth: PcAuth): string {
  return auth.kind === 'bearer'
    ? 'Planning Center rejected the access token. Its authorisation may have been revoked over there — sign in to Planning Center again above.'
    : 'Planning Center rejected the credentials. Check the Application ID and Secret — they are a pair, and a token that was revoked fails this way too.'
}
