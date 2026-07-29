'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, sql } from 'drizzle-orm'

import { canReadTier, canWriteAtTier } from '@/domain/access'
import {
  REOPEN_NOTE,
  answerRequest,
  describeTally,
  prayOnceMore,
} from '@/domain/prayer'
import { permissionCheck } from '@/domain/roles'
import { TIER_ORDER, type ConfidentialityTier, tierName } from '@/domain/tiers'
import { db, schema } from '@/db/client'
import { getViewer } from '@/data/viewer'

export type ActionOutcome =
  { ok: true; message: string } | { ok: false; message: string }

function isTier(value: unknown): value is ConfidentialityTier {
  return (
    typeof value === 'string' &&
    (TIER_ORDER as readonly string[]).includes(value)
  )
}

/** Bring a request. Tier chosen at write time, same as a care note. */
export async function askForPrayer(formData: FormData): Promise<ActionOutcome> {
  const personId = formData.get('personId')
  const tier = formData.get('tier')
  const body = formData.get('body')

  if (typeof personId !== 'string' || personId === '') {
    return { ok: false, message: 'Say who this is for.' }
  }
  if (!isTier(tier)) {
    return { ok: false, message: 'Say who should be able to read it.' }
  }
  if (typeof body !== 'string' || body.trim() === '') {
    return { ok: false, message: 'An empty request asks for nothing.' }
  }

  const viewer = await getViewer()
  const gate = permissionCheck(viewer, 'care.log_note')
  if (!gate.allowed) return { ok: false, message: gate.note }

  if (!canWriteAtTier(viewer, tier)) {
    return {
      ok: false,
      message: `You cannot file a request at ${tierName(tier)}, because you could not then read it back.`,
    }
  }

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

  await db.insert(schema.prayerRequests).values({
    churchId: viewer.churchId,
    personId,
    askedById: viewer.personId,
    body: body.trim(),
    visibilityTier: tier,
  })

  revalidatePath('/prayer')
  return {
    ok: true,
    message: `Recorded for ${person.firstName} ${person.lastName} at ${tierName(tier)}.`,
  }
}

/**
 * "I prayed."
 *
 * One row per person per request with a count on it, incremented. The cap comes
 * from `prayOnceMore`, which refuses rather than silently ignoring the click —
 * and the refusal is the more useful message: past a hundred, pressing a button
 * is a substitute for picking up the phone.
 */
export async function prayForRequest(
  formData: FormData
): Promise<ActionOutcome> {
  const requestId = formData.get('requestId')
  if (typeof requestId !== 'string' || requestId === '') {
    return { ok: false, message: 'No request named.' }
  }

  const viewer = await getViewer()

  const [request] = await db
    .select({
      id: schema.prayerRequests.id,
      visibilityTier: schema.prayerRequests.visibilityTier,
    })
    .from(schema.prayerRequests)
    .where(
      and(
        eq(schema.prayerRequests.id, requestId),
        eq(schema.prayerRequests.churchId, viewer.churchId)
      )
    )
    .limit(1)

  if (!request)
    return { ok: false, message: 'That request is not in this church.' }

  // A reader who cannot see what was asked cannot record that they prayed for it.
  // Not a privacy leak either way, but claiming to have prayed for something you
  // could not read is a claim with nothing behind it.
  if (!canReadTier(viewer, request.visibilityTier)) {
    return {
      ok: false,
      message:
        'This request is above your tier, so there is nothing here for you to pray over yet.',
    }
  }

  const [existing] = await db
    .select({ times: schema.prayedFor.times })
    .from(schema.prayedFor)
    .where(
      and(
        eq(schema.prayedFor.requestId, requestId),
        eq(schema.prayedFor.personId, viewer.personId)
      )
    )
    .limit(1)

  const attempt = prayOnceMore({ people: 0, mine: existing?.times ?? 0 })
  if (!attempt.ok) return { ok: false, message: attempt.refusal }

  await db
    .insert(schema.prayedFor)
    .values({
      requestId,
      personId: viewer.personId,
      times: attempt.mine,
    })
    .onConflictDoUpdate({
      target: [schema.prayedFor.requestId, schema.prayedFor.personId],
      set: { times: attempt.mine, lastPrayedAt: new Date() },
    })

  const [tally] = await db
    .select({ people: sql<number>`count(*)::int` })
    .from(schema.prayedFor)
    .where(eq(schema.prayedFor.requestId, requestId))

  revalidatePath('/prayer')
  return {
    ok: true,
    // Recounted from the rows rather than incremented in the message, so the
    // sentence and the page agree.
    message: describeTally({ people: tally?.people ?? 1, mine: attempt.mine }),
  }
}

