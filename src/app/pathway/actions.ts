'use server'

import { revalidatePath } from 'next/cache'
import { and, desc, eq, inArray, ne } from 'drizzle-orm'

import {
  type MigrationChoice,
  type PathwayAction,
  MIGRATION_CHOICES,
  PATHWAY_ACTIONS,
  attemptTransition,
} from '@/domain/pathway'
import { permissionCheck } from '@/domain/roles'
import { db, schema } from '@/db/client'
import { getPathwayOverview } from '@/data/pathway'
import { getViewer } from '@/data/viewer'

/**
 * Changing the pathway.
 *
 * Every action here re-resolves the viewer and re-evaluates the gate on the
 * server. The buttons on the page are rendered from `availableActions`, which is
 * the same evaluation — but a Server Action is a POST endpoint anyone can reach,
 * so render-time gating is a courtesy to the user and not a control. The check
 * that matters is the one below.
 *
 * The state itself is never set from a form value. The form names an *action*,
 * `attemptTransition` decides what state that leads to, and a refusal comes back
 * as a message rather than a thrown error, because "you may not do this" is
 * information the person asking should see.
 */

export type ActionOutcome =
  { ok: true; message: string } | { ok: false; message: string }

function isPathwayAction(value: unknown): value is PathwayAction {
  return (
    typeof value === 'string' &&
    (PATHWAY_ACTIONS as readonly string[]).includes(value)
  )
}

function isMigrationChoice(value: unknown): value is MigrationChoice {
  return (
    typeof value === 'string' &&
    (MIGRATION_CHOICES as readonly string[]).includes(value)
  )
}

/* ─────────────────────────── Starting a pathway ─────────────────────────── */

/**
 * Create version 1 as a draft, with one empty stage to edit.
 *
 * Deliberately empty. §2 has no default stage count and the handoff is explicit
 * that a four-step pathway is One Family Church's, not a standard — seeding
 * "Visit, Class, Membership, Serving" would ship one church's polity to every
 * other one as though it were the product.
 */
export async function beginPathway(): Promise<ActionOutcome> {
  const viewer = await getViewer()

  const gate = permissionCheck(viewer, 'pathway.edit')
  if (!gate.allowed) return { ok: false, message: gate.note }

  const existing = await db
    .select({ id: schema.pathways.id })
    .from(schema.pathways)
    .where(eq(schema.pathways.churchId, viewer.churchId))
    .limit(1)
  if (existing.length > 0) {
    return {
      ok: false,
      message:
        'This church already has a pathway. Edit a stage to open a draft.',
    }
  }

  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(schema.pathways)
      .values({
        churchId: viewer.churchId,
        versionNumber: 1,
        state: 'draft',
      })
      .returning()

    await tx.insert(schema.pathwayStages).values({
      pathwayId: created!.id,
      position: 0,
      name: 'First stage',
      subtitle: 'Say what this stage is for',
    })

    // The draft was created, so `begin_draft` is the transition that happened,
    // and it belongs in the history like any other.
    await tx.insert(schema.pathwayTransitions).values({
      pathwayId: created!.id,
      action: 'begin_draft',
      fromState: 'discovery',
      toState: 'draft',
      actorId: viewer.personId,
      detail: 'Pathway started',
    })
  })

  revalidatePath('/pathway')
  return { ok: true, message: 'Draft started at version 1.' }
}

/* ──────────────────────────── State transitions ──────────────────────────── */

