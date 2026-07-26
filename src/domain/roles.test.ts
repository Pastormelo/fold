import { describe, expect, it } from 'vitest'

import {
  type ClearanceGrant,
  PERMISSIONS,
  type Permission,
  type PermissionGrant,
  type Principal,
  ROLES,
  type Role,
  UNRESTRICTED_ROLES,
  can,
  clearanceFor,
  countLeadersByClearance,
  grantedExceptions,
  isGrantActive,
  permissionCheck,
  principalOf,
  principalReaches,
  resolveClearance,
  roleClearance,
} from './roles'
import { TIER_ORDER } from './tiers'

/** A principal holding roles and no grants. */
function p(...roles: Role[]): Principal {
  return principalOf('p-test', roles)
}

function permissionGrant(
  permission: Permission,
  overrides: Partial<PermissionGrant> = {}
): PermissionGrant {
  return {
    id: 'pg-1',
    permission,
    grantedById: 'p-admin',
    grantedByName: 'Avery Nkemdirim',
    grantedAt: new Date('2026-07-26T00:00:00Z'),
    reason: 'Covering for Dean through August.',
    revokedAt: null,
    revokedById: null,
    ...overrides,
  }
}

function clearanceGrant(
  tier: ClearanceGrant['tier'],
  overrides: Partial<ClearanceGrant> = {}
): ClearanceGrant {
  return {
    id: 'cg-1',
    tier,
    grantedById: 'p-admin',
    grantedByName: 'Avery Nkemdirim',
    grantedAt: new Date('2026-07-26T00:00:00Z'),
    reason: 'Interim care pastor while the role is vacant.',
    revokedAt: null,
    revokedById: null,
    ...overrides,
  }
}

describe('pathway.publish is a distinct permission from pathway.edit', () => {
  // §5: "`pathway.publish` must be a distinct permission from `pathway.edit`."
  it('lets a pathway designer edit but never publish', () => {
    const designer = p('pathway_designer')
    expect(can(designer, 'pathway.edit')).toBe(true)
    expect(can(designer, 'pathway.submit_for_review')).toBe(true)
    expect(can(designer, 'pathway.publish')).toBe(false)
    expect(can(designer, 'pathway.approve')).toBe(false)
  })

  it('lets a reviewer approve and publish but not edit', () => {
    const reviewer = p('reviewer_approver')
    expect(can(reviewer, 'pathway.approve')).toBe(true)
    expect(can(reviewer, 'pathway.request_changes')).toBe(true)
    expect(can(reviewer, 'pathway.publish')).toBe(true)
    expect(can(reviewer, 'pathway.edit')).toBe(false)
  })

  it('does not let an ordinary role hold both edit and publish', () => {
    // `administrator` and `lead_pastor` hold both by design — the first because
    // §5 scopes publishing to it, the second because it holds everything. Every
    // other role must have the split enforced.
    const bothByDesign: readonly Role[] = [
      'administrator',
      ...UNRESTRICTED_ROLES,
    ]
    for (const role of ROLES) {
      if (bothByDesign.includes(role)) continue
      const bothHeld =
        can(p(role), 'pathway.edit') && can(p(role), 'pathway.publish')
      expect(bothHeld, `${role} holds both edit and publish`).toBe(false)
    }
  })
})

describe('a permission note and its gate agree', () => {
  // §8.3, and the §5 rule learned the hard way: "any button whose permission
  // note says a role cannot do something must actually not offer the action,
  // and the note must match the gate."
  it('returns a non-empty note for every role and permission combination', () => {
    for (const role of ROLES) {
      for (const permission of PERMISSIONS) {
        const check = permissionCheck(p(role), permission)
        expect(check.note, `${role} / ${permission}`).toBeTruthy()
        expect(check.permission).toBe(permission)
      }
    }
  })

  it('never phrases a refusal while allowing the action', () => {
    for (const role of ROLES) {
      for (const permission of PERMISSIONS) {
        const { allowed, note } = permissionCheck(p(role), permission)
        if (allowed) {
          expect(note, `${role} / ${permission}`).not.toMatch(
            /\bcannot\b|\bonly\b|do not have/i
          )
        }
      }
    }
  })

  it('explains a publish refusal in terms of the edit/publish split', () => {
    const check = permissionCheck(p('pathway_designer'), 'pathway.publish')
    expect(check.allowed).toBe(false)
    expect(check.note).toMatch(/separate from editing/i)
  })

  it('reports a null source when refused', () => {
    const check = permissionCheck(p('pathway_designer'), 'pathway.publish')
    expect(check.source).toBeNull()
    expect(check.grant).toBeNull()
  })

  it('throws on an unknown permission rather than silently refusing', () => {
    // A silent `false` would render as a disabled button with no explanation,
    // which reads to the user as "you are not allowed" rather than "this is a
    // bug".
    expect(() =>
      permissionCheck(p('administrator'), 'pathway.destroy' as never)
    ).toThrow(/Unknown permission/)
  })
})

