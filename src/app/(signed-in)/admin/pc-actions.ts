'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'

import {
  type ImportPlan,
  describePlan,
  nothingToDoReason,
  planImport,
  planWouldChangeAnything,
} from '@/domain/pc-import'
import {
  FOLD_LISTS,
  type FoldList,
  isCategoryEnabled,
} from '@/domain/planning-center'
import { permissionCheck } from '@/domain/roles'
import { db, schema } from '@/db/client'
import { existingPeopleFor, listMappingsFor } from '@/data/planning-center'
import { getWriter } from '@/data/viewer'
import { PC_NOT_CONFIGURED } from '@/planning-center/config'
import { fetchPeople, verifyCredentials } from '@/planning-center/client'
import {
  PLANNING_CENTER,
  resolveCredentials,
} from '@/planning-center/credentials'
import { encryptSecret, secretHint } from '@/planning-center/secrets'

/**
 * Importing a directory from Planning Center.
 *
 * **The preview and the import run the same plan through the same function.**
 * `planImport` is pure and both paths call it, so what the preview describes and
 * what the import does cannot be two different pieces of reasoning that drifted
 * apart. They can still see different *data* — somebody may add a person to
 * Planning Center between the two clicks — which is why the import reports what
 * it actually did rather than echoing the preview's numbers (§8.2, §8.5).
 *
 * **Nothing is written until somebody presses the second button.** The preview
 * fetches and computes and writes nothing at all. That is the point of it: this is
 * the one action in Fold that can put several hundred rows into a directory, and
 * it should be possible to see exactly what that means before it happens.
 *
 * **A possible duplicate is recorded, never resolved.** §6, and it is the reason
 * `matchPerson` returns candidates rather than a winner. The import writes a row
 * to `possible_duplicates` and moves on; a person decides later.
 */

export type ActionOutcome =
  { ok: true; message: string } | { ok: false; message: string }

export type PreviewOutcome =
  | {
      ok: true
      message: string
      plan: ImportPlan
      /** Every membership value seen, for the mapping boxes to offer. */
      membershipValues: readonly string[]
    }
  | { ok: false; message: string }

/** The gate and the credentials check, in the order the reader needs them. */
async function ready(): Promise<
  | {
      ok: true
      viewer: Awaited<ReturnType<typeof getWriter>>
      credentials: NonNullable<Awaited<ReturnType<typeof resolveCredentials>>>
    }
  | { ok: false; message: string }
> {
  const viewer = await getWriter()
  const gate = permissionCheck(viewer, 'admin.manage_integrations')
  if (!gate.allowed) return { ok: false, message: gate.note }
  const credentials = await resolveCredentials(viewer.churchId)
  if (credentials === null) return { ok: false, message: PC_NOT_CONFIGURED }
  return { ok: true, viewer, credentials }
}

/**
 * Whether §6's people category is switched on.
 *
 * Checked in the action rather than only on the settings screen: a church that
 * turned people syncing off has said something, and an import button that ignored
 * it would make the setting decorative.
 */
async function peopleSyncIsOn(churchId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(schema.syncSettings)
    .where(eq(schema.syncSettings.churchId, churchId))
  const settings = Object.fromEntries(
    rows.map((row) => [row.category, row.enabled])
  )
  return isCategoryEnabled(settings, 'people_and_households')
}

/* ────────────────────────────── The dry run ────────────────────────────── */

