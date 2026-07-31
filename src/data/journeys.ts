import 'server-only'

import { cache } from 'react'

import { asc, eq } from 'drizzle-orm'

import { canReadTier } from '@/domain/access'
import {
  type JourneyInstance,
  type JourneyStep,
  type JourneyTemplate,
  WINDOW_LABELS,
  journeyProgress,
} from '@/domain/journeys'
import { type PermissionCheck, permissionCheck } from '@/domain/roles'
import { tierName } from '@/domain/tiers'
import { db, schema } from '@/db/client'

import { getViewer } from './viewer'

/**
 * What the Journeys screen needs in order to be worked, not just read.
 *
 * `./records` already lists running journeys for display. This adds the parts a
 * write needs: the steps of each one with their completions, so the page can offer
 * the step that is actually waiting rather than a generic "log something", and the
 * templates and people a new journey can be started from.
 *
 * Only the step that is next is offered. The domain refuses out-of-order writes,
 * and offering four steps and refusing three of them is the §8.4 failure — a
 * control should not be there if the action behind it will say no.
 */

export type WaitingStep = {
  stepId: string
  title: string
  windowLabel: string
  ownerRole: string
  guidanceNote: string
}

export type WorkableJourney = {
  instanceId: string
  personId: string
  personName: string
  templateName: string
  tierLabel: string
  ownerName: string
  stepLabel: string
  summary: string
  isOverdue: boolean
  daysOverdue: number
  /** `null` once every step is accounted for, or the journey was closed. */
  waiting: WaitingStep | null
  isFinished: boolean
  closedReason: string | null
  /** What has already been recorded, most recent first. */
  history: readonly {
    stepTitle: string
    kind: 'done' | 'skipped'
    detail: string
    byName: string
    when: string
  }[]
}

export type JourneyWorkspace = {
  journeys: readonly WorkableJourney[]
  overdueCount: number
  /** Journeys running at a tier this reader cannot open. Counted, not listed. */
  withheldCount: number
  templates: readonly {
    id: string
    name: string
    trigger: string
    tierLabel: string
    stepCountLabel: string
    startable: boolean
  }[]
  people: readonly { id: string; fullName: string }[]
  leaders: readonly { id: string; fullName: string }[]
  logCheck: PermissionCheck
  emptyNote: string
}

const WHEN = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

