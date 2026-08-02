import 'server-only'

import { z } from 'zod'

/**
 * "Sign in with Planning Center" — the OAuth authorization-code flow.
 *
 * **Why this exists alongside the token path.** A Personal Access Token is one
 * church reading its own data, and it means somebody pastes an Application ID and
 * a Secret into a form. That is not how other church software does it, and it is
 * not how it should feel: in Notebird you press a button, Planning Center asks
 * whether you consent, and you are connected. The difference is where the
 * credential lives. With OAuth, **Fold** is registered once as an application —
 * one client id and secret, set by whoever runs this deployment — and each church
 * then authorises that application against its own account. A church never
 * handles a credential at all.
 *
 * The token path is kept because it is built, tested, and useful for a developer
 * poking at the API without registering anything. `./credentials` decides which is
 * in play, in a fixed order.
 *
 * **What OAuth costs, and it is not nothing.** Access tokens expire in two hours,
 * so there is a refresh token to store, a refresh to perform before expiry, and a
 * failure mode when the refresh itself is rejected. That is the price of the
 * button, and it is worth paying.
 */

export const PC_CLIENT_ID_VAR = 'PLANNING_CENTER_CLIENT_ID'
export const PC_CLIENT_SECRET_VAR = 'PLANNING_CENTER_CLIENT_SECRET'

const AUTHORIZE_URL = 'https://api.planningcenteronline.com/oauth/authorize'
const TOKEN_URL = 'https://api.planningcenteronline.com/oauth/token'

/**
 * Read-only, and only People.
 *
 * §6 says Fold never creates anything in Planning Center. Asking for the narrowest
 * scope that does the job is that promise made visible on the consent screen a
 * church is looking at — they can see what they are agreeing to, and it is not
 * "manage everything".
 */
export const PC_SCOPE = 'people'

export type OAuthApp = { clientId: string; clientSecret: string }

export function oauthApp(): OAuthApp | null {
  const clientId = process.env[PC_CLIENT_ID_VAR]?.trim()
  const clientSecret = process.env[PC_CLIENT_SECRET_VAR]?.trim()
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

export function isOAuthConfigured(): boolean {
  return oauthApp() !== null
}

export const PC_OAUTH_NOT_CONFIGURED = `This deployment has no Planning Center application registered, so there is nothing to sign in to. Whoever runs Fold sets ${PC_CLIENT_ID_VAR} and ${PC_CLIENT_SECRET_VAR} once, from an application created at api.planningcenteronline.com/oauth/applications. A church never needs to see either value.`

/** Where Planning Center sends the browser back to. */
export function redirectUri(siteUrl: string): string {
  return `${siteUrl.replace(/\/$/, '')}/auth/planning-center/callback`
}

/**
 * The URL to send the browser to.
 *
 * `state` is a random value this app minted and stored in a cookie; the callback
 * refuses anything that does not match. Without it, a third party could hand a
 * signed-in administrator a crafted callback URL and connect *their* Planning
 * Center account to this church — the church's directory would then quietly fill
 * with somebody else's people.
 */
export function authorizeUrl(input: {
  app: OAuthApp
  siteUrl: string
  state: string
}): string {
  const url = new URL(AUTHORIZE_URL)
  url.searchParams.set('client_id', input.app.clientId)
  url.searchParams.set('redirect_uri', redirectUri(input.siteUrl))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', PC_SCOPE)
  url.searchParams.set('state', input.state)
  return url.toString()
}

/* ────────────────────────────── Tokens ────────────────────────────── */

/**
 * Planning Center's token response.
 *
 * Parsed rather than trusted, like everything else that arrives from over there.
 * `expires_in` is seconds; the absolute expiry is computed here so nothing later
 * has to remember which of the two it is holding.
 */
const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  token_type: z.string().optional(),
  scope: z.string().optional(),
})

export type PcTokens = {
  accessToken: string
  refreshToken: string
  expiresAt: Date
  scope: string | null
}

export type OAuthResult<T> =
  { ok: true; value: T } | { ok: false; error: string }

/** Trade the one-time code for tokens. */
export async function exchangeCode(input: {
  app: OAuthApp
  siteUrl: string
  code: string
}): Promise<OAuthResult<PcTokens>> {
  return postToken(input.app, {
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: redirectUri(input.siteUrl),
  })
}

/**
 * Trade a refresh token for a fresh pair.
 *
 * Planning Center returns a new refresh token as well, and the old one stops
 * working, so the caller must store both halves of what comes back. Storing only
 * the access token would leave the connection dead in two hours with no way to
 * revive it except reconnecting by hand.
 */
export async function refreshTokens(input: {
  app: OAuthApp
  refreshToken: string
}): Promise<OAuthResult<PcTokens>> {
  return postToken(input.app, {
    grant_type: 'refresh_token',
    refresh_token: input.refreshToken,
  })
}

async function postToken(
  app: OAuthApp,
  fields: Record<string, string>
): Promise<OAuthResult<PcTokens>> {
  const body = new URLSearchParams({
    ...fields,
    client_id: app.clientId,
    client_secret: app.clientSecret,
  })

  let response: Response
  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
      cache: 'no-store',
    })
  } catch {
    return {
      ok: false,
      error: 'Could not reach Planning Center to complete the connection.',
    }
  }

  const text = await response.text()

  if (!response.ok) {
    // Planning Center's error body is usually JSON with an `error` field; the
    // status alone does not say whether the app registration or the grant was
    // the problem, and that distinction is what the reader needs.
    let detail = text.slice(0, 200)
    try {
      const parsed = JSON.parse(text) as {
        error?: string
        error_description?: string
      }
      detail = parsed.error_description ?? parsed.error ?? detail
    } catch {
      // Keep the raw prefix.
    }
    if (response.status === 401) {
      return {
        ok: false,
        error: `Planning Center rejected this application's credentials — ${detail}. The client id or secret on this deployment is wrong, which is a setup problem rather than anything the church did.`,
      }
    }
    return {
      ok: false,
      error: `Planning Center refused the connection (${response.status}) — ${detail}`,
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return {
      ok: false,
      error: 'Planning Center answered the token request with something that was not JSON.',
    }
  }

  const result = tokenSchema.safeParse(parsed)
  if (!result.success) {
    const first = result.error.issues[0]
    return {
      ok: false,
      error: `Planning Center's token response was not the shape this expected — ${first?.path.join('.') ?? 'unknown field'}: ${first?.message ?? 'unrecognised'}.`,
    }
  }

  return {
    ok: true,
    value: {
      accessToken: result.data.access_token,
      refreshToken: result.data.refresh_token,
      // Computed here, so nothing downstream has to know it started life as a
      // duration. A minute is shaved off so a token that expires mid-request is
      // refreshed before it is used rather than after it fails.
      expiresAt: new Date(Date.now() + (result.data.expires_in - 60) * 1000),
      scope: result.data.scope ?? null,
    },
  }
}
