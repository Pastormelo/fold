import 'server-only'

import { cache } from 'react'

import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'

import {
  type CareNoteRecord,
  type CareTimeline,
  type RestorationCaseRecord,
  type RestorationCaseView,
  type Viewer,
  buildCareTimeline,
  canReadTier,
  viewRestorationCase,
  writableTiers,
} from '@/domain/access'
import { canCarryCase } from '@/domain/restoration'
import {
  DIRECTION_LABELS,
  SYNC_CATEGORIES,
  type SyncCategory,
  categoryRule,
  isCategoryEnabled,
} from '@/domain/planning-center'
import {
  JOURNEY_WITHHELD_DISCLOSURE,
  WINDOW_LABELS,
  type JourneyInstance,
  type JourneyTemplate,
  canReadJourney,
  deleteTemplateRefusal,
  journeyProgress,
} from '@/domain/journeys'
import {
  type ConfidentialityTier,
  TIER_DESCRIPTIONS,
  TIER_ORDER,
  tierName,
} from '@/domain/tiers'
import type { RailSection } from '@/domain/navigation'
import {
  type Permission,
  type PermissionCheck,
  type Principal,
  type Role,
  ROLE_LABELS,
  clearanceFor,
  countLeadersByClearance,
  grantedExceptions,
  isRole,
  permissionCheck,
} from '@/domain/roles'
import { db, schema } from '@/db/client'

import { getViewer } from './viewer'

/**
 * The Data Access Layer.
 *
 * Every function resolves the viewer itself rather than accepting one, so a
 * caller cannot ask "show me this as somebody else". Each returns a DTO that has
 * already been through `@/domain/access`, which means content the viewer may not
 * read is absent from the returned object — not nulled out, and never
 * present-but-hidden-in-the-UI.
 *
 * **Every query is scoped by `viewer.churchId`.** That is not defensive
 * programming, it is the tenancy boundary: a query that forgot it would return
 * another church's pastoral records, which is the worst failure this application
 * has available. The scope comes off the viewer so it cannot be passed in wrong.
 */

/* ─────────────────────────────── Viewer ─────────────────────────────── */

export type ViewerSummary = {
  personId: string
  displayName: string
  churchName: string
  roleLabels: string[]
  clearanceTier: ConfidentialityTier | null
  clearanceLabel: string
}

export const getViewerSummary = cache(async (): Promise<ViewerSummary> => {
  const viewer = await getViewer()
  const clearance = clearanceFor(viewer)

  const [church] = await db
    .select({ name: schema.churches.name })
    .from(schema.churches)
    .where(eq(schema.churches.id, viewer.churchId))
    .limit(1)

  return {
    personId: viewer.personId,
    displayName: viewer.displayName,
    churchName: church?.name ?? 'This church',
    roleLabels: viewer.roles.map((role) => ROLE_LABELS[role]),
    clearanceTier: clearance,
    clearanceLabel: clearance ? tierName(clearance) : 'No pastoral care access',
  }
})

/* ────────────────────────────── The rail ────────────────────────────── */

/**
 * The badge counts on the rail.
 *
 * Every one is a count of things needing attention, computed here rather than
 * stored — §8.1, and the same way the prototype derived them. A section whose
 * count is zero renders no badge at all: a badge reading 0 is noise pretending to
 * be information.
 *
 * A viewer with no care clearance gets no counts, because they will not be
 * offered those sections either.
 */
export const getRailBadges = cache(
  async (): Promise<Partial<Record<RailSection, number>>> => {
    const viewer = await getViewer()
    if (clearanceFor(viewer) === null) return {}

    // Deliberately built from the same functions the sections themselves use,
    // rather than from a second set of queries. A badge is a claim about what a
    // section contains, so counting it separately is how the two come to disagree
    // — §8.2, the subject of a claim must match what it was computed from.
    const [journeys, unfolded] = await Promise.all([
      getJourneys(),
      getUnfoldedMembers(),
    ])

    return {
      // A member under no named elder is the product's central failure, so that is
      // what Family counts. Journeys counts only the late ones this viewer can
      // actually read — a number they cannot act on is worse than none.
      people: unfolded.length,
      journeys: journeys.filter(
        (journey) => journey.access === 'visible' && journey.isOverdue
      ).length,
    }
  }
)

