'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, isNull } from 'drizzle-orm'

import { setCategoryEnabled } from '@/domain/planning-center'
import {
  type Permission,
  type Role,
  PERMISSIONS,
  ROLE_LABELS,
  isRole,
  permissionCheck,
} from '@/domain/roles'
import { TIER_ORDER, type ConfidentialityTier, tierName } from '@/domain/tiers'
import { db, schema } from '@/db/client'
import { getWriter } from '@/data/viewer'

/**
 * Administration.
 *
 * The shape of every action here is the same, and it is the §8.3 shape: ask
 * `permissionCheck` once, and if it refuses, hand back its own note. The message
 * a user reads is the message the gate produced, so the explanation cannot drift
 * from the decision.
 *
 * Three rules the handoff cares about, enforced here rather than in the form:
 *
 * - A grant carries a reason. Not nullable in the schema either, because a grant
 *   nobody can explain is a grant nobody can review.
 * - Revoking stamps the row; it never deletes it. "Who gave them access to that,
 *   and when did it end?" has to stay answerable.
 * - Confidential pastoral notes cannot be made syncable. `setCategoryEnabled`
 *   refuses it, and a check constraint refuses to store it, so a future write
 *   path that skips the domain still cannot record one.
 */

export type ActionOutcome =
  { ok: true; message: string } | { ok: false; message: string }

function isPermission(value: unknown): value is Permission {
  return (
    typeof value === 'string' &&
    (PERMISSIONS as readonly string[]).includes(value)
  )
}

function isTier(value: unknown): value is ConfidentialityTier {
  return (
    typeof value === 'string' &&
    (TIER_ORDER as readonly string[]).includes(value)
  )
}

/** The person must be in the viewer's own church. Tenancy, not politeness. */
async function personInChurch(
  personId: string,
  churchId: string
): Promise<{ id: string; fullName: string } | null> {
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
  return person
    ? { id: person.id, fullName: `${person.firstName} ${person.lastName}` }
    : null
}

/* ───────────────────────────────── Roles ───────────────────────────────── */

export async function grantRole(formData: FormData): Promise<ActionOutcome> {
  const personId = formData.get('personId')
  const role = formData.get('role')

  if (typeof personId !== 'string' || !isRole(role)) {
    return { ok: false, message: 'Say which person and which role.' }
  }

  const viewer = await getWriter()
  const gate = permissionCheck(viewer, 'admin.manage_roles')
  if (!gate.allowed) return { ok: false, message: gate.note }

  const person = await personInChurch(personId, viewer.churchId)
  if (!person)
    return { ok: false, message: 'That person is not in this church.' }

  const existing = await db
    .select({ id: schema.leaderRoles.id })
    .from(schema.leaderRoles)
    .where(
      and(
        eq(schema.leaderRoles.personId, personId),
        eq(schema.leaderRoles.role, role)
      )
    )
    .limit(1)

  if (existing.length > 0) {
    // §8.5. Reporting success here would claim a change that did not happen.
    return {
      ok: false,
      message: `${person.fullName} already holds ${ROLE_LABELS[role]}.`,
    }
  }

  await db.insert(schema.leaderRoles).values({
    churchId: viewer.churchId,
    personId,
    role,
    grantedById: viewer.personId,
  })

  revalidatePath('/admin')
  return {
    ok: true,
    message: `${person.fullName} now holds ${ROLE_LABELS[role]}.`,
  }
}

/**
 * Take a role away.
 *
 * Deletes the row rather than stamping it, unlike a grant. A role is a statement
 * about what someone does now, and the audit trail that matters — who gave
 * somebody access their role does not carry — lives on the grant tables. A change
 * log entry is written so the act is still answerable.
 */
