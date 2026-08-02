import 'server-only'

import { z } from 'zod'

import type { IncomingPerson } from '@/domain/pc-import'

import { PC_NOT_CONFIGURED, PC_PEOPLE_API } from './config'
import type { PlanningCenterCredentials } from './config'

/**
 * Reading people out of Planning Center.
 *
 * `server-only`: the credentials are read here, and a Planning Center token reads
 * a church's entire directory.
 *
 * **Read-only, on purpose.** There is no POST, PATCH or DELETE in this module and
 * there is not meant to be. §6: Planning Center is the system of record for people
 * and Fold is the system of work for care, and §6 is emphatic that Fold never
 * creates anything over there — not a field, not a list, not a status value. The
 * absence of a write method is that rule expressed as code rather than as a
 * comment somebody could ignore.
 *
 * **Everything is parsed, nothing is assumed.** The response is JSON:API and is
 * validated with a schema before any of it becomes a person. Where the shape is
 * not what this expects, the error says which field of which record was wrong
 * rather than a person silently arriving named `undefined undefined`. That
 * matters more here than usual: this code was written without access to a live
 * Planning Center account, so the first real response is also the first
 * verification, and it needs to fail legibly rather than plausibly.
 *
 * Failures come back as values. A church clicking "See what would change" on a
 * Sunday afternoon should read a sentence, not meet the error boundary.
 */

export type PcResult<T> = { ok: true; value: T } | { ok: false; error: string }

/* ─────────────────────────── The wire format ─────────────────────────── */

/**
 * Deliberately loose about fields this does not use and strict about the ones it
 * does. Planning Center returns a large Person object; requiring all of it would
 * make an unrelated addition on their side break the import here.
 */
const personSchema = z.object({
  type: z.literal('Person'),
  id: z.string(),
  attributes: z.object({
    first_name: z.string().nullable(),
    last_name: z.string().nullable(),
    /** `active` or `inactive`. Absent is treated as active. */
    status: z.string().nullable().optional(),
    /**
     * The church's own membership value — "Member", "Regular Attender", "Guest",
     * whatever they use. Free text on their side, which is exactly why Fold maps
     * to it rather than inventing its own.
     */
    membership: z.string().nullable().optional(),
  }),
  relationships: z
    .object({
      emails: z
        .object({ data: z.array(z.object({ id: z.string() })).nullable() })
        .optional(),
      phone_numbers: z
        .object({ data: z.array(z.object({ id: z.string() })).nullable() })
        .optional(),
    })
    .optional(),
})

const includedSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('Email'),
    id: z.string(),
    attributes: z.object({
      address: z.string().nullable(),
      primary: z.boolean().nullable().optional(),
    }),
  }),
  z.object({
    type: z.literal('PhoneNumber'),
    id: z.string(),
    attributes: z.object({
      number: z.string().nullable(),
      primary: z.boolean().nullable().optional(),
    }),
  }),
])

const pageSchema = z.object({
  data: z.array(personSchema),
  /** Anything else Planning Center sideloads is ignored rather than refused. */
  included: z.array(z.unknown()).optional(),
  links: z.object({ next: z.string().optional() }).optional(),
  meta: z.object({ total_count: z.number().optional() }).optional(),
})

/* ────────────────────────────── Fetching ────────────────────────────── */

/** One page. Planning Center's maximum is larger; 100 keeps responses small. */
const PER_PAGE = 100

/**
 * A ceiling on pages, so a pagination bug cannot walk forever.
 *
 * 100 pages is 10,000 people, which is far beyond any church Fold is built for.
 * Hitting it is reported rather than silently truncated — an import that quietly
 * stopped halfway would leave a directory that looks complete and is not.
 */
const MAX_PAGES = 100

export type PeopleFetch = {
  people: IncomingPerson[]
  /** Every distinct membership value seen, for the church to map against. */
  membershipValues: string[]
  /** What Planning Center said the total was, when it said. */
  reportedTotal: number | null
}

/**
 * Credentials are passed in rather than read here.
 *
 * They may come from the environment or from the row an administrator saved on
 * the Setup screen, and deciding which is `./credentials`' job — a module that
 * touches the database, which this one should not. It also makes `verify` below
 * possible: checking a credential before storing it means checking one that is
 * not stored anywhere yet.
 */
