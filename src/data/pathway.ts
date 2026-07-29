import 'server-only'

import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm'

import {
  type MigrationChoice,
  type PathwayAction,
  type PathwayState,
  ACTION_LABELS,
  MIGRATION_CHOICES,
  MIGRATION_CHOICE_LABELS,
  attemptTransition,
  availableActions,
  describeState,
  transitionRule,
} from '@/domain/pathway'
import {
  type AbsentField,
  type EditablePathway,
  type EditableStage,
  type PathwayDiff,
  diffPathway,
  unexplainedAbsences,
} from '@/domain/pathway-diff'
import {
  type HealthFinding,
  type PublishReadiness,
  type Review,
  objectionsAddressedByOthers,
  publishReadiness,
} from '@/domain/pathway-publish'
import { db, schema } from '@/db/client'

import { getViewer } from './viewer'

/**
 * The pathway, read for the person asking.
 *
 * Kept apart from `./records` because the pathway is a different kind of object:
 * one versioned document per church rather than a list of people, and almost
 * every question about it is answered by the domain modules rather than by SQL.
 * This file's job is to turn rows into the shapes those modules already take, and
 * to hand back what the screen needs without the screen re-deriving anything.
 *
 * Nothing here is tier-gated. A pathway is how the church says it receives
 * people; it is not a care note. What *is* gated is changing it, and that gate
 * comes from `availableActions`, which is the same call the buttons make.
 */

/* ────────────────────────────── Row → domain ────────────────────────────── */

type PathwayRow = typeof schema.pathways.$inferSelect
type StageRow = typeof schema.pathwayStages.$inferSelect

/**
 * A version row plus its stages, in the shape `diffPathway` takes.
 *
 * Stage ids are the database ids, which matters: the diff pairs stages by id, so
 * a stage that was edited reads as `changed` and a stage that was replaced reads
 * as one `removed` and one `added`. Those are different events and the church
 * should see them differently.
 */
function toEditable(
  row: PathwayRow,
  stages: readonly StageRow[]
): EditablePathway {
  return {
    internalName: row.internalName,
    publicName: row.publicName,
    philosophy: row.philosophy,
    discipleDefinition: row.discipleDefinition,
    stages: stages
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((stage): EditableStage => ({
        id: stage.id,
        name: stage.name,
        publicName: stage.publicName,
        subtitle: stage.subtitle,
        purpose: stage.purpose,
        outcome: stage.outcome,
        entryCondition: stage.entryCondition,
        requiredActions: stage.requiredActions,
        optionalActions: stage.optionalActions,
        ownerRole: stage.ownerRole,
        completionCondition: stage.completionCondition,
        stoppingRule: stage.stoppingRule,
        reactivationRule: stage.reactivationRule,
        escalationRule: stage.escalationRule,
        milestones: stage.milestones,
        intentionallyAbsent: stage.intentionallyAbsent,
      })),
  }
}

async function stagesFor(pathwayIds: readonly string[]): Promise<StageRow[]> {
  if (pathwayIds.length === 0) return []
  return db
    .select()
    .from(schema.pathwayStages)
    .where(inArray(schema.pathwayStages.pathwayId, pathwayIds))
    .orderBy(asc(schema.pathwayStages.position))
}

/**
 * Reviews in the shape §4's attribution rules expect.
 *
 * `approval` and `objection` are built independently from independent columns,
 * because that separation is the whole point: a reviewer whose objection someone
 * else marked addressed must not come back as an approver.
 */
function toReviews(
  rows: readonly (typeof schema.pathwayReviews.$inferSelect)[],
  nameOf: (id: string) => string
): Review[] {
  return rows.map((row) => ({
    reviewerId: row.reviewerId,
    reviewerName: nameOf(row.reviewerId),
    approval: row.approvedAt ? { at: row.approvedAt } : null,
    objection:
      row.objectionRaisedAt && row.objectionNote !== null
        ? {
            raisedAt: row.objectionRaisedAt,
            note: row.objectionNote,
            addressedAt: row.objectionAddressedAt,
            addressedById: row.objectionAddressedById,
          }
        : null,
  }))
}

function toFindings(
  rows: readonly (typeof schema.pathwayHealthFindings.$inferSelect)[]
): HealthFinding[] {
  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    severity: row.severity as HealthFinding['severity'],
    evidence: row.evidence,
    why: row.why,
    options: row.options,
    blocksPublishing: row.blocksPublishing,
    dismissedById: row.dismissedById,
    dismissalReason: row.dismissalReason,
  }))
}

