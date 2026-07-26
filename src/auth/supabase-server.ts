import 'server-only'

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

import {
  SUPABASE_NOT_CONFIGURED,
  supabasePublicConfig,
} from './supabase-config'

/**
 * The Supabase client for server rendering, actions, and route handlers.
 *
 * Uses the **anon key**, not the service role. That is deliberate: this client
 * acts as the signed-in person, so row-level security still applies to
 * everything it reads. A request path holding a master key has no way to be
 * wrong safely.
 *
 * The cookie adapter is the `getAll`/`setAll` pair the current `@supabase/ssr`
 * expects. `setAll` is wrapped in a try/catch because Server Components cannot
 * write cookies — when a token refresh lands during render there is nothing to be
 * done about it there, and `src/proxy.ts` is what refreshes the session on a
 * request where writing is allowed.
 */
export async function createSupabaseServerClient() {
  const config = supabasePublicConfig()
  if (!config) throw new Error(SUPABASE_NOT_CONFIGURED)

  const cookieStore = await cookies()

  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // proxy refreshes the session instead, so swallowing this is correct
          // rather than merely convenient.
        }
      },
    },
  })
}

/**
 * The signed-in Supabase user, or `null`.
 *
 * Uses `getUser()` rather than `getSession()`. `getSession()` reads the cookie
 * and trusts it; `getUser()` verifies the token with Supabase. For deciding who
 * may read a restoration case, the difference matters — a forged cookie should
 * not be able to answer this question.
 */
export async function getSupabaseUser(): Promise<{
  id: string
  email: string | null
} | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return { id: data.user.id, email: data.user.email ?? null }
}