export async function fetchPeople(
  credentials: PlanningCenterCredentials | null
): Promise<PcResult<PeopleFetch>> {
  if (credentials === null) return { ok: false, error: PC_NOT_CONFIGURED }

  const auth = Buffer.from(
    `${credentials.appId}:${credentials.secret}`
  ).toString('base64')

  const people: IncomingPerson[] = []
  const membershipValues = new Set<string>()
  let reportedTotal: number | null = null
  let url: string | null =
    `${PC_PEOPLE_API}/people?per_page=${PER_PAGE}&include=emails,phone_numbers`
  let pages = 0

  while (url !== null) {
    pages += 1
    if (pages > MAX_PAGES) {
      return {
        ok: false,
        error: `Stopped after ${MAX_PAGES} pages without reaching the end of your directory. Nothing was imported — a partial import would leave a directory that looks complete and is not.`,
      }
    }

    let response: Response
    try {
      response = await fetch(url, {
        headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
        // Never cached: an import reads the directory as it is right now.
        cache: 'no-store',
      })
    } catch {
      return {
        ok: false,
        error:
          'Could not reach Planning Center. Check the connection and try again — nothing was changed.',
      }
    }

    if (!response.ok) {
      return { ok: false, error: describeStatus(response.status) }
    }

    let body: unknown
    try {
      body = await response.json()
    } catch {
      return {
        ok: false,
        error:
          'Planning Center answered with something that was not JSON. Nothing was changed.',
      }
    }

    const parsed = pageSchema.safeParse(body)
    if (!parsed.success) {
      // Naming the path is the point: this code has never met a live response,
      // so the first failure needs to say what was actually different.
      const first = parsed.error.issues[0]
      const path = first?.path.join('.') ?? 'the response'
      return {
        ok: false,
        error: `Planning Center's answer was not the shape this expected — ${path}: ${first?.message ?? 'unrecognised'}. Nothing was changed. This usually means the People API has moved on and the import needs updating.`,
      }
    }

    if (reportedTotal === null && parsed.data.meta?.total_count !== undefined) {
      reportedTotal = parsed.data.meta.total_count
    }

    const contacts = indexContacts(parsed.data.included ?? [])

    for (const record of parsed.data.data) {
      const membership = record.attributes.membership?.trim()
      if (membership) membershipValues.add(membership)

      people.push({
        planningCenterId: record.id,
        firstName: record.attributes.first_name?.trim() ?? '',
        lastName: record.attributes.last_name?.trim() ?? '',
        email: pick(
          record.relationships?.emails?.data,
          contacts.emails
        ),
        phone: pick(
          record.relationships?.phone_numbers?.data,
          contacts.phones
        ),
        // Absent status is treated as active: Planning Center marks people
        // inactive deliberately, so the absence of the mark is not one.
        active: (record.attributes.status ?? 'active') !== 'inactive',
        // The membership value is what the church maps Family and Guests
        // against. An empty list means they have not set one.
        listIds: membership ? [membership] : [],
      })
    }

    url = parsed.data.links?.next ?? null
  }

  return {
    ok: true,
    value: {
      people,
      membershipValues: [...membershipValues].sort(),
      reportedTotal,
    },
  }
}

/* ────────────────────────────── Helpers ────────────────────────────── */

type Contacts = {
  emails: Map<string, { value: string; primary: boolean }>
  phones: Map<string, { value: string; primary: boolean }>
}

/**
 * The sideloaded emails and phone numbers, by id.
 *
 * Unrecognised `included` entries are dropped rather than refused — Planning
 * Center sideloads what it likes, and an import should not fail because a new
 * relationship type appeared.
 */
function indexContacts(included: readonly unknown[]): Contacts {
  const emails = new Map<string, { value: string; primary: boolean }>()
  const phones = new Map<string, { value: string; primary: boolean }>()

  for (const entry of included) {
    const parsed = includedSchema.safeParse(entry)
    if (!parsed.success) continue
    if (parsed.data.type === 'Email') {
      const address = parsed.data.attributes.address?.trim()
      if (address) {
        emails.set(parsed.data.id, {
          value: address,
          primary: parsed.data.attributes.primary === true,
        })
      }
    } else {
      const number = parsed.data.attributes.number?.trim()
      if (number) {
        phones.set(parsed.data.id, {
          value: number,
          primary: parsed.data.attributes.primary === true,
        })
      }
    }
  }

  return { emails, phones }
}

/**
 * The primary one, or the first if none is marked.
 *
 * A person with three email addresses and none marked primary is ordinary; taking
 * the first is better than taking none, because none means the matcher has one
 * fewer field to recognise them by and they arrive as a stranger.
 */
function pick(
  references: readonly { id: string }[] | null | undefined,
  index: Map<string, { value: string; primary: boolean }>
): string | null {
  if (!references) return null
  const found = references
    .map((reference) => index.get(reference.id))
    .filter((entry): entry is { value: string; primary: boolean } => entry !== undefined)
  if (found.length === 0) return null
  return (found.find((entry) => entry.primary) ?? found[0]!).value
}

function describeStatus(status: number): string {
  if (status === 401) {
    return 'Planning Center rejected the credentials. Check the Application ID and Secret — they are a pair, and a token that was revoked fails this way too.'
  }
  if (status === 403) {
    return 'Those credentials reached Planning Center but are not allowed to read People. The token needs access to the People app.'
  }
  if (status === 429) {
    return 'Planning Center is rate-limiting this token. Wait a minute and try again — nothing was changed.'
  }
  if (status >= 500) {
    return `Planning Center returned a server error (${status}). Nothing was changed; try again shortly.`
  }
  return `Planning Center returned ${status}. Nothing was changed.`
}

/**
 * Check a credential before it is saved.
 *
 * One page, one person, which is enough to prove the token authenticates and can
 * read People. Saving an unchecked credential would mean the Setup screen says
 * "connected" and the import says 401, and the person who typed it has no way to
 * tell which half is wrong.
 */
export async function verifyCredentials(
  credentials: PlanningCenterCredentials
): Promise<PcResult<{ reportedTotal: number | null }>> {
  const auth = Buffer.from(
    `${credentials.appId}:${credentials.secret}`
  ).toString('base64')

  let response: Response
  try {
    response = await fetch(`${PC_PEOPLE_API}/people?per_page=1`, {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
      cache: 'no-store',
    })
  } catch {
    return {
      ok: false,
      error:
        'Could not reach Planning Center. Check the connection and try again — nothing was saved.',
    }
  }

  if (!response.ok) return { ok: false, error: describeStatus(response.status) }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    return {
      ok: false,
      error:
        'Planning Center answered with something that was not JSON. Nothing was saved.',
    }
  }

  const parsed = pageSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    const path = first?.path.join('.') ?? 'the response'
    return {
      ok: false,
      error: `Reached Planning Center, but its answer was not the shape this expected — ${path}: ${first?.message ?? 'unrecognised'}. Nothing was saved.`,
    }
  }

  return { ok: true, value: { reportedTotal: parsed.data.meta?.total_count ?? null } }
}
