import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PC_APP_ID_VAR, PC_NOT_CONFIGURED, PC_SECRET_VAR } from './config'
import { fetchPeople } from './client'

/**
 * What this pins, and what it cannot.
 *
 * These tests were written without access to a live Planning Center account, so
 * they cannot prove the People API returns what this client expects. What they do
 * prove is everything downstream of that assumption: that the assumed shape is
 * parsed correctly, that pagination is followed, that the primary email is
 * preferred over the others, that a response in the wrong shape produces an error
 * naming the field rather than a person called "undefined undefined", and that
 * every failure is a value rather than a throw.
 *
 * The assumption itself is stated in one place — the schemas in `client.ts` — and
 * these fixtures are the written-down version of it. When the first real response
 * disagrees, the error will say which field, and both the schema and these
 * fixtures change together.
 */

const originalFetch = globalThis.fetch
const originalId = process.env[PC_APP_ID_VAR]
const originalSecret = process.env[PC_SECRET_VAR]

beforeEach(() => {
  process.env[PC_APP_ID_VAR] = 'app-id'
  process.env[PC_SECRET_VAR] = 'secret'
})

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalId === undefined) delete process.env[PC_APP_ID_VAR]
  else process.env[PC_APP_ID_VAR] = originalId
  if (originalSecret === undefined) delete process.env[PC_SECRET_VAR]
  else process.env[PC_SECRET_VAR] = originalSecret
})

/** Replies in order, one per call, so pagination can be exercised. */
function replyWith(...pages: unknown[]) {
  const calls: string[] = []
  let index = 0
  globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
    calls.push(String(url))
    const body = pages[Math.min(index, pages.length - 1)]
    index += 1
    return new Response(JSON.stringify(body), { status: 200 })
  }) as unknown as typeof fetch
  return calls
}

function person(overrides: Record<string, unknown> = {}) {
  return {
    type: 'Person',
    id: 'pc-1',
    attributes: {
      first_name: 'Lena',
      last_name: 'Whitcomb',
      status: 'active',
      membership: 'Member',
    },
    relationships: {
      emails: { data: [{ id: 'e-1' }] },
      phone_numbers: { data: [{ id: 'ph-1' }] },
    },
    ...overrides,
  }
}

const INCLUDED = [
  {
    type: 'Email',
    id: 'e-1',
    attributes: { address: 'lena@example.com', primary: true },
  },
  {
    type: 'PhoneNumber',
    id: 'ph-1',
    attributes: { number: '555-000-2222', primary: true },
  },
]

describe('reading people', () => {
  it('turns a page into people', async () => {
    replyWith({ data: [person()], included: INCLUDED })
    const result = await fetchPeople()
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.value.people).toEqual([
      {
        planningCenterId: 'pc-1',
        firstName: 'Lena',
        lastName: 'Whitcomb',
        email: 'lena@example.com',
        phone: '555-000-2222',
        active: true,
        listIds: ['Member'],
      },
    ])
  })

  it('sends HTTP Basic credentials and asks for the contact details', async () => {
    const calls = replyWith({ data: [] })
    await fetchPeople()
    expect(calls[0]).toContain('include=emails,phone_numbers')
    const init = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]![1] as RequestInit
    const auth = (init.headers as Record<string, string>).Authorization
    expect(auth).toBe(`Basic ${Buffer.from('app-id:secret').toString('base64')}`)
  })

  it('follows pagination and stops when there is no next link', async () => {
    replyWith(
      {
        data: [person({ id: 'pc-1' })],
        included: INCLUDED,
        links: { next: 'https://api.planningcenteronline.com/people/v2/people?offset=100' },
      },
      { data: [person({ id: 'pc-2' })], included: INCLUDED }
    )
    const result = await fetchPeople()
    expect(result.ok && result.value.people.map((p) => p.planningCenterId)).toEqual(
      ['pc-1', 'pc-2']
    )
  })

  it('collects the membership values the church actually uses', async () => {
    // These are what the Family mapping is chosen from. Fold never invents one,
    // so the only source is the directory itself.
    replyWith({
      data: [
        person({ id: 'a', attributes: { first_name: 'A', last_name: 'One', membership: 'Member' } }),
        person({ id: 'b', attributes: { first_name: 'B', last_name: 'Two', membership: 'Regular Attender' } }),
        person({ id: 'c', attributes: { first_name: 'C', last_name: 'Three', membership: 'Member' } }),
      ],
    })
    const result = await fetchPeople()
    expect(result.ok && result.value.membershipValues).toEqual([
      'Member',
      'Regular Attender',
    ])
  })
})

