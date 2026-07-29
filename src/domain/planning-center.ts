/**
 * Planning Center integration — HANDOFF.md §6, build order §11 step 6.
 *
 * The division of labour: **Planning Center is the system of record for people
 * and ministry data. Fold is the system of work for pathways and care.**
 *
 * Two rules shape everything here, and both are refusals.
 *
 * **Fold never creates anything in Planning Center.** Not a field, not a
 * category, not a list, and not a *status value*. When a milestone has nowhere
 * to go, the honest answers are to keep it in Fold or to go and create it in
 * Planning Center first — never for Fold to invent one. So there is no function
 * in this module that produces an external field, only functions that filter the
 * ones already there.
 *
 * **Some content never crosses, and that is not a setting.** Confidential
 * pastoral notes are not syncable and not switchable, so the type of a sync
 * setting cannot express "confidential notes, on".
 *
 * §11 says to build the mapping constraints first, which is why this module is
 * all constraint and no API client: what a sync client may attempt has to be
 * settled before anything can attempt it.
 */

/* ──────────────────────────── Sync categories ──────────────────────────── */

export const SYNC_DIRECTIONS = [
  'both',
  'pc_to_fold',
  'fold_to_pc',
  'never',
] as const

export type SyncDirection = (typeof SYNC_DIRECTIONS)[number]

export const SYNC_CATEGORIES = [
  'people_and_households',
  'new_profiles',
  'attendance_and_checkin',
  'forms_and_registrations',
  'membership_status',
  'groups_and_serving',
  'ordinary_care_notes',
  'confidential_pastoral_notes',
] as const

export type SyncCategory = (typeof SYNC_CATEGORIES)[number]

type CategoryRule = {
  label: string
  direction: SyncDirection
  /** Whether the church may turn this category on and off. */
  switchable: boolean
  /** Whether it is on before anyone chooses. */
  onByDefault: boolean
  /** Which system wins when both sides changed the same thing. */
  conflictWinner: 'planning_center' | 'fold' | null
  /** Why it is fixed, when it is. Shown instead of a control. */
  fixedReason: string | null
}

/**
 * §6's table, transcribed. "Not everything syncs because it can" — each category
 * is a decision with a direction, rather than a single global switch.
 */
const CATEGORY_RULES: Record<SyncCategory, CategoryRule> = {
  people_and_households: {
    label: 'People and households',
    direction: 'both',
    switchable: true,
    onByDefault: true,
    conflictWinner: 'planning_center',
    fixedReason: null,
  },
  new_profiles: {
    label: 'New profiles',
    direction: 'both',
    switchable: true,
    onByDefault: true,
    conflictWinner: 'planning_center',
    fixedReason: null,
  },
  attendance_and_checkin: {
    label: 'Attendance and check-in',
    direction: 'pc_to_fold',
    switchable: true,
    onByDefault: true,
    conflictWinner: null,
    fixedReason: null,
  },
  forms_and_registrations: {
    label: 'Forms and registrations',
    direction: 'pc_to_fold',
    switchable: true,
    onByDefault: true,
    conflictWinner: null,
    fixedReason: null,
  },
  membership_status: {
    label: 'Membership status',
    direction: 'fold_to_pc',
    switchable: true,
    onByDefault: true,
    conflictWinner: null,
    fixedReason: null,
  },
  groups_and_serving: {
    label: 'Groups and serving',
    direction: 'pc_to_fold',
    switchable: true,
    onByDefault: true,
    conflictWinner: null,
    fixedReason: null,
  },
  ordinary_care_notes: {
    label: 'Ordinary care notes',
    direction: 'both',
    switchable: true,
    // §6: "Off by default." A church can choose to push care notes out; nothing
    // should choose it for them.
    onByDefault: false,
    conflictWinner: 'fold',
    fixedReason: null,
  },
  confidential_pastoral_notes: {
    label: 'Confidential pastoral notes',
    direction: 'never',
    // §6: "Never. Not syncable and not switchable."
    switchable: false,
    onByDefault: false,
    conflictWinner: null,
    fixedReason:
      'Confidential pastoral notes never leave Fold. This is not a setting that happens to be off — there is no way to turn it on.',
  },
}

export function categoryRule(category: SyncCategory): CategoryRule {
  const rule = CATEGORY_RULES[category]
  if (!rule) throw new Error(`Unknown sync category: ${String(category)}`)
  return rule
}

