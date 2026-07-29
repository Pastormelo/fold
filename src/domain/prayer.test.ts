import { describe, expect, it } from 'vitest'

import {
  PRAYED_CAP,
  PRAYED_CAP_NOTE,
  answerRequest,
  describeTally,
  prayOnceMore,
  standingOf,
} from './prayer'

describe('praying once more', () => {
  it('counts up', () => {
    expect(prayOnceMore({ people: 3, mine: 1 })).toEqual({ ok: true, mine: 2 })
  })

  it('refuses at the cap rather than ignoring the click', () => {
    // §8.5 in miniature: a button that appears to work and does nothing is worse
    // than one that says why it will not.
    const result = prayOnceMore({ people: 9, mine: PRAYED_CAP })
    expect(result).toEqual({ ok: false, refusal: PRAYED_CAP_NOTE })
  })

  it('says the more useful thing at the cap', () => {
    expect(PRAYED_CAP_NOTE).toBe('One hundred is the cap. Go talk to them.')
  })
})

describe('describing the tally', () => {
  it('does not claim anybody prayed when nobody has', () => {
    expect(describeTally({ people: 0, mine: 0 })).toBe('Nobody has prayed yet')
  })

  it('leaves the viewer out when they have not prayed', () => {
    // §8.2: the claim has to match what it was computed from. "Including you" is
    // read off the viewer's own count, never assumed.
    expect(describeTally({ people: 9, mine: 0 })).toBe('9 have prayed')
  })

  it('includes the viewer when they have', () => {
    expect(describeTally({ people: 9, mine: 1 })).toBe(
      '9 have prayed, including you'
    )
  })

  it('counts the viewer’s repeats', () => {
    expect(describeTally({ people: 9, mine: 4 })).toBe(
      '9 have prayed, including you 4 times'
    )
  })

  it('uses "has" for one person', () => {
    expect(describeTally({ people: 1, mine: 0 })).toBe('1 person has prayed')
  })
})

describe('answering', () => {
  const open = {
    id: 'r1',
    personId: 'p1',
    personName: 'Nadia Brooks',
    askedByName: 'Nadia Brooks',
    body: 'Marriage',
    visibilityTier: 'staff_and_elders' as const,
    askedAt: new Date('2026-06-01T00:00:00Z'),
    answeredAt: null,
    outcome: null,
  }

  it('is open until it is answered', () => {
    expect(standingOf(open)).toBe('open')
    expect(
      standingOf({
        ...open,
        answeredAt: new Date('2026-07-01T00:00:00Z'),
        outcome: 'They are in counselling',
      })
    ).toBe('answered')
  })

  it('requires the outcome', () => {
    // In a year the sentence is the entire value of the record. A checkbox is
    // not worth keeping.
    expect(answerRequest('   ')).toEqual({
      ok: false,
      refusal:
        'Say what happened. An answered request with nothing written down is a checkbox, and the sentence is the part worth keeping.',
    })
  })

  it('trims what is given', () => {
    expect(answerRequest('  They are in counselling  ')).toEqual({
      ok: true,
      outcome: 'They are in counselling',
    })
  })
})