describe('contact details', () => {
  it('prefers the primary email over the others', async () => {
    replyWith({
      data: [
        person({
          relationships: { emails: { data: [{ id: 'e-old' }, { id: 'e-new' }] } },
        }),
      ],
      included: [
        { type: 'Email', id: 'e-old', attributes: { address: 'old@example.com', primary: false } },
        { type: 'Email', id: 'e-new', attributes: { address: 'new@example.com', primary: true } },
      ],
    })
    const result = await fetchPeople()
    expect(result.ok && result.value.people[0]!.email).toBe('new@example.com')
  })

  it('takes the first when none is marked primary', async () => {
    // Better than none: an address is a field the matcher can recognise somebody
    // by, and without one they arrive as a stranger.
    replyWith({
      data: [person({ relationships: { emails: { data: [{ id: 'e-1' }] } } })],
      included: [
        { type: 'Email', id: 'e-1', attributes: { address: 'only@example.com' } },
      ],
    })
    const result = await fetchPeople()
    expect(result.ok && result.value.people[0]!.email).toBe('only@example.com')
  })

  it('reports no contact details rather than an empty string', async () => {
    replyWith({ data: [person({ relationships: {} })] })
    const result = await fetchPeople()
    expect(result.ok && result.value.people[0]!.email).toBeNull()
    expect(result.ok && result.value.people[0]!.phone).toBeNull()
  })

  it('ignores sideloaded records it does not recognise', async () => {
    // Planning Center sideloads what it likes; a new relationship type should
    // not break an import.
    replyWith({
      data: [person()],
      included: [...INCLUDED, { type: 'Household', id: 'h-1', attributes: {} }],
    })
    const result = await fetchPeople()
    expect(result.ok && result.value.people[0]!.email).toBe('lena@example.com')
  })
})

describe('status', () => {
  it('marks an inactive person inactive', async () => {
    replyWith({
      data: [person({ attributes: { first_name: 'L', last_name: 'W', status: 'inactive' } })],
    })
    const result = await fetchPeople()
    expect(result.ok && result.value.people[0]!.active).toBe(false)
  })

  it('treats an absent status as active', async () => {
    // Planning Center marks people inactive deliberately, so the absence of the
    // mark is not one.
    replyWith({
      data: [person({ attributes: { first_name: 'L', last_name: 'W' } })],
    })
    const result = await fetchPeople()
    expect(result.ok && result.value.people[0]!.active).toBe(true)
  })
})

describe('when something is wrong', () => {
  it('refuses without credentials rather than calling anything', async () => {
    delete process.env[PC_APP_ID_VAR]
    const called = vi.fn()
    globalThis.fetch = called as unknown as typeof fetch
    const result = await fetchPeople()
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error).toBe(PC_NOT_CONFIGURED)
    expect(called).not.toHaveBeenCalled()
  })

  it('explains a rejected token', async () => {
    globalThis.fetch = (async () =>
      new Response('', { status: 401 })) as unknown as typeof fetch
    const result = await fetchPeople()
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error).toMatch(/rejected the credentials/)
  })

  it('distinguishes no access to People from a bad token', async () => {
    globalThis.fetch = (async () =>
      new Response('', { status: 403 })) as unknown as typeof fetch
    const result = await fetchPeople()
    expect(!result.ok && result.error).toMatch(/access to the People app/)
  })

  it('says which field was wrong when the shape has moved on', async () => {
    // The failure this client is most likely to meet, because it has never seen
    // a real response. It has to fail legibly rather than plausibly.
    replyWith({ data: [{ type: 'Person', id: 'pc-1', attributes: {} }] })
    const result = await fetchPeople()
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error).toContain('data.0.attributes.first_name')
    expect(result.error).toMatch(/Nothing was changed/)
  })

  it('returns a value rather than throwing when the network fails', async () => {
    globalThis.fetch = (async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    const result = await fetchPeople()
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error).toMatch(/Could not reach Planning Center/)
  })

  it('stops rather than importing half a directory', async () => {
    // A pagination bug that never terminates would otherwise walk forever, or
    // worse, stop silently and leave a directory that looks complete.
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          data: [person()],
          included: INCLUDED,
          links: { next: 'https://api.planningcenteronline.com/people/v2/people?offset=1' },
        }),
        { status: 200 }
      )) as unknown as typeof fetch
    const result = await fetchPeople()
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error).toMatch(/looks complete and is not/)
  })
})
