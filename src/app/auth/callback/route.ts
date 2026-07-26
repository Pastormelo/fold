import { NextResponse, type NextRequest } from 'next/server'

import { createSupabaseServerClient } from '@/auth/supabase-server'

/**
 * Where Google, magic links, and password resets come back to.
 *
 * Exchanges the one-time code for a session. A GET route rather than an action,
 * because the browser arrives here by top-level navigation from an email or from
 * Google.
 *
 * The `next` parameter is checked against a fixed list rather than merely being
 * required to start with `/`. A path is easy to smuggle past a prefix check
 * (`//evil.example`, backslashes, encoded forms), and this is the redirect an
 * attacker would most like to influence — it is where a person lands *after*
 * successfully signing in.
 */
const ALLOWED_DESTINATIONS = new Set(['/', '/auth/new-password'])

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const requestedNext = url.searchParams.get('next')
  const next =
    requestedNext !== null && ALLOWED_DESTINATIONS.has(requestedNext)
      ? requestedNext
      : '/'

  // Supabase reports a refused or expired link this way.
  const errorDescription = url.searchParams.get('error_description')
  if (errorDescription) {
    return NextResponse.redirect(
      new URL(
        `/sign-in?error=${encodeURIComponent(errorDescription)}`,
        url.origin
      )
    )
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/sign-in?error=That+link+is+missing+its+code.', url.origin)
    )
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(
      new URL(
        '/sign-in?error=That+link+has+expired+or+was+already+used.+Ask+for+a+new+one.',
        url.origin
      )
    )
  }

  // Built from this request's own origin, never from anything the link carried.
  return NextResponse.redirect(new URL(next, url.origin))
}
