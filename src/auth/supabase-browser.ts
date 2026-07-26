'use client'

import { createBrowserClient } from '@supabase/ssr'

import {
  SUPABASE_NOT_CONFIGURED,
  supabasePublicConfig,
} from './supabase-config'

/**
 * The browser client. Anon key only — there is no other key it could use, since
 * the service-role key has no `NEXT_PUBLIC_` prefix and so does not exist in this
 * bundle.
 *
 * Only needed for flows that must run in the browser: `signInWithOAuth`, which
 * redirects the window, and any client-side reaction to an auth state change.
 * Everything else goes through a Server Action.
 */
let client: ReturnType<typeof createBrowserClient> | null = null

export function getSupabaseBrowserClient() {
  const config = supabasePublicConfig()
  if (!config) throw new Error(SUPABASE_NOT_CONFIGURED)
  // One instance per tab, so auth state listeners are not duplicated.
  client ??= createBrowserClient(config.url, config.anonKey)
  return client
}
