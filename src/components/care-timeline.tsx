import type { CareTimeline as CareTimelineData } from '@/domain/access'
import { tierName } from '@/domain/tiers'

const TIER_ACCENT = {
  all_leaders: 'var(--tier-all-leaders)',
  staff_and_elders: 'var(--tier-staff-and-elders)',
  elders_only: 'var(--tier-elders-only)',
} as const

/**
 * A person's care history.
 *
 * The withheld rows are the point of this component. Each one occupies the same
 * space as a visible note, shows the date, and says why it is closed — §3 rule
 * 3, "never a blank space and never a lie". A withheld note is not filtered out
 * of the list, because a gap in a timeline reads as "no care happened".
 */
export function CareTimeline({ care }: { care: CareTimelineData }) {
  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline gap-3">
        <h2 style={{ fontSize: '1.375rem' }}>Care</h2>
        {/* Both numbers come off the same object the rows were built from. */}
        <span
          className="text-[0.9375rem]"
          style={{ color: 'var(--text-muted)' }}
        >
          {care.visibleCount} visible
          {care.hiddenCount > 0 ? ` · ${care.hiddenCount} withheld` : ''}
        </span>
      </header>

      {care.hiddenNote !== '' && (
        <p
          className="text-[0.9375rem]"
          style={{
            background: 'var(--surface-sunken)',
            border: '1px dashed var(--border-strong)',
            borderRadius: 'var(--radius-md)',
            padding: '13px 15px',
            color: 'var(--text-secondary)',
            textWrap: 'pretty',
          }}
        >
          {care.hiddenNote}
        </p>
      )}

      {care.notes.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>
          No care logged yet. That is a fact about the record, not about the
          person.
        </p>
      )}

      <ol className="flex list-none flex-col gap-3 p-0">
        {care.notes.map((note) => {
          const visible = note.access === 'visible'
          // Longhand throughout: mixing `border` with `borderLeft` lets the
          // shorthand clobber the tier stripe on a rerender.
          const edge = visible
            ? '1px solid var(--border-subtle)'
            : '1px dashed var(--border-strong)'
          return (
            <li
              key={note.id}
              style={{
                background: visible
                  ? 'var(--surface-card)'
                  : 'var(--surface-sunken)',
                borderTop: edge,
                borderRight: edge,
                borderBottom: edge,
                borderLeft: `3px solid ${TIER_ACCENT[note.visibilityTier]}`,
                borderRadius: 'var(--radius-md)',
                boxShadow: visible ? 'var(--shadow-xs)' : 'none',
                padding: '14px 16px',
              }}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <time
                  dateTime={note.occurredAt.toISOString()}
                  className="text-[0.8125rem]"
                  style={{ color: 'var(--text-muted)', fontWeight: 600 }}
                >
                  {note.occurredAt.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    timeZone: 'UTC',
                  })}
                </time>
                <span
                  className="overline"
                  style={{
                    fontSize: '0.5625rem',
                    color: TIER_ACCENT[note.visibilityTier],
                    letterSpacing: '0.1em',
                  }}
                >
                  {tierName(note.visibilityTier)}
                </span>
                {note.access === 'visible' && (
                  <span
                    className="text-[0.8125rem]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {note.authorName}
                  </span>
                )}
              </div>

              {note.access === 'visible' ? (
                <p
                  className="mt-2 text-[0.9375rem]"
                  style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
                >
                  {note.body}
                </p>
              ) : (
                <p
                  className="mt-2 text-[0.9375rem] italic"
                  style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
                >
                  {note.disclosure}
                </p>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
