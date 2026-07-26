import 'server-only'

import { createClient } from '@supabase/supabase-js'

import {
  SUPABASE_SECRET_KEY_VARS,
  SUPABASE_URL_VAR,
  supabasePublicConfig,
  supabaseSecretKey,
} from './supabase-config'

/**
 * The service-role client. Read this before using it.
 *
 * The service-role key **bypasses row-level security entirely**. A query made
 * with it can read every restoration case, every benevolence amount, and every
 * confidential note in the database, regardless of who is signed in. In an
 * application whose whole subject is who may read what, it is the one credential
 * that can make §3 decorative.
 *
 * So it is constrained three ways:
 *
 * 1. `server-only`, so importing it from a Client Component is a build error.
 * 2. Read from `SUPABASE_SECRET_KEY` (or the legacy `SUPABASE_SERVICE_ROLE_KEY`),
 *    with no `NEXT_PUBLIC_` prefix, so Next cannot inline it into a browser
 *    bundle.
 * 3. Never used to serve a request. Request paths use
 *    `createSupabaseServerClient`, which acts as the signed-in person.
 *
 * What it is legitimately for: administrative work with no viewer — inviting a
 * leader, running a migration, a scheduled Planning Center sync. Each of those
 * should still enforce Fold's own rules in the domain layer; the key removes the
 * database's safety net, not the product's.
 */
export function createSupabaseAdminClient() {
  const config = supabasePublicConfig()
  const secretKey = supabaseSecretKey()

  if (!config) {
    throw new Error(
      `Supabase is not configured. Set ${SUPABASE_URL_VAR} before using the admin client.`
    )
  }
  if (!secretKey) {
    throw new Error(
      `Set one of ${SUPABASE_SECRET_KEY_VARS.join(' or ')}. It is required only for administrative work with no signed-in person, and must never be given a NEXT_PUBLIC_ prefix.`
    )
  }

  return createClient(config.url, secretKey, {
    auth: {
      // No session to persist or refresh: this client is nobody, deliberately.
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