/* ──────────────────────────── The working version ──────────────────────────── */

/**
 * The version a church is currently working on, if any.
 *
 * "Working" means not `active` and not `archived` — the states
 * `isReadableState` excludes. There is at most one, and when there is none the
 * active version is what the screen shows, read-only, with `edit_stage` offered
 * as the way to open a new draft.
 */
async function loadWorking(churchId: string): Promise<PathwayRow | null> {
  const [row] = await db
    .select()
    .from(schema.pathways)
    .where(
      and(
        eq(schema.pathways.churchId, churchId),
        ne(schema.pathways.state, 'active'),
        ne(schema.pathways.state, 'archived')
      )
    )
    .orderBy(desc(schema.pathways.versionNumber))
    .limit(1)
  return row ?? null
}

async function loadActive(churchId: string): Promise<PathwayRow | null> {
  const [row] = await db
    .select()
    .from(schema.pathways)
    .where(
      and(
        eq(schema.pathways.churchId, churchId),
        eq(schema.pathways.state, 'active')
      )
    )
    .limit(1)
  return row ?? null
}

/* ─────────────────────────────── The overview ─────────────────────────────── */

export type PathwayActionOffer = {
  action: PathwayAction
  label: string
  available: boolean
  /** Present whenever `available` is false. Never a disabled control with no reason. */
  reason: string | null
  /** §4's table does not cover this transition; the note says what was assumed. */
  inferredNote: string | null
}

export type MigrationOption = {
  choice: MigrationChoice
  label: string
  chosen: boolean
}

export type PathwayHistoryEntry = {
  id: string
  label: string
  fromLabel: string
  toLabel: string
  actorName: string
  when: string
  detail: string | null
}

export type ReviewRow = {
  /** Needed by `addressObjection`, which acts on a reviewer rather than a row. */
  reviewerId: string
  reviewerName: string
  /** One of: approved, requested changes, addressed by someone else, silent. */
  standing: string
  /** True only when this reviewer approved. Not inferred from anything else. */
  approved: boolean
  holdsPublication: boolean
  note: string | null
}

export type PathwayOverview =
  | {
      kind: 'none'
      /** Whether this viewer may start one, with the reason when they may not. */
      offer: PathwayActionOffer
    }
  | {
      kind: 'pathway'
      /** The version being read: the working one if there is one, else the active one. */
      versionId: string
      versionNumber: number
      state: PathwayState
      stateLabel: string
      isWorkingVersion: boolean
      internalName: string
      publicName: string
      philosophy: string
      discipleDefinition: string
      stages: readonly EditableStage[]
      /** What the church is running right now, which may be an older version. */
      live: { versionNumber: number; publishedOn: string } | null
      liveNote: string
      diff: PathwayDiff
      readiness: PublishReadiness | null
      migrationOptions: readonly MigrationOption[]
      actions: readonly PathwayActionOffer[]
      reviews: readonly ReviewRow[]
      findings: readonly HealthFinding[]
      absences: readonly AbsentField[]
      history: readonly PathwayHistoryEntry[]
    }

const DATE = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

