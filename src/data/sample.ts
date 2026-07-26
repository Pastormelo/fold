import 'server-only'

import type {
  CareNoteRecord,
  RestorationCaseRecord,
  Viewer,
} from '@/domain/access'
import type {
  ClearanceGrant,
  PermissionGrant,
  Principal,
  Role,
} from '@/domain/roles'

/**
 * SAMPLE DATA — not product configuration.
 *
 * Names and situations are drawn from the design prototype's One Family Church
 * examples so the screens read the way they were designed to read. Every church
 * answers these questions differently, so nothing here is a default: it exists
 * to exercise the confidentiality model before a database is attached.
 *
 * The repository seam in `./repository` is what a real Postgres query replaces.
 * The redaction in `@/domain/access` is identical either way — that is the
 * point of putting the rules in pure functions.
 */

export type SamplePerson = {
  id: string
  firstName: string
  lastName: string
  roles: Role[]
  foldName: string | null
  isMember: boolean
  since: string
  household: string[]
  serving: string[]
  groups: string[]
}

export const SAMPLE_PEOPLE: SamplePerson[] = [
  {
    id: 'p-lena',
    firstName: 'Lena',
    lastName: 'Whitcomb',
    roles: [],
    foldName: 'Reid fold',
    isMember: true,
    since: 'Member since March 2024',
    household: ['Cal Whitcomb', 'Iris Whitcomb (8)'],
    serving: ['Hospitality'],
    groups: ['Tuesday women’s group'],
  },
  {
    id: 'p-hollis',
    firstName: 'Hollis',
    lastName: 'Grant',
    roles: [],
    foldName: 'Reid fold',
    isMember: true,
    since: 'Member since June 2021',
    household: ['Priya Grant'],
    serving: [],
    groups: ['Thursday men’s group'],
  },
  {
    id: 'p-trent',
    firstName: 'Trent',
    lastName: 'Vasquez',
    roles: [],
    foldName: null,
    isMember: true,
    since: 'Member since January 2026',
    household: [],
    serving: [],
    groups: [],
  },
  /* Leaders. */
  {
    id: 'p-ben',
    firstName: 'Ben',
    lastName: 'Ortiz',
    roles: ['group_leader'],
    foldName: 'Lowry fold',
    isMember: true,
    since: 'Member since 2019',
    household: [],
    serving: ['Connection team'],
    groups: ['Thursday men’s group'],
  },
  {
    id: 'p-dean',
    firstName: 'Dean',
    lastName: 'Lowry',
    roles: ['pastoral_staff'],
    foldName: 'Lowry fold',
    isMember: true,
    since: 'Staff since 2020',
    household: [],
    serving: ['Pastoral care'],
    groups: [],
  },
  {
    id: 'p-marcus',
    firstName: 'Marcus',
    lastName: 'Reid',
    roles: ['pastor_elder'],
    foldName: 'Reid fold',
    isMember: true,
    since: 'Elder since 2018',
    household: [],
    serving: ['Elder board'],
    groups: [],
  },
  {
    id: 'p-tanya',
    firstName: 'Tanya',
    lastName: 'Jules',
    roles: ['pastor_elder'],
    foldName: 'Jules fold',
    isMember: true,
    since: 'Elder since 2022',
    household: [],
    serving: ['Elder board'],
    groups: [],
  },
  {
    id: 'p-tomas',
    firstName: 'Tomás',
    lastName: 'Iglesias',
    roles: ['pastor_elder'],
    foldName: 'Iglesias fold',
    isMember: true,
    since: 'Elder since 2023',
    household: [],
    serving: ['Elder board'],
    groups: [],
  },
  {
    // Holds both roles: lead pastor carries the highest authority in the app,
    // and elder is what puts him on the board and lets him carry cases.
    id: 'p-melo',
    firstName: 'Melo',
    lastName: 'Sauval',
    roles: ['lead_pastor', 'pastor_elder'],
    foldName: 'Sauval fold',
    isMember: true,
    since: 'Lead pastor since the plant',
    household: [],
    serving: ['Elder board', 'Preaching'],
    groups: [],
  },
  {
    id: 'p-renee',
    firstName: 'Renée',
    lastName: 'Adkins',
    roles: ['executive_assistant'],
    foldName: 'Lowry fold',
    isMember: true,
    since: 'Staff since 2023',
    household: [],
    serving: ['Office'],
    groups: [],
  },
  {
    id: 'p-avery',
    firstName: 'Avery',
    lastName: 'Nkemdirim',
    roles: ['administrator', 'pathway_designer'],
    foldName: null,
    isMember: false,
    since: 'Contractor since 2026',
    household: [],
    serving: [],
    groups: [],
  },
]

