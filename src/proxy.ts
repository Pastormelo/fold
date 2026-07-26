import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

import { supabasePublicConfig } from '@/auth/supabase-config'

/**
 * Session refresh — Next 16's Proxy.
 *
 * **This file is `proxy.ts`, not `middleware.ts`.** Next 16 renamed Middleware to
 * Proxy, and a `middleware.ts` would be silently ignored: no error, no warning,
 * just sessions that quietly stop refreshing until people are logged out
 * mid-visit. Every Supabase guide still says `middleware.ts`, so this is worth
 * knowing before following one.
 *
 * What it does and does not do:
 *
 * - **Does** call `getUser()` so an expiring access token is refreshed and the new
 *   cookie is written on a response that can actually carry it. Server Components
 *   cannot set cookies, so without this the refresh has nowhere to land.
 * - **Does not** authorize anything. The Next.js auth guide is explicit that Proxy
 *   runs on every route including prefetches, so it does optimistic checks at
 *   most, and "the majority of security checks should be performed as close as
 *   possible to your data source". Fold's authorization lives in the Data Access
 *   Layer, and it stays there.
 *
 * With no Supabase project configured it passes the request straight through, so
 * the sample-data demo keeps working.
 */
export async function proxy(request: NextRequest) {
  const config = supabasePublicConfig()
  if (!config) return NextResponse.next({ request })

  let response = NextResponse.next({ request })

  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        // Written to both: the request so the rest of this pass sees the fresh
        // token, and the response so the browser keeps it.
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  // The call itself is the point — it refreshes the token as a side effect. The
  // user object is deliberately unused here; deciding anything from it would be
  // the authorization-in-the-proxy mistake the guide warns about.
  await supabase.auth.getUser()

  return response
}

export const config = {
  /**
   * Everything except static assets. The auth guide recommends running on all
   * routes; excluding `_next` and image files just avoids refreshing a session
   * for a request that has no session to refresh.
   */
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
