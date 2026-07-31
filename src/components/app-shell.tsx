import {
  CARE_SECTIONS,
  RAIL_SECTIONS,
  type RailSection,
} from '@/domain/navigation'
import { CONTACT_WINDOW_DAYS } from '@/domain/coverage'
import { getRailBadges, getViewerSummary } from '@/data/records'

import { Rail } from './rail'

/**
 * The frame every signed-in screen sits in — the rail, the top bar, and the
 * scrolling body. From `Fold Web.dc.html`.
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
export async function AppShell({
  title,
  eyebrow,
  action,
  children,
}: {
  title: string
  /** The small tracked-uppercase line above the title. */
  eyebrow?: string
  /** Optional right-aligned control beside the title, e.g. "Reassign people". */
  action?: React.ReactNode
  children: React.ReactNode
}) {
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
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '14px 32px',
            borderBottom: '1px solid var(--border-default)',
            background: 'var(--surface-card)',
          }}
        >
          {/* Not wired to anything yet, and disabled rather than pretending.
              A search box that swallows what you type is worse than none. */}
          <input
            type="search"
            placeholder="Search is not built yet"
            disabled
            aria-label="Search"
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
            className="eyebrow"
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
          <form action="/auth/sign-out" method="post">
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
          style={{
            flex: 1,
            padding: '30px 32px 48px',
            background: 'var(--surface-page)',
          }}
        >
          <div style={{ maxWidth: 1240 }}>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                {eyebrow && <p className="eyebrow">{eyebrow}</p>}
                <h1
                  style={{
                    fontSize: 'clamp(1.75rem, 1.3rem + 1.6vw, 2rem)',
                    margin: eyebrow ? '8px 0 0' : 0,
                  }}
                >
                  {title}
                </h1>
              </div>
              {action}
            </div>
            <div style={{ marginTop: 26 }}>{children}</div>
          </div>
        </main>
      </div>
    </div>
  )
}
