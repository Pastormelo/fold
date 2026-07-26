import { describe, expect, it } from 'vitest'

import {
  DIRECTION_LABELS,
  type ExternalField,
  FOLD_LISTS,
  type ListMapping,
  MATCH_ORDER,
  type MatchCandidate,
  NEVER_SYNC_CONTENT,
  SYNC_CATEGORIES,
  SYNC_DIRECTIONS,
  type SyncSettings,
  categoryRule,
  escalationPayload,
  foldListForIncoming,
  isCategoryEnabled,
  isDeliberatelyUnmapped,
  isSyncableContent,
  mapFoldList,
  mapMilestone,
  mappingOptions,
  matchPerson,
  neverSyncReason,
  setCategoryEnabled,
  undecidedMappings,
} from './planning-center'

const existingFields: ExternalField[] = [
  { id: 'pc-field-baptism', label: 'Baptism date', kind: 'field' },
  { id: 'pc-list-members', label: 'Members', kind: 'membership_type' },
  { id: 'pc-list-newcomers', label: 'Newcomers', kind: 'list' },
  {
    id: 'pc-status',
    label: 'Membership status',
    kind: 'status_field',
    allowedValues: ['Member', 'Attender', 'Inactive'],
  },
]

describe('sync scope is a per-category decision', () => {
  it('covers §6’s eight categories', () => {
    expect([...SYNC_CATEGORIES]).toEqual([
      'people_and_households',
      'new_profiles',
      'attendance_and_checkin',
      'forms_and_registrations',
      'membership_status',
      'groups_and_serving',
      'ordinary_care_notes',
      'confidential_pastoral_notes',
    ])
  })

  it('gives every category a direction and a label', () => {
    for (const category of SYNC_CATEGORIES) {
      const rule = categoryRule(category)
      expect(SYNC_DIRECTIONS).toContain(rule.direction)
      expect(rule.label).toBeTruthy()
      expect(DIRECTION_LABELS[rule.direction]).toBeTruthy()
    }
  })

  it('matches §6’s table', () => {
    expect(categoryRule('people_and_households').direction).toBe('both')
    expect(categoryRule('attendance_and_checkin').direction).toBe('pc_to_fold')
    expect(categoryRule('forms_and_registrations').direction).toBe('pc_to_fold')
    expect(categoryRule('membership_status').direction).toBe('fold_to_pc')
    expect(categoryRule('groups_and_serving').direction).toBe('pc_to_fold')
    expect(categoryRule('confidential_pastoral_notes').direction).toBe('never')
  })

  it('lets Planning Center win conflicts on people and households', () => {
    expect(categoryRule('people_and_households').conflictWinner).toBe(
      'planning_center'
    )
  })

  it('leaves ordinary care notes off until a church chooses', () => {
    // §6: "Off by default."
    expect(isCategoryEnabled({}, 'ordinary_care_notes')).toBe(false)
    const changed = setCategoryEnabled({}, 'ordinary_care_notes', true)
    expect(changed.ok).toBe(true)
    if (!changed.ok) throw new Error('unreachable')
    expect(isCategoryEnabled(changed.settings, 'ordinary_care_notes')).toBe(
      true
    )
  })

  it('has the other categories on by default', () => {
    expect(isCategoryEnabled({}, 'people_and_households')).toBe(true)
    expect(isCategoryEnabled({}, 'membership_status')).toBe(true)
  })

  it('throws on an unknown category', () => {
    expect(() => categoryRule('payroll' as never)).toThrow(
      /Unknown sync category/
    )
  })
})

describe('confidential notes are not switchable', () => {
  // §6: "Never. Not syncable and not switchable."
  it('refuses to turn them on', () => {
    const attempt = setCategoryEnabled({}, 'confidential_pastoral_notes', true)
    expect(attempt.ok).toBe(false)
    if (attempt.ok) throw new Error('unreachable')
    expect(attempt.refusal).toMatch(/no way to turn it on/)
  })

  it('stays off even if a stored setting says otherwise', () => {
    // A hand-edited settings row, or one written before the rule existed, must
    // not be able to enable it.
    const tampered: SyncSettings = { confidential_pastoral_notes: true }
    expect(isCategoryEnabled(tampered, 'confidential_pastoral_notes')).toBe(
      false
    )
  })

  it('explains itself as a property rather than a preference', () => {
    expect(categoryRule('confidential_pastoral_notes').fixedReason).toMatch(
      /not a setting that happens to be off/
    )
  })
})

