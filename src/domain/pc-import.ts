/**
 * Working out what an import would do, before it does it — HANDOFF.md §6.
 *
 * This module is the dry run. It takes the profiles Planning Center returned and
 * the people already in Fold, and returns a plan: who would be created, who would
 * be linked to a record that already exists, who cannot be told apart from
 * somebody, and who would be left alone. It writes nothing and knows nothing
 * about the database.
 *
 * Three rules, and each is a refusal to do the convenient thing.
 *
 * **Nothing is ever merged.** `matchPerson` returns candidates when more than one
 * person could be the incoming profile, and this turns that into a `duplicate`
 * entry for somebody to resolve. There is no tie-break, no "most recently
 * updated wins", no scoring. A duplicate is visible and annoying; a wrong merge
 * puts two people's histories in one record and is close to unrecoverable.
 *
 * **An import does not overwrite what a person typed.** A profile that matches an
 * existing Fold record contributes its Planning Center id and nothing else. Field
 * ownership — who wins when both systems changed the same phone number — is a
 * separate question with its own rules in `./planning-center`, and answering it
 * silently during a first import would quietly replace hand-entered pastoral
 * work with a spreadsheet export.
 *
 * **Membership is not inferred.** §6 keeps Family and Guests apart, and §7 says
 * membership is decided by the church rather than computed. So an imported person
 * arrives as a guest unless the church has mapped its Family list to something in
 * Planning Center and this profile is in it. Everything else would be Fold
 * deciding who is a member of a church.
 */

import {
  type FoldList,
  type ListMapping,
  foldListForIncoming,
  matchPerson,
} from './planning-center'

/* ────────────────────────── What arrives ────────────────────────── */

/** A Planning Center profile, reduced to what an import uses. */
export type IncomingPerson = {
  /** Planning Center's id for this person. Never one Fold invented. */
  planningCenterId: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  /** Planning Center's own status. `inactive` people are not imported. */
  active: boolean
  /**
   * Ids of the lists or field values this profile carries, for
   * `foldListForIncoming` to read the church's mapping against.
   */
  listIds: readonly string[]
}

/** A person already in Fold, in the shape `matchPerson` compares. */
export type ExistingPerson = {
  personId: string
  planningCenterId: string | null
  email: string | null
  phone: string | null
  fullName: string
}

/* ────────────────────────── What would happen ────────────────────────── */

export type PlannedCreate = {
  incoming: IncomingPerson
  /** Which Fold list they would land in, and why. */
  list: FoldList
  listReason: string
}

export type PlannedLink = {
  incoming: IncomingPerson
  personId: string
  fullName: string
  matchedOn: 'email' | 'phone'
}

export type PlannedDuplicate = {
  incoming: IncomingPerson
  candidates: readonly { personId: string; fullName: string }[]
  guidance: string
}

export type PlannedSkip = {
  incoming: IncomingPerson
  reason: string
}

export type ImportPlan = {
  creates: readonly PlannedCreate[]
  links: readonly PlannedLink[]
  duplicates: readonly PlannedDuplicate[]
  /** Already carrying this Planning Center id. Nothing to do. */
  alreadyLinked: readonly { incoming: IncomingPerson; personId: string }[]
  skipped: readonly PlannedSkip[]
}

/* ────────────────────────────── The plan ────────────────────────────── */

