'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, isNull } from 'drizzle-orm'

import { permissionCheck } from '@/domain/roles'
import { db, schema } from '@/db/client'
import { getViewer } from '@/data/viewer'

/**
 * Moving a guest through the pathway.
 *
 * A placement points at a stage of a specific published version, so every write
 * here checks that the stage belongs to the church's *live* pathway. Placing
 * somebody into a stage of a draft would put them in a pathway nobody is running.
 *
 * Leaving a stage is recorded with a reason rather than deleted. Someone who
 * stopped coming and returned two years later is the case §4's reactivation rule
 * is about, and it needs the history to exist.
 */

export type ActionOutcome =
  { ok: true; message: string } | { ok: false; message: string }

/** The stage must be part of the version this church is actually running. */
async function liveStage(stageId: string, churchId: string) {
  const [row] = await db
    .select({
      id: schema.pathwayStages.id,
      name: schema.pathwayStages.name,
      state: schema.pathways.state,
      versionNumber: schema.pathways.versionNumber,
    })
    .from(schema.pathwayStages)
    .innerJoin(
      schema.pathways,
      eq(schema.pathways.id, schema.pathwayStages.pathwayId)
    )
    .where(
      and(
        eq(schema.pathwayStages.id, stageId),
        eq(schema.pathways.churchId, churchId)
      )
    )
    .limit(1)
  return row ?? null
}

export async function placeGuest(formData: FormData): Promise<ActionOutcome> {
  const personId = formData.get('personId')
  const stageId = formData.get('stageId')
  const connectorId = formData.get('connectorId')

  if (typeof personId !== 'string' || typeof stageId !== 'string') {
    return { ok: false, message: 'Say who, and which stage.' }
  }

  const viewer = await getViewer()
  const gate = permissionCheck(viewer, 'care.view_people')
  if (!gate.allowed) return { ok: false, message: gate.note }

  const stage = await liveStage(stageId, viewer.churchId)
  if (!stage) {
    return {
      ok: false,
      message: 'That stage is not part of this church’s pathway.',
    }
  }
  if (stage.state !== 'active') {
    return {
      ok: false,
      message: `Version ${stage.versionNumber} is not live, so nobody can be placed in it. Publish it first.`,
    }
  }

  const [person] = await db
    .select({
      id: schema.people.id,
      firstName: schema.people.firstName,
      lastName: schema.people.lastName,
      isMember: schema.people.isMember,
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
  if (person.isMember) {
    // §6 keeps the two lists apart. A member is in Family, and the pathway is how
    // somebody gets there rather than something they stay in afterwards.
    return {
      ok: false,
      message: `${person.firstName} ${person.lastName} is already a member, so the pathway is behind them.`,
    }
  }

  const connector =
    typeof connectorId === 'string' && connectorId !== '' ? connectorId : null

  // One live placement per person, enforced by a partial unique index too. Moving
  // stage closes the old placement rather than editing it, so the path a person
  // took through the pathway stays readable.
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        id: schema.pathwayPlacements.id,
        stageId: schema.pathwayPlacements.stageId,
      })
      .from(schema.pathwayPlacements)
      .where(
        and(
          eq(schema.pathwayPlacements.personId, personId),
          isNull(schema.pathwayPlacements.exitedAt)
        )
      )
      .limit(1)

    if (current) {
      await tx
        .update(schema.pathwayPlacements)
        .set({
          exitedAt: new Date(),
          exitReason:
            current.stageId === stageId
              ? 'Re-placed at the same stage'
              : 'Moved to another stage',
        })
        .where(eq(schema.pathwayPlacements.id, current.id))
    }

    await tx.insert(schema.pathwayPlacements).values({
      churchId: viewer.churchId,
      personId,
      stageId,
      connectorId: connector,
    })
  })

  revalidatePath('/guests')
  revalidatePath(`/people/${personId}`)

  return {
    ok: true,
    message: connector
      ? `${person.firstName} ${person.lastName} is at ${stage.name}, carried by somebody named.`
      : `${person.firstName} ${person.lastName} is at ${stage.name}, and nobody is carrying them yet.`,
  }
}

/**
 * Take somebody out of the pathway, with a reason.
 *
 * The reason is required. "Stopped coming" and "became a member" are the same
 * event to a delete and completely different facts to a church.
 */
export async function exitPathway(formData: FormData): Promise<ActionOutcome> {
  const personId = formData.get('personId')
  const reason = formData.get('reason')

  if (typeof personId !== 'string' || personId === '') {
    return { ok: false, message: 'Say who.' }
  }
  if (typeof reason !== 'string' || reason.trim() === '') {
    return {
      ok: false,
      message:
        'Say why they left the pathway. "Stopped coming" and "became a member" are the same event to a delete and different facts to a church.',
    }
  }

  const viewer = await getViewer()
  const gate = permissionCheck(viewer, 'care.view_people')
  if (!gate.allowed) return { ok: false, message: gate.note }

  const closed = await db
    .update(schema.pathwayPlacements)
    .set({ exitedAt: new Date(), exitReason: reason.trim() })
    .where(
      and(
        eq(schema.pathwayPlacements.personId, personId),
        eq(schema.pathwayPlacements.churchId, viewer.churchId),
        isNull(schema.pathwayPlacements.exitedAt)
      )
    )
    .returning({ id: schema.pathwayPlacements.id })

  if (closed.length === 0) {
    return { ok: false, message: 'They are not currently in the pathway.' }
  }

  revalidatePath('/guests')
  return {
    ok: true,
    message: 'Recorded, with the reason. The placement stays in the history.',
  }
}
