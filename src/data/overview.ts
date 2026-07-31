import 'server-only'

import { and, eq, gte, max, sql } from 'drizzle-orm'

import {
  CONTACT_WINDOW_DAYS,
  STANDING_LABELS,
  type CoverageSummary,
  type FoldStanding,
  assessContact,
  coverageSegments,
  foldStanding,
  summariseCoverage,
} from '@/domain/coverage'
import { db, schema } from '@/db/client'

import { getViewer } from './viewer'

/**
 * The Overview — "Care across the church", as designed.
 *
 * Four figures, coverage fold by fold, and the people who have gone longest
 * without anybody speaking to them. That last panel is the product's whole
 * premise made into a list, which is why the design gives it its own dark card
 * rather than a row in a table.
 *
 * Everything is counted at every tier. Contact happening is not confidential;
 * what was said is. Filtering coverage by the reader's clearance would tell a
 * staff member that an elder-visited person had been abandoned, which is worse
 * than the leak it would be preventing.
 */

export type StatCard = {
  label: string
  value: string
  note: string
  /** Drawn in the alert colour when the number itself is the bad news. */
  alarming: boolean
}

export type FoldRow = {
  foldId: string
  foldName: string
  peopleLabel: string
  elderName: string
  elderInitials: string
  standing: FoldStanding
  standingLabel: string
  segments: { recent: number; warning: number; overdue: number }
  overdue: number
}

export type QuietPerson = {
  personId: string
  fullName: string
  /** "Ridgeway · Marcus Reid", or the honest version when there is no fold. */
  placeLabel: string
  daysLabel: string
  neverContacted: boolean
}

export type Overview = {
  today: string
  stats: readonly StatCard[]
  coverage: CoverageSummary
  folds: readonly FoldRow[]
  quiet: readonly QuietPerson[]
  quietNote: string
  windowLabel: string
}

const TODAY = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
})

function initialsOf(first: string, last: string): string {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase()
}

/** How many of the longest-quiet people the dark panel lists. */
const QUIET_SHOWN = 6