export async function takePathwayAction(
  formData: FormData
): Promise<ActionOutcome> {
  const requested = formData.get('action')
  if (!isPathwayAction(requested)) {
    return { ok: false, message: 'Unknown action.' }
  }
  const detail = formData.get('detail')
  const note =
    typeof detail === 'string' && detail.trim() !== '' ? detail.trim() : null

  const viewer = await getViewer()

  // Read the same overview the page read, so the gate the action evaluates is
  // computed from the same rows the buttons were rendered from rather than from
  // whatever the form claims.
  const overview = await getPathwayOverview()
  if (overview.kind !== 'pathway') {
    return { ok: false, message: 'There is no pathway to act on yet.' }
  }

  const [active] = await db
    .select({
      id: schema.pathways.id,
      versionNumber: schema.pathways.versionNumber,
    })
    .from(schema.pathways)
    .where(
      and(
        eq(schema.pathways.churchId, viewer.churchId),
        eq(schema.pathways.state, 'active')
      )
    )
    .limit(1)

  const result = attemptTransition(viewer, requested, {
    versionId: overview.versionId,
    currentState: overview.state,
    at: new Date(),
    detail: note,
    ...(overview.readiness
      ? { publishBlockers: overview.readiness.blockers }
      : {}),
    activeVersionId: active?.id ?? null,
  })

  if (!result.ok) return { ok: false, message: result.refusal.message }

  // `edit_stage` is the one action whose persistence is not "change this row's
  // state". Putting the live version into `draft` would take the church's
  // pathway offline the moment somebody opened it to fix a typo, so editing a
  // published version copies it to a new version at the next number and the
  // transition is recorded against the copy. The active version is untouched.
  if (requested === 'edit_stage') {
    const newVersion = await forkForEditing(
      overview.versionId,
      viewer.churchId,
      {
        actorId: viewer.personId,
        detail: note,
      }
    )
    revalidatePath('/pathway')
    return {
      ok: true,
      message: `Version ${newVersion} opened as a draft. Version ${active?.versionNumber ?? overview.versionNumber} is still live.`,
    }
  }

  await db.transaction(async (tx) => {
    // Archive first. The one-active-per-church unique index means the order
    // matters — activating before archiving would collide.
    if (result.archives.length > 0) {
      await tx
        .update(schema.pathways)
        .set({ state: 'archived' })
        .where(inArray(schema.pathways.id, [...result.archives]))
    }

    await tx
      .update(schema.pathways)
      .set({
        state: result.record.to,
        ...(requested === 'publish'
          ? {
              publishedAt: result.record.occurredAt,
              publishedById: viewer.personId,
            }
          : {}),
      })
      .where(eq(schema.pathways.id, overview.versionId))

    await tx.insert(schema.pathwayTransitions).values({
      pathwayId: overview.versionId,
      action: result.record.action,
      fromState: result.record.from,
      toState: result.record.to,
      actorId: result.record.actorId,
      occurredAt: result.record.occurredAt,
      detail: result.record.detail,
    })
  })

  revalidatePath('/pathway')

  // §8.5: say what happened, not that something happened. The publish case
  // names the consequence, because archiving the previous version is the part
  // nobody chose and everybody needs to know about.
  if (requested === 'publish') {
    const displaced = active
      ? ` Version ${active.versionNumber} is now archived.`
      : ''
    return {
      ok: true,
      message: `Version ${overview.versionNumber} is live.${displaced}`,
    }
  }
  return {
    ok: true,
    message: `Version ${overview.versionNumber} is now ${result.record.to.replace(/_/g, ' ')}.`,
  }
}

/**
 * Copy a version into a new draft at the next version number.
 *
 * Stages are copied with fresh ids, which is what makes the diff meaningful: the
 * new draft's stages are paired to the published ones by position rather than by
 * id, so the first edit reads as a change to that stage.
 */