/* ─────────────────────── Everyone who holds a role ─────────────────────── */

/**
 * The church's leaders as authorization subjects, for the tier counts and the
 * exceptions list. Roles and grants are read together so clearance is derived
 * from live rows rather than anything stored alongside them (§8.1).
 */
async function loadPrincipals(
  churchId: string
): Promise<(Principal & { fullName: string })[]> {
  const roleRows = await db
    .select({
      personId: schema.leaderRoles.personId,
      role: schema.leaderRoles.role,
      firstName: schema.people.firstName,
      lastName: schema.people.lastName,
    })
    .from(schema.leaderRoles)
    .innerJoin(schema.people, eq(schema.people.id, schema.leaderRoles.personId))
    .where(eq(schema.leaderRoles.churchId, churchId))

  if (roleRows.length === 0) return []
  const personIds = [...new Set(roleRows.map((row) => row.personId))]

  const [permissionRows, clearanceRows] = await Promise.all([
    db
      .select()
      .from(schema.permissionGrants)
      .where(
        and(
          inArray(schema.permissionGrants.personId, personIds),
          isNull(schema.permissionGrants.revokedAt)
        )
      ),
    db
      .select()
      .from(schema.clearanceGrants)
      .where(
        and(
          inArray(schema.clearanceGrants.personId, personIds),
          isNull(schema.clearanceGrants.revokedAt)
        )
      ),
  ])

  const byPerson = new Map<string, Principal & { fullName: string }>()
  for (const row of roleRows) {
    const existing = byPerson.get(row.personId)
    // A role name this build does not recognise is dropped rather than trusted:
    // access must never come from a string the code cannot evaluate.
    const role = isRole(row.role) ? (row.role as Role) : null
    if (existing) {
      if (role) existing.roles = [...existing.roles, role]
      continue
    }
    byPerson.set(row.personId, {
      personId: row.personId,
      fullName: `${row.firstName} ${row.lastName}`,
      roles: role ? [role] : [],
      permissionGrants: permissionRows
        .filter((grant) => grant.personId === row.personId)
        .map((grant) => ({
          id: grant.id,
          permission: grant.permission as Permission,
          grantedById: grant.grantedById,
          grantedByName: grant.grantedById,
          grantedAt: grant.grantedAt,
          reason: grant.reason,
          revokedAt: grant.revokedAt,
          revokedById: grant.revokedById,
        })),
      clearanceGrants: clearanceRows
        .filter((grant) => grant.personId === row.personId)
        .map((grant) => ({
          id: grant.id,
          tier: grant.tier,
          grantedById: grant.grantedById,
          grantedByName: grant.grantedById,
          grantedAt: grant.grantedAt,
          reason: grant.reason,
          revokedAt: grant.revokedAt,
          revokedById: grant.revokedById,
        })),
    })
  }
  return [...byPerson.values()]
}

/* ──────────────────────────── A person record ──────────────────────────── */

export type PersonRecord = {
  id: string
  fullName: string
  initials: string
  since: string
  foldLabel: string
  foldIsUnassigned: boolean
  isMember: boolean
  household: readonly string[]
  serving: string
  groups: string
  care: CareTimeline
  writableTiers: { tier: ConfidentialityTier; label: string }[]
  logNoteCheck: PermissionCheck
}

