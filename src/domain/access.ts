/**
 * Access decisions and redaction — HANDOFF.md §3.
 *
 * Pure functions. They take records and a viewer and return what that viewer
 * is allowed to see, already shaped for rendering. No I/O and no database, so
 * the rules can be tested without a server.
 *
 * The governing sentence is §3 rule 3: a blocked reader sees that care
 * happened, never what was said — never a blank space and never a lie. So
 * there is no `body: null` in a visible shape. Withheld content is a different
 * variant of the type, and it carries an honest sentence explaining the
 * refusal.
 */

import {
  type ConfidentialityTier,
  TIER_ORDER,
  clearanceReaches,
  tierName,
} from './tiers'
import { type Principal, clearanceFor } from './roles'

/* ───────────────────────────── The viewer ───────────────────────────── */

/**
 * Who is asking.
 *
 * A `Principal`, so any individual grants an administrator has made travel with
 * the viewer into every decision below. Nothing here reads roles directly — it
 * asks for the resolved clearance and compares tiers.
 */
export type Viewer = Principal & {
  displayName: string
  /**
   * Which church this person belongs to.
   *
   * Carried on the viewer rather than looked up per query, so every read is
   * scoped by construction. A query that forgets it would return another
   * church's people, and in an application about confidentiality that is the
   * worst class of bug available — so the value travels with the identity.
   */
  churchId: string
}

/**
 * The viewer's resolved clearance — role default raised by any granted tier.
 * `null` means no pastoral care access.
 */
export function viewerClearance(viewer: Viewer): ConfidentialityTier | null {
  return clearanceFor(viewer)
}

/* ────────────────────────────── Care notes ────────────────────────────── */

/**
 * A care note as stored. `visibilityTier` is fixed when the note is written
 * (§3 rule 1) — nothing in this module accepts a tier from the reader.
 */
export type CareNoteRecord = {
  id: string
  personId: string
  authorId: string
  authorName: string
  occurredAt: Date
  /** Set at write time. Never renegotiated at read time. */
  visibilityTier: ConfidentialityTier
  body: string
  /** Present when the note belongs to a restoration case. */
  restorationCaseId: string | null
}

export type WithheldReason = 'above_your_tier'

/**
 * What a reader gets for one note. A discriminated union so that a `visible`
 * shape has no nullable body and a `withheld` shape has no body field at all —
 * the type system, not reviewer discipline, keeps content out of the wrong
 * variant.
 */
export type CareNoteView =
  | {
      access: 'visible'
      id: string
      occurredAt: Date
      authorName: string
      visibilityTier: ConfidentialityTier
      body: string
    }
  | {
      access: 'withheld'
      id: string
      occurredAt: Date
      visibilityTier: ConfidentialityTier
      reason: WithheldReason
      /** Honest sentence for this specific refusal. Never blank. */
      disclosure: string
    }

const WITHHELD_DISCLOSURES: Record<WithheldReason, string> = {
  above_your_tier:
    'This note is above your tier. You can see that care happened, not what was said.',
}

/**
 * Decide one note.
 *
 * One rule: does the reader's clearance reach the tier the note was written at.
 * Restoration notes sit at `elders_only`, so every elder reads them and nobody
 * below that tier does.
 */
export function viewCareNote(
  viewer: Viewer,
  note: CareNoteRecord
): CareNoteView {
  const withhold = (reason: WithheldReason): CareNoteView => ({
    access: 'withheld',
    id: note.id,
    occurredAt: note.occurredAt,
    visibilityTier: note.visibilityTier,
    reason,
    disclosure: WITHHELD_DISCLOSURES[reason],
  })

  const clearance = viewerClearance(viewer)
  if (clearance === null || !clearanceReaches(clearance, note.visibilityTier)) {
    return withhold('above_your_tier')
  }

  return {
    access: 'visible',
    id: note.id,
    occurredAt: note.occurredAt,
    authorName: note.authorName,
    visibilityTier: note.visibilityTier,
    body: note.body,
  }
}

/* ─────────────────────── A person's care timeline ─────────────────────── */

export type CareTimeline = {
  notes: readonly CareNoteView[]
  visibleCount: number
  hiddenCount: number
  /**
   * The prototype's `hiddenNote`, kept verbatim including its pluralisation.
   * Empty string when nothing is hidden — and derived from the actual count,
   * not a flag beside it (§8.1). The prototype once rendered a hardcoded
   * "Two findings" next to a live count of zero; this is that failure's fix.
   */
  hiddenNote: string
}

export function buildCareTimeline(
  viewer: Viewer,
  notes: readonly CareNoteRecord[]
): CareTimeline {
  const views = notes.map((note) => viewCareNote(viewer, note))
  const hidden = views.filter((view) => view.access === 'withheld')

  return {
    notes: views,
    visibleCount: views.length - hidden.length,
    hiddenCount: hidden.length,
    hiddenNote: hiddenNoteFor(hidden),
  }
}

/**
 * "1 note is above your tier (Elders only). You can see that care happened,
 * not what was said."
 *
 * Tier names are listed in scale order, deduplicated, so the sentence reads
 * the same way every time regardless of note ordering.
 */