describe('an administrator can grant an individual any permission', () => {
  it('allows a permission the role does not carry', () => {
    const designer: Principal = {
      ...p('pathway_designer'),
      permissionGrants: [permissionGrant('pathway.publish')],
    }
    expect(can(designer, 'pathway.publish')).toBe(true)
  })

  it('reports the grant as the source, and names who gave it', () => {
    const designer: Principal = {
      ...p('pathway_designer'),
      permissionGrants: [permissionGrant('pathway.publish')],
    }
    const check = permissionCheck(designer, 'pathway.publish')
    expect(check.source).toBe('grant')
    expect(check.grant?.grantedByName).toBe('Avery Nkemdirim')
    // Someone with unusual access should be able to see where it came from.
    expect(check.note).toContain('Granted to you by Avery Nkemdirim')
    expect(check.note).toContain('Jul 26, 2026')
    expect(check.note).toContain('Covering for Dean through August.')
  })

  it('prefers the role as the source when the role already carries it', () => {
    // A redundant grant must not make a normal permission look like an
    // exception on the review list.
    const admin: Principal = {
      ...p('administrator'),
      permissionGrants: [permissionGrant('pathway.publish')],
    }
    const check = permissionCheck(admin, 'pathway.publish')
    expect(check.allowed).toBe(true)
    expect(check.source).toBe('role')
    expect(check.grant).toBeNull()
  })

  it('grants nothing beyond the permission named', () => {
    const designer: Principal = {
      ...p('pathway_designer'),
      permissionGrants: [permissionGrant('pathway.publish')],
    }
    expect(can(designer, 'pathway.approve')).toBe(false)
    expect(can(designer, 'admin.manage_roles')).toBe(false)
  })

  it('ignores a revoked grant', () => {
    const designer: Principal = {
      ...p('pathway_designer'),
      permissionGrants: [
        permissionGrant('pathway.publish', {
          revokedAt: new Date('2026-07-27T00:00:00Z'),
          revokedById: 'p-admin',
        }),
      ],
    }
    expect(can(designer, 'pathway.publish')).toBe(false)
    expect(permissionCheck(designer, 'pathway.publish').source).toBeNull()
  })

  it('treats a grant with no revocation fields as active', () => {
    expect(isGrantActive(permissionGrant('pathway.publish'))).toBe(true)
    expect(
      isGrantActive(
        permissionGrant('pathway.publish', {
          revokedAt: new Date(),
          revokedById: 'p-admin',
        })
      )
    ).toBe(false)
  })

  it('lets a single administrator grant elders_only, with no countersign', () => {
    // Decided by the lead pastor on 2026-07-26. Requiring a second
    // administrator for a top-tier grant was raised, considered, and declined in
    // favour of visibility (see grantedExceptions).
    //
    // This test exists so the decision cannot be reversed silently: anyone who
    // adds a countersign requirement will fail here and have to change the
    // decision on purpose. §8.8 — a deliberate absence is not a defect, but it
    // has to be legible as deliberate.
    const soleAdmin = p('administrator')
    expect(can(soleAdmin, 'admin.grant_permissions')).toBe(true)

    const recipient: Principal = {
      ...principalOf('p-renee', ['executive_assistant']),
      clearanceGrants: [
        clearanceGrant('elders_only', { grantedById: 'p-admin' }),
      ],
    }
    expect(clearanceFor(recipient)).toBe('elders_only')

    // And it still shows up on the review list rather than passing unremarked.
    expect(grantedExceptions([recipient])).toHaveLength(1)
  })

  it('limits granting to the administrator and the lead pastor', () => {
    // The lead pastor holds every permission, including this one — confirmed
    // 2026-07-26. Nobody else can hand out access.
    expect(can(p('administrator'), 'admin.grant_permissions')).toBe(true)
    expect(can(p('lead_pastor'), 'admin.grant_permissions')).toBe(true)

    const expected: readonly Role[] = ['administrator', ...UNRESTRICTED_ROLES]
    for (const role of ROLES) {
      if (expected.includes(role)) continue
      expect(
        can(p(role), 'admin.grant_permissions'),
        `${role} can grant permissions`
      ).toBe(false)
    }
  })
})

