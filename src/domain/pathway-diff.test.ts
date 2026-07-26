import { describe, expect, it } from 'vitest'

import {
  DIFFED_PATHWAY_FIELDS,
  DIFFED_STAGE_FIELDS,
  type EditablePathway,
  type EditableStage,
  absentFields,
  diffPathway,
  draftHasUnpublishedChanges,
  unexplainedAbsences,
} from './pathway-diff'

function stage(overrides: Partial<EditableStage> = {}): EditableStage {
  return {
    id: 's1',
    name: 'First contact',
    publicName: 'Welcome',
    subtitle: 'The first Sunday',
    purpose: 'Meet them before they leave the building.',
    outcome: 'A name, a contact detail, and a person who will follow up.',
    entryCondition: 'Attends a service for the first time.',
    requiredActions: ['Connection card', 'Same-week text'],
    optionalActions: ['Invite to coffee'],
    ownerRole: 'Connection team',
    completionCondition: 'A conversation happened and was logged.',
    stoppingRule: 'Three attempts across two weeks, then release.',
    reactivationRule: 'Returns to a service within six months.',
    escalationRule: 'Raises a pastoral concern.',
    milestones: ['First visit logged'],
    intentionallyAbsent: [],
    ...overrides,
  }
}

function pathway(overrides: Partial<EditablePathway> = {}): EditablePathway {
  return {
    internalName: 'Assimilation 2026',
    publicName: 'Finding your place',
    philosophy: 'Nobody disappears quietly.',
    discipleDefinition: 'Following Jesus with other people, on purpose.',
    stages: [stage()],
    ...overrides,
  }
}

describe('the diff covers every editable field', () => {
  // §8.7: "The diff must cover every editable field, including arrays. A partial
  // diff makes real changes invisible."
  //
  // Exhaustiveness is enforced at compile time in pathway-diff.ts — adding a
  // field to EditableStage without adding it to STAGE_FIELDS fails the build.
  // These tests prove the second half: that every declared field is actually
  // compared, not just listed.
  const published = pathway()

  const changedValue: Record<string, unknown> = {
    name: 'First contact, revised',
    publicName: 'Welcome in',
    subtitle: 'That first Sunday',
    purpose: 'Meet them before they leave.',
    outcome: 'A name and someone who follows up.',
    entryCondition: 'Attends any gathering for the first time.',
    requiredActions: ['Connection card'],
    optionalActions: [],
    ownerRole: 'Hospitality',
    completionCondition: 'A logged conversation.',
    stoppingRule: 'Two attempts across two weeks, then release.',
    reactivationRule: 'Returns within three months.',
    escalationRule: 'Raises anything pastoral.',
    milestones: ['First visit logged', 'Coffee happened'],
    intentionallyAbsent: ['escalationRule'],
  }

  for (const field of DIFFED_STAGE_FIELDS) {
    it(`detects a change to stage.${field}`, () => {
      const draft = pathway({
        stages: [
          stage({ [field]: changedValue[field] } as Partial<EditableStage>),
        ],
      })
      const diff = diffPathway({ draft, published })
      expect(diff.hasChanges, field).toBe(true)
      expect(
        diff.stages[0]?.changes.map((change) => change.field),
        field
      ).toContain(field)
    })
  }

  const changedPathwayValue: Record<string, string> = {
    internalName: 'Assimilation 2027',
    publicName: 'Find your place',
    philosophy: 'Nobody disappears.',
    discipleDefinition: 'Following Jesus with others.',
  }

  for (const field of DIFFED_PATHWAY_FIELDS) {
    it(`detects a change to pathway.${field}`, () => {
      const draft = pathway({ [field]: changedPathwayValue[field] })
      const diff = diffPathway({ draft, published })
      expect(diff.hasChanges, field).toBe(true)
      expect(diff.pathwayChanges.map((change) => change.field)).toContain(field)
    })
  }
})