export const getPersonRecord = cache(
  async (personId: string): Promise<PersonRecord | null> => {
    const viewer = await getViewer()

    const [person] = await db
      .select({
        id: schema.people.id,
        firstName: schema.people.firstName,
        lastName: schema.people.lastName,
        isMember: schema.people.isMember,
        createdAt: schema.people.createdAt,
        foldName: schema.folds.name,
        householdName: schema.households.name,
      })
      .from(schema.people)
      .leftJoin(schema.folds, eq(schema.folds.id, schema.people.foldId))
      .leftJoin(
        schema.households,
        eq(schema.households.id, schema.people.householdId)
      )
      // Scoped to the viewer's church, so a guessed id from elsewhere finds nothing.
      .where(
        and(
          eq(schema.people.id, personId),
          eq(schema.people.churchId, viewer.churchId)
        )
      )
      .limit(1)

    if (!person) return null

    const noteRows = await db
      .select({
        id: schema.careNotes.id,
        personId: schema.careNotes.personId,
        authorId: schema.careNotes.authorId,
        occurredAt: schema.careNotes.occurredAt,
        visibilityTier: schema.careNotes.visibilityTier,
        body: schema.careNotes.body,
        restorationCaseId: schema.careNotes.restorationCaseId,
        authorFirst: schema.people.firstName,
        authorLast: schema.people.lastName,
      })
      .from(schema.careNotes)
      .innerJoin(schema.people, eq(schema.people.id, schema.careNotes.authorId))
      .where(
        and(
          eq(schema.careNotes.personId, personId),
          eq(schema.careNotes.churchId, viewer.churchId)
        )
      )
      .orderBy(desc(schema.careNotes.occurredAt))

    const notes: CareNoteRecord[] = noteRows.map((row) => ({
      id: row.id,
      personId: row.personId,
      authorId: row.authorId,
      authorName: `${row.authorFirst} ${row.authorLast}`,
      occurredAt: row.occurredAt,
      visibilityTier: row.visibilityTier,
      body: row.body,
      restorationCaseId: row.restorationCaseId,
    }))

    return {
      id: person.id,
      fullName: `${person.firstName} ${person.lastName}`,
      initials: `${person.firstName[0] ?? ''}${person.lastName[0] ?? ''}`,
      since: `In the directory since ${person.createdAt.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`,
      foldLabel:
        person.foldName ??
        'No fold. This is an open pastoral matter, not a data gap.',
      foldIsUnassigned: person.foldName === null,
      isMember: person.isMember,
      household: person.householdName ? [person.householdName] : [],
      serving: 'Not recorded yet',
      groups: 'Not recorded yet',
      care: buildCareTimeline(viewer, notes),
      writableTiers: writableTiers(viewer).map((tier) => ({
        tier,
        label: tierName(tier),
      })),
      logNoteCheck: permissionCheck(viewer, 'care.log_note'),
    }
  }
)

/** The people this viewer can see, for choosing whose record to open. */
export type PersonListRow = {
  id: string
  fullName: string
  initials: string
  /** Carries the sentence when there is no fold, not an empty string (§2). */
  foldLabel: string
  isUnfolded: boolean
}

export const listPeople = cache(async (): Promise<PersonListRow[]> => {
  const viewer = await getViewer()
  const rows = await db
    .select({
      id: schema.people.id,
      firstName: schema.people.firstName,
      lastName: schema.people.lastName,
      isMember: schema.people.isMember,
      foldName: schema.folds.name,
    })
    .from(schema.people)
    .leftJoin(schema.folds, eq(schema.folds.id, schema.people.foldId))
    .where(eq(schema.people.churchId, viewer.churchId))
    .orderBy(asc(schema.people.lastName), asc(schema.people.firstName))

  return rows.map((row) => ({
    id: row.id,
    fullName: `${row.firstName} ${row.lastName}`,
    initials: `${row.firstName[0] ?? ''}${row.lastName[0] ?? ''}`,
    foldLabel:
      row.foldName ??
      (row.isMember ? 'No fold — an open pastoral matter' : 'Not yet a member'),
    isUnfolded: row.foldName === null && row.isMember,
  }))
})

/* ─────────────────────────── Restoration cases ─────────────────────────── */

