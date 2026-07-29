import 'server-only'

import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { and, eq, isNull } from 'drizzle-orm'

import type { Viewer } from '@/domain/access'
import { isRole, type Role } from '@/domain/roles'
import { isSupabaseConfigured } from '@/auth/supabase-config'
import { getSupabaseUser } from '@/auth/supabase-server'
import { sampleViewers } from './sample'

/**
 * Who is asking — the entry point for every authorization decision.
 *
 * Three layers, in order, and the order is the security posture:
 *
 * 1. **A real Supabase session**, resolved to a `people` row and its roles. This
 *    is the only path that serves real data.
 * 2. **The sample-data switch**, and only under `FOLD_DEMO_MODE=1`. Never a
 *    fallback for a failed sign-in — a demo identity standing in for a real one
 *    is how someone ends up reading records as somebody else.
 * 3. **A refusal.** No default viewer, ever, because a default viewer is a silent
 *    authorization bypass.
 *
 * Wrapped in `cache` so every part of one request resolves the same viewer
 * without it being threaded through components — the Next.js data-security
 * guidance, and what keeps a viewer object from drifting into a Client Component.
 */

/** Kept for the demo switch. A real session uses Supabase's own cookies. */
export const VIEWER_COOKIE = 'fold_dev_viewer'

export class AuthNotConfiguredError extends Error {
  constructor() {
    super(
      'This deployment has no Supabase project configured, so there is no way to sign in and Fold will not serve people records. ' +
        'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, or set FOLD_DEMO_MODE=1 to run over sample data.'
    )
    this.name = 'AuthNotConfiguredError'
  }
}

/**
 * A signed-in account with no matching person.
 *
 * Deliberately its own error. It means someone authenticated successfully and
 * Fold still does not know who they are, which is an administrative gap rather
 * than a login failure — and the answer is to link them to a person, never to
 * guess.
 */
export class NoPersonForAccountError extends Error {
  constructor(email: string | null) {
    super(
      `Signed in as ${email ?? 'an unknown address'}, but no person in this church is linked to that account. An administrator needs to link it before Fold will show anything.`
    )
    this.name = 'NoPersonForAccountError'
  }
}

/**
 * Whether the sample-data viewer switch stands in for a real session.
 *
 * Always on in local development. Anywhere else it takes `FOLD_DEMO_MODE=1`, read
 * at request time so it can be turned on or off without a rebuild. Gating on an
 * explicit variable rather than on `NODE_ENV` means a deployment gets demo
 * behaviour because someone asked for it.
 */
export function demoAuthEnabled(): boolean {
  if (process.env.NODE_ENV !== 'production') return true
  return process.env.FOLD_DEMO_MODE === '1'
}

/** True when this is a deployed demo rather than a local dev server. */
export function isDeployedDemo(): boolean {
  return process.env.NODE_ENV === 'production' && demoAuthEnabled()
}

export const getViewer = cache(async (): Promise<Viewer> => {
  if (isSupabaseConfigured()) {
    const account = await getSupabaseUser()
    if (account) return resolveViewerForAccount(account)

    // Configured, but nobody is signed in. That is not an error — it is the
    // ordinary state of a visitor who has not logged in yet, so send them to do
    // that. Showing a failure page here told people authentication was missing
    // when it was working exactly as intended.
    //
    // Not falling through to the demo switch: handing a signed-out visitor
    // somebody else's identity is the one outcome worth avoiding entirely.
    if (!demoAuthEnabled()) redirect('/sign-in')
  }

  if (!demoAuthEnabled()) throw new AuthNotConfiguredError()
  return demoViewer()
})

/**
 * Turn an authenticated account into a viewer, from the database.
 *
 * Roles come from `leader_roles` and grants from the grant tables, so clearance
 * is derived from live rows exactly as `countLeadersByClearance` derives the tier
 * counts. Nothing about a person's access is read from the auth provider — a
 * Supabase user is an identity, not a permission.
 */
async function resolveViewerForAccount(account: {
  id: string
  email: string | null
}): Promise<Viewer> {
  // Imported here rather than at module scope so the demo path never opens a
  // database connection it has no use for.
  const { db, schema } = await import('@/db/client')

  const [person] = await db
    .select({
      id: schema.people.id,
      churchId: schema.people.churchId,
      firstName: schema.people.firstName,
      lastName: schema.people.lastName,
    })
    .from(schema.people)
    .where(eq(schema.people.authUserId, account.id))
    .limit(1)

  if (!person) throw new NoPersonForAccountError(account.email)

  const roleRows = await db
    .select({ role: schema.leaderRoles.role })
    .from(schema.leaderRoles)
    .where(eq(schema.leaderRoles.personId, person.id))

  // Anything the database holds that this build does not recognise is dropped
  // rather than trusted. A role name Fold cannot evaluate must not become access.
  const roles = roleRows
    .map((row) => row.role)
    .filter((role): role is Role => isRole(role))

  const [permissionGrantRows, clearanceGrantRows] = await Promise.all([
    db
      .select()
      .from(schema.permissionGrants)
      .where(
        and(
          eq(schema.permissionGrants.personId, person.id),
          isNull(schema.permissionGrants.revokedAt)
        )
      ),
    db
      .select()
      .from(schema.clearanceGrants)
      .where(
        and(
          eq(schema.clearanceGrants.personId, person.id),
          isNull(schema.clearanceGrants.revokedAt)
        )
      ),
  ])

  return {
    personId: person.id,
    churchId: person.churchId,
    displayName: `${person.firstName} ${person.lastName}`,
    roles,
    permissionGrants: permissionGrantRows.map((row) => ({
      id: row.id,
      permission: row.permission as never,
      grantedById: row.grantedById,
      // Resolved to a name where one is needed for display; the id is what the
      // record is anchored on.
      grantedByName: row.grantedById,
      grantedAt: row.grantedAt,
      reason: row.reason,
      revokedAt: row.revokedAt,
      revokedById: row.revokedById,
    })),
    clearanceGrants: clearanceGrantRows.map((row) => ({
      id: row.id,
      tier: row.tier,
      grantedById: row.grantedById,
      grantedByName: row.grantedById,
      grantedAt: row.grantedAt,
      reason: row.reason,
      revokedAt: row.revokedAt,
      revokedById: row.revokedById,
    })),
  }
}

async function demoViewer(): Promise<Viewer> {
  const store = await cookies()
  const requested =
    store.get(VIEWER_COOKIE)?.value ?? process.env.FOLD_DEV_VIEWER ?? ''

  const viewers = sampleViewers()
  const found = viewers.find((viewer) => viewer.personId === requested)

  // Falls back to the *least* privileged viewer. If the cookie is missing or
  // names someone unknown, the reader should see less than they expected.
  return found ?? leastPrivileged(viewers)
}

function leastPrivileged(viewers: readonly Viewer[]): Viewer {
  const byFewestRoles = [...viewers].sort(
    (a, b) => a.roles.length - b.roles.length
  )
  const fallback = byFewestRoles[0]
  if (!fallback) {
    throw new Error('No viewers available — sample data is empty.')
  }
  return fallback
}

/** Every viewer the demo switch offers. Empty once a real session is in use. */
export function availableDevViewers(): Viewer[] {
  if (isSupabaseConfigured()) return []
  return demoAuthEnabled() ? sampleViewers() : []
}
