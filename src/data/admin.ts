import 'server-only'

import { cache } from 'react'

import { and, asc, eq, isNull } from 'drizzle-orm'

import {
  FOLD_LISTS,
  FOLD_LIST_DEFINITIONS,
  FOLD_LIST_LABELS,
  type FoldList,
} from '@/domain/planning-center'
import { canOwnFold } from '@/domain/directory'
import {
  type Permission,
  type PermissionCheck,
  type Role,
  PERMISSIONS,
  ROLES,
  ROLE_LABELS,
  can,
  clearanceFor,
  permissionCheck,
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
  holderCount: number
  /**
   * The permissions in church language, for the summary table.
   *
   * Nothing exposes the raw `Permission[]` any more, deliberately. It was on this
   * row only so Setup could print the identifiers, which is the output of a
   * permission check rather than anything a church administrator needs to read.
   * Leaving the array here would be leaving the temptation.
   *
   * Derived from the permission set rather than written out per role, so a role
   * gaining a permission changes what the table says about it. A hand-written
   * column is the thing this whole section exists not to be — §8.2, a claim has to
   * match what it was computed from.
   */
  sees: string
  canChange: string
}

export const getRoleMatrix = cache(async (): Promise<RoleRow[]> => {
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
      holderCount,
      sees: describeSees(permissions, tier),
      canChange: describeCanChange(permissions),
    }
  })
})

/* ───────────────────────────── People and roles ───────────────────────────── */

/**
 * What a role can look at, in a phrase.
 *
 * Ordered most-to-least significant and capped, because the point of the summary
 * table is to be readable at a glance; anyone who needs the exact set opens the
 * full list beneath it.
 */
function describeSees(
  permissions: readonly Permission[],
  tier: ConfidentialityTier | null
): string {
  const parts: string[] = []
  if (permissions.includes('care.view_people')) {
    parts.push(
      tier === 'elders_only'
        ? 'Everyone, every note'
        : 'People assigned to them'
    )
  }
  if (permissions.includes('reporting.view')) parts.push('Reports')
  if (permissions.includes('pathway.view')) parts.push('The pathway')
  if (parts.length === 0) return 'Nothing pastoral'
  return parts.join(' · ')
}

/** What a role can alter. Same derivation, same reason. */
function describeCanChange(permissions: readonly Permission[]): string {
  const parts: string[] = []
  if (permissions.includes('admin.manage_roles')) parts.push('Roles and access')
  if (permissions.includes('pathway.publish')) parts.push('Publish the pathway')
  else if (permissions.includes('pathway.edit')) parts.push('Edit the pathway')
  if (permissions.includes('admin.manage_integrations'))
    parts.push('Integrations')
  if (permissions.includes('care.log_note')) parts.push('Log care')
  if (parts.length === 0) return 'Nothing'
  return parts.join(' · ')
}

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
export const getLeaders = cache(async (): Promise<LeaderRow[]> => {
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
})

/** Whether the viewer reaches care at all, for the screen's own framing. */
export const getViewerClearance = cache(
  async (): Promise<ConfidentialityTier | null> => {
    return clearanceFor(await getViewer())
  }
)

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
export const getFoldLists = cache(async (): Promise<FoldListRow[]> => {
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
})

/* ──────────────────────── Folds, and who may own one ──────────────────────── */

export type FoldSummary = {
  id: string
  name: string
  elderId: string
  elderName: string
  memberCount: number
  memberCountLabel: string
}

export type DirectoryOptions = {
  folds: readonly FoldSummary[]
  /**
   * People who may be named as a fold's elder — filtered by `canOwnFold`, so the
   * select offers only what `createFold` would accept. Offering everybody and
   * refusing on submit is the §8.4 failure.
   */
  possibleElders: readonly { id: string; fullName: string; roleLabel: string }[]
  /** Whether this viewer may create folds and name their elders. */
  manageFolds: PermissionCheck
  /** Whether this viewer may add people and move them between folds. */
  managePeople: PermissionCheck
  /** Said out loud when there is nobody who could own a fold yet. */
  elderNote: string
}

export const getDirectoryOptions = cache(
  async (): Promise<DirectoryOptions> => {
    const viewer = await getViewer()

    const [foldRows, peopleRows, roleRows] = await Promise.all([
      db
        .select({
          id: schema.folds.id,
          name: schema.folds.name,
          elderId: schema.folds.elderId,
        })
        .from(schema.folds)
        .where(eq(schema.folds.churchId, viewer.churchId))
        .orderBy(asc(schema.folds.name)),
      db
        .select({
          id: schema.people.id,
          firstName: schema.people.firstName,
          lastName: schema.people.lastName,
          foldId: schema.people.foldId,
          isMember: schema.people.isMember,
        })
        .from(schema.people)
        .where(eq(schema.people.churchId, viewer.churchId))
        .orderBy(asc(schema.people.lastName), asc(schema.people.firstName)),
      db
        .select({
          personId: schema.leaderRoles.personId,
          role: schema.leaderRoles.role,
        })
        .from(schema.leaderRoles)
        .where(eq(schema.leaderRoles.churchId, viewer.churchId)),
    ])

    const nameOf = new Map(
      peopleRows.map((person) => [
        person.id,
        `${person.firstName} ${person.lastName}`,
      ])
    )

    const rolesByPerson = new Map<string, Role[]>()
    for (const row of roleRows) {
      const list = rolesByPerson.get(row.personId) ?? []
      list.push(row.role as Role)
      rolesByPerson.set(row.personId, list)
    }

    const possibleElders = peopleRows
      .filter((person) =>
        canOwnFold({
          personId: person.id,
          roles: rolesByPerson.get(person.id) ?? [],
        })
      )
      .map((person) => {
        const roles = rolesByPerson.get(person.id) ?? []
        return {
          id: person.id,
          fullName: `${person.firstName} ${person.lastName}`,
          roleLabel: roles.map((role) => ROLE_LABELS[role]).join(' · '),
        }
      })

    return {
      folds: foldRows.map((fold): FoldSummary => {
        const count = peopleRows.filter(
          (person) => person.foldId === fold.id && person.isMember
        ).length
        return {
          id: fold.id,
          name: fold.name,
          elderId: fold.elderId,
          elderName: nameOf.get(fold.elderId) ?? 'Somebody no longer listed',
          memberCount: count,
          memberCountLabel: `${count} ${count === 1 ? 'person' : 'people'}`,
        }
      }),
      possibleElders,
      manageFolds: permissionCheck(viewer, 'admin.manage_roles'),
      managePeople: permissionCheck(viewer, 'care.view_people'),
      // The likely first-run state, and worth naming rather than showing an
      // empty select somebody has to guess about.
      elderNote:
        possibleElders.length === 0
          ? 'Nobody in this church holds a role that can own a fold. Give somebody Pastor or elder, Lead pastor, or Pastoral staff in Setup first — a fold whose shepherd cannot read the notes about its people would look covered while being nothing of the kind.'
          : '',
    }
  }
)
