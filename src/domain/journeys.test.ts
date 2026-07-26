import { describe, expect, it } from 'vitest'

import {
  CARE_WINDOWS,
  type JourneyInstance,
  type JourneyStep,
  type JourneyTemplate,
  type StepCompletion,
  WINDOW_LABELS,
  canDeleteTemplate,
  canReadJourney,
  deleteTemplateRefusal,
  dueDateFor,
  journeyProgress,
  overdueJourneys,
  templateIssues,
  windowRank,
} from './journeys'

const STARTED = new Date('2026-07-01T00:00:00Z')

function step(overrides: Partial<JourneyStep> = {}): JourneyStep {
  return {
    id: 's1',
    title: 'Call the same day',
    window: 'same_day',
    ownerRole: 'pastoral_staff',
    guidanceNote: 'Do not problem-solve. Ask what happened and listen.',
    ...overrides,
  }
}

function template(overrides: Partial<JourneyTemplate> = {}): JourneyTemplate {
  return {
    id: 'jt-grief',
    name: 'Grief',
    trigger: 'A death in the household',
    visibilityTier: 'all_leaders',
    isSystemDefault: true,
    steps: [
      step({ id: 's1', title: 'Call the same day', window: 'same_day' }),
      step({ id: 's2', title: 'Visit in person', window: 'within_48_hours' }),
      step({ id: 's3', title: 'Check in', window: 'week_2' }),
      step({ id: 's4', title: 'Mark the month', window: 'month_1' }),
    ],
    ...overrides,
  }
}

function done(stepId: string, at: string): StepCompletion {
  return {
    stepId,
    completedAt: new Date(at),
    byId: 'p-dean',
    byName: 'Dean Lowry',
    kind: 'done',
    outcome: 'Sample logged outcome.',
  }
}

function skipped(stepId: string, at: string): StepCompletion {
  return {
    stepId,
    completedAt: new Date(at),
    byId: 'p-dean',
    byName: 'Dean Lowry',
    kind: 'skipped',
    skipReason: 'Family asked for space this week.',
  }
}

function instance(overrides: Partial<JourneyInstance> = {}): JourneyInstance {
  return {
    id: 'ji-1',
    templateId: 'jt-grief',
    personId: 'p-lena',
    startedAt: STARTED,
    ownerId: 'p-dean',
    ownerName: 'Dean Lowry',
    completions: [],
    closedAt: null,
    closedReason: null,
    ...overrides,
  }
}

describe('the care window scale', () => {
  it('is ordered soonest first', () => {
    expect([...CARE_WINDOWS]).toEqual([
      'same_day',
      'within_48_hours',
      'week_1',
      'week_2',
      'month_1',
      'month_3',
      'month_6',
    ])
  })

  it('has strictly increasing ranks', () => {
    const ranks = CARE_WINDOWS.map(windowRank)
    for (let i = 1; i < ranks.length; i += 1) {
      expect(ranks[i]).toBeGreaterThan(ranks[i - 1]!)
    }
  })

  it('labels every window', () => {
    for (const window of CARE_WINDOWS) {
      expect(WINDOW_LABELS[window]).toBeTruthy()
    }
  })

  it('throws on an unknown window rather than ranking it first', () => {
    expect(() => windowRank('next_year' as never)).toThrow(
      /Unknown care window/
    )
  })

  it('turns a window into a date relative to the journey start', () => {
    expect(dueDateFor(STARTED, 'same_day').toISOString()).toBe(
      '2026-07-01T00:00:00.000Z'
    )
    expect(dueDateFor(STARTED, 'within_48_hours').toISOString()).toBe(
      '2026-07-03T00:00:00.000Z'
    )
    expect(dueDateFor(STARTED, 'week_1').toISOString()).toBe(
      '2026-07-08T00:00:00.000Z'
    )
    expect(dueDateFor(STARTED, 'month_6').toISOString()).toBe(
      '2026-12-28T00:00:00.000Z'
    )
  })

  it('does not mutate the date it was given', () => {
    const start = new Date(STARTED)
    dueDateFor(start, 'month_6')
    expect(start.toISOString()).toBe(STARTED.toISOString())
  })
})