const DATE_TIME = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export async function getPathwayOverview(): Promise<PathwayOverview> {
  const viewer = await getViewer()

  const [working, active] = await Promise.all([
    loadWorking(viewer.churchId),
    loadActive(viewer.churchId),
  ])

  // Nothing at all: offer the one action that can create something, and let
  // `attemptTransition` say whether this viewer may take it. A church with no
  // pathway is the ordinary starting state, not an error.
  const subject = working ?? active
  if (!subject) {
    const result = attemptTransition(viewer, 'begin_draft', {
      versionId: 'new',
      currentState: 'discovery',
      at: new Date(),
    })
    return {
      kind: 'none',
      offer: {
        action: 'begin_draft',
        label: ACTION_LABELS.begin_draft,
        available: result.ok,
        reason: result.ok ? null : result.refusal.message,
        inferredNote: transitionRule('begin_draft').inferred,
      },
    }
  }

  const isWorkingVersion = working !== null

  const [stageRows, reviewRows, findingRows, transitionRows] =
    await Promise.all([
      stagesFor(active && working ? [subject.id, active.id] : [subject.id]),
      db
        .select()
        .from(schema.pathwayReviews)
        .where(eq(schema.pathwayReviews.pathwayId, subject.id)),
      db
        .select()
        .from(schema.pathwayHealthFindings)
        .where(eq(schema.pathwayHealthFindings.pathwayId, subject.id))
        .orderBy(asc(schema.pathwayHealthFindings.createdAt)),
      db
        .select()
        .from(schema.pathwayTransitions)
        .where(eq(schema.pathwayTransitions.pathwayId, subject.id))
        .orderBy(desc(schema.pathwayTransitions.occurredAt)),
    ])

  const nameOf = await namesFor([
    ...reviewRows.map((row) => row.reviewerId),
    ...reviewRows.flatMap((row) =>
      row.objectionAddressedById ? [row.objectionAddressedById] : []
    ),
    ...transitionRows.map((row) => row.actorId),
    ...(active?.publishedById ? [active.publishedById] : []),
  ])

  const draft = toEditable(
    subject,
    stageRows.filter((stage) => stage.pathwayId === subject.id)
  )
  const published =
    active && active.id !== subject.id
      ? toEditable(
          active,
          stageRows.filter((stage) => stage.pathwayId === active.id)
        )
      : null

  // §8.6: the only thing that means "this draft has changes". Note the argument
  // names — swapping them would make the diff describe the published pathway as
  // the change, which §8.2 is about.
  const diff = diffPathway({ draft, published })

  const reviews = toReviews(reviewRows, (id) => nameOf(id))
  const findings = toFindings(findingRows)

  // Only a working version can be published, and the gate is only meaningful
  // against something that is not already live.
  const readiness = isWorkingVersion
    ? publishReadiness({
        findings,
        reviews,
        migrationChoice: subject.migrationChoice,
        diff,
        peopleInFlight: await countPeopleInFlight(viewer.churchId),
      })
    : null

  const actions = availableActions(viewer, {
    versionId: subject.id,
    currentState: subject.state,
    at: new Date(),
    // Supplied only when it has actually been evaluated. `availableActions`
    // reports publish as unavailable rather than guessing when it is absent.
    ...(readiness ? { publishBlockers: readiness.blockers } : {}),
    activeVersionId: active?.id ?? null,
  }).map((offer): PathwayActionOffer => ({
    ...offer,
    inferredNote: transitionRule(offer.action).inferred,
  }))

  const addressedByOthers = new Map(
    objectionsAddressedByOthers(reviews).map((entry) => [
      entry.reviewerId,
      entry,
    ])
  )

  return {
    kind: 'pathway',
    versionId: subject.id,
    versionNumber: subject.versionNumber,
    state: subject.state,
    stateLabel: describeState(subject.state),
    isWorkingVersion,
    internalName: subject.internalName,
    publicName: subject.publicName,
    philosophy: subject.philosophy,
    discipleDefinition: subject.discipleDefinition,
    stages: draft.stages,
    live:
      active && active.publishedAt
        ? {
            versionNumber: active.versionNumber,
            publishedOn: DATE.format(active.publishedAt),
          }
        : null,
    liveNote: liveNote({ active, isWorkingVersion, state: subject.state }),
    diff,
    readiness,
    migrationOptions: MIGRATION_CHOICES.map((choice) => ({
      choice,
      label: MIGRATION_CHOICE_LABELS[choice],
      chosen: subject.migrationChoice === choice,
    })),
    actions,
    reviews: reviews.map((review): ReviewRow => {
      const elsewhere = addressedByOthers.get(review.reviewerId)
      return {
        reviewerId: review.reviewerId,
        reviewerName: review.reviewerName,
        approved: review.approval !== null,
        holdsPublication:
          review.objection !== null && review.objection.addressedAt === null,
        standing: standingOf(review, elsewhere, nameOf),
        note: review.objection?.note ?? null,
      }
    }),
    findings,
    // Only the ones that look like oversights (§8.8). A church that decided it
    // needs no escalation rule and said so is not nagged about it.
    absences: unexplainedAbsences(draft),
    history: transitionRows.map((row): PathwayHistoryEntry => ({
      id: row.id,
      label: ACTION_LABELS[row.action],
      fromLabel: describeState(row.fromState),
      toLabel: describeState(row.toState),
      actorName: nameOf(row.actorId),
      when: DATE_TIME.format(row.occurredAt),
      detail: row.detail,
    })),
  }
}

/**
 * What a reviewer's position actually is, said in full.
 *
 * Four distinct outcomes, and the third is the one §4 exists for: an objection
 * that somebody else marked addressed, by a reviewer who never approved. It is
 * not "approved", and it is not "still holding" either.
 */
