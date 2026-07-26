/**
 * Roles and permissions — HANDOFF.md §5.
 *
 * Two things this file exists to guarantee:
 *
 * 1. `pathway.publish` is a distinct permission from `pathway.edit`.
 * 2. A permission note and its gate cannot drift apart. In the prototype they
 *    did, twice. So there is no separate table of explanatory copy: the only
 *    way to ask whether an action is allowed is `permissionCheck`, and it
 *    returns the answer and the sentence together.
 */

import {
  type ConfidentialityTier,
  clearanceReaches,
  compareTiers,
  highestTier,
} from './tiers'

/**
 * Roles a person can hold. A person holds one or more.
 *
 * The first seven are the product roles named in §5. The rest are the
 * care-structure roles named in §3's tier table, which §5 does not enumerate
 * but the confidentiality model depends on.
 */
export const ROLES = [
  'administrator',
  'pathway_designer',
  'reviewer_approver',
  'connection_team_leader',
  'pastor_elder',
  'lead_pastor',
  'executive_assistant',
  'pastoral_staff',
  'staff',
  'deacon',
  'group_leader',
] as const

export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  administrator: 'Administrator',
  pathway_designer: 'Pathway Designer',
  reviewer_approver: 'Reviewer / Approver',
  connection_team_leader: 'Connection Team Leader',
  pastor_elder: 'Pastor / Elder',
  lead_pastor: 'Lead Pastor',
  executive_assistant: 'Executive Assistant',
  pastoral_staff: 'Pastoral staff',
  staff: 'Staff',
  deacon: 'Deacon',
  group_leader: 'Group leader',
}

export function isRole(value: unknown): value is Role {
  return (
    typeof value === 'string' && (ROLES as readonly string[]).includes(value)
  )
}

/* ─────────────────────────── Permissions ─────────────────────────── */

export const PERMISSIONS = [
  // Pathway lifecycle. `edit` and `publish` are deliberately separate.
  'pathway.edit',
  'pathway.submit_for_review',
  'pathway.request_changes',
  'pathway.approve',
  'pathway.publish',
  'pathway.view',
  // Care.
  'care.log_note',
  'care.view_people',
  // Whether this person can be named as one of the two elders carrying a case.
  // Reading a case is governed by the elders_only tier, not by this.
  'restoration.be_assigned',
  // Administration.
  'admin.manage_roles',
  // Distinct from managing roles: this is the power to give one individual an
  // exception, including a confidentiality clearance their role does not carry.
  // Separate so it can be audited — and later withdrawn — on its own.
  'admin.grant_permissions',
  'admin.manage_integrations',
  'admin.manage_ai_settings',
  'admin.manage_templates',
  'reporting.view',
] as const

export type Permission = (typeof PERMISSIONS)[number]

/**
 * Which roles carry which permission.
 *
 * Read this as the authority for §4's transition table. Notably
 * `pathway.publish` is held by `reviewer_approver` and `administrator` only —
 * a `pathway_designer` can edit and submit but never approve or publish.
 */
const PERMISSION_HOLDERS: Record<Permission, readonly Role[]> = {
  'pathway.edit': ['administrator', 'pathway_designer'],
  'pathway.submit_for_review': ['administrator', 'pathway_designer'],
  'pathway.request_changes': ['administrator', 'reviewer_approver'],
  'pathway.approve': ['administrator', 'reviewer_approver'],
  'pathway.publish': ['administrator', 'reviewer_approver'],
  'pathway.view': [...ROLES],
  'care.log_note': [
    'pastor_elder',
    'lead_pastor',
    'pastoral_staff',
    'staff',
    'deacon',
    'group_leader',
    'connection_team_leader',
  ],
  'care.view_people': [
    'pastor_elder',
    'lead_pastor',
    'pastoral_staff',
    'staff',
    'deacon',
    'group_leader',
    'connection_team_leader',
    'executive_assistant',
  ],
  'restoration.be_assigned': ['pastor_elder', 'lead_pastor'],
  'admin.manage_roles': ['administrator'],
  'admin.grant_permissions': ['administrator'],
  'admin.manage_integrations': ['administrator'],
  'admin.manage_ai_settings': ['administrator'],
  'admin.manage_templates': ['administrator'],
  'reporting.view': [
    'administrator',
    'reviewer_approver',
    'lead_pastor',
    'pastor_elder',
    'pastoral_staff',
  ],
}

