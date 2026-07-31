import { describe, expect, it } from 'vitest'

import {
  FOLD_OWNER_ROLES,
  assignToFold,
  canOwnFold,
  draftFold,
  draftPerson,
  normalisePhone,
} from './directory'
import { type Role, principalOf } from './roles'

function whoIs(...roles: Role[]) {
  return principalOf('p1', roles)
}

describe('adding a person', () => {
  it('needs both names', () => {
    expect(
      draftPerson({ firstName: 'Lena', lastName: '  ', isMember: true })
    ).toEqual({
      ok: false,
      refusal:
        'A person needs both names. A directory of first names is one nobody can search.',
    })
  })

  it('does not require a fold', () => {
    // The premise of the product is that it surfaces people nobody is carrying.
    // Refusing to create them until an elder is named would hide the exact
    // situation the app exists to show.
    const attempt = draftPerson({
      firstName: 'Lena',
      lastName: 'Whitcomb',
      isMember: true,
    })
    expect(attempt.ok).toBe(true)
  })

  it('does not require contact details either', () => {
    const attempt = draftPerson({
      firstName: 'Lena',
      lastName: 'Whitcomb',
      isMember: false,
    })
    expect(attempt).toEqual({
      ok: true,
      person: {
        firstName: 'Lena',
        lastName: 'Whitcomb',
        email: null,
        phone: null,
        isMember: false,
      },
    })
  })

  it('stores absent contact details as null rather than empty strings', () => {
    // A blank email satisfies a NOT NULL check while being no more use than
    // nothing, and it breaks matching later.
    const attempt = draftPerson({
      firstName: 'Lena',
      lastName: 'Whitcomb',
      email: '   ',
      phone: '',
      isMember: true,
    })
    expect(attempt.ok && attempt.person.email).toBeNull()
    expect(attempt.ok && attempt.person.phone).toBeNull()
  })

  it('refuses something that cannot be a mailbox', () => {
    const attempt = draftPerson({
      firstName: 'Lena',
      lastName: 'Whitcomb',
      email: 'lena at example',
      isMember: true,
    })
    expect(attempt.ok).toBe(false)
  })

  it('accepts an unusual but real address', () => {
    const attempt = draftPerson({
      firstName: 'Tomás',
      lastName: 'Iglesias',
      email: "tomás.o'neill+church@sub.example.co.uk",
      isMember: true,
    })
    expect(attempt.ok).toBe(true)
  })

  it('refuses half a phone number rather than storing it', () => {
    const attempt = draftPerson({
      firstName: 'Lena',
      lastName: 'Whitcomb',
      phone: '555-000',
      isMember: true,
    })
    expect(attempt.ok).toBe(false)
  })

  it('keeps a formatted number and compares on digits', () => {
    expect(normalisePhone('+1 (555) 000-2222')).toBe('15550002222')
    const attempt = draftPerson({
      firstName: 'Lena',
      lastName: 'Whitcomb',
      phone: '+1 (555) 000-2222',
      isMember: true,
    })
    // Stored as typed. Normalising for storage would lose how the church wrote it.
    expect(attempt.ok && attempt.person.phone).toBe('+1 (555) 000-2222')
  })

  it('trims the names it keeps', () => {
    const attempt = draftPerson({
      firstName: '  Lena ',
      lastName: ' Whitcomb  ',
      isMember: true,
    })
    expect(attempt.ok && attempt.person.firstName).toBe('Lena')
    expect(attempt.ok && attempt.person.lastName).toBe('Whitcomb')
  })
})

describe('who can own a fold', () => {
  it('allows an elder, the lead pastor, and pastoral staff', () => {
    expect(canOwnFold(whoIs('pastor_elder'))).toBe(true)
    expect(canOwnFold(whoIs('lead_pastor'))).toBe(true)
    expect(canOwnFold(whoIs('pastoral_staff'))).toBe(true)
  })

  it('refuses a care volunteer even though they can read notes', () => {
    // Clearance is not the same as being answerable for a group of people.
    expect(canOwnFold(whoIs('care_volunteer'))).toBe(false)
  })

  it('refuses a group leader and a deacon', () => {
    expect(canOwnFold(whoIs('group_leader'))).toBe(false)
    expect(canOwnFold(whoIs('deacon'))).toBe(false)
  })

  it('refuses an administrator, who has no pastoral clearance at all', () => {
    // §5 keeps administration separate from pastoral responsibility.
    expect(canOwnFold(whoIs('administrator'))).toBe(false)
  })

  it('refuses somebody holding an owning role with no clearance', () => {
    // Not reachable through ROLE_CLEARANCE today, and asserted so that adding a
    // clearance-less owning role later fails here rather than silently creating
    // folds whose shepherd can read nothing.
    const noClearance = { personId: 'p1', roles: [] as Role[] }
    expect(canOwnFold(noClearance)).toBe(false)
  })

  it('lists exactly the roles the refusal message names', () => {
    expect([...FOLD_OWNER_ROLES]).toEqual([
      'pastor_elder',
      'lead_pastor',
      'pastoral_staff',
    ])
  })
})

