import 'server-only'

import { desc, eq } from 'drizzle-orm'

import {
  type CareNoteRecord,
  type CareNoteView,
  buildCareTimeline,
  canReadTier,
  writableTiers,
} from '@/domain/access'
import { type PermissionCheck, permissionCheck } from '@/domain/roles'
import { type ConfidentialityTier, TIER_ORDER, tierName } from '@/domain/tiers'
import { db, schema } from '@/db/client'

import { getViewer } from './viewer'

/**
 * Notes — the church's care log, read at the reader's own tier.
 *
 * The person record already shows one person's timeline. This is the same notes
 * across everybody, which is the view an elder uses to answer "has anyone
 * actually talked to these people this month", and it is where the tier model is
 * most visible: a staff member and an elder open this page and see different
 * numbers of notes, with the difference stated rather than hidden.
 *
 * Every note goes through `viewCareNote`. A withheld note comes back as a variant
 * with no `body` field at all — not an empty string, not a nulled column. The
 * body never leaves the server for a note the reader may not read.
 */

export type NoteRow = {
  view: CareNoteView
  /** Whose note it is. Present on both variants: care happening is not secret. */
  personId: string
  personName: string
}

export type NotesPage = {
  rows: readonly NoteRow[]
  visibleCount: number
  hiddenCount: number
  /** Derived from the actual count, never a flag beside it (§8.1). */
  hiddenNote: string
  /** Counted per tier, so "who can read what" is concrete rather than abstract. */
  byTier: readonly {
    tier: ConfidentialityTier
    label: string
    count: number
    countLabel: string
    readable: boolean
  }[]
  /** Tiers this viewer may write at. Empty when they may not write at all. */
  writableTiers: readonly { tier: ConfidentialityTier; label: string }[]
  logNoteCheck: PermissionCheck
  /** People this viewer may file a note against. */
  people: readonly { id: string; fullName: string }[]
  emptyNote: string
}

const HOW_MANY = 200

export async function getNotesPage(): Promise<NotesPage> {
  const viewer = await getViewer()

  const [noteRows, people] = await Promise.all([
    db
      .select({
        id: schema.careNotes.id,
        personId: schema.careNotes.personId,
        authorId: schema.careNotes.authorId,
        occurredAt: schema.careNotes.occurredAt,
        visibilityTier: schema.careNotes.visibilityTier,
        body: schema.careNotes.body,
        restorationCaseId: schema.careNotes.restorationCaseId,
      })
      .from(schema.careNotes)
      .where(eq(schema.careNotes.churchId, viewer.churchId))
      .orderBy(desc(schema.careNotes.occurredAt))
      .limit(HOW_MANY),
    db
      .select({
        id: schema.people.id,
        firstName: schema.people.firstName,
        lastName: schema.people.lastName,
      })
      .from(schema.people)
      .where(eq(schema.people.churchId, viewer.churchId))
      .orderBy(schema.people.lastName, schema.people.firstName),
  ])

  const nameOf = new Map(
    people.map((person) => [
      person.id,
      `${person.firstName} ${person.lastName}`,
    ])
  )

  const records: CareNoteRecord[] = noteRows.map((row) => ({
    id: row.id,
    personId: row.personId,
    authorId: row.authorId,
    authorName: nameOf.get(row.authorId) ?? 'Someone no longer listed',
    occurredAt: row.occurredAt,
    visibilityTier: row.visibilityTier,
    body: row.body,
    restorationCaseId: row.restorationCaseId,
  }))

  // One call, so the counts and the note text cannot disagree with the list.
  const timeline = buildCareTimeline(viewer, records)

  const rows = timeline.notes.map((view, index): NoteRow => ({
    view,
    personId: records[index]!.personId,
    personName:
      nameOf.get(records[index]!.personId) ?? 'Someone no longer listed',
  }))

  const writable = writableTiers(viewer)

  return {
    rows,
    visibleCount: timeline.visibleCount,
    hiddenCount: timeline.hiddenCount,
    hiddenNote: timeline.hiddenNote,
    byTier: TIER_ORDER.map((tier) => {
      const count = records.filter(
        (record) => record.visibilityTier === tier
      ).length
      return {
        tier,
        label: tierName(tier),
        count,
        countLabel: `${count} ${count === 1 ? 'note' : 'notes'}`,
        // Asked of the reader, not of the rows. Deriving it from whether a
        // visible note happens to sit at this tier reports an empty tier as
        // unreadable, which is a different and wrong claim.
        readable: canReadTier(viewer, tier),
      }
    }),
    writableTiers: writable.map((tier) => ({ tier, label: tierName(tier) })),
    logNoteCheck: permissionCheck(viewer, 'care.log_note'),
    people: people.map((person) => ({
      id: person.id,
      fullName: `${person.firstName} ${person.lastName}`,
    })),
    // An empty log and a log you cannot read are different facts, and a reader
    // who is being shown nothing deserves to know which one this is.
    emptyNote:
      records.length === 0
        ? 'No care has been logged yet. Once it is, this is where it accumulates.'
        : timeline.visibleCount === 0
          ? 'Care has been logged, and none of it is at a tier you read.'
          : '',
  }
}
