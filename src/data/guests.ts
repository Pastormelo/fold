import 'server-only'

import { cache } from 'react'

import { and, asc, desc, eq, isNull } from 'drizzle-orm'

import { assessContact } from '@/domain/coverage'
import { type PermissionCheck, permissionCheck } from '@/domain/roles'
import { db, schema } from '@/db/client'

import { getViewer } from './viewer'

/**
 * Guests — anyone who is not yet a member, and where they are in the pathway.
 *
 * §6 keeps Guests apart from Family deliberately: a guest is not in Family until
 * membership. So this is not a filter on the directory page, it is its own list
 * with its own question — is anybody carrying this person, and what is the next
 * thing that happens to them.
 *
 * A placement points at a stage of a specific pathway version rather than a stage
 * name, which is what makes §4's migration decision meaningful. When no pathway is
 * published there is nothing to place anybody in, and the page says that instead of
 * showing an empty stage column.
 */

export type GuestRow = {
  personId: string
  fullName: string
  /** Where they are, when a pathway exists and they have been placed. */
  stageName: string | null
  stageOwnerRole: string | null
  /** What the stage says happens next. */
  completionCondition: string | null
  /** When follow-up stops, if the stage says. Silence after that is an answer. */
  stoppingRule: string | null
  connectorName: string | null
  /** The point of the page: a guest nobody is carrying. */
  unowned: boolean
  enteredLabel: string | null
  contactLabel: string
  isOverdue: boolean
}

export type GuestsPage = {
  rows: readonly GuestRow[]
  unownedCount: number
  unplacedCount: number
  /** The live pathway, when there is one. */
  pathway: { versionNumber: number; stageCount: number } | null
  pathwayNote: string
  /** Stages of the live version, for placing somebody. */
  stages: readonly { id: string; name: string; position: number }[]
  /** People who could carry a guest. */
  connectors: readonly { id: string; fullName: string }[]
  placeCheck: PermissionCheck
  emptyNote: string
}

const WHEN = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