export const getRestorationCases = cache(
  async (): Promise<RestorationCaseView[]> => {
    const viewer = await getViewer()

    const rows = await db
      .select()
      .from(schema.restorationCases)
      .where(eq(schema.restorationCases.churchId, viewer.churchId))
      .orderBy(desc(schema.restorationCases.openedAt))

    if (rows.length === 0) return []

    // Names for the person and the two elders, resolved in one query.
    const ids = [
      ...new Set(
        rows.flatMap((r) => [r.personId, r.leadElderId, r.secondElderId])
      ),
    ]
    const nameRows = await db
      .select({
        id: schema.people.id,
        firstName: schema.people.firstName,
        lastName: schema.people.lastName,
      })
      .from(schema.people)
      .where(inArray(schema.people.id, ids))
    const nameOf = new Map(
      nameRows.map((row) => [row.id, `${row.firstName} ${row.lastName}`])
    )

    return rows.map((row) => {
      const record: RestorationCaseRecord = {
        id: row.id,
        personId: row.personId,
        personName: nameOf.get(row.personId) ?? 'Unknown',
        foldName: '',
        openedAt: row.openedAt,
        leadElderId: row.leadElderId,
        secondElderId: row.secondElderId,
        leadElderName: nameOf.get(row.leadElderId) ?? 'Unknown',
        secondElderName: nameOf.get(row.secondElderId) ?? 'Unknown',
        step: row.step,
        stepLabel: row.stepLabel,
        status: row.status,
        closedAt: row.closedAt,
        outcome: row.outcome,
        plan: row.plan,
        knows: row.knows,
        doesNotKnow: row.doesNotKnow,
        decisionQuestion: row.decisionQuestion,
      }
      return viewRestorationCase(viewer, record)
    })
  }
)

/* ──────────────────────────── The tier table ──────────────────────────── */

export type TierOverviewRow = {
  tier: ConfidentialityTier
  name: string
  who: string
  sees: string
  cannot: string
  leaderCount: number
  leaderCountLabel: string
  viewerIsAtThisTier: boolean
}

export const getTierOverview = cache(async (): Promise<TierOverviewRow[]> => {
  const viewer = await getViewer()
  const viewerClearance = clearanceFor(viewer)
  // Counted from the leader rows, never written as a literal (§8.1).
  const counts = countLeadersByClearance(await loadPrincipals(viewer.churchId))

  return TIER_ORDER.map((tier) => {
    const count = counts[tier]
    return {
      tier,
      ...TIER_DESCRIPTIONS[tier],
      leaderCount: count,
      leaderCountLabel: `${count} ${count === 1 ? 'person' : 'people'}`,
      viewerIsAtThisTier: viewerClearance === tier,
    }
  })
})

export const getPermission = cache(
  async (permission: Permission): Promise<PermissionCheck> => {
    const viewer = await getViewer()
    return permissionCheck(viewer, permission)
  }
)

/* ───────────────────────── Access beyond role ───────────────────────── */

export type GrantedExceptionRow = {
  /** The grant row, so it can be ended. Paired with `kind`, which table it is in. */
  grantId: string
  kind: 'permission' | 'clearance'
  personName: string
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
 * it is that every exception is answerable in one place. Self-grants are marked,
 * since an administrator raising their own clearance is both legitimate and the
 * obvious abuse path.
 */
export const getGrantedExceptions = cache(
  async (): Promise<GrantedExceptionRow[]> => {
    const viewer = await getViewer()
    const principals = await loadPrincipals(viewer.churchId)
    const nameOf = new Map(principals.map((p) => [p.personId, p.fullName]))

    const when = (date: Date) =>
      date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      })

    return grantedExceptions(principals).flatMap((exception) => {
      const rows: GrantedExceptionRow[] = []
      const personName = nameOf.get(exception.personId) ?? exception.personId

      if (exception.clearance) {
        rows.push({
          grantId: exception.clearance.id,
          kind: 'clearance',
          personName,
          what: `${tierName(exception.clearance.tier)} clearance`,
          grantedByName:
            nameOf.get(exception.clearance.grantedById) ??
            exception.clearance.grantedById,
          grantedAt: when(exception.clearance.grantedAt),
          reason: exception.clearance.reason,
          selfGranted: exception.clearance.grantedById === exception.personId,
        })
      }
      for (const grant of exception.permissions) {
        rows.push({
          grantId: grant.id,
          kind: 'permission',
          personName,
          what: grant.permission,
          grantedByName: nameOf.get(grant.grantedById) ?? grant.grantedById,
          grantedAt: when(grant.grantedAt),
          reason: grant.reason,
          selfGranted: grant.grantedById === exception.personId,
        })
      }
      return rows
    })
  }
)