async function forkForEditing(
  sourceId: string,
  churchId: string,
  transition: { actorId: string; detail: string | null }
): Promise<number> {
  return db.transaction(async (tx) => {
    const [source] = await tx
      .select()
      .from(schema.pathways)
      .where(eq(schema.pathways.id, sourceId))
      .limit(1)
    if (!source) throw new Error('The version being edited no longer exists.')

    const [highest] = await tx
      .select({ versionNumber: schema.pathways.versionNumber })
      .from(schema.pathways)
      .where(eq(schema.pathways.churchId, churchId))
      .orderBy(desc(schema.pathways.versionNumber))
      .limit(1)

    const versionNumber = (highest?.versionNumber ?? 0) + 1

    const [draft] = await tx
      .insert(schema.pathways)
      .values({
        churchId,
        versionNumber,
        state: 'draft',
        internalName: source.internalName,
        publicName: source.publicName,
        philosophy: source.philosophy,
        discipleDefinition: source.discipleDefinition,
        // Not carried over. §4 requires the choice to be made for *this*
        // publish; inheriting it would silently reuse a decision about people
        // who are no longer the same people.
        migrationChoice: null,
      })
      .returning()

    const stages = await tx
      .select()
      .from(schema.pathwayStages)
      .where(eq(schema.pathwayStages.pathwayId, sourceId))

    if (stages.length > 0) {
      await tx.insert(schema.pathwayStages).values(
        stages.map((stage) => ({
          pathwayId: draft!.id,
          position: stage.position,
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
        }))
      )
    }

    await tx.insert(schema.pathwayTransitions).values({
      pathwayId: draft!.id,
      action: 'edit_stage',
      fromState: source.state,
      toState: 'draft',
      actorId: transition.actorId,
      detail:
        transition.detail ??
        `Copied from version ${source.versionNumber} for editing`,
    })

    return versionNumber
  })
}

/* ──────────────────────────── Editing a stage ──────────────────────────── */

const EDITABLE_TEXT_FIELDS = [
  'name',
  'publicName',
  'subtitle',
  'purpose',
  'outcome',
  'entryCondition',
  'ownerRole',
  'completionCondition',
  'stoppingRule',
  'reactivationRule',
  'escalationRule',
] as const

export async function saveStage(formData: FormData): Promise<ActionOutcome> {
  const stageId = formData.get('stageId')
  if (typeof stageId !== 'string' || stageId === '') {
    return { ok: false, message: 'No stage named.' }
  }

  const viewer = await getViewer()
  const gate = permissionCheck(viewer, 'pathway.edit')
  if (!gate.allowed) return { ok: false, message: gate.note }

  // The stage has to belong to a version of *this* church, and to a version
  // that is not live. Editing the active version in place is the thing
  // `edit_stage` exists to avoid.
  const [stage] = await db
    .select({
      id: schema.pathwayStages.id,
      state: schema.pathways.state,
      churchId: schema.pathways.churchId,
    })
    .from(schema.pathwayStages)
    .innerJoin(
      schema.pathways,
      eq(schema.pathwayStages.pathwayId, schema.pathways.id)
    )
    .where(eq(schema.pathwayStages.id, stageId))
    .limit(1)

  if (!stage || stage.churchId !== viewer.churchId) {
    return {
      ok: false,
      message: 'That stage is not part of this church’s pathway.',
    }
  }
  if (stage.state === 'active' || stage.state === 'archived') {
    return {
      ok: false,
      message:
        'This version is published. Use “Edit a stage” to open a draft copy; the live pathway is not edited in place.',
    }
  }

  const update: Record<string, string | string[]> = {}
  for (const field of EDITABLE_TEXT_FIELDS) {
    const value = formData.get(field)
    if (typeof value === 'string') update[field] = value.trim()
  }
  // Multi-line textareas, one entry per line. Blank lines dropped rather than
  // stored as empty required actions.
  for (const field of [
    'requiredActions',
    'optionalActions',
    'milestones',
  ] as const) {
    const value = formData.get(field)
    if (typeof value === 'string') {
      update[field] = value
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '')
    }
  }
  // §8.8: which empty fields are deliberate. Checkboxes, so an unchecked box
  // must clear the entry — which means the field is always written, never
  // merged.
  update.intentionallyAbsent = formData
    .getAll('intentionallyAbsent')
    .filter((value): value is string => typeof value === 'string')

  if (Object.keys(update).length === 0) {
    return { ok: false, message: 'Nothing was sent to change.' }
  }

  await db
    .update(schema.pathwayStages)
    .set(update)
    .where(eq(schema.pathwayStages.id, stageId))

  revalidatePath('/pathway')
  return { ok: true, message: 'Stage saved.' }
}

