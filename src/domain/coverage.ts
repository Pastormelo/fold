/**
 * Coverage — how long it has been since someone was actually spoken to.
 *
 * This is the arithmetic behind the product's premise. "A person should not be
 * able to quietly disappear" is only enforceable if the app can say, for each
 * member, when a leader last had contact — and can say it from logged care
 * rather than from an impression formed in a meeting.
 *
 * Two decisions worth stating.
 *
 * **The window is a constant here, not a setting.** Sixty days is the figure the
 * design uses throughout, and it is the same number in the report, the warning
 * band, and the overdue count. A per-church setting would be defensible; three
 * different numbers in three places, which is what happens when each screen picks
 * its own, would not.
 *
 * **A person with no contact at all is overdue, not unknown.** The alternative —
 * excluding them because there is no date to compare — is precisely how somebody
 * disappears from a report about people disappearing.
 */

/** The window the design uses everywhere. Not per-church, so it cannot disagree. */
export const CONTACT_WINDOW_DAYS = 60

/**
 * The band before overdue. A person at fifty days is not yet a failure and is
 * worth naming, because the point is to reach them before the number turns.
 */
export const WARNING_WINDOW_DAYS = 45

const DAY = 24 * 60 * 60 * 1000

export type ContactStanding = 'recent' | 'warning' | 'overdue'

export type PersonContact = {
  personId: string
  /** `null` when nobody has ever logged care for this person. */
  lastContactAt: Date | null
}

export type ContactAssessment = {
  personId: string
  standing: ContactStanding
  /** `null` only when there has never been contact. */
  daysSinceContact: number | null
  /** Said in words, including the never-contacted case. */
  label: string
}

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY)
}

export function assessContact(
  contact: PersonContact,
  asOf: Date
): ContactAssessment {
  if (contact.lastContactAt === null) {
    return {
      personId: contact.personId,
      // Never contacted is the worst case, not a missing value.
      standing: 'overdue',
      daysSinceContact: null,
      label: 'Never contacted',
    }
  }

  const days = daysBetween(contact.lastContactAt, asOf)
  const standing: ContactStanding =
    days >= CONTACT_WINDOW_DAYS
      ? 'overdue'
      : days >= WARNING_WINDOW_DAYS
        ? 'warning'
        : 'recent'

  return {
    personId: contact.personId,
    standing,
    daysSinceContact: days,
    label:
      days === 0
        ? 'Contacted today'
        : `${days} ${days === 1 ? 'day' : 'days'} since contact`,
  }
}

/* ──────────────────────────── Rolled up ──────────────────────────── */

export type CoverageSummary = {
  total: number
  recent: number
  warning: number
  overdue: number
  /** Whole percent of people contacted inside the window. Zero people is 0. */
  percentInsideWindow: number
  /** A sentence, pluralised from the counts (§8.1). */
  summary: string
}

/**
 * Roll up a set of people.
 *
 * `percentInsideWindow` counts `recent` and `warning` together, because both are
 * inside sixty days. Counting only `recent` would make a healthy fold look
 * failing, and the warning band exists to prompt action rather than to score
 * against anybody.
 */
export function summariseCoverage(
  contacts: readonly PersonContact[],
  asOf: Date
): CoverageSummary {
  const assessments = contacts.map((contact) => assessContact(contact, asOf))

  const recent = assessments.filter((a) => a.standing === 'recent').length
  const warning = assessments.filter((a) => a.standing === 'warning').length
  const overdue = assessments.filter((a) => a.standing === 'overdue').length
  const total = assessments.length

  const percentInsideWindow =
    total === 0 ? 0 : Math.round(((recent + warning) / total) * 100)

  return {
    total,
    recent,
    warning,
    overdue,
    percentInsideWindow,
    summary: summarise({ total, warning, overdue, percentInsideWindow }),
  }
}

function summarise({
  total,
  warning,
  overdue,
  percentInsideWindow,
}: {
  total: number
  warning: number
  overdue: number
  percentInsideWindow: number
}): string {
  if (total === 0) {
    // Not "100% coverage". A church with nobody in it has not achieved
    // anything, and reporting a perfect number here would be the clearest
    // possible case of a claim outrunning its data (§8.2).
    return 'Nobody is in the directory yet, so there is nothing to cover.'
  }
  if (overdue === 0 && warning === 0) {
    return `Everyone has been contacted inside ${CONTACT_WINDOW_DAYS} days.`
  }

  const parts: string[] = [
    `${percentInsideWindow}% contacted inside ${CONTACT_WINDOW_DAYS} days`,
  ]
  if (overdue > 0) {
    parts.push(
      `${overdue} ${overdue === 1 ? 'person is' : 'people are'} past it`
    )
  }
  if (warning > 0) {
    parts.push(
      `${warning} ${warning === 1 ? 'is' : 'are'} inside the warning band`
    )
  }
  return `${parts.join(', ')}.`
}

