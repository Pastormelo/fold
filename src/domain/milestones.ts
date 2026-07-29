/**
 * Milestones — the dates in a person's life a church should not miss.
 *
 * §2 lists these as a first-class entity rather than a calendar feature, and the
 * reason shows up in the types below: a birthday and the anniversary of a death
 * are both annual, both worth a phone call, and require completely different
 * phone calls. A single "event" with a label would lose that.
 *
 * Two rules the rest of the app depends on.
 *
 * **Recurring milestones are stored once and projected forward.** A birthday is
 * one row with a date, not a row per year. The upcoming list is computed from
 * that row against today, so it is right in 2031 without anybody backfilling.
 *
 * **A loss recurs, and the wording changes.** "Three years since Eileen passed"
 * is not "anniversary". The design's own report uses that phrasing, and it is the
 * whole reason `describeOccurrence` exists rather than a date format string.
 */

export const MILESTONE_KINDS = [
  'birthday',
  'wedding_anniversary',
  'baptism',
  'membership',
  'loss',
  'new_baby',
  'sobriety',
  'moved_away',
] as const

export type MilestoneKind = (typeof MILESTONE_KINDS)[number]

export function isMilestoneKind(value: unknown): value is MilestoneKind {
  return (
    typeof value === 'string' &&
    (MILESTONE_KINDS as readonly string[]).includes(value)
  )
}

export const MILESTONE_LABELS: Record<MilestoneKind, string> = {
  birthday: 'Birthday',
  wedding_anniversary: 'Wedding anniversary',
  baptism: 'Baptism',
  membership: 'Membership',
  loss: 'Loss of a loved one',
  new_baby: 'New baby',
  sobriety: 'Sobriety date',
  moved_away: 'Moved away',
}

/**
 * Which kinds come round every year.
 *
 * A property of the kind, not a column somebody sets per milestone — a baptism
 * happened once and is worth marking annually; moving away happened once and is
 * not an anniversary anybody wants marked.
 */
const RECURS_ANNUALLY: Record<MilestoneKind, boolean> = {
  birthday: true,
  wedding_anniversary: true,
  baptism: true,
  membership: true,
  loss: true,
  new_baby: false,
  sobriety: true,
  moved_away: false,
}

export function recursAnnually(kind: MilestoneKind): boolean {
  return RECURS_ANNUALLY[kind]
}

/**
 * Kinds where the right tone is condolence rather than congratulation.
 *
 * Named here so no screen has to guess from the label. Getting this wrong is the
 * kind of mistake a church does not recover from quickly.
 */
const SOMBRE: readonly MilestoneKind[] = ['loss', 'moved_away']

export function isSombre(kind: MilestoneKind): boolean {
  return SOMBRE.includes(kind)
}

/* ──────────────────────── Projecting a date forward ──────────────────────── */

const DAY = 24 * 60 * 60 * 1000

/** A stored milestone. `occurredOn` is the original date, never this year's. */
export type MilestoneRecord = {
  id: string
  personId: string
  personName: string
  kind: MilestoneKind
  occurredOn: Date
  note: string
}

export type MilestoneOccurrence = {
  id: string
  personId: string
  personName: string
  kind: MilestoneKind
  label: string
  /** When it falls in the window being looked at. */
  on: Date
  /** How many years, when that is a meaningful thing to say. */
  yearsSince: number | null
  /** "Turns 71", "14 years married", "One year since Hector passed". */
  description: string
  sombre: boolean
  daysAway: number
}

function atUtcMidnight(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  )
}

/**
 * Turn a stored `YYYY-MM-DD` into a Date, at UTC midnight.
 *
 * Lives here rather than in the data layer because getting it wrong is a
 * one-day-off bug that ships silently. `new Date('1955-09-04')` is already UTC,
 * but `new Date(1955, 8, 4)` is local — and so is what the raw Postgres driver
 * hands back for a `date` column, which parses 1955-09-04 as the evening of
 * September 3rd anywhere west of Greenwich. Half the church would get their
 * birthday reminder a day early, and nobody would think to look here.
 *
 * Drizzle's `date()` returns the bare string, which is what this takes.
 */
export function parseStoredDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    throw new Error(
      `Expected a YYYY-MM-DD date and got "${value}". A date column that starts returning something else needs handling here, not a guess.`
    )
  }
  return new Date(`${value}T00:00:00Z`)
}

/**
 * The next time this milestone falls, on or after `from`.
 *
 * `null` for a one-off that has already passed — it is history rather than
 * something coming up, and putting it in an upcoming list would be wrong.
 *
 * February 29th projects to March 1st in a common year rather than vanishing.
 * `Date.UTC` rolls it over on its own; the test pins the behaviour so a future
 * refactor cannot silently drop somebody's birthday three years in four.
 */
