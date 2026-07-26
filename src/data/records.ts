import 'server-only'

import {
  type CareTimeline,
  type RestorationCaseView,
  buildCareTimeline,
  viewRestorationCase,
  writableTiers,
} from '@/domain/access'
import {
  type ConfidentialityTier,
  TIER_DESCRIPTIONS,
  TIER_ORDER,
  tierName,
} from '@/domain/tiers'
import {
  type Permission,
  type PermissionCheck,
  ROLE_LABELS,
  clearanceFor,
  countLeadersByClearance,
  grantedExceptions,
  permissionCheck,
} from '@/domain/roles'

import { getViewer } from './viewer'
import {
  SAMPLE_CARE_NOTES,
  SAMPLE_PEOPLE,
  SAMPLE_RESTORATION_CASES,
  SAMPLE_RESTORATION_NOTES,
  samplePerson,
  samplePrincipals,
} from './sample'

/**
 * The Data Access Layer.
 *
 * Every function here resolves the viewer itself rather than accepting one, so
 * a caller cannot ask "show me this as somebody else". Each returns a DTO that
 * has already been through `@/domain/access`, which means content the viewer
 * may not read is absent from the returned object — not nulled out, and never
 * present-but-hidden-in-the-UI.
 *
 * The reads are against sample data for now. Replacing them with Drizzle
 * queries changes only the fetch: the redaction lives in the domain functions,
 * and those are already tested.
 */

export type ViewerSummary = {
  personId: string
  displayName: string
  roleLabels: string[]
  clearanceTier: ConfidentialityTier | null
  clearanceLabel: string
}

export async function getViewerSummary(): Promise<ViewerSummary> {
  const viewer = await getViewer()
  const clearance = clearanceFor(viewer)

  return {
    personId: viewer.personId,
    displayName: viewer.displayName,
    roleLabels: viewer.roles.map((role) => ROLE_LABELS[role]),
    clearanceTier: clearance,
    clearanceLabel: clearance ? tierName(clearance) : 'No pastoral care access',
  }
}

export type PersonRecord = {
  id: string
  fullName: string
  initials: string
  since: string
  /**
   * A member with no fold is an open pastoral matter, not a data gap (§2), so
   * this carries the sentence rather than an empty string.
   */
  foldLabel: string
  foldIsUnassigned: boolean
  isMember: boolean
  household: readonly string[]
  serving: string
  groups: string
  care: CareTimeline
  /** Tiers this viewer may file a note at. Empty means the form is not offered. */
  writableTiers: { tier: ConfidentialityTier; label: string }[]
  logNoteCheck: PermissionCheck
}

export async function getPersonRecord(
  personId: string
): Promise<PersonRecord | null> {
  const viewer = await getViewer()
  const person = samplePerson(personId)
  if (!person) return null

  const notes = [...SAMPLE_CARE_NOTES, ...SAMPLE_RESTORATION_NOTES]
    .filter((note) => note.personId === personId)
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())

  const unassigned = person.foldName === null

  return {
    id: person.id,
    fullName: `${person.firstName} ${person.lastName}`,
    initials: `${person.firstName[0] ?? ''}${person.lastName[0] ?? ''}`,
    since: person.since,
    foldLabel:
      person.foldName ??
      'No fold. This is an open pastoral matter, not a data gap.',
    foldIsUnassigned: unassigned,
    isMember: person.isMember,
    household: person.household,
    serving: person.serving.join(' · ') || 'Not serving right now',
    groups: person.groups.join(' · ') || 'No group',
    care: buildCareTimeline(viewer, notes),
    writableTiers: writableTiers(viewer).map((tier) => ({
      tier,
      label: tierName(tier),
    })),
    logNoteCheck: permissionCheck(viewer, 'care.log_note'),
  }
}

export async function getRestorationCases(): Promise<RestorationCaseView[]> {
  const viewer = await getViewer()
  return SAMPLE_RESTORATION_CASES.map((record) =>
    viewRestorationCase(viewer, record)
  )
}

export type TierOverviewRow = {
  tier: ConfidentialityTier
  name: string
  who: string
  sees: string
  cannot: string
  /** Computed from the leader records — §8.1, never a literal. */
  leaderCount: number
  leaderCountLabel: string
  viewerIsAtThisTier: boolean
}

export async function getTierOverview(): Promise<TierOverviewRow[]> {
  const viewer = await getViewer()
  const viewerClearance = clearanceFor(viewer)
  const counts = countLeadersByClearance(samplePrincipals())

  return TIER_ORDER.map((tier) => {
    const count = counts[tier]
    return {
      tier,
      ...TIER_DESCRIPTIONS[tier],
      leaderCount: count,
      // Pluralised from the count, not written twice.
      leaderCountLabel: `${count} ${count === 1 ? 'person' : 'people'}`,
      viewerIsAtThisTier: viewerClearance === tier,
    }
  })
}

export async function getPermission(
  permission: Permission
): Promise<PermissionCheck> {
  const viewer = await getViewer()
  return permissionCheck(viewer, permission)
}

export type GrantedExceptionRow = {
  personName: string
  /** What they were given, in plain words. */
  what: string
  grantedByName: string
  grantedAt: string
  reason: string
  selfGranted: boolean
}

/**
 * Everyone whose access exceeds what their role carries.
 *
 * An administrator can grant anything, so the safeguard is not a narrower gate —
 * it is that every exception is answerable in one place. This is the elder
 * board's review list, and it is deliberately readable by anyone who can see
 * reporting: a grant nobody looks at is the same as having no grant policy.
 *
 * Self-grants are marked. An administrator raising their own clearance is
 * legitimate — verifying an import, covering a vacancy — and also the obvious
 * abuse path, so it is called out rather than blended in.
 */
export async function getGrantedExceptions(): Promise<GrantedExceptionRow[]> {
  await getViewer()

  const byId = new Map(SAMPLE_PEOPLE.map((person) => [person.id, person]))
  const nameOf = (id: string) => {
    const person = byId.get(id)
    return person ? `${person.firstName} ${person.lastName}` : id
  }
  const when = (date: Date) =>
    date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    })

  return grantedExceptions(samplePrincipals()).flatMap((exception) => {
    const rows: GrantedExceptionRow[] = []
    const personName = nameOf(exception.personId)

    if (exception.clearance) {
      rows.push({
        personName,
        what: `${tierName(exception.clearance.tier)} clearance`,
        grantedByName: exception.clearance.grantedByName,
        grantedAt: when(exception.clearance.grantedAt),
        reason: exception.clearance.reason,
        selfGranted: exception.clearance.grantedById === exception.personId,
      })
    }

    for (const grant of exception.permissions) {
      rows.push({
        personName,
        what: grant.permission,
        grantedByName: grant.grantedByName,
        grantedAt: when(grant.grantedAt),
        reason: grant.reason,
        selfGranted: grant.grantedById === exception.personId,
      })
    }

    return rows
  })
}

/** Members with no fold. An open pastoral matter the product surfaces (§2). */
export async function getUnfoldedMembers(): Promise<
  { id: string; fullName: string }[]
> {
  await getViewer()
  return SAMPLE_PEOPLE.filter(
    (person) => person.isMember && person.foldName === null
  ).map((person) => ({
    id: person.id,
    fullName: `${person.firstName} ${person.lastName}`,
  }))
}

export function listPeople(): { id: string; fullName: string }[] {
  return SAMPLE_PEOPLE.map((person) => ({
    id: person.id,
    fullName: `${person.firstName} ${person.lastName}`,
  }))
}
