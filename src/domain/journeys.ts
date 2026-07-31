/**
 * Care journeys — HANDOFF.md §2 (Care), build order §11 step 5.
 *
 * A journey is a template for a situation — grief, hospital, a new believer, a
 * new family, benevolence, marriage crisis, personal struggle, restoration —
 * running on one person, a step at a time.
 *
 * The product premise this serves: follow-up must not run forever without a
 * stopping rule. A journey's last step *is* its stopping rule, so a journey
 * always ends, and it ends visibly rather than by being quietly forgotten.
 *
 * Nothing here is stored twice. The handoff describes a journey instance as
 * tracking "current step, due date, last contact" — those are all computed from
 * the recorded step completions plus the template, because a stored due date
 * drifts the moment a step is finished early (§8.1).
 */

import { type ConfidentialityTier, clearanceReaches } from './tiers'
import type { Role } from './roles'

/* ─────────────────────────── The window scale ─────────────────────────── */

/**
 * When a step is due, relative to the journey starting. Ordered soonest first,
 * the same shape as the tier scale: the ordering lives here once and everything
 * else derives from it.
 */
export const CARE_WINDOWS = [
  'same_day',
  'within_48_hours',
  'week_1',
  'week_2',
  'month_1',
  'month_3',
  'month_6',
] as const

export type CareWindow = (typeof CARE_WINDOWS)[number]

export const WINDOW_LABELS: Record<CareWindow, string> = {
  same_day: 'Same day',
  within_48_hours: 'Within 48 hours',
  week_1: 'Week 1',
  week_2: 'Week 2',
  month_1: 'Month 1',
  month_3: 'Month 3',
  month_6: 'Month 6',
}

/** Days from the journey's start by which the step is due. */
const WINDOW_DAYS: Record<CareWindow, number> = {
  same_day: 0,
  within_48_hours: 2,
  week_1: 7,
  week_2: 14,
  month_1: 30,
  month_3: 90,
  month_6: 180,
}

export function windowRank(window: CareWindow): number {
  const rank = CARE_WINDOWS.indexOf(window)
  if (rank === -1) {
    throw new Error(`Unknown care window: ${String(window)}`)
  }
  return rank
}

/** The date a step in this window is due, given when the journey started. */
export function dueDateFor(startedAt: Date, window: CareWindow): Date {
  const due = new Date(startedAt)
  due.setUTCDate(due.getUTCDate() + WINDOW_DAYS[window])
  return due
}

/* ───────────────────────────── Templates ───────────────────────────── */

export type JourneyStep = {
  id: string
  title: string
  window: CareWindow
  ownerRole: Role
  /** What the leader should keep in mind. Guidance, not a script. */
  guidanceNote: string
}

export type JourneyTemplate = {
  id: string
  name: string
  /** The life event that starts this journey. */
  trigger: string
  /**
   * The tier every note logged on this journey is written at. A benevolence
   * journey sits at `staff_and_elders`; a restoration one at `elders_only`.
   */
  visibilityTier: ConfidentialityTier
  /**
   * System defaults ship with the product. §2: they "cannot be deleted, only
   * edited" — a church that stops using the grief journey should edit it to fit,
   * not remove the fact that grief needs a response.
   */
  isSystemDefault: boolean
  steps: readonly JourneyStep[]
}

/** §2: system default templates can be edited, never deleted. */
export function canDeleteTemplate(template: JourneyTemplate): boolean {
  return !template.isSystemDefault
}

export function deleteTemplateRefusal(
  template: JourneyTemplate
): string | null {
  if (canDeleteTemplate(template)) return null
  return `“${template.name}” is a default journey. You can change its steps, its windows, and who owns them, but it cannot be removed — the situation it covers does not stop happening because the journey was deleted.`
}

/**
 * Template problems worth surfacing before it runs on anyone.
 *
 * Only two, both of which make a journey fail at its purpose rather than merely
 * look untidy: a journey with no steps never asks anyone to do anything, and
 * steps whose windows run backwards will report a due date earlier than one
 * already passed.
 */
