'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, isNull } from 'drizzle-orm'

import { canReadTier } from '@/domain/access'
import {
  advanceCase,
  openCase,
  pairElders,
  sealCase,
} from '@/domain/restoration'
import { type Role, isRole } from '@/domain/roles'
import { db, schema } from '@/db/client'
import { getWriter } from '@/data/viewer'

/**
 * Restoration cases.
 *
 * The most consequential writes in the application, and until now impossible —
 * the Confidential page could read cases and nothing could open one, so its main
 * section was permanently empty.
 *
 * Every action here checks `elders_only` clearance rather than a care permission.
 * That is the whole access rule for restoration: an elder reads and works every
 * case whether they are named on it or not, and a reader below that tier reaches
 * none of them. Who is *named* is a separate question, governed by
 * `restoration.be_assigned`, and it is about who is doing the work.
 *
 * Nothing here deletes. §3 rule 4: a closed case is sealed.
 */

export type ActionOutcome =
  { ok: true; message: string } | { ok: false; message: string }

/**
 * The gate every action here shares.
 *
 * Elders-only clearance, stated once. A `pastoral_staff` reader gets a refusal
 * that names the tier rather than a bare "forbidden", because the reason is the
 * useful part: they are not being singled out, the whole category is above them.
 */
async function requireElder() {
  const viewer = await getWriter()
  if (!canReadTier(viewer, 'elders_only')) {
    return {
      viewer: null,
      refusal:
        'Restoration cases are elders-only. You can see that a case exists and how it ended, and nothing inside it.',
    } as const
  }
  return { viewer, refusal: null } as const
}

/** A candidate elder as an authorization subject, so `pairElders` can judge. */
async function loadCandidate(personId: string, churchId: string) {
  if (personId === '') return null
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
      roles: roleRows
        .map((row) => row.role)
        .filter((role): role is Role => isRole(role)),
    },
    fullName: `${person.firstName} ${person.lastName}`,
  }
}

/* ──────────────────────────── Opening a case ──────────────────────────── */

export async function openRestorationCase(
  formData: FormData
): Promise<ActionOutcome> {
  const { viewer, refusal } = await requireElder()
  if (!viewer) return { ok: false, message: refusal }

  const personId = String(formData.get('personId') ?? '')
  const leadElderId = String(formData.get('leadElderId') ?? '')
  const secondElderId = String(formData.get('secondElderId') ?? '')

  if (personId === '') return { ok: false, message: 'Say who this is about.' }

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
  const personName = `${person.firstName} ${person.lastName}`

  const [lead, second] = await Promise.all([
    loadCandidate(leadElderId, viewer.churchId),
    loadCandidate(secondElderId, viewer.churchId),
  ])

  const pair = pairElders({ leadElderId, secondElderId, lead, second })
  if (!pair.ok) return { ok: false, message: pair.refusal }

  const openAlready = await db
    .select({ id: schema.restorationCases.id })
    .from(schema.restorationCases)
    .where(
      and(
        eq(schema.restorationCases.personId, personId),
        isNull(schema.restorationCases.closedAt)
      )
    )
    .limit(1)

  const attempt = openCase({
    personName,
    stepLabel: String(formData.get('stepLabel') ?? ''),
    status: String(formData.get('status') ?? ''),
    plan: String(formData.get('plan') ?? ''),
    knows: String(formData.get('knows') ?? ''),
    doesNotKnow: String(formData.get('doesNotKnow') ?? ''),
    decisionQuestion: String(formData.get('decisionQuestion') ?? ''),
    alreadyOpen: openAlready.length > 0,
  })
  if (!attempt.ok) return { ok: false, message: attempt.refusal }

  await db.insert(schema.restorationCases).values({
    churchId: viewer.churchId,
    personId,
    leadElderId: pair.leadElderId,
    secondElderId: pair.secondElderId,
    stepLabel: attempt.draft.stepLabel,
    status: attempt.draft.status,
    plan: [...attempt.draft.plan],
    knows: [...attempt.draft.knows],
    doesNotKnow: [...attempt.draft.doesNotKnow],
    decisionQuestion: attempt.draft.decisionQuestion,
  })

  revalidatePath('/care')
  revalidatePath('/')

  return { ok: true, message: attempt.note }
}

/* ─────────────────────── Recording against a case ─────────────────────── */

/**
 * A note on a case.
 *
 * Written at `elders_only` unconditionally — not from a form value, because §3
 * fixes it and a check constraint refuses anything else. `restorationCaseId` is
 * what makes it a case note rather than an ordinary one.
 */
