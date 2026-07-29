import 'server-only'

import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm'

import {
  FOLD_LISTS,
  FOLD_LIST_DEFINITIONS,
  FOLD_LIST_LABELS,
  type FoldList,
} from '@/domain/planning-center'
import {
  type Permission,
  type Role,
  PERMISSIONS,
  ROLES,
  ROLE_LABELS,
  can,
  clearanceFor,
  principalOf,
  resolveClearance,
  roleClearance,
} from '@/domain/roles'
import { type ConfidentialityTier, tierName } from '@/domain/tiers'
import { db, schema } from '@/db/client'

import { getViewer } from './viewer'

/**
 * Setup — what an administrator can see and change.
 *
 * Two things this file is careful about.
 *
 * The role/permission matrix is not a table of its own. It is computed by asking
 * `can()` about a principal holding only that role — the same function every gate
 * in the app calls. A hand-written matrix in the interface is how a screen ends
 * up telling an administrator that a role carries something it does not (§8.3).
 *
 * The people list carries each person's *effective* clearance and where it came
 * from, because "why can this person read that?" is the question an
 * administrator actually has, and answering it from the role alone would be
 * wrong the moment somebody holds a grant.
 */

/* ─────────────────────── The role/permission matrix ─────────────────────── */

export type RoleRow = {
  role: Role
  label: string
  /** The clearance the role carries on its own, before any individual grant. */
  clearanceLabel: string
  reachesCare: boolean
  permissions: readonly Permission[]
  permissionCountLabel: string
  holderCount: number
  holderCountLabel: string
  /** Set for roles that carry everything by construction rather than by list. */
  unrestrictedNote: string | null
}

export async function getRoleMatrix(): Promise<RoleRow[]> {
  const viewer = await getViewer()

  const holders = await db
    .select({ role: schema.leaderRoles.role })
    .from(schema.leaderRoles)
    .where(eq(schema.leaderRoles.churchId, viewer.churchId))

  const countByRole = new Map<string, number>()
  for (const row of holders) {
    countByRole.set(row.role, (countByRole.get(row.role) ?? 0) + 1)
  }

  return ROLES.map((role): RoleRow => {
    // Asked of the same function the gates use, with a principal holding this
    // role and nothing else. `principalOf` takes no grants, which is what makes
    // this the role's own reach rather than some particular person's.
    const principal = principalOf('matrix', [role])
    const permissions = PERMISSIONS.filter((permission) =>
      can(principal, permission)
    )
    const tier = roleClearance([role])
    const holderCount = countByRole.get(role) ?? 0

    return {
      role,
      label: ROLE_LABELS[role],
      clearanceLabel: tier ? tierName(tier) : 'No pastoral care access',
      reachesCare: tier !== null,
      permissions,
      permissionCountLabel:
        permissions.length === PERMISSIONS.length
          ? 'Everything'
          : `${permissions.length} of ${PERMISSIONS.length}`,
      holderCount,
      holderCountLabel:
        holderCount === 0
          ? 'Nobody holds this'
          : `${holderCount} ${holderCount === 1 ? 'person' : 'people'}`,
      // Said out loud, because the reason matters: this role carries every
      // permission by short-circuit, so a permission added next month is
      // included without anyone editing a list.
      unrestrictedNote:
        permissions.length === PERMISSIONS.length
          ? 'Carries every permission by construction, including any added later.'
          : null,
    }
  })
}

/* ───────────────────────────── People and roles ───────────────────────────── */

export type LeaderRow = {
  personId: string
  fullName: string
  roles: readonly Role[]
  roleLabels: readonly string[]
  /** What they can actually read, grant included. */
  clearanceLabel: string
  /** `grant` when a grant raised them above their roles. */
  clearanceSource: 'role' | 'grant' | null
  grantReason: string | null
  isViewer: boolean
}

/**
 * Everyone in this church who holds at least one role.
 *
 * Sorted by name rather than by clearance: a list ordered by access reads like a
 * ranking of people, and this is a directory of who does what.
 */