function hiddenNoteFor(
  hidden: readonly Extract<CareNoteView, { access: 'withheld' }>[]
): string {
  if (hidden.length === 0) return ''

  const tiers = TIER_ORDER.filter((tier) =>
    hidden.some((view) => view.visibilityTier === tier)
  ).map(tierName)

  const verb = hidden.length === 1 ? ' is' : 's are'
  return `${hidden.length} note${verb} above your tier (${tiers.join(
    ', '
  )}). You can see that care happened, not what was said.`
}

/* ─────────────────────────── Restoration cases ─────────────────────────── */

/**
 * A restoration case. Two named elders, never one (§3 rule 5). Closed cases
 * are sealed, not deleted (§3 rule 4).
 */
export type RestorationCaseRecord = {
  id: string
  personId: string
  personName: string
  foldName: string
  openedAt: Date
  /** The two elders carrying the case. Recorded and displayed, not an access rule. */
  leadElderId: string
  secondElderId: string
  leadElderName: string
  secondElderName: string
  step: number
  stepLabel: string
  status: string
  closedAt: Date | null
  /** How it ended. Readable even by those who cannot read the case. */
  outcome: string | null
  plan: readonly string[]
  /** The disclosure circle: who knows, and who deliberately does not. */
  knows: readonly string[]
  doesNotKnow: readonly string[]
  decisionQuestion: string | null
}

export type RestorationCaseView =
  | {
      access: 'visible'
      id: string
      personName: string
      foldName: string
      openedAt: Date
      leadElderName: string
      secondElderName: string
      stepLabel: string
      status: string
      sealed: boolean
      outcome: string | null
      plan: readonly string[]
      knows: readonly string[]
      doesNotKnow: readonly string[]
      decisionQuestion: string | null
    }
  | {
      access: 'withheld'
      id: string
      /** What the case is, without saying who it is about. */
      kind: string
      stepLabel: string
      status: string
      sealed: boolean
      /** How it ended, which a blocked reader may see. */
      outcome: string | null
      disclosure: string
    }

export const SEALED_CASE_DISCLOSURE =
  'This case is closed and sealed. You can see that it existed and how it ended, never what was said inside it.'

export const OPEN_CASE_WITHHELD_DISCLOSURE =
  'This is an open restoration case. You can see that it exists, never what was said inside it.'

/**
 * Restoration cases are elder-tier content, and nothing more complicated than
 * that: an elder reads every case, and a reader below that tier reads none of
 * them. Who is *assigned* to a case is recorded on the case and shown to those
 * who can read it — it is not an access rule.
 */
export function viewRestorationCase(
  viewer: Viewer,
  restorationCase: RestorationCaseRecord
): RestorationCaseView {
  const sealed = restorationCase.closedAt !== null
  const clearance = viewerClearance(viewer)

  if (clearance === null || !clearanceReaches(clearance, 'elders_only')) {
    return {
      access: 'withheld',
      id: restorationCase.id,
      kind: sealed
        ? 'Closed case, retained for the record'
        : 'Open case, carried by two elders',
      stepLabel: restorationCase.stepLabel,
      status: restorationCase.status,
      sealed,
      outcome: restorationCase.outcome,
      disclosure: sealed
        ? SEALED_CASE_DISCLOSURE
        : OPEN_CASE_WITHHELD_DISCLOSURE,
    }
  }

  return {
    access: 'visible',
    id: restorationCase.id,
    personName: restorationCase.personName,
    foldName: restorationCase.foldName,
    openedAt: restorationCase.openedAt,
    leadElderName: restorationCase.leadElderName,
    secondElderName: restorationCase.secondElderName,
    stepLabel: restorationCase.stepLabel,
    status: restorationCase.status,
    sealed,
    outcome: restorationCase.outcome,
    plan: restorationCase.plan,
    knows: restorationCase.knows,
    doesNotKnow: restorationCase.doesNotKnow,
    decisionQuestion: restorationCase.decisionQuestion,
  }
}

/* ──────────────────────── Writing, not just reading ──────────────────────── */

/**
 * The tier a note may be written at.
 *
 * A writer cannot file a note above their own clearance — that would create a
 * record they could not then read, and §3 rule 6 says the person the note is
 * about knows what is written. Nor can the tier be changed afterwards
 * (§3 rule 1), which is why there is no `retier` function anywhere in this
 * codebase.
 */
export function canWriteAtTier(
  viewer: Viewer,
  tier: ConfidentialityTier
): boolean {
  const clearance = viewerClearance(viewer)
  return clearance !== null && clearanceReaches(clearance, tier)
}

export function writableTiers(viewer: Viewer): ConfidentialityTier[] {
  return TIER_ORDER.filter((tier) => canWriteAtTier(viewer, tier))
}

/**
 * Whether this reader reaches a tier at all, independent of any particular note.
 *
 * `viewCareNote` answers the question for a note that exists. A screen that says
 * "you read at these tiers" needs the answer without one — and computing it from
 * whether any visible note happens to sit at that tier gets it wrong for a tier
 * that is simply empty, which is how a reader ends up told they cannot read
 * something they can.
 *
 * Reading and writing use the same comparison, because §3 rule 1 fixes the tier
 * at write time: a writer who could file above their clearance would create a
 * record they could not then read.
 */
export function canReadTier(
  viewer: Viewer,
  tier: ConfidentialityTier
): boolean {
  const clearance = viewerClearance(viewer)
  return clearance !== null && clearanceReaches(clearance, tier)
}

export function readableTiers(viewer: Viewer): ConfidentialityTier[] {
  return TIER_ORDER.filter((tier) => canReadTier(viewer, tier))
}
