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

import { FoldLogo } from './logo'

/**
 * The left rail, from `Fold Web.dc.html`.
 *
 * A Client Component only because it needs `usePathname` to mark the current
 * section. Everything it renders was decided on the server: which sections this
 * viewer may see, what each badge counts, and who they are.
 *
 * The footer is a person, not the church. The design puts an avatar, a name and a
 * role there, which is the useful thing — the question a leader has while looking
 * at pastoral records is "what am I seeing this as", and the church name never
 * changes.
 */
export function Rail({
  sections,
  badges,
  viewer,
}: {
  sections: readonly RailSection[]
  /** Counts computed from live data. A section absent here shows no badge. */
  badges: Partial<Record<RailSection, number>>
  viewer: { name: string; initials: string; roleLine: string }
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
        <FoldLogo fontSize={26} tone="inverse" />
        <div
          className="eyebrow"
          style={{
            fontSize: '0.5625rem',
            letterSpacing: '0.16em',
            color: 'var(--ofc-n-500)',
            marginTop: 6,
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
          display: 'flex',
          alignItems: 'center',
          gap: 11,
          padding: '16px 20px 20px',
          borderTop: '1px solid var(--border-inverse)',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 34,
            height: 34,
            flexShrink: 0,
            borderRadius: 'var(--radius-pill)',
            background: 'var(--surface-inverse-2)',
            color: 'var(--ofc-n-300)',
            fontFamily: 'var(--font-display)',
            fontSize: '0.75rem',
            fontWeight: 700,
            letterSpacing: '0.04em',
          }}
        >
          {viewer.initials}
        </span>
        <span style={{ minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--ofc-paper)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {viewer.name}
          </span>
          <span
            style={{
              display: 'block',
              fontSize: '0.75rem',
              color: 'var(--ofc-n-500)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {viewer.roleLine}
          </span>
        </span>
      </div>
    </nav>
  )
}
