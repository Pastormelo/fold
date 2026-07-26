import { describe, expect, it } from 'vitest'

import {
  type HealthFinding,
  type Review,
  approvedBy,
  isAcknowledged,
  objectionsAddressedByOthers,
  publishReadiness,
  publishWouldBeNoOp,
  unaddressedObjections,
  unresolvedBlockingFindings,
} from './pathway-publish'
import { type EditablePathway, diffPathway } from './pathway-diff'

const APPROVED_AT = new Date('2026-07-20T00:00:00Z')
const RAISED_AT = new Date('2026-07-18T00:00:00Z')

function finding(overrides: Partial<HealthFinding> = {}): HealthFinding {
  return {
    id: 'h1',
    category: 'Ownership',
    severity: 'high',
    evidence: 'Stage 3 has no owning role.',
    why: 'Nobody follows up, and nobody notices that nobody did.',
    options: ['Assign the connection team', 'Assign an elder'],
    blocksPublishing: true,
    dismissedById: null,
    dismissalReason: null,
    ...overrides,
  }
}

function review(overrides: Partial<Review> = {}): Review {
  return {
    reviewerId: 'p-rex',
    reviewerName: 'Rex Ellery',
    approval: null,
    objection: null,
    ...overrides,
  }
}

function pathway(stages: EditablePathway['stages']): EditablePathway {
  return {
    internalName: 'Assimilation 2026',
    publicName: 'Finding your place',
    philosophy: 'Nobody disappears quietly.',
    discipleDefinition: 'Following Jesus with other people, on purpose.',
    stages,
  }
}

const emptyPathway = pathway([])
const changedPathway = pathway([
  {
    id: 's1',
    name: 'First contact',
    publicName: 'Welcome',
    subtitle: '',
    purpose: '',
    outcome: '',
    entryCondition: '',
    requiredActions: [],
    optionalActions: [],
    ownerRole: '',
    completionCondition: '',
    stoppingRule: '',
    reactivationRule: '',
    escalationRule: '',
    milestones: [],
    intentionallyAbsent: [],
  },
])

const noChangeDiff = diffPathway({
  draft: emptyPathway,
  published: emptyPathway,
})
const realDiff = diffPathway({ draft: changedPathway, published: emptyPathway })

describe('health findings gate publishing from the findings themselves', () => {
  // The prototype kept "a health-check gate independent of the findings" (§8.1).
  // Nothing here accepts a boolean saying the check passed.
  it('counts a blocking finding nobody acknowledged', () => {
    expect(unresolvedBlockingFindings([finding()])).toHaveLength(1)
  })

  it('ignores a non-blocking finding', () => {
    expect(
      unresolvedBlockingFindings([finding({ blocksPublishing: false })])
    ).toHaveLength(0)
  })

  it('clears a blocking finding acknowledged with a reason', () => {
    // §4: "or they are explicitly acknowledged with a reason".
    const acknowledged = finding({
      dismissedById: 'p-avery',
      dismissalReason:
        'The elders decided ownership sits with the campus pastor.',
    })
    expect(isAcknowledged(acknowledged)).toBe(true)
    expect(unresolvedBlockingFindings([acknowledged])).toHaveLength(0)
  })

  it('does not treat a dismissal without a reason as an acknowledgement', () => {
    expect(
      isAcknowledged(
        finding({ dismissedById: 'p-avery', dismissalReason: null })
      )
    ).toBe(false)
    expect(
      isAcknowledged(
        finding({ dismissedById: 'p-avery', dismissalReason: '   ' })
      )
    ).toBe(false)
  })

  it('does not treat a reason without an acknowledger as an acknowledgement', () => {
    expect(
      isAcknowledged(finding({ dismissedById: null, dismissalReason: 'Fine.' }))
    ).toBe(false)
  })
})

