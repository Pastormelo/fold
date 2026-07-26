/**
 * The publish gate and approval attribution — HANDOFF.md §4.
 *
 * Two rules carry the weight here.
 *
 * **Every blocker is derived from live data, never a flag.** The prototype kept
 * a health-check gate independent of the findings it described, so the gate and
 * the findings could disagree. Nothing in this module accepts a boolean saying
 * "the health check passed"; it takes the findings and works it out.
 *
 * **"Objection marked addressed" is not "approved".** They are separate fields
 * on a review, and `approvedBy` returns only real approvals. In an
 * elder-governance context the permanent version record is exactly what someone
 * will rely on years later, and it must not claim a person approved a pathway
 * when someone else merely resolved their objection.
 */

import type { MigrationChoice } from './pathway'
import type { PathwayDiff } from './pathway-diff'

/* ───────────────────────────── Health findings ───────────────────────────── */

export type HealthFinding = {
  id: string
  category: string
  severity: 'low' | 'medium' | 'high'
  evidence: string
  why: string
  options: readonly string[]
  /** Whether this finding stands in the way of publishing. */
  blocksPublishing: boolean
  /**
   * A blocking finding can be published past, but only deliberately and on the
   * record — §4: "or they are explicitly acknowledged with a reason". Both
   * fields or neither; a dismissal without a reason is not a dismissal.
   */
  dismissedById: string | null
  dismissalReason: string | null
}

export function isAcknowledged(finding: HealthFinding): boolean {
  return (
    finding.dismissedById !== null &&
    finding.dismissalReason !== null &&
    finding.dismissalReason.trim() !== ''
  )
}

/** Blocking findings nobody has accounted for. Computed, never stored. */
export function unresolvedBlockingFindings(
  findings: readonly HealthFinding[]
): HealthFinding[] {
  return findings.filter(
    (finding) => finding.blocksPublishing && !isAcknowledged(finding)
  )
}

/* ──────────────────────── Reviews and attribution ──────────────────────── */

/**
 * One reviewer's position on a version.
 *
 * `approval` and `objection` are independent on purpose. A reviewer can have
 * raised an objection that someone else marked addressed, and still never have
 * approved anything — that is the case §4 singles out.
 */
export type Review = {
  reviewerId: string
  reviewerName: string
  /** Present only when this reviewer actually approved. */
  approval: { at: Date } | null
  objection: {
    raisedAt: Date
    note: string
    /** Who marked it addressed, and when. Often not the reviewer. */
    addressedAt: Date | null
    addressedById: string | null
  } | null
}

/** Reviewers holding an objection nobody has addressed. */
export function unaddressedObjections(reviews: readonly Review[]): Review[] {
  return reviews.filter(
    (review) =>
      review.objection !== null && review.objection.addressedAt === null
  )
}

/**
 * Who approved this version — and nobody else.
 *
 * This is what gets written to the immutable version record's `approved_by[]`.
 * A reviewer whose objection was resolved by someone else does not appear here,
 * however convenient that would be for clearing the gate.
 */
export function approvedBy(
  reviews: readonly Review[]
): { reviewerId: string; reviewerName: string; at: Date }[] {
  return reviews
    .filter(
      (review): review is Review & { approval: { at: Date } } =>
        review.approval !== null
    )
    .map((review) => ({
      reviewerId: review.reviewerId,
      reviewerName: review.reviewerName,
      at: review.approval.at,
    }))
}

/**
 * Objections resolved by someone other than the reviewer who raised them.
 *
 * Tracked separately and kept on the record, because "your objection was
 * addressed" is a claim the reviewer may disagree with, and the version history
 * should let them say so later.
 */
export function objectionsAddressedByOthers(reviews: readonly Review[]): {
  reviewerId: string
  reviewerName: string
  addressedById: string
  alsoApproved: boolean
}[] {
  return reviews
    .filter(
      (review) =>
        review.objection?.addressedById != null &&
        review.objection.addressedById !== review.reviewerId
    )
    .map((review) => ({
      reviewerId: review.reviewerId,
      reviewerName: review.reviewerName,
      addressedById: review.objection!.addressedById!,
      // Stated explicitly so a reader never has to infer it from absence.
      alsoApproved: review.approval !== null,
    }))
}

/* ───────────────────────────── The publish gate ───────────────────────────── */

