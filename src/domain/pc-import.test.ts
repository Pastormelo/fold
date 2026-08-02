import { describe, expect, it } from 'vitest'

import {
  type ExistingPerson,
  type ImportPlan,
  type IncomingPerson,
  describePlan,
  nothingToDoReason,
  planImport,
  planWouldChangeAnything,
} from './pc-import'
import type { FoldList, ListMapping } from './planning-center'

function incoming(overrides: Partial<IncomingPerson> = {}): IncomingPerson {
  return {
    planningCenterId: 'pc-1',
    firstName: 'Lena',
    lastName: 'Whitcomb',
    email: 'lena@example.com',
    phone: '+1 (555) 000-2222',
    active: true,
    listIds: [],
    ...overrides,
  }
}

function existing(overrides: Partial<ExistingPerson> = {}): ExistingPerson {
  return {
    personId: 'p-1',
    planningCenterId: null,
    email: null,
    phone: null,
    fullName: 'Lena Whitcomb',
    ...overrides,
  }
}

const UNMAPPED: Record<FoldList, ListMapping> = {
  family: { state: 'unmapped' },
  guest: { state: 'unmapped' },
}

function plan(input: {
  incoming: IncomingPerson[]
  existing?: ExistingPerson[]
  listMappings?: Record<FoldList, ListMapping>
}): ImportPlan {
  return planImport({
    incoming: input.incoming,
    existing: input.existing ?? [],
    listMappings: input.listMappings ?? UNMAPPED,
  })
}

describe('nobody is ever merged', () => {
  it('leaves a profile matching two people for a person to resolve', () => {
    // The rule the whole module exists for. A duplicate is visible and annoying;
    // a wrong merge puts two people's histories in one record.
    const result = plan({
      incoming: [incoming({ email: 'shared@example.com' })],
      existing: [
        existing({ personId: 'p-1', email: 'shared@example.com', fullName: 'Lena Whitcomb' }),
        existing({ personId: 'p-2', email: 'shared@example.com', fullName: 'Lena Whitcomb-Reid' }),
      ],
    })
    expect(result.creates).toHaveLength(0)
    expect(result.links).toHaveLength(0)
    expect(result.duplicates).toHaveLength(1)
    expect(result.duplicates[0]!.candidates.map((c) => c.personId)).toEqual([
      'p-1',
      'p-2',
    ])
    expect(result.duplicates[0]!.guidance).toMatch(/will not choose between them/)
  })

  it('does not create the person it could not tell apart', () => {
    // The tempting shortcut: unsure, so add a new one. That manufactures the
    // third copy.
    const result = plan({
      incoming: [incoming({ email: 'shared@example.com' })],
      existing: [
        existing({ personId: 'p-1', email: 'shared@example.com' }),
        existing({ personId: 'p-2', email: 'shared@example.com' }),
      ],
    })
    expect(result.creates).toHaveLength(0)
  })

  it('catches a second copy inside the same import batch', () => {
    // Two Planning Center profiles sharing an email. Matched only against Fold,
    // both would be planned as creations and the import would manufacture the
    // duplicate it exists to prevent.
    const result = plan({
      incoming: [
        incoming({ planningCenterId: 'pc-1', email: 'same@example.com', phone: null }),
        incoming({ planningCenterId: 'pc-2', email: 'same@example.com', phone: null }),
      ],
    })
    expect(result.creates).toHaveLength(1)
    expect(result.duplicates).toHaveLength(0)
    // The second one matched the first exactly, so it is a link rather than a
    // duplicate — one candidate, not two.
    expect(result.links).toHaveLength(1)
    expect(result.links[0]!.incoming.planningCenterId).toBe('pc-2')
  })
})

describe('linking somebody already in Fold', () => {
  it('links on a single email match rather than creating a second record', () => {
    const result = plan({
      incoming: [incoming({ email: 'lena@example.com' })],
      existing: [existing({ personId: 'p-9', email: 'lena@example.com' })],
    })
    expect(result.creates).toHaveLength(0)
    expect(result.links).toEqual([
      {
        incoming: result.links[0]!.incoming,
        personId: 'p-9',
        fullName: 'Lena Whitcomb',
        matchedOn: 'email',
      },
    ])
  })

  it('links on a phone number written differently', () => {
    const result = plan({
      incoming: [incoming({ email: null, phone: '555-000-2222' })],
      existing: [existing({ personId: 'p-9', phone: '+1 (555) 000-2222' })],
    })
    expect(result.links).toHaveLength(1)
    expect(result.links[0]!.matchedOn).toBe('phone')
  })

  it('reports somebody already carrying the id as nothing to do', () => {
    const result = plan({
      incoming: [incoming({ planningCenterId: 'pc-7' })],
      existing: [existing({ personId: 'p-9', planningCenterId: 'pc-7' })],
    })
    expect(result.alreadyLinked).toHaveLength(1)
    expect(result.links).toHaveLength(0)
    expect(result.creates).toHaveLength(0)
  })

  it('prefers the Planning Center id over a conflicting email', () => {
    // §6's match order is an order, not a set: a stronger field decides.
    const result = plan({
      incoming: [incoming({ planningCenterId: 'pc-7', email: 'lena@example.com' })],
      existing: [
        existing({ personId: 'p-by-id', planningCenterId: 'pc-7' }),
        existing({ personId: 'p-by-email', email: 'lena@example.com' }),
      ],
    })
    expect(result.alreadyLinked[0]!.personId).toBe('p-by-id')
  })
})