/**
 * Why a role does not hold a permission, in the church's own terms.
 *
 * These are reasons, not generic denials. They are keyed by permission because
 * that is what the reader is being refused, and they are only ever rendered
 * through `permissionCheck`, which computes `allowed` from
 * `PERMISSION_HOLDERS` in the same breath.
 */
const REFUSAL_REASONS: Record<Permission, string> = {
  'pathway.edit':
    'Editing the pathway is for pathway designers and administrators.',
  'pathway.submit_for_review':
    'Only a pathway designer or an administrator can submit a draft for review.',
  'pathway.request_changes':
    'Requesting changes is the reviewer’s move. You can raise a concern with them instead.',
  'pathway.approve':
    'Approving is for reviewers and administrators. A designer cannot approve their own work.',
  'pathway.publish':
    'Publishing is separate from editing. An approver or administrator publishes; a designer cannot.',
  'pathway.view': 'You do not have access to pathways.',
  'care.log_note': 'Logging care is for leaders who carry people.',
  'care.view_people': 'You do not have access to people records.',
  'restoration.be_assigned':
    'Restoration cases are carried by elders, so only an elder can be named on one.',
  'admin.manage_roles':
    'Only an administrator can change who holds which role.',
  'admin.grant_permissions':
    'Only an administrator can grant an individual access their role does not carry.',
  'admin.manage_integrations': 'Only an administrator can change integrations.',
  'admin.manage_ai_settings': 'Only an administrator can change AI settings.',
  'admin.manage_templates': 'Only an administrator can change templates.',
  'reporting.view':
    'Reporting is limited to staff, elders, and administrators.',
}

/* ─────────────────────── Roles that hold everything ─────────────────────── */

/**
 * Roles that carry every permission in the app.
 *
 * `lead_pastor` holds the highest authority in Fold: it can grant and revoke any
 * permission, change any setting, and reaches the top confidentiality tier.
 *
 * Written as a short-circuit rather than by listing `lead_pastor` in every entry
 * of `PERMISSION_HOLDERS`, which is the §8.1 point: a permission added later is
 * included automatically, where a hand-maintained list would silently omit it
 * and quietly narrow the role.
 */
export const UNRESTRICTED_ROLES: readonly Role[] = ['lead_pastor']

export function hasUnrestrictedRole(principal: Principal): boolean {
  return principal.roles.some((role) => UNRESTRICTED_ROLES.includes(role))
}

/** The affirmative sentence shown when an action IS offered. */
const GRANT_REASONS: Partial<Record<Permission, string>> = {
  'pathway.publish':
    'You can publish. Publishing creates a new version and takes effect for the church.',
  'pathway.approve':
    'You can approve, or request changes if something is unresolved.',
  'admin.grant_permissions':
    'You can grant an individual access beyond their role. Every grant is recorded with your name and your reason.',
}

/* ────────────────────── Individual grants over defaults ────────────────────── */

/**
 * Roles are the default. Grants are the exception.
 *
 * An administrator can give any individual any permission, and any
 * confidentiality clearance, when the church decides it is warranted. Polity
 * and staffing differ per church and the handoff warns against hardening one
 * church's answers into the schema, so the role table below is a starting
 * position rather than a ceiling.
 *
 * What a grant is not: a way to make the record vague. Every grant names the
 * **person** who made it — not their role, because a role cannot be held
 * accountable (§4) — with a timestamp and a written reason, both required.
 * Revoking keeps the row and stamps it, the same way §3 rule 4 keeps notes
 * rather than deleting them: a removed grant that leaves no trace is how "who
 * gave them access to that?" becomes unanswerable a year later.
 *
 * **One administrator is enough, including for `elders_only`.** Decided by the
 * lead pastor on 2026-07-26, after the alternative — requiring a second
 * administrator to countersign a top-tier grant, by analogy with §3's "never one
 * elder alone" — was raised and considered. It is deliberately absent, not
 * missing: §8.8's rule that a considered omission must be distinguishable from
 * an oversight applies to governance as much as to a stage with no stopping
 * rule. `a single administrator can grant elders_only` in the tests holds this
 * open, so adding a countersign requirement has to be a decision rather than a
 * quiet tightening.
 *
 * The safeguard chosen instead is visibility: `grantedExceptions` puts every
 * grant on one review list with who made it and why, and marks self-grants.
 */
type GrantRecord = {
  id: string
  /** The person who granted it. Never a role string. */
  grantedById: string
  grantedByName: string
  grantedAt: Date
  /** Required. A grant without a stated reason is not reviewable. */
  reason: string
  revokedAt?: Date | null
  revokedById?: string | null
}

export type PermissionGrant = GrantRecord & { permission: Permission }

