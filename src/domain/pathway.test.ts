import { describe, expect, it } from 'vitest'

import {
  MIGRATION_CHOICES,
  MIGRATION_CHOICE_LABELS,
  PATHWAY_ACTIONS,
  PATHWAY_STATES,
  type PathwayState,
  attemptTransition,
  availableActions,
  isPathwayState,
  isReadableState,
  requiresReviewList,
  transitionRule,
} from './pathway'
import { type Principal, principalOf } from './roles'

const designer = principalOf('p-dana', ['pathway_designer'])
const reviewer = principalOf('p-rex', ['reviewer_approver'])
const admin = principalOf('p-avery', ['administrator'])
const elder = principalOf('p-marcus', ['pastor_elder'])

const AT = new Date('2026-07-26T12:00:00Z')

function context(
  currentState: PathwayState,
  extra: Partial<Parameters<typeof attemptTransition>[2]> = {}
) {
  return {
    versionId: 'v2',
    currentState,
    at: AT,
    ...extra,
  }
}

describe('the state list', () => {
  it('is the eight states in §4', () => {
    expect([...PATHWAY_STATES]).toEqual([
      'discovery',
      'draft',
      'internal_review',
      'changes_requested',
      'approved',
      'scheduled',
      'active',
      'archived',
    ])
  })

  it('recognises only real states', () => {
    expect(isPathwayState('active')).toBe(true)
    expect(isPathwayState('published')).toBe(false)
  })

  it('keeps archived versions readable', () => {
    // §4: "Previous versions are archived and remain readable."
    expect(isReadableState('archived')).toBe(true)
    expect(isReadableState('active')).toBe(true)
    expect(isReadableState('draft')).toBe(false)
  })
})

describe('state changes only happen through actions', () => {
  it('offers no action that archives a pathway', () => {
    // §4's actual prototype bug: a user could click the "Archived" chip, which
    // asserted a live pathway was archived. Archiving is a consequence of
    // publishing, never a choice.
    expect(PATHWAY_ACTIONS).not.toContain('archive')
    for (const action of PATHWAY_ACTIONS) {
      expect(transitionRule(action).to).not.toBe('archived')
    }
  })

  it('archives the previously active version as a side effect of publishing', () => {
    const result = attemptTransition(
      admin,
      'publish',
      context('approved', { publishBlockers: [], activeVersionId: 'v1' })
    )
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.record.to).toBe('active')
    expect(result.archives).toEqual(['v1'])
  })

  it('archives nothing when there is no active version yet', () => {
    const result = attemptTransition(
      admin,
      'publish',
      context('approved', { publishBlockers: [], activeVersionId: null })
    )
    if (!result.ok) throw new Error('unreachable')
    expect(result.archives).toEqual([])
  })

  it('does not archive the version being published', () => {
    const result = attemptTransition(
      admin,
      'publish',
      context('approved', { publishBlockers: [], activeVersionId: 'v2' })
    )
    if (!result.ok) throw new Error('unreachable')
    expect(result.archives).toEqual([])
  })
})

describe('the legal transition table', () => {
  it('matches §4 for submit for review', () => {
    const rule = transitionRule('submit_for_review')
    expect(rule.from).toEqual(['draft'])
    expect(rule.to).toBe('internal_review')
    expect(rule.permission).toBe('pathway.submit_for_review')
  })

  it('matches §4 for request changes', () => {
    const rule = transitionRule('request_changes')
    expect([...rule.from]).toEqual(['internal_review', 'approved'])
    expect(rule.to).toBe('changes_requested')
  })

  it('matches §4 for approve', () => {
    const rule = transitionRule('approve')
    expect([...rule.from]).toEqual(['internal_review', 'changes_requested'])
    expect(rule.to).toBe('approved')
  })

  it('matches §4 for editing a stage', () => {
    const rule = transitionRule('edit_stage')
    expect([...rule.from]).toEqual(['active', 'archived'])
    expect(rule.to).toBe('draft')
  })

  it('marks the transitions §4 does not specify as inferred', () => {
    // §4 lists `discovery` and `scheduled` among the states but gives no
    // transition reaching either. Those are flagged rather than passed off as
    // documented policy.
    expect(transitionRule('begin_draft').inferred).toMatch(/discovery/)
    expect(transitionRule('schedule').inferred).toMatch(/scheduled/)
    expect(transitionRule('submit_for_review').inferred).toBeNull()
    expect(transitionRule('approve').inferred).toBeNull()
  })

  it('refuses a move that is legal for a different state', () => {
    const result = attemptTransition(reviewer, 'approve', context('draft'))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.refusal.code).toBe('illegal_from_state')
    expect(result.refusal.message).toMatch(/not available from a draft/)
  })
})