export const DIRECTION_LABELS: Record<SyncDirection, string> = {
  both: 'Both ways',
  pc_to_fold: 'Planning Center to Fold',
  fold_to_pc: 'Fold to Planning Center',
  never: 'Never',
}

/** What the church has chosen, category by category. */
export type SyncSettings = Partial<Record<SyncCategory, boolean>>

/** Whether a category is on, falling back to §6's default. */
export function isCategoryEnabled(
  settings: SyncSettings,
  category: SyncCategory
): boolean {
  const rule = categoryRule(category)
  if (!rule.switchable) return rule.onByDefault
  return settings[category] ?? rule.onByDefault
}

export type SettingChange =
  { ok: true; settings: SyncSettings } | { ok: false; refusal: string }

/**
 * Turn a category on or off.
 *
 * Returns a refusal for a category §6 fixes, rather than accepting the change
 * and quietly ignoring it. A setting that appears to save and then does nothing
 * is worse than one that is never offered.
 */
export function setCategoryEnabled(
  settings: SyncSettings,
  category: SyncCategory,
  enabled: boolean
): SettingChange {
  const rule = categoryRule(category)
  if (!rule.switchable) {
    return { ok: false, refusal: rule.fixedReason ?? 'This category is fixed.' }
  }
  return { ok: true, settings: { ...settings, [category]: enabled } }
}

/* ─────────────────────── Content that never crosses ─────────────────────── */

/**
 * §6's "Never sync" list, as a property of the integration rather than a
 * setting. Nothing in this module consults a configuration before answering.
 */
export const NEVER_SYNC_CONTENT = [
  'escalation_reason',
  'restoration_note',
  'benevolence_amount',
  'benevolence_reason',
  'marriage_note',
  'personal_struggle_note',
] as const

export type NeverSyncContent = (typeof NEVER_SYNC_CONTENT)[number]

/**
 * The one piece of an escalation that does cross.
 *
 * §6: "the flag syncs so leaders know care is happening, the reason does not."
 * Both halves matter — suppressing the flag as well would leave a leader in
 * Planning Center with no idea anyone was being cared for.
 */
export const SYNCABLE_ESCALATION_FIELD = 'escalation_flag'

export type ContentKind = NeverSyncContent | typeof SYNCABLE_ESCALATION_FIELD

export function isSyncableContent(kind: ContentKind): boolean {
  return !(NEVER_SYNC_CONTENT as readonly string[]).includes(kind)
}

export function neverSyncReason(kind: ContentKind): string | null {
  if (isSyncableContent(kind)) return null
  if (kind === 'escalation_reason') {
    return 'The escalation flag syncs so leaders know care is happening. The reason stays in Fold.'
  }
  return 'This content never leaves Fold. It is a property of the integration, not a setting.'
}

/**
 * What an escalation contributes to a Planning Center push.
 *
 * Written as one function so the flag and the reason cannot be handled in two
 * places that drift apart.
 */
export function escalationPayload(escalation: {
  isEscalated: boolean
  reason: string
}): { escalated: boolean } {
  // The reason is deliberately not read. Destructuring it here would be the
  // first step toward it appearing in a payload by accident.
  return { escalated: escalation.isEscalated }
}

/* ───────────────────────────── Field mapping ───────────────────────────── */

export type ExternalFieldKind =
  'field' | 'list' | 'membership_type' | 'status_field'

/**
 * Something that already exists in Planning Center.
 *
 * Only ever read. There is no constructor for this type anywhere in Fold, which
 * is the §6 hard constraint expressed as code: a value that is not already in
 * Planning Center cannot be represented.
 */
export type ExternalField = {
  id: string
  label: string
  kind: ExternalFieldKind
  /** For a status field, the values Planning Center already accepts. */
  allowedValues?: readonly string[]
}

export type MilestoneMapping =
  | {
      state: 'mapped'
      externalFieldId: string
      /** §2: the mapping declares which system owns the value. */
      owningSystem: 'fold' | 'planning_center'
      /** For a status field, the existing value being written. */
      value?: string
    }
  /** Deliberately kept in Fold. §8.8 — a decision, with a reason. */
  | { state: 'fold_only'; reason: string }
  /** Nobody has decided yet. Distinguishable from the above, on purpose. */
  | { state: 'unmapped' }

export function isDeliberatelyUnmapped(mapping: MilestoneMapping): boolean {
  return mapping.state === 'fold_only'
}