export async function getLeaders(): Promise<LeaderRow[]> {
  const viewer = await getViewer()

  const [people, roleRows, clearanceGrants] = await Promise.all([
    db
      .select({
        id: schema.people.id,
        firstName: schema.people.firstName,
        lastName: schema.people.lastName,
      })
      .from(schema.people)
      .where(eq(schema.people.churchId, viewer.churchId))
      .orderBy(asc(schema.people.lastName), asc(schema.people.firstName)),
    db
      .select()
      .from(schema.leaderRoles)
      .where(eq(schema.leaderRoles.churchId, viewer.churchId)),
    db
      .select()
      .from(schema.clearanceGrants)
      .where(
        and(
          eq(schema.clearanceGrants.churchId, viewer.churchId),
          isNull(schema.clearanceGrants.revokedAt)
        )
      ),
  ])

  const rolesByPerson = new Map<string, Role[]>()
  for (const row of roleRows) {
    const list = rolesByPerson.get(row.personId) ?? []
    list.push(row.role as Role)
    rolesByPerson.set(row.personId, list)
  }

  return people
    .filter((person) => rolesByPerson.has(person.id))
    .map((person): LeaderRow => {
      const roles = rolesByPerson.get(person.id) ?? []
      const grants = clearanceGrants
        .filter((grant) => grant.personId === person.id)
        .map((grant) => ({
          id: grant.id,
          tier: grant.tier as ConfidentialityTier,
          grantedById: grant.grantedById,
          grantedByName: grant.grantedById,
          grantedAt: grant.grantedAt,
          reason: grant.reason,
          revokedAt: grant.revokedAt,
          revokedById: grant.revokedById,
        }))

      const resolution = resolveClearance({
        personId: person.id,
        roles,
        clearanceGrants: grants,
      })

      return {
        personId: person.id,
        fullName: `${person.firstName} ${person.lastName}`,
        roles,
        roleLabels: roles.map((role) => ROLE_LABELS[role]),
        clearanceLabel: resolution.tier
          ? tierName(resolution.tier)
          : 'No pastoral care access',
        clearanceSource: resolution.source,
        // Only when a grant is what raised them. A role-derived clearance has no
        // reason to show, and inventing one would be noise.
        grantReason: resolution.grant?.reason ?? null,
        isViewer: person.id === viewer.personId,
      }
    })
}

/** Whether the viewer reaches care at all, for the screen's own framing. */
export async function getViewerClearance(): Promise<ConfidentialityTier | null> {
  return clearanceFor(await getViewer())
}

/* ─────────────────────── Whether anything is connected ─────────────────────── */

export type IntegrationState = {
  connected: boolean
  /** Said plainly, so the scope list below it cannot be read as a status. */
  note: string
}

/**
 * Whether Planning Center has actually been connected.
 *
 * Derived from whether any person carries a Planning Center id — evidence that an
 * import happened, rather than a flag somebody set. There is no OAuth flow yet, so
 * for now this is always false, and saying so matters: the category list beneath
 * it shows §6's defaults, and without this line a reader would take
 * "People and households · both ways" as a description of what is happening
 * tonight rather than of what would happen if it were switched on.
 */
export async function getIntegrationState(): Promise<IntegrationState> {
  const viewer = await getViewer()

  const [imported] = await db
    .select({ id: schema.people.id })
    .from(schema.people)
    .where(
      and(
        eq(schema.people.churchId, viewer.churchId),
        isNotNull(schema.people.planningCenterId)
      )
    )
    .limit(1)

  return imported
    ? {
        connected: true,
        note: 'Connected. Records that came from Planning Center keep their id, so a resync never creates a second person.',
      }
    : {
        connected: false,
        note: 'Planning Center is not connected, so nothing is syncing. What follows is the scope that would apply once it is — not a description of what is happening now.',
      }
}

/* ───────────────────────────── Fold lists ───────────────────────────── */

export type FoldListRow = {
  list: FoldList
  label: string
  definition: string
  count: number
  countLabel: string
}

/**
 * Family and Guests, counted.
 *
 * §6 keeps these apart deliberately: a guest is not in Family until membership.
 * The counts come off `is_member` rather than a list column, because membership
 * is the fact and the list is the consequence.
 */
export async function getFoldLists(): Promise<FoldListRow[]> {
  const viewer = await getViewer()

  const rows = await db
    .select({ isMember: schema.people.isMember })
    .from(schema.people)
    .where(eq(schema.people.churchId, viewer.churchId))

  const members = rows.filter((row) => row.isMember).length

  return FOLD_LISTS.map((list) => {
    const count = list === 'family' ? members : rows.length - members
    return {
      list,
      label: FOLD_LIST_LABELS[list],
      definition: FOLD_LIST_DEFINITIONS[list],
      count,
      countLabel: `${count} ${count === 1 ? 'person' : 'people'}`,
    }
  })
}