export async function revokeRole(formData: FormData): Promise<ActionOutcome> {
  const personId = formData.get('personId')
  const role = formData.get('role')

  if (typeof personId !== 'string' || !isRole(role)) {
    return { ok: false, message: 'Say which person and which role.' }
  }

  const viewer = await getWriter()
  const gate = permissionCheck(viewer, 'admin.manage_roles')
  if (!gate.allowed) return { ok: false, message: gate.note }

  const person = await personInChurch(personId, viewer.churchId)
  if (!person)
    return { ok: false, message: 'That person is not in this church.' }

  const removed = await db
    .delete(schema.leaderRoles)
    .where(
      and(
        eq(schema.leaderRoles.personId, personId),
        eq(schema.leaderRoles.role, role),
        eq(schema.leaderRoles.churchId, viewer.churchId)
      )
    )
    .returning({ id: schema.leaderRoles.id })

  if (removed.length === 0) {
    return {
      ok: false,
      message: `${person.fullName} does not hold ${ROLE_LABELS[role]}.`,
    }
  }

  await db.insert(schema.changeLog).values({
    churchId: viewer.churchId,
    actorId: viewer.personId,
    entity: 'leader_role',
    entityId: personId,
    action: 'revoke_role',
    fromState: role,
    toState: null,
    detail: `${ROLE_LABELS[role]} removed`,
  })

  revalidatePath('/admin')
  return {
    ok: true,
    message: `${ROLE_LABELS[role]} removed from ${person.fullName}. Their clearance is recalculated from what is left.`,
  }
}

/* ──────────────────────── Grants beyond the role ──────────────────────── */

export async function grantPermission(
  formData: FormData
): Promise<ActionOutcome> {
  const personId = formData.get('personId')
  const permission = formData.get('permission')
  const reason = formData.get('reason')

  if (typeof personId !== 'string' || !isPermission(permission)) {
    return { ok: false, message: 'Say which person and which permission.' }
  }
  if (typeof reason !== 'string' || reason.trim() === '') {
    return {
      ok: false,
      message:
        'A grant needs a reason. It is what makes the exception reviewable later.',
    }
  }

  const viewer = await getWriter()
  const gate = permissionCheck(viewer, 'admin.grant_permissions')
  if (!gate.allowed) return { ok: false, message: gate.note }

  const person = await personInChurch(personId, viewer.churchId)
  if (!person)
    return { ok: false, message: 'That person is not in this church.' }

  // A grant on top of a permission the role already carries is not an exception;
  // it is a row that will confuse whoever reviews the exception list.
  const roles = await db
    .select({ role: schema.leaderRoles.role })
    .from(schema.leaderRoles)
    .where(eq(schema.leaderRoles.personId, personId))

  const already = permissionCheck(
    { personId, roles: roles.map((row) => row.role as Role) },
    permission
  )
  if (already.allowed) {
    return {
      ok: false,
      message: `${person.fullName} already has that through their role, so a grant would add nothing.`,
    }
  }

  await db.insert(schema.permissionGrants).values({
    churchId: viewer.churchId,
    personId,
    permission,
    grantedById: viewer.personId,
    reason: reason.trim(),
  })

  revalidatePath('/admin')
  return {
    ok: true,
    message: `Granted to ${person.fullName}, on the record with your name and your reason.`,
  }
}

/**
 * Raise somebody's confidentiality clearance.
 *
 * The most consequential write in the application: it is the one way a person
 * reads pastoral notes their role does not reach. It only ever raises — lowering
 * somebody is a role change, so the two mechanisms can never disagree about the
 * same question with the permissive one winning by accident.
 *
 * It still does not open restoration cases. Those are by naming two elders on the
 * case, and no grant substitutes for that.
 */
export async function grantClearance(
  formData: FormData
): Promise<ActionOutcome> {
  const personId = formData.get('personId')
  const tier = formData.get('tier')
  const reason = formData.get('reason')

  if (typeof personId !== 'string' || !isTier(tier)) {
    return { ok: false, message: 'Say which person and which tier.' }
  }
  if (typeof reason !== 'string' || reason.trim() === '') {
    return {
      ok: false,
      message:
        'Raising someone’s clearance needs a reason. This is the row an elder will read back to you.',
    }
  }

  const viewer = await getWriter()
  const gate = permissionCheck(viewer, 'admin.grant_permissions')
  if (!gate.allowed) return { ok: false, message: gate.note }

  const person = await personInChurch(personId, viewer.churchId)
  if (!person)
    return { ok: false, message: 'That person is not in this church.' }

  const existing = await db
    .select({ id: schema.clearanceGrants.id })
    .from(schema.clearanceGrants)
    .where(
      and(
        eq(schema.clearanceGrants.personId, personId),
        eq(schema.clearanceGrants.tier, tier),
        isNull(schema.clearanceGrants.revokedAt)
      )
    )
    .limit(1)

  if (existing.length > 0) {
    return {
      ok: false,
      message: `${person.fullName} already holds a live ${tierName(tier)} grant.`,
    }
  }

  await db.insert(schema.clearanceGrants).values({
    churchId: viewer.churchId,
    personId,
    tier,
    grantedById: viewer.personId,
    reason: reason.trim(),
  })

  revalidatePath('/admin')
  return {
    ok: true,
    message:
      person.id === viewer.personId
        ? `${tierName(tier)} granted to yourself. Self-grants are marked as such in the exceptions list.`
        : `${person.fullName} can now read at ${tierName(tier)}. Restoration cases are unaffected.`,
  }
}

