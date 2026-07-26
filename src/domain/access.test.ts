import { describe, expect, it } from 'vitest'

import {
  type CareNoteRecord,
  type RestorationCaseRecord,
  type Viewer,
  buildCareTimeline,
  carriedCaseIds,
  carriesCase,
  canWriteAtTier,
  viewCareNote,
  viewRestorationCase,
  writableTiers,
} from './access'
import type { ClearanceGrant, Role } from './roles'

/* ────────────────────────────── Fixtures ────────────────────────────── */

function viewer(
  personId: string,
  roles: Role[],
  displayName = personId
): Viewer {
  return { personId, displayName, roles }
}

/** A viewer whose clearance comes from an administrator's grant, not a role. */
function grantedViewer(
  personId: string,
  roles: Role[],
  tier: ClearanceGrant['tier'],
  displayName = personId
): Viewer {
  return {
    personId,
    displayName,
    roles,
    clearanceGrants: [
      {
        id: `cg-${personId}`,
        tier,
        grantedById: 'p-avery',
        grantedByName: 'Avery Nkemdirim',
        grantedAt: new Date('2026-07-20T00:00:00Z'),
        reason: 'Covering a vacancy.',
        revokedAt: null,
        revokedById: null,
      },
    ],
  }
}

const groupLeader = viewer('p-ben', ['group_leader'], 'Ben Ortiz')
const pastoralStaff = viewer('p-dean', ['pastoral_staff'], 'Dean Lowry')
/** Named on the case below. */
const carryingElder = viewer('p-marcus', ['pastor_elder'], 'Marcus Reid')
/** An elder with full clearance who is NOT named on the case. */
const otherElder = viewer('p-tomas', ['pastor_elder'], 'Tomás Iglesias')
const administrator = viewer('p-admin', ['administrator'], 'Admin')

function note(overrides: Partial<CareNoteRecord> = {}): CareNoteRecord {
  return {
    id: 'n1',
    personId: 'p-lena',
    authorId: 'p-dean',
    authorName: 'Dean Lowry',
    occurredAt: new Date('2026-06-03T10:00:00Z'),
    visibilityTier: 'all_leaders',
    body: 'Hospital visit, sat with the family for an hour.',
    restorationCaseId: null,
    ...overrides,
  }
}

const openCase: RestorationCaseRecord = {
  id: 'r1',
  personId: 'p-hollis',
  personName: 'Hollis Grant',
  foldName: 'Reid fold',
  openedAt: new Date('2026-05-12T00:00:00Z'),
  leadElderId: 'p-marcus',
  secondElderId: 'p-tanya',
  leadElderName: 'Marcus Reid',
  secondElderName: 'Tanya Jules',
  step: 3,
  stepLabel: 'Step 3 of 5 · Plan agreed',
  status: 'In progress',
  closedAt: null,
  outcome: null,
  plan: ['Counseling booked, church covering half.'],
  knows: ['Marcus Reid', 'Tanya Jules'],
  doesNotKnow: ['Small group', 'Serving team'],
  decisionQuestion:
    'Does he step back from serving while this is worked through?',
}

const closedCase: RestorationCaseRecord = {
  ...openCase,
  id: 'r2',
  personId: 'p-other',
  personName: 'Withheld in fixtures',
  step: 5,
  stepLabel: 'Step 5 of 5 · Restored',
  status: 'Restored',
  closedAt: new Date('2026-06-15T00:00:00Z'),
  outcome: 'Restored to full participation after five months.',
}

/* ──────────────────────────── Care notes ──────────────────────────── */

describe('reading a care note', () => {
  it('shows an ordinary note to a group leader', () => {
    const view = viewCareNote(groupLeader, note())
    expect(view.access).toBe('visible')
    if (view.access !== 'visible') throw new Error('unreachable')
    expect(view.body).toBe('Hospital visit, sat with the family for an hour.')
    expect(view.authorName).toBe('Dean Lowry')
  })

  it('withholds a staff-tier note from a group leader', () => {
    const view = viewCareNote(
      groupLeader,
      note({ visibilityTier: 'staff_and_elders' })
    )
    expect(view.access).toBe('withheld')
    if (view.access !== 'withheld') throw new Error('unreachable')
    expect(view.reason).toBe('above_your_tier')
  })

  it('shows a staff-tier note to pastoral staff', () => {
    const view = viewCareNote(
      pastoralStaff,
      note({ visibilityTier: 'staff_and_elders' })
    )
    expect(view.access).toBe('visible')
  })

  it('withholds every tier from an administrator', () => {
    for (const tier of [
      'all_leaders',
      'staff_and_elders',
      'elders_only',
    ] as const) {
      const view = viewCareNote(administrator, note({ visibilityTier: tier }))
      expect(view.access, tier).toBe('withheld')
    }
  })
})