export async function logCaseNote(formData: FormData): Promise<ActionOutcome> {
  const { viewer, refusal } = await requireElder()
  if (!viewer) return { ok: false, message: refusal }

  const caseId = String(formData.get('caseId') ?? '')
  const body = String(formData.get('body') ?? '').trim()

  if (caseId === '') return { ok: false, message: 'Say which case.' }
  if (body === '') {
    return {
      ok: false,
      message:
        'An empty note records nothing. Write it as though the person will read it, because §3 says they may ask.',
    }
  }

  const [record] = await db
    .select({
      id: schema.restorationCases.id,
      personId: schema.restorationCases.personId,
      closedAt: schema.restorationCases.closedAt,
    })
    .from(schema.restorationCases)
    .where(
      and(
        eq(schema.restorationCases.id, caseId),
        eq(schema.restorationCases.churchId, viewer.churchId)
      )
    )
    .limit(1)

  if (!record) {
    return { ok: false, message: 'That case is not in this church.' }
  }
  if (record.closedAt !== null) {
    return {
      ok: false,
      message:
        'That case is sealed. A situation that has started again is a new case with its own two elders.',
    }
  }

  await db.insert(schema.careNotes).values({
    churchId: viewer.churchId,
    personId: record.personId,
    authorId: viewer.personId,
    // Fixed, not chosen. The check constraint refuses any other value on a note
    // that carries a case id.
    visibilityTier: 'elders_only',
    body,
    restorationCaseId: caseId,
  })

  revalidatePath('/care')
  revalidatePath(`/people/${record.personId}`)
  revalidatePath('/notes')

  return {
    ok: true,
    message:
      'Recorded on the case at elders-only. It appears on their timeline as care that happened, without its contents, for anybody below the tier.',
  }
}

/* ──────────────────────────── Moving it along ──────────────────────────── */

export async function advanceRestorationCase(
  formData: FormData
): Promise<ActionOutcome> {
  const { viewer, refusal } = await requireElder()
  if (!viewer) return { ok: false, message: refusal }

  const caseId = String(formData.get('caseId') ?? '')
  if (caseId === '') return { ok: false, message: 'Say which case.' }

  const [record] = await db
    .select({
      id: schema.restorationCases.id,
      step: schema.restorationCases.step,
      closedAt: schema.restorationCases.closedAt,
    })
    .from(schema.restorationCases)
    .where(
      and(
        eq(schema.restorationCases.id, caseId),
        eq(schema.restorationCases.churchId, viewer.churchId)
      )
    )
    .limit(1)

  if (!record) {
    return { ok: false, message: 'That case is not in this church.' }
  }

  const attempt = advanceCase({
    currentStep: record.step,
    stepLabel: String(formData.get('stepLabel') ?? ''),
    status: String(formData.get('status') ?? ''),
    closed: record.closedAt !== null,
  })
  if (!attempt.ok) return { ok: false, message: attempt.refusal }

  const decisionQuestion = String(formData.get('decisionQuestion') ?? '').trim()

  await db
    .update(schema.restorationCases)
    .set({
      step: attempt.step,
      stepLabel: attempt.stepLabel,
      status: attempt.status,
      decisionQuestion: decisionQuestion === '' ? null : decisionQuestion,
    })
    .where(eq(schema.restorationCases.id, caseId))

  revalidatePath('/care')

  return {
    ok: true,
    message: `Now at step ${attempt.step}: ${attempt.stepLabel}.`,
  }
}

/* ────────────────────────── Sealing on close ────────────────────────── */

export async function sealRestorationCase(
  formData: FormData
): Promise<ActionOutcome> {
  const { viewer, refusal } = await requireElder()
  if (!viewer) return { ok: false, message: refusal }

  const caseId = String(formData.get('caseId') ?? '')
  if (caseId === '') return { ok: false, message: 'Say which case.' }

  const [record] = await db
    .select({
      id: schema.restorationCases.id,
      closedAt: schema.restorationCases.closedAt,
      firstName: schema.people.firstName,
      lastName: schema.people.lastName,
    })
    .from(schema.restorationCases)
    .innerJoin(
      schema.people,
      eq(schema.people.id, schema.restorationCases.personId)
    )
    .where(
      and(
        eq(schema.restorationCases.id, caseId),
        eq(schema.restorationCases.churchId, viewer.churchId)
      )
    )
    .limit(1)

  if (!record) {
    return { ok: false, message: 'That case is not in this church.' }
  }

  const attempt = sealCase({
    personName: `${record.firstName} ${record.lastName}`,
    outcome: String(formData.get('outcome') ?? ''),
    alreadyClosed: record.closedAt !== null,
  })
  if (!attempt.ok) return { ok: false, message: attempt.refusal }

  // Both together. The check constraint refuses a closed case with no outcome,
  // which is the database holding the same rule the domain does.
  await db
    .update(schema.restorationCases)
    .set({ closedAt: new Date(), outcome: attempt.outcome })
    .where(eq(schema.restorationCases.id, caseId))

  revalidatePath('/care')
  revalidatePath('/')

  return { ok: true, message: attempt.note }
}
