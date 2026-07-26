/**
 * Pathway lifecycle — HANDOFF.md §4.
 *
 * The rule that shapes this whole module: **state changes only through actions,
 * never by selecting a state.** The prototype originally let a user click a
 * state chip directly, which meant clicking "Archived" asserted that a live
 * pathway was archived. So there is no state setter exported from here. The only
 * way to reach a new state is `attemptTransition`, which answers with a refusal
 * when the move is not legal, not permitted, or would do nothing.
 */

import { type Permission, type Principal, permissionCheck } from './roles'

/* ────────────────────────────── States ────────────────────────────── */

export const PATHWAY_STATES = [
  'discovery',
  'draft',
  'internal_review',
  'changes_requested',
  'approved',
  'scheduled',
  'active',
  'archived',
] as const

export type PathwayState = (typeof PATHWAY_STATES)[number]

export function isPathwayState(value: unknown): value is PathwayState {
  return (
    typeof value === 'string' &&
    (PATHWAY_STATES as readonly string[]).includes(value)
  )
}

/** Only one version is `active` per church; previous ones are readable. */
export function isReadableState(state: PathwayState): boolean {
  return state === 'active' || state === 'archived'
}

/* ────────────────────────────── Actions ────────────────────────────── */

export const PATHWAY_ACTIONS = [
  'begin_draft',
  'submit_for_review',
  'request_changes',
  'approve',
  'schedule',
  'publish',
  'edit_stage',
] as const

export type PathwayAction = (typeof PATHWAY_ACTIONS)[number]

/**
 * Note what is absent: there is no `archive` action.
 *
 * Archiving is a *consequence* of publishing — the version that was active
 * becomes archived because a new one took its place (§4: "Only one version is
 * `active` per church. Previous versions are `archived`"). Offering it as an
 * action is what let the prototype claim a live pathway was archived, so the
 * only way a version becomes archived is `publish` returning it as a side
 * effect. See `TransitionSuccess.archives`.
 */

type TransitionRule = {
  from: readonly PathwayState[]
  to: PathwayState
  permission: Permission
  /** Present when the handoff's §4 table does not specify this transition. */
  inferred?: string
}

/**
 * The legal transitions, transcribed from §4's table.
 *
 * Three entries are marked `inferred`, because §4 lists `discovery` and
 * `scheduled` among the states but gives no transition that reaches either.
 * Rather than silently invent policy, they are implemented the obvious way and
 * flagged — the same instinct as the handoff's `provenance` field, where an
 * inference must never be mistaken for a confirmed rule.
 */
const TRANSITIONS: Record<PathwayAction, TransitionRule> = {
  begin_draft: {
    from: ['discovery'],
    to: 'draft',
    permission: 'pathway.edit',
    inferred:
      '§4 lists `discovery` as a state but gives no transition out of it. Assumed: finishing discovery opens a draft.',
  },
  submit_for_review: {
    from: ['draft'],
    to: 'internal_review',
    permission: 'pathway.submit_for_review',
  },
  request_changes: {
    from: ['internal_review', 'approved'],
    to: 'changes_requested',
    permission: 'pathway.request_changes',
  },
  approve: {
    from: ['internal_review', 'changes_requested'],
    to: 'approved',
    permission: 'pathway.approve',
  },
  schedule: {
    from: ['approved'],
    to: 'scheduled',
    permission: 'pathway.publish',
    inferred:
      '§4 lists `scheduled` as a state but gives no transition to it. Assumed: an approver may set a future date. Publishing still requires the same gate, including a recorded approval.',
  },
  publish: {
    from: ['approved', 'scheduled'],
    to: 'active',
    permission: 'pathway.publish',
    inferred:
      '§4 gives publish as approved → active. `scheduled` is included as a source, but going live still requires a recorded approval — see the `not_approved` blocker in ./pathway-publish. Confirmed by the lead pastor on 2026-07-26.',
  },
  edit_stage: {
    from: ['active', 'archived'],
    to: 'draft',
    permission: 'pathway.edit',
  },
}