describe('a blocked reader sees that care happened, never what was said', () => {
  // §3 rule 3: "never a blank space and never a lie."
  const view = viewCareNote(
    groupLeader,
    note({ visibilityTier: 'elders_only' })
  )

  it('carries no body at all, not an empty one', () => {
    expect(view).not.toHaveProperty('body')
    expect(JSON.stringify(view)).not.toContain('Hospital visit')
  })

  it('still shows that something happened, and when', () => {
    expect(view.occurredAt).toEqual(new Date('2026-06-03T10:00:00Z'))
  })

  it('gives an honest sentence rather than a blank', () => {
    if (view.access !== 'withheld') throw new Error('unreachable')
    expect(view.disclosure).toMatch(/care happened, not what was said/)
    expect(view.disclosure.trim()).not.toBe('')
  })

  it('does not name the author of a note it is withholding', () => {
    expect(view).not.toHaveProperty('authorName')
  })
})

describe('restoration notes: access is by case, not by title', () => {
  // §3 rule 2. This is the test that would have caught the design's own
  // hardest case.
  const restorationNote = note({
    id: 'n-restoration',
    visibilityTier: 'elders_only',
    restorationCaseId: 'r1',
    body: 'He came to us. Never one elder alone, never by text.',
  })

  it('shows the note to an elder named on the case', () => {
    const view = viewCareNote(carryingElder, restorationNote, ['r1'])
    expect(view.access).toBe('visible')
  })

  it('withholds it from an elder with full clearance who is not named', () => {
    const view = viewCareNote(otherElder, restorationNote, [])
    expect(view.access).toBe('withheld')
    if (view.access !== 'withheld') throw new Error('unreachable')
    expect(view.reason).toBe('restoration_case_not_carried')
    expect(JSON.stringify(view)).not.toContain('He came to us')
  })

  it('gives case assignment precedence over clearance', () => {
    // An elders_only clearance is the top of the scale, so a naive
    // clearance-first check would let this through.
    const view = viewCareNote(otherElder, restorationNote, ['r-different'])
    expect(view.access).toBe('withheld')
    if (view.access !== 'withheld') throw new Error('unreachable')
    expect(view.reason).toBe('restoration_case_not_carried')
  })

  it('does not open a restoration note to staff carrying an unrelated case id', () => {
    const view = viewCareNote(pastoralStaff, restorationNote, ['r1'])
    // Being named on the case is necessary, and so is clearance. Pastoral
    // staff top out at staff_and_elders.
    expect(view.access).toBe('withheld')
    if (view.access !== 'withheld') throw new Error('unreachable')
    expect(view.reason).toBe('above_your_tier')
  })
})

