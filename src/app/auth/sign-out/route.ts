import {
  identityChangeResponse,
  isSameOriginSubmission,
} from '@/auth/identity-change'
import { createSupabaseServerClient } from '@/auth/supabase-server'
import { VIEWER_COOKIE } from '@/data/viewer'
import { isSupabaseConfigured } from '@/auth/supabase-config'

/**
 * Signing out.
 *
 * A Route Handler answering 303, not a Server Action — the reason is in
 * `@/auth/identity-change`, and it is the whole point of that module. A Server
 * Action writes the cookie and re-renders in place, leaving the previous reader's
 * RSC payload embedded in the live document. For a sign-out that means the next
 * person at the keyboard can read the last one's care notes out of the DOM.
 *
 * So: Supabase's `signOut` clears its own cookies, and the response here forces a
 * new document with `Clear-Site-Data` on top.
 */
const plainText = { 'content-type': 'text/plain; charset=utf-8' } as const

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginSubmission(request)) {
    return new Response('Cross-origin sign-out refused.', {
      status: 403,
      headers: plainText,
    })
  }

  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient()
    // Ends the session server-side too, so a stolen refresh token is no longer
    // usable. Clearing the cookie alone would leave it valid.
    await supabase.auth.signOut()
  }

  // Also clears the demo switch cookie, so one sign-out ends both kinds of
  // session rather than leaving a demo identity behind.
  return identityChangeResponse({
    request,
    to: '/sign-in',
    cookie: { name: VIEWER_COOKIE, clear: true },
  })
}