/** Ends a grant. Stamps the row; the history stays. */
export async function revokeGrant(formData: FormData): Promise<ActionOutcome> {
  const grantId = formData.get('grantId')
  const kind = formData.get('kind')

  if (
    typeof grantId !== 'string' ||
    (kind !== 'permission' && kind !== 'clearance')
  ) {
    return { ok: false, message: 'Say which grant.' }
  }

  const viewer = await getWriter()
  const gate = permissionCheck(viewer, 'admin.grant_permissions')
  if (!gate.allowed) return { ok: false, message: gate.note }

  const table =
    kind === 'permission' ? schema.permissionGrants : schema.clearanceGrants

  const revoked = await db
    .update(table)
    .set({ revokedAt: new Date(), revokedById: viewer.personId })
    .where(
      and(
        eq(table.id, grantId),
        eq(table.churchId, viewer.churchId),
        isNull(table.revokedAt)
      )
    )
    .returning({ id: table.id })

  if (revoked.length === 0) {
    return {
      ok: false,
      message: 'That grant is already ended, or is not yours to end.',
    }
  }

  revalidatePath('/admin')
  return {
    ok: true,
    message:
      'Ended. The row stays, so who granted it and when it ended is still answerable.',
  }
}

/* ─────────────────────────── Planning Center ─────────────────────────── */

/**
 * Turn a sync category on or off.
 *
 * Routed through `setCategoryEnabled` rather than writing the row directly,
 * because that function is where §6's "not syncable and not switchable" lives.
 * Its refusal carries the reason, and the reason is what the administrator needs
 * — "confidential pastoral notes never leave Fold" is an answer, where a greyed
 * checkbox is not.
 */
export async function setSyncCategory(
  formData: FormData
): Promise<ActionOutcome> {
  const category = formData.get('category')
  const enabled = formData.get('enabled')

  if (typeof category !== 'string') {
    return { ok: false, message: 'Say which category.' }
  }

  const viewer = await getWriter()
  const gate = permissionCheck(viewer, 'admin.manage_integrations')
  if (!gate.allowed) return { ok: false, message: gate.note }

  const current = await db
    .select()
    .from(schema.syncSettings)
    .where(eq(schema.syncSettings.churchId, viewer.churchId))

  const settings = Object.fromEntries(
    current.map((row) => [row.category, row.enabled])
  )

  const change = setCategoryEnabled(
    settings,
    category as Parameters<typeof setCategoryEnabled>[1],
    enabled === 'true'
  )

  // The domain's own words, not a rewrite of them. §6's reason for a fixed
  // category is the useful thing to say, and it is said once.
  if (!change.ok) return { ok: false, message: change.refusal }

  await db
    .insert(schema.syncSettings)
    .values({
      churchId: viewer.churchId,
      category: category as Parameters<typeof setCategoryEnabled>[1],
      enabled: enabled === 'true',
      changedById: viewer.personId,
    })
    .onConflictDoUpdate({
      target: [schema.syncSettings.churchId, schema.syncSettings.category],
      set: {
        enabled: enabled === 'true',
        changedById: viewer.personId,
        changedAt: new Date(),
      },
    })

  revalidatePath('/admin')
  return {
    ok: true,
    message: enabled === 'true' ? 'Syncing.' : 'No longer syncing.',
  }
}
