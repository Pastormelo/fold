import { AppShell } from '@/components/app-shell'
import { getJourneyTemplates, getJourneys } from '@/data/records'

export const metadata = { title: 'Journeys · Fold' }

const card = {
  background: 'var(--surface-card)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  padding: '16px 18px',
} as const

/** Journeys — running instances and the template library. */
export default async function JourneysPage() {
  const [journeys, templates] = await Promise.all([
    getJourneys(),
    getJourneyTemplates(),
  ])

  const overdue = journeys.filter(
    (j) => j.access === 'visible' && j.isOverdue
  ).length

  return (
    <AppShell
      eyebrow={overdue === 0 ? 'Nothing overdue' : `${overdue} overdue`}
      title="Journeys"
    >
      <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-3">
          <h2 style={{ fontSize: '1.125rem' }}>Running now</h2>
          <p
            className="max-w-[62ch] text-[0.9375rem]"
            style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
          >
            A journey&rsquo;s last step is its stopping rule, so follow-up ends
            visibly rather than by being forgotten. Due dates are computed from
            the current step, never stored.
          </p>

          {journeys.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>
              No journeys running. Starting one is how care gets a shape.
            </p>
          ) : (
            journeys.map((journey) => (
              <article
                key={journey.instanceId}
                style={{
                  ...card,
                  background:
                    journey.access === 'visible'
                      ? 'var(--surface-card)'
                      : 'var(--surface-sunken)',
                  borderLeft: `3px solid ${
                    journey.access === 'visible' && journey.isOverdue
                      ? 'var(--ofc-danger)'
                      : 'var(--border-strong)'
                  }`,
                }}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span style={{ fontWeight: 600 }}>{journey.personName}</span>
                  {journey.access === 'visible' && (
                    <span
                      className="text-[0.9375rem]"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {journey.templateName} · {journey.stepLabel}
                    </span>
                  )}
                  <span
                    className="eyebrow"
                    style={{ fontSize: '0.5625rem', letterSpacing: '0.1em' }}
                  >
                    {journey.tierLabel}
                  </span>
                  {journey.access === 'visible' && journey.isOverdue && (
                    <span
                      className="eyebrow"
                      style={{
                        fontSize: '0.5625rem',
                        color: 'var(--ofc-paper)',
                        background: 'var(--ofc-danger)',
                        borderRadius: 'var(--radius-pill)',
                        padding: '3px 8px',
                      }}
                    >
                      Overdue
                    </span>
                  )}
                </div>

                {journey.access === 'visible' ? (
                  <>
                    <p
                      className="mt-2 text-[0.9375rem]"
                      style={{
                        color: 'var(--text-secondary)',
                        textWrap: 'pretty',
                      }}
                    >
                      {journey.summary}
                    </p>
                    {journey.guidanceNote && (
                      <p
                        className="mt-2 text-[0.875rem] italic"
                        style={{
                          color: 'var(--text-muted)',
                          textWrap: 'pretty',
                        }}
                      >
                        {journey.guidanceNote}
                      </p>
                    )}
                  </>
                ) : (
                  <p
                    className="mt-2 text-[0.9375rem] italic"
                    style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
                  >
                    {journey.disclosure}
                  </p>
                )}
              </article>
            ))
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 style={{ fontSize: '1.125rem' }}>Templates</h2>
          <p
            className="max-w-[62ch] text-[0.9375rem]"
            style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
          >
            The ones that ship with Fold can be edited but not removed — the
            situation a journey covers does not stop happening because the
            journey was deleted.
          </p>
          {templates.map((template) => (
            <article key={template.id} style={card}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span style={{ fontWeight: 600 }}>{template.name}</span>
                <span
                  className="eyebrow"
                  style={{ fontSize: '0.5625rem', letterSpacing: '0.1em' }}
                >
                  {template.tierLabel}
                </span>
                {template.isSystemDefault && (
                  <span
                    className="eyebrow"
                    style={{
                      fontSize: '0.5625rem',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-pill)',
                      padding: '2px 8px',
                    }}
                  >
                    Default
                  </span>
                )}
                <span
                  className="text-[0.8125rem]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {template.stepCountLabel}
                </span>
              </div>
              <p
                className="mt-1 text-[0.875rem]"
                style={{ color: 'var(--text-muted)' }}
              >
                Starts when: {template.trigger}
              </p>
              {template.deleteRefusal && (
                <p
                  className="mt-2 text-[0.875rem] italic"
                  style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
                >
                  {template.deleteRefusal}
                </p>
              )}
            </article>
          ))}
        </section>
      </div>
    </AppShell>
  )
}
