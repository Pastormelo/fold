'use server'

import { revalidatePath } from 'next/cache'
import { and, asc, eq, isNull } from 'drizzle-orm'

import { canReadTier } from '@/domain/access'
import {
  type JourneyInstance,
  type JourneyTemplate,
  canStartJourney,
  closeJourneyEarly,
  journeyProgress,
  recordStep,
} from '@/domain/journeys'
import { permissionCheck } from '@/domain/roles'
import { db, schema } from '@/db/client'
import { getWriter } from '@/data/viewer'

/**
 * Running a care journey.
 *
 * Until these existed nothing could start a journey or record a step, which meant
 * the overdue arithmetic had nothing to work on: the Journeys badge, the Overview's
 * overdue count, every row of Tasks and the "waiting on somebody" list in Reports
 * were all permanently empty. Journeys are how "nobody disappears quietly" stops
 * being a slogan, so this is the part that makes the premise run.
 *
 * The rules are in `@/domain/journeys` with tests — step ordering, the required
 * outcome, the required skip reason, no second copy of the same journey on one
 * person. What is here is the database work and the tier check: a journey carries
 * its template's tier, so somebody who cannot read the journey cannot record
 * against it either.
 */

export type ActionOutcome =
  { ok: true; message: string } | { ok: false; message: string }

/** Template and instance in the shapes the domain functions take. */
async function loadJourney(
  instanceId: string,
  churchId: string
): Promise<{ template: JourneyTemplate; instance: JourneyInstance } | null> {
  const [row] = await db
    .select({
      id: schema.journeyInstances.id,
      templateId: schema.journeyInstances.templateId,
      personId: schema.journeyInstances.personId,
      startedAt: schema.journeyInstances.startedAt,
      ownerId: schema.journeyInstances.ownerId,
      closedAt: schema.journeyInstances.closedAt,
      closedReason: schema.journeyInstances.closedReason,
      templateName: schema.journeyTemplates.name,
      trigger: schema.journeyTemplates.trigger,
      visibilityTier: schema.journeyTemplates.visibilityTier,
      isSystemDefault: schema.journeyTemplates.isSystemDefault,
    })
    .from(schema.journeyInstances)
    .innerJoin(
      schema.journeyTemplates,
      eq(schema.journeyTemplates.id, schema.journeyInstances.templateId)
    )
    .where(
      and(
        eq(schema.journeyInstances.id, instanceId),
        eq(schema.journeyInstances.churchId, churchId)
      )
    )
    .limit(1)

  if (!row) return null

  const [steps, completions] = await Promise.all([
    db
      .select()
      .from(schema.journeySteps)
      .where(eq(schema.journeySteps.templateId, row.templateId))
      .orderBy(asc(schema.journeySteps.position)),
    db
      .select()
      .from(schema.journeyStepCompletions)
      .where(eq(schema.journeyStepCompletions.instanceId, instanceId)),
  ])

  return {
    template: {
      id: row.templateId,
      name: row.templateName,
      trigger: row.trigger,
      visibilityTier: row.visibilityTier,
      isSystemDefault: row.isSystemDefault,
      steps: steps.map((step) => ({
        id: step.id,
        title: step.title,
        window: step.window,
        ownerRole: step.ownerRole,
        guidanceNote: step.guidanceNote,
      })),
    },
    instance: {
      id: row.id,
      templateId: row.templateId,
      personId: row.personId,
      startedAt: row.startedAt,
      ownerId: row.ownerId,
      ownerName: row.ownerId,
      closedAt: row.closedAt,
      closedReason: row.closedReason,
      completions: completions.map((completion) =>
        completion.kind === 'skipped'
          ? {
              stepId: completion.stepId,
              completedAt: completion.completedAt,
              byId: completion.byId,
              byName: completion.byId,
              kind: 'skipped' as const,
              skipReason: completion.skipReason ?? '',
            }
          : {
              stepId: completion.stepId,
              completedAt: completion.completedAt,
              byId: completion.byId,
              byName: completion.byId,
              kind: 'done' as const,
              outcome: completion.outcome ?? '',
            }
      ),
    },
  }
}

/* ────────────────────────── Starting a journey ────────────────────────── */

