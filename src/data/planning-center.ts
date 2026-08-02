import 'server-only'

import { cache } from 'react'

import { asc, eq, inArray } from 'drizzle-orm'

import { type FoldList, type ListMapping, FOLD_LISTS } from '@/domain/planning-center'
import type { ExistingPerson } from '@/domain/pc-import'
import { type PermissionCheck, permissionCheck } from '@/domain/roles'
import { db, schema } from '@/db/client'
import { isPlanningCenterConfigured, PC_NOT_CONFIGURED } from '@/planning-center/config'

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
}

export const getIntegrationView = cache(async (): Promise<IntegrationView> => {
  const viewer = await getViewer()
  const gate = permissionCheck(viewer, 'admin.manage_integrations')

  const [people, mappingRows, settingRows, duplicateRows] = await Promise.all([
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

  return {
    configured: isPlanningCenterConfigured(),
    configurationNote: isPlanningCenterConfigured() ? null : PC_NOT_CONFIGURED,
    gate,
    listMappings: readListMappings(mappingRows),
    // §6's default for this category is on, so an absent row means on.
    peopleSyncEnabled: peopleSetting?.enabled ?? true,
    linkedCount: people.filter((row) => row.planningCenterId !== null).length,
    peopleCount: people.length,
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
        externalFieldId: row.externalFieldId ?? '',
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