export const getJourneyWorkspace = cache(
  async (asOf: Date = new Date()): Promise<JourneyWorkspace> => {
    const viewer = await getViewer()

    const [
      instanceRows,
      templateRows,
      stepRows,
      completionRows,
      peopleRows,
      leaderRows,
    ] = await Promise.all([
      db
        .select({
          id: schema.journeyInstances.id,
          templateId: schema.journeyInstances.templateId,
          personId: schema.journeyInstances.personId,
          startedAt: schema.journeyInstances.startedAt,
          ownerId: schema.journeyInstances.ownerId,
          closedAt: schema.journeyInstances.closedAt,
          closedReason: schema.journeyInstances.closedReason,
        })
        .from(schema.journeyInstances)
        .where(eq(schema.journeyInstances.churchId, viewer.churchId)),
      db
        .select()
        .from(schema.journeyTemplates)
        .where(eq(schema.journeyTemplates.churchId, viewer.churchId))
        .orderBy(asc(schema.journeyTemplates.name)),
      db
        .select()
        .from(schema.journeySteps)
        .orderBy(asc(schema.journeySteps.position)),
      db.select().from(schema.journeyStepCompletions),
      db
        .select({
          id: schema.people.id,
          firstName: schema.people.firstName,
          lastName: schema.people.lastName,
        })
        .from(schema.people)
        .where(eq(schema.people.churchId, viewer.churchId))
        .orderBy(asc(schema.people.lastName), asc(schema.people.firstName)),
      db
        .selectDistinct({
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
        .orderBy(asc(schema.people.lastName)),
    ])

    const nameOf = new Map(
      peopleRows.map((person) => [
        person.id,
        `${person.firstName} ${person.lastName}`,
      ])
    )

    const stepsOf = (templateId: string): JourneyStep[] =>
      stepRows
        .filter((step) => step.templateId === templateId)
        .map((step) => ({
          id: step.id,
          title: step.title,
          window: step.window,
          ownerRole: step.ownerRole,
          guidanceNote: step.guidanceNote,
        }))

    const templateById = new Map(
      templateRows.map((row): [string, JourneyTemplate] => [
        row.id,
        {
          id: row.id,
          name: row.name,
          trigger: row.trigger,
          visibilityTier: row.visibilityTier,
          isSystemDefault: row.isSystemDefault,
          steps: stepsOf(row.id),
        },
      ])
    )

    let withheldCount = 0
    const journeys: WorkableJourney[] = []

    for (const row of instanceRows) {
      const template = templateById.get(row.templateId)
      if (!template) continue

      // Counted rather than listed. A row nobody reading it can act on is noise,
      // and the count is what tells them care is happening elsewhere.
      if (!canReadTier(viewer, template.visibilityTier)) {
        withheldCount += 1
        continue
      }

      const completions = completionRows
        .filter((completion) => completion.instanceId === row.id)
        .map((completion) =>
          completion.kind === 'skipped'
            ? {
                stepId: completion.stepId,
                completedAt: completion.completedAt,
                byId: completion.byId,
                byName:
                  nameOf.get(completion.byId) ?? 'Somebody no longer listed',
                kind: 'skipped' as const,
                skipReason: completion.skipReason ?? '',
              }
            : {
                stepId: completion.stepId,
                completedAt: completion.completedAt,
                byId: completion.byId,
                byName:
                  nameOf.get(completion.byId) ?? 'Somebody no longer listed',
                kind: 'done' as const,
                outcome: completion.outcome ?? '',
              }
        )

      const instance: JourneyInstance = {
        id: row.id,
        templateId: row.templateId,
        personId: row.personId,
        startedAt: row.startedAt,
        ownerId: row.ownerId,
        ownerName: nameOf.get(row.ownerId) ?? 'Somebody no longer listed',
        closedAt: row.closedAt,
        closedReason: row.closedReason,
        completions,
      }

      const progress = journeyProgress(template, instance, asOf)
      const titleOf = (stepId: string) =>
        template.steps.find((step) => step.id === stepId)?.title ?? 'A step'

      journeys.push({
        instanceId: row.id,
        personId: row.personId,
        personName: nameOf.get(row.personId) ?? 'Somebody no longer listed',
        templateName: template.name,
        tierLabel: tierName(template.visibilityTier),
        ownerName: instance.ownerName,
        stepLabel: progress.stepLabel,
        summary: progress.summary,
        isOverdue: progress.isOverdue,
        daysOverdue: progress.daysOverdue,
        // Exactly the step the domain would accept, so no offered control is
        // refused (§8.4).
        waiting: progress.currentStep
          ? {
              stepId: progress.currentStep.id,
              title: progress.currentStep.title,
              windowLabel: WINDOW_LABELS[progress.currentStep.window],
              ownerRole: progress.currentStep.ownerRole,
              guidanceNote: progress.currentStep.guidanceNote,
            }
          : null,
        isFinished: progress.isFinished,
        closedReason: instance.closedReason,
        history: completions
          .slice()
          .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())
          .map((completion) => ({
            stepTitle: titleOf(completion.stepId),
            kind: completion.kind,
            detail:
              completion.kind === 'done'
                ? completion.outcome
                : completion.skipReason,
            byName: completion.byName,
            when: WHEN.format(completion.completedAt),
          })),
      })
    }

    // Overdue first, then the rest. Finished ones last: they are a record, not work.
    journeys.sort((a, b) => {
      if (a.isFinished !== b.isFinished) return a.isFinished ? 1 : -1
      if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1
      return b.daysOverdue - a.daysOverdue
    })

    const running = journeys.filter((journey) => !journey.isFinished)

    return {
      journeys,
      overdueCount: journeys.filter((journey) => journey.isOverdue).length,
      withheldCount,
      templates: templateRows
        .filter((row) => canReadTier(viewer, row.visibilityTier))
        .map((row) => {
          const count = stepsOf(row.id).length
          return {
            id: row.id,
            name: row.name,
            trigger: row.trigger,
            tierLabel: tierName(row.visibilityTier),
            stepCountLabel: `${count} ${count === 1 ? 'step' : 'steps'}`,
            // A template with no steps would ask nobody to do anything.
            startable: count > 0,
          }
        }),
      people: peopleRows.map((person) => ({
        id: person.id,
        fullName: `${person.firstName} ${person.lastName}`,
      })),
      leaders: leaderRows.map((leader) => ({
        id: leader.id,
        fullName: `${leader.firstName} ${leader.lastName}`,
      })),
      logCheck: permissionCheck(viewer, 'care.log_note'),
      emptyNote:
        instanceRows.length === 0
          ? 'No journeys running. Starting one is how care gets a shape and a stopping point rather than depending on somebody remembering.'
          : running.length === 0
            ? 'Nothing is running. Everything below has finished, and finished journeys are kept rather than cleared.'
            : '',
    }
  }
)

/** Journeys running on one person, for their record. */
export const getPersonJourneys = cache(
  async (personId: string): Promise<WorkableJourney[]> => {
    const workspace = await getJourneyWorkspace()
    return workspace.journeys.filter((journey) => journey.personId === personId)
  }
)
