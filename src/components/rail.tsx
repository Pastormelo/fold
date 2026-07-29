'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import {
  BADGED_SECTIONS,
  RAIL_LABELS,
  type RailSection,
  pathForSection,
  sectionForPath,
} from '@/domain/navigation'

/**
 * The left rail, from `Fold Web.dc.html`.
 *
 * A Client Component only because it needs `usePathname` to mark the current
 * section. Everything it renders was decided on the server: which sections this
 * viewer may see, and what each badge counts.
 */
export function Rail({
  sections,
  badges,
  churchName,
}: {
  sections: readonly RailSection[]
  /** Counts computed from live data. A section absent here shows no badge. */
  badges: Partial<Record<RailSection, number>>
  churchName: string
}) {
  const current = sectionForPath(usePathname())

  return (
    <nav
      aria-label="Sections"
      style={{
        width: 232,
        flexShrink: 0,
        background: 'var(--surface-inverse)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
      }}
    >
      <div style={{ padding: '26px 24px 22px' }}>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: '0.04em',
            color: 'var(--ofc-paper)',
          }}
        >
          F<span style={{ color: 'var(--brand)' }}>O</span>LD
        </div>
        <div
          className="overline"
          style={{
            fontSize: '0.5625rem',
            letterSpacing: '0.16em',
            color: 'var(--ofc-n-500)',
            marginTop: 4,
          }}
        >
          Church care platform
        </div>
      </div>

      <div
        style={{
          padding: '0 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {sections.map((section) => {
          const isCurrent = section === current
          const badge = BADGED_SECTIONS.includes(section)
            ? badges[section]
            : undefined
          return (
            <Link
              key={section}
              href={pathForSection(section)}
              aria-current={isCurrent ? 'page' : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '9px 12px',
                borderRadius: 'var(--radius-sm)',
                textDecoration: 'none',
                fontSize: '0.9375rem',
                fontWeight: isCurrent ? 700 : 500,
                background: isCurrent
                  ? 'var(--surface-inverse-2)'
                  : 'transparent',
                color: isCurrent ? 'var(--ofc-paper)' : 'var(--ofc-n-400)',
              }}
            >
              <span>{RAIL_LABELS[section]}</span>
              {/* Only when there is something to count, and never a zero — a
                  badge reading 0 is noise pretending to be information. */}
              {badge !== undefined && badge > 0 && (
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    minWidth: 20,
                    textAlign: 'center',
                    padding: '2px 6px',
                    borderRadius: 'var(--radius-pill)',
                    background: 'var(--brand)',
                    color: 'var(--on-brand)',
                  }}
                >
                  {badge}
                </span>
              )}
            </Link>
          )
        })}
      </div>

      <div style={{ flex: 1 }} />

      <div
        style={{
          padding: '18px 24px 22px',
          borderTop: '1px solid var(--border-inverse)',
          fontSize: '0.8125rem',
          color: 'var(--ofc-n-500)',
        }}
      >
        {churchName}
      </div>
    </nav>
  )
}
