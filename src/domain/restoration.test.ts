import { describe, expect, it } from 'vitest'

import {
  advanceCase,
  canCarryCase,
  linesOf,
  openCase,
  pairElders,
  sealCase,
} from './restoration'
import { type Role, principalOf } from './roles'

function whoIs(...roles: Role[]) {
  return principalOf('p1', roles)
}

function named(id: string, fullName: string, ...roles: Role[]) {
  return { principal: principalOf(id, roles), fullName }
}

describe('who may be named on a case', () => {
  it('allows an elder and the lead pastor', () => {
    expect(canCarryCase(whoIs('pastor_elder'))).toBe(true)
    expect(canCarryCase(whoIs('lead_pastor'))).toBe(true)
  })

  it('refuses pastoral staff, who read cases but do not carry them', () => {
    // Reading every case and being named on one are different questions.
    expect(canCarryCase(whoIs('pastoral_staff'))).toBe(false)
  })

  it('refuses an administrator', () => {
    expect(canCarryCase(whoIs('administrator'))).toBe(false)
  })
})

describe('naming the two elders', () => {
  const marcus = named('p-marcus', 'Marcus Reid', 'pastor_elder')
  const tanya = named('p-tanya', 'Tanya Jules', 'pastor_elder')

  it('requires two', () => {
    const attempt = pairElders({
      leadElderId: 'p-marcus',
      secondElderId: '',
      lead: marcus,
      second: null,
    })
    expect(attempt.ok).toBe(false)
    expect(!attempt.ok && attempt.refusal).toContain('has no witness')
  })

  it('refuses the same person twice', () => {
    const attempt = pairElders({
      leadElderId: 'p-marcus',
      secondElderId: 'p-marcus',
      lead: marcus,
      second: marcus,
    })
    expect(attempt.ok).toBe(false)
    expect(!attempt.ok && attempt.refusal).toContain('two different people')
  })

  it('names who cannot carry it, and why', () => {
    const attempt = pairElders({
      leadElderId: 'p-marcus',
      secondElderId: 'p-dean',
      lead: marcus,
      second: named('p-dean', 'Dean Lowry', 'pastoral_staff'),
    })
    expect(attempt.ok).toBe(false)
    expect(!attempt.ok && attempt.refusal).toContain('Dean Lowry')
    expect(!attempt.ok && attempt.refusal).toContain('elder or the lead pastor')
  })

  it('accepts two elders', () => {
    expect(
      pairElders({
        leadElderId: 'p-marcus',
        secondElderId: 'p-tanya',
        lead: marcus,
        second: tanya,
      })
    ).toEqual({
      ok: true,
      leadElderId: 'p-marcus',
      secondElderId: 'p-tanya',
    })
  })
})

describe('opening a case', () => {
  const base = {
    personName: 'Curtis Hale',
    stepLabel: 'Third conversation',
    status: 'Meeting fortnightly',
    plan: '',
    knows: '',
    doesNotKnow: '',
    decisionQuestion: '',
    alreadyOpen: false,
  }

  it('refuses a second open case on one person', () => {
    const attempt = openCase({ ...base, alreadyOpen: true })
    expect(attempt.ok).toBe(false)
    expect(!attempt.ok && attempt.refusal).toContain(
      'two accounts of the same situation'
    )
  })

  it('requires the step and the status', () => {
    expect(openCase({ ...base, stepLabel: '  ' }).ok).toBe(false)
    expect(openCase({ ...base, status: '' }).ok).toBe(false)
  })

  it('leaves the step free text, because churches name their own stages', () => {
    const attempt = openCase({ ...base, stepLabel: 'Second hearing' })
    expect(attempt.ok && attempt.draft.stepLabel).toBe('Second hearing')
  })

  it('does not require the disclosure circle yet', () => {
    // Forcing a guess would put a name in a list nobody agreed to.
    const attempt = openCase(base)
    expect(attempt.ok).toBe(true)
    expect(attempt.ok && attempt.draft.knows).toEqual([])
    expect(attempt.ok && attempt.draft.doesNotKnow).toEqual([])
  })

  it('records who deliberately does not know', () => {
    // §8.8 applied to people: a decision not to tell somebody is a decision.
    const attempt = openCase({
      ...base,
      knows: 'The elder board\nHis wife',
      doesNotKnow: 'His small group\nThe worship team',
    })
    expect(attempt.ok && attempt.draft.knows).toEqual([
      'The elder board',
      'His wife',
    ])
    expect(attempt.ok && attempt.draft.doesNotKnow).toEqual([
      'His small group',
      'The worship team',
    ])
  })

  it('drops blank lines rather than storing empty entries', () => {
    expect(linesOf('One\n\n  \nTwo\n')).toEqual(['One', 'Two'])
  })

  it('stores an absent decision question as null', () => {
    const attempt = openCase({ ...base, decisionQuestion: '   ' })
    expect(attempt.ok && attempt.draft.decisionQuestion).toBeNull()
  })

  it('says the tier is not a setting', () => {
    const attempt = openCase(base)
    expect(attempt.ok && attempt.note).toContain('not a setting')
  })
})

describe('sealing a case on close', () => {
  const base = {
    personName: 'Curtis Hale',
    outcome: 'Reconciled and restored to fellowship',
    alreadyClosed: false,
  }

  it('requires the outcome', () => {
    // It is the only part a reader below the tier will ever see, so it is the
    // whole of what the church can say about it afterwards.
    const attempt = sealCase({ ...base, outcome: '  ' })
    expect(attempt.ok).toBe(false)
    expect(!attempt.ok && attempt.refusal).toContain('stays readable')
  })

  it('refuses to close one twice', () => {
    expect(sealCase({ ...base, alreadyClosed: true }).ok).toBe(false)
  })

  it('says nothing is deleted', () => {
    const attempt = sealCase(base)
    expect(attempt.ok && attempt.note).toContain('Nothing is deleted')
    expect(attempt.ok && attempt.outcome).toBe(
      'Reconciled and restored to fellowship'
    )
  })
})

describe('moving a case along', () => {
  it('increments the step and keeps both fields together', () => {
    expect(
      advanceCase({
        currentStep: 2,
        stepLabel: 'Fourth conversation',
        status: 'Meeting weekly again',
        closed: false,
      })
    ).toEqual({
      ok: true,
      step: 3,
      stepLabel: 'Fourth conversation',
      status: 'Meeting weekly again',
    })
  })

  it('refuses a step with a blank status', () => {
    const attempt = advanceCase({
      currentStep: 2,
      stepLabel: 'Fourth conversation',
      status: '',
      closed: false,
    })
    expect(attempt.ok).toBe(false)
    expect(!attempt.ok && attempt.refusal).toContain('reads as current')
  })

  it('refuses to edit a sealed case, and says a new one is the answer', () => {
    const attempt = advanceCase({
      currentStep: 2,
      stepLabel: 'Fifth conversation',
      status: 'Started again',
      closed: true,
    })
    expect(attempt.ok).toBe(false)
    expect(!attempt.ok && attempt.refusal).toContain('a new case')
  })
})
