import 'server-only'

import { cache } from 'react'
import { cookies } from 'next/headers'

import type { Viewer } from '@/domain/access'
import { sampleViewers } from './sample'

/**
 * Who is asking — the entry point for every authorization decision.
 *
 * Real authentication is not built yet (HANDOFF.md §10 lists auth and the
 * permission system as the first backend work). What exists here is a
 * development-only viewer switch so the confidentiality tiers can be exercised
 * and reviewed. It is deliberately loud about that: in production it throws
 * rather than falling back to a default viewer, because a default viewer is a
 * silent authorization bypass.
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
      'Authentication is not built yet. Fold refuses to serve people records without a real session — see HANDOFF.md §10.'
    )
    this.name = 'AuthNotConfiguredError'
  }
}

export function devViewerSwitchEnabled(): boolean {
  return process.env.NODE_ENV !== 'production'
}

export const getViewer = cache(async (): Promise<Viewer> => {
  if (!devViewerSwitchEnabled()) {
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

/** Every viewer offered by the dev switch. Empty in production. */
export function availableDevViewers(): Viewer[] {
  return devViewerSwitchEnabled() ? sampleViewers() : []
}
