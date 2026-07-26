import 'server-only'

/**
 * Identity changes are document boundaries — HANDOFF.md §3.
 *
 * Every signed-in screen in Fold is redacted for exactly one reader, and that
 * redaction is delivered as RSC payload embedded in the document that served
 * it. So a *soft* identity change — a Server Function that writes the session
 * cookie and lets the client router patch the page in place — leaves the
 * previous reader's flight chunks in the live document. Measured on the dev
 * viewer switch: after moving from an elder to an administrator,
 * `document.documentElement.outerHTML` still contained `elders_only` note
 * bodies the administrator may not read, even though a fresh server request for
 * the administrator contained none of them.
 *
 * For a development switch driven by one person that is untidy. For a real
 * sign-out or account switch it is §3 breaking: the next person at the keyboard
 * can read the last one's care notes out of the DOM, and the Back button can
 * restore the whole document.
 *
 * Hence the rule, and it applies to sign-in, sign-out and account switch
 * alike: an identity change is a plain form POST to a Route Handler that
 * answers with the response built here. A 303 makes the browser perform a
 * top-level GET, which discards the old document along with its router cache
 * and its embedded payload. It is never a Server Function that writes the
 * session cookie, because those re-render in place — that is the whole defect.
 *
 * Nothing here reads a session or knows what a viewer is. It is the transport
 * half of the boundary, which is what makes it testable without a server.
 */

/**
 * The cookie write that accompanies an identity change: establishing a session,
 * or clearing one. There is no "leave it alone" case — a request that does not
 * change identity does not belong on this path.
 */
export type SessionCookieChange =
  | { name: string; value: string; maxAgeSeconds?: number }
  | { name: string; clear: true }

/** Cookie names are tokens. Anything else can smuggle attributes into the header. */
const COOKIE_NAME = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/

/**
 * The response every identity change returns.
 *
 * `to` is an absolute path on this origin, never a value taken from the
 * request: a caller-supplied destination is how sign-in flows grow an open
 * redirect.
 */
export function identityChangeResponse({
  request,
  to,
  cookie,
}: {
  request: Request
  to: string
  cookie: SessionCookieChange
}): Response {
  return new Response(null, {
    // 303 See Other, so the browser turns the POST into a fresh top-level GET.
    // This is the line that makes the change a new document instead of a patch
    // applied to the old one.
    status: 303,
    headers: {
      location: sameOriginDestination(request, to),
      'set-cookie': serializeSessionCookie(cookie, {
        secure: isSecureRequest(request),
      }),
      // The redirect carries a Set-Cookie, so it must never be replayed from a
      // cache.
      'cache-control': 'no-store',
      // And the document being left behind must not survive somewhere the Back
      // button can restore it from: clearing "cache" evicts this origin's
      // back/forward cache entries, which is the difference between a sign-out
      // and a sign-out that is one keypress from being undone. Browsers honour
      // this header only in secure contexts, so it is hardening on top of the
      // 303, not a substitute for it.
      'clear-site-data': '"cache", "storage"',
    },
  })
}

/**
 * Whether this submission came from our own pages.
 *
 * Server Functions get an origin check from the framework. A Route Handler does
 * not, and a POST endpoint that clears sessions is worth forging — so this
 * checks the header a browser always sends on a cross-document form POST, and
 * refuses the request when it is missing rather than assuming the best.
 */
export function isSameOriginSubmission(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (origin === null) return false

  try {
    return new URL(origin).origin === new URL(request.url).origin
  } catch {
    return false
  }
}

function sameOriginDestination(request: Request, to: string): string {
  const protocolRelative = to[1] === '/' || to[1] === '\\'
  if (!to.startsWith('/') || protocolRelative) {
    throw new Error(
      `An identity change may only redirect to a path on this origin. Got: ${to}`
    )
  }
  return new URL(to, request.url).toString()
}

function serializeSessionCookie(
  cookie: SessionCookieChange,
  { secure }: { secure: boolean }
): string {
  if (!COOKIE_NAME.test(cookie.name)) {
    throw new Error(`Not a usable cookie name: ${cookie.name}`)
  }

  const attributes = ['Path=/', 'HttpOnly', 'SameSite=Lax']
  if (secure) attributes.push('Secure')

  if ('clear' in cookie) {
    // Max-Age and Expires both, so a browser that honours only one of them
    // still drops the session.
    return [
      `${cookie.name}=`,
      ...attributes,
      'Max-Age=0',
      'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    ].join('; ')
  }

  const parts = [
    `${cookie.name}=${encodeURIComponent(cookie.value)}`,
    ...attributes,
  ]
  if (cookie.maxAgeSeconds !== undefined) {
    parts.push(`Max-Age=${Math.floor(cookie.maxAgeSeconds)}`)
  }
  return parts.join('; ')
}

/**
 * Secure is set from the request, and only ever added: a forged
 * `x-forwarded-proto: http` on a real HTTPS request must not be able to
 * downgrade the session cookie.
 */
function isSecureRequest(request: Request): boolean {
  if (new URL(request.url).protocol === 'https:') return true
  const forwarded = request.headers.get('x-forwarded-proto')
  return forwarded?.split(',')[0]?.trim() === 'https'
}
