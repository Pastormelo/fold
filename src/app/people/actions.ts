'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, isNull } from 'drizzle-orm'

import {
  assignToFold,
  draftFold,
  draftPerson,
  normalisePhone,
} from '@/domain/directory'
import { type Role, isRole, permissionCheck } from '@/domain/roles'
import { db, schema } from '@/db/client'
import { getWriter } from '@/data/viewer'

/**
 * Putting an actual church into Fold.
 *
 * Until these existed there was no way to create a person, a household or a fold
 * through the application at all — every screen assumed they were already there,
 * and the only routes in were the seed script and a Planning Center import that
 * is not built. So every list read empty and the product could not be used.
 *
 * The rules live in `@/domain/directory` with tests. What is here is the part that
 * needs the database: checking the person is in this church, looking up whether a
 * candidate elder can actually own a fold, and warning about a duplicate rather
 * than merging anything.
 */

export type ActionOutcome =
  { ok: true; message: string } | { ok: false; message: string }

/* ────────────────────────────── Adding a person ────────────────────────────── */

/**
 * Add somebody.
 *
 * Warns about a likely duplicate and creates the person anyway, because §6's
 * matching rules are explicit that nothing is ever auto-merged — and because
 * refusing would leave a leader unable to add a real second Jonah Rourke. The
 * warning is in the success message, where the person who just typed the name
 * will read it.
 */