/* ─────────────────────────── The migration choice ─────────────────────────── */

/**
 * Record what happens to people already in the pathway.
 *
 * There is no "clear the choice" path and no default. §4: never migrate existing
 * participants automatically. The absence of a choice is what blocks publishing,
 * and it is meant to be uncomfortable.
 */
export async function chooseMigration(
  formData: FormData
): Promise<ActionOutcome> {
  const choice = formData.get('choice')
  if (!isMigrationChoice(choice)) {
    return { ok: false, message: 'That is not one of the four options.' }
  }

  const viewer = await getViewer()
  const gate = permissionCheck(viewer, 'pathway.publish')
  if (!gate.allowed) return { ok: false, message: gate.note }

  const [working] = await db
    .select({
      id: schema.pathways.id,
      migrationChoice: schema.pathways.migrationChoice,
    })
    .from(schema.pathways)
    .where(
      and(
        eq(schema.pathways.churchId, viewer.churchId),
        ne(schema.pathways.state, 'active'),
        ne(schema.pathways.state, 'archived')
      )
    )
    .orderBy(desc(schema.pathways.versionNumber))
    .limit(1)

  if (!working) {
    return {
      ok: false,
      message: 'There is no draft to publish, so nothing to decide yet.',
    }
  }
  if (working.migrationChoice === choice) {
    // §8.5 again: nothing changed, so do not report a change.
    return { ok: false, message: 'That is already the recorded choice.' }
  }

  await db
    .update(schema.pathways)
    .set({ migrationChoice: choice })
    .where(eq(schema.pathways.id, working.id))

  revalidatePath('/pathway')
  return { ok: true, message: 'Recorded.' }
}

/* ────────────────────────── Reviews and findings ────────────────────────── */

/** Approve, or request changes. One reviewer, one row, either way. */
export async function recordReview(formData: FormData): Promise<ActionOutcome> {
  const position = formData.get('position')
  const note = formData.get('note')

  const viewer = await getViewer()

  const gate = permissionCheck(
    viewer,
    position === 'approve' ? 'pathway.approve' : 'pathway.request_changes'
  )
  if (!gate.allowed) return { ok: false, message: gate.note }

  const overview = await getPathwayOverview()
  if (overview.kind !== 'pathway' || !overview.isWorkingVersion) {
    return { ok: false, message: 'There is no version under review.' }
  }

  if (position === 'approve') {
    await db
      .insert(schema.pathwayReviews)
      .values({
        pathwayId: overview.versionId,
        reviewerId: viewer.personId,
        approvedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          schema.pathwayReviews.pathwayId,
          schema.pathwayReviews.reviewerId,
        ],
        set: { approvedAt: new Date() },
      })
    revalidatePath('/pathway')
    return { ok: true, message: 'Your approval is on the record.' }
  }

  if (position !== 'request_changes') {
    return {
      ok: false,
      message: 'Say whether you are approving or requesting changes.',
    }
  }
  if (typeof note !== 'string' || note.trim() === '') {
    // An objection with no note gives the designer nothing to act on, and the
    // schema refuses the row anyway.
    return {
      ok: false,
      message: 'Requesting changes needs a note saying what to change.',
    }
  }

  await db
    .insert(schema.pathwayReviews)
    .values({
      pathwayId: overview.versionId,
      reviewerId: viewer.personId,
      objectionRaisedAt: new Date(),
      objectionNote: note.trim(),
    })
    .onConflictDoUpdate({
      target: [
        schema.pathwayReviews.pathwayId,
        schema.pathwayReviews.reviewerId,
      ],
      set: {
        objectionRaisedAt: new Date(),
        objectionNote: note.trim(),
        // A fresh objection is not addressed. Clearing these is the point:
        // otherwise a previously-resolved objection would re-open as already
        // handled.
        objectionAddressedAt: null,
        objectionAddressedById: null,
      },
    })

  revalidatePath('/pathway')
  return {
    ok: true,
    message:
      'Recorded. This version cannot be published until it is addressed.',
  }
}