/* ─────────────────────── Which fold needs the elders ─────────────────────── */

export type FoldCoverage = {
  foldId: string
  foldName: string
  elderName: string
  coverage: CoverageSummary
}

export type FoldConcern = {
  foldId: string
  foldName: string
  elderName: string
  /** What is actually wrong, in the church's terms. Never a score. */
  reason: string
}

/**
 * The number of people past which one shepherd is carrying too many.
 *
 * The design's own commentary calls thirty-one households "past what one shepherd
 * should carry long-term". Twenty-five is the line here, and it is a rule of
 * thumb rather than a finding — which is why `concerningFolds` says so in the
 * sentence rather than presenting it as a conclusion drawn from this church.
 */
export const ONE_SHEPHERD_CEILING = 25

/**
 * Folds worth raising at a meeting, with the reason.
 *
 * Deliberately not a ranking and not a health score. A fold appears here because
 * something specific is true of it — people are past the window, or one person is
 * carrying more than one person can. A number out of ten would be easier to build
 * and would tell an elder nothing they could act on.
 */
export function concerningFolds(folds: readonly FoldCoverage[]): FoldConcern[] {
  const concerns: FoldConcern[] = []

  for (const fold of folds) {
    const { overdue, total } = fold.coverage

    if (overdue > 0) {
      const share = total === 0 ? 0 : Math.round((overdue / total) * 100)
      concerns.push({
        foldId: fold.foldId,
        foldName: fold.foldName,
        elderName: fold.elderName,
        reason:
          `${overdue} of ${total} past ${CONTACT_WINDOW_DAYS} days (${share}%). ` +
          `Logged by ${fold.elderName}’s fold, not inferred.`,
      })
      continue
    }

    if (total > ONE_SHEPHERD_CEILING) {
      concerns.push({
        foldId: fold.foldId,
        foldName: fold.foldName,
        elderName: fold.elderName,
        reason:
          `${total} people under one shepherd. Nobody is overdue yet, so this is a ` +
          `rule of thumb about capacity rather than something wrong today.`,
      })
    }
  }

  // Worst first, by how many people are actually past the window.
  return concerns.sort((a, b) => {
    const overdueOf = (concern: FoldConcern) =>
      folds.find((fold) => fold.foldId === concern.foldId)?.coverage.overdue ??
      0
    return overdueOf(b) - overdueOf(a)
  })
}

/* ─────────────────────── Naming a fold's standing ─────────────────────── */

export type FoldStanding = 'covered' | 'thin' | 'needs_help'

export const STANDING_LABELS: Record<FoldStanding, string> = {
  covered: 'Covered',
  thin: 'Thin',
  needs_help: 'Needs help',
}

/**
 * The word the design puts under a fold's coverage bar.
 *
 * Three words rather than a percentage, because a shepherd reads "Needs help" and
 * knows to speak up where they read "71%" and wonder whether that is bad. The
 * thresholds are here and tested rather than inline in a component, so the bar and
 * the word cannot come from different arithmetic.
 *
 * `needs_help` is deliberately about the *share* of people past the window rather
 * than the count. Seven overdue out of nineteen is a fold in trouble; seven out of
 * four hundred is a Tuesday.
 */
export function foldStanding(coverage: CoverageSummary): FoldStanding {
  if (coverage.total === 0) return 'covered'

  const overdueShare = coverage.overdue / coverage.total
  if (overdueShare >= 0.25) return 'needs_help'
  if (coverage.overdue > 0 || coverage.warning / coverage.total >= 0.25) {
    return 'thin'
  }
  return 'covered'
}

/**
 * The three-segment bar: reached recently, in the warning band, past the window.
 *
 * Returned as percentages that sum to 100 so a component can lay them out without
 * doing its own division — and so the bar always fills, rather than leaving a gap
 * that reads as missing data.
 */
export function coverageSegments(coverage: CoverageSummary): {
  recent: number
  warning: number
  overdue: number
} {
  if (coverage.total === 0) return { recent: 0, warning: 0, overdue: 0 }

  const pct = (n: number) => (n / coverage.total) * 100
  const recent = pct(coverage.recent)
  const warning = pct(coverage.warning)
  // The remainder rather than its own division, so rounding cannot leave a sliver
  // of unexplained bar at the end.
  return { recent, warning, overdue: 100 - recent - warning }
}