export async function getOverview(asOf: Date = new Date()): Promise<Overview> {
  const viewer = await getViewer()

  const [members, foldRows, lastContactRows] = await Promise.all([
    db
      .select({
        id: schema.people.id,
        firstName: schema.people.firstName,
        lastName: schema.people.lastName,
        foldId: schema.people.foldId,
      })
      .from(schema.people)
      .where(
        and(
          eq(schema.people.churchId, viewer.churchId),
          eq(schema.people.isMember, true)
        )
      ),
    db
      .select({
        id: schema.folds.id,
        name: schema.folds.name,
        elderFirst: schema.people.firstName,
        elderLast: schema.people.lastName,
      })
      .from(schema.folds)
      .innerJoin(schema.people, eq(schema.people.id, schema.folds.elderId))
      .where(eq(schema.folds.churchId, viewer.churchId))
      .orderBy(schema.folds.name),
    db
      .select({
        personId: schema.careNotes.personId,
        lastAt: max(schema.careNotes.occurredAt),
      })
      .from(schema.careNotes)
      .where(eq(schema.careNotes.churchId, viewer.churchId))
      .groupBy(schema.careNotes.personId),
  ])

  const lastContact = new Map(
    lastContactRows.map((row) => [row.personId, row.lastAt])
  )

  const contactOf = (personId: string) => ({
    personId,
    lastContactAt: lastContact.get(personId) ?? null,
  })

  const coverage = summariseCoverage(
    members.map((person) => contactOf(person.id)),
    asOf
  )

  const thirtyDaysAgo = new Date(asOf.getTime() - 30 * 24 * 60 * 60 * 1000)
  const [logged, shepherds] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.careNotes)
      .where(
        and(
          eq(schema.careNotes.churchId, viewer.churchId),
          gte(schema.careNotes.occurredAt, thirtyDaysAgo)
        )
      ),
    db
      .select({
        n: sql<number>`count(distinct ${schema.leaderRoles.personId})::int`,
      })
      .from(schema.leaderRoles)
      .where(eq(schema.leaderRoles.churchId, viewer.churchId)),
  ])

  const loggedCount = logged[0]?.n ?? 0
  const shepherdCount = shepherds[0]?.n ?? 0

  /* ── Fold by fold ── */
  const folds = foldRows.map((fold): FoldRow => {
    const inFold = members.filter((person) => person.foldId === fold.id)
    const summary = summariseCoverage(
      inFold.map((person) => contactOf(person.id)),
      asOf
    )
    const standing = foldStanding(summary)
    return {
      foldId: fold.id,
      foldName: fold.name,
      peopleLabel: `${summary.total} ${summary.total === 1 ? 'person' : 'people'}`,
      elderName: `${fold.elderFirst} ${fold.elderLast}`,
      elderInitials: initialsOf(fold.elderFirst, fold.elderLast),
      standing,
      standingLabel: STANDING_LABELS[standing],
      segments: coverageSegments(summary),
      overdue: summary.overdue,
    }
  })

  /* ── Longest without contact ── */
  const elderOfFold = new Map(
    foldRows.map((fold) => [
      fold.id,
      { fold: fold.name, elder: `${fold.elderFirst} ${fold.elderLast}` },
    ])
  )

  const quiet = members
    .map((person) => ({
      person,
      assessment: assessContact(contactOf(person.id), asOf),
    }))
    // Never-contacted first, then longest gap. `null` days sorts above any
    // number, because "we have never spoken to this person" outranks 91 days.
    .sort((a, b) => {
      const aDays = a.assessment.daysSinceContact
      const bDays = b.assessment.daysSinceContact
      if (aDays === null && bDays === null) return 0
      if (aDays === null) return -1
      if (bDays === null) return 1
      return bDays - aDays
    })
    .filter(({ assessment }) => assessment.standing !== 'recent')
    .slice(0, QUIET_SHOWN)
    .map(({ person, assessment }): QuietPerson => {
      const place = person.foldId ? elderOfFold.get(person.foldId) : undefined
      return {
        personId: person.id,
        fullName: `${person.firstName} ${person.lastName}`,
        placeLabel: place
          ? `${place.fold} · ${place.elder}`
          : 'No fold · nobody named',
        daysLabel:
          assessment.daysSinceContact === null
            ? 'never'
            : `${assessment.daysSinceContact}d`,
        neverContacted: assessment.daysSinceContact === null,
      }
    })

  /* ── The four figures ── */
  const foldCount = folds.length
  const overdueInWorstFold = folds.reduce(
    (worst, fold) => Math.max(worst, fold.overdue),
    0
  )

  return {
    today: TODAY.format(asOf),
    coverage,
    windowLabel: `Quiet window · ${CONTACT_WINDOW_DAYS} days`,
    stats: [
      {
        label: 'People shepherded',
        value: String(coverage.total),
        note:
          foldCount === 0
            ? 'No folds yet'
            : `across ${foldCount} ${foldCount === 1 ? 'fold' : 'folds'}`,
        alarming: false,
      },
      {
        label: 'Covered',
        value: coverage.total === 0 ? '—' : `${coverage.percentInsideWindow}%`,
        // An em dash rather than 0%, because 0% of nobody is not a failure and
        // the number would read as one.
        note:
          coverage.total === 0
            ? 'Nobody in the directory yet'
            : `contacted inside ${CONTACT_WINDOW_DAYS} days`,
        alarming: false,
      },
      {
        label: 'Overdue',
        value: String(coverage.overdue),
        note:
          coverage.overdue === 0
            ? 'Nobody has slipped past the window'
            : overdueInWorstFold === coverage.overdue && foldCount > 1
              ? `all ${coverage.overdue} in one fold`
              : `past ${CONTACT_WINDOW_DAYS} days`,
        alarming: coverage.overdue > 0,
      },
      {
        label: 'Care logged, 30d',
        value: String(loggedCount),
        note:
          shepherdCount === 0
            ? 'Nobody holds a role yet'
            : `by ${shepherdCount} ${shepherdCount === 1 ? 'leader' : 'leaders'}`,
        alarming: false,
      },
    ],
    folds,
    quiet,
    quietNote:
      coverage.total === 0
        ? 'Nobody is in the directory yet.'
        : quiet.length === 0
          ? `Everyone has been spoken to inside ${CONTACT_WINDOW_DAYS} days. This list being empty is the point of the product.`
          : '',
  }
}

/** Kept for the header strip, which shows the church rather than the viewer. */
export async function getChurchName(): Promise<string> {
  const viewer = await getViewer()
  const [church] = await db
    .select({ name: schema.churches.name })
    .from(schema.churches)
    .where(eq(schema.churches.id, viewer.churchId))
    .limit(1)
  return church?.name ?? 'This church'
}