/**
 * Mark somebody's objection addressed.
 *
 * Recorded as "addressed by", never as an approval — §4, and the reason
 * `pathway_reviews` keeps the two in separate columns. The reviewer may still
 * disagree, and the version record will show who resolved it on their behalf.
 */
export async function addressObjection(
  formData: FormData
): Promise<ActionOutcome> {
  const reviewerId = formData.get('reviewerId')
  if (typeof reviewerId !== 'string' || reviewerId === '') {
    return { ok: false, message: 'No reviewer named.' }
  }

  const viewer = await getViewer()
  const gate = permissionCheck(viewer, 'pathway.edit')
  if (!gate.allowed) return { ok: false, message: gate.note }

  const overview = await getPathwayOverview()
  if (overview.kind !== 'pathway') {
    return { ok: false, message: 'There is no version under review.' }
  }

  const updated = await db
    .update(schema.pathwayReviews)
    .set({
      objectionAddressedAt: new Date(),
      objectionAddressedById: viewer.personId,
    })
    .where(
      and(
        eq(schema.pathwayReviews.pathwayId, overview.versionId),
        eq(schema.pathwayReviews.reviewerId, reviewerId)
      )
    )
    .returning({ id: schema.pathwayReviews.id })

  if (updated.length === 0) {
    return {
      ok: false,
      message: 'There is no objection from that reviewer to address.',
    }
  }

  revalidatePath('/pathway')
  return {
    ok: true,
    message:
      'Marked addressed, and recorded as addressed by you. It does not count as their approval.',
  }
}

/**
 * Publish past a blocking finding, on the record, with a reason.
 *
 * §4 allows this and requires the reason. Both columns or neither — a dismissal
 * without a reason is refused by the schema as well as here, because in a year
 * the only thing left of this decision will be the sentence somebody typed.
 */
export async function acknowledgeFinding(
  formData: FormData
): Promise<ActionOutcome> {
  const findingId = formData.get('findingId')
  const reason = formData.get('reason')

  if (typeof findingId !== 'string' || findingId === '') {
    return { ok: false, message: 'No finding named.' }
  }
  if (typeof reason !== 'string' || reason.trim() === '') {
    return {
      ok: false,
      message:
        'Publishing past a finding needs a reason. It goes on the version record.',
    }
  }

  const viewer = await getViewer()
  const gate = permissionCheck(viewer, 'pathway.publish')
  if (!gate.allowed) return { ok: false, message: gate.note }

  const overview = await getPathwayOverview()
  if (overview.kind !== 'pathway') {
    return {
      ok: false,
      message: 'There is no version to acknowledge a finding on.',
    }
  }

  const updated = await db
    .update(schema.pathwayHealthFindings)
    .set({ dismissedById: viewer.personId, dismissalReason: reason.trim() })
    .where(
      and(
        eq(schema.pathwayHealthFindings.id, findingId),
        eq(schema.pathwayHealthFindings.pathwayId, overview.versionId)
      )
    )
    .returning({ id: schema.pathwayHealthFindings.id })

  if (updated.length === 0) {
    return { ok: false, message: 'That finding is not on this version.' }
  }

  // Recomputed rather than assumed: acknowledging one finding does not
  // necessarily clear the gate, and saying so would be a claim about data this
  // function did not look at (§8.2).
  const after = await getPathwayOverview()
  const remaining =
    after.kind === 'pathway' && after.readiness
      ? after.readiness.blockers.length
      : 0

  revalidatePath('/pathway')
  return {
    ok: true,
    message:
      remaining === 0
        ? 'Acknowledged with your reason. Nothing else is blocking publication.'
        : `Acknowledged with your reason. ${remaining} ${remaining === 1 ? 'thing' : 'things'} still ${remaining === 1 ? 'blocks' : 'block'} publication.`,
  }
}
