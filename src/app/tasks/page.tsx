import { AppShell } from '@/components/app-shell'
import { getTasksPage } from '@/data/tasks'

export const metadata = { title: 'Tasks · Fold' }

const URGENCY_ACCENT = {
  overdue: 'var(--ofc-danger)',
  soon: 'var(--ofc-warning)',
  open: 'var(--border-strong)',
} as const

/**
 * Tasks — what is owed, derived rather than stored.
 *
 * There is no tasks table and nothing here can be ticked off. Every row is a
 * consequence of something else being true, so it goes away when you do the thing:
 * log the call, name the elder, assign the connector. A tick box would be a second
 * record able to disagree with the first — a task saying "call Lena" outliving the
 * logged call is the failure that makes people stop trusting a list.
 */
export default async function TasksPage() {
  const page = await getTasksPage()

  return (
    <AppShell
      eyebrow={
        page.rows.length === 0
          ? 'Nothing owed'
          : page.overdueCount > 0
            ? `${page.rows.length} owed · ${page.overdueCount} past their window`
            : `${page.rows.length} owed`
      }
      title="Tasks"
    >
      <div className="flex flex-col gap-6">
        <p
          style={{
            color: 'var(--text-secondary)',
            textWrap: 'pretty',
            maxWidth: 680,
          }}
        >
          {page.derivationNote}
        </p>

        {page.roleLabels.length > 0 && (
          <p className="text-[0.875rem]" style={{ color: 'var(--text-muted)' }}>
            You hold {page.roleLabels.join(' · ')}.
          </p>
        )}

        {page.emptyNote ? (
          <p style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}>
            {page.emptyNote}
          </p>
        ) : (
          <section className="flex flex-col gap-2">
            {page.rows.map((row) => (
              <a
                key={row.id}
                href={row.href}
                style={{
                  display: 'block',
                  textDecoration: 'none',
                  color: 'inherit',
                  background: 'var(--surface-card)',
                  borderTop: '1px solid var(--border-subtle)',
                  borderRight: '1px solid var(--border-subtle)',
                  borderBottom: '1px solid var(--border-subtle)',
                  borderLeft: `3px solid ${URGENCY_ACCENT[row.urgency]}`,
                  borderRadius: 'var(--radius-md)',
                  padding: '14px 16px',
                }}
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-semibold">{row.what}</span>
                  <span
                    className="text-[0.9375rem]"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {row.about}
                  </span>
                  <span
                    className="text-[0.8125rem]"
                    style={{ color: URGENCY_ACCENT[row.urgency] }}
                  >
                    {row.when}
                  </span>
                </div>
                {/* Not "mark done". How it actually clears. */}
                <p
                  className="mt-1 text-[0.8125rem]"
                  style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
                >
                  Clears by: {row.clearedBy}
                </p>
              </a>
            ))}
          </section>
        )}

        {/* Counted, not listed. Somebody else's work on your list makes your
            list less trustworthy, and hiding that it exists is worse. */}
        {page.othersCount > 0 && (
          <p
            className="text-[0.9375rem]"
            style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
          >
            {page.othersCount}{' '}
            {page.othersCount === 1 ? 'journey is' : 'journeys are'} above your
            tier. Somebody is carrying them; you can see that they exist, not
            what they involve.
          </p>
        )}
      </div>
    </AppShell>
  )
}
