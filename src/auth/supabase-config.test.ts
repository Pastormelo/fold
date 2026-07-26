import { describe, expect, it } from 'vitest'

import {
  PUBLIC_ENV_PREFIX,
  SUPABASE_ANON_KEY_VAR,
  SUPABASE_SECRET_KEY_VARS,
  SUPABASE_SERVICE_ROLE_KEY_VAR,
  SUPABASE_URL_VAR,
  isPubliclyExposed,
} from './supabase-config'

describe('the service-role key is never publicly exposed', () => {
  // The service-role key bypasses row-level security entirely: with it, one query
  // reads every restoration case in the database. Next inlines anything prefixed
  // NEXT_PUBLIC_ into the browser bundle, so the naming rule is the safeguard,
  // and this test is what stops a rename quietly undoing it.
  it('has no NEXT_PUBLIC prefix, under any accepted name', () => {
    // Supabase issues sb_secret_ keys alongside the legacy service_role JWT, so
    // both names are accepted — and neither may ever be publicly exposed.
    for (const name of SUPABASE_SECRET_KEY_VARS) {
      expect(isPubliclyExposed(name), name).toBe(false)
      expect(name.startsWith(PUBLIC_ENV_PREFIX), name).toBe(false)
    }
  })

  it('is a different variable from the anon key', () => {
    expect(SUPABASE_SERVICE_ROLE_KEY_VAR).not.toBe(SUPABASE_ANON_KEY_VAR)
  })

  it('does not mention "public" or "anon" in any accepted name', () => {
    // Guards against a future rename that looks harmless and is not.
    for (const name of SUPABASE_SECRET_KEY_VARS) {
      expect(name.toLowerCase(), name).not.toContain('public')
      expect(name.toLowerCase(), name).not.toContain('anon')
    }
  })
})

describe('the public pair is meant to be public', () => {
  it('carries the prefix that makes it available in the browser', () => {
    // These two are public by design: on their own they grant nothing, because
    // row-level security and the session decide what a request may read.
    expect(isPubliclyExposed(SUPABASE_URL_VAR)).toBe(true)
    expect(isPubliclyExposed(SUPABASE_ANON_KEY_VAR)).toBe(true)
  })
})
