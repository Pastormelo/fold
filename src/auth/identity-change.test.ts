import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  identityChangeResponse,
  isSameOriginSubmission,
} from './identity-change'

/**
 * These tests exist because of a measured leak, not a hypothetical one.
 *
 * The dev viewer switch used to be a Server Function that wrote the session
 * cookie and let the page re-render. Reading
 * `document.documentElement.outerHTML` after switching from an elder to an
 * administrator still found `elders_only` care-note bodies in the document,
 * even though a fresh request for the administrator contained none of them: the
 * previous viewer's flight chunks were still there. On a real sign-out that is
 * one reader's confidential notes left in the browser for the next person.
 *
 * What stops it is that an identity change is a top-level navigation. So that
 * is what is asserted here — 303 to a new document, and no way back to the old
 * one — plus a scan proving nothing has quietly moved the cookie write back
 * into a Server Function.
 */

const formPost = (url = 'http://localhost:3000/dev/viewer') =>
  new Request(url, {
    method: 'POST',
    headers: { origin: new URL(url).origin },
  })

const setCookie = (response: Response) =>
  response.headers.get('set-cookie') ?? ''

describe('identityChangeResponse', () => {
  it('answers 303 so the browser loads a new document instead of patching this one', () => {
    const response = identityChangeResponse({
      request: formPost(),
      to: '/',
      cookie: { name: 'fold_session', value: 'p-marcus' },
    })

    // The whole fix is this pair: a status that turns the POST into a
    // top-level GET, and a destination for it. Anything that re-renders in
    // place carries the old viewer's payload forward.
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('http://localhost:3000/')
  })

  it('forbids the browser from caching or restoring the abandoned document', () => {
    const response = identityChangeResponse({
      request: formPost(),
      to: '/',
      cookie: { name: 'fold_session', clear: true },
    })

    expect(response.headers.get('cache-control')).toBe('no-store')
    // Evicts this origin's back/forward cache, so Back cannot resurrect the
    // signed-in document after a sign-out.
    expect(response.headers.get('clear-site-data')).toBe('"cache", "storage"')
  })

  it('clears the session cookie on sign-out, with no value left behind', () => {
    const header = setCookie(
      identityChangeResponse({
        request: formPost(),
        to: '/',
        cookie: { name: 'fold_session', clear: true },
      })
    )

    expect(header).toContain('fold_session=;')
    expect(header).toContain('Max-Age=0')
    expect(header).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT')
    expect(header).toContain('Path=/')
    expect(header).toContain('HttpOnly')
  })

  it('writes the new session cookie http-only and same-site', () => {
    const header = setCookie(
      identityChangeResponse({
        request: formPost(),
        to: '/',
        cookie: {
          name: 'fold_session',
          value: 'p-marcus',
          maxAgeSeconds: 3600,
        },
      })
    )

    expect(header).toContain('fold_session=p-marcus')
    expect(header).toContain('HttpOnly')
    expect(header).toContain('SameSite=Lax')
    expect(header).toContain('Path=/')
    expect(header).toContain('Max-Age=3600')
  })

  it('encodes the cookie value rather than letting it add attributes', () => {
    const header = setCookie(
      identityChangeResponse({
        request: formPost(),
        to: '/',
        cookie: { name: 'fold_session', value: 'p-x; Domain=evil.test' },
      })
    )

    expect(header).not.toContain('Domain=evil.test')
    expect(header).toContain('fold_session=p-x%3B%20Domain%3Devil.test')
  })

  it('marks the cookie Secure on https, and does not on plain http', () => {
    const secure = setCookie(
      identityChangeResponse({
        request: formPost('https://fold.test/dev/viewer'),
        to: '/',
        cookie: { name: 'fold_session', value: 'p-marcus' },
      })
    )
    expect(secure).toContain('Secure')

    const local = setCookie(
      identityChangeResponse({
        request: formPost(),
        to: '/',
        cookie: { name: 'fold_session', value: 'p-marcus' },
      })
    )
    expect(local).not.toContain('Secure')
  })

  it('trusts x-forwarded-proto only to add Secure, never to drop it', () => {
    const behindProxy = new Request('http://fold.test/dev/viewer', {
      method: 'POST',
      headers: {
        origin: 'http://fold.test',
        'x-forwarded-proto': 'https, http',
      },
    })
    expect(
      setCookie(
        identityChangeResponse({
          request: behindProxy,
          to: '/',
          cookie: { name: 'fold_session', value: 'p-marcus' },
        })
      )
    ).toContain('Secure')

    const spoofed = new Request('https://fold.test/dev/viewer', {
      method: 'POST',
      headers: { origin: 'https://fold.test', 'x-forwarded-proto': 'http' },
    })
    expect(
      setCookie(
        identityChangeResponse({
          request: spoofed,
          to: '/',
          cookie: { name: 'fold_session', value: 'p-marcus' },
        })
      )
    ).toContain('Secure')
  })

  it.each(['//evil.test', '/\\evil.test', 'https://evil.test/', 'dashboard'])(
    'refuses to redirect an identity change off this origin: %s',
    (destination) => {
      expect(() =>
        identityChangeResponse({
          request: formPost(),
          to: destination,
          cookie: { name: 'fold_session', clear: true },
        })
      ).toThrow(/only redirect to a path on this origin/)
    }
  )

  it('refuses a cookie name that could smuggle attributes', () => {
    expect(() =>
      identityChangeResponse({
        request: formPost(),
        to: '/',
        cookie: { name: 'fold_session; Domain=evil.test', value: 'p-marcus' },
      })
    ).toThrow(/usable cookie name/)
  })
})

