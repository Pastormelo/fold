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
 * **Two people may share a phone number.** A household does. So an incoming
 * profile is matched only against people already in Fold, never against the other
 * profiles in the same batch. Matching within the batch looked like duplicate
 * protection and was the opposite: on a real directory of 1,473 it turned about
 * ninety spouses and children into "already in Fold" links — to records that did
 * not exist yet — and would have dropped them from the import entirely. Planning
 * Center is the system of record (§6); if it holds a profile, that profile is a
 * person, and Fold's job is not to decide two of them are one.
 *
 * Where profiles inside one batch do share contact details, that is reported and
 * everybody is still created. A visible duplicate is recoverable; a person who
 * silently never arrived is not.
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

/**
 * Several incoming profiles sharing one email address or phone number.
 *
 * Usually a household. Never a reason to skip creating somebody.
 */
export type SharedContact = {
  field: 'email' | 'phone'
  value: string
  names: readonly string[]
}

export type ImportPlan = {
  creates: readonly PlannedCreate[]
  links: readonly PlannedLink[]
  duplicates: readonly PlannedDuplicate[]
  /** Already carrying this Planning Center id. Nothing to do. */
  alreadyLinked: readonly { incoming: IncomingPerson; personId: string }[]
  skipped: readonly PlannedSkip[]
  /** Households, mostly. Created regardless; shown so nothing is a surprise. */
  sharedContacts: readonly SharedContact[]
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

    // Against Fold's own people only. See the note above about households.
    const match = matchPerson(person, input.existing)

    if (match.kind === 'matched') {
      if (match.matchedOn === 'planning_center_id') {
        alreadyLinked.push({ incoming: person, personId: match.personId })
        continue
      }
      const found = input.existing.find(
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
  }

  return {
    creates,
    links,
    duplicates,
    alreadyLinked,
    skipped,
    sharedContacts: sharedContactsAmong(creates),
  }
}

/**
 * Profiles being created that share an email or phone with another one.
 *
 * Reported, not acted on. Mostly these are households — a shared home phone, a
 * parent's address on a child's profile — and treating them as duplicates is what
 * broke this in the first place. Occasionally one really is the same person
 * entered twice in Planning Center, and that is worth a church knowing about
 * without Fold deciding it.
 */
function sharedContactsAmong(
  creates: readonly PlannedCreate[]
): SharedContact[] {
  const byEmail = new Map<string, PlannedCreate[]>()
  const byPhone = new Map<string, PlannedCreate[]>()

  for (const entry of creates) {
    const email = entry.incoming.email?.trim().toLowerCase()
    if (email) byEmail.set(email, [...(byEmail.get(email) ?? []), entry])
    const digits = entry.incoming.phone?.replace(/\D/g, '') ?? ''
    const phone = digits.length > 10 ? digits.slice(-10) : digits
    if (phone !== '') byPhone.set(phone, [...(byPhone.get(phone) ?? []), entry])
  }

  const shared: SharedContact[] = []
  for (const [field, index] of [
    ['email', byEmail],
    ['phone', byPhone],
  ] as const) {
    for (const [value, group] of index) {
      if (group.length < 2) continue
      shared.push({
        field,
        value,
        names: group.map(
          (entry) => `${entry.incoming.firstName} ${entry.incoming.lastName}`
        ),
      })
    }
  }
  return shared
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