describe('the lead pastor holds the highest authority', () => {
  // Confirmed by the lead pastor on 2026-07-26: the role can grant and revoke
  // any permission, change any setting, and reaches the top tier.
  const leadPastor = p('lead_pastor')

  it('holds every permission in the app', () => {
    // Iterates PERMISSIONS rather than naming them, so a permission added later
    // is covered automatically — §8.1. A hand-maintained list would silently
    // narrow the role the next time someone adds a permission.
    for (const permission of PERMISSIONS) {
      expect(can(leadPastor, permission), permission).toBe(true)
    }
  })

  it('can grant and revoke permissions for anyone', () => {
    expect(can(leadPastor, 'admin.grant_permissions')).toBe(true)
    expect(can(leadPastor, 'admin.manage_roles')).toBe(true)
  })

  it('can change any setting', () => {
    expect(can(leadPastor, 'admin.manage_integrations')).toBe(true)
    expect(can(leadPastor, 'admin.manage_ai_settings')).toBe(true)
    expect(can(leadPastor, 'admin.manage_templates')).toBe(true)
  })

  it('reaches the top confidentiality tier', () => {
    expect(clearanceFor(leadPastor)).toBe('elders_only')
    for (const tier of TIER_ORDER) {
      expect(principalReaches(leadPastor, tier), tier).toBe(true)
    }
  })

  it('needs no grant to do any of it', () => {
    // Everything above comes from the role itself, so the review list stays for
    // genuine exceptions rather than filling up with the lead pastor.
    expect(permissionCheck(leadPastor, 'admin.grant_permissions').source).toBe(
      'role'
    )
    expect(resolveClearance(leadPastor).source).toBe('role')
    expect(grantedExceptions([leadPastor])).toHaveLength(0)
  })

  it('can name the elders on a restoration case', () => {
    // The lead pastor's route into a case: naming who carries it, which is a
    // recorded act, rather than ambient read access to every case.
    expect(can(leadPastor, 'restoration.assign_elders')).toBe(true)
    expect(can(leadPastor, 'restoration.be_assigned')).toBe(true)
  })

  it('is the only role that holds everything', () => {
    for (const role of ROLES) {
      if (role === 'lead_pastor') continue
      const holdsAll = PERMISSIONS.every((permission) =>
        can(p(role), permission)
      )
      expect(holdsAll, `${role} holds every permission`).toBe(false)
    }
  })
})

describe('naming the elders on a case is not an administrator’s power', () => {
  // §3 rule 2 only means something if the power to change who carries a case is
  // itself limited. An administrator who could add themselves to a case would
  // have found a way around the whole tier model.
  it('refuses an administrator', () => {
    expect(can(p('administrator'), 'restoration.assign_elders')).toBe(false)
  })

  it('refuses a pathway designer and a reviewer', () => {
    expect(can(p('pathway_designer'), 'restoration.assign_elders')).toBe(false)
    expect(can(p('reviewer_approver'), 'restoration.assign_elders')).toBe(false)
  })

  it('allows an elder', () => {
    expect(can(p('pastor_elder'), 'restoration.assign_elders')).toBe(true)
  })
})

