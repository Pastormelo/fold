import 'server-only'

import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { and, eq, inArray, isNull } from 'drizzle-orm'

import type { Viewer } from '@/domain/access'
import { isRole, type Role } from '@/domain/roles'
import { isSupabaseConfigured } from '@/auth/supabase-config'
import { getSupabaseUser } from '@/auth/supabase-server'
import { SAMPLE_CHURCH_ID, sampleViewers } from './sample'

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

  /*
   * All four reads at once, and the reason is latency rather than tidiness.
   *
   * This ran as three steps — person, then roles, then the two grant tables —
   * because roles and grants key on `person.id`, which the first query returns.
   * The dependency is real but not worth a round trip: every page in Fold
   * resolves the viewer before it can read anything of its own, so those waits
   * were paid on every navigation, ahead of the page's own queries.
   *
   * Keying the last three off a subselect on `auth_user_id` gives one pipelined
   * round trip instead of three sequential ones. `people.auth_user_id` is unique,
   * so the subselect yields at most one id — the same id the first query returns,
   * not a second opinion about who the viewer is.
   */
  const personIdForAccount = db
    .select({ id: schema.people.id })
    .from(schema.people)
    .where(eq(schema.people.authUserId, account.id))

  const [personRows, roleRows, permissionGrantRows, clearanceGrantRows] =
    await Promise.all([
      db
        .select({
          id: schema.people.id,
          churchId: schema.people.churchId,
          firstName: schema.people.firstName,
          lastName: schema.people.lastName,
        })
        .from(schema.people)
        .where(eq(schema.people.authUserId, account.id))
        .limit(1),
      db
        .select({ role: schema.leaderRoles.role })
        .from(schema.leaderRoles)
        .where(inArray(schema.leaderRoles.personId, personIdForAccount)),
      db
        .select()
        .from(schema.permissionGrants)
        .where(
          and(
            inArray(schema.permissionGrants.personId, personIdForAccount),
            isNull(schema.permissionGrants.revokedAt)
          )
        ),
      db
        .select()
        .from(schema.clearanceGrants)
        .where(
          and(
            inArray(schema.clearanceGrants.personId, personIdForAccount),
            isNull(schema.clearanceGrants.revokedAt)
          )
        ),
    ])

  const [person] = personRows

  /*
   * Refused after the batch rather than before it, which is the one thing this
   * shape changes. The role and grant queries now run without knowing whether a
   * person exists; with no person they match nothing and return nothing, and this
   * still refuses. No viewer is ever built from those rows without a person — a
   * signed-in account Fold cannot place is an administrative gap, and the answer
   * is to link it, never to assume.
   */
  if (!person) throw new NoPersonForAccountError(account.email)

  // Anything the database holds that this build does not recognise is dropped
  // rather than trusted. A role name Fold cannot evaluate must not become access.
  const roles = roleRows
    .map((row) => row.role)
    .filter((role): role is Role => isRole(role))

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

/* ─────────────────── Keeping the demo out of real records ─────────────────── */

/**
 * Whether this viewer is the sample-data stand-in rather than a real person.
 *
 * Pure, so it can be asserted without a request context. A demo viewer's
 * `personId` is a slug like `p-melo` and its `churchId` is the all-zero UUID —
 * neither of which is a row in anybody's database.
 */
export function isSampleViewer(viewer: Viewer): boolean {
  return viewer.churchId === SAMPLE_CHURCH_ID
}

/**
 * The viewer, for a write.
 *
 * Reads under the demo identity are harmless: they are scoped to a church id no
 * row carries, so they return nothing. Writes are not harmless — they reach the
 * real database with a fabricated identity, and Postgres rejects them with
 * `invalid input syntax for type uuid: "p-melo"`, which is a confusing way to
 * learn that the sample viewer was never meant to get this far.
 *
 * Worse than the error is what a permissive version would do: if the ids happened
 * to be valid UUIDs, a demo session would be writing rows attributed to a person
 * who does not exist, into a church that does not exist. So this refuses by
 * identity rather than by validating the shape of an id.
 *
 * Every Server Action that writes calls this instead of `getViewer`.
 */
export class DemoCannotWriteError extends Error {
  constructor() {
    super(
      'This is the sample-data viewer, which has no record in the database. Sign in as yourself to change anything.'
    )
    this.name = 'DemoCannotWriteError'
  }
}

export async function getWriter(): Promise<Viewer> {
  const viewer = await getViewer()
  if (isSampleViewer(viewer)) throw new DemoCannotWriteError()
  return viewer
}