describe('objection marked addressed is not approved', () => {
  // §4's sharpest rule. "The permanent version record must not claim someone
  // approved a pathway when they only had their objection resolved by someone
  // else."
  const objectorWhoNeverApproved = review({
    reviewerId: 'p-rex',
    reviewerName: 'Rex Ellery',
    objection: {
      raisedAt: RAISED_AT,
      note: 'The membership stage skips the elder interview.',
      addressedAt: APPROVED_AT,
      addressedById: 'p-avery',
    },
  })

  it('does not list them as an approver', () => {
    expect(approvedBy([objectorWhoNeverApproved])).toHaveLength(0)
  })

  it('lists a reviewer who genuinely approved', () => {
    const approver = review({
      reviewerId: 'p-tanya',
      reviewerName: 'Tanya Jules',
      approval: { at: APPROVED_AT },
    })
    const approvals = approvedBy([approver])
    expect(approvals).toHaveLength(1)
    expect(approvals[0]?.reviewerName).toBe('Tanya Jules')
    expect(approvals[0]?.at).toEqual(APPROVED_AT)
  })

  it('separates the two when both are present in one review set', () => {
    const approvals = approvedBy([
      objectorWhoNeverApproved,
      review({
        reviewerId: 'p-tanya',
        reviewerName: 'Tanya Jules',
        approval: { at: APPROVED_AT },
      }),
    ])
    expect(approvals.map((entry) => entry.reviewerId)).toEqual(['p-tanya'])
  })

  it('records that someone else resolved the objection', () => {
    const resolved = objectionsAddressedByOthers([objectorWhoNeverApproved])
    expect(resolved).toHaveLength(1)
    expect(resolved[0]?.reviewerId).toBe('p-rex')
    expect(resolved[0]?.addressedById).toBe('p-avery')
    // Stated rather than inferred from absence.
    expect(resolved[0]?.alsoApproved).toBe(false)
  })

  it('does not flag a reviewer who addressed their own objection', () => {
    const selfResolved = review({
      objection: {
        raisedAt: RAISED_AT,
        note: 'Wording.',
        addressedAt: APPROVED_AT,
        addressedById: 'p-rex',
      },
    })
    expect(objectionsAddressedByOthers([selfResolved])).toHaveLength(0)
  })

  it('notes when someone both objected and later approved', () => {
    const both = review({
      approval: { at: APPROVED_AT },
      objection: {
        raisedAt: RAISED_AT,
        note: 'Wording.',
        addressedAt: APPROVED_AT,
        addressedById: 'p-avery',
      },
    })
    expect(objectionsAddressedByOthers([both])[0]?.alsoApproved).toBe(true)
    expect(approvedBy([both])).toHaveLength(1)
  })
})

describe('unaddressed objections block', () => {
  it('finds a reviewer still holding', () => {
    const holding = review({
      objection: {
        raisedAt: RAISED_AT,
        note: 'Still not right.',
        addressedAt: null,
        addressedById: null,
      },
    })
    expect(unaddressedObjections([holding])).toHaveLength(1)
  })

  it('does not count an addressed objection', () => {
    const addressed = review({
      objection: {
        raisedAt: RAISED_AT,
        note: 'Was not right.',
        addressedAt: APPROVED_AT,
        addressedById: 'p-avery',
      },
    })
    expect(unaddressedObjections([addressed])).toHaveLength(0)
  })
})