/** The rule for an action, for callers that want to explain it. */
export function transitionRule(action: PathwayAction): {
  from: readonly PathwayState[]
  to: PathwayState
  permission: Permission
  inferred: string | null
} {
  const rule = TRANSITIONS[action]
  if (!rule) throw new Error(`Unknown pathway action: ${String(action)}`)
  return { ...rule, inferred: rule.inferred ?? null }
}

export const ACTION_LABELS: Record<PathwayAction, string> = {
  begin_draft: 'Begin draft',
  submit_for_review: 'Submit for review',
  request_changes: 'Request changes',
  approve: 'Approve',
  schedule: 'Schedule',
  publish: 'Publish',
  edit_stage: 'Edit a stage',
}

/* ─────────────────────────── Migration choice ─────────────────────────── */

/**
 * §4: when publishing, the administrator must choose explicitly. There is no
 * default, and **existing participants are never migrated automatically** —
 * which is why `MigrationChoice | null` is the type everywhere and `null`
 * blocks publishing rather than falling through to a sensible-looking option.
 */
export const MIGRATION_CHOICES = [
  'existing_stay',
  'only_new_enter',
  'migrate_everyone',
  'decide_person_by_person',
] as const

export type MigrationChoice = (typeof MIGRATION_CHOICES)[number]

export const MIGRATION_CHOICE_LABELS: Record<MigrationChoice, string> = {
  existing_stay: 'Existing people stay on the previous version',
  only_new_enter:
    'Only new people enter the new version; the previous one is archived read-only',
  migrate_everyone: 'Migrate everyone in flight',
  decide_person_by_person: 'Decide person by person, generating a review list',
}

/** The choice that produces a per-person review list rather than acting at once. */
export function requiresReviewList(choice: MigrationChoice): boolean {
  return choice === 'decide_person_by_person'
}

/* ───────────────────────────── Transitions ───────────────────────────── */

/**
 * Recorded for every transition: the acting **person** and a timestamp.
 * Not a role string — a role cannot be held accountable (§4).
 */
export type TransitionRecord = {
  action: PathwayAction
  from: PathwayState
  to: PathwayState
  actorId: string
  occurredAt: Date
  /** Free-text detail, e.g. the change summary on a publish. */
  detail: string | null
}

export type RefusalCode =
  'not_permitted' | 'illegal_from_state' | 'blocked' | 'nothing_to_do'

export type TransitionRefusal = {
  code: RefusalCode
  /** Said plainly, in the church's terms. Never a bare "forbidden". */
  message: string
}

export type TransitionSuccess = {
  ok: true
  record: TransitionRecord
  /**
   * Versions this action archives as a consequence. Publishing archives
   * whatever was active, because only one version is active at a time. Callers
   * must persist these alongside the transition, not instead of it.
   */
  archives: readonly string[]
}

export type TransitionResult =
  TransitionSuccess | { ok: false; refusal: TransitionRefusal }

export type TransitionContext = {
  /** The version being acted on. */
  versionId: string
  currentState: PathwayState
  at: Date
  detail?: string | null
  /**
   * Blockers computed from live data — see `./pathway-publish`. Passed in
   * rather than recomputed here so that this module stays free of health
   * findings and review records, and so a caller cannot accidentally publish by
   * omitting the check: an empty array must be a positive assertion that the
   * gate was evaluated, which is why `publish` requires the field to be present.
   */
  publishBlockers?: readonly { reason: string }[]
  /** The id of the currently active version, if any. */
  activeVersionId?: string | null
}

/**
 * The only way to change a pathway's state.
 *
 * Checks in a deliberate order: legality of the move, then permission, then
 * whether it would actually do anything (§8.5 — an action that reports success
 * must have done something).
 */
