import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  PC_CLIENT_ID_VAR,
  PC_CLIENT_SECRET_VAR,
  PC_SCOPE,
  authorizeUrl,
  exchangeCode,
  isOAuthConfigured,
  oauthApp,
  redirectUri,
  refreshTokens,
} from './oauth'

/**
 * The flow, minus the part only Planning Center can answer.
 *
 * What these pin: the authorize URL carries everything the consent screen needs
 * and nothing it should not, the redirect URI is identical on both legs (OAuth
 * compares them and rejects a mismatch with an error that names neither), a
 * refresh returns *both* new tokens, and every failure is a value with a sentence
 * rather than a throw.
 */

const APP = { clientId: 'client-abc', clientSecret: 'secret-xyz' }
const originalFetch = globalThis.fetch
const originalId = process.env[PC_CLIENT_ID_VAR]
const originalSecret = process.env[PC_CLIENT_SECRET_VAR]

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalId === undefined) delete process.env[PC_CLIENT_ID_VAR]
  else process.env[PC_CLIENT_ID_VAR] = originalId
  if (originalSecret === undefined) delete process.env[PC_CLIENT_SECRET_VAR]
  else process.env[PC_CLIENT_SECRET_VAR] = originalSecret
})

function replies(body: unknown, status = 200) {
  const calls: { url: string; body: string }[] = []
  globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? '') })
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
    })
  }) as unknown as typeof fetch
  return calls
}

const TOKENS = {
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  expires_in: 7200,
  scope: 'people',
}

describe('the application registration', () => {
  it('needs both halves', () => {
    process.env[PC_CLIENT_ID_VAR] = 'client-abc'
    delete process.env[PC_CLIENT_SECRET_VAR]
    expect(oauthApp()).toBeNull()
    expect(isOAuthConfigured()).toBe(false)

    process.env[PC_CLIENT_SECRET_VAR] = 'secret-xyz'
    expect(oauthApp()).toEqual(APP)
    expect(isOAuthConfigured()).toBe(true)
  })

  it('treats an empty variable as absent', () => {
    process.env[PC_CLIENT_ID_VAR] = '  '
    process.env[PC_CLIENT_SECRET_VAR] = 'secret-xyz'
    expect(isOAuthConfigured()).toBe(false)
  })
})

describe('sending the church to Planning Center', () => {
  it('asks for read access to People and nothing else', () => {
    // The scope is what the church reads on the consent screen, so it is §6's
    // promise made visible rather than only asserted in a comment.
    const url = new URL(
      authorizeUrl({ app: APP, siteUrl: 'https://fold.example', state: 's-1' })
    )
    expect(url.searchParams.get('scope')).toBe('people')
    expect(PC_SCOPE).toBe('people')
  })

  it('carries the client id, redirect, response type and state', () => {
    const url = new URL(
      authorizeUrl({ app: APP, siteUrl: 'https://fold.example', state: 's-1' })
    )
    expect(url.origin + url.pathname).toBe(
      'https://api.planningcenteronline.com/oauth/authorize'
    )
    expect(url.searchParams.get('client_id')).toBe('client-abc')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('state')).toBe('s-1')
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://fold.example/auth/planning-center/callback'
    )
  })

  it('never puts the client secret in a URL the browser will see', () => {
    const url = authorizeUrl({
      app: APP,
      siteUrl: 'https://fold.example',
      state: 's-1',
    })
    expect(url).not.toContain('secret-xyz')
  })

  it('tolerates a trailing slash on the site URL', () => {
    // The two legs of OAuth must send byte-identical redirect URIs, so a stray
    // slash in an environment variable would break the exchange with an error
    // that names neither side.
    expect(redirectUri('https://fold.example/')).toBe(
      'https://fold.example/auth/planning-center/callback'
    )
  })
})

describe('exchanging the code', () => {
  it('posts the grant and returns both tokens with an absolute expiry', async () => {
    const calls = replies(TOKENS)
    const result = await exchangeCode({
      app: APP,
      siteUrl: 'https://fold.example',
      code: 'code-1',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.value.accessToken).toBe('access-1')
    expect(result.value.refreshToken).toBe('refresh-1')
    // Converted from `expires_in` here so nothing downstream has to know which
    // of the two it is holding. A minute early, deliberately.
    const seconds = (result.value.expiresAt.getTime() - Date.now()) / 1000
    expect(seconds).toBeGreaterThan(7000)
    expect(seconds).toBeLessThan(7150)

    const sent = new URLSearchParams(calls[0]!.body)
    expect(calls[0]!.url).toBe('https://api.planningcenteronline.com/oauth/token')
    expect(sent.get('grant_type')).toBe('authorization_code')
    expect(sent.get('code')).toBe('code-1')
    expect(sent.get('client_secret')).toBe('secret-xyz')
    expect(sent.get('redirect_uri')).toBe(
      'https://fold.example/auth/planning-center/callback'
    )
  })

  it('says the deployment is at fault when the application is rejected', async () => {
    // A 401 here is the client id or secret, not anything the church did, and the
    // message has to say so or somebody will go hunting through Planning Center.
    replies({ error: 'invalid_client' }, 401)
    const result = await exchangeCode({
      app: APP,
      siteUrl: 'https://fold.example',
      code: 'code-1',
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error).toMatch(/setup problem rather than anything the church did/)
  })

  it('returns a value rather than throwing when the network fails', async () => {
    globalThis.fetch = (async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    const result = await exchangeCode({
      app: APP,
      siteUrl: 'https://fold.example',
      code: 'code-1',
    })
    expect(!result.ok && result.error).toMatch(/Could not reach Planning Center/)
  })

  it('names the missing field when the response is the wrong shape', async () => {
    replies({ access_token: 'access-1' })
    const result = await exchangeCode({
      app: APP,
      siteUrl: 'https://fold.example',
      code: 'code-1',
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error).toContain('refresh_token')
  })
})

describe('refreshing', () => {
  it('sends the refresh grant and returns a new pair', async () => {
    // Planning Center invalidates the old refresh token, so a caller that stored
    // only the access token would have a connection that dies in two hours with
    // no way back. Both halves come back from here.
    const calls = replies({
      access_token: 'access-2',
      refresh_token: 'refresh-2',
      expires_in: 7200,
    })
    const result = await refreshTokens({ app: APP, refreshToken: 'refresh-1' })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.value.accessToken).toBe('access-2')
    expect(result.value.refreshToken).toBe('refresh-2')

    const sent = new URLSearchParams(calls[0]!.body)
    expect(sent.get('grant_type')).toBe('refresh_token')
    expect(sent.get('refresh_token')).toBe('refresh-1')
  })

  it('reports a revoked refresh token rather than throwing', async () => {
    replies({ error: 'invalid_grant', error_description: 'revoked' }, 400)
    const result = await refreshTokens({ app: APP, refreshToken: 'gone' })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error).toContain('revoked')
  })
})
