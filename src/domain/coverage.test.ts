import { describe, expect, it } from 'vitest'

import {
  CONTACT_WINDOW_DAYS,
  ONE_SHEPHERD_CEILING,
  WARNING_WINDOW_DAYS,
  assessContact,
  concerningFolds,
  coverageSegments,
  foldStanding,
  summariseCoverage,
} from './coverage'

const NOW = new Date('2026-07-28T12:00:00Z')

/** A date `days` before NOW. */
function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)
}

describe('one person’s standing', () => {
  it('treats never-contacted as overdue rather than as a missing value', () => {
    // The whole point. Excluding somebody because there is no date to compare is
    // exactly how a person disappears from a report about people disappearing.
    const assessment = assessContact(
      { personId: 'p1', lastContactAt: null },
      NOW
    )
    expect(assessment.standing).toBe('overdue')
    expect(assessment.daysSinceContact).toBeNull()
    expect(assessment.label).toBe('Never contacted')
  })

  it('is recent inside the warning band', () => {
    expect(
      assessContact({ personId: 'p1', lastContactAt: daysAgo(10) }, NOW)
        .standing
    ).toBe('recent')
  })

  it('turns to warning exactly on the warning day', () => {
    expect(
      assessContact(
        { personId: 'p1', lastContactAt: daysAgo(WARNING_WINDOW_DAYS) },
        NOW
      ).standing
    ).toBe('warning')
    expect(
      assessContact(
        { personId: 'p1', lastContactAt: daysAgo(WARNING_WINDOW_DAYS - 1) },
        NOW
      ).standing
    ).toBe('recent')
  })

  it('turns to overdue exactly on the window day', () => {
    expect(
      assessContact(
        { personId: 'p1', lastContactAt: daysAgo(CONTACT_WINDOW_DAYS) },
        NOW
      ).standing
    ).toBe('overdue')
    expect(
      assessContact(
        { personId: 'p1', lastContactAt: daysAgo(CONTACT_WINDOW_DAYS - 1) },
        NOW
      ).standing
    ).toBe('warning')
  })

  it('says "Contacted today" rather than "0 days since contact"', () => {
    expect(
      assessContact({ personId: 'p1', lastContactAt: NOW }, NOW).label
    ).toBe('Contacted today')
  })

  it('pluralises from the count', () => {
    expect(
      assessContact({ personId: 'p1', lastContactAt: daysAgo(1) }, NOW).label
    ).toBe('1 day since contact')
    expect(
      assessContact({ personId: 'p1', lastContactAt: daysAgo(2) }, NOW).label
    ).toBe('2 days since contact')
  })
})

describe('rolling up a fold', () => {
  it('counts the warning band as inside the window', () => {
    // Both are inside sixty days. Counting only `recent` would report a healthy
    // fold as failing, and the warning band exists to prompt action rather than
    // to score against anyone.
    const summary = summariseCoverage(
      [
        { personId: 'a', lastContactAt: daysAgo(5) },
        { personId: 'b', lastContactAt: daysAgo(50) },
      ],
      NOW
    )
    expect(summary.percentInsideWindow).toBe(100)
    expect(summary.recent).toBe(1)
    expect(summary.warning).toBe(1)
    expect(summary.overdue).toBe(0)
  })

  it('refuses to report perfect coverage of nobody', () => {
    // §8.2: a claim must match what it was computed from. 100% of an empty
    // directory is the clearest possible case of a number outrunning its data.
    const summary = summariseCoverage([], NOW)
    expect(summary.percentInsideWindow).toBe(0)
    expect(summary.summary).toBe(
      'Nobody is in the directory yet, so there is nothing to cover.'
    )
  })

  it('says so plainly when everyone has been reached', () => {
    const summary = summariseCoverage(
      [{ personId: 'a', lastContactAt: daysAgo(3) }],
      NOW
    )
    expect(summary.summary).toBe('Everyone has been contacted inside 60 days.')
  })

  it('names the overdue and the warning counts separately', () => {
    const summary = summariseCoverage(
      [
        { personId: 'a', lastContactAt: daysAgo(3) },
        { personId: 'b', lastContactAt: daysAgo(50) },
        { personId: 'c', lastContactAt: daysAgo(90) },
        { personId: 'd', lastContactAt: null },
      ],
      NOW
    )
    expect(summary.overdue).toBe(2)
    expect(summary.warning).toBe(1)
    expect(summary.summary).toBe(
      '50% contacted inside 60 days, 2 people are past it, 1 is inside the warning band.'
    )
  })

  it('pluralises a single overdue person', () => {
    const summary = summariseCoverage(
      [
        { personId: 'a', lastContactAt: daysAgo(3) },
        { personId: 'b', lastContactAt: daysAgo(90) },
      ],
      NOW
    )
    expect(summary.summary).toContain('1 person is past it')
  })
})