describe('arrays are diffed as arrays', () => {
  it('notices a reordered array', () => {
    const published = pathway()
    const draft = pathway({
      stages: [
        stage({ requiredActions: ['Same-week text', 'Connection card'] }),
      ],
    })
    expect(draftHasUnpublishedChanges({ draft, published })).toBe(true)
  })

  it('notices an added element', () => {
    const published = pathway()
    const draft = pathway({
      stages: [
        stage({
          requiredActions: [
            'Connection card',
            'Same-week text',
            'Coffee invite',
          ],
        }),
      ],
    })
    expect(draftHasUnpublishedChanges({ draft, published })).toBe(true)
  })

  it('does not confuse one joined element with two separate ones', () => {
    // A naive `join(' ')` comparison would call these equal.
    const published = pathway({ stages: [stage({ milestones: ['a b'] })] })
    const draft = pathway({ stages: [stage({ milestones: ['a', 'b'] })] })
    expect(draftHasUnpublishedChanges({ draft, published })).toBe(true)
  })

  it('treats an identical array as unchanged', () => {
    const published = pathway()
    const draft = pathway({
      stages: [
        stage({ requiredActions: ['Connection card', 'Same-week text'] }),
      ],
    })
    expect(draftHasUnpublishedChanges({ draft, published })).toBe(false)
  })
})

describe('draft state is derived, never set', () => {
  // §8.6: "Draft state is derived from a diff against the published snapshot,
  // never set by hand. Otherwise a no-op can forge an unclearable dirty state."
  it('reports no changes for an identical draft', () => {
    const published = pathway()
    const draft = pathway()
    expect(draftHasUnpublishedChanges({ draft, published })).toBe(false)
    expect(diffPathway({ draft, published }).summary).toBe(
      'No changes against the published pathway.'
    )
  })

  it('reports no changes after an edit is reverted', () => {
    // The forged-dirty-state case. Type something, undo it, and the draft must
    // be clean again — a stored flag would stay stuck on.
    const published = pathway()
    const edited = pathway({ stages: [stage({ purpose: 'Something else.' })] })
    expect(draftHasUnpublishedChanges({ draft: edited, published })).toBe(true)

    const reverted = pathway({ stages: [stage()] })
    expect(draftHasUnpublishedChanges({ draft: reverted, published })).toBe(
      false
    )
  })

  it('treats everything as new when nothing is published yet', () => {
    const diff = diffPathway({ draft: pathway(), published: null })
    expect(diff.hasChanges).toBe(true)
    expect(diff.stages[0]?.status).toBe('added')
  })
})

describe('added and removed stages', () => {
  it('sees an added stage', () => {
    const published = pathway()
    const draft = pathway({
      stages: [stage(), stage({ id: 's2', name: 'Membership' })],
    })
    const diff = diffPathway({ draft, published })
    expect(diff.changedStageCount).toBe(1)
    expect(diff.stages.find((entry) => entry.stageId === 's2')?.status).toBe(
      'added'
    )
  })

  it('sees a removed stage, which a draft-only walk would miss', () => {
    const published = pathway({
      stages: [stage(), stage({ id: 's2', name: 'Membership' })],
    })
    const draft = pathway({ stages: [stage()] })
    const diff = diffPathway({ draft, published })
    expect(diff.hasChanges).toBe(true)
    expect(diff.stages.find((entry) => entry.stageId === 's2')?.status).toBe(
      'removed'
    )
  })

  it('counts only stages that actually changed', () => {
    const published = pathway({
      stages: [stage(), stage({ id: 's2', name: 'Membership' })],
    })
    const draft = pathway({
      stages: [
        stage({ purpose: 'Changed.' }),
        stage({ id: 's2', name: 'Membership' }),
      ],
    })
    const diff = diffPathway({ draft, published })
    expect(diff.changedStageCount).toBe(1)
  })
})