/** Mappings that look like an oversight rather than a decision (§8.8). */
export function undecidedMappings<T extends { mapping: MilestoneMapping }>(
  entries: readonly T[]
): T[] {
  return entries.filter((entry) => entry.mapping.state === 'unmapped')
}

export type MappingOption =
  | { kind: 'existing_field'; field: ExternalField }
  | { kind: 'keep_in_fold' }
  | { kind: 'create_in_planning_center_first' }

/**
 * What a church may do with a milestone that needs a home.
 *
 * The existing fields, then the two honest fallbacks §6 names. Note the second
 * fallback is *instruction*, not action: Fold tells you to go and create it in
 * Planning Center, and offers no button that would do it.
 */
export function mappingOptions(
  availableFields: readonly ExternalField[]
): MappingOption[] {
  return [
    ...availableFields.map((field) => ({
      kind: 'existing_field' as const,
      field,
    })),
    { kind: 'keep_in_fold' as const },
    { kind: 'create_in_planning_center_first' as const },
  ]
}

export const CREATE_FIRST_GUIDANCE =
  'Nothing in Planning Center fits this milestone. Create the field or value there first and come back, or keep the milestone in Fold. Fold will not add anything to Planning Center on your behalf.'

export type MappingAttempt =
  { ok: true; mapping: MilestoneMapping } | { ok: false; refusal: string }

/**
 * Map a milestone to a field that must already exist.
 *
 * Refuses an unknown field id, and refuses a status value Planning Center does
 * not already accept — §6 applies "only what already exists" to **values** as
 * well as fields. The named example: if the membership status has no "Pending
 * elder review" option, Fold cannot invent one.
 */
export function mapMilestone({
  availableFields,
  externalFieldId,
  owningSystem,
  value,
}: {
  availableFields: readonly ExternalField[]
  externalFieldId: string
  owningSystem: 'fold' | 'planning_center'
  value?: string
}): MappingAttempt {
  const field = availableFields.find(
    (candidate) => candidate.id === externalFieldId
  )
  if (!field) {
    return {
      ok: false,
      refusal: `There is no field called “${externalFieldId}” in Planning Center. ${CREATE_FIRST_GUIDANCE}`,
    }
  }

  if (field.allowedValues) {
    if (value === undefined) {
      return {
        ok: false,
        refusal: `“${field.label}” needs one of its existing values, and none was chosen.`,
      }
    }
    if (!field.allowedValues.includes(value)) {
      return {
        ok: false,
        refusal: `“${field.label}” has no value “${value}” in Planning Center. It accepts: ${field.allowedValues.join(', ')}. Add the value there first, or keep this milestone in Fold — Fold will not create it.`,
      }
    }
  }

  return {
    ok: true,
    mapping: {
      state: 'mapped',
      externalFieldId: field.id,
      owningSystem,
      ...(value === undefined ? {} : { value }),
    },
  }
}

/* ──────────────────────── The Family and Guest lists ──────────────────────── */

/**
 * §6: Fold keeps its own Family list (members under an elder) and Guest list
 * (anyone in the pathway who is not yet a member). Each maps to an existing
 * Planning Center membership type or list, or stays Fold-only.
 */
export const FOLD_LISTS = ['family', 'guest'] as const
export type FoldList = (typeof FOLD_LISTS)[number]

export const FOLD_LIST_LABELS: Record<FoldList, string> = {
  family: 'Family',
  // Plural, because it names a list of people rather than one of them.
  guest: 'Guests',
}

export const FOLD_LIST_DEFINITIONS: Record<FoldList, string> = {
  family: 'Members under an elder.',
  guest: 'Anyone in the pathway who is not yet a member.',
}

export type ListMapping =
  | { state: 'mapped'; externalFieldId: string }
  | { state: 'fold_only'; reason: string }
  | { state: 'unmapped' }

/** A list maps only to an existing membership type or list, never a new one. */
export function mapFoldList({
  availableFields,
  externalFieldId,
}: {
  availableFields: readonly ExternalField[]
  externalFieldId: string
}): { ok: true; mapping: ListMapping } | { ok: false; refusal: string } {
  const field = availableFields.find(
    (candidate) => candidate.id === externalFieldId
  )
  if (!field) {
    return {
      ok: false,
      refusal: `There is no list or membership type called “${externalFieldId}” in Planning Center. ${CREATE_FIRST_GUIDANCE}`,
    }
  }
  if (field.kind !== 'list' && field.kind !== 'membership_type') {
    return {
      ok: false,
      refusal: `“${field.label}” is not a list or a membership type, so people cannot be placed in it.`,
    }
  }
  return { ok: true, mapping: { state: 'mapped', externalFieldId: field.id } }
}