describe('clearance is derived from roles, then raised by any grant', () => {
  it('takes the highest clearance across every role held', () => {
    expect(clearanceFor(p('group_leader'))).toBe('all_leaders')
    expect(clearanceFor(p('pastoral_staff'))).toBe('staff_and_elders')
    expect(clearanceFor(p('pastor_elder'))).toBe('elders_only')
    expect(clearanceFor(p('group_leader', 'pastor_elder'))).toBe('elders_only')
    expect(clearanceFor(p('deacon', 'pastoral_staff'))).toBe('staff_and_elders')
  })

  it('gives an administrator no pastoral care clearance by default', () => {
    // §5 scopes the administrator to settings, integrations, templates, roles,
    // publishing, and reporting. The default is no care access; a grant is the
    // deliberate exception, recorded as such.
    expect(clearanceFor(p('administrator'))).toBeNull()
    for (const tier of TIER_ORDER) {
      expect(principalReaches(p('administrator'), tier)).toBe(false)
    }
  })

  it('gives pathway workflow roles no pastoral care clearance', () => {
    expect(clearanceFor(p('pathway_designer'))).toBeNull()
    expect(clearanceFor(p('reviewer_approver'))).toBeNull()
  })

  it('gives an executive assistant no automatic access to confidential content', () => {
    // §5: "no automatic access to confidential pastoral content." Confidential
    // begins at staff_and_elders in §3's table. "Automatic" is the operative
    // word — a grant or a second role is the non-automatic path.
    expect(principalReaches(p('executive_assistant'), 'staff_and_elders')).toBe(
      false
    )
    expect(principalReaches(p('executive_assistant'), 'elders_only')).toBe(
      false
    )
  })

  it('lets an executive assistant be granted more by holding another role', () => {
    expect(
      principalReaches(
        p('executive_assistant', 'pastoral_staff'),
        'staff_and_elders'
      )
    ).toBe(true)
  })

  it('raises clearance by an explicit grant', () => {
    const assistant: Principal = {
      ...p('executive_assistant'),
      clearanceGrants: [clearanceGrant('staff_and_elders')],
    }
    expect(clearanceFor(assistant)).toBe('staff_and_elders')
    expect(principalReaches(assistant, 'staff_and_elders')).toBe(true)
    const resolution = resolveClearance(assistant)
    expect(resolution.source).toBe('grant')
    expect(resolution.grant?.reason).toMatch(/Interim care pastor/)
  })

  it('gives an administrator care access only when granted it', () => {
    const admin: Principal = {
      ...p('administrator'),
      clearanceGrants: [clearanceGrant('all_leaders')],
    }
    expect(clearanceFor(admin)).toBe('all_leaders')
    expect(principalReaches(admin, 'all_leaders')).toBe(true)
    // The grant was for one tier, not for everything above it.
    expect(principalReaches(admin, 'staff_and_elders')).toBe(false)
  })

  it('never lowers clearance below the role default', () => {
    // A grant raises only. Lowering someone is a role change, so two mechanisms
    // never disagree with the permissive one winning by accident.
    const elder: Principal = {
      ...p('pastor_elder'),
      clearanceGrants: [clearanceGrant('all_leaders')],
    }
    expect(clearanceFor(elder)).toBe('elders_only')
    expect(resolveClearance(elder).source).toBe('role')
  })

  it('takes the highest of several granted tiers', () => {
    const assistant: Principal = {
      ...p('executive_assistant'),
      clearanceGrants: [
        clearanceGrant('staff_and_elders', { id: 'cg-a' }),
        clearanceGrant('elders_only', { id: 'cg-b' }),
      ],
    }
    expect(clearanceFor(assistant)).toBe('elders_only')
  })

  it('ignores a revoked clearance grant', () => {
    const assistant: Principal = {
      ...p('executive_assistant'),
      clearanceGrants: [
        clearanceGrant('elders_only', {
          revokedAt: new Date('2026-07-27T00:00:00Z'),
          revokedById: 'p-admin',
        }),
      ],
    }
    expect(clearanceFor(assistant)).toBe('all_leaders')
    expect(resolveClearance(assistant).source).toBe('role')
  })

  it('returns null for someone with no roles and no grants', () => {
    expect(clearanceFor(p())).toBeNull()
    for (const tier of TIER_ORDER) {
      expect(principalReaches(p(), tier)).toBe(false)
    }
  })

  it('never lets role order change the answer', () => {
    expect(clearanceFor(p('pastor_elder', 'group_leader'))).toBe('elders_only')
    expect(clearanceFor(p('group_leader', 'pastor_elder'))).toBe('elders_only')
  })

  it('reports the role default separately from the resolved clearance', () => {
    const assistant: Principal = {
      ...p('executive_assistant'),
      clearanceGrants: [clearanceGrant('elders_only')],
    }
    expect(roleClearance(assistant.roles)).toBe('all_leaders')
    expect(clearanceFor(assistant)).toBe('elders_only')
  })
})

