import { describe, expect, it } from 'vitest'

import {
  type CareNoteRecord,
  type RestorationCaseRecord,
  type Viewer,
  buildCareTimeline,
  canWriteAtTier,
  viewCareNote,
  viewRestorationCase,
  writableTiers,
} from './access'
import type { Role } from './roles'

/* ────────────────────────────── Fixtures ────────────────────────────── */

function viewer(
  personId: string,
  roles: Role[],
  displayName = personId
): Viewer {
  return { personId, displayName, roles, churchId: 'church-1' }
}

const groupLeader = viewer('p-ben', ['group_leader'], 'Ben Ortiz')
const pastoralStaff = viewer('p-dean', ['pastoral_staff'], 'Dean Lowry')
const elder = viewer('p-marcus', ['pastor_elder'], 'Marcus Reid')
const otherElder = viewer('p-tomas', ['pastor_elder'], 'Tomás Iglesias')
const leadPastor = viewer(
  'p-melo',
  ['lead_pastor', 'pastor_elder'],
  'Melo Sauval'
)
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

describe('restoration cases are elder-tier content', () => {
  // Every elder reads every case. Who is assigned to a case is recorded on the
  // case and shown to readers; it is not an access rule.
  const restorationNote = note({
    id: 'n-restoration',
    visibilityTier: 'elders_only',
    restorationCaseId: 'r1',
    body: 'He came to us. Never one elder alone, never by text.',
  })

  it('shows a case note to any elder', () => {
    for (const reader of [elder, otherElder, leadPastor]) {
      const view = viewCareNote(reader, restorationNote)
      expect(view.access, reader.displayName).toBe('visible')
    }
  })

  it('withholds a case note from pastoral staff', () => {
    const view = viewCareNote(pastoralStaff, restorationNote)
    expect(view.access).toBe('withheld')
    if (view.access !== 'withheld') throw new Error('unreachable')
    expect(view.reason).toBe('above_your_tier')
    expect(JSON.stringify(view)).not.toContain('He came to us')
  })

  it('opens an open case to any elder, in full', () => {
    for (const reader of [elder, otherElder, leadPastor]) {
      const view = viewRestorationCase(reader, openCase)
      expect(view.access, reader.displayName).toBe('visible')
      if (view.access !== 'visible') throw new Error('unreachable')
      expect(view.personName).toBe('Hollis Grant')
      expect(view.plan).toHaveLength(1)
      expect(view.decisionQuestion).toBeTruthy()
    }
  })

  it('opens a sealed case to any elder, and marks it sealed', () => {
    const view = viewRestorationCase(otherElder, closedCase)
    expect(view.access).toBe('visible')
    if (view.access !== 'visible') throw new Error('unreachable')
    expect(view.sealed).toBe(true)
  })

  it('still names who carries the case, for the record', () => {
    const view = viewRestorationCase(otherElder, openCase)
    if (view.access !== 'visible') throw new Error('unreachable')
    expect(view.leadElderName).toBe('Marcus Reid')
    expect(view.secondElderName).toBe('Tanya Jules')
  })

  it('withholds a case from everyone below elder tier', () => {
    for (const reader of [groupLeader, pastoralStaff, administrator]) {
      const view = viewRestorationCase(reader, openCase)
      expect(view.access, reader.displayName).toBe('withheld')
      const serialised = JSON.stringify(view)
      expect(serialised).not.toContain('Hollis')
      expect(serialised).not.toContain('Counseling booked')
    }
  })

  it('lets a blocked reader see that it existed and how it ended', () => {
    const view = viewRestorationCase(pastoralStaff, closedCase)
    if (view.access !== 'withheld') throw new Error('unreachable')
    expect(view.kind).toBe('Closed case, retained for the record')
    expect(view.outcome).toBe(
      'Restored to full participation after five months.'
    )
    expect(view.disclosure).toMatch(/never what was said inside it/)
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
    expect(writableTiers(elder)).toEqual([
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