describe('a granted clearance does not open a restoration case', () => {
  // The guardrail on the grant system. An administrator can raise anyone's
  // clearance to the top of the scale, but §3 rule 2 says access is by case and
  // the elders name who carries one. The case check runs before clearance is
  // consulted, so the source of the clearance is irrelevant — and that is worth
  // asserting rather than trusting, because it is the one way the grant feature
  // could quietly undo the most important rule in the product.
  const restorationNote = note({
    id: 'n-restoration',
    visibilityTier: 'elders_only',
    restorationCaseId: 'r1',
    body: 'He came to us. Never one elder alone, never by text.',
  })

  const grantedTopClearance = grantedViewer(
    'p-renee',
    ['executive_assistant'],
    'elders_only',
    'Renée Adkins'
  )

  it('gives the granted viewer top clearance', () => {
    // Establishing the premise: the grant really did work.
    expect(writableTiers(grantedTopClearance)).toEqual([
      'all_leaders',
      'staff_and_elders',
      'elders_only',
    ])
  })

  it('still withholds a restoration note from them', () => {
    const view = viewCareNote(grantedTopClearance, restorationNote, [])
    expect(view.access).toBe('withheld')
    if (view.access !== 'withheld') throw new Error('unreachable')
    expect(view.reason).toBe('restoration_case_not_carried')
    expect(JSON.stringify(view)).not.toContain('He came to us')
  })

  it('still withholds the case itself from them', () => {
    const view = viewRestorationCase(grantedTopClearance, openCase)
    expect(view.access).toBe('withheld')
    const serialised = JSON.stringify(view)
    expect(serialised).not.toContain('Hollis')
    expect(serialised).not.toContain('Counseling booked')
  })

  it('does open it once the elders name them on the case', () => {
    // Not a dead end: the legitimate path is case assignment, which the elders
    // control and an administrator does not.
    const view = viewCareNote(grantedTopClearance, restorationNote, ['r1'])
    expect(view.access).toBe('visible')
  })

  it('does let a granted clearance read ordinary confidential notes', () => {
    // The grant is not inert. It reaches everything except case-scoped content.
    const benevolence = note({ visibilityTier: 'staff_and_elders' })
    expect(viewCareNote(grantedTopClearance, benevolence).access).toBe(
      'visible'
    )
    const marriageNote = note({ visibilityTier: 'elders_only' })
    expect(viewCareNote(grantedTopClearance, marriageNote).access).toBe(
      'visible'
    )
  })

  it('applies the same rule to an administrator granted top clearance', () => {
    const grantedAdmin = grantedViewer(
      'p-avery',
      ['administrator'],
      'elders_only',
      'Avery Nkemdirim'
    )
    expect(viewCareNote(grantedAdmin, restorationNote, []).access).toBe(
      'withheld'
    )
    expect(viewRestorationCase(grantedAdmin, closedCase).access).toBe(
      'withheld'
    )
  })
})

describe('the lead pastor reads every case, by office', () => {
  // Decided by the lead pastor on 2026-07-26: access to every restoration case,
  // including ones they are not named on.
  const leadPastor = viewer(
    'p-melo',
    ['lead_pastor', 'pastor_elder'],
    'Melo Sauval'
  )

  const restorationNote = note({
    id: 'n-restoration',
    visibilityTier: 'elders_only',
    restorationCaseId: 'r1',
    body: 'He came to us. Never one elder alone, never by text.',
  })

  it('reads a case note without being named on the case', () => {
    const view = viewCareNote(leadPastor, restorationNote, [])
    expect(view.access).toBe('visible')
    if (view.access !== 'visible') throw new Error('unreachable')
    expect(view.body).toContain('He came to us')
  })

  it('records that the note was reached by office, not by name', () => {
    const view = viewCareNote(leadPastor, restorationNote, [])
    if (view.access !== 'visible') throw new Error('unreachable')
    expect(view.basis).toBe('office')
  })

  it('records assignment when they are named on the case', () => {
    const view = viewCareNote(leadPastor, restorationNote, ['r1'])
    if (view.access !== 'visible') throw new Error('unreachable')
    expect(view.basis).toBe('named_on_case')
  })

  it('leaves basis null for ordinary care, which is governed by tier alone', () => {
    const view = viewCareNote(leadPastor, note())
    if (view.access !== 'visible') throw new Error('unreachable')
    expect(view.basis).toBeNull()
  })

  it('opens an open case they do not carry, in full', () => {
    const view = viewRestorationCase(leadPastor, openCase)
    expect(view.access).toBe('carried')
    if (view.access !== 'carried') throw new Error('unreachable')
    expect(view.personName).toBe('Hollis Grant')
    expect(view.plan).toHaveLength(1)
    expect(view.decisionQuestion).toBeTruthy()
    expect(view.basis).toBe('office')
  })

  it('opens a sealed case they did not carry', () => {
    const view = viewRestorationCase(leadPastor, closedCase)
    expect(view.access).toBe('carried')
    if (view.access !== 'carried') throw new Error('unreachable')
    expect(view.sealed).toBe(true)
    expect(view.basis).toBe('office')
  })

  it('reports assignment when a lead pastor is also named on the case', () => {
    const namedLeadPastor = viewer(
      'p-marcus',
      ['lead_pastor', 'pastor_elder'],
      'Marcus Reid'
    )
    const view = viewRestorationCase(namedLeadPastor, openCase)
    if (view.access !== 'carried') throw new Error('unreachable')
    expect(view.basis).toBe('named_on_case')
  })

  it('extends to nobody else', () => {
    // The office is the lead pastor's alone. Every other route to top clearance
    // still stops at the case boundary.
    const grantedTop = grantedViewer(
      'p-renee',
      ['executive_assistant'],
      'elders_only',
      'Renée Adkins'
    )
    expect(viewRestorationCase(otherElder, openCase).access).toBe('withheld')
    expect(viewRestorationCase(grantedTop, openCase).access).toBe('withheld')
    expect(viewRestorationCase(administrator, openCase).access).toBe('withheld')
  })

  it('works from the lead_pastor role alone, without the elder role', () => {
    // The office is what grants this, not elder membership — so it holds even
    // for a lead pastor who does not sit on the board.
    const officeOnly = viewer('p-office', ['lead_pastor'], 'Lead pastor')
    expect(viewRestorationCase(officeOnly, openCase).access).toBe('carried')
    expect(viewCareNote(officeOnly, restorationNote, []).access).toBe('visible')
  })
})

