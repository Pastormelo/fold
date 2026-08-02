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
