import 'server-only'

import { and, eq, gte, max, sql } from 'drizzle-orm'

import { canReadTier } from '@/domain/access'
import {
  CONTACT_WINDOW_DAYS,
  type FoldCoverage,
  type FoldConcern,
  type CoverageSummary,
  assessContact,
  concerningFolds,
  summariseCoverage,
} from '@/domain/coverage'
import { type PermissionCheck, permissionCheck } from '@/domain/roles'
import { db, schema } from '@/db/client'

import { getJourneys } from './records'
import { getViewer } from './viewer'

/**
 * Reports — the numbers an elders' meeting needs, and nothing it does not.
 *
 * The handoff's Elders Report is mostly narrative: a shepherd writes what is
 * happening in their fold, and the figures sit alongside it. Fold produces the
 * figures. It does not produce the narrative, and this file does not pretend
 * otherwise — there is no generated paragraph anywhere in it. What it can say, it
 * says from logged care rather than from an impression: "everything below was
 * logged by a shepherd at the time it happened, not remembered in this room" is
 * the report's own framing, and it only holds if nothing here is inferred.
 *
 * The confidential appendix is counted, never quoted. An elders-only matter shows
 * up as "two matters are held at elders-only visibility" to a reader who cannot
 * reach that tier, which is the fact they need in order to know a conversation is
 * waiting for them.
 */

export type StatCard = {
  label: string
  value: string
  note: string
}

export type ReportPage = {
  /** Whether the viewer may see reporting at all, with the reason when not. */
  gate: PermissionCheck
  asOf: string
  churchName: string
  coverage: CoverageSummary
  stats: readonly StatCard[]
  folds: readonly {
    foldId: string
    foldName: string
    elderName: string
    coverage: CoverageSummary
  }[]
  concerns: readonly FoldConcern[]
  /** Members under no elder at all. Not a fold problem — a gap between folds. */
  unfolded: readonly { id: string; fullName: string; label: string }[]
  /** Journeys where somebody is waiting. Only the ones this reader may see. */
  overdueJourneys: readonly {
    personName: string
    templateName: string
    stepTitle: string
    dueLabel: string
  }[]
  appendix: {
    /** Counted, never quoted. */
    count: number
    note: string
    readable: boolean
  }
}

const DATE = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
})