export const getGuestsPage = cache(
  async (asOf: Date = new Date()): Promise<GuestsPage> => {
    const viewer = await getViewer()

    const [guests, active, leaders] = await Promise.all([
      db
        .select({
          id: schema.people.id,
          firstName: schema.people.firstName,
          lastName: schema.people.lastName,
        })
        .from(schema.people)
        .where(
          and(
            eq(schema.people.churchId, viewer.churchId),
            eq(schema.people.isMember, false)
          )
        )
        .orderBy(asc(schema.people.lastName), asc(schema.people.firstName)),
      db
        .select({
          id: schema.pathways.id,
          versionNumber: schema.pathways.versionNumber,
        })
        .from(schema.pathways)
        .where(
          and(
            eq(schema.pathways.churchId, viewer.churchId),
            eq(schema.pathways.state, 'active')
          )
        )
        .limit(1),
      db
        .select({
          id: schema.people.id,
          firstName: schema.people.firstName,
          lastName: schema.people.lastName,
        })
        .from(schema.leaderRoles)
        .innerJoin(
          schema.people,
          eq(schema.people.id, schema.leaderRoles.personId)
        )
        .where(eq(schema.leaderRoles.churchId, viewer.churchId))
        .groupBy(
          schema.people.id,
          schema.people.firstName,
          schema.people.lastName
        )
        .orderBy(asc(schema.people.lastName)),
    ])

    const live = active[0] ?? null

    const stages = live
      ? await db
          .select({
            id: schema.pathwayStages.id,
            name: schema.pathwayStages.name,
            position: schema.pathwayStages.position,
            ownerRole: schema.pathwayStages.ownerRole,
            completionCondition: schema.pathwayStages.completionCondition,
            stoppingRule: schema.pathwayStages.stoppingRule,
          })
          .from(schema.pathwayStages)
          .where(eq(schema.pathwayStages.pathwayId, live.id))
          .orderBy(asc(schema.pathwayStages.position))
      : []

    const placements = await db
      .select({
        personId: schema.pathwayPlacements.personId,
        stageId: schema.pathwayPlacements.stageId,
        connectorId: schema.pathwayPlacements.connectorId,
        enteredAt: schema.pathwayPlacements.enteredAt,
      })
      .from(schema.pathwayPlacements)
      .where(
        and(
          eq(schema.pathwayPlacements.churchId, viewer.churchId),
          isNull(schema.pathwayPlacements.exitedAt)
        )
      )
      .orderBy(desc(schema.pathwayPlacements.enteredAt))

    const placementOf = new Map(
      placements.map((placement) => [placement.personId, placement])
    )
    const stageOf = new Map(stages.map((stage) => [stage.id, stage]))
    const nameOf = new Map(
      leaders.map((leader) => [
        leader.id,
        `${leader.firstName} ${leader.lastName}`,
      ])
    )

    // Last contact for a guest matters as much as for a member. A first-time visitor
    // nobody follows up on is exactly the person the product exists for.
    const lastContactRows =
      guests.length === 0
        ? []
        : await db
            .select({
              personId: schema.careNotes.personId,
              occurredAt: schema.careNotes.occurredAt,
            })
            .from(schema.careNotes)
            .where(eq(schema.careNotes.churchId, viewer.churchId))
            .orderBy(desc(schema.careNotes.occurredAt))

    const lastContact = new Map<string, Date>()
    for (const row of lastContactRows) {
      if (!lastContact.has(row.personId))
        lastContact.set(row.personId, row.occurredAt)
    }

    const rows = guests.map((guest): GuestRow => {
      const placement = placementOf.get(guest.id)
      const stage = placement ? stageOf.get(placement.stageId) : undefined
      const assessment = assessContact(
        {
          personId: guest.id,
          lastContactAt: lastContact.get(guest.id) ?? null,
        },
        asOf
      )

      return {
        personId: guest.id,
        fullName: `${guest.firstName} ${guest.lastName}`,
        stageName: stage?.name ?? null,
        stageOwnerRole: stage?.ownerRole || null,
        completionCondition: stage?.completionCondition || null,
        stoppingRule: stage?.stoppingRule || null,
        connectorName: placement?.connectorId
          ? (nameOf.get(placement.connectorId) ?? null)
          : null,
        unowned: !placement?.connectorId,
        enteredLabel: placement ? WHEN.format(placement.enteredAt) : null,
        contactLabel: assessment.label,
        isOverdue: assessment.standing === 'overdue',
      }
    })

    const unownedCount = rows.filter((row) => row.unowned).length
    const unplacedCount = rows.filter((row) => row.stageName === null).length

    return {
      rows,
      unownedCount,
      unplacedCount,
      pathway: live
        ? { versionNumber: live.versionNumber, stageCount: stages.length }
        : null,
      // Said rather than implied. Without a published pathway there is no "next
      // step" to show, and a blank column would read as though there were one and
      // nobody had done it.
      pathwayNote: live
        ? `Version ${live.versionNumber} is live, with ${stages.length} ${stages.length === 1 ? 'stage' : 'stages'}. A placement belongs to that version, so publishing a new one is a decision about these people rather than a silent move.`
        : 'No pathway is published, so there are no stages to place anyone in. Guests still appear here, and the question of who is carrying them still stands.',
      stages: stages.map((stage) => ({
        id: stage.id,
        name: stage.name,
        position: stage.position,
      })),
      connectors: leaders.map((leader) => ({
        id: leader.id,
        fullName: `${leader.firstName} ${leader.lastName}`,
      })),
      placeCheck: permissionCheck(viewer, 'care.view_people'),
      emptyNote:
        guests.length === 0
          ? 'Nobody is in the guest list. Anyone not yet a member appears here, kept out of Family on purpose.'
          : '',
    }
  }
)
