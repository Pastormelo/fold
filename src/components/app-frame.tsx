import {
  CARE_SECTIONS,
  RAIL_SECTIONS,
  type RailSection,
} from '@/domain/navigation'
import { CONTACT_WINDOW_DAYS } from '@/domain/coverage'
import { getRailBadges, getViewerSummary } from '@/data/records'

import { FoldLogo } from './logo'
import { Rail } from './rail'

/**
 * The frame every signed-in screen sits in — the rail, the top bar, and the
 * scrolling body. From `Fold Web.dc.html`.
 *
 * Rendered once, by `(signed-in)/layout.tsx`, rather than by each page. That is
 * the difference between a click that feels instant and one that appears to hang:
 * a layout is not re-rendered on navigation, so the rail stays on screen and the
 * viewer lookup and badge counts do not run again. When this was inside every
 * page, every navigation re-queried both before anything could change, and the
 * `loading.tsx` boundary had nowhere to sit that would not also blank the
 * navigation.
 *
 * The top bar is search, the quiet-window pill, and Log care. I had built a
 * header showing the viewer's name and a sign-out button instead, which put
 * identity in the wrong place twice and left no way to log care from anywhere but
 * a person's record. Identity belongs in the rail footer, where the design puts
 * it; the top bar is for doing something.
 *
 * A Server Component: it resolves the viewer and the badge counts, and passes down
 * only what the rail needs. The viewer object never crosses into a Client
 * Component.
 */
export async function AppFrame({ children }: { children: React.ReactNode }) {
  const [viewer, badges] = await Promise.all([
    getViewerSummary(),
    getRailBadges(),
  ])

  // §8.4 applied to navigation: a section this viewer could not read is not
  // offered. An administrator with no care clearance sees Setup and Reports, and
  // no Confidential.
  const sections: RailSection[] = RAIL_SECTIONS.filter((section) =>
    CARE_SECTIONS.includes(section) ? viewer.clearanceTier !== null : true
  )

  const initials = viewer.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase()

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Rail
        sections={sections}
        badges={badges}
        viewer={{
          name: viewer.displayName,
          initials,
          roleLine: `${viewer.roleLabels.join(' · ')} · ${viewer.clearanceLabel}`,
        }}
      />

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <header
          className="fold-topbar"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '14px 32px',
            borderBottom: '1px solid var(--border-default)',
            background: 'var(--surface-card)',
          }}
        >
          {/* The logo only appears here on a phone, where the rail that
              normally carries it is replaced by the bottom tab bar. */}
          <span className="fold-topbar-phone-only">
            <FoldLogo fontSize={19} tone="ink" />
          </span>
          {/* Not wired to anything yet, and disabled rather than pretending.
              A search box that swallows what you type is worse than none. */}
          <input
            type="search"
            placeholder="Search is not built yet"
            disabled
            aria-label="Search"
            className="fold-topbar-desktop-only"
            style={{
              font: 'inherit',
              fontSize: '0.9375rem',
              flex: 1,
              maxWidth: 560,
              padding: '11px 16px',
              borderRadius: 'var(--radius-pill)',
              border: '1px solid var(--border-default)',
              background: 'var(--surface-sunken)',
              color: 'var(--text-muted)',
            }}
          />

          {/* The window every "overdue" on every screen is measured against,
              stated once so nobody has to guess what the numbers mean. */}
          <span
            className="eyebrow fold-topbar-desktop-only"
            style={{
              fontSize: '0.625rem',
              whiteSpace: 'nowrap',
              padding: '7px 14px',
              borderRadius: 'var(--radius-pill)',
              border: '1px solid var(--brand-soft-border)',
              background: 'var(--brand-soft)',
              color: 'var(--ofc-orange-700)',
            }}
          >
            Quiet window · {CONTACT_WINDOW_DAYS} days
          </span>

          <div style={{ flex: 1 }} />

          <a
            href="/notes"
            className="eyebrow"
            style={{
              fontSize: '0.6875rem',
              whiteSpace: 'nowrap',
              textDecoration: 'none',
              padding: '11px 18px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-inverse)',
              color: 'var(--ofc-paper)',
            }}
          >
            Log care
          </a>

          {/* A form POST, not a link: ending a session has to replace the
              document, or the previous reader's payload stays in it. See
              @/auth/identity-change. */}
          <form
            action="/auth/sign-out"
            method="post"
            className="fold-topbar-desktop-only"
          >
            <button
              type="submit"
              style={{
                font: 'inherit',
                fontSize: '0.8125rem',
                fontWeight: 600,
                padding: '9px 13px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-default)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              Sign out
            </button>
          </form>
        </header>

        <main
          className="fold-main"
          style={{
            flex: 1,
            padding: '30px 32px 48px',
            background: 'var(--surface-page)',
          }}
        >
          <div style={{ maxWidth: 1240 }}>{children}</div>
        </main>
      </div>
    </div>
  )
}