describe('the publish gate', () => {
  const ready = {
    findings: [] as HealthFinding[],
    reviews: [] as Review[],
    migrationChoice: 'existing_stay' as const,
    diff: realDiff,
    peopleInFlight: 12,
  }

  it('is ready when all three conditions are met', () => {
    const readiness = publishReadiness(ready)
    expect(readiness.ready).toBe(true)
    expect(readiness.blockers).toHaveLength(0)
  })

  it('blocks on an unacknowledged blocking finding', () => {
    const readiness = publishReadiness({ ...ready, findings: [finding()] })
    expect(readiness.ready).toBe(false)
    expect(readiness.blockers.map((blocker) => blocker.code)).toContain(
      'blocking_findings'
    )
  })

  it('blocks on a reviewer holding changes', () => {
    const readiness = publishReadiness({
      ...ready,
      reviews: [
        review({
          reviewerName: 'Rex Ellery',
          objection: {
            raisedAt: RAISED_AT,
            note: 'Not yet.',
            addressedAt: null,
            addressedById: null,
          },
        }),
      ],
    })
    expect(readiness.ready).toBe(false)
    const blocker = readiness.blockers.find(
      (entry) => entry.code === 'unaddressed_objection'
    )
    // Names the person, so the next step is obvious.
    expect(blocker?.reason).toContain('Rex Ellery')
  })

  it('blocks when no migration choice has been made', () => {
    // §4: "Never migrate existing participants automatically."
    const readiness = publishReadiness({ ...ready, migrationChoice: null })
    expect(readiness.ready).toBe(false)
    expect(readiness.blockers.map((blocker) => blocker.code)).toContain(
      'no_migration_choice'
    )
    expect(
      readiness.blockers.find((entry) => entry.code === 'no_migration_choice')
        ?.reason
    ).toMatch(/people already in the pathway/)
  })

  it('reports all three blockers at once rather than the first', () => {
    const readiness = publishReadiness({
      findings: [finding()],
      reviews: [
        review({
          objection: {
            raisedAt: RAISED_AT,
            note: 'No.',
            addressedAt: null,
            addressedById: null,
          },
        }),
      ],
      migrationChoice: null,
      diff: realDiff,
      peopleInFlight: 0,
    })
    expect(readiness.blockers).toHaveLength(3)
    expect(readiness.summary).toBe(
      '3 things are unresolved before this can be published.'
    )
  })

  it('pluralises a single blocker', () => {
    const readiness = publishReadiness({ ...ready, migrationChoice: null })
    expect(readiness.summary).toBe(
      'One thing is unresolved before this can be published.'
    )
  })

  it('reads the changed stage count off the diff rather than recounting', () => {
    const readiness = publishReadiness(ready)
    expect(readiness.changedStageCount).toBe(realDiff.changedStageCount)
  })

  it('carries only genuine approvals into the version record', () => {
    const readiness = publishReadiness({
      ...ready,
      reviews: [
        review({
          reviewerId: 'p-rex',
          objection: {
            raisedAt: RAISED_AT,
            note: 'Was not right.',
            addressedAt: APPROVED_AT,
            addressedById: 'p-avery',
          },
        }),
        review({
          reviewerId: 'p-tanya',
          reviewerName: 'Tanya Jules',
          approval: { at: APPROVED_AT },
        }),
      ],
    })
    expect(readiness.approvals.map((entry) => entry.reviewerId)).toEqual([
      'p-tanya',
    ])
  })

  it('states how many people are in flight, pluralised', () => {
    expect(publishReadiness(ready).summary).toMatch(/12 people are in flight/)
    expect(publishReadiness({ ...ready, peopleInFlight: 1 }).summary).toMatch(
      /1 person is in flight/
    )
  })
})

describe('publishing an identical version is a no-op worth saying', () => {
  // §8.5: an action that reports success must have done something.
  const identical = publishReadiness({
    findings: [],
    reviews: [],
    migrationChoice: 'existing_stay',
    diff: noChangeDiff,
    peopleInFlight: 0,
  })

  it('clears the gate but reports no difference', () => {
    expect(identical.ready).toBe(true)
    expect(publishWouldBeNoOp(identical)).toBe(true)
    expect(identical.summary).toBe(
      'Ready to publish, but nothing differs from the active pathway.'
    )
  })

  it('is not a no-op when something actually changed', () => {
    const changed = publishReadiness({
      findings: [],
      reviews: [],
      migrationChoice: 'existing_stay',
      diff: realDiff,
      peopleInFlight: 3,
    })
    expect(publishWouldBeNoOp(changed)).toBe(false)
  })

  it('is not called a no-op while it is still blocked', () => {
    const blocked = publishReadiness({
      findings: [],
      reviews: [],
      migrationChoice: null,
      diff: noChangeDiff,
      peopleInFlight: 0,
    })
    expect(publishWouldBeNoOp(blocked)).toBe(false)
  })
})