export type ClearanceGrant = GrantRecord & { tier: ConfidentialityTier }

export function isGrantActive(grant: GrantRecord): boolean {
  return grant.revokedAt === null || grant.revokedAt === undefined
}

/**
 * Everything an authorization decision is allowed to depend on.
 *
 * Grants live here rather than being passed alongside, so a call site cannot
 * check permissions and silently forget that this person has a grant. That was
 * the shape of the §8.3 drift in the prototype: two sources of truth for one
 * question.
 */
export type Principal = {
  personId: string
  roles: readonly Role[]
  permissionGrants?: readonly PermissionGrant[]
  clearanceGrants?: readonly ClearanceGrant[]
}

/** Build a principal that holds roles and nothing else. */
export function principalOf(
  personId: string,
  roles: readonly Role[]
): Principal {
  return { personId, roles }
}

/** Where an allowance came from. Drives the wording of the note. */
export type PermissionSource = 'role' | 'grant'

export type PermissionCheck = {
  permission: Permission
  allowed: boolean
  /**
   * `'role'` when a role carries it by default, `'grant'` when an
   * administrator gave it to this person specifically. `null` when refused.
   */
  source: PermissionSource | null
  /** The grant that allowed it, when `source` is `'grant'`. */
  grant: PermissionGrant | null
  /**
   * The sentence to show the user. Always present, and always computed from
   * the same evaluation as `allowed` — §8.3. A UI that renders this note while
   * ignoring `allowed` (or the reverse) is the bug the prototype hit; both
   * come from one object so they cannot disagree.
   */
  note: string
}

/**
 * The only way to ask whether someone may do something.
 *
 * Returns the gate and its explanation together. Callers must drive both the
 * `disabled` attribute and the visible note from this one result — §8.3 and
 * §8.4.
 *
 * Takes a `Principal` rather than a role array on purpose: a signature that
 * accepted bare roles would quietly answer the wrong question for anyone
 * holding a grant.
 */
export function permissionCheck(
  principal: Principal,
  permission: Permission
): PermissionCheck {
  const holders = PERMISSION_HOLDERS[permission]
  if (!holders) {
    throw new Error(`Unknown permission: ${String(permission)}`)
  }

  const byRole =
    principal.roles.some((role) => holders.includes(role)) ||
    hasUnrestrictedRole(principal)
  if (byRole) {
    return {
      permission,
      allowed: true,
      source: 'role',
      grant: null,
      note: GRANT_REASONS[permission] ?? 'You can do this.',
    }
  }

  const grant = (principal.permissionGrants ?? []).find(
    (candidate) =>
      candidate.permission === permission && isGrantActive(candidate)
  )
  if (grant) {
    return {
      permission,
      allowed: true,
      source: 'grant',
      grant,
      // The note says who gave it. Someone reading their own unusual access
      // should be able to see where it came from without asking.
      note: `${GRANT_REASONS[permission] ?? 'You can do this.'} Granted to you by ${
        grant.grantedByName
      } on ${formatGrantDate(grant.grantedAt)} — ${grant.reason}`,
    }
  }

  return {
    permission,
    allowed: false,
    source: null,
    grant: null,
    note: REFUSAL_REASONS[permission],
  }
}

