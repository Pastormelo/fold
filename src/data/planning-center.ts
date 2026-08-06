import 'server-only'

import { cache } from 'react'

import { asc, eq, inArray } from 'drizzle-orm'

import {
  type FoldList,
  type ListMapping,
  FOLD_LISTS,
} from '@/domain/planning-center'
import type { ExistingPerson } from '@/domain/pc-import'
import { type PermissionCheck, permissionCheck } from '@/domain/roles'
import { db, schema } from '@/db/client'
import { PC_NOT_CONFIGURED } from '@/planning-center/config'
import {
  type CredentialStatus,
  credentialStatus,
} from '@/planning-center/credentials'

import { getViewer } from './viewer'

/**
 * Reading the Fold side of the Planning Center integration.
 *
 * The people here are read as `ExistingPerson` — the shape `matchPerson` compares
 * — rather than as full records, because the only question this side of the
 * import asks is "who might this incoming profile already be". Reading more would
 * pull confidential fields into a code path that has no business holding them.
 */

export type DuplicateRow = {
  id: string
  personName: string
  otherPersonName: string
  matchedOn: string
  surfacedAt: Date
}

export type IntegrationView = {
  configured: boolean
  configurationNote: string | null
  /**
   * The banner above the scope list.
   *
   * It has to be derived from the credential. It used to come from
   * `getIntegrationState`, which reported "connected" only once somebody in the
   * directory carried a Planning Center id — so a church that had connected and
   * not yet imported was told it was not connected, three lines above a card
   * saying it was.
   */
  connectionNote: string
  /** Where the credential is, and who put it there. Never the secret itself. */
  credential: CredentialStatus
  gate: PermissionCheck
  /** Family and Guests, and where each lands in Planning Center. */
  listMappings: Record<FoldList, ListMapping>
  /** Whether people_and_households is switched on (§6). */
  peopleSyncEnabled: boolean
  /** People already carrying a Planning Center id. */
  linkedCount: number
  peopleCount: number
  /** Unresolved near-matches somebody still has to decide about. */
  openDuplicates: readonly DuplicateRow[]
  /**
   * The Planning Center membership values seen on the last preview, for the
   * mapping boxes. Empty until somebody has previewed once.
   */
  membershipValues: readonly string[]
}

export const getIntegrationView = cache(async (): Promise<IntegrationView> => {
  const viewer = await getViewer()
  const gate = permissionCheck(viewer, 'admin.manage_integrations')

  const [credential, church, people, mappingRows, settingRows, duplicateRows] =
    await Promise.all([
      credentialStatus(viewer.churchId),
      db
        .select({ values: schema.churches.pcMembershipValues })
        .from(schema.churches)
        .where(eq(schema.churches.id, viewer.churchId))
        .limit(1),
      db
        .select({
          id: schema.people.id,
          planningCenterId: schema.people.planningCenterId,
        })
        .from(schema.people)
        .where(eq(schema.people.churchId, viewer.churchId)),
      db
        .select()
        .from(schema.foldListMappings)
        .where(eq(schema.foldListMappings.churchId, viewer.churchId)),
      db
        .select()
        .from(schema.syncSettings)
        .where(eq(schema.syncSettings.churchId, viewer.churchId)),
      db
        .select()
        .from(schema.possibleDuplicates)
        .where(eq(schema.possibleDuplicates.churchId, viewer.churchId))
        .orderBy(asc(schema.possibleDuplicates.surfacedAt)),
    ])

  const open = duplicateRows.filter((row) => row.resolvedAt === null)
  const names = await namesFor([
    ...open.map((row) => row.personId),
    ...open.map((row) => row.otherPersonId),
  ])

  const peopleSetting = settingRows.find(
    (row) => row.category === 'people_and_households'
  )

  /*
   * Usable, not merely present: a stored credential that cannot be decrypted is
   * not one, and the screen says so rather than offering a button that 401s.
   *
   * Listed exhaustively rather than as "not none", and that is the point. This
   * was written before OAuth existed and read `environment || stored`, so a
   * church that had just signed in successfully saw "Connected, authorised by
   * you" beside a greyed-out import button telling them to go and set an
   * environment variable. A `switch` on the state makes adding a fourth kind of
   * connection fail the type check here instead of shipping the same
   * contradiction again.
   */
  const usable = ((): boolean => {
    switch (credential.state) {
      case 'environment':
      case 'stored':
      case 'oauth':
        // An oauth connection whose authorisation was revoked cannot be renewed,
        // so it is present and not usable.
        return credential.state !== 'oauth' || !credential.needsReauthorising
      case 'none':
      case 'unreadable':
        return false
    }
  })()

  return {
    configured: usable,
    connectionNote: usable
      ? 'Connected. Planning Center stays the system of record; what follows is the scope Fold reads within.'
      : 'Planning Center is not connected, so nothing is syncing. What follows is the scope that would apply once it is — not a description of what is happening now.',
    /*
     * Why it is unavailable, in terms of the connection that actually exists.
     *
     * The old note said "create a Personal Access Token and set two environment
     * variables" whatever the state was, which after signing in successfully was
     * both wrong and impossible to act on.
     */
    configurationNote: usable ? null : unavailableNote(credential),
    credential,
    gate,
    listMappings: readListMappings(mappingRows),
    // §6's default for this category is on, so an absent row means on.
    peopleSyncEnabled: peopleSetting?.enabled ?? true,
    linkedCount: people.filter((row) => row.planningCenterId !== null).length,
    peopleCount: people.length,
    membershipValues: church[0]?.values ?? [],
    openDuplicates: open.map((row) => ({
      id: row.id,
      personName: names.get(row.personId) ?? 'Someone',
      otherPersonName: names.get(row.otherPersonId) ?? 'Someone',
      matchedOn: row.matchedOn,
      surfacedAt: row.surfacedAt,
    })),
  }
})

