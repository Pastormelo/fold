/**
 * Adding people, and putting them under an elder — HANDOFF.md §2.
 *
 * The three rules in this module are the ones the rest of the app has been
 * assuming were true without anything enforcing them, because until now nothing
 * could create a person or a fold at all.
 *
 * **A fold has exactly one owning elder, and that elder must be able to carry
 * people.** The schema makes `elder_id` non-null, which stops a fold with nobody
 * on it. It cannot stop a fold owned by somebody with no pastoral clearance —
 * that would be a fold whose shepherd cannot read a single note about anyone in
 * it, which is worse than an unassigned list because it looks covered.
 *
 * **A member with no fold is an open pastoral matter, not a validation error.**
 * So adding a person does not require a fold. The product's whole premise is that
 * it *surfaces* people nobody is carrying, and refusing to create them until
 * somebody is named would hide exactly the situation it exists to show.
 *
 * **A guest is not in Family until membership.** §6 keeps the two lists apart, so
 * membership is asked at the point a person is created rather than inferred from
 * whether they happen to have a fold.
 */

import { type Role, type Principal, clearanceFor } from './roles'

/* ─────────────────────────────── New people ─────────────────────────────── */

export type NewPerson = {
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  /** §6: Family or Guests. Asked, never inferred. */
  isMember: boolean
}

export type PersonDraft = {
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  isMember: boolean
}

export type PersonAttempt =
  { ok: true; person: PersonDraft } | { ok: false; refusal: string }

/**
 * An email that is at least shaped like one.
 *
 * Deliberately loose. The only thing worth refusing is a value that cannot be a
 * mailbox at all; anything stricter starts rejecting real addresses, and a church
 * directory is exactly where the unusual ones show up.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Digits, keeping the last ten for comparison the way `matchPerson` does. */
export function normalisePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

export function draftPerson(input: {
  firstName: string
  lastName: string
  email?: string | null
  phone?: string | null
  isMember: boolean
}): PersonAttempt {
  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()

  if (firstName === '' || lastName === '') {
    return {
      ok: false,
      refusal:
        'A person needs both names. A directory of first names is one nobody can search.',
    }
  }

  const email = input.email?.trim() ?? ''
  if (email !== '' && !EMAIL.test(email)) {
    return { ok: false, refusal: `“${email}” is not an email address.` }
  }

  const phone = input.phone?.trim() ?? ''
  if (phone !== '' && normalisePhone(phone).length < 10) {
    return {
      ok: false,
      refusal:
        'That phone number is too short to call. Leave it blank rather than storing half of one.',
    }
  }

  return {
    ok: true,
    person: {
      firstName,
      lastName,
      // Empty means absent, not an empty string — a blank email would satisfy a
      // NOT NULL check while being no more use than nothing.
      email: email === '' ? null : email,
      phone: phone === '' ? null : phone,
      isMember: input.isMember,
    },
  }
}

/* ──────────────────────────────── New folds ──────────────────────────────── */

export type FoldAttempt =
  { ok: true; name: string; elderId: string } | { ok: false; refusal: string }

/**
 * Roles that can own a fold.
 *
 * Not simply "anyone with clearance". A fold's owner is the person answerable for
 * everyone in it, and §2 calls them the elder. `pastoral_staff` is included
 * because a staff pastor carrying a fold is ordinary in a church this size; a
 * `care_volunteer` is not, even though they can read notes.
 */
export const FOLD_OWNER_ROLES: readonly Role[] = [
  'pastor_elder',
  'lead_pastor',
  'pastoral_staff',
]

export function canOwnFold(principal: Principal): boolean {
  // Clearance *and* one of the owning roles. Clearance alone would let an
  // administrator with a granted tier own a fold, and §5 keeps administration
  // separate from pastoral responsibility.
  if (clearanceFor(principal) === null) return false
  return principal.roles.some((role) => FOLD_OWNER_ROLES.includes(role))
}

export function draftFold(input: {
  name: string
  elderId: string
  /** The candidate elder, as an authorization subject. */
  elder: Principal | null
  elderName: string
}): FoldAttempt {
  const name = input.name.trim()
  if (name === '') {
    return {
      ok: false,
      refusal:
        'A fold needs a name. People will be told which one they are in.',
    }
  }
  if (input.elderId === '') {
    return {
      ok: false,
      refusal:
        'A fold needs a named elder. A fold with nobody owning it is an unassigned list of people, which is the thing this product exists to prevent.',
    }
  }
  if (input.elder === null) {
    return { ok: false, refusal: 'That person is not in this church.' }
  }
  if (!canOwnFold(input.elder)) {
    return {
      ok: false,
      refusal: `${input.elderName} cannot own a fold. It has to be an elder, the lead pastor, or pastoral staff — somebody who can read the notes about the people in it, or the fold would look covered while its shepherd could see nothing.`,
    }
  }
  return { ok: true, name, elderId: input.elderId }
}

/* ───────────────────────── Moving people between folds ───────────────────── */

export type AssignmentAttempt =
  | { ok: true; foldId: string | null; note: string }
  | { ok: false; refusal: string }

/**
 * Put somebody in a fold, or take them out of one.
 *
 * `null` is a legal destination and returns a warning rather than a refusal.
 * Removing the last shepherd from a person is sometimes the honest state — a
 * reorganisation in progress, an elder who has stepped down — and the app's job
 * is to say plainly what has happened and then surface them on the Overview, not
 * to refuse and leave a stale assignment in place that reads as coverage.
 */
export function assignToFold(input: {
  personName: string
  foldId: string | null
  foldName: string | null
  currentFoldId: string | null
  currentFoldName: string | null
}): AssignmentAttempt {
  if (input.foldId === input.currentFoldId) {
    // §8.5: an action that reports success must have done something.
    return {
      ok: false,
      refusal:
        input.foldId === null
          ? `${input.personName} is already under no fold.`
          : `${input.personName} is already in ${input.foldName}.`,
    }
  }

  if (input.foldId === null) {
    return {
      ok: true,
      foldId: null,
      note: `${input.personName} is now under no fold, and will show on the Overview as somebody nobody is shepherding. That is the point of taking them out rather than leaving a stale assignment that reads as coverage.`,
    }
  }

  return {
    ok: true,
    foldId: input.foldId,
    note: input.currentFoldName
      ? `${input.personName} moved from ${input.currentFoldName} to ${input.foldName}. Their care history moves with them; it belongs to the person, not the fold.`
      : `${input.personName} is now in ${input.foldName}.`,
  }
}
