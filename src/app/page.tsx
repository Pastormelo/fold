import Link from 'next/link'

import { AppShell } from '@/components/app-shell'
import { getOverview } from '@/data/overview'

const STANDING_COLOUR = {
  covered: 'var(--tier-all-leaders)',
  thin: 'var(--ofc-warning)',
  needs_help: 'var(--ofc-danger)',
} as const

/**
 * Overview — "Care across the church", from `Fold Web.dc.html`.
 *
 * Four figures across the top, coverage fold by fold on the left, and the people
 * who have gone longest without anybody speaking to them in a dark card on the
 * right. That last panel is the product's premise turned into a list, which is
 * why it gets the strongest treatment on the page rather than being a row in the
 * table.
 */
export default async function OverviewPage() {
  const overview = await getOverview()

  return (
    <AppShell eyebrow={overview.today} title="Care across the church">
      <div className="flex flex-col gap-6">
        {/* ── The four figures ── */}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {overview.stats.map((stat) => (
            <div
              key={stat.label}
              style={{
                background: 'var(--surface-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                padding: '18px 20px 20px',
              }}
            >
              <span className="eyebrow" style={{ fontSize: '0.625rem' }}>
                {stat.label}
              </span>
              <p
                className="mt-2"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '2.375rem',
                  fontWeight: 800,
                  letterSpacing: '-0.03em',
                  lineHeight: 1,
                  color: stat.alarming
                    ? 'var(--ofc-orange-700)'
                    : 'var(--text-primary)',
                }}
              >
                {stat.value}
              </p>
              <p
                className="mt-2 text-[0.875rem]"
                style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
              >
                {stat.note}
              </p>
            </div>
          ))}
        </section>

        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          {/* ── Coverage by fold ── */}
          <section
            style={{
              background: 'var(--surface-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: '20px 22px 8px',
            }}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <span className="eyebrow" style={{ fontSize: '0.6875rem' }}>
                Coverage by fold
              </span>
              <Link
                href="/people"
                className="text-[0.875rem] font-semibold"
                style={{ color: 'var(--text-brand)' }}
              >
                Reassign people
              </Link>
            </div>

            {overview.folds.length === 0 ? (
              <p
                className="mt-4 mb-5"
                style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
              >
                No folds yet. Until people are under a named elder, there is
                nobody this page can hold accountable — which is the gap it
                exists to show.
              </p>
            ) : (
              <div
                className="mt-4 overflow-x-auto"
                style={{ marginInline: -22, paddingInline: 22 }}
              >
                <table
                  style={{ width: '100%', borderCollapse: 'collapse' }}
                  className="text-left"
                >
                  <thead>
                    <tr>
                      {['Fold', 'Shepherd', 'Coverage', 'Overdue'].map(
                        (heading, index) => (
                          <th
                            key={heading}
                            className="eyebrow"
                            style={{
                              fontSize: '0.5625rem',
                              fontWeight: 700,
                              padding: '0 0 10px',
                              textAlign: index === 3 ? 'right' : 'left',
                              borderBottom: '1px solid var(--border-subtle)',
                            }}
                          >
                            {heading}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {overview.folds.map((fold) => (
                      <tr key={fold.foldId}>
                        <td
                          style={{
                            padding: '14px 16px 14px 0',
                            borderBottom: '1px solid var(--border-subtle)',
                          }}
                        >
                          <span className="block font-semibold">
                            {fold.foldName}
                          </span>
                          <span
                            className="block text-[0.8125rem]"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {fold.peopleLabel}
                          </span>
                        </td>

                        <td
                          style={{
                            padding: '14px 16px 14px 0',
                            borderBottom: '1px solid var(--border-subtle)',
                          }}
                        >
                          <span className="flex items-center gap-2">
                            <span
                              aria-hidden="true"
                              style={{
                                display: 'grid',
                                placeItems: 'center',
                                width: 28,
                                height: 28,
                                flexShrink: 0,
                                borderRadius: 'var(--radius-pill)',
                                background: 'var(--surface-sunken)',
                                border: '1px solid var(--border-subtle)',
                                fontFamily: 'var(--font-display)',
                                fontSize: '0.625rem',
                                fontWeight: 700,
                                color: 'var(--text-muted)',
                              }}
                            >
                              {fold.elderInitials}
                            </span>
                            <span className="text-[0.9375rem] whitespace-nowrap">
                              {fold.elderName}
                            </span>
                          </span>
                        </td>

                        <td
                          style={{
                            padding: '14px 16px 14px 0',
                            minWidth: 170,
                            borderBottom: '1px solid var(--border-subtle)',
                          }}
                        >
                          {/* Three segments, summing to 100 so the bar always
                              fills — a gap at the end would read as data the
                              page failed to load. */}
                          <span
                            className="flex gap-[3px]"
                            style={{ height: 7 }}
                            role="img"
                            aria-label={`${fold.standingLabel}, ${fold.overdue} overdue`}
                          >
                            {(
                              [
                                ['recent', 'var(--tier-all-leaders)'],
                                ['warning', 'var(--ofc-warning)'],
                                ['overdue', 'var(--brand)'],
                              ] as const
                            ).map(([key, colour]) =>
                              fold.segments[key] > 0 ? (
                                <span
                                  key={key}
                                  style={{
                                    width: `${fold.segments[key]}%`,
                                    background: colour,
                                    borderRadius: 'var(--radius-pill)',
                                  }}
                                />
                              ) : null
                            )}
                          </span>
                          <span
                            className="eyebrow mt-2 block"
                            style={{
                              fontSize: '0.5625rem',
                              color: STANDING_COLOUR[fold.standing],
                            }}
                          >
                            {fold.standingLabel}
                          </span>
                        </td>

                        <td
                          style={{
                            padding: '14px 0',
                            textAlign: 'right',
                            borderBottom: '1px solid var(--border-subtle)',
                            fontFamily: 'var(--font-display)',
                            fontSize: '1.125rem',
                            fontWeight: 700,
                            color:
                              fold.overdue > 0
                                ? 'var(--ofc-orange-700)'
                                : 'var(--text-primary)',
                          }}
                        >
                          {fold.overdue}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── Longest without contact ── */}
          <section
            style={{
              background: 'var(--surface-inverse)',
              borderRadius: 'var(--radius-lg)',
              padding: '20px 22px',
            }}
          >
            <span
              className="eyebrow"
              style={{ fontSize: '0.6875rem', color: 'var(--ofc-n-400)' }}
            >
              Longest without contact
            </span>

            {overview.quietNote ? (
              <p
                className="mt-4 text-[0.9375rem]"
                style={{ color: 'var(--ofc-n-400)', textWrap: 'pretty' }}
              >
                {overview.quietNote}
              </p>
            ) : (
              <ul className="mt-2 flex flex-col">
                {overview.quiet.map((person) => (
                  <li
                    key={person.personId}
                    style={{
                      borderBottom: '1px solid var(--border-inverse)',
                      padding: '14px 0',
                    }}
                  >
                    <Link
                      href={`/people/${person.personId}`}
                      className="flex items-baseline justify-between gap-3"
                      style={{ textDecoration: 'none' }}
                    >
                      <span style={{ minWidth: 0 }}>
                        <span
                          className="block font-semibold"
                          style={{ color: 'var(--ofc-paper)' }}
                        >
                          {person.fullName}
                        </span>
                        <span
                          className="block text-[0.8125rem]"
                          style={{ color: 'var(--ofc-n-500)' }}
                        >
                          {person.placeLabel}
                        </span>
                      </span>
                      {/* "never" rather than a number, because there is no
                          number to give and 0d would be a lie in the wrong
                          direction. */}
                      <span
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: '0.8125rem',
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                          color: person.neverContacted
                            ? 'var(--ofc-danger)'
                            : 'var(--brand)',
                        }}
                      >
                        {person.daysLabel}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {overview.quiet.length > 0 && (
              <Link
                href="/reports"
                className="eyebrow mt-4 block text-center"
                style={{
                  fontSize: '0.625rem',
                  textDecoration: 'none',
                  padding: '11px 14px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--brand)',
                  color: 'var(--on-brand)',
                }}
              >
                See the whole report
              </Link>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  )
}