export function attemptTransition(
  principal: Principal,
  action: PathwayAction,
  context: TransitionContext
): TransitionResult {
  const rule = TRANSITIONS[action]
  if (!rule) throw new Error(`Unknown pathway action: ${String(action)}`)

  // Already there? Say so plainly rather than reporting a successful no-op.
  if (context.currentState === rule.to) {
    return {
      ok: false,
      refusal: {
        code: 'nothing_to_do',
        message: `This pathway is already ${describeState(rule.to)}. Nothing to do.`,
      },
    }
  }

  if (!rule.from.includes(context.currentState)) {
    return {
      ok: false,
      refusal: {
        code: 'illegal_from_state',
        message: `${ACTION_LABELS[action]} is not available from ${describeState(
          context.currentState
        )}. It applies to ${rule.from.map(describeState).join(' or ')}.`,
      },
    }
  }

  const permission = permissionCheck(principal, rule.permission)
  if (!permission.allowed) {
    // The refusal message is the permission's own note, so the explanation a
    // user sees here cannot drift from the one the gate used (§8.3).
    return {
      ok: false,
      refusal: { code: 'not_permitted', message: permission.note },
    }
  }

  if (action === 'publish') {
    if (context.publishBlockers === undefined) {
      // Not a refusal a user should ever see: it means a caller tried to
      // publish without evaluating the gate at all.
      throw new Error(
        'Publishing requires publishBlockers to be supplied, even when empty. See pathway-publish.'
      )
    }
    if (context.publishBlockers.length > 0) {
      return {
        ok: false,
        refusal: {
          code: 'blocked',
          message: blockedMessage(context.publishBlockers),
        },
      }
    }
  }

  return {
    ok: true,
    record: {
      action,
      from: context.currentState,
      to: rule.to,
      actorId: principal.personId,
      occurredAt: context.at,
      detail: context.detail ?? null,
    },
    // Publishing displaces whatever was active. Archiving is never chosen.
    archives:
      action === 'publish' &&
      context.activeVersionId &&
      context.activeVersionId !== context.versionId
        ? [context.activeVersionId]
        : [],
  }
}

function blockedMessage(blockers: readonly { reason: string }[]): string {
  const count = blockers.length
  // Pluralised from the count, not written twice (§8.1).
  const lead =
    count === 1
      ? 'One thing is unresolved before this can be published:'
      : `${count} things are unresolved before this can be published:`
  return `${lead} ${blockers.map((blocker) => blocker.reason).join('; ')}`
}

const STATE_DESCRIPTIONS: Record<PathwayState, string> = {
  discovery: 'in discovery',
  draft: 'a draft',
  internal_review: 'in internal review',
  changes_requested: 'holding changes requested',
  approved: 'approved',
  scheduled: 'scheduled',
  active: 'the active pathway',
  archived: 'archived',
}

export function describeState(state: PathwayState): string {
  return STATE_DESCRIPTIONS[state]
}

/**
 * Which actions to offer this principal right now, each with the note that
 * explains it.
 *
 * Every entry comes from the same `attemptTransition` the button will call, so
 * a control cannot be offered that the action would then refuse — §8.3 and
 * §8.4. `available: false` entries carry the reason, so a UI can either hide
 * them or show them disabled *with* the explanation, but never disabled without
 * one.
 */
export function availableActions(
  principal: Principal,
  context: TransitionContext
): {
  action: PathwayAction
  label: string
  available: boolean
  reason: string | null
}[] {
  return PATHWAY_ACTIONS.map((action) => {
    // Publishing needs the gate; when a caller has not supplied it, report the
    // action as unavailable rather than throwing from a listing function.
    const canEvaluate =
      action !== 'publish' || context.publishBlockers !== undefined
    const result = canEvaluate
      ? attemptTransition(principal, action, context)
      : ({
          ok: false,
          refusal: {
            code: 'blocked' as RefusalCode,
            message: 'The publish gate has not been evaluated yet.',
          },
        } satisfies TransitionResult)

    return {
      action,
      label: ACTION_LABELS[action],
      available: result.ok,
      reason: result.ok ? null : result.refusal.message,
    }
  })
}