/* ─────────────────────────── The care timeline ─────────────────────────── */

describe('the hidden-note caption is derived from the notes', () => {
  // §8.1. The prototype once rendered a hardcoded "Two findings" beside a live
  // count of zero.
  it('is empty when nothing is hidden', () => {
    const timeline = buildCareTimeline(pastoralStaff, [
      note({ id: 'a', visibilityTier: 'all_leaders' }),
      note({ id: 'b', visibilityTier: 'staff_and_elders' }),
    ])
    expect(timeline.hiddenCount).toBe(0)
    expect(timeline.hiddenNote).toBe('')
    expect(timeline.visibleCount).toBe(2)
  })

  it('says "1 note is" for a single hidden note', () => {
    const timeline = buildCareTimeline(groupLeader, [
      note({ id: 'a', visibilityTier: 'all_leaders' }),
      note({ id: 'b', visibilityTier: 'elders_only' }),
    ])
    expect(timeline.hiddenCount).toBe(1)
    expect(timeline.hiddenNote).toBe(
      '1 note is above your tier (Elders only). You can see that care happened, not what was said.'
    )
  })

  it('says "2 notes are" for two, and lists the tiers in scale order', () => {
    const timeline = buildCareTimeline(groupLeader, [
      note({ id: 'a', visibilityTier: 'elders_only' }),
      note({ id: 'b', visibilityTier: 'staff_and_elders' }),
    ])
    expect(timeline.hiddenCount).toBe(2)
    expect(timeline.hiddenNote).toBe(
      '2 notes are above your tier (Staff and elders, Elders only). You can see that care happened, not what was said.'
    )
  })

  it('deduplicates tier names', () => {
    const timeline = buildCareTimeline(groupLeader, [
      note({ id: 'a', visibilityTier: 'elders_only' }),
      note({ id: 'b', visibilityTier: 'elders_only' }),
      note({ id: 'c', visibilityTier: 'elders_only' }),
    ])
    expect(timeline.hiddenNote).toBe(
      '3 notes are above your tier (Elders only). You can see that care happened, not what was said.'
    )
  })

  it('states a count that matches the notes actually withheld', () => {
    const notes = [
      note({ id: 'a', visibilityTier: 'all_leaders' }),
      note({ id: 'b', visibilityTier: 'staff_and_elders' }),
      note({ id: 'c', visibilityTier: 'elders_only' }),
    ]
    const timeline = buildCareTimeline(groupLeader, notes)
    const actuallyWithheld = timeline.notes.filter(
      (view) => view.access === 'withheld'
    ).length
    expect(timeline.hiddenCount).toBe(actuallyWithheld)
    expect(timeline.hiddenNote).toContain(`${actuallyWithheld} note`)
    expect(timeline.visibleCount + timeline.hiddenCount).toBe(notes.length)
  })

  it('keeps every note in the timeline, visible or not', () => {
    // §3 rule 4: notes are kept. A withheld note is still a row in the
    // timeline, so the reader can see care happened.
    const notes = [
      note({ id: 'a', visibilityTier: 'all_leaders' }),
      note({ id: 'b', visibilityTier: 'elders_only' }),
    ]
    const timeline = buildCareTimeline(groupLeader, notes)
    expect(timeline.notes).toHaveLength(2)
    expect(timeline.notes.map((view) => view.id)).toEqual(['a', 'b'])
  })
})

/* ───────────────────────── Restoration cases ───────────────────────── */

