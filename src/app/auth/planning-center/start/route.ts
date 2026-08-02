import { randomBytes } from 'node:crypto'

import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

import { permissionCheck } from '@/domain/roles'
import { getViewer } from '@/data/viewer'
import {
  PC_OAUTH_NOT_CONFIGURED,
  authorizeUrl,
  oauthApp,
} from '@/planning-center/oauth'
import { siteUrl } from '@/planning-center/site'

/**
 * Where "Sign in with Planning Center" begins.
 *
 * A GET route rather than a Server Action, because it ends in a top-level
 * navigation to another origin's consent screen — which is a thing a link does and
 * an action cannot.
 *
 * Being a plain GET means it is also reachable by anybody who types the URL, so the
 * permission is checked here and not only on the button that points at it. §8.4 is
 * about not *offering* a control that will be refused; this is the other half —
 * refusing it when it is reached anyway.
 *
 * The `state` value is minted here, stored in an httpOnly cookie, and checked on
 * the way back. Without it, somebody could hand a signed-in administrator a
 * crafted callback URL and attach *their* Planning Center account to this church,
 * whose directory would then fill up with a stranger's people.
 */

export const STATE_COOKIE = 'fold_pc_oauth_state'

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin
  const back = `${origin}/admin`

  const viewer = await getViewer()
  const gate = permissionCheck(viewer, 'admin.manage_integrations')
  if (!gate.allowed) {
    return NextResponse.redirect(
      `${back}?pc_error=${encodeURIComponent(gate.note)}`
    )
  }

  const app = oauthApp()
  if (app === null) {
    return NextResponse.redirect(
      `${back}?pc_error=${encodeURIComponent(PC_OAUTH_NOT_CONFIGURED)}`
    )
  }

  const state = randomBytes(32).toString('base64url')

  const store = await cookies()
  store.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: origin.startsWith('https://'),
    path: '/',
    // Ten minutes is long enough to read a consent screen and short enough that
    // an abandoned attempt does not leave a usable value lying around.
    maxAge: 600,
  })

  return NextResponse.redirect(
    authorizeUrl({ app, siteUrl: siteUrl(request), state })
  )
}
