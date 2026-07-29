import { describe, expect, it } from 'vitest'

import {
  MILESTONE_KINDS,
  describeOccurrence,
  isSombre,
  nextOccurrence,
  parseStoredDate,
  recursAnnually,
  upcomingMilestones,
} from './milestones'

const JULY_28 = new Date('2026-07-28T12:00:00Z')

function record(
  kind: (typeof MILESTONE_KINDS)[number],
  occurredOn: string,
  note = ''
) {
  return {
    id: `${kind}-${occurredOn}`,
    personId: 'p1',
    personName: 'Ellis Bramlett',
    kind,
    occurredOn: new Date(occurredOn),
    note,
  }
}

describe('which kinds come round again', () => {
  it('recurs for a baptism and not for a new baby', () => {
    expect(recursAnnually('baptism')).toBe(true)
    expect(recursAnnually('new_baby')).toBe(false)
  })

  it('recurs for a loss, because the anniversary is the point', () => {
    expect(recursAnnually('loss')).toBe(true)
  })

  it('does not treat moving away as an anniversary anybody wants marked', () => {
    expect(recursAnnually('moved_away')).toBe(false)
  })

  it('knows which kinds call for condolence rather than congratulation', () => {
    expect(isSombre('loss')).toBe(true)
    expect(isSombre('birthday')).toBe(false)
  })
})

describe('projecting the next occurrence', () => {
  it('gives this year when the date is still to come', () => {
    const on = nextOccurrence(record('birthday', '1955-09-04'), JULY_28)
    expect(on?.toISOString().slice(0, 10)).toBe('2026-09-04')
  })

  it('rolls to next year when it has passed', () => {
    const on = nextOccurrence(record('birthday', '1955-03-04'), JULY_28)
    expect(on?.toISOString().slice(0, 10)).toBe('2027-03-04')
  })

  it('counts today as still to come', () => {
    const on = nextOccurrence(record('birthday', '1955-07-28'), JULY_28)
    expect(on?.toISOString().slice(0, 10)).toBe('2026-07-28')
  })

  it('does not project a one-off that has passed', () => {
    expect(nextOccurrence(record('new_baby', '2025-01-09'), JULY_28)).toBeNull()
  })

  it('keeps a one-off that is still ahead', () => {
    const on = nextOccurrence(record('new_baby', '2026-08-09'), JULY_28)
    expect(on?.toISOString().slice(0, 10)).toBe('2026-08-09')
  })

  it('rolls a February 29th birthday to March 1st rather than dropping it', () => {
    // 2027 is not a leap year. Losing the date three years in four would mean the
    // app quietly stops telling anyone about this person's birthday.
    const on = nextOccurrence(record('birthday', '2004-02-29'), JULY_28)
    expect(on?.toISOString().slice(0, 10)).toBe('2027-03-01')
  })
})

describe('what to say about it', () => {
  it('says "Turns 71" rather than printing a date', () => {
    const { description } = describeOccurrence(
      record('birthday', '1955-09-04'),
      new Date('2026-09-04T00:00:00Z')
    )
    expect(description).toBe('Turns 71')
  })

  it('counts years married', () => {
    const { description } = describeOccurrence(
      record('wedding_anniversary', '2012-07-30'),
      new Date('2026-07-30T00:00:00Z')
    )
    expect(description).toBe('14 years married')
  })

  it('names the person who died, from the note', () => {
    const { description } = describeOccurrence(
      record('loss', '2025-08-01', 'Hector passed'),
      new Date('2026-08-01T00:00:00Z')
    )
    expect(description).toBe('One year since Hector passed')
  })

  it('still says something useful for a loss with no note', () => {
    const { description } = describeOccurrence(
      record('loss', '2023-08-01'),
      new Date('2026-08-01T00:00:00Z')
    )
    expect(description).toBe('3 years since their loss')
  })

  it('writes "One year" rather than "1 years"', () => {
    const { description } = describeOccurrence(
      record('membership', '2025-08-14'),
      new Date('2026-08-14T00:00:00Z')
    )
    expect(description).toBe('One year a member')
  })

  it('falls back to the note for a one-off', () => {
    const { description, yearsSince } = describeOccurrence(
      record('new_baby', '2026-08-09', 'Amara born'),
      new Date('2026-08-09T00:00:00Z')
    )
    expect(description).toBe('Amara born')
    expect(yearsSince).toBeNull()
  })
})

describe('grouping the next thirty days', () => {
  const milestones = [
    record('birthday', '1955-07-28'), // today
    record('wedding_anniversary', '2012-07-30'), // 2 days
    record('baptism', '2020-08-10'), // 13 days
    record('birthday', '1990-12-01'), // outside the window
  ]

  it('splits into today, this week, and coming up', () => {
    const groups = upcomingMilestones(milestones, JULY_28)
    expect(groups.map((group) => group.key)).toEqual([
      'today',
      'this_week',
      'coming_up',
    ])
    expect(groups[0]!.count).toBe(1)
    expect(groups[1]!.count).toBe(1)
    expect(groups[2]!.count).toBe(1)
  })

  it('leaves out anything past the window', () => {
    const all = upcomingMilestones(milestones, JULY_28).flatMap(
      (group) => group.items
    )
    expect(all).toHaveLength(3)
  })

  it('orders soonest first', () => {
    const all = upcomingMilestones(milestones, JULY_28).flatMap(
      (group) => group.items
    )
    expect(all.map((item) => item.daysAway)).toEqual([0, 2, 13])
  })

  it('pluralises each group from its own count', () => {
    const groups = upcomingMilestones(milestones, JULY_28)
    expect(groups[0]!.countLabel).toBe('1 milestone')
    const empty = upcomingMilestones([], JULY_28)
    expect(empty[0]!.countLabel).toBe('0 milestones')
  })

  it('marks a loss as sombre so no screen has to guess from the label', () => {
    const groups = upcomingMilestones(
      [record('loss', '2025-07-29', 'Hector passed')],
      JULY_28
    )
    expect(groups[1]!.items[0]!.sombre).toBe(true)
  })
})

describe('parsing a stored date', () => {
  // The one-day-off bug this function exists to prevent. If a `date` column ever
  // starts arriving as a local-time Date instead of a string, half the church
  // gets their birthday reminder a day early and nobody thinks to look here.
  it('keeps the day, regardless of the machine’s time zone', () => {
    const parsed = parseStoredDate('1955-09-04')
    expect(parsed.toISOString()).toBe('1955-09-04T00:00:00.000Z')
    expect(parsed.getUTCDate()).toBe(4)
    expect(parsed.getUTCMonth()).toBe(8)
  })

  it('survives a round trip through the projection', () => {
    const on = nextOccurrence(
      { kind: 'birthday', occurredOn: parseStoredDate('2004-02-29') },
      new Date('2026-07-28T12:00:00Z')
    )
    expect(on?.toISOString().slice(0, 10)).toBe('2027-03-01')
  })

  it('refuses anything that is not a bare date rather than guessing', () => {
    expect(() => parseStoredDate('1955-09-04T05:00:00Z')).toThrow(/YYYY-MM-DD/)
    expect(() => parseStoredDate('not a date')).toThrow()
  })
})