describe('viewing a restoration case', () => {
  it('shows an open case in full to a named elder', () => {
    const view = viewRestorationCase(carryingElder, openCase)
    expect(view.access).toBe('carried')
    if (view.access !== 'carried') throw new Error('unreachable')
    expect(view.personName).toBe('Hollis Grant')
    expect(view.plan).toHaveLength(1)
    expect(view.doesNotKnow).toContain('Small group')
    expect(view.decisionQuestion).toBeTruthy()
    expect(view.sealed).toBe(false)
  })

  it('shows it to the second elder as well as the lead', () => {
    const second = viewer('p-tanya', ['pastor_elder'], 'Tanya Jules')
    expect(viewRestorationCase(second, openCase).access).toBe('carried')
  })

  it('withholds an open case from an elder who does not carry it', () => {
    const view = viewRestorationCase(otherElder, openCase)
    expect(view.access).toBe('withheld')
    if (view.access !== 'withheld') throw new Error('unreachable')
    expect(view.disclosure).toMatch(/Access is by case, not by title/)
  })

  it('withholds the person, the fold, and the elders — not just the notes', () => {
    const view = viewRestorationCase(otherElder, closedCase)
    const serialised = JSON.stringify(view)
    expect(serialised).not.toContain('Hollis')
    expect(serialised).not.toContain('Reid fold')
    expect(serialised).not.toContain('Marcus Reid')
    expect(serialised).not.toContain('Tanya Jules')
    expect(view).not.toHaveProperty('plan')
    expect(view).not.toHaveProperty('knows')
    expect(view).not.toHaveProperty('decisionQuestion')
  })

  it('lets a blocked reader see that the case existed and how it ended', () => {
    // §3 rule 3 again, and the prototype's sealNote verbatim.
    const view = viewRestorationCase(otherElder, closedCase)
    if (view.access !== 'withheld') throw new Error('unreachable')
    expect(view.sealed).toBe(true)
    expect(view.kind).toBe('Closed case, retained for the record')
    expect(view.status).toBe('Restored')
    expect(view.outcome).toBe(
      'Restored to full participation after five months.'
    )
    expect(view.disclosure).toBe(
      'This case is closed and sealed. You can see that it existed and how it ended, never what was said inside it. That holds even for elders who were not named on it.'
    )
  })

  it('keeps a closed case readable by the elders who carried it', () => {
    // "Record retained; details sealed to the two elders who carried it."
    // Sealed is not deleted (§3 rule 4).
    const view = viewRestorationCase(carryingElder, closedCase)
    expect(view.access).toBe('carried')
    if (view.access !== 'carried') throw new Error('unreachable')
    expect(view.sealed).toBe(true)
    expect(view.plan).toHaveLength(1)
  })

  it('withholds every case from a group leader', () => {
    for (const record of [openCase, closedCase]) {
      expect(viewRestorationCase(groupLeader, record).access).toBe('withheld')
    }
  })
})

describe('carriesCase and carriedCaseIds', () => {
  it('is true only for the two named elders', () => {
    expect(carriesCase(carryingElder, openCase)).toBe(true)
    expect(carriesCase(viewer('p-tanya', ['pastor_elder']), openCase)).toBe(
      true
    )
    expect(carriesCase(otherElder, openCase)).toBe(false)
    expect(carriesCase(groupLeader, openCase)).toBe(false)
  })

  it('collects only the cases the viewer is named on', () => {
    expect(carriedCaseIds(carryingElder, [openCase, closedCase])).toEqual([
      'r1',
      'r2',
    ])
    expect(carriedCaseIds(otherElder, [openCase, closedCase])).toEqual([])
  })
})

/* ──────────────────────────── Writing notes ──────────────────────────── */

describe('the tier a note can be written at', () => {
  // §3 rule 1: tier is set when the note is written. A writer cannot file
  // above their own clearance.
  it('offers a group leader only the lowest tier', () => {
    expect(writableTiers(groupLeader)).toEqual(['all_leaders'])
  })

  it('offers pastoral staff the lower two', () => {
    expect(writableTiers(pastoralStaff)).toEqual([
      'all_leaders',
      'staff_and_elders',
    ])
  })

  it('offers an elder all three', () => {
    expect(writableTiers(carryingElder)).toEqual([
      'all_leaders',
      'staff_and_elders',
      'elders_only',
    ])
  })

  it('offers an administrator none', () => {
    expect(writableTiers(administrator)).toEqual([])
    expect(canWriteAtTier(administrator, 'all_leaders')).toBe(false)
  })

  it('refuses a tier above the writer’s clearance', () => {
    expect(canWriteAtTier(groupLeader, 'elders_only')).toBe(false)
    expect(canWriteAtTier(pastoralStaff, 'elders_only')).toBe(false)
  })
})