export function samplePerson(id: string): SamplePerson | undefined {
  return SAMPLE_PEOPLE.find((person) => person.id === id)
}

/**
 * Individual grants an administrator has made — the exceptions to the role
 * defaults.
 *
 * Two here, chosen to exercise both halves. Renée is an executive assistant
 * whose role caps at ordinary care; she has been granted the staff tier to
 * cover a vacancy. Avery is the administrator, whose role carries no pastoral
 * access at all, granted ordinary care while auditing the migration — and
 * granted it by *himself*, which is the case `grantedExceptions` flags.
 */
export const SAMPLE_CLEARANCE_GRANTS: Record<string, ClearanceGrant[]> = {
  'p-renee': [
    {
      id: 'cg-renee',
      tier: 'staff_and_elders',
      grantedById: 'p-avery',
      grantedByName: 'Avery Nkemdirim',
      grantedAt: new Date('2026-07-06T00:00:00Z'),
      reason:
        'Coordinating elder reviews while the care pastor role is vacant. Revisit in September.',
      revokedAt: null,
      revokedById: null,
    },
  ],
  'p-avery': [
    {
      id: 'cg-avery',
      tier: 'all_leaders',
      grantedById: 'p-avery',
      grantedByName: 'Avery Nkemdirim',
      grantedAt: new Date('2026-07-20T00:00:00Z'),
      reason: 'Verifying the Planning Center import against real records.',
      revokedAt: null,
      revokedById: null,
    },
  ],
}

export const SAMPLE_PERMISSION_GRANTS: Record<string, PermissionGrant[]> = {
  'p-renee': [
    {
      id: 'pg-renee',
      permission: 'reporting.view',
      grantedById: 'p-avery',
      grantedByName: 'Avery Nkemdirim',
      grantedAt: new Date('2026-07-06T00:00:00Z'),
      reason: 'Builds the monthly elder report.',
      revokedAt: null,
      revokedById: null,
    },
  ],
}

/** A person as an authorization subject: roles plus any individual grants. */
export function samplePrincipal(person: SamplePerson): Principal {
  return {
    personId: person.id,
    roles: person.roles,
    permissionGrants: SAMPLE_PERMISSION_GRANTS[person.id] ?? [],
    clearanceGrants: SAMPLE_CLEARANCE_GRANTS[person.id] ?? [],
  }
}

/** Everyone holding a role, as principals — the input to the tier counts. */
export function samplePrincipals(): Principal[] {
  return SAMPLE_PEOPLE.filter((person) => person.roles.length > 0).map(
    samplePrincipal
  )
}

export function sampleViewers(): Viewer[] {
  return SAMPLE_PEOPLE.filter((person) => person.roles.length > 0).map(
    (person) => ({
      ...samplePrincipal(person),
      displayName: `${person.firstName} ${person.lastName}`,
    })
  )
}

/**
 * Care notes on Lena Whitcomb, deliberately spanning all three tiers so one
 * screen shows what each reader is and is not shown.
 */
