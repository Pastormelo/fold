import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

import { permissionCheck } from '@/domain/roles'
import { getViewer } from '@/data/viewer'
import { storeOAuthConnection } from '@/planning-center/credentials'
import {
  PC_OAUTH_NOT_CONFIGURED,
  exchangeCode,
  oauthApp,
} from '@/planning-center/oauth'
import { siteUrl } from '@/planning-center/site'

import { STATE_COOKIE } from '../start/route'

/**
 * Where Planning Center sends the church back after they consent.
 *
 * Every exit from this route is a redirect to Setup carrying either `pc_error` or
 * `pc_connected`, because the person is arriving by top-level navigation from
 * another origin and has nowhere else to land. A blank page or a JSON error here
 * would strand somebody mid-connection with no way back.
 *
 * Four things are checked before the code is spent, and the order matters: the
 * state cookie (so this is a callback for a flow this app started), the viewer's
 * permission (a GET route is reachable by anyone), the app registration, and only
 * then the code itself.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const back = `${url.origin}/admin`
  const fail = (message: string) =>
    NextResponse.redirect(`${back}?pc_error=${encodeURIComponent(message)}`)

  const store = await cookies()
  const expected = store.get(STATE_COOKIE)?.value
  // Consumed either way: a state value that survives a failed attempt is a state
  // value somebody can retry with.
  store.delete(STATE_COOKIE)

  // Planning Center reports a refusal this way — most often the church pressing
  // "deny" on the consent screen, which is not an error worth alarming them about.
  const denied = url.searchParams.get('error')
  if (denied !== null) {
    const description = url.searchParams.get('error_description')
    return fail(
      denied === 'access_denied'
        ? 'Planning Center was not connected: the request was declined on their consent screen. Nothing changed.'
        : `Planning Center refused the connection — ${description ?? denied}`
    )
  }

  const state = url.searchParams.get('state')
  if (!expected || !state || state !== expected) {
    return fail(
      'That sign-in could not be verified, so nothing was connected. Start again from Setup — this check exists to stop somebody else’s Planning Center account being attached to your church.'
    )
  }

  const code = url.searchParams.get('code')
  if (code === null) {
    return fail('Planning Center sent the browser back without an authorization code, so there was nothing to exchange.')
  }

  const viewer = await getViewer()
  const gate = permissionCheck(viewer, 'admin.manage_integrations')
  if (!gate.allowed) return fail(gate.note)

  const app = oauthApp()
  if (app === null) return fail(PC_OAUTH_NOT_CONFIGURED)

  const exchanged = await exchangeCode({
    app,
    siteUrl: siteUrl(request),
    code,
  })
  if (!exchanged.ok) return fail(exchanged.error)

  await storeOAuthConnection({
    churchId: viewer.churchId,
    personId: viewer.personId,
    tokens: exchanged.value,
  })

  return NextResponse.redirect(`${back}?pc_connected=1`)
}