export async function addPerson(formData: FormData): Promise<ActionOutcome> {
  const viewer = await getWriter()

  const gate = permissionCheck(viewer, 'care.view_people')
  if (!gate.allowed) return { ok: false, message: gate.note }

  const attempt = draftPerson({
    firstName: String(formData.get('firstName') ?? ''),
    lastName: String(formData.get('lastName') ?? ''),
    email: String(formData.get('email') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    isMember: formData.get('isMember') === 'member',
  })
  if (!attempt.ok) return { ok: false, message: attempt.refusal }

  const person = attempt.person

  // Looked for, reported, never acted on. §6: possible duplicates are surfaced
  // and a human decides.
  const existing = await db
    .select({
      id: schema.people.id,
      firstName: schema.people.firstName,
      lastName: schema.people.lastName,
      email: schema.people.email,
      phone: schema.people.phone,
    })
    .from(schema.people)
    .where(eq(schema.people.churchId, viewer.churchId))

  const digits = person.phone ? normalisePhone(person.phone).slice(-10) : null
  const clash = existing.find((row) => {
    if (
      person.email &&
      row.email &&
      row.email.toLowerCase() === person.email.toLowerCase()
    ) {
      return true
    }
    if (
      digits &&
      row.phone &&
      normalisePhone(row.phone).slice(-10) === digits
    ) {
      return true
    }
    return (
      row.firstName.toLowerCase() === person.firstName.toLowerCase() &&
      row.lastName.toLowerCase() === person.lastName.toLowerCase()
    )
  })

  await db.insert(schema.people).values({
    churchId: viewer.churchId,
    firstName: person.firstName,
    lastName: person.lastName,
    email: person.email,
    phone: person.phone,
    isMember: person.isMember,
  })

  revalidatePath('/people')
  revalidatePath('/')
  if (!person.isMember) revalidatePath('/guests')

  const where = person.isMember
    ? 'Family, with no fold yet — they will show on the Overview as somebody nobody is shepherding.'
    : 'Guests, kept out of Family until membership.'

  return {
    ok: true,
    message: clash
      ? `Added to ${where} Note that ${clash.firstName} ${clash.lastName} looks like the same person — nothing was merged, because that is a judgement only you can make.`
      : `Added to ${where}`,
  }
}

/* ────────────────────────────── Creating a fold ────────────────────────────── */

export async function createFold(formData: FormData): Promise<ActionOutcome> {
  const viewer = await getWriter()

  // Creating a fold names who is answerable for a group of people, which is a
  // role decision rather than a care one.
  const gate = permissionCheck(viewer, 'admin.manage_roles')
  if (!gate.allowed) return { ok: false, message: gate.note }

  const elderId = String(formData.get('elderId') ?? '')

  const candidate = elderId
    ? await loadPrincipal(elderId, viewer.churchId)
    : null

  const attempt = draftFold({
    name: String(formData.get('name') ?? ''),
    elderId,
    elder: candidate?.principal ?? null,
    elderName: candidate?.fullName ?? '',
  })
  if (!attempt.ok) return { ok: false, message: attempt.refusal }

  const [created] = await db
    .insert(schema.folds)
    .values({
      churchId: viewer.churchId,
      name: attempt.name,
      elderId: attempt.elderId,
    })
    .returning({ id: schema.folds.id, name: schema.folds.name })

  revalidatePath('/people')
  revalidatePath('/')

  return {
    ok: true,
    message: `${created!.name} created, owned by ${candidate!.fullName}. Nobody is in it yet.`,
  }
}

/** A candidate elder as an authorization subject, so `canOwnFold` can judge. */
async function loadPrincipal(
  personId: string,
  churchId: string
): Promise<{
  principal: { personId: string; roles: Role[] }
  fullName: string
} | null> {
  const [person] = await db
    .select({
      id: schema.people.id,
      firstName: schema.people.firstName,
      lastName: schema.people.lastName,
    })
    .from(schema.people)
    .where(
      and(eq(schema.people.id, personId), eq(schema.people.churchId, churchId))
    )
    .limit(1)

  if (!person) return null

  const roleRows = await db
    .select({ role: schema.leaderRoles.role })
    .from(schema.leaderRoles)
    .where(eq(schema.leaderRoles.personId, personId))

  return {
    principal: {
      personId: person.id,
      // A role string this build cannot evaluate must never become authority.
      roles: roleRows
        .map((row) => row.role)
        .filter((role): role is Role => isRole(role)),
    },
    fullName: `${person.firstName} ${person.lastName}`,
  }
}

/* ─────────────────────── Putting somebody in a fold ─────────────────────── */

export async function assignFold(formData: FormData): Promise<ActionOutcome> {
  const personId = String(formData.get('personId') ?? '')
  const rawFold = String(formData.get('foldId') ?? '')
  // An empty select value means "no fold", which is a legal destination.
  const foldId = rawFold === '' ? null : rawFold

  if (personId === '') return { ok: false, message: 'Say who.' }

  const viewer = await getWriter()
  const gate = permissionCheck(viewer, 'care.view_people')
  if (!gate.allowed) return { ok: false, message: gate.note }

  const [person] = await db
    .select({
      id: schema.people.id,
      firstName: schema.people.firstName,
      lastName: schema.people.lastName,
      foldId: schema.people.foldId,
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

  const folds = await db
    .select({ id: schema.folds.id, name: schema.folds.name })
    .from(schema.folds)
    .where(eq(schema.folds.churchId, viewer.churchId))

  const destination = foldId ? folds.find((fold) => fold.id === foldId) : null
  if (foldId && !destination) {
    return { ok: false, message: 'That fold is not in this church.' }
  }

  const current = person.foldId
    ? folds.find((fold) => fold.id === person.foldId)
    : null

  const attempt = assignToFold({
    personName: `${person.firstName} ${person.lastName}`,
    foldId,
    foldName: destination?.name ?? null,
    currentFoldId: person.foldId,
    currentFoldName: current?.name ?? null,
  })
  if (!attempt.ok) return { ok: false, message: attempt.refusal }

  await db
    .update(schema.people)
    .set({ foldId: attempt.foldId })
    .where(eq(schema.people.id, personId))

  await db.insert(schema.changeLog).values({
    churchId: viewer.churchId,
    actorId: viewer.personId,
    entity: 'person_fold',
    entityId: personId,
    action: attempt.foldId === null ? 'unassign_fold' : 'assign_fold',
    fromState: current?.name ?? null,
    toState: destination?.name ?? null,
    detail: attempt.note,
  })

  revalidatePath('/people')
  revalidatePath(`/people/${personId}`)
  revalidatePath('/')

  return { ok: true, message: attempt.note }
}

/* ──────────────────────── Changing a fold's elder ──────────────────────── */

/**
 * Hand a fold to somebody else.
 *
 * Same check as creating one: the new owner has to be able to read the notes about
 * the people in it. `restrict` on the foreign key means the outgoing elder cannot
 * be deleted while they still own it, which is deliberate — reassignment is an
 * explicit act.
 */
export async function reassignFoldElder(
  formData: FormData
): Promise<ActionOutcome> {
  const foldId = String(formData.get('foldId') ?? '')
  const elderId = String(formData.get('elderId') ?? '')

  if (foldId === '') return { ok: false, message: 'Say which fold.' }

  const viewer = await getWriter()
  const gate = permissionCheck(viewer, 'admin.manage_roles')
  if (!gate.allowed) return { ok: false, message: gate.note }

  const [fold] = await db
    .select({
      id: schema.folds.id,
      name: schema.folds.name,
      elderId: schema.folds.elderId,
    })
    .from(schema.folds)
    .where(
      and(
        eq(schema.folds.id, foldId),
        eq(schema.folds.churchId, viewer.churchId)
      )
    )
    .limit(1)

  if (!fold) return { ok: false, message: 'That fold is not in this church.' }
  if (fold.elderId === elderId) {
    return { ok: false, message: `They already own ${fold.name}.` }
  }

  const candidate = elderId
    ? await loadPrincipal(elderId, viewer.churchId)
    : null

  // Routed through the same draft check, so the rule about who may own a fold is
  // stated once and cannot be laxer here than at creation.
  const attempt = draftFold({
    name: fold.name,
    elderId,
    elder: candidate?.principal ?? null,
    elderName: candidate?.fullName ?? '',
  })
  if (!attempt.ok) return { ok: false, message: attempt.refusal }

  await db
    .update(schema.folds)
    .set({ elderId: attempt.elderId })
    .where(eq(schema.folds.id, foldId))

  revalidatePath('/people')
  revalidatePath('/')

  return {
    ok: true,
    message: `${fold.name} is now owned by ${candidate!.fullName}. Everyone in it is their responsibility from here.`,
  }
}

/* ─────────────────── Making a guest a member, and back ─────────────────── */

/**
 * Move somebody between Guests and Family.
 *
 * §6 keeps the lists apart, so this is an explicit act rather than a side effect
 * of finishing a pathway. Becoming a member closes any live pathway placement,
 * with that as the recorded reason — the pathway is how they got here and is
 * behind them now.
 */
export async function setMembership(
  formData: FormData
): Promise<ActionOutcome> {
  const personId = String(formData.get('personId') ?? '')
  const becomeMember = formData.get('isMember') === 'member'

  if (personId === '') return { ok: false, message: 'Say who.' }

  const viewer = await getWriter()
  const gate = permissionCheck(viewer, 'care.view_people')
  if (!gate.allowed) return { ok: false, message: gate.note }

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
  if (person.isMember === becomeMember) {
    return {
      ok: false,
      message: `${person.firstName} ${person.lastName} is already in ${becomeMember ? 'Family' : 'Guests'}.`,
    }
  }

  let closedPlacement = false
  await db.transaction(async (tx) => {
    await tx
      .update(schema.people)
      .set({ isMember: becomeMember })
      .where(eq(schema.people.id, personId))

    if (becomeMember) {
      const closed = await tx
        .update(schema.pathwayPlacements)
        .set({ exitedAt: new Date(), exitReason: 'Became a member' })
        .where(
          and(
            eq(schema.pathwayPlacements.personId, personId),
            isNull(schema.pathwayPlacements.exitedAt)
          )
        )
        .returning({ id: schema.pathwayPlacements.id })
      closedPlacement = closed.length > 0
    }
  })

  revalidatePath('/people')
  revalidatePath(`/people/${personId}`)
  revalidatePath('/guests')
  revalidatePath('/')

  const name = `${person.firstName} ${person.lastName}`
  if (!becomeMember) {
    return {
      ok: true,
      message: `${name} moved to Guests. They keep their care history and their fold, if they had one.`,
    }
  }
  return {
    ok: true,
    message: closedPlacement
      ? `${name} is in Family. Their pathway placement is closed as "Became a member", which is what it was for.`
      : `${name} is in Family. Give them a fold, or they will show on the Overview as somebody nobody is shepherding.`,
  }
}
