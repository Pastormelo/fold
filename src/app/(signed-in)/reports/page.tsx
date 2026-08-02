import { PageShell } from '@/components/page-shell'
import { getReportPage } from '@/data/reports'

export const metadata = { title: 'Reports · Fold' }

/**
 * Reports — what an elders' meeting can be handed.
 *
 * The design's Elders Report is mostly a shepherd's own writing, with figures
 * alongside it. Fold produces the figures and does not write the narrative, and
 * this page says so rather than generating a paragraph that sounds like one. The
 * report's own framing is the reason: "everything below was logged by a shepherd
 * at the time it happened, not remembered in this room" only holds if nothing on
 * the page is invented.
 */
export default async function ReportsPage() {
  const page = await getReportPage()

  if (!page.gate.allowed) {
    return (
      <PageShell eyebrow="Not available to you" title="Reports">
        <p
          style={{
            color: 'var(--text-secondary)',
            textWrap: 'pretty',
            maxWidth: 620,
          }}
        >
          {page.gate.note}
        </p>
      </PageShell>
    )
  }

  return (
    <PageShell eyebrow={page.asOf} title="Shepherding report">
      <div className="flex flex-col gap-9">
        <p
          style={{
            color: 'var(--text-secondary)',
            textWrap: 'pretty',
            maxWidth: 680,
          }}
        >
          {page.churchName}. Everything below was logged by a leader at the time
          it happened, not remembered in a meeting. Fold produces these figures;
          the account of what they mean is yours to write.
        </p>

        {/* ── The four numbers ── */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {page.stats.map((stat) => (
            <div
              key={stat.label}
              style={{
                background: 'var(--surface-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                padding: '16px 18px',
              }}
            >
              <span className="eyebrow" style={{ fontSize: '0.5625rem' }}>
                {stat.label}
              </span>
              <p
                className="mt-2"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '2rem',
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                }}
              >
                {stat.value}
              </p>
              <p
                className="mt-1 text-[0.875rem]"
                style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
              >
                {stat.note}
              </p>
            </div>
          ))}
        </section>

        <p style={{ textWrap: 'pretty', maxWidth: 680 }}>
          {page.coverage.summary}
        </p>

        {/* ── What needs the elders ── */}
        <section className="flex flex-col gap-3">
          <h2 style={{ fontSize: '1.125rem' }}>What needs a decision</h2>
          {page.concerns.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}>
              No fold is carrying more than it can or has let anyone slip past
              the window. That is worth saying out loud rather than leaving as
              an empty section.
            </p>
          ) : (
            page.concerns.map((concern) => (
              <article
                key={concern.foldId}
                style={{
                  background: 'var(--surface-card)',
                  borderTop: '1px solid var(--border-subtle)',
                  borderRight: '1px solid var(--border-subtle)',
                  borderBottom: '1px solid var(--border-subtle)',
                  borderLeft: '3px solid var(--ofc-danger)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px 16px',
                }}
              >
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="font-semibold">{concern.foldName}</span>
                  <span
                    className="text-[0.875rem]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {concern.elderName}
                  </span>
                </div>
                <p
                  className="mt-1 text-[0.9375rem]"
                  style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
                >
                  {concern.reason}
                </p>
              </article>
            ))
          )}
        </section>

        {/* ── Fold by fold ── */}
        <section className="flex flex-col gap-3">
          <h2 style={{ fontSize: '1.125rem' }}>Fold by fold</h2>
          {page.folds.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}>
              No folds yet. Until people are under a named elder, there is
              nobody this report can hold accountable.
            </p>
          ) : (
            page.folds.map((fold) => (
              <article
                key={fold.foldId}
                style={{
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px 16px',
                }}
              >
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="font-semibold">{fold.foldName}</span>
                  <span
                    className="text-[0.875rem]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {fold.elderName} · {fold.coverage.total}{' '}
                    {fold.coverage.total === 1 ? 'person' : 'people'}
                    {fold.coverage.overdue > 0 &&
                      ` · ${fold.coverage.overdue} overdue`}
                  </span>
                </div>
                <p
                  className="mt-1 text-[0.9375rem]"
                  style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
                >
                  {fold.coverage.summary}
                </p>
              </article>
            ))
          )}
        </section>

        {/* ── Nobody's ── */}
        {page.unfolded.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 style={{ fontSize: '1.125rem' }}>Under no elder</h2>
            <p
              className="text-[0.9375rem]"
              style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
            >
              These are members no fold covers, so no fold&rsquo;s numbers above
              account for them. This is the gap between folds rather than a
              problem inside one.
            </p>
            <ul className="flex flex-col gap-1">
              {page.unfolded.map((person) => (
                <li
                  key={person.id}
                  className="flex flex-wrap items-baseline gap-x-3 text-[0.9375rem]"
                >
                  <a href={`/people/${person.id}`} style={{ color: 'inherit' }}>
                    {person.fullName}
                  </a>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {person.label}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Waiting on somebody ── */}
        {page.overdueJourneys.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 style={{ fontSize: '1.125rem' }}>Waiting on somebody</h2>
            <ul className="flex flex-col gap-2">
              {page.overdueJourneys.map((journey) => (
                <li
                  key={`${journey.personName}-${journey.templateName}-${journey.stepTitle}`}
                  className="flex flex-wrap items-baseline gap-x-3 text-[0.9375rem]"
                >
                  <span className="font-semibold">{journey.personName}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {journey.templateName} — {journey.stepTitle}
                  </span>
                  <span style={{ color: 'var(--ofc-danger)' }}>
                    {journey.dueLabel}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── The confidential appendix, counted ── */}
        <section className="flex flex-col gap-2">
          <h2 style={{ fontSize: '1.125rem' }}>
            Confidential appendix · elders only
          </h2>
          {/* The count, never the content. Knowing a conversation is waiting is
              not the same as reading it, and withholding the count too would
              leave a leader unable even to ask. */}
          <p style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}>
            {page.appendix.note}
          </p>
        </section>
      </div>
    </PageShell>
  )
}