export function planImport(input: {
  incoming: readonly IncomingPerson[]
  existing: readonly ExistingPerson[]
  /** The church's Family/Guest mapping. Both may be unmapped. */
  listMappings: Record<FoldList, ListMapping>
}): ImportPlan {
  const creates: PlannedCreate[] = []
  const links: PlannedLink[] = []
  const duplicates: PlannedDuplicate[] = []
  const alreadyLinked: { incoming: IncomingPerson; personId: string }[] = []
  const skipped: PlannedSkip[] = []

  /**
   * People this plan would create, accumulated as it goes.
   *
   * Without this, two Planning Center profiles sharing an email address would
   * both be planned as creations and the import would manufacture the duplicate
   * it exists to prevent. They are matched against the pending creations as well
   * as against Fold, so the second one becomes a duplicate to resolve.
   */
  const pending: ExistingPerson[] = []

  for (const person of input.incoming) {
    if (!person.active) {
      skipped.push({
        incoming: person,
        reason:
          'Inactive in Planning Center. Importing them would put somebody in the directory that Planning Center has already set aside.',
      })
      continue
    }

    if (person.firstName.trim() === '' || person.lastName.trim() === '') {
      skipped.push({
        incoming: person,
        reason:
          'No first and last name in Planning Center. A directory of half-names is one nobody can search.',
      })
      continue
    }

    const match = matchPerson(person, [...input.existing, ...pending])

    if (match.kind === 'matched') {
      if (match.matchedOn === 'planning_center_id') {
        alreadyLinked.push({ incoming: person, personId: match.personId })
        continue
      }
      const found = [...input.existing, ...pending].find(
        (candidate) => candidate.personId === match.personId
      )
      links.push({
        incoming: person,
        personId: match.personId,
        fullName: found?.fullName ?? 'Someone already in Fold',
        matchedOn: match.matchedOn,
      })
      continue
    }

    if (match.kind === 'possible_duplicates') {
      duplicates.push({
        incoming: person,
        candidates: match.candidates.map((candidate) => ({
          personId: candidate.personId,
          fullName: candidate.fullName,
        })),
        guidance: match.guidance,
      })
      continue
    }

    const list = foldListForIncoming(person.listIds, input.listMappings)
    creates.push({
      incoming: person,
      list: list ?? 'guest',
      listReason:
        list === 'family'
          ? 'In the Planning Center list mapped to Family.'
          : list === 'guest'
            ? 'In the Planning Center list mapped to Guests.'
            : 'No mapped list matched, so they arrive as a guest. Membership is the church’s decision, not something an import should conclude.',
    })

    // Visible to the profiles that follow, so a second copy inside the same
    // import is caught rather than created.
    pending.push({
      personId: `pending:${person.planningCenterId}`,
      planningCenterId: person.planningCenterId,
      email: person.email,
      phone: person.phone,
      fullName: `${person.firstName} ${person.lastName}`,
    })
  }

  return { creates, links, duplicates, alreadyLinked, skipped }
}

/* ───────────────────────────── Describing it ───────────────────────────── */

/**
 * The plan in a sentence, counted from the plan itself.
 *
 * §8.2: a claim has to match what it was computed from. Every number here is
 * `.length` on the array it describes, so a summary cannot drift from the plan it
 * summarises — which is the failure that matters most on a screen whose entire
 * job is telling somebody what is about to happen to their directory.
 */
export function describePlan(plan: ImportPlan): string {
  const parts: string[] = []
  if (plan.creates.length > 0) {
    parts.push(
      `${plan.creates.length} ${plan.creates.length === 1 ? 'person' : 'people'} would be added`
    )
  }
  if (plan.links.length > 0) {
    parts.push(
      `${plan.links.length} already in Fold would be linked to their Planning Center record`
    )
  }
  if (plan.duplicates.length > 0) {
    parts.push(
      `${plan.duplicates.length} could not be told apart from somebody and would be left for you`
    )
  }
  if (plan.alreadyLinked.length > 0) {
    parts.push(`${plan.alreadyLinked.length} are already linked`)
  }
  if (plan.skipped.length > 0) {
    parts.push(`${plan.skipped.length} would be skipped`)
  }

  if (parts.length === 0) {
    return 'Planning Center returned nobody, so there is nothing to import.'
  }

  return `${parts.join(', ')}. Nothing has happened yet.`
}

/** Whether running the import would change anything at all (§8.5). */
export function planWouldChangeAnything(plan: ImportPlan): boolean {
  return plan.creates.length > 0 || plan.links.length > 0
}

/**
 * Why running it would do nothing, when it would do nothing.
 *
 * Separated from the boolean so the button's disabled state and the sentence
 * beside it come from one evaluation rather than two (§8.3).
 */
export function nothingToDoReason(plan: ImportPlan): string | null {
  if (planWouldChangeAnything(plan)) return null
  if (plan.duplicates.length > 0) {
    return 'Every profile that is not already linked needs a person to decide about it first. Resolve the possible duplicates and run this again.'
  }
  if (plan.alreadyLinked.length > 0) {
    return 'Everyone Planning Center returned is already in Fold and already linked. There is nothing to import.'
  }
  if (plan.skipped.length > 0) {
    return 'Everything Planning Center returned was skipped, so there is nothing to import.'
  }
  return 'Planning Center returned nobody.'
}