/* ──────────────────────── Members with no fold ──────────────────────── */

/** An open pastoral matter, not a data gap (§2). */
export const getUnfoldedMembers = cache(
  async (): Promise<{ id: string; fullName: string }[]> => {
    const viewer = await getViewer()
    const rows = await db
      .select({
        id: schema.people.id,
        firstName: schema.people.firstName,
        lastName: schema.people.lastName,
      })
      .from(schema.people)
      .where(
        and(
          eq(schema.people.churchId, viewer.churchId),
          eq(schema.people.isMember, true),
          isNull(schema.people.foldId)
        )
      )
      .orderBy(asc(schema.people.lastName))
    return rows.map((row) => ({
      id: row.id,
      fullName: `${row.firstName} ${row.lastName}`,
    }))
  }
)

/* ──────────────────────────── Care journeys ──────────────────────────── */

export type JourneyRow =
  | {
      access: 'visible'
      instanceId: string
      personName: string
      templateName: string
      trigger: string
      tierLabel: string
      stepLabel: string
      nextStepTitle: string | null
      guidanceNote: string | null
      dueLabel: string | null
      isOverdue: boolean
      ownerName: string
      summary: string
    }
  | {
      access: 'withheld'
      instanceId: string
      personName: string
      tierLabel: string
      disclosure: string
    }

/**
 * Running journeys, redacted for this viewer.
 *
 * A journey above the reader's tier is withheld the way a note is — but the
 * person's name stays visible, because the product's premise is that nobody
 * disappears quietly, and hiding that someone is receiving care would defeat it.
 */
export const getJourneys = cache(
  async (asOf: Date = new Date()): Promise<JourneyRow[]> => {
    const viewer = await getViewer()
    const clearance = clearanceFor(viewer)

    const instanceRows = await db
      .select({
        id: schema.journeyInstances.id,
        templateId: schema.journeyInstances.templateId,
        personId: schema.journeyInstances.personId,
        startedAt: schema.journeyInstances.startedAt,
        ownerId: schema.journeyInstances.ownerId,
        closedAt: schema.journeyInstances.closedAt,
        closedReason: schema.journeyInstances.closedReason,
      })
      .from(schema.journeyInstances)
      .where(eq(schema.journeyInstances.churchId, viewer.churchId))

    if (instanceRows.length === 0) return []

    const templateIds = [...new Set(instanceRows.map((r) => r.templateId))]
    const [templateRows, stepRows, completionRows, peopleRows] =
      await Promise.all([
        db
          .select()
          .from(schema.journeyTemplates)
          .where(inArray(schema.journeyTemplates.id, templateIds)),
        db
          .select()
          .from(schema.journeySteps)
          .where(inArray(schema.journeySteps.templateId, templateIds))
          .orderBy(asc(schema.journeySteps.position)),
        db
          .select()
          .from(schema.journeyStepCompletions)
          .where(
            inArray(
              schema.journeyStepCompletions.instanceId,
              instanceRows.map((r) => r.id)
            )
          ),
        db
          .select({
            id: schema.people.id,
            firstName: schema.people.firstName,
            lastName: schema.people.lastName,
          })
          .from(schema.people)
          .where(eq(schema.people.churchId, viewer.churchId)),
      ])

    const nameOf = new Map(
      peopleRows.map((row) => [row.id, `${row.firstName} ${row.lastName}`])
    )
    const templates = new Map<string, JourneyTemplate>(
      templateRows.map((row) => [
        row.id,
        {
          id: row.id,
          name: row.name,
          trigger: row.trigger,
          visibilityTier: row.visibilityTier,
          isSystemDefault: row.isSystemDefault,
          steps: stepRows
            .filter((step) => step.templateId === row.id)
            .map((step) => ({
              id: step.id,
              title: step.title,
              window: step.window,
              ownerRole: step.ownerRole as Role,
              guidanceNote: step.guidanceNote,
            })),
        },
      ])
    )

    return instanceRows.flatMap((row): JourneyRow[] => {
      const template = templates.get(row.templateId)
      if (!template) return []

      const personName = nameOf.get(row.personId) ?? 'Unknown person'
      const tierLabel = tierName(template.visibilityTier)

      if (!canReadJourney(clearance, template)) {
        return [
          {
            access: 'withheld',
            instanceId: row.id,
            personName,
            tierLabel,
            disclosure: JOURNEY_WITHHELD_DISCLOSURE,
          },
        ]
      }

      const instance: JourneyInstance = {
        id: row.id,
        templateId: row.templateId,
        personId: row.personId,
        startedAt: row.startedAt,
        ownerId: row.ownerId,
        ownerName: nameOf.get(row.ownerId) ?? 'Unknown',
        completions: completionRows
          .filter((c) => c.instanceId === row.id)
          .map((c) =>
            c.kind === 'done'
              ? {
                  stepId: c.stepId,
                  completedAt: c.completedAt,
                  byId: c.byId,
                  byName: nameOf.get(c.byId) ?? 'Unknown',
                  kind: 'done' as const,
                  outcome: c.outcome ?? '',
                }
              : {
                  stepId: c.stepId,
                  completedAt: c.completedAt,
                  byId: c.byId,
                  byName: nameOf.get(c.byId) ?? 'Unknown',
                  kind: 'skipped' as const,
                  skipReason: c.skipReason ?? '',
                }
          ),
        closedAt: row.closedAt,
        closedReason: row.closedReason,
      }

      const progress = journeyProgress(template, instance, asOf)
      return [
        {
          access: 'visible',
          instanceId: row.id,
          personName,
          templateName: template.name,
          trigger: template.trigger,
          tierLabel,
          stepLabel: progress.stepLabel,
          nextStepTitle: progress.currentStep?.title ?? null,
          guidanceNote: progress.currentStep?.guidanceNote ?? null,
          dueLabel: progress.currentStep
            ? WINDOW_LABELS[progress.currentStep.window]
            : null,
          isOverdue: progress.isOverdue,
          ownerName: instance.ownerName,
          summary: progress.summary,
        },
      ]
    })
  }
)

