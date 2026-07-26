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
  HIGHEST_TIER,
  TIER_ORDER,
  clearanceReaches,
  tierName,
} from './tiers'
import { type Principal, clearanceFor, hasUnrestrictedRole } from './roles'

/* ───────────────────────────── The viewer ───────────────────────────── */

/**
 * Who is asking. `personId` matters: restoration access is by case
 * assignment, and a case names people, not roles (§3 rule 2, §4 attribution).
 *
 * A `Principal`, so any individual grants an administrator has made travel with
 * the viewer into every decision below. Nothing here reads roles directly.
 */
export type Viewer = Principal & {
  displayName: string
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

export type WithheldReason = 'above_your_tier' | 'restoration_case_not_carried'

/**
 * Why a reader is allowed to see case-scoped content.
 *
 * `named_on_case` is §3 rule 2's path. `office` is the lead pastor, who by
 * decision of the lead pastor on 2026-07-26 reads every restoration case whether
 * or not they are named on it.
 *
 * Recorded rather than collapsed into a single "allowed", so the reason someone
 * could read a case is available to an audit trail rather than reconstructed
 * later. Nothing in the UI currently displays it.
 */
export type AccessBasis = 'named_on_case' | 'office'

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
      /**
       * How a case-scoped note was reached. `null` for ordinary care, which is
       * governed by clearance alone.
       */
      basis: AccessBasis | null
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
  restoration_case_not_carried:
    'This note belongs to a restoration case you do not carry. You can see that care happened, not what was said.',
}

/**
 * Decide one note.
 *
 * Case-scoped notes are reached two ways: by being named on the case (§3 rule 2)
 * or by the lead pastor's office. Everything else — a granted `elders_only`
 * clearance, an administrator, any other elder — is refused, so raising someone's
 * clearance does not reach case content.
 *
 * Clearance is checked as well as the case, not instead of it, so office is
 * additional to the tier rather than a substitute for it.
 */
export function viewCareNote(
  viewer: Viewer,
  note: CareNoteRecord,
  /** Case ids this viewer is named on. Empty for most readers. */
  carriedCaseIds: readonly string[] = []
): CareNoteView {
  const withhold = (reason: WithheldReason): CareNoteView => ({
    access: 'withheld',
    id: note.id,
    occurredAt: note.occurredAt,
    visibilityTier: note.visibilityTier,
    reason,
    disclosure: WITHHELD_DISCLOSURES[reason],
  })

  let basis: AccessBasis | null = null
  if (note.restorationCaseId !== null) {
    if (carriedCaseIds.includes(note.restorationCaseId)) {
      basis = 'named_on_case'
    } else if (hasUnrestrictedRole(viewer)) {
      basis = 'office'
    } else {
      return withhold('restoration_case_not_carried')
    }
  }

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
    basis,
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
  notes: readonly CareNoteRecord[],
  carriedCaseIds: readonly string[] = []
): CareTimeline {
  const views = notes.map((note) => viewCareNote(viewer, note, carriedCaseIds))
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
  /** The two elders carrying the case. Access is by this list, not by role. */
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
      access: 'carried'
      /** `office` when the reader is the lead pastor and not named on the case. */
      basis: AccessBasis
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

/**
 * Ported verbatim from the prototype's `sealNote`.
 *
 * Note the last clause. It is the whole point of §3 rule 2, and it is why this
 * function takes a viewer's person id and not their role list.
 */
export const SEALED_CASE_DISCLOSURE =
  'This case is closed and sealed. You can see that it existed and how it ended, never what was said inside it. That holds even for elders who were not named on it.'

export const OPEN_CASE_WITHHELD_DISCLOSURE =
  'This is an open case you do not carry. You can see that it exists, never what was said inside it. Access is by case, not by title.'

/** Whether this viewer is one of the two elders named on the case. */
export function carriesCase(
  viewer: Viewer,
  restorationCase: RestorationCaseRecord
): boolean {
  return (
    viewer.personId === restorationCase.leadElderId ||
    viewer.personId === restorationCase.secondElderId
  )
}

export function viewRestorationCase(
  viewer: Viewer,
  restorationCase: RestorationCaseRecord
): RestorationCaseView {
  const sealed = restorationCase.closedAt !== null
  const named = carriesCase(viewer, restorationCase)
  const byOffice = !named && hasUnrestrictedRole(viewer)

  // Office access still requires the clearance the content sits behind. The
  // lead pastor holds `elders_only`, so this passes; it is checked rather than
  // assumed so that office alone can never substitute for tier.
  const clearance = viewerClearance(viewer)
  const reachesTier =
    clearance !== null && clearanceReaches(clearance, HIGHEST_TIER)

  if (!named && !(byOffice && reachesTier)) {
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
    access: 'carried',
    basis: named ? 'named_on_case' : 'office',
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

/** Case ids this viewer carries, for passing to `viewCareNote`. */
export function carriedCaseIds(
  viewer: Viewer,
  cases: readonly RestorationCaseRecord[]
): string[] {
  return cases
    .filter((restorationCase) => carriesCase(viewer, restorationCase))
    .map((restorationCase) => restorationCase.id)
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