describe('system default templates cannot be deleted', () => {
  // §2: "system defaults cannot be deleted, only edited."
  it('refuses to delete a default', () => {
    const grief = template({ isSystemDefault: true })
    expect(canDeleteTemplate(grief)).toBe(false)
    expect(deleteTemplateRefusal(grief)).toMatch(/cannot be removed/)
  })

  it('says why, in terms of the situation rather than the software', () => {
    expect(deleteTemplateRefusal(template())).toMatch(
      /does not stop happening because the journey was deleted/
    )
  })

  it('allows deleting a template the church made', () => {
    const custom = template({ id: 'jt-custom', isSystemDefault: false })
    expect(canDeleteTemplate(custom)).toBe(true)
    expect(deleteTemplateRefusal(custom)).toBeNull()
  })
})

describe('template issues', () => {
  it('finds none in a well-formed template', () => {
    expect(templateIssues(template())).toEqual([])
  })

  it('flags a journey with no steps', () => {
    const empty = template({ steps: [] })
    expect(templateIssues(empty)[0]).toMatch(/no steps/)
  })

  it('flags steps whose windows run backwards', () => {
    const backwards = template({
      steps: [
        step({ id: 's1', title: 'Month later', window: 'month_1' }),
        step({ id: 's2', title: 'Same day', window: 'same_day' }),
      ],
    })
    const issues = templateIssues(backwards)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatch(/before “Month later”/)
  })

  it('accepts two steps in the same window', () => {
    const sameWindow = template({
      steps: [
        step({ id: 's1', window: 'week_1' }),
        step({ id: 's2', window: 'week_1' }),
      ],
    })
    expect(templateIssues(sameWindow)).toEqual([])
  })
})

describe('progress is derived from the completions', () => {
  // §8.1. The handoff describes an instance as tracking current step, due date,
  // and last contact; none of those are stored, because a stored due date drifts
  // the moment a step is finished early.
  it('starts on the first step', () => {
    const progress = journeyProgress(template(), instance(), STARTED)
    expect(progress.currentStep?.id).toBe('s1')
    expect(progress.stepLabel).toBe('Step 1 of 4')
    expect(progress.lastContactAt).toBeNull()
  })

  it('advances as steps are finished', () => {
    const progress = journeyProgress(
      template(),
      instance({ completions: [done('s1', '2026-07-01T10:00:00Z')] }),
      new Date('2026-07-02T00:00:00Z')
    )
    expect(progress.currentStep?.id).toBe('s2')
    expect(progress.stepLabel).toBe('Step 2 of 4')
    expect(progress.completedCount).toBe(1)
  })

  it('counts a documented skip as accounted for, and says so separately', () => {
    const progress = journeyProgress(
      template(),
      instance({
        completions: [
          done('s1', '2026-07-01T10:00:00Z'),
          skipped('s2', '2026-07-03T10:00:00Z'),
        ],
      }),
      new Date('2026-07-04T00:00:00Z')
    )
    expect(progress.currentStep?.id).toBe('s3')
    expect(progress.completedCount).toBe(1)
    expect(progress.skippedCount).toBe(1)
  })

  it('takes the due date from the current step, not the first one', () => {
    const progress = journeyProgress(
      template(),
      instance({ completions: [done('s1', '2026-07-01T10:00:00Z')] }),
      new Date('2026-07-02T00:00:00Z')
    )
    // s2 is within_48_hours, so 2 days after the start.
    expect(progress.dueAt?.toISOString()).toBe('2026-07-03T00:00:00.000Z')
  })

  it('reports the latest completion as the last contact', () => {
    const progress = journeyProgress(
      template(),
      instance({
        completions: [
          done('s2', '2026-07-03T10:00:00Z'),
          done('s1', '2026-07-01T10:00:00Z'),
        ],
      }),
      new Date('2026-07-04T00:00:00Z')
    )
    // Order in the array must not decide it.
    expect(progress.lastContactAt?.toISOString()).toBe(
      '2026-07-03T10:00:00.000Z'
    )
  })

  it('finishes when every step is accounted for', () => {
    const progress = journeyProgress(
      template(),
      instance({
        completions: [
          done('s1', '2026-07-01T10:00:00Z'),
          done('s2', '2026-07-03T10:00:00Z'),
          done('s3', '2026-07-15T10:00:00Z'),
          done('s4', '2026-08-01T10:00:00Z'),
        ],
      }),
      new Date('2026-08-02T00:00:00Z')
    )
    expect(progress.isFinished).toBe(true)
    expect(progress.currentStep).toBeNull()
    expect(progress.dueAt).toBeNull()
    expect(progress.isOverdue).toBe(false)
    expect(progress.summary).toBe('Grief finished.')
  })

  it('mentions skipped steps when it finishes', () => {
    const progress = journeyProgress(
      template(),
      instance({
        completions: [
          done('s1', '2026-07-01T10:00:00Z'),
          skipped('s2', '2026-07-03T10:00:00Z'),
          done('s3', '2026-07-15T10:00:00Z'),
          done('s4', '2026-08-01T10:00:00Z'),
        ],
      }),
      new Date('2026-08-02T00:00:00Z')
    )
    expect(progress.summary).toBe('Grief finished, 1 step skipped.')
  })
})

