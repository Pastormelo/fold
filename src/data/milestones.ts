import 'server-only'

import { asc, eq } from 'drizzle-orm'

import {
  type MilestoneGroup,
  type MilestoneRecord,
  parseStoredDate,
  upcomingMilestones,
} from '@/domain/milestones'
import { type PermissionCheck, permissionCheck } from '@/domain/roles'
import { db, schema } from '@/db/client'

import { getViewer } from './viewer'

/**
 * Milestones — the dates a church should not miss.
 *
 * No tier on these. A birthday is not confidential, and the design lists
 * milestones under ordinary care. What a leader *does* with an anniversary of a
 * loss might well be logged at a higher tier, and that is a care note rather than
 * the date itself.
 *
 * The grouping and the wording both come from `@/domain/milestones`, which is
 * tested. This file loads rows and hands them over.
 */

export type MilestonesPage = {
  groups: readonly MilestoneGroup[]
  totalInWindow: number
  /** Every member, so a milestone can be recorded against one. */
  people: readonly { id: string; fullName: string }[]
  recordCheck: PermissionCheck
  emptyNote: string
}

export async function getMilestonesPage(
  asOf: Date = new Date()
): Promise<MilestonesPage> {
  const viewer = await getViewer()

  const [rows, people] = await Promise.all([
    db
      .select({
        id: schema.milestones.id,
        personId: schema.milestones.personId,
        kind: schema.milestones.kind,
        occurredOn: schema.milestones.occurredOn,
        note: schema.milestones.note,
        firstName: schema.people.firstName,
        lastName: schema.people.lastName,
      })
      .from(schema.milestones)
      .innerJoin(
        schema.people,
        eq(schema.people.id, schema.milestones.personId)
      )
      .where(eq(schema.milestones.churchId, viewer.churchId)),
    db
      .select({
        id: schema.people.id,
        firstName: schema.people.firstName,
        lastName: schema.people.lastName,
      })
      .from(schema.people)
      .where(eq(schema.people.churchId, viewer.churchId))
      .orderBy(asc(schema.people.lastName), asc(schema.people.firstName)),
  ])

  const records: MilestoneRecord[] = rows.map((row) => ({
    id: row.id,
    personId: row.personId,
    personName: `${row.firstName} ${row.lastName}`,
    kind: row.kind,
    // Verified against the live database: Drizzle's `date()` hands back the bare
    // string, and `parseStoredDate` pins it to UTC midnight so a birthday does
    // not land a day early for everybody west of Greenwich.
    occurredOn: parseStoredDate(row.occurredOn),
    note: row.note,
  }))

  const groups = upcomingMilestones(records, asOf)
  const totalInWindow = groups.reduce((sum, group) => sum + group.count, 0)

  return {
    groups,
    totalInWindow,
    people: people.map((person) => ({
      id: person.id,
      fullName: `${person.firstName} ${person.lastName}`,
    })),
    recordCheck: permissionCheck(viewer, 'care.log_note'),
    // Nothing recorded and nothing coming up are different facts.
    emptyNote:
      records.length === 0
        ? 'No milestones recorded. Until birthdays and anniversaries are in here, nothing will surface on the day.'
        : totalInWindow === 0
          ? `${records.length} ${records.length === 1 ? 'milestone is' : 'milestones are'} recorded, and none falls in the next thirty days.`
          : '',
  }
}