describe('content that never crosses', () => {
  it('covers §6’s never-sync list', () => {
    expect([...NEVER_SYNC_CONTENT]).toEqual([
      'escalation_reason',
      'restoration_note',
      'benevolence_amount',
      'benevolence_reason',
      'marriage_note',
      'personal_struggle_note',
    ])
  })

  it('refuses each of them', () => {
    for (const kind of NEVER_SYNC_CONTENT) {
      expect(isSyncableContent(kind), kind).toBe(false)
      expect(neverSyncReason(kind), kind).toBeTruthy()
    }
  })

  it('syncs the escalation flag but not the reason', () => {
    // §6: "the flag syncs so leaders know care is happening, the reason does
    // not." Both halves matter.
    expect(isSyncableContent('escalation_flag')).toBe(true)
    expect(isSyncableContent('escalation_reason')).toBe(false)
    expect(neverSyncReason('escalation_reason')).toMatch(
      /flag syncs so leaders know care is happening/
    )
  })

  it('builds an escalation payload carrying no reason', () => {
    const payload = escalationPayload({
      isEscalated: true,
      reason: 'Something a leader must not read in Planning Center.',
    })
    expect(payload).toEqual({ escalated: true })
    expect(JSON.stringify(payload)).not.toContain('must not read')
  })

  it('still reports an escalation that has not happened', () => {
    expect(escalationPayload({ isEscalated: false, reason: '' })).toEqual({
      escalated: false,
    })
  })
})

describe('Fold never creates anything in Planning Center', () => {
  // §6's hard constraint.
  it('offers only fields that already exist, plus the two honest fallbacks', () => {
    const options = mappingOptions(existingFields)
    const existing = options.filter(
      (option) => option.kind === 'existing_field'
    )
    expect(existing).toHaveLength(existingFields.length)
    expect(options.map((option) => option.kind)).toContain('keep_in_fold')
    expect(options.map((option) => option.kind)).toContain(
      'create_in_planning_center_first'
    )
  })

  it('offers nothing but the fallbacks when Planning Center has no fields', () => {
    expect(mappingOptions([]).map((option) => option.kind)).toEqual([
      'keep_in_fold',
      'create_in_planning_center_first',
    ])
  })

  it('refuses a field that does not exist', () => {
    const attempt = mapMilestone({
      availableFields: existingFields,
      externalFieldId: 'pc-field-invented',
      owningSystem: 'fold',
    })
    expect(attempt.ok).toBe(false)
    if (attempt.ok) throw new Error('unreachable')
    expect(attempt.refusal).toMatch(/will not add anything to Planning Center/)
  })

  it('maps to a field that does exist', () => {
    const attempt = mapMilestone({
      availableFields: existingFields,
      externalFieldId: 'pc-field-baptism',
      owningSystem: 'fold',
    })
    expect(attempt.ok).toBe(true)
    if (!attempt.ok) throw new Error('unreachable')
    expect(attempt.mapping).toEqual({
      state: 'mapped',
      externalFieldId: 'pc-field-baptism',
      owningSystem: 'fold',
    })
  })
})

describe('the constraint applies to values, not only fields', () => {
  // §6's named example: "If the membership status has no 'Pending elder review'
  // option, Fold cannot invent one."
  it('refuses a status value Planning Center does not have', () => {
    const attempt = mapMilestone({
      availableFields: existingFields,
      externalFieldId: 'pc-status',
      owningSystem: 'fold',
      value: 'Pending elder review',
    })
    expect(attempt.ok).toBe(false)
    if (attempt.ok) throw new Error('unreachable')
    expect(attempt.refusal).toMatch(/has no value “Pending elder review”/)
    // Says what it does accept, so the next step is obvious.
    expect(attempt.refusal).toMatch(/Member, Attender, Inactive/)
    expect(attempt.refusal).toMatch(/Fold will not create it/)
  })

  it('accepts a value it already has', () => {
    const attempt = mapMilestone({
      availableFields: existingFields,
      externalFieldId: 'pc-status',
      owningSystem: 'fold',
      value: 'Attender',
    })
    expect(attempt.ok).toBe(true)
    if (!attempt.ok) throw new Error('unreachable')
    expect(attempt.mapping).toMatchObject({ value: 'Attender' })
  })

  it('refuses a status field with no value chosen at all', () => {
    const attempt = mapMilestone({
      availableFields: existingFields,
      externalFieldId: 'pc-status',
      owningSystem: 'fold',
    })
    expect(attempt.ok).toBe(false)
    if (attempt.ok) throw new Error('unreachable')
    expect(attempt.refusal).toMatch(/none was chosen/)
  })
})

describe('deliberate absence is not a defect', () => {
  // §8.8, applied to mapping.
  it('tells a decision apart from an oversight', () => {
    expect(
      isDeliberatelyUnmapped({
        state: 'fold_only',
        reason: 'Fold-only by choice.',
      })
    ).toBe(true)
    expect(isDeliberatelyUnmapped({ state: 'unmapped' })).toBe(false)
  })

  it('lists only the ones nobody has decided', () => {
    const milestones = [
      {
        name: 'Baptised',
        mapping: {
          state: 'mapped' as const,
          externalFieldId: 'pc-field-baptism',
          owningSystem: 'fold' as const,
        },
      },
      {
        name: 'Membership class',
        mapping: {
          state: 'fold_only' as const,
          reason: 'Tracked in Fold on purpose.',
        },
      },
      { name: 'First visit', mapping: { state: 'unmapped' as const } },
    ]
    const undecided = undecidedMappings(milestones)
    expect(undecided.map((entry) => entry.name)).toEqual(['First visit'])
  })
})