export function templateIssues(template: JourneyTemplate): string[] {
  const issues: string[] = []

  if (template.steps.length === 0) {
    issues.push(
      'This journey has no steps, so starting it would ask nobody to do anything.'
    )
  }

  for (let i = 1; i < template.steps.length; i += 1) {
    const previous = template.steps[i - 1]!
    const step = template.steps[i]!
    if (windowRank(step.window) < windowRank(previous.window)) {
      issues.push(
        `“${step.title}” is due ${WINDOW_LABELS[step.window]}, which is before “${previous.title}” at ${WINDOW_LABELS[previous.window]}. Steps run in order.`
      )
    }
  }

  return issues
}

/* ───────────────────────────── Instances ───────────────────────────── */

/**
 * One step, finished. Either a logged outcome or a documented skip — never
 * silently passed over, which is the same rule §2 puts on a follow-up touch.
 */
export type StepCompletion = {
  stepId: string
  completedAt: Date
  /** Who did it. A person, not a role. */
  byId: string
  byName: string
} & (
  { kind: 'done'; outcome: string } | { kind: 'skipped'; skipReason: string }
)

/**
 * A template running on a person.
 *
 * Note what is absent: no `currentStep`, no `dueAt`, no `lastContact`. Those are
 * questions about this data, answered by `journeyProgress`, not fields that can
 * fall out of step with it.
 */
export type JourneyInstance = {
  id: string
  templateId: string
  personId: string
  startedAt: Date
  /** The leader carrying this journey. */
  ownerId: string
  ownerName: string
  completions: readonly StepCompletion[]
  /** Set when the journey ended early, with a reason. */
  closedAt: Date | null
  closedReason: string | null
}

export type JourneyProgress = {
  /** The next step needing attention, or `null` when the journey is finished. */
  currentStep: JourneyStep | null
  stepNumber: number
  totalSteps: number
  /** "Step 2 of 5", counted from the template rather than written down. */
  stepLabel: string
  dueAt: Date | null
  isOverdue: boolean
  daysOverdue: number
  /** The most recent completion of any kind. */
  lastContactAt: Date | null
  completedCount: number
  skippedCount: number
  /** True once every step is accounted for, or the journey was closed early. */
  isFinished: boolean
  closedEarly: boolean
  summary: string
}

/**
 * Everything the handoff describes an instance as "tracking", computed.
 *
 * `asOf` is a parameter rather than a call to `new Date()` so that overdue is
 * testable and so two parts of one request cannot disagree about the time.
 */
export function journeyProgress(
  template: JourneyTemplate,
  instance: JourneyInstance,
  asOf: Date
): JourneyProgress {
  const finishedIds = new Set(
    instance.completions.map((completion) => completion.stepId)
  )
  const currentStep =
    template.steps.find((step) => !finishedIds.has(step.id)) ?? null

  const completedCount = instance.completions.filter(
    (completion) => completion.kind === 'done'
  ).length
  const skippedCount = instance.completions.filter(
    (completion) => completion.kind === 'skipped'
  ).length

  const lastContactAt = instance.completions.reduce<Date | null>(
    (latest, completion) =>
      latest === null || completion.completedAt > latest
        ? completion.completedAt
        : latest,
    null
  )

  const closedEarly = instance.closedAt !== null
  const isFinished = closedEarly || currentStep === null

  const dueAt =
    currentStep && !closedEarly
      ? dueDateFor(instance.startedAt, currentStep.window)
      : null
  const daysOverdue =
    dueAt !== null && asOf > dueAt
      ? Math.floor((asOf.getTime() - dueAt.getTime()) / 86_400_000)
      : 0

  // The step number counts finished steps, so it stays correct even when a
  // church reorders the template between one contact and the next.
  const stepNumber = currentStep
    ? template.steps.indexOf(currentStep) + 1
    : template.steps.length

  return {
    currentStep,
    stepNumber,
    totalSteps: template.steps.length,
    stepLabel: `Step ${stepNumber} of ${template.steps.length}`,
    dueAt,
    isOverdue: daysOverdue > 0,
    daysOverdue,
    lastContactAt,
    completedCount,
    skippedCount,
    isFinished,
    closedEarly,
    summary: summarise({
      template,
      instance,
      currentStep,
      daysOverdue,
      isFinished,
      closedEarly,
      skippedCount,
    }),
  }
}