describe('overdue is derived from the due date', () => {
  it('is not overdue on the day it is due', () => {
    const progress = journeyProgress(
      template(),
      instance(),
      new Date('2026-07-01T00:00:00Z')
    )
    expect(progress.isOverdue).toBe(false)
    expect(progress.daysOverdue).toBe(0)
  })

  it('counts whole days late', () => {
    const progress = journeyProgress(
      template(),
      instance(),
      new Date('2026-07-04T00:00:00Z')
    )
    expect(progress.daysOverdue).toBe(3)
    expect(progress.isOverdue).toBe(true)
  })

  it('says how late, pluralised, and who has it', () => {
    const oneDay = journeyProgress(
      template(),
      instance(),
      new Date('2026-07-02T00:00:00Z')
    )
    expect(oneDay.summary).toBe(
      '“Call the same day” is 1 day overdue, with Dean Lowry.'
    )

    const threeDays = journeyProgress(
      template(),
      instance(),
      new Date('2026-07-04T00:00:00Z')
    )
    expect(threeDays.summary).toBe(
      '“Call the same day” is 3 days overdue, with Dean Lowry.'
    )
  })

  it('names the next step and its owner when nothing is late', () => {
    expect(journeyProgress(template(), instance(), STARTED).summary).toBe(
      'Next: “Call the same day”, with Dean Lowry.'
    )
  })

  it('is never overdue once closed early', () => {
    const progress = journeyProgress(
      template(),
      instance({
        closedAt: new Date('2026-07-02T00:00:00Z'),
        closedReason: 'The family moved away.',
      }),
      new Date('2026-09-01T00:00:00Z')
    )
    expect(progress.isOverdue).toBe(false)
    expect(progress.isFinished).toBe(true)
    expect(progress.closedEarly).toBe(true)
    expect(progress.summary).toBe('Closed early: The family moved away.')
  })

  it('says plainly when a journey was closed with no reason recorded', () => {
    const progress = journeyProgress(
      template(),
      instance({
        closedAt: new Date('2026-07-02T00:00:00Z'),
        closedReason: null,
      }),
      new Date('2026-07-10T00:00:00Z')
    )
    expect(progress.summary).toBe('Closed early: no reason recorded')
  })
})

describe('overdueJourneys', () => {
  it('lists only what is late, worst first', () => {
    const grief = template()
    const entries = [
      { template: grief, instance: instance({ id: 'a' }) },
      {
        template: grief,
        instance: instance({
          id: 'b',
          completions: [done('s1', '2026-07-01T10:00:00Z')],
        }),
      },
      {
        template: grief,
        instance: instance({
          id: 'c',
          startedAt: new Date('2026-07-10T00:00:00Z'),
        }),
      },
    ]
    // As of Jul 5: a is 4 days late on same_day, b is 2 days late on
    // within_48_hours, c has not started yet.
    const overdue = overdueJourneys(entries, new Date('2026-07-05T00:00:00Z'))
    expect(overdue.map((entry) => entry.instance.id)).toEqual(['a', 'b'])
    expect(overdue[0]?.progress.daysOverdue).toBe(4)
  })

  it('returns nothing when everything is on time', () => {
    expect(
      overdueJourneys([{ template: template(), instance: instance() }], STARTED)
    ).toEqual([])
  })
})

describe('a journey is visible at its template’s tier', () => {
  const benevolence = template({
    id: 'jt-benevolence',
    name: 'Benevolence',
    visibilityTier: 'staff_and_elders',
  })

  it('shows an ordinary journey to a leader at the lowest tier', () => {
    expect(canReadJourney('all_leaders', template())).toBe(true)
  })

  it('withholds a staff-tier journey from a group leader', () => {
    expect(canReadJourney('all_leaders', benevolence)).toBe(false)
  })

  it('shows it to staff and above', () => {
    expect(canReadJourney('staff_and_elders', benevolence)).toBe(true)
    expect(canReadJourney('elders_only', benevolence)).toBe(true)
  })

  it('withholds everything from a reader with no clearance', () => {
    expect(canReadJourney(null, template())).toBe(false)
  })
})