function formatGrantDate(when: Date): string {
  return when.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** Convenience for call sites that genuinely only need the boolean. */
export function can(principal: Principal, permission: Permission): boolean {
  return permissionCheck(principal, permission).allowed
}

/* ──────────────────── Clearance, derived from roles ──────────────────── */

/**
 * The confidentiality ceiling each role carries on its own.
 *
 * `null` means the role grants no pastoral care access at all. That is a
 * deliberate position on three roles, and worth stating plainly:
 *
 * - `administrator` is a technical role — integrations, templates, AI
 *   settings, publishing. Nothing in §5 puts pastoral care in its scope, and
 *   making the person who configures the software the person who can read
 *   every restoration case would defeat §3 entirely.
 * - `pathway_designer` and `reviewer_approver` are workflow roles over
 *   pathway configuration, not people.
 *
 * - `executive_assistant` caps at `all_leaders`. §5 says no *automatic*
 *   access to confidential pastoral content; "confidential" in §3's table
 *   begins at `staff_and_elders`. The word "automatic" implies it can be
 *   granted, which happens here by also holding another role.
 *
 * `lead_pastor` and `pastor_elder` both reach `elders_only`. A lead pastor is an
 * elder; the app does not model the distinction, because who holds which role is
 * something an administrator assigns rather than something the code decides.
 */
const ROLE_CLEARANCE: Record<Role, ConfidentialityTier | null> = {
  administrator: null,
  pathway_designer: null,
  reviewer_approver: null,
  connection_team_leader: 'all_leaders',
  group_leader: 'all_leaders',
  deacon: 'all_leaders',
  staff: 'all_leaders',
  executive_assistant: 'all_leaders',
  pastoral_staff: 'staff_and_elders',
  lead_pastor: 'elders_only',
  pastor_elder: 'elders_only',
}

/** The clearance a principal's roles carry on their own, before any grant. */
export function roleClearance(
  roles: readonly Role[]
): ConfidentialityTier | null {
  const tiers = roles
    .map((role) => ROLE_CLEARANCE[role])
    .filter((tier): tier is ConfidentialityTier => tier !== null)
  return highestTier(tiers)
}

export type ClearanceResolution = {
  tier: ConfidentialityTier | null
  source: PermissionSource | null
  /** The grant that raised the clearance, when it did. */
  grant: ClearanceGrant | null
}

/**
 * A principal's clearance: the highest of their role default and any granted
 * tier. Derived on every read, never stored.
 *
 * `null` means no pastoral care access. `null` is returned rather than
 * defaulting to the lowest tier because a default would silently grant ordinary
 * care access to every administrator.
 *
 * A grant only ever *raises* clearance. Lowering someone below what their role
 * carries is a role change, not a grant — otherwise two mechanisms would
 * disagree about the same question and the more permissive one would win by
 * accident.
 */
export function resolveClearance(principal: Principal): ClearanceResolution {
  const fromRole = roleClearance(principal.roles)

  const granted = (principal.clearanceGrants ?? [])
    .filter(isGrantActive)
    .reduce<ClearanceGrant | null>(
      (best, candidate) =>
        best === null || compareTiers(candidate.tier, best.tier) > 0
          ? candidate
          : best,
      null
    )

  if (granted === null) {
    return {
      tier: fromRole,
      source: fromRole === null ? null : 'role',
      grant: null,
    }
  }
  if (fromRole !== null && compareTiers(fromRole, granted.tier) >= 0) {
    return { tier: fromRole, source: 'role', grant: null }
  }
  return { tier: granted.tier, source: 'grant', grant: granted }
}

/** The resolved tier alone, for the many call sites that need only that. */
export function clearanceFor(principal: Principal): ConfidentialityTier | null {
  return resolveClearance(principal).tier
}

/** Whether this principal reaches content written at `contentTier`. */
export function principalReaches(
  principal: Principal,
  contentTier: ConfidentialityTier
): boolean {
  const clearance = clearanceFor(principal)
  return clearance !== null && clearanceReaches(clearance, contentTier)
}

/**
 * How many leaders sit at each tier, computed from roles and grants together.
 *
 * This replaces the prototype's hardcoded "61 people / 14 people / 6 people"
 * captions — §8.1. A person is counted at their resolved clearance, so someone
 * holding a granted tier is counted there and not at their role default.
 */
export function countLeadersByClearance(
  leaders: readonly Principal[]
): Record<ConfidentialityTier, number> {
  const counts: Record<ConfidentialityTier, number> = {
    all_leaders: 0,
    staff_and_elders: 0,
    elders_only: 0,
  }
  for (const leader of leaders) {
    const clearance = clearanceFor(leader)
    if (clearance !== null) counts[clearance] += 1
  }
  return counts
}

/**
 * Leaders whose access exceeds what their role carries.
 *
 * The review list for the elder board. An administrator can grant anything, so
 * the safeguard is not a narrower gate — it is that every exception is visible
 * in one place, with who granted it and why. A grant nobody ever looks at is
 * the same as no grant policy at all.
 */
export function grantedExceptions(leaders: readonly Principal[]): {
  personId: string
  clearance: ClearanceGrant | null
  permissions: PermissionGrant[]
  /** An administrator granting themselves access is the obvious abuse path. */
  selfGranted: boolean
}[] {
  return leaders
    .map((leader) => {
      const resolution = resolveClearance(leader)
      const clearance = resolution.source === 'grant' ? resolution.grant : null
      const permissions = (leader.permissionGrants ?? []).filter(isGrantActive)
      const selfGranted =
        clearance?.grantedById === leader.personId ||
        permissions.some((grant) => grant.grantedById === leader.personId)
      return { personId: leader.personId, clearance, permissions, selfGranted }
    })
    .filter((row) => row.clearance !== null || row.permissions.length > 0)
}