function summarise({
  template,
  instance,
  currentStep,
  daysOverdue,
  isFinished,
  closedEarly,
  skippedCount,
}: {
  template: JourneyTemplate
  instance: JourneyInstance
  currentStep: JourneyStep | null
  daysOverdue: number
  isFinished: boolean
  closedEarly: boolean
  skippedCount: number
}): string {
  if (closedEarly) {
    return `Closed early: ${instance.closedReason ?? 'no reason recorded'}`
  }
  if (isFinished) {
    const skipped =
      skippedCount === 0
        ? ''
        : skippedCount === 1
          ? ', 1 step skipped'
          : `, ${skippedCount} steps skipped`
    return `${template.name} finished${skipped}.`
  }
  if (daysOverdue > 0) {
    const days = daysOverdue === 1 ? '1 day' : `${daysOverdue} days`
    return `“${currentStep!.title}” is ${days} overdue, with ${instance.ownerName}.`
  }
  return `Next: “${currentStep!.title}”, with ${instance.ownerName}.`
}

/* ─────────────────────────── Who can see it ─────────────────────────── */

/**
 * Whether this reader can see a journey's content.
 *
 * The same tier comparison the rest of the app uses — a journey's tier comes
 * from its template, so a benevolence journey is invisible to a group leader for
 * exactly the same reason a benevolence note is.
 */
export function canReadJourney(
  clearance: ConfidentialityTier | null,
  template: JourneyTemplate
): boolean {
  return (
    clearance !== null && clearanceReaches(clearance, template.visibilityTier)
  )
}

/**
 * What a reader below the tier is told.
 *
 * §3 rule 3 applies here as much as to a note: care is happening and the reader
 * can see that it is, without seeing the situation or what was said.
 */
export const JOURNEY_WITHHELD_DISCLOSURE =
  'A care journey is running here, at a tier above yours. You can see that someone is being cared for, not what for.'

/** Journeys needing attention now, soonest first. Derived, never a stored list. */
export function overdueJourneys(
  entries: readonly { template: JourneyTemplate; instance: JourneyInstance }[],
  asOf: Date
): {
  template: JourneyTemplate
  instance: JourneyInstance
  progress: JourneyProgress
}[] {
  return entries
    .map((entry) => ({
      ...entry,
      progress: journeyProgress(entry.template, entry.instance, asOf),
    }))
    .filter((entry) => entry.progress.isOverdue)
    .sort((a, b) => b.progress.daysOverdue - a.progress.daysOverdue)
}

/* ──────────────────── Recording that a step happened ──────────────────── */

export type StepAttempt =
  | {
      ok: true
      /** What to write. `outcome` and `skipReason` are never both present. */
      completion:
        | { kind: 'done'; stepId: string; outcome: string }
        | { kind: 'skipped'; stepId: string; skipReason: string }
      /** Said back to the person, naming what happens next. */
      note: string
    }
  | { ok: false; refusal: string }

/**
 * Complete or skip a step.
 *
 * Two rules, both of which exist because the alternative corrupts the arithmetic
 * everything else depends on.
 *
 * **Steps are recorded in order.** `journeyProgress` finds the current step as the
 * first one with no completion, so writing step three while step two is open would
 * leave step two permanently current — the journey would sit there reading "Step 2
 * of 4, overdue" forever while somebody had in fact done step three. The refusal
 * names the step that is actually waiting.
 *
 * **Skipping needs a reason and completing needs an outcome.** A skipped step with
 * no reason is indistinguishable from a step nobody got to, which is exactly the
 * §8.8 distinction the pathway makes for absent fields. And "done" with nothing
 * written is a tick: the point of a care journey is the record of what was said,
 * not that a box was checked.
 */