/** The people the matcher compares against. Whole church, contact fields only. */
export async function existingPeopleFor(
  churchId: string
): Promise<ExistingPerson[]> {
  const rows = await db
    .select({
      id: schema.people.id,
      firstName: schema.people.firstName,
      lastName: schema.people.lastName,
      email: schema.people.email,
      phone: schema.people.phone,
      planningCenterId: schema.people.planningCenterId,
    })
    .from(schema.people)
    .where(eq(schema.people.churchId, churchId))

  return rows.map((row) => ({
    personId: row.id,
    planningCenterId: row.planningCenterId,
    email: row.email,
    phone: row.phone,
    fullName: `${row.firstName} ${row.lastName}`,
  }))
}

/**
 * The church's Family/Guest mapping, defaulting to unmapped.
 *
 * §8.8: `unmapped` and `fold_only` are different answers — nobody has looked
 * versus a decision was made — so an absent row becomes `unmapped` rather than
 * anything that reads as settled.
 */
export function readListMappings(
  rows: readonly (typeof schema.foldListMappings.$inferSelect)[]
): Record<FoldList, ListMapping> {
  const mappings = {} as Record<FoldList, ListMapping>
  for (const list of FOLD_LISTS) {
    const row = rows.find((candidate) => candidate.list === list)
    if (row === undefined || row.state === 'unmapped') {
      mappings[list] = { state: 'unmapped' }
    } else if (row.state === 'fold_only') {
      mappings[list] = {
        state: 'fold_only',
        reason: row.foldOnlyReason ?? '',
      }
    } else {
      mappings[list] = {
        state: 'mapped',
        externalFieldIds: row.externalFieldIds ?? [],
      }
    }
  }
  return mappings
}

export async function listMappingsFor(
  churchId: string
): Promise<Record<FoldList, ListMapping>> {
  const rows = await db
    .select()
    .from(schema.foldListMappings)
    .where(eq(schema.foldListMappings.churchId, churchId))
  return readListMappings(rows)
}

async function namesFor(ids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const rows = await db
    .select({
      id: schema.people.id,
      firstName: schema.people.firstName,
      lastName: schema.people.lastName,
    })
    .from(schema.people)
    .where(inArray(schema.people.id, unique))
  return new Map(
    rows.map((row) => [row.id, `${row.firstName} ${row.lastName}`])
  )
}

/**
 * The sentence to show when Planning Center cannot be used.
 *
 * Each state sends a reader somewhere different, and one generic note sent them
 * all to the wrong place. Signing in again is not the same instruction as pasting
 * a token, and neither is what somebody whose database password was rotated needs
 * to hear.
 */
function unavailableNote(credential: CredentialStatus): string {
  switch (credential.state) {
    case 'oauth':
      return 'Planning Center access has lapsed and could not be renewed, which usually means Fold’s access was revoked over there. Sign in again above.'
    case 'unreadable':
      return credential.kind === 'oauth'
        ? 'Planning Center is connected but the stored access token can no longer be read, because the key that encrypts it changed. Sign in to Planning Center again above — it takes a few seconds and nothing else is affected.'
        : 'A Planning Center token is stored but can no longer be read, because the key that encrypts it changed. Paste the token again above.'
    case 'none':
      return credential.oauthAvailable
        ? 'Planning Center is not connected yet. Press “Sign in with Planning Center” above; there is nothing to copy or paste.'
        : PC_NOT_CONFIGURED
    case 'environment':
    case 'stored':
      // Reachable only if `usable` and this function disagree, which the switch
      // above is arranged to prevent.
      return PC_NOT_CONFIGURED
  }
}