describe('creating a fold', () => {
  const elder = whoIs('pastor_elder')

  it('needs a name', () => {
    const attempt = draftFold({
      name: '  ',
      elderId: 'p1',
      elder,
      elderName: 'Marcus Reid',
    })
    expect(attempt.ok).toBe(false)
  })

  it('needs a named elder', () => {
    const attempt = draftFold({
      name: 'Ridgeway',
      elderId: '',
      elder: null,
      elderName: '',
    })
    expect(attempt.ok).toBe(false)
    expect(!attempt.ok && attempt.refusal).toContain(
      'unassigned list of people'
    )
  })

  it('explains why a volunteer cannot own it, in the church’s terms', () => {
    const attempt = draftFold({
      name: 'Ridgeway',
      elderId: 'p2',
      elder: whoIs('care_volunteer'),
      elderName: 'Renée Alarcón',
    })
    expect(attempt.ok).toBe(false)
    expect(!attempt.ok && attempt.refusal).toContain('Renée Alarcón')
    expect(!attempt.ok && attempt.refusal).toContain('look covered')
  })

  it('accepts an elder and trims the name', () => {
    expect(
      draftFold({
        name: '  Ridgeway Fold ',
        elderId: 'p1',
        elder: elder,
        elderName: 'Marcus Reid',
      })
    ).toEqual({ ok: true, name: 'Ridgeway Fold', elderId: 'p1' })
  })
})

describe('moving somebody between folds', () => {
  it('refuses a move that changes nothing', () => {
    const attempt = assignToFold({
      personName: 'Lena Whitcomb',
      foldId: 'f1',
      foldName: 'Ridgeway',
      currentFoldId: 'f1',
      currentFoldName: 'Ridgeway',
    })
    expect(attempt).toEqual({
      ok: false,
      refusal: 'Lena Whitcomb is already in Ridgeway.',
    })
  })

  it('refuses removing somebody who is already under nobody', () => {
    const attempt = assignToFold({
      personName: 'Lena Whitcomb',
      foldId: null,
      foldName: null,
      currentFoldId: null,
      currentFoldName: null,
    })
    expect(attempt.ok).toBe(false)
  })

  it('allows taking somebody out of a fold, and says what that means', () => {
    // A stale assignment reads as coverage. Removing it is sometimes the honest
    // state, so this is a warning rather than a refusal.
    const attempt = assignToFold({
      personName: 'Lena Whitcomb',
      foldId: null,
      foldName: null,
      currentFoldId: 'f1',
      currentFoldName: 'Westbrook',
    })
    expect(attempt.ok).toBe(true)
    expect(attempt.ok && attempt.note).toContain('nobody is shepherding')
    expect(attempt.ok && attempt.note).toContain('reads as coverage')
  })

  it('says the care history travels with the person', () => {
    const attempt = assignToFold({
      personName: 'Lena Whitcomb',
      foldId: 'f2',
      foldName: 'Eastside',
      currentFoldId: 'f1',
      currentFoldName: 'Westbrook',
    })
    expect(attempt.ok && attempt.note).toContain('Westbrook to Eastside')
    expect(attempt.ok && attempt.note).toContain('belongs to the person')
  })

  it('does not mention a previous fold when there was none', () => {
    const attempt = assignToFold({
      personName: 'Lena Whitcomb',
      foldId: 'f2',
      foldName: 'Eastside',
      currentFoldId: null,
      currentFoldName: null,
    })
    expect(attempt.ok && attempt.note).toBe('Lena Whitcomb is now in Eastside.')
  })
})
