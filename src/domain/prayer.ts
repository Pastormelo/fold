/**
 * Prayer requests — HANDOFF.md §2.
 *
 * Small module, two rules in it that matter.
 *
 * **An answered request is kept, not deleted.** The design's own caption says
 * "kept, not deleted", and it is the point: a church that clears its answered
 * prayers loses the only record it has that God did anything. So there is no
 * delete in this module, and `answer` is a state with an outcome attached.
 *
 * **"I prayed" is a count, and it is capped.** The prototype capped one person's
 * tally at a hundred with the note "One hundred is the cap. Go talk to them." That
 * line is doing real work — past some number, clicking a button is a substitute for
 * picking up the phone, and the app should say so rather than counting to infinity.
 */

import type { ConfidentialityTier } from './tiers'

/** Past this, the app stops counting and says something more useful. */
export const PRAYED_CAP = 100

export const PRAYED_CAP_NOTE = 'One hundred is the cap. Go talk to them.'

export type PrayerRequestRecord = {
  id: string
  personId: string
  personName: string
  /** Who brought it. Often the person, sometimes their leader. */
  askedByName: string
  body: string
  visibilityTier: ConfidentialityTier
  askedAt: Date
  /** Set together with `outcome`, or neither. Answered is a state, not a delete. */
  answeredAt: Date | null
  outcome: string | null
}

export type PrayerStanding = 'open' | 'answered'

export function standingOf(request: PrayerRequestRecord): PrayerStanding {
  return request.answeredAt === null ? 'open' : 'answered'
}

/* ─────────────────────────────── Praying ─────────────────────────────── */

export type PrayedTally = {
  /** How many people have prayed. */
  people: number
  /** How many times this viewer has. */
  mine: number
}

export type PrayedResult =
  { ok: true; mine: number } | { ok: false; refusal: string }

/**
 * Record one more prayer from this viewer.
 *
 * Refuses at the cap rather than silently ignoring the click. A button that
 * appears to work and does nothing is the §8.5 failure in miniature, and here the
 * refusal is the more useful message anyway.
 */
export function prayOnceMore(tally: PrayedTally): PrayedResult {
  if (tally.mine >= PRAYED_CAP) {
    return { ok: false, refusal: PRAYED_CAP_NOTE }
  }
  return { ok: true, mine: tally.mine + 1 }
}

/**
 * "9 have prayed, including you".
 *
 * Whether the viewer is included is read off their own count, so the sentence
 * cannot claim they prayed when they have not (§8.2).
 */
export function describeTally(tally: PrayedTally): string {
  if (tally.people === 0) return 'Nobody has prayed yet'

  const people = `${tally.people} ${tally.people === 1 ? 'person has' : 'have'} prayed`
  if (tally.mine === 0) return people
  if (tally.mine === 1) return `${people}, including you`
  return `${people}, including you ${tally.mine} times`
}

/* ──────────────────────────── Answering ──────────────────────────── */

export type AnswerAttempt =
  { ok: true; outcome: string } | { ok: false; refusal: string }

/**
 * Mark a request answered, with what happened.
 *
 * The outcome is required. "Answered" with nothing written down is a checkbox; the
 * thing worth keeping is the sentence saying what happened, and in a year that
 * sentence is the entire value of the record.
 */
export function answerRequest(outcome: string): AnswerAttempt {
  const trimmed = outcome.trim()
  if (trimmed === '') {
    return {
      ok: false,
      refusal:
        'Say what happened. An answered request with nothing written down is a checkbox, and the sentence is the part worth keeping.',
    }
  }
  return { ok: true, outcome: trimmed }
}

/**
 * Reopening.
 *
 * Allowed, because "answered" is sometimes premature and a church should be able
 * to say so. The outcome is kept rather than cleared — the record of what was
 * believed at the time is part of the history.
 */
export const REOPEN_NOTE =
  'Reopened. What was recorded before is kept, because it is part of the history rather than a mistake to erase.'