function standingOf(
  review: Review,
  addressedByOther: { addressedById: string } | undefined,
  nameOf: (id: string) => string
): string {
  if (review.objection && review.objection.addressedAt === null) {
    return 'Requested changes, not yet addressed'
  }
  if (addressedByOther) {
    const who = nameOf(addressedByOther.addressedById)
    return review.approval
      ? `Objection addressed by ${who}, and later approved`
      : `Objection marked addressed by ${who} — not an approval`
  }
  if (review.approval) return `Approved ${DATE.format(review.approval.at)}`
  return 'Has not replied'
}

function liveNote({
  active,
  isWorkingVersion,
  state,
}: {
  active: PathwayRow | null
  isWorkingVersion: boolean
  state: PathwayState
}): string {
  if (!active) {
    return 'Nothing is live yet. Nobody is being received by this pathway until a version is published.'
  }
  if (!isWorkingVersion) {
    return `Version ${active.versionNumber} is what the church is running. Editing a stage opens a new draft; it does not change this.`
  }
  return `The church is still running version ${active.versionNumber}. This work exists only as ${describeState(state)}.`
}

/** Everyone the church would have to make a decision about on a publish. */
async function countPeopleInFlight(churchId: string): Promise<number> {
  const rows = await db
    .select({ id: schema.people.id })
    .from(schema.people)
    .where(
      and(
        eq(schema.people.churchId, churchId),
        eq(schema.people.isMember, false)
      )
    )
  return rows.length
}

/** Names for a set of person ids, resolved once. Ids fall back to themselves. */
async function namesFor(
  ids: readonly string[]
): Promise<(id: string) => string> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return (id) => id
  const rows = await db
    .select({
      id: schema.people.id,
      firstName: schema.people.firstName,
      lastName: schema.people.lastName,
    })
    .from(schema.people)
    .where(inArray(schema.people.id, unique))
  const byId = new Map(
    rows.map((row) => [row.id, `${row.firstName} ${row.lastName}`])
  )
  return (id) => byId.get(id) ?? id
}

/* ──────────────────────────── Version history ──────────────────────────── */

export type VersionRow = {
  versionNumber: number
  stateLabel: string
  isLive: boolean
  publishedOn: string | null
  publishedByName: string | null
  approvedByNames: readonly string[]
  /** §4: recorded separately, because it is not an approval. */
  addressedNotApproved: readonly string[]
  migrationLabel: string | null
  stageCountLabel: string
}

/**
 * Every version this church has had, newest first.
 *
 * The permanent record §4 describes. `approvedByNames` comes from `approvedBy`,
 * which counts only real approvals — the reason this list and
 * `addressedNotApproved` are separate columns rather than one status.
 */
export async function getPathwayVersions(): Promise<VersionRow[]> {
  const viewer = await getViewer()

  const rows = await db
    .select()
    .from(schema.pathways)
    .where(eq(schema.pathways.churchId, viewer.churchId))
    .orderBy(desc(schema.pathways.versionNumber))

  if (rows.length === 0) return []

  const ids = rows.map((row) => row.id)
  const [stageRows, reviewRows] = await Promise.all([
    stagesFor(ids),
    db
      .select()
      .from(schema.pathwayReviews)
      .where(inArray(schema.pathwayReviews.pathwayId, ids)),
  ])

  const nameOf = await namesFor([
    ...reviewRows.map((row) => row.reviewerId),
    ...rows.flatMap((row) => (row.publishedById ? [row.publishedById] : [])),
  ])

  return rows.map((row): VersionRow => {
    const reviews = toReviews(
      reviewRows.filter((review) => review.pathwayId === row.id),
      nameOf
    )
    const stageCount = stageRows.filter(
      (stage) => stage.pathwayId === row.id
    ).length
    return {
      versionNumber: row.versionNumber,
      stateLabel: describeState(row.state),
      isLive: row.state === 'active',
      publishedOn: row.publishedAt ? DATE.format(row.publishedAt) : null,
      publishedByName: row.publishedById ? nameOf(row.publishedById) : null,
      approvedByNames: approvalsOn(reviews),
      addressedNotApproved: objectionsAddressedByOthers(reviews)
        .filter((entry) => !entry.alsoApproved)
        .map((entry) => entry.reviewerName),
      migrationLabel: row.migrationChoice
        ? MIGRATION_CHOICE_LABELS[row.migrationChoice]
        : null,
      stageCountLabel: `${stageCount} ${stageCount === 1 ? 'stage' : 'stages'}`,
    }
  })
}

function approvalsOn(reviews: readonly Review[]): string[] {
  return reviews
    .filter((review) => review.approval !== null)
    .map((review) => review.reviewerName)
}
