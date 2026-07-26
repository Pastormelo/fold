import { describe, expect, it } from 'vitest'

import {
  CONFIDENTIALITY_RULES,
  HIGHEST_TIER,
  LOWEST_TIER,
  TIER_DESCRIPTIONS,
  TIER_ORDER,
  clearanceReaches,
  compareTiers,
  highestTier,
  isConfidentialityTier,
  tierRank,
} from './tiers'

describe('the tier scale', () => {
  it('is ordered least to most restrictive', () => {
    expect([...TIER_ORDER]).toEqual([
      'all_leaders',
      'staff_and_elders',
      'elders_only',
    ])
  })

  it('has strictly increasing ranks, so no two tiers are interchangeable', () => {
    const ranks = TIER_ORDER.map(tierRank)
    for (let i = 1; i < ranks.length; i += 1) {
      expect(ranks[i]).toBeGreaterThan(ranks[i - 1])
    }
  })

  it('derives its floor and ceiling from the order', () => {
    expect(LOWEST_TIER).toBe('all_leaders')
    expect(HIGHEST_TIER).toBe('elders_only')
  })

  it('throws on an unknown tier rather than ranking it below everything', () => {
    // A silent -1 would compare as "less restricted than all real tiers",
    // which is the direction that leaks.
    expect(() => tierRank('pastor_only' as never)).toThrow(
      /Unknown confidentiality tier/
    )
  })

  it('recognises only the three real tiers', () => {
    expect(isConfidentialityTier('elders_only')).toBe(true)
    expect(isConfidentialityTier('everyone')).toBe(false)
    expect(isConfidentialityTier(2)).toBe(false)
    expect(isConfidentialityTier(null)).toBe(false)
  })
})

describe('clearanceReaches', () => {
  // The full 3x3 matrix, written out rather than generated, so a change to the
  // rule has to be stated here deliberately.
  const expected: Record<string, boolean> = {
    'all_leaders reads all_leaders': true,
    'all_leaders reads staff_and_elders': false,
    'all_leaders reads elders_only': false,
    'staff_and_elders reads all_leaders': true,
    'staff_and_elders reads staff_and_elders': true,
    'staff_and_elders reads elders_only': false,
    'elders_only reads all_leaders': true,
    'elders_only reads staff_and_elders': true,
    'elders_only reads elders_only': true,
  }

  for (const clearance of TIER_ORDER) {
    for (const content of TIER_ORDER) {
      const key = `${clearance} reads ${content}`
      it(key, () => {
        expect(clearanceReaches(clearance, content)).toBe(expected[key])
      })
    }
  }

  it('does not leak the middle tier to the lowest clearance', () => {
    // The regression named in §3: an early prototype gated only the top tier,
    // so benevolence amounts and marriage notes were readable by every leader.
    expect(clearanceReaches('all_leaders', 'staff_and_elders')).toBe(false)
    expect(clearanceReaches('all_leaders', 'elders_only')).toBe(false)
  })

  it('is not a set of booleans — reaching the top implies reaching the rest', () => {
    for (const content of TIER_ORDER) {
      expect(clearanceReaches(HIGHEST_TIER, content)).toBe(true)
    }
  })
})

describe('compareTiers', () => {
  it('is negative when the first tier is less restricted', () => {
    expect(compareTiers('all_leaders', 'elders_only')).toBeLessThan(0)
    expect(compareTiers('elders_only', 'all_leaders')).toBeGreaterThan(0)
    expect(compareTiers('staff_and_elders', 'staff_and_elders')).toBe(0)
  })
})

describe('highestTier', () => {
  it('returns the most permissive tier in the set', () => {
    expect(highestTier(['all_leaders', 'elders_only'])).toBe('elders_only')
    expect(highestTier(['all_leaders', 'staff_and_elders'])).toBe(
      'staff_and_elders'
    )
    expect(highestTier(['all_leaders'])).toBe('all_leaders')
  })

  it('returns null for an empty set rather than defaulting to a tier', () => {
    // Defaulting to `all_leaders` here would grant ordinary care access to
    // every role that should have none.
    expect(highestTier([])).toBeNull()
  })
})

describe('tier descriptions', () => {
  it('describes every tier', () => {
    for (const tier of TIER_ORDER) {
      const description = TIER_DESCRIPTIONS[tier]
      expect(description.name).toBeTruthy()
      expect(description.who).toBeTruthy()
      expect(description.sees).toBeTruthy()
      expect(description.cannot).toBeTruthy()
    }
  })

  it('carries no hardcoded person count', () => {
    // §8.1. The prototype shipped "61 people" / "14 people" / "6 people" as
    // literals beside live data. Counts belong to countLeadersByClearance.
    for (const tier of TIER_ORDER) {
      const serialised = JSON.stringify(TIER_DESCRIPTIONS[tier])
      expect(serialised).not.toMatch(/\d+\s*(people|person)/i)
      expect(TIER_DESCRIPTIONS[tier]).not.toHaveProperty('count')
    }
  })

  it('states that nothing sits above the top tier', () => {
    expect(TIER_DESCRIPTIONS[HIGHEST_TIER].cannot).toMatch(/nothing is above/i)
  })
})

describe('the confidentiality practices', () => {
  it('keeps all six rules, each with its reason', () => {
    expect(CONFIDENTIALITY_RULES).toHaveLength(6)
    for (const { rule, why } of CONFIDENTIALITY_RULES) {
      expect(rule).toBeTruthy()
      expect(why).toBeTruthy()
    }
  })

  it('includes the two rules the access model is built on', () => {
    const rules = CONFIDENTIALITY_RULES.map((entry) => entry.rule)
    expect(rules).toContain('Access is by case, not by title')
    expect(rules).toContain('Tier is set when the note is written')
  })
})