export async function previewImport(): Promise<PreviewOutcome> {
  const start = await ready()
  if (!start.ok) return { ok: false, message: start.message }
  const { viewer, credentials } = start

  if (!(await peopleSyncIsOn(viewer.churchId))) {
    return {
      ok: false,
      message:
        'People and households syncing is switched off, so nothing would be imported. Turn it on above first.',
    }
  }

  const fetched = await fetchPeople(credentials.auth)
  if (!fetched.ok) return { ok: false, message: fetched.error }

  const [existing, listMappings] = await Promise.all([
    existingPeopleFor(viewer.churchId),
    listMappingsFor(viewer.churchId),
  ])

  const plan = planImport({
    incoming: fetched.value.people,
    existing,
    listMappings,
  })

  /*
   * Remember what Planning Center is using, so the mapping boxes can offer it.
   *
   * Written here rather than on import, because the mapping has to be settable
   * *before* anybody imports — otherwise the first import sorts everyone as a
   * guest and the church corrects hundreds of records by hand.
   */
  await db
    .update(schema.churches)
    .set({ pcMembershipValues: fetched.value.membershipValues })
    .where(eq(schema.churches.id, viewer.churchId))

  /*
   * A read-only action that revalidates, which looks contradictory and is not.
   *
   * The preview writes nothing to the church's records, but it does refresh the
   * cached membership values above, and the Family/Guests tick boxes are rendered
   * by the server component around this. Without this line that section keeps the
   * markup it had before the preview ran, so the values arrive in the database and
   * the boxes stay empty until somebody reloads the page by hand — which also
   * throws away the preview they were reading.
   */
  revalidatePath('/admin')

  const membership =
    fetched.value.membershipValues.length > 0
      ? ` Planning Center is using these membership values: ${fetched.value.membershipValues.join(', ')}. Tick the ones that mean Family in the box below.`
      : ''

  return {
    ok: true,
    plan,
    membershipValues: fetched.value.membershipValues,
    message: `Read ${fetched.value.people.length} ${fetched.value.people.length === 1 ? 'profile' : 'profiles'} from Planning Center. ${describePlan(plan)}${membership}`,
  }
}

/* ────────────────────────────── The import ────────────────────────────── */

export async function runImport(): Promise<ActionOutcome> {
  const start = await ready()
  if (!start.ok) return { ok: false, message: start.message }
  const { viewer, credentials } = start

  if (!(await peopleSyncIsOn(viewer.churchId))) {
    return {
      ok: false,
      message:
        'People and households syncing is switched off, so nothing was imported.',
    }
  }

  const fetched = await fetchPeople(credentials.auth)
  if (!fetched.ok) return { ok: false, message: fetched.error }

  const [existing, listMappings] = await Promise.all([
    existingPeopleFor(viewer.churchId),
    listMappingsFor(viewer.churchId),
  ])

  // Recomputed rather than carried over from the preview. The directory may have
  // moved between the two clicks, and acting on a stale plan would write what was
  // true five minutes ago.
  const plan = planImport({
    incoming: fetched.value.people,
    existing,
    listMappings,
  })

  if (!planWouldChangeAnything(plan)) {
    // §8.5: an action reporting success must have done something.
    return {
      ok: false,
      message: nothingToDoReason(plan) ?? 'Nothing to import.',
    }
  }

  let created = 0
  let linked = 0
  let recordedDuplicates = 0

  await db.transaction(async (tx) => {
    if (plan.creates.length > 0) {
      const inserted = await tx
        .insert(schema.people)
        .values(
          plan.creates.map((entry) => ({
            churchId: viewer.churchId,
            firstName: entry.incoming.firstName,
            lastName: entry.incoming.lastName,
            email: entry.incoming.email,
            phone: entry.incoming.phone,
            planningCenterId: entry.incoming.planningCenterId,
            isMember: entry.list === 'family',
          }))
        )
        .returning({ id: schema.people.id })
      created = inserted.length
    }

    for (const link of plan.links) {
      // Only the id. Field ownership is a separate question, and answering it
      // here would overwrite hand-entered pastoral work with a directory export.
      const updated = await tx
        .update(schema.people)
        .set({ planningCenterId: link.incoming.planningCenterId })
        .where(
          and(
            eq(schema.people.id, link.personId),
            eq(schema.people.churchId, viewer.churchId)
          )
        )
        .returning({ id: schema.people.id })
      linked += updated.length
    }

    for (const duplicate of plan.duplicates) {
      // One row per pair, so each ambiguity is its own decision. Recorded
      // against the first two candidates; a third is rare and the resolution of
      // the first pair surfaces it again on the next run.
      const [first, second] = duplicate.candidates
      if (!first || !second) continue
      const written = await tx
        .insert(schema.possibleDuplicates)
        .values({
          churchId: viewer.churchId,
          personId: first.personId,
          otherPersonId: second.personId,
          matchedOn: `Planning Center profile ${duplicate.incoming.firstName} ${duplicate.incoming.lastName} matched both`,
        })
        .returning({ id: schema.possibleDuplicates.id })
      recordedDuplicates += written.length
    }
  })

  revalidatePath('/admin')
  revalidatePath('/people')
  revalidatePath('/guests')
  revalidatePath('/')

  const parts = [
    `${created} ${created === 1 ? 'person' : 'people'} added`,
    `${linked} linked to an existing record`,
  ]
  if (recordedDuplicates > 0) {
    parts.push(
      `${recordedDuplicates} possible ${recordedDuplicates === 1 ? 'duplicate' : 'duplicates'} recorded for you to decide about`
    )
  }
  if (plan.skipped.length > 0) {
    parts.push(`${plan.skipped.length} skipped`)
  }

  return {
    ok: true,
    message: `${parts.join(', ')}. Everyone arrived as a guest unless your Family mapping put them in Family — membership is yours to set, not an import's to conclude.`,
  }
}