export function recordStep(input: {
  template: JourneyTemplate
  instance: JourneyInstance
  stepId: string
  kind: 'done' | 'skipped'
  detail: string
}): StepAttempt {
  if (input.instance.closedAt !== null) {
    return {
      ok: false,
      refusal:
        'This journey was closed early. Reopen it before recording anything else against it.',
    }
  }

  const step = input.template.steps.find((s) => s.id === input.stepId)
  if (!step) {
    return { ok: false, refusal: 'That step is not part of this journey.' }
  }

  const alreadyDone = input.instance.completions.some(
    (completion) => completion.stepId === input.stepId
  )
  if (alreadyDone) {
    // §8.5: an action that reports success must have done something.
    return {
      ok: false,
      refusal: `“${step.title}” is already recorded. Nothing to do.`,
    }
  }

  const finished = new Set(
    input.instance.completions.map((completion) => completion.stepId)
  )
  const waiting = input.template.steps.find((s) => !finished.has(s.id))
  if (waiting && waiting.id !== input.stepId) {
    return {
      ok: false,
      refusal: `“${waiting.title}” is the step that is waiting. Record that one first, or skip it with a reason — otherwise it stays open and this journey reads as overdue forever.`,
    }
  }

  const detail = input.detail.trim()
  if (detail === '') {
    return {
      ok: false,
      refusal:
        input.kind === 'done'
          ? 'Say what happened. The record of the conversation is the point; a tick is not.'
          : 'Say why it is being skipped. A skipped step with no reason cannot be told apart from one nobody got to.',
    }
  }

  // Whether this was the last step, which changes what to say next.
  const remaining = input.template.steps.filter(
    (s) => !finished.has(s.id) && s.id !== input.stepId
  )
  const next = remaining[0]

  return {
    ok: true,
    completion:
      input.kind === 'done'
        ? { kind: 'done', stepId: input.stepId, outcome: detail }
        : { kind: 'skipped', stepId: input.stepId, skipReason: detail },
    note: next
      ? `Recorded. Next is “${next.title}”, due ${WINDOW_LABELS[next.window].toLowerCase()}.`
      : // The stopping rule, reached. §8: a journey's last step is where follow-up
        // ends visibly rather than by being forgotten.
        'Recorded, and that was the last step. Follow-up on this journey ends here rather than being forgotten.',
  }
}

/* ───────────────────────── Starting and closing ───────────────────────── */

export type StartAttempt =
  { ok: true; note: string } | { ok: false; refusal: string }

/**
 * Whether a journey can be started on this person.
 *
 * Refuses a second live instance of the same template. Two Grief journeys running
 * on one person means two due dates for the same call, and whichever one somebody
 * clears the other keeps reading overdue.
 */
export function canStartJourney(input: {
  template: JourneyTemplate
  personName: string
  /** Template ids already running on this person, not yet closed or finished. */
  liveTemplateIds: readonly string[]
}): StartAttempt {
  if (input.template.steps.length === 0) {
    return {
      ok: false,
      refusal: `“${input.template.name}” has no steps, so starting it would ask nobody to do anything. Give it steps first.`,
    }
  }
  if (input.liveTemplateIds.includes(input.template.id)) {
    return {
      ok: false,
      refusal: `${input.personName} already has ${input.template.name} running. Two of the same journey means two due dates for the same call.`,
    }
  }

  const first = input.template.steps[0]!
  return {
    ok: true,
    note: `${input.template.name} started for ${input.personName}. First step is “${first.title}”, due ${WINDOW_LABELS[first.window].toLowerCase()}.`,
  }
}

export type CloseAttempt =
  { ok: true; reason: string } | { ok: false; refusal: string }

/**
 * End a journey before its steps are done.
 *
 * The reason is required and kept. A journey abandoned without one leaves the next
 * person unable to tell whether care finished, was declined, or was dropped — and
 * those are three very different things to read a year later.
 */
export function closeJourneyEarly(reason: string): CloseAttempt {
  const trimmed = reason.trim()
  if (trimmed === '') {
    return {
      ok: false,
      refusal:
        'Say why it is ending early. Otherwise nobody can tell later whether care finished, was declined, or was simply dropped.',
    }
  }
  return { ok: true, reason: trimmed }
}
