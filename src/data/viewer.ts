import 'server-only'

import { cache } from 'react'
import { cookies } from 'next/headers'

import type { Viewer } from '@/domain/access'
import { sampleViewers } from './sample'

/**
 * Who is asking — the entry point for every authorization decision.
 *
 * Real authentication is not built yet (HANDOFF.md §10 lists auth and the
 * permission system as the first backend work). What exists here is a viewer
 * switch so the confidentiality tiers can be exercised and reviewed, and it is
 * deliberately loud about that: with no session configured this throws rather
 * than falling back to a default viewer, because a default viewer is a silent
 * authorization bypass.
 *
 * Outside development the switch requires `FOLD_DEMO_MODE=1`. Gating on an
 * explicit variable rather than on `NODE_ENV` is the point: a deployment gets
 * demo behaviour because someone asked for it, never because of which build
 * command ran. Unset, a deployed instance refuses to serve people records at
 * all, which is the correct posture for an app whose whole subject is
 * confidential pastoral care.
 *
 * This module only ever *reads* the session. The write side — sign-in,
 * sign-out, account switch — belongs in a Route Handler using
 * `@/auth/identity-change`, and not in a Server Function, for reasons that
 * module documents.
 *
 * Wrapped in `cache` so every part of one request resolves the same viewer
 * without it being passed from component to component — the Next.js data
 * security guidance, and the thing that keeps a viewer object from drifting
 * into a Client Component.
 */

export const VIEWER_COOKIE = 'fold_dev_viewer'

export class AuthNotConfiguredError extends Error {
  constructor() {
    super(
      'Authentication is not built yet, so Fold will not serve people records. ' +
        'To run this deployment as a demo over sample data, set FOLD_DEMO_MODE=1. ' +
        'See HANDOFF.md §10 and the README section "The auth gap".'
    )
    this.name = 'AuthNotConfiguredError'
  }
}

/**
 * Whether the sample-data viewer switch stands in for a real session.
 *
 * Always on in development. Anywhere else it takes `FOLD_DEMO_MODE=1`, read at
 * request time so it can be turned on or off without a rebuild.
 */
export function demoAuthEnabled(): boolean {
  if (process.env.NODE_ENV !== 'production') return true
  return process.env.FOLD_DEMO_MODE === '1'
}

/**
 * True when this instance is a *deployed* demo rather than a local dev server —
 * the case where the URL may be reachable by people who have no idea the data is
 * fictional and the app has no authentication. The UI says so.
 */
export function isDeployedDemo(): boolean {
  return process.env.NODE_ENV === 'production' && demoAuthEnabled()
}

export const getViewer = cache(async (): Promise<Viewer> => {
  if (!demoAuthEnabled()) {
    // No production fallback. Wire a real session here.
    throw new AuthNotConfiguredError()
  }

  const store = await cookies()
  const requested =
    store.get(VIEWER_COOKIE)?.value ?? process.env.FOLD_DEV_VIEWER ?? ''

  const viewers = sampleViewers()
  const found = viewers.find((viewer) => viewer.personId === requested)

  // Falling back to the *least* privileged viewer, not the most. If the cookie
  // is missing or names someone unknown, the reader should see less than they
  // expected, never more.
  return found ?? leastPrivileged(viewers)
})

function leastPrivileged(viewers: readonly Viewer[]): Viewer {
  const byFewestRoles = [...viewers].sort(
    (a, b) => a.roles.length - b.roles.length
  )
  const fallback = byFewestRoles[0]
  if (!fallback) {
    throw new Error('No viewers available — sample data is empty.')
  }
  return fallback
}

/** Every viewer the switch offers. Empty when demo auth is off. */
export function availableDevViewers(): Viewer[] {
  return demoAuthEnabled() ? sampleViewers() : []
}