/**
 * The journey templates the church has, whether or not any are running.
 *
 * Worth showing on its own: a church that has configured its grief journey and
 * never started one is in a different position from a church with none.
 */
export type JourneyTemplateRow = {
  id: string
  name: string
  trigger: string
  tierLabel: string
  stepCount: number
  /** Pluralised from the count, not written twice (§8.1). */
  stepCountLabel: string
  isSystemDefault: boolean
  readable: boolean
  /**
   * Why this template cannot be deleted, or `null` when it can. §2: system
   * defaults are editable but never removable, and the sentence explains that in
   * terms of the situation rather than the software.
   */
  deleteRefusal: string | null
}

export const getJourneyTemplates = cache(
  async (): Promise<JourneyTemplateRow[]> => {
    const viewer = await getViewer()
    const clearance = clearanceFor(viewer)

    const rows = await db
      .select()
      .from(schema.journeyTemplates)
      .where(eq(schema.journeyTemplates.churchId, viewer.churchId))
      .orderBy(asc(schema.journeyTemplates.name))

    if (rows.length === 0) return []

    const steps = await db
      .select({ templateId: schema.journeySteps.templateId })
      .from(schema.journeySteps)
      .where(
        inArray(
          schema.journeySteps.templateId,
          rows.map((r) => r.id)
        )
      )

    return rows.map((row) => {
      const template: JourneyTemplate = {
        id: row.id,
        name: row.name,
        trigger: row.trigger,
        visibilityTier: row.visibilityTier,
        isSystemDefault: row.isSystemDefault,
        steps: [],
      }
      const stepCount = steps.filter((s) => s.templateId === row.id).length
      return {
        id: row.id,
        name: row.name,
        trigger: row.trigger,
        tierLabel: tierName(row.visibilityTier),
        stepCount,
        stepCountLabel: `${stepCount} ${stepCount === 1 ? 'step' : 'steps'}`,
        isSystemDefault: row.isSystemDefault,
        readable: canReadJourney(clearance, template),
        deleteRefusal: deleteTemplateRefusal(template),
      }
    })
  }
)

