'use client'

import Link from 'next/link'
import { useLinkStatus } from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

import {
  BADGED_SECTIONS,
  PHONE_SECTIONS,
  RAIL_LABELS,
  type RailSection,
  pathForSection,
  sectionForPath,
  sectionsBehindMore,
} from '@/domain/navigation'

import { FoldLogo } from './logo'

/**
 * Navigation, in two shapes from one source.
 *
 * On a desktop it is the 232px ink rail from `Fold Web.dc.html`. On a phone the
 * rail is useless — it would eat two thirds of a 375px screen — so it becomes a
 * bottom tab bar, which is what a leader can reach one-handed while standing in a
 * foyer. Both are rendered from the same section list and the same badges, so
 * neither can offer something the other does not.
 *
 * Which four sections get a tab is decided in `@/domain/navigation` and tested,
 * rather than picked here.
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
  const [moreOpen, setMoreOpen] = useState(false)

  const phoneTabs = sections.filter((section) =>
    (PHONE_SECTIONS as readonly string[]).includes(section)
  )
  const behindMore = sectionsBehindMore(sections)

  const badgeFor = (section: RailSection) =>
    BADGED_SECTIONS.includes(section) ? badges[section] : undefined

  /** A count worth showing on More, so what is hidden is not silently hidden. */
  const moreBadge = behindMore.reduce(
    (sum, section) => sum + (badgeFor(section) ?? 0),
    0
  )

  return (
    <>
      {/* ── Desktop rail ── */}
      <nav aria-label="Sections" className="fold-rail">
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
            const badge = badgeFor(section)
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
                {/* Never a zero — a badge reading 0 is noise pretending to be
                    information. */}
                {badge !== undefined && badge > 0 && <Badge count={badge} />}
                {/* Marks the item you pressed while its page loads. Has to be a
                    child of the Link: `useLinkStatus` reads the status of the
                    Link it is rendered inside. */}
                <Pending />
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
          <Avatar initials={viewer.initials} />
          <span style={{ minWidth: 0 }}>
            <span className="fold-rail-name">{viewer.name}</span>
            <span className="fold-rail-role">{viewer.roleLine}</span>
          </span>
        </div>
      </nav>

      {/* ── Phone tab bar ── */}
      <nav aria-label="Sections" className="fold-tabbar">
        {phoneTabs.map((section) => {
          const isCurrent = section === current
          const badge = badgeFor(section)
          return (
            <Link
              key={section}
              href={pathForSection(section)}
              aria-current={isCurrent ? 'page' : undefined}
              className="fold-tab"
              onClick={() => setMoreOpen(false)}
            >
              <span className="fold-tab-label">{RAIL_LABELS[section]}</span>
              {badge !== undefined && badge > 0 && (
                <Badge count={badge} small />
              )}
              <Pending />
            </Link>
          )
        })}

        {behindMore.length > 0 && (
          <button
            type="button"
            className="fold-tab"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((open) => !open)}
          >
            <span className="fold-tab-label">
              {moreOpen ? 'Close' : 'More'}
            </span>
            {/* What is behind More still counts, so nothing is hidden silently. */}
            {moreBadge > 0 && <Badge count={moreBadge} small />}
          </button>
        )}
      </nav>

      {/* ── The More sheet ── */}
      {moreOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fold-sheet-scrim"
            onClick={() => setMoreOpen(false)}
          />
          <div className="fold-sheet" role="dialog" aria-label="More sections">
            <div className="fold-sheet-head">
              <Avatar initials={viewer.initials} />
              <span style={{ minWidth: 0 }}>
                <span className="fold-rail-name">{viewer.name}</span>
                <span className="fold-rail-role">{viewer.roleLine}</span>
              </span>
            </div>
            <div className="fold-sheet-links">
              {behindMore.map((section) => {
                const badge = badgeFor(section)
                return (
                  <Link
                    key={section}
                    href={pathForSection(section)}
                    aria-current={section === current ? 'page' : undefined}
                    onClick={() => setMoreOpen(false)}
                  >
                    <span>{RAIL_LABELS[section]}</span>
                    {badge !== undefined && badge > 0 && (
                      <Badge count={badge} small />
                    )}
                  </Link>
                )
              })}
            </div>
            <form action="/auth/sign-out" method="post">
              <button type="submit" className="fold-sheet-signout">
                Sign out
              </button>
            </form>
          </div>
        </>
      )}
    </>
  )
}

/**
 * Sets `data-pending` on the enclosing rail link while its page is loading.
 *
 * `useLinkStatus` reports the pending state of the `<Link>` this is rendered
 * inside, so it must be a child of that Link rather than a sibling. It renders no
 * box of its own — the styling hangs off the attribute in `globals.css`, because
 * an element that appears mid-navigation would shift the label it sits beside.
 *
 * Next's own guidance is that route-level `loading.tsx` and prefetching come
 * first, and both are now in place; this covers the gap they cannot, which is the
 * moment between the click and the boundary appearing.
 */
function Pending() {
  const { pending } = useLinkStatus()
  if (!pending) return null
  return <span aria-hidden="true" data-rail-pending="true" hidden />
}

function Badge({ count, small }: { count: number; small?: boolean }) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-display)',
        fontSize: small ? '0.625rem' : '0.6875rem',
        fontWeight: 700,
        minWidth: small ? 18 : 20,
        textAlign: 'center',
        padding: '2px 6px',
        borderRadius: 'var(--radius-pill)',
        background: 'var(--brand)',
        color: 'var(--on-brand)',
      }}
    >
      {count}
    </span>
  )
}

function Avatar({ initials }: { initials: string }) {
  return (
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
      {initials}
    </span>
  )
}