describe('isSameOriginSubmission', () => {
  it('accepts a submission from our own pages', () => {
    expect(isSameOriginSubmission(formPost())).toBe(true)
  })

  it('rejects a cross-origin submission', () => {
    const forged = new Request('http://localhost:3000/dev/viewer', {
      method: 'POST',
      headers: { origin: 'http://evil.test' },
    })
    expect(isSameOriginSubmission(forged)).toBe(false)
  })

  it('rejects a submission with no Origin at all, rather than assuming the best', () => {
    const bare = new Request('http://localhost:3000/dev/viewer', {
      method: 'POST',
    })
    expect(isSameOriginSubmission(bare)).toBe(false)
  })
})

/**
 * The regression guard.
 *
 * The leak was not a wrong header — it was the identity change happening on the
 * client-rendered path at all. No unit test of a response can catch someone
 * reintroducing a `'use server'` function that writes the session cookie, so
 * this reads the source and refuses to let that back in.
 */
describe('no Server Function may change identity', () => {
  const sourceFiles = collectSources(
    fileURLToPath(new URL('..', import.meta.url))
  )

  it('finds the app source, so the scan below means something', () => {
    expect(sourceFiles.length).toBeGreaterThan(5)
  })

  it('keeps session cookie writes out of Server Functions', () => {
    const offenders = sourceFiles
      .filter(({ source }) => /['"]use server['"]/.test(source))
      .filter(({ source }) =>
        /VIEWER_COOKIE|fold_dev_viewer|@\/auth\/identity-change/.test(source)
      )
      .map(({ path }) => path)

    // A Server Function that changes who you are re-renders the page you are
    // on, and the page you are on keeps the previous viewer's payload.
    expect(offenders).toEqual([])
  })

  it('submits the identity-change form as a document navigation', () => {
    const switchSource = sourceFiles.find(({ path }) =>
      path.endsWith('viewer-switch.tsx')
    )?.source
    expect(switchSource).toBeDefined()

    // A plain string action with method="post" is a browser form submission.
    // `action={someServerFunction}` and `next/form` both navigate on the
    // client, which is what leaked.
    expect(switchSource).toContain('action="/dev/viewer"')
    expect(switchSource).toContain('method="post"')
    expect(switchSource).not.toMatch(/action=\{/)
  })
})

function collectSources(root: string): { path: string; source: string }[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    if (entry.isDirectory()) return collectSources(path)
    if (!/\.tsx?$/.test(entry.name) || entry.name.endsWith('.test.ts'))
      return []
    return [{ path, source: readFileSync(path, 'utf8') }]
  })
}