describe('membership is not inferred', () => {
  it('brings somebody in as a guest when no list is mapped', () => {
    // §7: membership is decided by the church, not computed. Arriving as a
    // member because a spreadsheet said so is exactly that.
    const result = plan({ incoming: [incoming()] })
    expect(result.creates[0]!.list).toBe('guest')
    expect(result.creates[0]!.listReason).toMatch(/church’s decision/)
  })

  it('brings somebody into Family when their list is the mapped one', () => {
    const result = plan({
      incoming: [incoming({ listIds: ['pc-list-members'] })],
      listMappings: {
        family: { state: 'mapped', externalFieldId: 'pc-list-members' },
        guest: { state: 'unmapped' },
      },
    })
    expect(result.creates[0]!.list).toBe('family')
    expect(result.creates[0]!.listReason).toMatch(/mapped to Family/)
  })

  it('leaves somebody a guest when they are not in the mapped Family list', () => {
    const result = plan({
      incoming: [incoming({ listIds: ['pc-list-visitors'] })],
      listMappings: {
        family: { state: 'mapped', externalFieldId: 'pc-list-members' },
        guest: { state: 'unmapped' },
      },
    })
    expect(result.creates[0]!.list).toBe('guest')
  })
})

describe('who is left out', () => {
  it('skips somebody Planning Center has marked inactive', () => {
    const result = plan({ incoming: [incoming({ active: false })] })
    expect(result.creates).toHaveLength(0)
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0]!.reason).toMatch(/already set aside/)
  })

  it('skips a profile with half a name', () => {
    const result = plan({ incoming: [incoming({ lastName: '  ' })] })
    expect(result.skipped).toHaveLength(1)
    expect(result.creates).toHaveLength(0)
  })

  it('says why for every skip, so a missing person can be accounted for', () => {
    const result = plan({
      incoming: [incoming({ active: false }), incoming({ firstName: '' })],
    })
    expect(result.skipped).toHaveLength(2)
    for (const skip of result.skipped) expect(skip.reason.length).toBeGreaterThan(20)
  })
})

describe('the summary matches the plan', () => {
  // §8.2: a claim has to match what it was computed from. This is the screen
  // whose entire job is telling somebody what is about to happen to their
  // directory, so the sentence and the plan cannot drift.
  it('counts each outcome from its own array', () => {
    const result = plan({
      incoming: [
        incoming({ planningCenterId: 'a', email: 'a@example.com', phone: null }),
        incoming({ planningCenterId: 'b', email: 'b@example.com', phone: null }),
        incoming({ planningCenterId: 'c', email: 'c@example.com', phone: null, active: false }),
      ],
      existing: [existing({ personId: 'p-b', email: 'b@example.com' })],
    })
    const summary = describePlan(result)
    expect(summary).toContain('1 person would be added')
    expect(summary).toContain('1 already in Fold would be linked')
    expect(summary).toContain('1 would be skipped')
    expect(summary).toMatch(/Nothing has happened yet\.$/)
  })

  it('says so plainly when Planning Center returned nobody', () => {
    expect(describePlan(plan({ incoming: [] }))).toMatch(/returned nobody/)
  })

  it('pluralises one person correctly', () => {
    const one = plan({ incoming: [incoming()] })
    expect(describePlan(one)).toContain('1 person would be added')
    const two = plan({
      incoming: [
        incoming({ planningCenterId: 'a', email: 'a@example.com', phone: null }),
        incoming({ planningCenterId: 'b', email: 'b@example.com', phone: null }),
      ],
    })
    expect(describePlan(two)).toContain('2 people would be added')
  })
})

describe('offering the import only when it would do something', () => {
  // §8.4: do not offer a control the action will refuse. §8.5: an action that
  // reports success must have done something.
  it('is worth running when there is anything to create or link', () => {
    expect(planWouldChangeAnything(plan({ incoming: [incoming()] }))).toBe(true)
    expect(nothingToDoReason(plan({ incoming: [incoming()] }))).toBeNull()
  })

  it('is not worth running when everybody is already linked', () => {
    const result = plan({
      incoming: [incoming({ planningCenterId: 'pc-7' })],
      existing: [existing({ personId: 'p-9', planningCenterId: 'pc-7' })],
    })
    expect(planWouldChangeAnything(result)).toBe(false)
    expect(nothingToDoReason(result)).toMatch(/already linked/)
  })

  it('sends you to resolve the duplicates when that is all that is left', () => {
    const result = plan({
      incoming: [incoming({ email: 'shared@example.com' })],
      existing: [
        existing({ personId: 'p-1', email: 'shared@example.com' }),
        existing({ personId: 'p-2', email: 'shared@example.com' }),
      ],
    })
    expect(planWouldChangeAnything(result)).toBe(false)
    expect(nothingToDoReason(result)).toMatch(/Resolve the possible duplicates/)
  })

  it('does not count duplicates or skips as work the import would do', () => {
    // Running an import whose only outcome is "we still cannot tell" would
    // report success having changed nothing.
    const result = plan({ incoming: [incoming({ active: false })] })
    expect(planWouldChangeAnything(result)).toBe(false)
  })
})