describe('permissions on transitions', () => {
  it('lets a designer submit for review but not approve or publish', () => {
    expect(
      attemptTransition(designer, 'submit_for_review', context('draft')).ok
    ).toBe(true)
    expect(
      attemptTransition(designer, 'approve', context('internal_review')).ok
    ).toBe(false)
    expect(
      attemptTransition(
        designer,
        'publish',
        context('approved', { publishBlockers: [] })
      ).ok
    ).toBe(false)
  })

  it('lets a reviewer approve and publish', () => {
    expect(
      attemptTransition(reviewer, 'approve', context('internal_review')).ok
    ).toBe(true)
    expect(
      attemptTransition(
        reviewer,
        'publish',
        context('approved', { publishBlockers: [] })
      ).ok
    ).toBe(true)
  })

  it('refuses an elder with no pathway role', () => {
    const result = attemptTransition(
      elder,
      'approve',
      context('internal_review')
    )
    expect(result.ok).toBe(false)
  })

  it('uses the permission’s own note as the refusal, so the two cannot drift', () => {
    // §8.3. The sentence the user sees is the one the gate produced.
    const result = attemptTransition(
      designer,
      'publish',
      context('approved', { publishBlockers: [] })
    )
    if (result.ok) throw new Error('unreachable')
    expect(result.refusal.code).toBe('not_permitted')
    expect(result.refusal.message).toMatch(/separate from editing/i)
  })

  it('honours an individual grant of pathway.publish', () => {
    const grantedDesigner: Principal = {
      ...designer,
      permissionGrants: [
        {
          id: 'pg-1',
          permission: 'pathway.publish',
          grantedById: 'p-avery',
          grantedByName: 'Avery Nkemdirim',
          grantedAt: AT,
          reason: 'Publishing while the approver is on sabbatical.',
          revokedAt: null,
          revokedById: null,
        },
      ],
    }
    expect(
      attemptTransition(
        grantedDesigner,
        'publish',
        context('approved', { publishBlockers: [] })
      ).ok
    ).toBe(true)
  })
})

describe('an action that reports success must have done something', () => {
  // §8.5, and the refusal has to say plainly that there is nothing to do.
  it('refuses to approve a version that is already approved', () => {
    const result = attemptTransition(reviewer, 'approve', context('approved'))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.refusal.code).toBe('nothing_to_do')
    expect(result.refusal.message).toMatch(/already approved\. Nothing to do\./)
  })

  it('refuses to publish a version that is already active', () => {
    const result = attemptTransition(
      admin,
      'publish',
      context('active', { publishBlockers: [] })
    )
    if (result.ok) throw new Error('unreachable')
    expect(result.refusal.code).toBe('nothing_to_do')
  })

  it('reports nothing-to-do ahead of a permission refusal', () => {
    // Telling someone they lack permission for a no-op is two kinds of
    // misleading at once.
    const result = attemptTransition(elder, 'approve', context('approved'))
    if (result.ok) throw new Error('unreachable')
    expect(result.refusal.code).toBe('nothing_to_do')
  })
})