export const SAMPLE_CARE_NOTES: CareNoteRecord[] = [
  {
    id: 'n-1',
    personId: 'p-lena',
    authorId: 'p-ben',
    authorName: 'Ben Ortiz',
    occurredAt: new Date('2026-07-19T16:00:00Z'),
    visibilityTier: 'all_leaders',
    body: 'Coffee after second service. Iris started at a new school and it has been a hard month. Asked to be prayed for by name on Sunday.',
    restorationCaseId: null,
  },
  {
    id: 'n-2',
    personId: 'p-lena',
    authorId: 'p-dean',
    authorName: 'Dean Lowry',
    occurredAt: new Date('2026-07-08T14:30:00Z'),
    visibilityTier: 'all_leaders',
    body: 'Hospital visit with Cal after the surgery. Sat with the family about an hour. Meals covered through the end of the week.',
    restorationCaseId: null,
  },
  {
    id: 'n-3',
    personId: 'p-lena',
    authorId: 'p-dean',
    authorName: 'Dean Lowry',
    occurredAt: new Date('2026-06-22T11:00:00Z'),
    visibilityTier: 'staff_and_elders',
    body: 'Benevolence: two months of rent covered while Cal is out of work. Approved by the elder board on Jun 20. Lena asked that the group not be told.',
    restorationCaseId: null,
  },
  {
    id: 'n-4',
    personId: 'p-lena',
    authorId: 'p-marcus',
    authorName: 'Marcus Reid',
    occurredAt: new Date('2026-05-30T19:00:00Z'),
    visibilityTier: 'elders_only',
    body: 'Marriage strain she raised herself. Counseling referral made. Nothing here goes to the group; she knows this note exists.',
    restorationCaseId: null,
  },
]

/**
 * Two restoration cases, mirroring the prototype: one open and carried by
 * Marcus Reid and Tanya Jules, one closed and sealed. Neither is about Lena.
 */
export const SAMPLE_RESTORATION_CASES: RestorationCaseRecord[] = [
  {
    id: 'r-1',
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
    plan: [
      'Written plan agreed and signed by all three.',
      'Counseling booked, church covering half.',
      'Stepped back from serving until the elders revisit in September.',
    ],
    knows: ['Marcus Reid', 'Tanya Jules', 'Priya Grant'],
    doesNotKnow: ['Thursday men’s group', 'Serving team', 'Wider staff'],
    decisionQuestion:
      'Does he return to serving in September, or do the elders extend the pause?',
  },
  {
    id: 'r-2',
    personId: 'p-caleb',
    // A real name in the fixture on purpose. Redaction is what hides it from
    // readers who do not carry the case; a placeholder here would let a broken
    // gate look correct.
    personName: 'Caleb Ferreira',
    foldName: 'Jules fold',
    openedAt: new Date('2026-02-03T00:00:00Z'),
    leadElderId: 'p-tanya',
    secondElderId: 'p-tomas',
    leadElderName: 'Tanya Jules',
    secondElderName: 'Tomás Iglesias',
    step: 5,
    stepLabel: 'Step 5 of 5 · Restored',
    status: 'Restored',
    closedAt: new Date('2026-06-15T00:00:00Z'),
    outcome: 'Restored to full participation after five months.',
    plan: [
      'Written plan agreed and signed by all three.',
      'Five months away from all serving, revisited monthly.',
      'Returned in June with the elder board’s agreement.',
    ],
    knows: ['Tanya Jules', 'Tomás Iglesias'],
    doesNotKnow: ['Everyone else, by the elders’ decision'],
    decisionQuestion: null,
  },
]

/** A restoration note, to prove case assignment beats clearance. */
export const SAMPLE_RESTORATION_NOTES: CareNoteRecord[] = [
  {
    id: 'n-r1',
    personId: 'p-hollis',
    authorId: 'p-marcus',
    authorName: 'Marcus Reid',
    occurredAt: new Date('2026-05-12T20:00:00Z'),
    visibilityTier: 'elders_only',
    body: 'He came to us. Never one elder alone, never by text. Plan drafted the same week.',
    restorationCaseId: 'r-1',
  },
]
