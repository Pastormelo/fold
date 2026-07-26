/**
 * Confidentiality tiers — HANDOFF.md §3.
 *
 * The most important rule in the product. Get it wrong and the app becomes
 * gossip with a database.
 *
 * Tiers are an ORDERED SCALE, not a set of booleans. An early version of the
 * design prototype gated only the top tier and leaked the middle one. The
 * ordering lives in exactly one place — `TIER_ORDER` — and every comparison
 * derives from it, so a new tier cannot be added without taking a position on
 * where it sits.
 */

/** Ordered least to most restrictive. Index is the rank. */
export const TIER_ORDER = [
  'all_leaders',
  'staff_and_elders',
  'elders_only',
] as const

export type ConfidentialityTier = (typeof TIER_ORDER)[number]

/** The scale's floor and ceiling, derived rather than restated. */
export const LOWEST_TIER: ConfidentialityTier = TIER_ORDER[0]
export const HIGHEST_TIER: ConfidentialityTier =
  TIER_ORDER[TIER_ORDER.length - 1]

export function isConfidentialityTier(
  value: unknown
): value is ConfidentialityTier {
  return (
    typeof value === 'string' &&
    (TIER_ORDER as readonly string[]).includes(value)
  )
}

/** Position on the scale. Higher means more restricted. */
export function tierRank(tier: ConfidentialityTier): number {
  const rank = TIER_ORDER.indexOf(tier)
  if (rank === -1) {
    // Unreachable through the type system, but a silent -1 would compare as
    // "less restricted than everything" and leak. Fail loudly instead.
    throw new Error(`Unknown confidentiality tier: ${String(tier)}`)
  }
  return rank
}

/** Negative when `a` is less restricted than `b`. */
export function compareTiers(
  a: ConfidentialityTier,
  b: ConfidentialityTier
): number {
  return tierRank(a) - tierRank(b)
}

/**
 * Whether `clearance` reaches content written at `contentTier`.
 *
 * This is the single comparison the whole confidentiality model rests on.
 * Note it is the only place `>=` appears against a tier rank; everything else
 * calls through here.
 */
export function clearanceReaches(
  clearance: ConfidentialityTier,
  contentTier: ConfidentialityTier
): boolean {
  return tierRank(clearance) >= tierRank(contentTier)
}

/** The most permissive of a set of tiers. `null` when the set is empty. */
export function highestTier(
  tiers: readonly ConfidentialityTier[]
): ConfidentialityTier | null {
  return tiers.reduce<ConfidentialityTier | null>(
    (best, tier) =>
      best === null || compareTiers(tier, best) > 0 ? tier : best,
    null
  )
}

/**
 * Tier descriptions, ported verbatim from the prototype's `TIERS` array.
 *
 * The prototype carried a hardcoded `count` on each of these ("61 people",
 * "14 people", "6 people") sitting beside live data. That is the §8
 * derive-never-mirror violation, so it is deliberately absent here — counts
 * are computed from the leader records that resolve to each tier. See
 * `countLeadersByClearance` in `./roles`.
 */
export const TIER_DESCRIPTIONS: Record<
  ConfidentialityTier,
  { name: string; who: string; sees: string; cannot: string }
> = {
  all_leaders: {
    name: 'All leaders',
    who: 'Group leaders, deacons, staff, elders',
    sees: 'Ordinary care: visits, calls, grief, hospital, new believers, milestones.',
    cannot:
      'Benevolence amounts, marriage and personal-struggle notes, restoration anything.',
  },
  staff_and_elders: {
    name: 'Staff and elders',
    who: 'Pastoral staff and the elder board',
    sees: 'Everything above, plus benevolence records, marriage crisis, and personal struggle.',
    cannot: 'Restoration case notes.',
  },
  elders_only: {
    name: 'Elders only',
    who: 'The elder board, and only when named on the case',
    sees: 'Restoration cases in full, including the written plan and every logged conversation.',
    cannot: 'Nothing is above this tier. This is where it stops.',
  },
}

export function tierName(tier: ConfidentialityTier): string {
  return TIER_DESCRIPTIONS[tier].name
}

/**
 * The confidentiality practices, ported verbatim from the prototype's
 * `CRULES`. These are displayed to leaders; the software's job is to make
 * them unskippable rather than merely documented.
 */
export const CONFIDENTIALITY_RULES: ReadonlyArray<{
  rule: string
  why: string
}> = [
  {
    rule: 'Never one elder alone',
    why: 'Every restoration conversation has two elders present. It protects the person as much as the church.',
  },
  {
    rule: 'Never by text',
    why: 'Hard conversations happen face to face. What gets written down is the record, not the conversation.',
  },
  {
    rule: 'The person knows what is written',
    why: 'No secret file. They see the plan and can ask what is in the log.',
  },
  {
    rule: 'Notes are kept, not deleted',
    why: 'A deleted record protects the institution, not the person. Closed cases are sealed, not erased.',
  },
  {
    rule: 'Access is by case, not by title',
    why: 'Being an elder does not open every case. You see the ones you carry.',
  },
  {
    rule: 'Tier is set when the note is written',
    why: 'Not decided later, under pressure, by whoever is asking.',
  },
]

export const CONFIDENTIALITY_RULES_NOTE =
  'None of this is a software feature. It is a practice the software refuses to let you skip.'