describe('the Family and Guest lists', () => {
  it('has both, each defined', () => {
    expect([...FOLD_LISTS]).toEqual(['family', 'guest'])
  })

  it('maps to an existing membership type', () => {
    const attempt = mapFoldList({
      availableFields: existingFields,
      externalFieldId: 'pc-list-members',
    })
    expect(attempt.ok).toBe(true)
  })

  it('refuses a list that does not exist', () => {
    const attempt = mapFoldList({
      availableFields: existingFields,
      externalFieldId: 'pc-list-invented',
    })
    expect(attempt.ok).toBe(false)
  })

  it('refuses a field that is not somewhere people can be placed', () => {
    const attempt = mapFoldList({
      availableFields: existingFields,
      externalFieldId: 'pc-field-baptism',
    })
    expect(attempt.ok).toBe(false)
    if (attempt.ok) throw new Error('unreachable')
    expect(attempt.refusal).toMatch(/not a list or a membership type/)
  })

  it('sorts an incoming profile by the mapping read in reverse', () => {
    const mappings: Record<'family' | 'guest', ListMapping> = {
      family: { state: 'mapped', externalFieldId: 'pc-list-members' },
      guest: { state: 'mapped', externalFieldId: 'pc-list-newcomers' },
    }
    expect(foldListForIncoming(['pc-list-members'], mappings)).toBe('family')
    expect(foldListForIncoming(['pc-list-newcomers'], mappings)).toBe('guest')
  })

  it('returns null when neither list is mapped, which is a real answer', () => {
    const foldOnly: Record<'family' | 'guest', ListMapping> = {
      family: { state: 'fold_only', reason: 'Kept in Fold.' },
      guest: { state: 'unmapped' },
    }
    expect(foldListForIncoming(['pc-list-members'], foldOnly)).toBeNull()
  })
})

describe('matching people', () => {
  const existing: MatchCandidate[] = [
    {
      personId: 'p-1',
      planningCenterId: 'pc-1',
      email: 'one@example.church',
      phone: '(555) 000-1111',
      fullName: 'Person One',
    },
    {
      personId: 'p-2',
      planningCenterId: null,
      email: 'two@example.church',
      phone: '555-000-2222',
      fullName: 'Person Two',
    },
    {
      personId: 'p-3',
      planningCenterId: null,
      email: 'two@example.church',
      phone: '5550003333',
      fullName: 'Person Three',
    },
  ]

  it('tries Planning Center id first', () => {
    const result = matchPerson(
      { planningCenterId: 'pc-1', email: 'two@example.church', phone: null },
      existing
    )
    // The email would have been ambiguous; the id is decisive, so it wins.
    expect(result).toEqual({
      kind: 'matched',
      personId: 'p-1',
      matchedOn: 'planning_center_id',
    })
  })

  it('falls back to email', () => {
    const result = matchPerson(
      { planningCenterId: null, email: 'one@example.church', phone: null },
      existing
    )
    expect(result).toMatchObject({ personId: 'p-1', matchedOn: 'email' })
  })

  it('falls back to phone, ignoring formatting', () => {
    const result = matchPerson(
      { planningCenterId: null, email: null, phone: '+1 (555) 000-2222' },
      existing
    )
    expect(result).toMatchObject({ personId: 'p-2', matchedOn: 'phone' })
  })

  it('is case and whitespace insensitive on email', () => {
    const result = matchPerson(
      { planningCenterId: null, email: '  ONE@Example.Church ', phone: null },
      existing
    )
    expect(result).toMatchObject({ personId: 'p-1' })
  })

  it('never merges a near match — it surfaces the duplicates', () => {
    // §6: "Near matches are surfaced as possible duplicates, never merged
    // automatically."
    const result = matchPerson(
      { planningCenterId: null, email: 'two@example.church', phone: null },
      existing
    )
    expect(result.kind).toBe('possible_duplicates')
    if (result.kind !== 'possible_duplicates') throw new Error('unreachable')
    expect(result.candidates.map((c) => c.personId)).toEqual(['p-2', 'p-3'])
    expect(result.guidance).toMatch(/two people’s histories in one record/)
  })

  it('reports no match rather than guessing', () => {
    expect(
      matchPerson(
        { planningCenterId: null, email: 'nobody@example.church', phone: null },
        existing
      )
    ).toEqual({ kind: 'no_match' })
  })

  it('ignores blank incoming fields instead of matching other blanks', () => {
    // Two people with no Planning Center id must not match each other on it.
    const result = matchPerson(
      { planningCenterId: '  ', email: null, phone: null },
      existing
    )
    expect(result).toEqual({ kind: 'no_match' })
  })

  it('tries the fields in §6’s order', () => {
    expect([...MATCH_ORDER]).toEqual(['planning_center_id', 'email', 'phone'])
  })
})