describe('which folds to raise at a meeting', () => {
  function fold(
    name: string,
    elder: string,
    contacts: { personId: string; lastContactAt: Date | null }[]
  ) {
    return {
      foldId: name,
      foldName: name,
      elderName: elder,
      coverage: summariseCoverage(contacts, NOW),
    }
  }

  it('says nothing about a fold where nothing is wrong', () => {
    const concerns = concerningFolds([
      fold('Eastside', 'Tanya', [
        { personId: 'a', lastContactAt: daysAgo(2) },
        { personId: 'b', lastContactAt: daysAgo(9) },
      ]),
    ])
    expect(concerns).toEqual([])
  })

  it('names the overdue count and who logged it, not a score', () => {
    const concerns = concerningFolds([
      fold('Westbrook', 'Dean', [
        { personId: 'a', lastContactAt: daysAgo(90) },
        { personId: 'b', lastContactAt: daysAgo(3) },
      ]),
    ])
    expect(concerns).toHaveLength(1)
    expect(concerns[0]!.reason).toContain('1 of 2 past 60 days (50%)')
    expect(concerns[0]!.reason).toContain('Dean')
    // A health score would be easier to build and would tell an elder nothing
    // they could act on.
    expect(concerns[0]!.reason).not.toMatch(/score|\bout of 10\b/i)
  })

  it('puts the worst fold first', () => {
    const concerns = concerningFolds([
      fold('Ridgeway', 'Marcus', [{ personId: 'a', lastContactAt: null }]),
      fold('Westbrook', 'Dean', [
        { personId: 'b', lastContactAt: null },
        { personId: 'c', lastContactAt: null },
        { personId: 'd', lastContactAt: null },
      ]),
    ])
    expect(concerns.map((concern) => concern.foldName)).toEqual([
      'Westbrook',
      'Ridgeway',
    ])
  })

  it('flags a fold that is too big even when nobody is overdue, and says it is a rule of thumb', () => {
    const many = Array.from({ length: ONE_SHEPHERD_CEILING + 1 }, (_, i) => ({
      personId: `p${i}`,
      lastContactAt: daysAgo(1),
    }))
    const concerns = concerningFolds([fold('Lil Ones', 'Sarah', many)])
    expect(concerns).toHaveLength(1)
    expect(concerns[0]!.reason).toContain('rule of thumb')
    expect(concerns[0]!.reason).toContain('Nobody is overdue yet')
  })

  it('does not flag a fold sitting exactly on the ceiling', () => {
    const exactly = Array.from({ length: ONE_SHEPHERD_CEILING }, (_, i) => ({
      personId: `p${i}`,
      lastContactAt: daysAgo(1),
    }))
    expect(concerningFolds([fold('Eastside', 'Tanya', exactly)])).toEqual([])
  })
})

describe('the word under a fold’s bar', () => {
  function summary(recent: number, warning: number, overdue: number) {
    return summariseCoverage(
      [
        ...Array.from({ length: recent }, (_, i) => ({
          personId: `r${i}`,
          lastContactAt: daysAgo(2),
        })),
        ...Array.from({ length: warning }, (_, i) => ({
          personId: `w${i}`,
          lastContactAt: daysAgo(50),
        })),
        ...Array.from({ length: overdue }, (_, i) => ({
          personId: `o${i}`,
          lastContactAt: daysAgo(90),
        })),
      ],
      NOW
    )
  }

  it('is covered when everyone is comfortably inside the window', () => {
    expect(foldStanding(summary(20, 0, 0))).toBe('covered')
  })

  it('is thin when a few have slipped past', () => {
    expect(foldStanding(summary(20, 0, 1))).toBe('thin')
  })

  it('is thin when a quarter are in the warning band with none overdue', () => {
    expect(foldStanding(summary(15, 5, 0))).toBe('thin')
  })

  it('needs help when a quarter or more are past the window', () => {
    // Seven of nineteen, the design's own worst fold.
    expect(foldStanding(summary(12, 0, 7))).toBe('needs_help')
  })

  it('judges by share rather than count', () => {
    // The same seven overdue people, in a fold big enough to absorb them.
    expect(foldStanding(summary(393, 0, 7))).toBe('thin')
  })

  it('does not call an empty fold a failure', () => {
    expect(foldStanding(summary(0, 0, 0))).toBe('covered')
  })

  it('builds a bar that always fills', () => {
    const segments = coverageSegments(summary(12, 0, 7))
    const total = segments.recent + segments.warning + segments.overdue
    expect(Math.round(total)).toBe(100)
  })

  it('leaves an empty fold with no bar rather than a full one', () => {
    expect(coverageSegments(summary(0, 0, 0))).toEqual({
      recent: 0,
      warning: 0,
      overdue: 0,
    })
  })
})