/* ────────────────────────── Planning Center ────────────────────────── */

export type SyncCategoryRow = {
  /** Needed by the toggle, which names a category rather than a row. */
  category: SyncCategory
  label: string
  directionLabel: string
  enabled: boolean
  switchable: boolean
  fixedReason: string | null
  conflictNote: string | null
}

export const getSyncCategories = cache(async (): Promise<SyncCategoryRow[]> => {
  const viewer = await getViewer()

  const stored = await db
    .select()
    .from(schema.syncSettings)
    .where(eq(schema.syncSettings.churchId, viewer.churchId))

  const settings = Object.fromEntries(
    stored.map((row) => [row.category, row.enabled])
  )

  return SYNC_CATEGORIES.map((category) => {
    const rule = categoryRule(category)
    return {
      category,
      label: rule.label,
      directionLabel: DIRECTION_LABELS[rule.direction],
      // Reads through isCategoryEnabled, which refuses to report confidential
      // notes as on even if a stored row says otherwise.
      enabled: isCategoryEnabled(settings, category),
      switchable: rule.switchable,
      fixedReason: rule.fixedReason,
      conflictNote:
        rule.conflictWinner === 'planning_center'
          ? 'Planning Center wins on conflict'
          : rule.conflictWinner === 'fold'
            ? 'Fold wins on conflict'
            : null,
    }
  })
})

/** Re-exported so the screen can name the signed-in person without a second call. */
export type { Viewer }

/* ─────────────────── Opening and working restoration cases ─────────────────── */

export type RestorationOptions = {
  /** Whether this viewer reaches the tier at all. Everything else follows. */
  isElder: boolean
  /** Said plainly rather than as a bare refusal. */
  refusal: string
  /** Everybody, since a case can be about anyone. */
  people: readonly { id: string; fullName: string }[]
  /**
   * Only people holding `restoration.be_assigned` — so the select offers exactly
   * what `pairElders` would accept, rather than offering everybody and refusing
   * on submit (§8.4).
   */
  elders: readonly { id: string; fullName: string; roleLabel: string }[]
  /** Named when there are not two, because one elder cannot carry a case. */
  elderNote: string
}

export const getRestorationOptions = cache(
  async (): Promise<RestorationOptions> => {
    const viewer = await getViewer()

    if (!canReadTier(viewer, 'elders_only')) {
      return {
        isElder: false,
        refusal:
          'Restoration cases are elders-only. You can see that a case exists and how it ended, and nothing inside it.',
        people: [],
        elders: [],
        elderNote: '',
      }
    }

    const [peopleRows, roleRows] = await Promise.all([
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
        .select({
          personId: schema.leaderRoles.personId,
          role: schema.leaderRoles.role,
        })
        .from(schema.leaderRoles)
        .where(eq(schema.leaderRoles.churchId, viewer.churchId)),
    ])

    const rolesByPerson = new Map<string, Role[]>()
    for (const row of roleRows) {
      const list = rolesByPerson.get(row.personId) ?? []
      if (isRole(row.role)) list.push(row.role)
      rolesByPerson.set(row.personId, list)
    }

    const elders = peopleRows
      .filter((person) =>
        canCarryCase({
          personId: person.id,
          roles: rolesByPerson.get(person.id) ?? [],
        })
      )
      .map((person) => ({
        id: person.id,
        fullName: `${person.firstName} ${person.lastName}`,
        roleLabel: (rolesByPerson.get(person.id) ?? [])
          .map((role) => ROLE_LABELS[role])
          .join(' · '),
      }))

    return {
      isElder: true,
      refusal: '',
      people: peopleRows.map((person) => ({
        id: person.id,
        fullName: `${person.firstName} ${person.lastName}`,
      })),
      elders,
      // The likely first-run state, and worth naming: one elder cannot carry a
      // case, so two is the minimum before anything can be opened.
      elderNote:
        elders.length < 2
          ? `A case needs two elders, and this church has ${elders.length === 0 ? 'nobody' : 'only one person'} who can carry one. Give somebody Pastor or elder in Setup first — the rule is two present, never one, and it protects the person as much as the church.`
          : '',
    }
  }
)