describe('the summary is counted from the diff', () => {
  // §8.1: if a number appears in copy, compute it.
  it('pluralises one stage', () => {
    const published = pathway()
    const draft = pathway({ stages: [stage({ purpose: 'Changed.' })] })
    expect(diffPathway({ draft, published }).summary).toBe('1 stage changed.')
  })

  it('pluralises two stages', () => {
    const published = pathway({
      stages: [stage(), stage({ id: 's2', name: 'Membership' })],
    })
    const draft = pathway({
      stages: [
        stage({ purpose: 'Changed.' }),
        stage({ id: 's2', name: 'Membership', purpose: 'Also changed.' }),
      ],
    })
    expect(diffPathway({ draft, published }).summary).toBe('2 stages changed.')
  })

  it('mentions pathway fields alongside stages', () => {
    const published = pathway()
    const draft = pathway({
      philosophy: 'Different.',
      stages: [stage({ purpose: 'Changed.' })],
    })
    expect(diffPathway({ draft, published }).summary).toBe(
      '1 stage changed, 1 pathway field changed.'
    )
  })

  it('states a stage count matching the stages it reports', () => {
    const published = pathway({
      stages: [stage(), stage({ id: 's2', name: 'Membership' })],
    })
    const draft = pathway({ stages: [stage({ purpose: 'Changed.' })] })
    const diff = diffPathway({ draft, published })
    const actuallyChanged = diff.stages.filter(
      (entry) => entry.status !== 'unchanged'
    ).length
    expect(diff.changedStageCount).toBe(actuallyChanged)
    expect(diff.summary).toContain(`${actuallyChanged} stages changed`)
  })
})

describe('the diff is computed against the published pathway', () => {
  // §8.2: "The subject of a claim must match what it was computed from."
  it('reports changes against what is published, not against the draft itself', () => {
    const published = pathway({ philosophy: 'The published wording.' })
    const draft = pathway({ philosophy: 'The draft wording.' })
    const diff = diffPathway({ draft, published })
    const change = diff.pathwayChanges.find(
      (entry) => entry.field === 'philosophy'
    )
    expect(change?.before).toBe('The published wording.')
    expect(change?.after).toBe('The draft wording.')
  })
})

describe('deliberate absence is not a defect', () => {
  // §8.8.
  it('flags an empty rule field as an oversight by default', () => {
    const withGap = pathway({ stages: [stage({ stoppingRule: '' })] })
    const unexplained = unexplainedAbsences(withGap)
    expect(unexplained.map((entry) => entry.field)).toContain('stoppingRule')
  })

  it('does not flag one the church deliberately left empty', () => {
    const deliberate = pathway({
      stages: [
        stage({ stoppingRule: '', intentionallyAbsent: ['stoppingRule'] }),
      ],
    })
    expect(unexplainedAbsences(deliberate)).toHaveLength(0)
  })

  it('still records the deliberate absence, marked as deliberate', () => {
    // Distinguishable, not hidden — a reviewer should be able to see the choice.
    const deliberate = pathway({
      stages: [
        stage({ stoppingRule: '', intentionallyAbsent: ['stoppingRule'] }),
      ],
    })
    const absent = absentFields(deliberate)
    const entry = absent.find((candidate) => candidate.field === 'stoppingRule')
    expect(entry?.deliberate).toBe(true)
  })

  it('distinguishes two stages with the same gap for different reasons', () => {
    const mixed = pathway({
      stages: [
        stage({
          id: 's1',
          stoppingRule: '',
          intentionallyAbsent: ['stoppingRule'],
        }),
        stage({ id: 's2', name: 'Membership', stoppingRule: '' }),
      ],
    })
    const unexplained = unexplainedAbsences(mixed)
    expect(unexplained).toHaveLength(1)
    expect(unexplained[0]?.stageId).toBe('s2')
  })

  it('reports nothing absent for a fully specified stage', () => {
    expect(absentFields(pathway())).toHaveLength(0)
  })
})