/* ──────────────────────── Mapping Family and Guests ──────────────────────── */

/**
 * Point a Fold list at a membership value Planning Center already uses.
 *
 * The value is not validated against a list fetched here, because the values
 * offered in the form came from the church's own directory in the preview — Fold
 * never invents one, and the form cannot offer one that was not seen. Clearing
 * the mapping is a separate intent and is spelled `fold_only` with a reason,
 * because §8.8 needs a decision to be distinguishable from nobody having looked.
 */
export async function mapList(formData: FormData): Promise<ActionOutcome> {
  const list = String(formData.get('list') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()
  const keepInFold = formData.get('foldOnly') === '1'

  /*
   * Several values, from checkboxes named `value`.
   *
   * A directory turned out to say "in the family" three ways — Member, Partners,
   * Children of Members — and one value per list made the church pick one and let
   * the rest become guests. Deduplicated and trimmed here so a stray blank or a
   * double-submitted box cannot produce an empty entry that matches nobody.
   */
  const values = [
    ...new Set(
      formData
        .getAll('value')
        .map((entry) => String(entry).trim())
        .filter((entry) => entry !== '')
    ),
  ]

  if (!isFoldList(list)) return { ok: false, message: 'Say which list.' }

  const viewer = await getWriter()
  const gate = permissionCheck(viewer, 'admin.manage_integrations')
  if (!gate.allowed) return { ok: false, message: gate.note }

  if (keepInFold && reason === '') {
    return {
      ok: false,
      message:
        'Keeping a list in Fold is a decision, so it needs a reason. Without one it is indistinguishable from nobody having looked at it yet.',
    }
  }
  if (!keepInFold && values.length === 0) {
    return {
      ok: false,
      message:
        'Tick at least one Planning Center value for this list, or choose to keep the list in Fold.',
    }
  }

  await db
    .insert(schema.foldListMappings)
    .values({
      churchId: viewer.churchId,
      list,
      state: keepInFold ? 'fold_only' : 'mapped',
      externalFieldIds: keepInFold ? null : values,
      foldOnlyReason: keepInFold ? reason : null,
    })
    .onConflictDoUpdate({
      target: [schema.foldListMappings.churchId, schema.foldListMappings.list],
      set: {
        state: keepInFold ? 'fold_only' : 'mapped',
        externalFieldIds: keepInFold ? null : values,
        foldOnlyReason: keepInFold ? reason : null,
      },
    })

  revalidatePath('/admin')
  return {
    ok: true,
    message: keepInFold
      ? `${label(list)} stays in Fold, with your reason on the record.`
      : `${label(list)} now takes ${values.map((entry) => `“${entry}”`).join(', ')}. Anyone carrying ${values.length === 1 ? 'that value' : 'any of those values'} arrives in ${label(list)}.`,
  }
}

/* ───────────────────────── Resolving a duplicate ───────────────────────── */

/**
 * Record what a person decided about a near match.
 *
 * There is no merge here either. The resolution is a sentence somebody wrote —
 * "same person, kept the older record", "different people, cousins" — and the
 * row stays with that sentence on it. Fold does not have a merge, and adding one
 * would need to answer what happens to two sets of care notes, which is a
 * pastoral question rather than a database one.
 */
export async function resolveDuplicate(
  formData: FormData
): Promise<ActionOutcome> {
  const id = String(formData.get('duplicateId') ?? '')
  const resolution = String(formData.get('resolution') ?? '').trim()

  if (id === '') return { ok: false, message: 'Say which one.' }
  if (resolution === '') {
    return {
      ok: false,
      message:
        'Say what you decided. In a year that sentence is the only record of why these two records were left as they are.',
    }
  }

  const viewer = await getWriter()
  const gate = permissionCheck(viewer, 'admin.manage_integrations')
  if (!gate.allowed) return { ok: false, message: gate.note }

  const updated = await db
    .update(schema.possibleDuplicates)
    .set({
      resolvedAt: new Date(),
      resolvedById: viewer.personId,
      resolution,
    })
    .where(
      and(
        eq(schema.possibleDuplicates.id, id),
        eq(schema.possibleDuplicates.churchId, viewer.churchId)
      )
    )
    .returning({ id: schema.possibleDuplicates.id })

  if (updated.length === 0) {
    return { ok: false, message: 'That one is not in this church.' }
  }

  revalidatePath('/admin')
  return {
    ok: true,
    message:
      'Recorded. The two records are left as they are, with your reason attached.',
  }
}

/* ────────────────────────────── Shared ────────────────────────────── */

function isFoldList(value: string): value is FoldList {
  return (FOLD_LISTS as readonly string[]).includes(value)
}

function label(list: FoldList): string {
  return list === 'family' ? 'Family' : 'Guests'
}

/* ────────────────────────────── Connecting ────────────────────────────── */

/**
 * Save a Personal Access Token, after proving it works.
 *
 * Verified before it is stored, not after. A Setup screen that says "connected"
 * while the import says 401 leaves the person who typed it with no way to tell
 * which half is wrong — so this makes one real request to Planning Center first
 * and stores nothing if it fails.
 *
 * The secret is encrypted before it reaches the database and is never read back
 * out to a browser; the screen shows the Application ID and the last four
 * characters, which is enough to recognise which token is stored.
 */
export async function connectPlanningCenter(
  formData: FormData
): Promise<ActionOutcome> {
  const appId = String(formData.get('appId') ?? '').trim()
  const secret = String(formData.get('secret') ?? '').trim()

  const viewer = await getWriter()
  const gate = permissionCheck(viewer, 'admin.manage_integrations')
  if (!gate.allowed) return { ok: false, message: gate.note }

  if (appId === '' || secret === '') {
    return {
      ok: false,
      message:
        'Both halves are needed. Planning Center issues an Application ID and a Secret together, and one without the other authenticates nothing.',
    }
  }

  const check = await verifyCredentials({ appId, secret })
  if (!check.ok) return { ok: false, message: check.error }

  await db
    .insert(schema.integrationCredentials)
    .values({
      churchId: viewer.churchId,
      provider: PLANNING_CENTER,
      appId,
      secretEncrypted: encryptSecret(secret),
      secretHint: secretHint(secret),
      connectedById: viewer.personId,
    })
    .onConflictDoUpdate({
      target: [
        schema.integrationCredentials.churchId,
        schema.integrationCredentials.provider,
      ],
      // Replaced rather than versioned: an old token is not history worth
      // keeping, it is a key that should stop existing.
      set: {
        appId,
        secretEncrypted: encryptSecret(secret),
        secretHint: secretHint(secret),
        connectedById: viewer.personId,
        connectedAt: new Date(),
      },
    })

  revalidatePath('/admin')

  const total = check.value.reportedTotal
  return {
    ok: true,
    message:
      total === null
        ? 'Connected. Planning Center accepted the token and let Fold read People.'
        : `Connected. Planning Center reports ${total} ${total === 1 ? 'person' : 'people'} in your directory — press “See what would change” to find out what importing them would do.`,
  }
}

/**
 * Forget the stored token.
 *
 * Deleted rather than marked inactive. A revoked credential that is still in the
 * database is still a credential, and there is no version of this where keeping
 * it is useful.
 */
export async function disconnectPlanningCenter(): Promise<ActionOutcome> {
  const viewer = await getWriter()
  const gate = permissionCheck(viewer, 'admin.manage_integrations')
  if (!gate.allowed) return { ok: false, message: gate.note }

  const removed = await db
    .delete(schema.integrationCredentials)
    .where(
      and(
        eq(schema.integrationCredentials.churchId, viewer.churchId),
        eq(schema.integrationCredentials.provider, PLANNING_CENTER)
      )
    )
    .returning({ id: schema.integrationCredentials.id })

  if (removed.length === 0) {
    // §8.5: an action reporting success must have done something.
    return { ok: false, message: 'There was no stored token to remove.' }
  }

  revalidatePath('/admin')
  return {
    ok: true,
    message:
      'Token removed. People already imported stay where they are, still carrying their Planning Center ids, so reconnecting later recognises them rather than adding second copies.',
  }
}
