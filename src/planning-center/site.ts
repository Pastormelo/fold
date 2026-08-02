import 'server-only'

import type { NextRequest } from 'next/server'

/**
 * The origin Planning Center should send the browser back to.
 *
 * This has to be byte-identical between the authorize request and the token
 * exchange — OAuth compares `redirect_uri` on both, and a mismatch is rejected
 * with an error that does not say which of the two was wrong. So it is computed in
 * one place and used by both.
 *
 * `FOLD_SITE_URL` first, matching how Supabase's redirects are already resolved in
 * `@/auth/actions`: a preview deployment has a different hostname on every push,
 * and a registered OAuth redirect URI cannot follow it. Set the variable to the
 * production URL and both halves agree.
 *
 * The request's own origin is the fallback rather than the default, because it is
 * attacker-influenced in principle (a `Host` header) — fine for local development,
 * not something to prefer over a value the deployment stated.
 */
export function siteUrl(request?: NextRequest): string {
  const explicit = process.env.FOLD_SITE_URL
  if (explicit) return explicit.replace(/\/$/, '')

  const vercel =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL
  if (vercel) return `https://${vercel}`

  if (request) return new URL(request.url).origin
  return 'http://localhost:3000'
}