export function nextOccurrence(
  milestone: { kind: MilestoneKind; occurredOn: Date },
  from: Date
): Date | null {
  const start = atUtcMidnight(from)
  const original = atUtcMidnight(milestone.occurredOn)

  if (!recursAnnually(milestone.kind)) {
    return original.getTime() >= start.getTime() ? original : null
  }

  const candidate = new Date(
    Date.UTC(
      start.getUTCFullYear(),
      original.getUTCMonth(),
      original.getUTCDate()
    )
  )
  if (candidate.getTime() >= start.getTime()) return candidate

  return new Date(
    Date.UTC(
      start.getUTCFullYear() + 1,
      original.getUTCMonth(),
      original.getUTCDate()
    )
  )
}

/**
 * What to say about it, in the words a person would use.
 *
 * The design's report says "Turns 71" and "One year since Hector passed", not
 * "Birthday — 1955-04-02". The note carries the name of whoever died, so a loss
 * reads with it when there is one.
 */
export function describeOccurrence(
  milestone: { kind: MilestoneKind; occurredOn: Date; note: string },
  on: Date
): { description: string; yearsSince: number | null } {
  const years =
    on.getUTCFullYear() - atUtcMidnight(milestone.occurredOn).getUTCFullYear()

  if (!recursAnnually(milestone.kind) || years <= 0) {
    return {
      description: milestone.note || MILESTONE_LABELS[milestone.kind],
      yearsSince: null,
    }
  }

  const counted = years === 1 ? 'One year' : `${years} years`

  switch (milestone.kind) {
    case 'birthday':
      return { description: `Turns ${years}`, yearsSince: years }
    case 'wedding_anniversary':
      return { description: `${counted} married`, yearsSince: years }
    case 'loss':
      return {
        description: milestone.note
          ? `${counted} since ${milestone.note}`
          : `${counted} since their loss`,
        yearsSince: years,
      }
    case 'baptism':
      return {
        description: `${counted} since their baptism`,
        yearsSince: years,
      }
    case 'membership':
      return { description: `${counted} a member`, yearsSince: years }
    case 'sobriety':
      return { description: `${counted} sober`, yearsSince: years }
    default:
      return {
        description: milestone.note || MILESTONE_LABELS[milestone.kind],
        yearsSince: years,
      }
  }
}

/* ────────────────────────────── Grouping ────────────────────────────── */

export const UPCOMING_WINDOW_DAYS = 30

export type MilestoneGroup = {
  key: 'today' | 'this_week' | 'coming_up'
  label: string
  items: readonly MilestoneOccurrence[]
  count: number
  countLabel: string
}

/**
 * Today, this week, and coming up — the design's three groups.
 *
 * "This week" means the next seven days rather than the calendar week, because the
 * question a leader is asking on a Thursday is "what is coming", not "what is left
 * of this Sunday-to-Saturday".
 */
export function upcomingMilestones(
  milestones: readonly MilestoneRecord[],
  asOf: Date,
  windowDays: number = UPCOMING_WINDOW_DAYS
): MilestoneGroup[] {
  const start = atUtcMidnight(asOf)

  const occurrences: MilestoneOccurrence[] = []

  for (const milestone of milestones) {
    const on = nextOccurrence(milestone, start)
    if (on === null) continue

    const daysAway = Math.round((on.getTime() - start.getTime()) / DAY)
    if (daysAway > windowDays) continue

    const { description, yearsSince } = describeOccurrence(milestone, on)

    occurrences.push({
      id: milestone.id,
      personId: milestone.personId,
      personName: milestone.personName,
      kind: milestone.kind,
      label: MILESTONE_LABELS[milestone.kind],
      on,
      yearsSince,
      description,
      sombre: isSombre(milestone.kind),
      daysAway,
    })
  }

  occurrences.sort((a, b) => a.daysAway - b.daysAway)

  const groups: {
    key: MilestoneGroup['key']
    label: string
    take: (d: number) => boolean
  }[] = [
    { key: 'today', label: 'Today', take: (d) => d === 0 },
    { key: 'this_week', label: 'This week', take: (d) => d >= 1 && d <= 7 },
    { key: 'coming_up', label: 'Coming up', take: (d) => d > 7 },
  ]

  return groups.map(({ key, label, take }) => {
    const items = occurrences.filter((occurrence) => take(occurrence.daysAway))
    return {
      key,
      label,
      items,
      count: items.length,
      // Pluralised from the count rather than written twice (§8.1).
      countLabel: `${items.length} ${items.length === 1 ? 'milestone' : 'milestones'}`,
    }
  })
}