describe('the publish gate is not optional', () => {
  it('throws when a caller tries to publish without evaluating blockers', () => {
    // Not a user-facing refusal: it means the gate was never run. Silently
    // treating a missing gate as "no blockers" is how a publish slips through.
    expect(() =>
      attemptTransition(admin, 'publish', context('approved'))
    ).toThrow(/requires publishBlockers/)
  })

  it('refuses when blockers are present, and names them', () => {
    const result = attemptTransition(
      admin,
      'publish',
      context('approved', {
        publishBlockers: [
          {
            reason:
              'no decision has been made about people already in the pathway',
          },
        ],
      })
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.refusal.code).toBe('blocked')
    expect(result.refusal.message).toMatch(/One thing is unresolved/)
    expect(result.refusal.message).toMatch(/people already in the pathway/)
  })

  it('pluralises the blocker count from the blockers', () => {
    const result = attemptTransition(
      admin,
      'publish',
      context('approved', {
        publishBlockers: [{ reason: 'first' }, { reason: 'second' }],
      })
    )
    if (result.ok) throw new Error('unreachable')
    expect(result.refusal.message).toMatch(/^2 things are unresolved/)
  })

  it('allows publishing from scheduled without a second approval', () => {
    const result = attemptTransition(
      admin,
      'publish',
      context('scheduled', { publishBlockers: [] })
    )
    expect(result.ok).toBe(true)
  })
})

describe('every transition is attributed to a person', () => {
  it('records the acting person and the time, not a role', () => {
    // §4: "Not a role string — a role cannot be held accountable."
    const result = attemptTransition(
      reviewer,
      'approve',
      context('internal_review')
    )
    if (!result.ok) throw new Error('unreachable')
    expect(result.record.actorId).toBe('p-rex')
    expect(result.record.occurredAt).toEqual(AT)
    expect(result.record.from).toBe('internal_review')
    expect(result.record.to).toBe('approved')
    expect(JSON.stringify(result.record)).not.toContain('reviewer_approver')
  })

  it('carries the detail through to the record', () => {
    const result = attemptTransition(
      admin,
      'publish',
      context('approved', {
        publishBlockers: [],
        detail: 'Added the membership interview stage.',
      })
    )
    if (!result.ok) throw new Error('unreachable')
    expect(result.record.detail).toBe('Added the membership interview stage.')
  })

  it('defaults detail to null rather than an empty string', () => {
    const result = attemptTransition(
      reviewer,
      'approve',
      context('internal_review')
    )
    if (!result.ok) throw new Error('unreachable')
    expect(result.record.detail).toBeNull()
  })
})

describe('availableActions', () => {
  it('offers only what the same transition function would allow', () => {
    // §8.3 and §8.4: a control is never offered that the action then refuses.
    const actions = availableActions(designer, context('draft'))
    const submit = actions.find((entry) => entry.action === 'submit_for_review')
    expect(submit?.available).toBe(true)
    expect(submit?.reason).toBeNull()
  })

  it('gives every unavailable action a reason', () => {
    // §8.4: a disabled control must never be disabled without an explanation.
    const actions = availableActions(designer, context('draft'))
    for (const entry of actions) {
      if (!entry.available) {
        expect(entry.reason, entry.action).toBeTruthy()
      }
    }
  })

  it('reports publish as unavailable when the gate has not been run', () => {
    const actions = availableActions(admin, context('approved'))
    const publish = actions.find((entry) => entry.action === 'publish')
    expect(publish?.available).toBe(false)
    expect(publish?.reason).toMatch(/gate has not been evaluated/)
  })

  it('covers every action', () => {
    const actions = availableActions(admin, context('draft'))
    expect(actions.map((entry) => entry.action)).toEqual([...PATHWAY_ACTIONS])
  })
})

describe('migration choice', () => {
  it('offers exactly the four options in §4', () => {
    expect([...MIGRATION_CHOICES]).toEqual([
      'existing_stay',
      'only_new_enter',
      'migrate_everyone',
      'decide_person_by_person',
    ])
  })

  it('labels every option', () => {
    for (const choice of MIGRATION_CHOICES) {
      expect(MIGRATION_CHOICE_LABELS[choice]).toBeTruthy()
    }
  })

  it('knows which choice generates a per-person review list', () => {
    expect(requiresReviewList('decide_person_by_person')).toBe(true)
    expect(requiresReviewList('migrate_everyone')).toBe(false)
  })
})