/* ──────────────────────────── Matching people ──────────────────────────── */

/** §6's order, and it is an order rather than a set. */
export const MATCH_ORDER = ['planning_center_id', 'email', 'phone'] as const
export type MatchField = (typeof MATCH_ORDER)[number]

export type MatchCandidate = {
  personId: string
  planningCenterId: string | null
  email: string | null
  phone: string | null
  fullName: string
}

export type MatchResult =
  | { kind: 'matched'; personId: string; matchedOn: MatchField }
  | {
      kind: 'possible_duplicates'
      /** Surfaced for a human to resolve. Never merged here. */
      candidates: readonly {
        personId: string
        fullName: string
        matchedOn: MatchField
      }[]
      guidance: string
    }
  | { kind: 'no_match' }

export const DUPLICATE_GUIDANCE =
  'More than one person matches. Fold will not choose between them: a duplicate is visible and annoying, a wrong merge puts two people’s histories in one record.'

function normalise(value: string | null): string | null {
  if (value === null) return null
  const trimmed = value.trim().toLowerCase()
  return trimmed === '' ? null : trimmed
}

/**
 * A phone number reduced to something comparable.
 *
 * Compares the last ten digits when there are at least that many, so
 * `+1 (555) 000-2222` and `555-000-2222` are recognised as one number — a church
 * directory will hold both spellings of the same phone. Ten digits is a North
 * American assumption, and it will occasionally treat two different
 * international numbers sharing a suffix as a match.
 *
 * That is acceptable here only because of what a phone match leads to: a
 * *surfaced possible duplicate* for a person to resolve, never an automatic
 * merge. A rule that produced merges would need to be stricter than this.
 */
function digits(value: string | null): string | null {
  if (value === null) return null
  const only = value.replace(/\D/g, '')
  if (only === '') return null
  return only.length > 10 ? only.slice(-10) : only
}

/**
 * Find the person an incoming profile refers to.
 *
 * Tries each field in §6's order and stops at the first that matches. A single
 * hit on a stronger field beats several on a weaker one, which is why this is a
 * loop over an ordered list rather than a scored comparison.
 *
 * There is deliberately no `merge` in this module. The most this can do is name
 * the candidates.
 */
export function matchPerson(
  incoming: {
    planningCenterId: string | null
    email: string | null
    phone: string | null
  },
  existing: readonly MatchCandidate[]
): MatchResult {
  for (const field of MATCH_ORDER) {
    const hits = existing.filter((candidate) => {
      if (field === 'planning_center_id') {
        const wanted = normalise(incoming.planningCenterId)
        return (
          wanted !== null && normalise(candidate.planningCenterId) === wanted
        )
      }
      if (field === 'email') {
        const wanted = normalise(incoming.email)
        return wanted !== null && normalise(candidate.email) === wanted
      }
      const wanted = digits(incoming.phone)
      return wanted !== null && digits(candidate.phone) === wanted
    })

    if (hits.length === 1) {
      return { kind: 'matched', personId: hits[0]!.personId, matchedOn: field }
    }
    if (hits.length > 1) {
      return {
        kind: 'possible_duplicates',
        candidates: hits.map((hit) => ({
          personId: hit.personId,
          fullName: hit.fullName,
          matchedOn: field,
        })),
        guidance: DUPLICATE_GUIDANCE,
      }
    }
  }

  return { kind: 'no_match' }
}

/**
 * Where a profile arriving from Planning Center belongs.
 *
 * §6: sorted into Family or Guest "by the same mapping read in reverse". Returns
 * `null` when neither list is mapped, which is a real answer rather than a
 * failure — a church may keep both lists Fold-only.
 */
export function foldListForIncoming(
  externalFieldIds: readonly string[],
  mappings: Record<FoldList, ListMapping>
): FoldList | null {
  for (const list of FOLD_LISTS) {
    const mapping = mappings[list]
    if (
      mapping.state === 'mapped' &&
      externalFieldIds.includes(mapping.externalFieldId)
    ) {
      return list
    }
  }
  return null
}