describe('countLeadersByClearance', () => {
  // §8.1: the three tier captions are computed, never written as literals.
  const leaders: Principal[] = [
    principalOf('p-1', ['group_leader']),
    principalOf('p-2', ['deacon']),
    principalOf('p-3', ['staff']),
    principalOf('p-4', ['pastoral_staff']),
    principalOf('p-5', ['pastor_elder']),
    principalOf('p-6', ['pastor_elder', 'lead_pastor']),
    principalOf('p-7', ['administrator']),
  ]

  it('counts each leader once, at their resolved clearance', () => {
    expect(countLeadersByClearance(leaders)).toEqual({
      all_leaders: 3,
      staff_and_elders: 1,
      elders_only: 2,
    })
  })

  it('omits leaders with no care clearance from every tier', () => {
    const counts = countLeadersByClearance(leaders)
    const counted = Object.values(counts).reduce((a, b) => a + b, 0)
    // The administrator is not counted anywhere.
    expect(counted).toBe(leaders.length - 1)
  })

  it('counts a granted tier at the granted tier, not the role default', () => {
    const withGrant: Principal[] = [
      {
        ...principalOf('p-8', ['executive_assistant']),
        clearanceGrants: [clearanceGrant('elders_only')],
      },
    ]
    expect(countLeadersByClearance(withGrant)).toEqual({
      all_leaders: 0,
      staff_and_elders: 0,
      elders_only: 1,
    })
  })

  it('returns zeroes rather than an empty object for no leaders', () => {
    expect(countLeadersByClearance([])).toEqual({
      all_leaders: 0,
      staff_and_elders: 0,
      elders_only: 0,
    })
  })
})

describe('grantedExceptions', () => {
  // An administrator can grant anything, so the safeguard is that every
  // exception is visible in one place with who granted it and why.
  it('lists only people holding an active grant', () => {
    const leaders: Principal[] = [
      principalOf('p-plain', ['group_leader']),
      {
        ...principalOf('p-raised', ['executive_assistant']),
        clearanceGrants: [clearanceGrant('staff_and_elders')],
      },
    ]
    const exceptions = grantedExceptions(leaders)
    expect(exceptions).toHaveLength(1)
    expect(exceptions[0]?.personId).toBe('p-raised')
    expect(exceptions[0]?.clearance?.tier).toBe('staff_and_elders')
  })

  it('does not list a grant that only duplicates the role default', () => {
    const leaders: Principal[] = [
      {
        ...principalOf('p-elder', ['pastor_elder']),
        clearanceGrants: [clearanceGrant('all_leaders')],
      },
    ]
    expect(grantedExceptions(leaders)).toHaveLength(0)
  })

  it('flags a self-granted exception', () => {
    const leaders: Principal[] = [
      {
        ...principalOf('p-admin', ['administrator']),
        clearanceGrants: [
          clearanceGrant('elders_only', { grantedById: 'p-admin' }),
        ],
      },
    ]
    const exceptions = grantedExceptions(leaders)
    expect(exceptions[0]?.selfGranted).toBe(true)
  })

  it('does not flag a grant made by someone else', () => {
    const leaders: Principal[] = [
      {
        ...principalOf('p-renee', ['executive_assistant']),
        clearanceGrants: [
          clearanceGrant('staff_and_elders', { grantedById: 'p-admin' }),
        ],
      },
    ]
    expect(grantedExceptions(leaders)[0]?.selfGranted).toBe(false)
  })

  it('omits revoked grants', () => {
    const leaders: Principal[] = [
      {
        ...principalOf('p-past', ['executive_assistant']),
        permissionGrants: [
          permissionGrant('reporting.view', {
            revokedAt: new Date('2026-07-27T00:00:00Z'),
            revokedById: 'p-admin',
          }),
        ],
      },
    ]
    expect(grantedExceptions(leaders)).toHaveLength(0)
  })
})
