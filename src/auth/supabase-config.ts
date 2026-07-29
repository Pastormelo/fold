/**
 * Where the Supabase settings come from, and what is safe to read where.
 *
 * Two keys, and the distinction between them is the whole security story:
 *
 * - The **anon key** is public by design. It is what a browser uses, and Supabase
 *   expects it to be visible. On its own it grants nothing: row-level security
 *   plus the signed-in session decide what a request may read.
 * - The **service-role key** bypasses row-level security completely. It is a
 *   master key to every row in the database, including every restoration case.
 *
 * So the service-role key is never named with a `NEXT_PUBLIC_` prefix — Next
 * inlines anything so prefixed into the browser bundle, and a leaked service-role
 * key would make §3 decorative. `src/auth/supabase-admin.ts` is the only module
 * that reads it, and it is `server-only`.
 *
 * This module is deliberately importable from the client, so it holds no secret.
 */

/** The prefix Next inlines into client bundles. Nothing secret may use it. */
export const PUBLIC_ENV_PREFIX = 'NEXT_PUBLIC_'

export const SUPABASE_URL_VAR = 'NEXT_PUBLIC_SUPABASE_URL'
export const SUPABASE_ANON_KEY_VAR = 'NEXT_PUBLIC_SUPABASE_ANON_KEY'

/**
 * Server only. Note the absence of the public prefix — that is the point.
 *
 * Supabase now issues `sb_secret_…` keys alongside the legacy JWT `service_role`
 * key, so both variable names are accepted and the newer one is preferred. A new
 * secret key is the better choice: Supabase makes it answer 401 if it is ever
 * used from a browser, which is a second safety net under the naming rule here.
 */
export const SUPABASE_SECRET_KEY_VARS = [
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const

/** Kept for the error messages and the test that guards the naming rule. */
export const SUPABASE_SERVICE_ROLE_KEY_VAR = 'SUPABASE_SECRET_KEY'

/** The secret key from whichever variable holds it, or `undefined`. */
export function supabaseSecretKey(): string | undefined {
  for (const name of SUPABASE_SECRET_KEY_VARS) {
    const value = process.env[name]
    if (value) return value
  }
  return undefined
}

/**
 * Guards the naming rule as a value rather than a comment, so the test suite can
 * assert it and a future rename cannot quietly break it.
 */
export function isPubliclyExposed(envVarName: string): boolean {
  return envVarName.startsWith(PUBLIC_ENV_PREFIX)
}

export type SupabasePublicConfig = {
  url: string
  anonKey: string
}

/**
 * The public pair, or `null` when Supabase is not configured.
 *
 * `null` rather than a throw, because "no Supabase project yet" is a real state
 * this app supports: it falls back to the sample-data demo, and the viewer guard
 * refuses rather than inventing a session.
 */
export function supabasePublicConfig(): SupabasePublicConfig | null {
  const url = process.env[SUPABASE_URL_VAR]
  const anonKey = process.env[SUPABASE_ANON_KEY_VAR]
  if (!url || !anonKey) return null
  return { url, anonKey }
}

/**
 * Whether to offer Google sign-in.
 *
 * Off unless explicitly enabled, because the provider needs an OAuth client from
 * Google Cloud that Supabase cannot supply on its own. Offering the button
 * without it means a control that always fails, which is the §8.4 rule about not
 * presenting an action that will be refused.
 */
export function isGoogleSignInEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FOLD_GOOGLE_SIGN_IN === '1'
}

export function isSupabaseConfigured(): boolean {
  return supabasePublicConfig() !== null
}

export const SUPABASE_NOT_CONFIGURED = `Supabase is not configured. Set ${SUPABASE_URL_VAR} and ${SUPABASE_ANON_KEY_VAR} from your project's API settings.`
