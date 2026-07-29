'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'

import {
  MILESTONE_LABELS,
  isMilestoneKind,
  recursAnnually,
} from '@/domain/milestones'
import { permissionCheck } from '@/domain/roles'
import { db, schema } from '@/db/client'
import { getViewer } from '@/data/viewer'

export type ActionOutcome =
  { ok: true; message: string } | { ok: false; message: string }

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

export async function recordMilestone(
  formData: FormData
): Promise<ActionOutcome> {
  const personId = formData.get('personId')
  const kind = formData.get('kind')
  const occurredOn = formData.get('occurredOn')
  const note = formData.get('note')

  if (typeof personId !== 'string' || personId === '') {
    return { ok: false, message: 'Say whose milestone this is.' }
  }
  if (!isMilestoneKind(kind)) {
    return { ok: false, message: 'Say what kind of milestone.' }
  }
  if (typeof occurredOn !== 'string' || !DATE_ONLY.test(occurredOn)) {
    return { ok: false, message: 'Give the date it happened, as a date.' }
  }
  // A loss with no note reads "3 years since their loss" instead of naming the
  // person who died, which is the whole point of marking the date.
  if (kind === 'loss' && (typeof note !== 'string' || note.trim() === '')) {
    return {
      ok: false,
      message:
        'Say who they lost. The reminder should be able to name them rather than saying "their loss".',
    }
  }

  const viewer = await getViewer()
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

  if (!person)
    return { ok: false, message: 'That person is not in this church.' }

  const inserted = await db
    .insert(schema.milestones)
    .values({
      churchId: viewer.churchId,
      personId,
      kind,
      occurredOn,
      note: typeof note === 'string' ? note.trim() : '',
      recordedById: viewer.personId,
    })
    // The unique index exists so the same date does not surface twice in a
    // reminder. Hitting it is not an error worth a stack trace.
    .onConflictDoNothing()
    .returning({ id: schema.milestones.id })

  if (inserted.length === 0) {
    return {
      ok: false,
      message: `That ${MILESTONE_LABELS[kind].toLowerCase()} is already recorded for ${person.firstName} ${person.lastName}.`,
    }
  }

  revalidatePath('/milestones')
  revalidatePath(`/people/${personId}`)

  return {
    ok: true,
    message: recursAnnually(kind)
      ? `Recorded. It will surface every year from the one date, rather than needing to be entered again.`
      : 'Recorded. This one does not recur, so it will surface once.',
  }
}

/**
 * Remove a milestone.
 *
 * Genuinely a delete rather than a stamp, because a wrong birthday is a mistake to
 * correct and not a fact worth preserving. The change log keeps the act.
 */
export async function removeMilestone(
  formData: FormData
): Promise<ActionOutcome> {
  const milestoneId = formData.get('milestoneId')
  if (typeof milestoneId !== 'string' || milestoneId === '') {
    return { ok: false, message: 'No milestone named.' }
  }

  const viewer = await getViewer()
  const gate = permissionCheck(viewer, 'care.log_note')
  if (!gate.allowed) return { ok: false, message: gate.note }

  const removed = await db
    .delete(schema.milestones)
    .where(
      and(
        eq(schema.milestones.id, milestoneId),
        eq(schema.milestones.churchId, viewer.churchId)
      )
    )
    .returning({
      personId: schema.milestones.personId,
      kind: schema.milestones.kind,
      occurredOn: schema.milestones.occurredOn,
    })

  const gone = removed[0]
  if (!gone)
    return { ok: false, message: 'That milestone is not in this church.' }

  await db.insert(schema.changeLog).values({
    churchId: viewer.churchId,
    actorId: viewer.personId,
    entity: 'milestone',
    entityId: gone.personId,
    action: 'remove',
    fromState: `${gone.kind} ${gone.occurredOn}`,
    toState: null,
    detail: `${MILESTONE_LABELS[gone.kind]} removed`,
  })

  revalidatePath('/milestones')
  return { ok: true, message: 'Removed.' }
}
