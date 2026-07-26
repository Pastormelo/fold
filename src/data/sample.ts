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
 * SAMPLE DATA — invented, and not product configuration.
 *
 * Every person, note, and case below is fictional. The note bodies deliberately
 * describe *which tier they sit at* rather than imitating real pastoral writing:
 * the job of this data is to show that redaction works, and text that reads like
 * a genuine care record would be both unnecessary for that and easy to mistake
 * for one.
 *
 * Nothing here is a default. Stage counts, follow-up windows, and capacity
 * figures are per-church, so this exists only to exercise the confidentiality
 * model before a database is attached. Swapping these reads for Drizzle queries
 * changes the fetch and nothing else — the redaction lives in
 * `@/domain/access`, which is where the tests are.
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
        'Sample reason. A real grant requires one, and it is not nullable.',
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
      reason:
        'Sample reason for a self-granted exception, which the review list flags.',
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
      reason: 'Sample reason for a granted permission.',
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
 * Notes on one person, spanning all three tiers, so a single screen shows what
 * each reader is and is not shown.
 */
export const SAMPLE_CARE_NOTES: CareNoteRecord[] = [
  {
    id: 'n-1',
    personId: 'p-lena',
    authorId: 'p-ben',
    authorName: 'Ben Ortiz',
    occurredAt: new Date('2026-07-19T16:00:00Z'),
    visibilityTier: 'all_leaders',
    body: 'Sample ordinary-care note. Every leader can read this tier: visits, calls, grief, hospital, new believers, milestones.',
    restorationCaseId: null,
  },
  {
    id: 'n-2',
    personId: 'p-lena',
    authorId: 'p-dean',
    authorName: 'Dean Lowry',
    occurredAt: new Date('2026-07-08T14:30:00Z'),
    visibilityTier: 'all_leaders',
    body: 'Second sample note at the same tier, so the timeline shows more than one visible row.',
    restorationCaseId: null,
  },
  {
    id: 'n-3',
    personId: 'p-lena',
    authorId: 'p-dean',
    authorName: 'Dean Lowry',
    occurredAt: new Date('2026-06-22T11:00:00Z'),
    visibilityTier: 'staff_and_elders',
    body: 'Sample staff-tier note. Stands in for a benevolence record or a marriage-crisis conversation. A group leader must not see this text.',
    restorationCaseId: null,
  },
  {
    id: 'n-4',
    personId: 'p-lena',
    authorId: 'p-marcus',
    authorName: 'Marcus Reid',
    occurredAt: new Date('2026-05-30T19:00:00Z'),
    visibilityTier: 'elders_only',
    body: 'Sample elder-tier note. Stands in for the most restricted pastoral content. Only an elder should see this text.',
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
      'Sample plan line one. A real case would hold the written agreement here.',
      'Sample plan line two.',
    ],
    knows: ['Sample name A', 'Sample name B'],
    doesNotKnow: ['Sample group A', 'Sample group B'],
    decisionQuestion: 'Sample decision the elders are carrying.',
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
    outcome:
      'Sample outcome. Readable even by leaders who cannot open the case.',
    plan: ['Sample plan line, retained after the case closed.'],
    knows: ['Sample name B', 'Sample name C'],
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
    body: 'Sample restoration-case note. Filed at elders_only, which the database enforces for any note attached to a case.',
    restorationCaseId: 'r-1',
  },
]