export async function startJourney(formData: FormData): Promise<ActionOutcome> {
  const personId = String(formData.get('personId') ?? '')
  const templateId = String(formData.get('templateId') ?? '')
  const ownerId = String(formData.get('ownerId') ?? '')

  if (personId === '' || templateId === '') {
    return { ok: false, message: 'Say who this is for, and which journey.' }
  }

  const viewer = await getWriter()
  const gate = permissionCheck(viewer, 'care.log_note')
  if (!gate.allowed) return { ok: false, message: gate.note }

  const [person] = await db
    .select({
      id: schema.people.id,
      firstName: schema.people.firstName,
      lastName: schema.people.lastName,
    })
    .from(schema.people)
    .where(
      and(
        eq(schema.people.id, personId),
        eq(schema.people.churchId, viewer.churchId)
      )
    )
    .limit(1)

  if (!person) {
    return { ok: false, message: 'That person is not in this church.' }
  }

  const [templateRow] = await db
    .select()
    .from(schema.journeyTemplates)
    .where(
      and(
        eq(schema.journeyTemplates.id, templateId),
        eq(schema.journeyTemplates.churchId, viewer.churchId)
      )
    )
    .limit(1)

  if (!templateRow) {
    return { ok: false, message: 'That journey is not in this church.' }
  }

  // A journey carries its template's tier. Starting one you could not then read
  // would file care you cannot follow up on.
  if (!canReadTier(viewer, templateRow.visibilityTier)) {
    return {
      ok: false,
      message: `${templateRow.name} is written at a tier above yours, so you could not read the journey you were starting.`,
    }
  }

  const steps = await db
    .select()
    .from(schema.journeySteps)
    .where(eq(schema.journeySteps.templateId, templateId))
    .orderBy(asc(schema.journeySteps.position))

  // Live means not closed and not finished. A finished journey is not a reason to
  // refuse a new one — grief recurs.
  const running = await db
    .select({
      id: schema.journeyInstances.id,
      templateId: schema.journeyInstances.templateId,
    })
    .from(schema.journeyInstances)
    .where(
      and(
        eq(schema.journeyInstances.personId, personId),
        isNull(schema.journeyInstances.closedAt)
      )
    )

  const liveTemplateIds: string[] = []
  for (const candidate of running) {
    const loaded = await loadJourney(candidate.id, viewer.churchId)
    if (!loaded) continue
    const progress = journeyProgress(
      loaded.template,
      loaded.instance,
      new Date()
    )
    if (!progress.isFinished) liveTemplateIds.push(candidate.templateId)
  }

  const attempt = canStartJourney({
    template: {
      id: templateRow.id,
      name: templateRow.name,
      trigger: templateRow.trigger,
      visibilityTier: templateRow.visibilityTier,
      isSystemDefault: templateRow.isSystemDefault,
      steps: steps.map((step) => ({
        id: step.id,
        title: step.title,
        window: step.window,
        ownerRole: step.ownerRole,
        guidanceNote: step.guidanceNote,
      })),
    },
    personName: `${person.firstName} ${person.lastName}`,
    liveTemplateIds,
  })
  if (!attempt.ok) return { ok: false, message: attempt.refusal }

  await db.insert(schema.journeyInstances).values({
    churchId: viewer.churchId,
    templateId,
    personId,
    // Whoever is named carries it. Defaults to the person starting it rather than
    // to nobody — an unowned journey is the thing this app exists to prevent.
    ownerId: ownerId === '' ? viewer.personId : ownerId,
  })

  revalidatePath('/journeys')
  revalidatePath('/tasks')
  revalidatePath(`/people/${personId}`)
  revalidatePath('/')

  return { ok: true, message: attempt.note }
}

/* ─────────────────────────── Recording a step ─────────────────────────── */

export async function recordJourneyStep(
  formData: FormData
): Promise<ActionOutcome> {
  const instanceId = String(formData.get('instanceId') ?? '')
  const stepId = String(formData.get('stepId') ?? '')
  const kind = formData.get('kind') === 'skipped' ? 'skipped' : 'done'
  const detail = String(formData.get('detail') ?? '')

  if (instanceId === '' || stepId === '') {
    return { ok: false, message: 'Say which step.' }
  }

  const viewer = await getWriter()
  const gate = permissionCheck(viewer, 'care.log_note')
  if (!gate.allowed) return { ok: false, message: gate.note }

  const loaded = await loadJourney(instanceId, viewer.churchId)
  if (!loaded) {
    return { ok: false, message: 'That journey is not in this church.' }
  }

  if (!canReadTier(viewer, loaded.template.visibilityTier)) {
    return {
      ok: false,
      message:
        'This journey is above your tier. You can see that care is happening, not record against it.',
    }
  }

  const attempt = recordStep({
    template: loaded.template,
    instance: loaded.instance,
    stepId,
    kind,
    detail,
  })
  if (!attempt.ok) return { ok: false, message: attempt.refusal }

  await db.insert(schema.journeyStepCompletions).values({
    instanceId,
    stepId: attempt.completion.stepId,
    byId: viewer.personId,
    kind: attempt.completion.kind,
    // Exactly one of these is set, from the union the domain returned. There is
    // no path that writes both.
    outcome:
      attempt.completion.kind === 'done' ? attempt.completion.outcome : null,
    skipReason:
      attempt.completion.kind === 'skipped'
        ? attempt.completion.skipReason
        : null,
  })

  revalidatePath('/journeys')
  revalidatePath('/tasks')
  revalidatePath('/reports')
  revalidatePath(`/people/${loaded.instance.personId}`)
  revalidatePath('/')

  return { ok: true, message: attempt.note }
}

/* ────────────────────────── Closing one early ────────────────────────── */

export async function closeJourney(formData: FormData): Promise<ActionOutcome> {
  const instanceId = String(formData.get('instanceId') ?? '')
  const reason = String(formData.get('reason') ?? '')

  if (instanceId === '') return { ok: false, message: 'Say which journey.' }

  const attempt = closeJourneyEarly(reason)
  if (!attempt.ok) return { ok: false, message: attempt.refusal }

  const viewer = await getWriter()
  const gate = permissionCheck(viewer, 'care.log_note')
  if (!gate.allowed) return { ok: false, message: gate.note }

  const loaded = await loadJourney(instanceId, viewer.churchId)
  if (!loaded) {
    return { ok: false, message: 'That journey is not in this church.' }
  }
  if (loaded.instance.closedAt !== null) {
    return { ok: false, message: 'That journey is already closed.' }
  }
  if (!canReadTier(viewer, loaded.template.visibilityTier)) {
    return {
      ok: false,
      message: 'This journey is above your tier, so it is not yours to close.',
    }
  }

  await db
    .update(schema.journeyInstances)
    .set({ closedAt: new Date(), closedReason: attempt.reason })
    .where(eq(schema.journeyInstances.id, instanceId))

  revalidatePath('/journeys')
  revalidatePath('/tasks')
  revalidatePath('/')

  return {
    ok: true,
    message: `Closed, with your reason on the record. It stops appearing as overdue.`,
  }
}
