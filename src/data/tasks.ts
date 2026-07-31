import 'server-only'

import { cache } from 'react'

import { type Role, ROLE_LABELS } from '@/domain/roles'

import { getGuestsPage } from './guests'
import { getJourneys, getUnfoldedMembers } from './records'
import { getMilestonesPage } from './milestones'
import { getPrayerPage } from './prayer'
import { getViewer } from './viewer'

/**
 * Tasks — what is actually owed, derived rather than stored.
 *
 * There is no tasks table, and that is the design rather than a gap. Every item
 * here is a *consequence* of something else being true: a journey step is due, a
 * member is under no elder, a guest has nobody carrying them, a milestone falls
 * this week. A separate task row would be a second place able to disagree with the
 * thing it describes — a task saying "call Lena" surviving the call being logged is
 * exactly the §8.1 failure, and it is the failure that makes people stop trusting
 * a list.
 *
 * The consequence worth stating: nothing on this page can be ticked off directly.
 * You clear an item by doing the thing — logging the call, naming the elder,
 * assigning the connector. That is deliberate.
 */

export type TaskSource =
  'journey' | 'unfolded' | 'unowned_guest' | 'milestone' | 'prayer'

export type TaskRow = {
  id: string
  source: TaskSource
  /** What to do, in the imperative. */
  what: string
  /** Who or what it concerns. */
  about: string
  /** How to clear it — always by doing something, never by ticking a box. */
  clearedBy: string
  href: string
  urgency: 'overdue' | 'soon' | 'open'
  when: string
}

export type TasksPage = {
  rows: readonly TaskRow[]
  overdueCount: number
  /** Roles the viewer holds, which is what makes some of these theirs. */
  roleLabels: readonly string[]
  /** Journey steps owned by a role the viewer does not hold. */
  othersCount: number
  emptyNote: string
  derivationNote: string
}

const SOURCE_ORDER: Record<TaskSource, number> = {
  journey: 0,
  unowned_guest: 1,
  unfolded: 2,
  milestone: 3,
  prayer: 4,
}

const URGENCY_ORDER = { overdue: 0, soon: 1, open: 2 } as const

export const getTasksPage = cache(
  async (asOf: Date = new Date()): Promise<TasksPage> => {
    const viewer = await getViewer()

    // Every one of these is the same call the corresponding page makes. That is the
    // point: this page cannot show a task the page it links to disagrees with.
    const [journeys, unfolded, guests, milestones, prayer] = await Promise.all([
      getJourneys(asOf),
      getUnfoldedMembers(),
      getGuestsPage(asOf),
      getMilestonesPage(asOf),
      getPrayerPage(),
    ])

    const rows: TaskRow[] = []

    /* ── Journey steps that are due ── */
    let othersCount = 0
    for (const journey of journeys) {
      if (journey.access !== 'visible') continue
      if (!journey.nextStepTitle) continue

      rows.push({
        id: `journey-${journey.instanceId}`,
        source: 'journey',
        what: journey.nextStepTitle,
        about: `${journey.personName} · ${journey.templateName}`,
        clearedBy: 'Logging the contact against the step',
        href: '/journeys',
        urgency: journey.isOverdue ? 'overdue' : 'soon',
        when: journey.dueLabel ?? 'No due date',
      })
    }
    // Counted, not listed. A step owned by a role you do not hold is somebody
    // else's, and putting it on your list makes the list less trustworthy.
    othersCount = journeys.filter(
      (journey) => journey.access === 'withheld'
    ).length

    /* ── Members under nobody ── */
    for (const person of unfolded) {
      rows.push({
        id: `unfolded-${person.id}`,
        source: 'unfolded',
        what: 'Name an elder for them',
        about: person.fullName,
        clearedBy: 'Putting them in a fold with a named elder',
        href: `/people/${person.id}`,
        // Not overdue, because there is no clock on it — and not "open" either.
        // A member with no shepherd is the product's central failure.
        urgency: 'overdue',
        when: 'No fold',
      })
    }

    /* ── Guests nobody is carrying ── */
    for (const guest of guests.rows) {
      if (!guest.unowned) continue
      rows.push({
        id: `guest-${guest.personId}`,
        source: 'unowned_guest',
        what: 'Assign somebody to carry them',
        about: guest.fullName,
        clearedBy: 'Naming a connector on their placement',
        href: '/guests',
        urgency: guest.isOverdue ? 'overdue' : 'soon',
        when: guest.contactLabel,
      })
    }

    /* ── Milestones today and this week ── */
    for (const group of milestones.groups) {
      if (group.key === 'coming_up') continue
      for (const item of group.items) {
        rows.push({
          id: `milestone-${item.id}`,
          source: 'milestone',
          what: item.sombre ? 'Reach out — this one is hard' : 'Mark the day',
          about: `${item.personName} · ${item.description}`,
          clearedBy: 'Logging the call or the visit',
          href: '/milestones',
          urgency: group.key === 'today' ? 'soon' : 'open',
          when: group.label,
        })
      }
    }

    /* ── Open prayer requests nobody has prayed for ── */
    for (const request of prayer.rows) {
      if (request.access !== 'visible') continue
      if (request.standing !== 'open') continue
      if (request.mine > 0) continue
      rows.push({
        id: `prayer-${request.id}`,
        source: 'prayer',
        what: 'Pray for this',
        about: `${request.personName} · ${request.body}`,
        clearedBy: 'Praying, and saying so',
        href: '/prayer',
        urgency: 'open',
        when: request.askedLabel,
      })
    }

    rows.sort((a, b) => {
      const byUrgency = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency]
      if (byUrgency !== 0) return byUrgency
      return SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source]
    })

    const overdueCount = rows.filter((row) => row.urgency === 'overdue').length

    return {
      rows,
      overdueCount,
      roleLabels: viewer.roles.map((role) => ROLE_LABELS[role as Role]),
      othersCount,
      emptyNote:
        rows.length === 0
          ? 'Nothing is owed. Every journey step is inside its window, every member is under an elder, and every guest has somebody carrying them.'
          : '',
      derivationNote:
        'Nothing here can be ticked off. Each item is a consequence of something being true, so it disappears when you do the thing — log the call, name the elder, assign the connector. A tick would let this list disagree with the records it describes.',
    }
  }
)
