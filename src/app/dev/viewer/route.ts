import {
  identityChangeResponse,
  isSameOriginSubmission,
} from '@/auth/identity-change'
import { sampleViewers } from '@/data/sample'
import { VIEWER_COOKIE, demoAuthEnabled } from '@/data/viewer'

/**
 * The development viewer switch, and the stand-in for sign-out.
 *
 * This is a Route Handler rather than a Server Function on purpose. Writing the
 * session cookie from a Server Function re-renders the current document, which
 * leaves the previous viewer's RSC payload embedded in it — see
 * `@/auth/identity-change` for the measurement. A form POST here answers 303,
 * so the browser loads a new document and the old one is gone.
 *
 * The endpoint verifies its own preconditions rather than trusting the form
 * that called it, because a POST route is reachable directly: refused outright
 * in production, refused cross-origin, and the requested id must name a known
 * viewer. Without that last check this would be a switch into any identity a
 * caller cared to type.
 */

const plainText = { 'content-type': 'text/plain; charset=utf-8' } as const

export async function POST(request: Request): Promise<Response> {
  if (!demoAuthEnabled()) {
    // Not "403": in production this route does not exist.
    return new Response('Not found', { status: 404, headers: plainText })
  }

  if (!isSameOriginSubmission(request)) {
    return new Response('Cross-origin identity change refused.', {
      status: 403,
      headers: plainText,
    })
  }

  const requested = (await request.formData()).get('personId')
  if (typeof requested !== 'string') {
    return new Response('No viewer requested.', {
      status: 400,
      headers: plainText,
    })
  }

  // An empty field is the sign-out case: clear the session and let the viewer
  // guard fall back to the least privileged reader.
  if (requested === '') {
    return identityChangeResponse({
      request,
      to: '/',
      cookie: { name: VIEWER_COOKIE, clear: true },
    })
  }

  const known = sampleViewers().some((viewer) => viewer.personId === requested)
  if (!known) {
    // The requested id is not echoed back. Nothing an unauthenticated caller
    // sends should end up in a response body.
    return new Response('Unknown viewer.', { status: 400, headers: plainText })
  }

  return identityChangeResponse({
    request,
    to: '/',
    cookie: { name: VIEWER_COOKIE, value: requested },
  })
}
