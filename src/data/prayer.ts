import 'server-only'

import { cache } from 'react'

import { and, desc, eq, inArray, sql } from 'drizzle-orm'

import { canReadTier, readableTiers } from '@/domain/access'
import {
  PRAYED_CAP,
  type PrayerRequestRecord,
  describeTally,
  standingOf,
} from '@/domain/prayer'
import { type PermissionCheck, permissionCheck } from '@/domain/roles'
import { type ConfidentialityTier, tierName } from '@/domain/tiers'
import { db, schema } from '@/db/client'

import { getViewer } from './viewer'

/**
 * Prayer — open requests, and the answered ones kept rather than cleared.
 *
 * Requests carry a tier, so this page is redacted the way Notes is: a request
 * above the reader's tier appears with the person's name and no body. The name
 * stays because knowing somebody has asked for prayer is not the confidential
 * part; what they asked for is.
 *
 * The tally is computed per viewer. "Including you" is read off the viewer's own
 * row rather than assumed, so the sentence cannot claim they prayed when they have
 * not.
 */

export type PrayerRow =
  | {
      access: 'visible'
      id: string
      personId: string
      personName: string
      askedByName: string
      body: string
      tierLabel: string
      tier: ConfidentialityTier
      standing: 'open' | 'answered'
      outcome: string | null
      tallyLabel: string
      /** Whether this viewer has prayed, and how many times. */
      mine: number
      atCap: boolean
      askedLabel: string
    }
  | {
      access: 'withheld'
      id: string
      personId: string
      personName: string
      tierLabel: string
      tier: ConfidentialityTier
      standing: 'open' | 'answered'
      disclosure: string
    }

export type PrayerPage = {
  rows: readonly PrayerRow[]
  openCount: number
  answeredCount: number
  hiddenCount: number
  hiddenNote: string
  /** Tiers this viewer may file a request at. */
  writableTiers: readonly { tier: ConfidentialityTier; label: string }[]
  askCheck: PermissionCheck
  people: readonly { id: string; fullName: string }[]
  emptyNote: string
}

const WHEN = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

const WITHHELD =
  'This request is above your tier. You can see that they asked for prayer, not what for.'

export const getPrayerPage = cache(async (): Promise<PrayerPage> => {
  const viewer = await getViewer()

  const [rows, people] = await Promise.all([
    db
      .select({
        id: schema.prayerRequests.id,
        personId: schema.prayerRequests.personId,
        askedById: schema.prayerRequests.askedById,
        body: schema.prayerRequests.body,
        visibilityTier: schema.prayerRequests.visibilityTier,
        askedAt: schema.prayerRequests.askedAt,
        answeredAt: schema.prayerRequests.answeredAt,
        outcome: schema.prayerRequests.outcome,
      })
      .from(schema.prayerRequests)
      .where(eq(schema.prayerRequests.churchId, viewer.churchId))
      // Open first, then most recent. An answered request is kept, and it is not
      // what somebody opening this page needs to see first.
      .orderBy(
        sql`${schema.prayerRequests.answeredAt} is not null`,
        desc(schema.prayerRequests.askedAt)
      ),
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

  const requestIds = rows.map((row) => row.id)

  const [tallies, mine] = await Promise.all([
    requestIds.length === 0
      ? []
      : db
          .select({
            requestId: schema.prayedFor.requestId,
            people: sql<number>`count(*)::int`,
          })
          .from(schema.prayedFor)
          .where(inArray(schema.prayedFor.requestId, requestIds))
          .groupBy(schema.prayedFor.requestId),
    requestIds.length === 0
      ? []
      : db
          .select({
            requestId: schema.prayedFor.requestId,
            times: schema.prayedFor.times,
          })
          .from(schema.prayedFor)
          .where(
            and(
              inArray(schema.prayedFor.requestId, requestIds),
              eq(schema.prayedFor.personId, viewer.personId)
            )
          ),
  ])

  const peopleByRequest = new Map(
    tallies.map((row) => [row.requestId, row.people])
  )
  const mineByRequest = new Map(mine.map((row) => [row.requestId, row.times]))

  const built = rows.map((row): PrayerRow => {
    const record: PrayerRequestRecord = {
      id: row.id,
      personId: row.personId,
      personName: nameOf.get(row.personId) ?? 'Someone no longer listed',
      askedByName: nameOf.get(row.askedById) ?? 'Someone no longer listed',
      body: row.body,
      visibilityTier: row.visibilityTier,
      askedAt: row.askedAt,
      answeredAt: row.answeredAt,
      outcome: row.outcome,
    }
    const standing = standingOf(record)

    if (!canReadTier(viewer, record.visibilityTier)) {
      // No `body` and no `outcome` on this variant. Nothing to inspect.
      return {
        access: 'withheld',
        id: record.id,
        personId: record.personId,
        personName: record.personName,
        tierLabel: tierName(record.visibilityTier),
        tier: record.visibilityTier,
        standing,
        disclosure: WITHHELD,
      }
    }

    const tally = {
      people: peopleByRequest.get(record.id) ?? 0,
      mine: mineByRequest.get(record.id) ?? 0,
    }

    return {
      access: 'visible',
      id: record.id,
      personId: record.personId,
      personName: record.personName,
      askedByName: record.askedByName,
      body: record.body,
      tierLabel: tierName(record.visibilityTier),
      tier: record.visibilityTier,
      standing,
      outcome: record.outcome,
      tallyLabel: describeTally(tally),
      mine: tally.mine,
      // The domain constant, not the literal 100. The cap and the check that
      // enforces it must not be able to drift apart.
      atCap: tally.mine >= PRAYED_CAP,
      askedLabel: WHEN.format(record.askedAt),
    }
  })

  const hiddenCount = built.filter((row) => row.access === 'withheld').length
  const openCount = built.filter((row) => row.standing === 'open').length

  return {
    rows: built,
    openCount,
    answeredCount: built.length - openCount,
    hiddenCount,
    hiddenNote:
      hiddenCount === 0
        ? ''
        : `${hiddenCount} ${hiddenCount === 1 ? 'request is' : 'requests are'} above your tier. You can see that they asked, not what for.`,
    writableTiers: readableTiers(viewer).map((tier) => ({
      tier,
      label: tierName(tier),
    })),
    askCheck: permissionCheck(viewer, 'care.log_note'),
    people: people.map((person) => ({
      id: person.id,
      fullName: `${person.firstName} ${person.lastName}`,
    })),
    emptyNote:
      built.length === 0
        ? 'No prayer requests yet. Answered ones stay here once there are, rather than being cleared out.'
        : '',
  }
})