export async function getReportPage(): Promise<ReportPage> {
  const viewer = await getViewer()
  const gate = permissionCheck(viewer, 'reporting.view')
  const asOf = new Date()

  const [church] = await db
    .select({ name: schema.churches.name })
    .from(schema.churches)
    .where(eq(schema.churches.id, viewer.churchId))
    .limit(1)

  const empty: ReportPage = {
    gate,
    asOf: DATE.format(asOf),
    churchName: church?.name ?? 'This church',
    coverage: summariseCoverage([], asOf),
    stats: [],
    folds: [],
    concerns: [],
    unfolded: [],
    overdueJourneys: [],
    appendix: { count: 0, note: '', readable: false },
  }

  // Returned before any query that would read people. A refusal that has already
  // loaded the records is a refusal in the interface only.
  if (!gate.allowed) return empty

  /* ── Last contact per member, from logged notes ── */
  const members = await db
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
    )

  const lastContactRows = await db
    .select({
      personId: schema.careNotes.personId,
      lastAt: max(schema.careNotes.occurredAt),
    })
    .from(schema.careNotes)
    .where(eq(schema.careNotes.churchId, viewer.churchId))
    .groupBy(schema.careNotes.personId)

  // Every tier counts towards coverage, including tiers this reader cannot open.
  // Contact happening is not confidential; what was said is. Filtering by tier
  // here would tell a staff member that an elder-visited person had been
  // abandoned.
  const lastContact = new Map(
    lastContactRows.map((row) => [row.personId, row.lastAt])
  )

  const contacts = members.map((person) => ({
    personId: person.id,
    lastContactAt: lastContact.get(person.id) ?? null,
  }))

  const coverage = summariseCoverage(contacts, asOf)

  /* ── Fold by fold ── */
  const foldRows = await db
    .select({
      id: schema.folds.id,
      name: schema.folds.name,
      elderFirst: schema.people.firstName,
      elderLast: schema.people.lastName,
    })
    .from(schema.folds)
    .innerJoin(schema.people, eq(schema.people.id, schema.folds.elderId))
    .where(eq(schema.folds.churchId, viewer.churchId))

  const folds: FoldCoverage[] = foldRows.map((fold) => ({
    foldId: fold.id,
    foldName: fold.name,
    elderName: `${fold.elderFirst} ${fold.elderLast}`,
    coverage: summariseCoverage(
      contacts.filter((contact) =>
        members.some(
          (person) =>
            person.id === contact.personId && person.foldId === fold.id
        )
      ),
      asOf
    ),
  }))

  /* ── Members under nobody ── */
  const unfolded = members
    .filter((person) => person.foldId === null)
    .map((person) => {
      const assessment = assessContact(
        {
          personId: person.id,
          lastContactAt: lastContact.get(person.id) ?? null,
        },
        asOf
      )
      return {
        id: person.id,
        fullName: `${person.firstName} ${person.lastName}`,
        label: assessment.label,
      }
    })

  /* ── Care logged this month ── */
  const monthStart = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1)
  )
  const [logged] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.careNotes)
    .where(
      and(
        eq(schema.careNotes.churchId, viewer.churchId),
        gte(schema.careNotes.occurredAt, monthStart)
      )
    )

  /* ── Shepherds ── */
  const [shepherds] = await db
    .select({
      n: sql<number>`count(distinct ${schema.leaderRoles.personId})::int`,
    })
    .from(schema.leaderRoles)
    .where(eq(schema.leaderRoles.churchId, viewer.churchId))

  /* ── Overdue journeys, at this reader's tier ── */
  const overdueJourneys = await loadOverdueJourneys(asOf)

  /* ── The confidential appendix, counted ── */
  const [appendix] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.careNotes)
    .where(
      and(
        eq(schema.careNotes.churchId, viewer.churchId),
        eq(schema.careNotes.visibilityTier, 'elders_only'),
        gte(schema.careNotes.occurredAt, monthStart)
      )
    )

  const appendixCount = appendix?.n ?? 0
  const appendixReadable = canReadTier(viewer, 'elders_only')

  return {
    gate,
    asOf: DATE.format(asOf),
    churchName: church?.name ?? 'This church',
    coverage,
    stats: [
      {
        label: `Contacted in ${CONTACT_WINDOW_DAYS} days`,
        value: `${coverage.percentInsideWindow}%`,
        note:
          coverage.total === 0
            ? 'No members yet'
            : `of ${coverage.total} ${coverage.total === 1 ? 'member' : 'members'}`,
      },
      {
        label: 'Overdue people',
        value: String(coverage.overdue),
        note:
          coverage.overdue === 0
            ? 'Nobody has slipped past the window'
            : 'Including anyone never contacted',
      },
      {
        label: 'Care logged this month',
        value: String(logged?.n ?? 0),
        note: 'Notes at every tier, counted not read',
      },
      {
        label: 'Leaders serving',
        value: String(shepherds?.n ?? 0),
        note: 'Holding at least one role',
      },
    ],
    folds,
    concerns: concerningFolds(folds),
    unfolded,
    overdueJourneys,
    appendix: {
      count: appendixCount,
      readable: appendixReadable,
      note:
        appendixCount === 0
          ? 'Nothing is held at elders-only visibility this month.'
          : appendixReadable
            ? `${appendixCount} ${appendixCount === 1 ? 'matter is' : 'matters are'} held at elders-only visibility. Read them in Confidential, not here.`
            : // The count without the content. Knowing a conversation is waiting
              // is not the same as reading it, and withholding the count as well
              // would leave a leader unable to ask.
              `${appendixCount} ${appendixCount === 1 ? 'matter is' : 'matters are'} held at elders-only visibility. You can see that they exist, not what is in them.`,
    },
  }
}

/**
 * Journeys with somebody waiting.
 *
 * `getJourneys` in ./records already loads, redacts and derives these — including
 * the tier decision and the overdue arithmetic. Reimplementing it here is exactly
 * how a report comes to disagree with the page it summarises (§8.2), so this
 * filters that function's output instead.
 *
 * Withheld journeys are dropped rather than shown redacted. A report is a list of
 * things to do, and a row nobody reading it can act on is noise — the fact that
 * care is happening for that person is already carried by the coverage figures,
 * which count every tier.
 */
async function loadOverdueJourneys(
  asOf: Date
): Promise<ReportPage['overdueJourneys']> {
  const journeys = await getJourneys(asOf)

  return journeys.flatMap((journey) =>
    journey.access === 'visible' && journey.isOverdue
      ? [
          {
            personName: journey.personName,
            templateName: journey.templateName,
            stepTitle: journey.nextStepTitle ?? journey.stepLabel,
            dueLabel: journey.dueLabel ?? 'Overdue',
          },
        ]
      : []
  )
}