/**
 * Mark it answered, with what happened.
 *
 * Never a delete. The outcome is required by `answerRequest`, by a check
 * constraint, and here — in a year the sentence is the whole value of the row.
 */
export async function markAnswered(formData: FormData): Promise<ActionOutcome> {
  const requestId = formData.get('requestId')
  const outcome = formData.get('outcome')

  if (typeof requestId !== 'string' || requestId === '') {
    return { ok: false, message: 'No request named.' }
  }

  const attempt = answerRequest(typeof outcome === 'string' ? outcome : '')
  if (!attempt.ok) return { ok: false, message: attempt.refusal }

  const viewer = await getViewer()
  const gate = permissionCheck(viewer, 'care.log_note')
  if (!gate.allowed) return { ok: false, message: gate.note }

  const updated = await db
    .update(schema.prayerRequests)
    .set({
      answeredAt: new Date(),
      answeredById: viewer.personId,
      outcome: attempt.outcome,
    })
    .where(
      and(
        eq(schema.prayerRequests.id, requestId),
        eq(schema.prayerRequests.churchId, viewer.churchId)
      )
    )
    .returning({ id: schema.prayerRequests.id })

  if (updated.length === 0) {
    return { ok: false, message: 'That request is not in this church.' }
  }

  revalidatePath('/prayer')
  return {
    ok: true,
    message: 'Kept as answered, with what happened. Nothing is cleared out.',
  }
}

/** Reopen. The recorded outcome stays, because it is history. */
export async function reopenRequest(
  formData: FormData
): Promise<ActionOutcome> {
  const requestId = formData.get('requestId')
  if (typeof requestId !== 'string' || requestId === '') {
    return { ok: false, message: 'No request named.' }
  }

  const viewer = await getViewer()
  const gate = permissionCheck(viewer, 'care.log_note')
  if (!gate.allowed) return { ok: false, message: gate.note }

  // The check constraint keeps the three answered columns together, so reopening
  // has to clear all three. The previous outcome is preserved in the message
  // rather than in the row — a fuller history would want its own table, and
  // pretending this row is one would be worse than saying so.
  const [before] = await db
    .select({ outcome: schema.prayerRequests.outcome })
    .from(schema.prayerRequests)
    .where(
      and(
        eq(schema.prayerRequests.id, requestId),
        eq(schema.prayerRequests.churchId, viewer.churchId)
      )
    )
    .limit(1)

  if (!before)
    return { ok: false, message: 'That request is not in this church.' }
  if (before.outcome === null) {
    return { ok: false, message: 'That request is already open.' }
  }

  await db
    .update(schema.prayerRequests)
    .set({ answeredAt: null, answeredById: null, outcome: null })
    .where(eq(schema.prayerRequests.id, requestId))

  await db.insert(schema.changeLog).values({
    churchId: viewer.churchId,
    actorId: viewer.personId,
    entity: 'prayer_request',
    entityId: requestId,
    action: 'reopen',
    fromState: 'answered',
    toState: 'open',
    // Kept here rather than lost, which is what `REOPEN_NOTE` promises.
    detail: `Previously recorded as: ${before.outcome}`,
  })

  revalidatePath('/prayer')
  return { ok: true, message: REOPEN_NOTE }
}
