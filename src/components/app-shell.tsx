import {
  CARE_SECTIONS,
  RAIL_SECTIONS,
  type RailSection,
} from '@/domain/navigation'
import { getRailBadges, getViewerSummary } from '@/data/records'

/**
 * The frame every signed-in screen sits in — the rail, the header strip, and the
 * scrolling body. From `Fold Web.dc.html`.
 *
 * A Server Component: it resolves the viewer and the badge counts, and passes
 * down only what the rail needs to render. The viewer object itself never
 * crosses into a Client Component.
 */
import { Rail } from './rail'

export async function AppShell({
  title,
  eyebrow,
  action,
  children,
}: {
  title: string
  /** The small tracked-uppercase line above the title. */
  eyebrow?: string
  /** Optional right-aligned control, e.g. "Log care". */
  action?: React.ReactNode
  children: React.ReactNode
}) {
  const [viewer, badges] = await Promise.all([
    getViewerSummary(),
    getRailBadges(),
  ])

  // §8.4 applied to navigation: a section this viewer could not read is not
  // offered. An administrator with no care clearance sees Setup and Reports,
  // and no Confidential.
  const sections: RailSection[] = RAIL_SECTIONS.filter((section) =>
    CARE_SECTIONS.includes(section) ? viewer.clearanceTier !== null : true
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Rail
        sections={sections}
        badges={badges}
        churchName={viewer.churchName}
      />

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* The header strip: who you are, what you can read, and how to leave. */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '14px 32px',
            borderBottom: '1px solid var(--border-default)',
            background: 'var(--surface-card)',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
              {viewer.displayName}
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              {viewer.roleLabels.join(' · ')}
              {' — '}
              {viewer.clearanceLabel}
            </div>
          </div>

          {action}

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
                padding: '7px 13px',
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
          <div style={{ maxWidth: 1100 }}>
            {eyebrow && <p className="overline">{eyebrow}</p>}
            <h1
              style={{
                fontSize: 'clamp(1.75rem, 1.3rem + 1.6vw, 2rem)',
                margin: eyebrow ? '8px 0 0' : 0,
              }}
            >
              {title}
            </h1>
            <div style={{ marginTop: 26 }}>{children}</div>
          </div>
        </main>
      </div>
    </div>
  )
}