export type PublishBlocker = {
  code:
    | 'not_approved'
    | 'blocking_findings'
    | 'unaddressed_objection'
    | 'no_migration_choice'
  reason: string
}

export type PublishReadiness = {
  ready: boolean
  blockers: readonly PublishBlocker[]
  /** Shown before publishing (§4): the diff against the active version. */
  diff: PathwayDiff
  changedStageCount: number
  /** How many people are mid-pathway and would be affected. */
  peopleInFlight: number
  /** Everyone who genuinely approved, for the version record. */
  approvals: ReturnType<typeof approvedBy>
  /** A sentence for the publish screen, counted from the blockers. */
  summary: string
}

/**
 * Whether this version can be published, and if not, precisely why.
 *
 * Takes the underlying data — findings, reviews, the chosen migration, the diff —
 * and derives all three of §4's blockers. Note the absence of any parameter
 * along the lines of `healthCheckPassed`.
 */
export function publishReadiness({
  findings,
  reviews,
  migrationChoice,
  diff,
  peopleInFlight,
}: {
  findings: readonly HealthFinding[]
  reviews: readonly Review[]
  /** `null` means nobody has chosen yet, which blocks. Never defaulted. */
  migrationChoice: MigrationChoice | null
  diff: PathwayDiff
  peopleInFlight: number
}): PublishReadiness {
  const blockers: PublishBlocker[] = []

  // A version goes live only if somebody actually approved it. Checked against
  // the review records rather than against the state name, because `approved`
  // and `scheduled` are labels a transition set, and because §4's attribution
  // rule means an approval is a narrower thing than it looks: a reviewer whose
  // objection someone else resolved is not an approver, so a version can sit in
  // `approved` with nobody having approved it.
  const approvals = approvedBy(reviews)
  if (approvals.length === 0) {
    blockers.push({
      code: 'not_approved',
      reason: 'nobody has approved this version',
    })
  }

  const blocking = unresolvedBlockingFindings(findings)
  if (blocking.length > 0) {
    blockers.push({
      code: 'blocking_findings',
      reason:
        blocking.length === 1
          ? '1 health finding blocks publishing and has not been acknowledged'
          : `${blocking.length} health findings block publishing and have not been acknowledged`,
    })
  }

  const holding = unaddressedObjections(reviews)
  if (holding.length > 0) {
    blockers.push({
      code: 'unaddressed_objection',
      reason:
        holding.length === 1
          ? `${holding[0]!.reviewerName} has requested changes that have not been addressed`
          : `${holding.length} reviewers have requested changes that have not been addressed`,
    })
  }

  if (migrationChoice === null) {
    // §4: "Never migrate existing participants automatically." Absence of a
    // choice is a blocker, not a cue to pick the least disruptive option.
    blockers.push({
      code: 'no_migration_choice',
      reason: 'no decision has been made about people already in the pathway',
    })
  }

  return {
    ready: blockers.length === 0,
    blockers,
    diff,
    // Read off the diff rather than counted again, so the two cannot disagree.
    changedStageCount: diff.changedStageCount,
    peopleInFlight,
    approvals,
    summary: summarise(blockers, diff, peopleInFlight),
  }
}

function summarise(
  blockers: readonly PublishBlocker[],
  diff: PathwayDiff,
  peopleInFlight: number
): string {
  if (blockers.length > 0) {
    return blockers.length === 1
      ? 'One thing is unresolved before this can be published.'
      : `${blockers.length} things are unresolved before this can be published.`
  }
  if (!diff.hasChanges) {
    // §8.5: an action that reports success must have done something. Publishing
    // an identical version is a no-op worth saying out loud.
    return 'Ready to publish, but nothing differs from the active pathway.'
  }
  const people =
    peopleInFlight === 1
      ? '1 person is in flight'
      : `${peopleInFlight} people are in flight`
  return `Ready to publish. ${diff.summary} ${people}.`
}

/**
 * Whether publishing would change anything at all.
 *
 * Separate from `ready` because they answer different questions, and §8.5 needs
 * both: a version can clear every gate and still be identical to what is live,
 * in which case publishing should say so rather than reporting a successful
 * publication that did nothing.
 */
export function publishWouldBeNoOp(readiness: PublishReadiness): boolean {
  return readiness.ready && !readiness.diff.hasChanges
}
