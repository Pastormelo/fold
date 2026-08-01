/**
 * Opening, carrying and sealing a restoration case — HANDOFF.md §3.
 *
 * The most consequential records this application holds. Four rules, and each one
 * exists because the alternative has hurt a real church.
 *
 * **Two elders, never one.** §3 rule 5. It protects the person as much as the
 * church: one elder alone has no witness to what was said, and neither does the
 * person being restored. A check constraint already refuses two identical ids;
 * what the constraint cannot do is explain why, so that is here.
 *
 * **A case is closed and sealed, never deleted.** §3 rule 4. Somebody will ask
 * about this in five years, and "we deleted it" is not an answer a church can
 * give. Sealing keeps the fact and the outcome readable while the contents stop
 * being open.
 *
 * **The disclosure circle is recorded, including who deliberately does not know.**
 * §8.8's distinction applied to people: "her small group has not been told" is a
 * decision the elders made, and it needs to be as visible as the people who were
 * told, or somebody will tell them by accident.
 *
 * **Every note on a case is elders-only.** Enforced by a check constraint too,
 * because a restoration note filed at a lower tier would be readable by staff
 * through the ordinary tier comparison — which is the one leak that would make §3
 * decorative.
 */

import { type Principal, can } from './roles'

/* ─────────────────────────── Who may be named ─────────────────────────── */

/**
 * Whether this person can be named as one of the two elders on a case.
 *
 * `restoration.be_assigned`, which only `pastor_elder` and `lead_pastor` hold.
 * Deliberately not the same question as whether somebody can *read* a case: an
 * elder reads every case whether named on it or not, and being named is about
 * who is doing the work rather than who has access.
 */
export function canCarryCase(principal: Principal): boolean {
  return can(principal, 'restoration.be_assigned')
}

export type ElderPairAttempt =
  | { ok: true; leadElderId: string; secondElderId: string }
  | { ok: false; refusal: string }

/**
 * The two elders on a case.
 *
 * Order matters only for display — the lead elder is the one who reports on it —
 * and both carry it equally as far as the rules are concerned.
 */
export function pairElders(input: {
  leadElderId: string
  secondElderId: string
  lead: { principal: Principal; fullName: string } | null
  second: { principal: Principal; fullName: string } | null
}): ElderPairAttempt {
  if (input.leadElderId === '' || input.secondElderId === '') {
    return {
      ok: false,
      refusal:
        'A restoration case needs two elders. Never one — one elder alone has no witness to what was said, and neither does the person being restored.',
    }
  }
  if (input.leadElderId === input.secondElderId) {
    return {
      ok: false,
      refusal:
        'Those are the same person. The rule is two elders present, so it has to be two different people.',
    }
  }
  if (input.lead === null || input.second === null) {
    return { ok: false, refusal: 'One of those people is not in this church.' }
  }

  for (const candidate of [input.lead, input.second]) {
    if (!canCarryCase(candidate.principal)) {
      return {
        ok: false,
        refusal: `${candidate.fullName} cannot be named on a restoration case. Only an elder or the lead pastor can carry one.`,
      }
    }
  }

  return {
    ok: true,
    leadElderId: input.leadElderId,
    secondElderId: input.secondElderId,
  }
}

/* ──────────────────────────── Opening a case ──────────────────────────── */

export type CaseDraft = {
  stepLabel: string
  status: string
  plan: readonly string[]
  knows: readonly string[]
  doesNotKnow: readonly string[]
  decisionQuestion: string | null
}

export type OpenAttempt =
  { ok: true; draft: CaseDraft; note: string } | { ok: false; refusal: string }

/** One entry per line, blanks dropped rather than stored as empty items. */
export function linesOf(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

/**
 * Open a case.
 *
 * `stepLabel` is required and free text rather than an enum, because what the
 * stages of restoration are called is a matter of the church's own practice and
 * §3 does not fix them. `status` is the same.
 *
 * The disclosure circle is not required at the moment of opening — the elders may
 * not have decided yet, and forcing a guess would put a name in a list that
 * nobody agreed to.
 */
export function openCase(input: {
  personName: string
  stepLabel: string
  status: string
  plan: string
  knows: string
  doesNotKnow: string
  decisionQuestion: string
  /** Whether this person already has an open case. */
  alreadyOpen: boolean
}): OpenAttempt {
  if (input.alreadyOpen) {
    return {
      ok: false,
      refusal: `${input.personName} already has an open restoration case. Two cases on one person means two sets of elders and two accounts of the same situation.`,
    }
  }

  const stepLabel = input.stepLabel.trim()
  if (stepLabel === '') {
    return {
      ok: false,
      refusal:
        'Say where this is up to. Your church names the stages of restoration, so this is free text rather than a list Fold chose.',
    }
  }

  const status = input.status.trim()
  if (status === '') {
    return { ok: false, refusal: 'Say what the current state of it is.' }
  }

  const decisionQuestion = input.decisionQuestion.trim()

  return {
    ok: true,
    draft: {
      stepLabel,
      status,
      plan: linesOf(input.plan),
      knows: linesOf(input.knows),
      doesNotKnow: linesOf(input.doesNotKnow),
      decisionQuestion: decisionQuestion === '' ? null : decisionQuestion,
    },
    note: `Opened for ${input.personName}, at elders-only visibility. Every note on it is elders-only too, and that is not a setting.`,
  }
}

/* ─────────────────────────── Sealing on close ─────────────────────────── */

export type SealAttempt =
  { ok: true; outcome: string; note: string } | { ok: false; refusal: string }

/**
 * Close a case, which seals it.
 *
 * The outcome is required, and it is the one part of a sealed case that stays
 * readable to somebody below the tier — §3's shape, because "there was a
 * restoration process and it ended in reconciliation" is a thing a church can say
 * without opening the contents.
 *
 * There is no delete anywhere in this module, and no reopen either. A situation
 * that starts again is a new case with its own two elders and its own record: the
 * alternative is one row accumulating two separate processes, which is unreadable
 * later and hides that it happened twice.
 */
export function sealCase(input: {
  personName: string
  outcome: string
  alreadyClosed: boolean
}): SealAttempt {
  if (input.alreadyClosed) {
    return { ok: false, refusal: 'That case is already closed and sealed.' }
  }

  const outcome = input.outcome.trim()
  if (outcome === '') {
    return {
      ok: false,
      refusal:
        'Say how it ended. The outcome is the one part of a sealed case that stays readable to people below the tier, so it is the whole of what the church can say about it afterwards.',
    }
  }

  return {
    ok: true,
    outcome,
    note: `Closed and sealed. The contents stop being open; that it happened and how it ended stay readable. Nothing is deleted — somebody will ask about this in five years.`,
  }
}

/**
 * Moving a case along.
 *
 * Both fields together, because a step with a stale status is worse than either
 * alone — it reads as current when it is not.
 */
export type AdvanceAttempt =
  | { ok: true; step: number; stepLabel: string; status: string }
  | { ok: false; refusal: string }

export function advanceCase(input: {
  currentStep: number
  stepLabel: string
  status: string
  closed: boolean
}): AdvanceAttempt {
  if (input.closed) {
    return {
      ok: false,
      refusal:
        'That case is sealed. A situation that has started again is a new case with its own two elders, not an edit to this one.',
    }
  }

  const stepLabel = input.stepLabel.trim()
  const status = input.status.trim()
  if (stepLabel === '' || status === '') {
    return {
      ok: false,
      refusal:
        'Both the step and the state of it are needed. A step with a stale status reads as current when it is not.',
    }
  }

  return {
    ok: true,
    step: input.currentStep + 1,
    stepLabel,
    status,
  }
}
