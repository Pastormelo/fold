'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'

import { canWriteAtTier } from '@/domain/access'
import { permissionCheck } from '@/domain/roles'
import { TIER_ORDER, type ConfidentialityTier, tierName } from '@/domain/tiers'
import { db, schema } from '@/db/client'
import { getWriter } from '@/data/viewer'

/**
 * Logging care.
 *
 * The tier is set here, at write time, and there is no path anywhere in this
 * codebase that changes it afterwards — §3 rule 1. That is why the form asks for
 * it explicitly rather than defaulting: a note filed at the wrong tier cannot be
 * quietly moved later, so the choice has to be made while the writer still has
 * the situation in mind.
 *
 * A writer cannot file above their own clearance. Doing so would create a record
 * they could not then read, and §3 rule 6 says the person the note is about knows
 * what is written about them — a note nobody present can read fails both.
 */

export type ActionOutcome =
  { ok: true; message: string } | { ok: false; message: string }

function isTier(value: unknown): value is ConfidentialityTier {
  return (
    typeof value === 'string' &&
    (TIER_ORDER as readonly string[]).includes(value)
  )
}

export async function logCareNote(formData: FormData): Promise<ActionOutcome> {
  const personId = formData.get('personId')
  const tier = formData.get('tier')
  const body = formData.get('body')

  if (typeof personId !== 'string' || personId === '') {
    return { ok: false, message: 'Say who this is about.' }
  }
  if (!isTier(tier)) {
    return {
      ok: false,
      message:
        'Say which tier this is written at. It is fixed once saved, so there is no sensible default.',
    }
  }
  if (typeof body !== 'string' || body.trim() === '') {
    return { ok: false, message: 'An empty note records nothing.' }
  }

  const viewer = await getWriter()

  const gate = permissionCheck(viewer, 'care.log_note')
  if (!gate.allowed) return { ok: false, message: gate.note }

  if (!canWriteAtTier(viewer, tier)) {
    return {
      ok: false,
      message: `You cannot file a note at ${tierName(tier)}, because you could not then read it back.`,
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

  if (!person) {
    return { ok: false, message: 'That person is not in this church.' }
  }

  await db.insert(schema.careNotes).values({
    churchId: viewer.churchId,
    personId,
    authorId: viewer.personId,
    visibilityTier: tier,
    body: body.trim(),
    // Deliberately not set: a restoration note is filed from the case, where the
    // two carrying elders are named. Nothing here can attach a note to a case.
  })

  revalidatePath('/notes')
  revalidatePath(`/people/${personId}`)

  return {
    ok: true,
    message: `Logged against ${person.firstName} ${person.lastName} at ${tierName(tier)}. The tier is now fixed.`,
  }
}
