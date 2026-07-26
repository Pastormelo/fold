import { afterEach, describe, expect, it, vi } from 'vitest'

import { sampleViewers } from '@/data/sample'
import { VIEWER_COOKIE } from '@/data/viewer'

import { POST } from './route'

/**
 * The identity-change endpoint.
 *
 * Two things are being protected. The first is confidentiality after the
 * change: every accepted request has to answer 303 so the browser throws away
 * the document it was on, because that document holds the previous viewer's RSC
 * payload — see `@/auth/identity-change`. The second is the endpoint itself,
 * which is a POST route anyone can reach directly.
 */

const elder = sampleViewers().find((viewer) =>
  viewer.roles.includes('pastor_elder')
)!

const ORIGIN = 'http://localhost:3000'

function submit(
  fields: Record<string, string>,
  { origin = ORIGIN }: { origin?: string | null } = {}
) {
  const body = new FormData()
  for (const [name, value] of Object.entries(fields)) body.set(name, value)

  return POST(
    new Request(`${ORIGIN}/dev/viewer`, {
      method: 'POST',
      headers: origin === null ? undefined : { origin },
      body,
    })
  )
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /dev/viewer', () => {
  it('switches the viewer with a redirect the browser must follow as a new document', async () => {
    const response = await submit({ personId: elder.personId })

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(`${ORIGIN}/`)
    expect(response.headers.get('set-cookie')).toContain(
      `${VIEWER_COOKIE}=${elder.personId}`
    )
  })

  it('signs out on an empty personId, clearing the session', async () => {
    const response = await submit({ personId: '' })

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(`${ORIGIN}/`)
    expect(response.headers.get('set-cookie')).toContain(`${VIEWER_COOKIE}=;`)
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
    // The signed-in document must not be reachable again after this.
    expect(response.headers.get('clear-site-data')).toBe('"cache", "storage"')
  })

  it('refuses an unknown viewer, and does not echo the id back', async () => {
    const response = await submit({ personId: 'p-not-a-person' })

    expect(response.status).toBe(400)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(await response.text()).not.toContain('p-not-a-person')
  })

  it('refuses a request with no personId field', async () => {
    const response = await submit({})

    expect(response.status).toBe(400)
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('refuses a cross-origin submission', async () => {
    const response = await submit(
      { personId: elder.personId },
      { origin: 'http://evil.test' }
    )

    expect(response.status).toBe(403)
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('refuses a submission with no Origin header', async () => {
    const response = await submit(
      { personId: elder.personId },
      { origin: null }
    )

    expect(response.status).toBe(403)
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('does not exist in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    const response = await submit({ personId: elder.personId })

    expect(response.status).toBe(404)
    expect(response.headers.get('set-cookie')).toBeNull()
  })
})
